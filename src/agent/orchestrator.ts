import type { LLMProvider, LLMMessage, ToolCall, ToolDefinition } from "../providers";
import { ToolExecutor, type ToolResult } from "./tool-executor";
import { TOOL_DEFINITIONS } from "./tools";
import { debugLog } from "../utils/debug-logger";

// D48: layered timeouts
const LLM_TIMEOUT_MS = 10_000;
const TOOL_PHASE_TIMEOUT_MS = 12_000;
const WEB_SEARCH_TIMEOUT_MS = 8_000;

// D46: 3-round fan-out → converge → summarize
const MAX_ROUNDS = 3;
const SLOW_TOOL_THRESHOLD_MS = 3_000;
const MAX_HISTORY_MESSAGES = 40;

// When R1 used a bulk-data tool (web_search / search) and R2 returned
// content longer than this, force the R3 summary round instead of
// finalising R2 as-is. Mirrors the "max 80 Chinese chars" spoken-output
// ceiling already enforced in the system prompt.
const LONG_ANSWER_CHAR_LIMIT = 80;

// Pre-generated apology lines for when Round 3 LLM itself fails.
// Random selection keeps the failure path zero-dependency (no extra LLM call).
const APOLOGY_FALLBACKS = [
  "抱歉，我这边出了点小问题，你能再说一遍吗？",
  "不好意思，刚才没处理好，可以再试一次吗？",
  "糟糕，我卡住了。换个说法再试试？",
  "抱歉，这次没搞定，能不能重新说一下？",
  "嗯……好像有点故障，麻烦再讲一次。",
];

function pickApology(): string {
  return APOLOGY_FALLBACKS[Math.floor(Math.random() * APOLOGY_FALLBACKS.length)];
}

export interface OrchestratorCallbacks {
  onPartial?: (text: string) => void;
  onToolStart?: (toolCalls: ToolCall[]) => void;
  onToolSlow?: (toolName: string) => void;
}

export class AgentOrchestrator {
  private provider: LLMProvider;
  private toolExecutor: ToolExecutor;
  private history: LLMMessage[] = [];
  private roundCount = 0;
  private abortController: AbortController | null = null;
  private interrupted = false;
  private systemPromptBuilder: () => string;

  constructor(opts: {
    provider: LLMProvider;
    toolExecutor: ToolExecutor;
    systemPromptBuilder: () => string;
  }) {
    this.provider = opts.provider;
    this.toolExecutor = opts.toolExecutor;
    this.systemPromptBuilder = opts.systemPromptBuilder;
  }

