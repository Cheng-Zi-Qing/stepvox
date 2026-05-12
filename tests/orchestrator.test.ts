import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "../src/agent/orchestrator";
import type { LLMProvider, LLMRequest, LLMResponse, ToolCall } from "../src/providers";
import type { ToolResult } from "../src/agent/tool-executor";

/**
 * Scripted provider: returns responses in order; each response may be a value or
 * a promise (so tests can inject delays / rejections per round).
 * The provider honours request.signal — if aborted, throws AbortError immediately.
 */
function scriptedProvider(
  script: Array<LLMResponse | (() => Promise<LLMResponse>)>
): { provider: LLMProvider; calls: LLMRequest[] } {
  const calls: LLMRequest[] = [];
  let idx = 0;
  const provider: LLMProvider = {
    id: "fake",
    name: "Fake LLM",
    async chat(req: LLMRequest): Promise<LLMResponse> {
      calls.push(req);
      const entry = script[idx++];
      if (entry === undefined) return { content: null, toolCalls: [] };
      const result = typeof entry === "function" ? await entry() : entry;
      if (req.signal?.aborted) throw new Error("AbortError");
      return result;
    },
    async validate() { return true; },
    dispose() {},
  };
  return { provider, calls };
}

/**
 * Slow provider that respects abort signal. Used to trigger LLM timeout.
 */
function neverResolvingProvider(): LLMProvider {
  return {
    id: "slow",
    name: "Slow",
    chat(req: LLMRequest): Promise<LLMResponse> {
      return new Promise<LLMResponse>((_, reject) => {
        req.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
      });
    },
    async validate() { return true; },
    dispose() {},
  };
}

function fakeExecutor(
  impl?: (call: ToolCall) => Promise<ToolResult>
): {
  executor: { execute: (call: ToolCall) => Promise<ToolResult>; setSearchProvider?: () => void };
  calls: ToolCall[];
} {
  const calls: ToolCall[] = [];
  return {
    calls,
    executor: {
      async execute(call: ToolCall): Promise<ToolResult> {
        calls.push(call);
        if (impl) return impl(call);
        return { id: call.id, content: `result of ${call.name}`, success: true };
      },
    },
  };
}

function make(provider: LLMProvider, executor: { execute: (c: ToolCall) => Promise<ToolResult> }) {
  return new AgentOrchestrator({
    provider,
    toolExecutor: executor as never,
    systemPromptBuilder: () => "test prompt",
  });
}

