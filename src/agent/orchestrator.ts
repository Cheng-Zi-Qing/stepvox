import type { LLMProvider, LLMMessage, ToolCall, ToolDefinition } from "../providers";
import { ToolExecutor, type ToolResult } from "./tool-executor";
import { routeTools } from "./route";
import { debugLog } from "../utils/debug-logger";

// D48: layered timeouts
const LLM_TIMEOUT_MS = 10_000;
const TOOL_PHASE_TIMEOUT_MS = 12_000;
const WEB_SEARCH_TIMEOUT_MS = 8_000;

// D46: 3-round fan-out → converge → summarize
const MAX_ROUNDS = 3;
const SLOW_TOOL_THRESHOLD_MS = 3_000;
const MEMORY_HINT_INTERVAL = 10;
const MAX_HISTORY_MESSAGES = 20;

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
    const tools = routeTools(userInput);

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

    // ----- Round 2 -----
    const r2 = await this.callLLM(messages, tools);
    if (this.interrupted) return "";
    if (r2.error) {
      return this.finalize(pickApology());
    }
    if (r2.response!.toolCalls.length === 0) {
      const final = r2.response!.content ?? pickApology();
      return this.finalize(final);
    }

    if (r2.response!.content) callbacks?.onPartial?.(r2.response!.content);
    messages.push({
      role: "assistant",
      content: r2.response!.content,
      tool_calls: r2.response!.toolCalls,
    });

    const r2Results = await this.runToolPhase(r2.response!.toolCalls, callbacks);
    if (this.interrupted) return "";
    this.pushToolResults(messages, r2Results);

    // ----- Round 3: forced summary, no tools -----
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
    let systemPrompt = this.systemPromptBuilder();

    if (this.roundCount % MEMORY_HINT_INTERVAL === 0 && this.roundCount > 0) {
      systemPrompt += `\n\n## Memory Hint\nYou have interacted with the user for ${this.roundCount} rounds. If you have discovered user habits, preferences, or information worth remembering long-term, call update_memory to record them.`;
    }

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
