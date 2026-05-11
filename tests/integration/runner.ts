import type { App } from "obsidian";
import type { ToolCall } from "../../src/providers/types";
import type { ToolResult } from "../../src/agent/tool-executor";
import { ToolExecutor } from "../../src/agent/tool-executor";
import { AgentOrchestrator } from "../../src/agent/orchestrator";
import { buildSystemPrompt } from "../../src/agent/system-prompt";
import { buildCases } from "./cases";
import type { TestResult } from "./helpers";

const TEST_DIR = "_stepvox_test";

interface RunResult {
  name: string;
  pass: boolean;
  detail: string;
  duration: number;
}

function createSpyExecutor(app: App): {
  executor: ToolExecutor;
  log: ToolCall[];
  reset: () => void;
} {
  const realExecutor = new ToolExecutor(app, ".obsidian/plugins/stepvox/memory");
  const log: ToolCall[] = [];

  const originalExecute = realExecutor.execute.bind(realExecutor);
  realExecutor.execute = async (call: ToolCall): Promise<ToolResult> => {
    log.push(call);
    return originalExecute(call);
  };

  return {
    executor: realExecutor,
    log,
    reset: () => { log.length = 0; },
  };
}

export async function runIntegrationTests(app: App): Promise<RunResult[]> {
  const results: RunResult[] = [];
  const cases = buildCases();

  const plugin = (app as any).plugins.plugins["stepvox"];
  if (!plugin) {
    return [{ name: "SETUP", pass: false, detail: "StepVox plugin not loaded", duration: 0 }];
  }

  const settings = plugin.settings;
  const { executor, log, reset } = createSpyExecutor(app);

  // Ensure test directory exists
  const testFolder = app.vault.getAbstractFileByPath(TEST_DIR);
  if (!testFolder) {
    await app.vault.createFolder(TEST_DIR);
  }

  // Build LLM provider from plugin settings
  const { createLLMProvider } = await import("../../src/providers/llm/factory");
  const llmProvider = createLLMProvider(settings);

  for (const tc of cases) {
    reset();
    const start = Date.now();

    try {
      if (tc.setup) await tc.setup(app);

      const orchestrator = new AgentOrchestrator({
        provider: llmProvider,
        toolExecutor: executor as any,
        systemPromptBuilder: () => buildSystemPrompt(app),
      });

      const result = await orchestrator.run(tc.input);
      const assertion = await tc.assert(result ?? "", app, [...log]);

      results.push({
        name: tc.name,
        pass: assertion.pass,
        detail: assertion.detail,
        duration: Date.now() - start,
      });

      orchestrator.dispose();
    } catch (err) {
      results.push({
        name: tc.name,
        pass: false,
        detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
        duration: Date.now() - start,
      });
    } finally {
      try {
        if (tc.teardown) await tc.teardown(app);
      } catch { /* ignore cleanup errors */ }
    }
  }

  // Final cleanup
  try {
    const folder = app.vault.getAbstractFileByPath(TEST_DIR);
    if (folder) await app.vault.delete(folder, true);
  } catch { /* ignore */ }

  llmProvider.dispose();
  return results;
}

// Entry point when eval'd in Obsidian
export async function runWebSearchTest(app: App): Promise<void> {
  const plugin = (app as any).plugins.plugins["stepvox"];
  if (!plugin) { console.error("[WSTest] StepVox not loaded"); return; }

  const settings = plugin.settings;
  console.log("[WSTest] search.provider:", settings.search?.provider, "| key:", settings.search?.apiKey ? "set" : "EMPTY");

  const { createLLMProvider } = await import("../../src/providers/llm/factory");
  const { TavilyProvider, ExaProvider } = await import("../../src/providers/search");
  const llmProvider = createLLMProvider(settings);

  const realExecutor = new ToolExecutor(app, ".obsidian/plugins/stepvox/memory");
  const searchProvider =
    settings.search?.provider === "tavily" ? new TavilyProvider(settings.search.apiKey) :
    settings.search?.provider === "exa" ? new ExaProvider(settings.search.apiKey) :
    null;
  realExecutor.setSearchProvider(searchProvider);
  console.log("[WSTest] searchProvider:", searchProvider ? searchProvider.constructor.name : "null");

  const toolLog: string[] = [];
  const origExecute = realExecutor.execute.bind(realExecutor);
  (realExecutor as any).execute = async (call: any) => {
    toolLog.push(`execute:${call.name}`);
    console.log(`[WSTest] execute: ${call.name}`, JSON.stringify(call.args).slice(0, 80));
    return origExecute(call);
  };

  const { AgentOrchestrator } = await import("../../src/agent/orchestrator");
  const { buildSystemPrompt } = await import("../../src/agent/system-prompt");

  const orchestrator = new AgentOrchestrator({
    provider: llmProvider,
    toolExecutor: realExecutor as any,
    systemPromptBuilder: () => buildSystemPrompt(app),
  });

  const input = "帮我在网上搜索一下 Obsidian 最新版本号";
  console.log("[WSTest] input:", input);

  const response = await orchestrator.run(input, {
    onPartial: (t) => console.log("[WSTest] partial:", t.slice(0, 60)),
    onToolStart: (names) => console.log("[WSTest] toolStart:", names),
    onToolSlow: (name) => console.log("[WSTest] toolSlow:", name),
  });

  console.log("[WSTest] final response:", response?.slice(0, 100) || "(empty)");
  console.log("[WSTest] tool log:", toolLog.join(", "));

  orchestrator.dispose();
  llmProvider.dispose();
}

(async () => {
  const app = (globalThis as any).app;
  if (!app) {
    console.error("[StepVox Test] No app found");
    return;
  }

  console.log("[StepVox Test] Starting integration tests...");
  const results = await runIntegrationTests(app);

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`[${icon}] ${r.name} (${r.duration}ms) — ${r.detail}`);
    if (r.pass) passed++;
    else failed++;
  }

  console.log(`\n[StepVox Test] Done: ${passed} passed, ${failed} failed`);
  (globalThis as any).__stepvoxTestResults = results;
})();