  async run(userInput: string, callbacks?: OrchestratorCallbacks): Promise<string> {
    this.interrupted = false;
    this.roundCount++;
    this.history.push({ role: "user", content: userInput });

    const messages = this.buildMessages();
    const tools = TOOL_DEFINITIONS;

    // ----- Round 1 -----
    const r1 = await this.callLLM(messages, tools);
    if (this.interrupted) return "";
    if (r1.error) {
      return this.finalize(pickApology());
    }
    if (r1.response!.toolCalls.length === 0) {
      // Shortcut: no tools needed → R1 content is final answer
      const final = r1.response!.content ?? pickApology();
      return this.finalize(final);
    }

    // R1 had tool_calls — partial content (if any) is spoken immediately
    if (r1.response!.content) callbacks?.onPartial?.(r1.response!.content);
    messages.push({
      role: "assistant",
      content: r1.response!.content,
      tool_calls: r1.response!.toolCalls,
    });

    const r1Results = await this.runToolPhase(r1.response!.toolCalls, callbacks);
    if (this.interrupted) return "";
    this.pushToolResults(messages, r1Results);

    // Build a signature set of what R1 already asked for. We use this to
    // detect R2 asking the LLM to call the same tool with the same args,
    // which is a common dead-end with step-3.5-flash: the model does not
    // know how to synthesise the R1 result, so it just asks for it again.
    const r1Signatures = new Set<string>(
      r1.response!.toolCalls.map((c) => callSignature(c))
    );

    // ----- Round 2 -----
    const r2 = await this.callLLM(messages, tools);
    if (this.interrupted) return "";
    if (r2.error) {
      return this.finalize(pickApology());
    }

    let duplicateLoopDetected = false;

    if (r2.response!.toolCalls.length === 0) {
      // R2 produced its final answer without further tool calls. Fast path
      // is to return it directly. Exception: if R1 fetched bulk data from
      // an external/unbounded source (web_search, full-text search) AND
      // R2's answer blew past the spoken-output ceiling, the model is
      // reciting the raw payload instead of summarising. Force the R3
      // summary round — it has tools=[] and a hard "max 80 chars"
      // instruction. Costs one extra LLM round only on this specific path.
      const r2Content = r2.response!.content ?? "";
      const usedBulkTool = r1.response!.toolCalls.some(
        (c) => c.name === "web_search" || c.name === "search"
      );
      const overSpokenLimit = r2Content.length > LONG_ANSWER_CHAR_LIMIT;
      if (!(usedBulkTool && overSpokenLimit)) {
        return this.finalize(r2Content || pickApology());
      }
      debugLog(
        "LOOP",
        `R2 over-long answer (${r2Content.length} chars) after bulk tool — forcing R3 summary`
      );
      messages.push({ role: "assistant", content: r2Content });
    } else {
      if (r2.response!.content) callbacks?.onPartial?.(r2.response!.content);
      messages.push({
        role: "assistant",
        content: r2.response!.content,
        tool_calls: r2.response!.toolCalls,
      });

      // Partition R2's tool calls into "new" (actually novel) and "duplicate"
      // (same tool + same args as R1). Duplicates are short-circuited with a
      // reminder — we do NOT re-execute, which would just waste time and
      // pile identical output into the context window.
      const { novelCalls, duplicateCalls } = partitionCalls(r2.response!.toolCalls, r1Signatures);
      if (duplicateCalls.length > 0) {
        duplicateLoopDetected = duplicateCalls.length === r2.response!.toolCalls.length;
        for (const dup of duplicateCalls) {
          debugLog("LOOP", `R2 duplicate tool ${dup.name} ${JSON.stringify(dup.args ?? {})} — short-circuiting`);
          messages.push({
            role: "tool",
            content:
              "This tool has already been called with the same arguments in this turn. The previous result is in the conversation above — use it instead of asking again.",
            tool_call_id: dup.id,
          });
        }
      }

      const r2Results = novelCalls.length > 0
        ? await this.runToolPhase(novelCalls, callbacks)
        : [];
      if (this.interrupted) return "";
      this.pushToolResults(messages, r2Results);
    }

    // ----- Round 3: forced summary, no tools -----
    // Some providers (observed on step-3.5-flash) still emit <tool_call>
    // XML in content even when tools=[]. Prepend a terse instruction
    // hammering home: prose only, use what's already in history, no markup.
    const r3Instruction = duplicateLoopDetected
      ? "This is the final answer turn. You just repeated the same tool call you already made in round 1 — that usually means the user's request was ambiguous or the data you got back wasn't what they wanted. DO NOT output any tool call, XML tag, or JSON. Instead ask the user ONE short clarifying question to figure out what they actually want. Respond in the same language they spoke. Maximum 40 characters."
      : "This is the final answer turn. Do NOT output any tool call, XML tag, JSON, or function-call syntax. Do NOT ask for another tool. Produce a natural spoken summary for the user, using the tool results already in the conversation above. Respond in the same language the user spoke. Maximum 80 Chinese characters or 50 English words, at most three sentences. If you lack the information, say so briefly.";
    messages.push({ role: "system", content: r3Instruction });
    const r3 = await this.callLLM(messages, []);
    if (this.interrupted) return "";
    const final = !r3.error && r3.response!.content ? r3.response!.content : pickApology();
    return this.finalize(final);
  }

  abort(): void {
    this.interrupted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  clearHistory(): void {
    this.history = [];
    this.roundCount = 0;
  }

  getHistory(): readonly LLMMessage[] {
    return this.history;
  }

  dispose(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.history = [];
  }

  // ---------- internals ----------

  private finalize(finalContent: string): string {
    this.history.push({ role: "assistant", content: finalContent });
    this.trimHistory();
    return finalContent;
  }

  private async callLLM(
    messages: LLMMessage[],
    tools: ToolDefinition[]
  ): Promise<{ response?: { content: string | null; toolCalls: ToolCall[] }; error?: unknown }> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, LLM_TIMEOUT_MS);