describe("AgentOrchestrator — D46 3-round loop", () => {
  it("R1 no tools → returns content directly (skip R2/R3)", async () => {
    const { provider, calls } = scriptedProvider([
      { content: "Hello!", toolCalls: [] },
    ]);
    const { executor, calls: toolCalls } = fakeExecutor();

    const orch = make(provider, executor);
    const result = await orch.run("hi");

    expect(result).toBe("Hello!");
    expect(calls).toHaveLength(1); // only R1
    expect(toolCalls).toHaveLength(0);
  });

  it("R1 parallel fan-out → R2 summarizes → returns R2 content", async () => {
    const { provider, calls: llmCalls } = scriptedProvider([
      {
        content: "好的，我来查",
        toolCalls: [
          { id: "t1", name: "search", args: { query: "A" } },
          { id: "t2", name: "search", args: { query: "B" } },
        ],
      },
      { content: "A 和 B 的结果如下…", toolCalls: [] },
    ]);
    const executionOrder: string[] = [];
    const { executor, calls: toolCalls } = fakeExecutor(async (call) => {
      executionOrder.push(`start:${call.args.query}`);
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(`end:${call.args.query}`);
      return { id: call.id, content: `result:${call.args.query}`, success: true };
    });

    const orch = make(provider, executor);
    const result = await orch.run("搜索 A 和 B");

    expect(result).toBe("A 和 B 的结果如下…");
    expect(llmCalls).toHaveLength(2); // R1 + R2
    expect(toolCalls).toHaveLength(2);
    // Parallel: both start before either ends
    expect(executionOrder.slice(0, 2).sort()).toEqual(["start:A", "start:B"]);
  });

  it("R2 still calls tools (progressive) → R3 forced summary without tools", async () => {
    const { provider, calls: llmCalls } = scriptedProvider([
      { content: "查一下", toolCalls: [{ id: "t1", name: "search", args: { query: "topic" } }] },
      { content: "看看文件", toolCalls: [{ id: "t2", name: "read_file", args: { path: "a.md" } }] },
      { content: "综合结果：…", toolCalls: [] },
    ]);
    const { executor, calls: toolCalls } = fakeExecutor();

    const orch = make(provider, executor);
    const result = await orch.run("搜索后读文件");

    expect(result).toBe("综合结果：…");
    expect(llmCalls).toHaveLength(3);
    // R3 must be invoked with tools=[] (forced summary)
    expect(llmCalls[2].tools).toEqual([]);
    expect(toolCalls.map((c) => c.name)).toEqual(["search", "read_file"]);
  });

  it("tool failure is passed verbatim to LLM (no special handling)", async () => {
    const { provider, calls: llmCalls } = scriptedProvider([
      { content: null, toolCalls: [{ id: "t1", name: "read_file", args: { path: "missing.md" } }] },
      { content: "文件找不到，抱歉", toolCalls: [] },
    ]);
    const { executor } = fakeExecutor(async (call) => ({
      id: call.id,
      content: "Error: File not found: missing.md",
      success: false,
    }));

    const orch = make(provider, executor);
    const result = await orch.run("读 missing.md");

    expect(result).toBe("文件找不到，抱歉");
    // R2 messages should contain the raw error content in a tool message
    const r2Messages = llmCalls[1].messages;
    const toolMsg = r2Messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("Error: File not found");
  });

  it("R3 LLM failure → falls back to a pre-generated apology", async () => {
    // R1 returns tool_calls, R2 also returns tool_calls, R3 rejects.
    const { provider } = scriptedProvider([
      { content: null, toolCalls: [{ id: "t1", name: "search", args: { query: "x" } }] },
      { content: null, toolCalls: [{ id: "t2", name: "search", args: { query: "y" } }] },
      () => Promise.reject(new Error("boom")),
    ]);
    const { executor } = fakeExecutor();

    const orch = make(provider, executor);
    const result = await orch.run("trigger");

    // Deterministic: apology is always non-empty and doesn't look like normal assistant output
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    // Should be one of the pre-written apology lines (contains "抱歉" or similar)
    expect(/抱歉|不好意思|糟糕|卡住|故障/.test(result)).toBe(true);
  });

  it("R1 LLM timeout/failure → returns apology immediately (no further rounds)", async () => {
    const provider = neverResolvingProvider();
    const { executor, calls: toolCalls } = fakeExecutor();

    const orch = make(provider, executor);
    const start = Date.now();
    const result = await orch.run("trigger timeout");
    const elapsed = Date.now() - start;

    expect(/抱歉|不好意思|糟糕|卡住|故障/.test(result)).toBe(true);
    expect(toolCalls).toHaveLength(0); // no tools ran
    // Must resolve within LLM timeout budget + margin (LLM_TIMEOUT_MS=10s)
    expect(elapsed).toBeLessThan(12_000);
  }, 15_000);

  it("abort mid-run returns empty and stops further rounds", async () => {
    const { provider, calls: llmCalls } = scriptedProvider([
      { content: null, toolCalls: [{ id: "t1", name: "search", args: { query: "x" } }] },
      // R2 would be called if orchestration continued
      { content: "should not be reached", toolCalls: [] },
    ]);
    const { executor } = fakeExecutor(async (call) => {
      return { id: call.id, content: "ok", success: true };
    });

    const orch = make(provider, executor);
    // Fire abort immediately after run starts
    const p = orch.run("abort me");
    queueMicrotask(() => orch.abort());
    const result = await p;

    expect(result).toBe("");
    // At most R1 got called; R2 should not have been dispatched
    expect(llmCalls.length).toBeLessThanOrEqual(1);
  });

  // Problem-1 fix: when R1 calls a bulk tool (web_search/search) and R2
  // returns a long final answer instead of summarising, force the R3
  // summary round so the user gets a spoken-friendly reply.
  describe("forced R3 summary after bulk tool + over-long R2", () => {
    const longAnswer = "今年上半年上市的中国大模型公司主要有两家：智谱华章于一月八日在港交所挂牌，被称为全球大模型第一股，源自清华大学技术孵化。另一家是月之暗面，三月在美股完成上市。两家公司都拥有自研模型并在企业市场快速扩张。";

    it("R1 web_search → R2 long answer (no tool calls) → forces R3 summary", async () => {
      const { provider, calls } = scriptedProvider([
        { content: null, toolCalls: [{ id: "t1", name: "web_search", args: { query: "2026 IPO" } }] },
        { content: longAnswer, toolCalls: [] },
        { content: "今年上半年中国共两家大模型公司上市：智谱华章、月之暗面。", toolCalls: [] },
      ]);
      const { executor } = fakeExecutor();

      const orch = make(provider, executor);
      const result = await orch.run("今年上半年上市的中国大模型公司");

      expect(calls.length).toBe(3); // R1, R2, R3 all dispatched
      expect(calls[2].tools).toEqual([]); // R3 forces tools=[]
      expect(result.length).toBeLessThan(longAnswer.length); // shorter than R2
      expect(result).toContain("智谱"); // R3 actually summarised
    });

    it("R1 search (vault) → R2 long answer → also forces R3", async () => {
      const { provider, calls } = scriptedProvider([
        { content: null, toolCalls: [{ id: "t1", name: "search", args: { query: "notes" } }] },
        { content: longAnswer, toolCalls: [] },
        { content: "概要回答。", toolCalls: [] },
      ]);
      const { executor } = fakeExecutor();
      const orch = make(provider, executor);
      const result = await orch.run("查我的笔记");

      expect(calls.length).toBe(3);
      expect(result).toBe("概要回答。");
    });

    it("R1 read_file (non-bulk) → R2 long answer → does NOT force R3 (fast path)", async () => {
      const { provider, calls } = scriptedProvider([
        { content: null, toolCalls: [{ id: "t1", name: "read_file", args: { path: "x" } }] },
        { content: longAnswer, toolCalls: [] },
      ]);
      const { executor } = fakeExecutor();
      const orch = make(provider, executor);
      const result = await orch.run("读一下x");

      expect(calls.length).toBe(2); // R3 NOT dispatched
      expect(result).toBe(longAnswer); // R2 returned as-is
    });

    it("R1 web_search → R2 short answer → does NOT force R3 (under threshold)", async () => {
      const short = "找到两家：智谱、月暗。"; // < 80 chars
      const { provider, calls } = scriptedProvider([
        { content: null, toolCalls: [{ id: "t1", name: "web_search", args: { query: "x" } }] },
        { content: short, toolCalls: [] },
      ]);
      const { executor } = fakeExecutor();
      const orch = make(provider, executor);
      const result = await orch.run("今年上半年");

      expect(calls.length).toBe(2);
      expect(result).toBe(short);
    });
  });
});
