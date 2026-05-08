import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "../src/agent/orchestrator";
import type { LLMProvider, LLMRequest, LLMResponse, ToolCall } from "../src/providers";
import type { ToolResult } from "../src/agent/tool-executor";

function createFakeProvider(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    id: "fake",
    name: "Fake LLM",
    async chat(_req: LLMRequest): Promise<LLMResponse> {
      return responses[callIndex++] ?? { content: null, toolCalls: [] };
    },
    async validate() { return true; },
    dispose() {},
  };
}

function createFakeExecutor(): {
  executor: { execute: (call: ToolCall) => Promise<ToolResult>; currentFocus: string };
  calls: ToolCall[];
} {
  const calls: ToolCall[] = [];
  return {
    calls,
    executor: {
      currentFocus: "",
      async execute(call: ToolCall): Promise<ToolResult> {
        calls.push(call);
        return { id: call.id, content: `result of ${call.name}`, success: true };
      },
    },
  };
}

describe("AgentOrchestrator", () => {
  it("returns content directly when LLM has no tool_calls", async () => {
    const provider = createFakeProvider([
      { content: "Hello!", toolCalls: [] },
    ]);
    const { executor } = createFakeExecutor();

    const orch = new AgentOrchestrator({
      provider,
      toolExecutor: executor as never,
      systemPromptBuilder: () => "You are a test assistant.",
    });

    const result = await orch.run("hi");
    expect(result).toBe("Hello!");
  });

  it("loops when LLM returns tool_calls, stops when no more", async () => {
    const provider = createFakeProvider([
      { content: null, toolCalls: [{ id: "t1", name: "read_file", args: { path: "note.md" } }] },
      { content: "Done reading.", toolCalls: [] },
    ]);
    const { executor, calls } = createFakeExecutor();

    const orch = new AgentOrchestrator({
      provider,
      toolExecutor: executor as never,
      systemPromptBuilder: () => "test",
    });

    const result = await orch.run("read my note");
    expect(result).toBe("Done reading.");
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("read_file");
  });

  it("respects max loop iterations", async () => {
    const infiniteTools: LLMResponse = {
      content: null,
      toolCalls: [{ id: "t1", name: "search", args: { query: "x" } }],
    };
    const provider = createFakeProvider([
      infiniteTools, infiniteTools, infiniteTools, infiniteTools, infiniteTools,
      { content: "gave up", toolCalls: [] },
    ]);
    const { executor, calls } = createFakeExecutor();

    const orch = new AgentOrchestrator({
      provider,
      toolExecutor: executor as never,
      systemPromptBuilder: () => "test",
    });

    const result = await orch.run("infinite loop");
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(result).toBe("");
  });

  it("abort injects interrupt summary into history", async () => {
    let capturedMessages: LLMRequest["messages"] = [];
    const provider: LLMProvider = {
      id: "fake",
      name: "Fake",
      async chat(req: LLMRequest) {
        capturedMessages = req.messages;
        return { content: "Interrupted response.", toolCalls: [] };
      },
      async validate() { return true; },
      dispose() {},
    };
    const { executor } = createFakeExecutor();

    const orch = new AgentOrchestrator({
      provider,
      toolExecutor: executor as never,
      systemPromptBuilder: () => "test",
    });

    // First run to establish history
    await orch.run("do something");

    // Simulate interrupt
    orch.abort();

    // Next run with new input
    await orch.run("actually do this instead");

    const systemMsgs = capturedMessages.filter((m) => m.role === "system");
    const userMsgs = capturedMessages.filter((m) => m.role === "user");
    expect(userMsgs.some((m) => m.content === "actually do this instead")).toBe(true);
  });
});