    try {
      const response = await this.provider.chat({ messages, tools, signal });
      return { response };
    } catch (err) {
      const reason = signal.aborted ? "timeout/aborted" : (err as Error)?.message;
      debugLog("LLM", `call failed: ${reason}`);
      return { error: err };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  /**
   * Execute all toolCalls in parallel (fan-out).
   * - web_search: 8s per-tool timeout
   * - others: no per-tool timeout (local vault ops; 12s phase cap is the safety net)
   * - phase total: 12s — any laggard gets a synthetic timeout result
   * - any failure/timeout is returned verbatim to the LLM (no special handling)
   */
  private async runToolPhase(
    toolCalls: ToolCall[],
    callbacks?: OrchestratorCallbacks
  ): Promise<ToolResult[]> {
    if (toolCalls.length === 0) return [];
    callbacks?.onToolStart?.(toolCalls);

    const slowTimers = new Map<string, ReturnType<typeof setTimeout>>();
    for (const call of toolCalls) {
      const t = setTimeout(() => {
        callbacks?.onToolSlow?.(call.name);
      }, SLOW_TOOL_THRESHOLD_MS);
      slowTimers.set(call.id, t);
    }

    const perCall = toolCalls.map((call) => this.runSingleTool(call, slowTimers));

    const phaseTimeout = new Promise<ToolResult[]>((resolve) => {
      setTimeout(() => {
        const synthetic = toolCalls.map((c) => ({
          id: c.id,
          content: `Error: tool phase exceeded ${TOOL_PHASE_TIMEOUT_MS / 1000}s timeout`,
          success: false,
        }));
        resolve(synthetic);
      }, TOOL_PHASE_TIMEOUT_MS);
    });

    const results = await Promise.race([Promise.all(perCall), phaseTimeout]);

    for (const t of slowTimers.values()) clearTimeout(t);
    return results;
  }

  private async runSingleTool(
    call: ToolCall,
    slowTimers: Map<string, ReturnType<typeof setTimeout>>
  ): Promise<ToolResult> {
    const perToolTimeout = call.name === "web_search" ? WEB_SEARCH_TIMEOUT_MS : 0;

    const execPromise = this.toolExecutor.execute(call).then((r) => {
      const t = slowTimers.get(call.id);
      if (t) {
        clearTimeout(t);
        slowTimers.delete(call.id);
      }
      return r;
    });

    if (perToolTimeout === 0) return execPromise;

    return Promise.race<ToolResult>([
      execPromise,
      new Promise<ToolResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              id: call.id,
              content: `Error: ${call.name} timed out after ${perToolTimeout / 1000}s`,
              success: false,
            }),
          perToolTimeout
        )
      ),
    ]);
  }

  private pushToolResults(messages: LLMMessage[], results: ToolResult[]): void {
    for (const r of results) {
      messages.push({ role: "tool", content: r.content, tool_call_id: r.id });
    }
  }

  private buildMessages(): LLMMessage[] {
    const systemPrompt = this.systemPromptBuilder();
    const dateMatch = systemPrompt.match(/Today's date:\s*([^\n]+)/);
    if (dateMatch) debugLog("PROMPT", `injected date: ${dateMatch[1]}`);

    return [{ role: "system", content: systemPrompt }, ...this.history];
  }

  private trimHistory(): void {
    if (this.history.length > MAX_HISTORY_MESSAGES) {
      const removed = this.history.length - MAX_HISTORY_MESSAGES;
      this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
      debugLog("HISTORY", `trimmed ${removed} old messages, keeping last ${MAX_HISTORY_MESSAGES}`);
    }
  }
}

/** Stable signature for a tool call, used to detect "asked for the same thing again". */
function callSignature(call: ToolCall): string {
  return `${call.name}|${JSON.stringify(call.args ?? {})}`;
}

function partitionCalls(
  calls: ToolCall[],
  alreadyCalled: Set<string>
): { novelCalls: ToolCall[]; duplicateCalls: ToolCall[] } {
  const novelCalls: ToolCall[] = [];
  const duplicateCalls: ToolCall[] = [];
  for (const call of calls) {
    if (alreadyCalled.has(callSignature(call))) duplicateCalls.push(call);
    else novelCalls.push(call);
  }
  return { novelCalls, duplicateCalls };
}
