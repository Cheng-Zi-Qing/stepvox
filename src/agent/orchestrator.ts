import type { LLMProvider, LLMMessage, ToolCall } from "../providers";
import { ToolExecutor, type ToolResult } from "./tool-executor";
import { TOOL_DEFINITIONS } from "./tools";

const MAX_LOOP_ITERATIONS = 5;
const MEMORY_HINT_INTERVAL = 10;

export class AgentOrchestrator {
  private provider: LLMProvider;
  private toolExecutor: ToolExecutor;
  private history: LLMMessage[] = [];
  private roundCount = 0;
  private abortController: AbortController | null = null;
  private interrupted = false;
  private pendingResults: ToolResult[] = [];

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

  async run(userInput: string): Promise<string> {
    this.interrupted = false;
    this.roundCount++;

    this.history.push({ role: "user", content: userInput });

    const messages = this.buildMessages();
    let finalContent = "";

    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      if (this.interrupted) break;

      this.abortController = new AbortController();

      const response = await this.provider.chat({
        messages,
        tools: TOOL_DEFINITIONS,
        signal: this.abortController.signal,
      });

      this.abortController = null;

      if (response.content) {
        finalContent = response.content;
      }

      if (response.toolCalls.length === 0) {
        break;
      }

      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls,
      });

      const results = await this.executeTools(response.toolCalls);
      this.pendingResults = results;

      for (const result of results) {
        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: result.id,
        });
      }
    }

    if (finalContent) {
      this.history.push({ role: "assistant", content: finalContent });
    }

    this.pendingResults = [];
    return finalContent;
  }
  abort(): void {
    this.interrupted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    const summary = this.pendingResults
      .filter((r) => r.success)
      .map((r) => r.content)
      .join("; ");

    if (summary) {
      this.history.push({
        role: "system",
        content: `[Interrupted] Actions taken so far: ${summary}. User's new input follows. Report what was done and ask how to proceed.`,
      });
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

  private buildMessages(): LLMMessage[] {
    let systemPrompt = this.systemPromptBuilder();

    if (this.roundCount % MEMORY_HINT_INTERVAL === 0 && this.roundCount > 0) {
      systemPrompt += `\n\n## Memory Hint\nYou have interacted with the user for ${this.roundCount} rounds. If you have discovered user habits, preferences, or information worth remembering long-term, call update_memory to record them.`;
    }

    return [{ role: "system", content: systemPrompt }, ...this.history];
  }

  private async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      if (this.interrupted) break;
      const result = await this.toolExecutor.execute(call);
      results.push(result);
    }
    return results;
  }
}
