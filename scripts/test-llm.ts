#!/usr/bin/env bun

/**
 * Function test for the configured LLM provider, using the real provider classes.
 *
 * Reads provider/endpoint/key/model from the plugin's data.json
 * (~/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json).
 *
 * Verifies:
 *   1. plain chat returns content
 *   2. tool definition triggers tool_call
 *   3. tool result round-trip yields final content
 *   4. pre-aborted signal cancels request
 *
 * Usage:
 *   bun scripts/test-llm.ts
 */

import { OpenAIProvider } from "../src/providers/llm/openai";
import { AnthropicProvider } from "../src/providers/llm/anthropic";
import type { LLMProvider, ToolDefinition } from "../src/providers/llm/types";
import { loadStepVoxData, type StepVoxData } from "./_lib/load-data";

function buildProvider(data: StepVoxData): { provider: LLMProvider; label: string; endpoint: string } {
  const { llm, stepfun } = data;
  switch (llm.provider) {
    case "stepfun": {
      const domain = stepfun.region === "china" ? "stepfun.com" : "stepfun.ai";
      const prefix = llm.stepfunMode === "plan" ? "step_plan/" : "";
      const endpoint = `https://api.${domain}/${prefix}v1/chat/completions`;
      return {
        provider: new OpenAIProvider(endpoint, stepfun.apiKey || llm.apiKey, llm.model, llm.temperature),
        label: `StepFun (${stepfun.region}, ${llm.stepfunMode})`,
        endpoint,
      };
    }
    case "openai": {
      const endpoint = "https://api.openai.com/v1";
      return {
        provider: new OpenAIProvider(endpoint, llm.apiKey, llm.model, llm.temperature),
        label: "OpenAI",
        endpoint,
      };
    }
    case "anthropic": {
      const endpoint = "https://api.anthropic.com";
      return {
        provider: new AnthropicProvider(endpoint, llm.apiKey, llm.model, llm.temperature),
        label: "Anthropic",
        endpoint,
      };
    }
    case "custom": {
      return {
        provider: new OpenAIProvider(llm.endpoint, llm.apiKey, llm.model, llm.temperature),
        label: `Custom (${llm.endpoint})`,
        endpoint: llm.endpoint,
      };
    }
    default:
      throw new Error(`Unknown LLM provider: ${(llm as any).provider}`);
  }
}

const ECHO_TOOL: ToolDefinition = {
  name: "echo",
  description: "Echo back the input string. Call this tool when the user explicitly asks you to echo something.",
  parameters: {
    type: "object",
    properties: { text: { type: "string", description: "Text to echo back" } },
    required: ["text"],
  },
};

interface CaseResult { name: string; pass: boolean; detail: string; durationMs: number; }

async function runCase(name: string, fn: () => Promise<{ pass: boolean; detail: string }>): Promise<CaseResult> {
  const start = Date.now();
  try {
    const { pass, detail } = await fn();
    return { name, pass, detail, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name, pass: false,
      detail: `Threw: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const { data, path } = loadStepVoxData();
  console.log(`Loaded settings from: ${path}`);

  const { provider, label, endpoint } = buildProvider(data);
  const apiKey = data.llm.provider === "stepfun" ? (data.stepfun.apiKey || data.llm.apiKey) : data.llm.apiKey;

  console.log(`Provider: ${label}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${data.llm.model}`);
  console.log(`API Key: ${apiKey.slice(0, 8)}...`);

  if (!apiKey) {
    console.error("No API key found for the configured provider");
    process.exit(1);
  }

  const results: CaseResult[] = [];

  // Case 1
  results.push(
    await runCase("plain chat returns content", async () => {
      const res = await provider.chat({
        messages: [
          { role: "system", content: "You are a terse assistant. Reply with exactly one short sentence." },
          { role: "user", content: "Say hello in one short sentence." },
        ],
      });
      if (!res.content || res.content.trim().length === 0) {
        return { pass: false, detail: `empty content; toolCalls=${res.toolCalls.length}` };
      }
      return { pass: true, detail: `content="${res.content.slice(0, 80)}"` };
    })
  );

  // Case 2
  let firstToolCall: { id: string; name: string; args: any } | null = null;
  results.push(
    await runCase("tool definitions trigger tool_call", async () => {
      const res = await provider.chat({
        messages: [
          { role: "system", content: "You have an echo tool. When the user asks you to echo something, you MUST call the echo tool." },
          { role: "user", content: 'Please echo the text "hello world" using the echo tool.' },
        ],
        tools: [ECHO_TOOL],
      });
      if (res.toolCalls.length === 0) {
        return { pass: false, detail: `no tool calls; content="${res.content?.slice(0, 80) ?? ""}"` };
      }
      const tc = res.toolCalls[0];
      if (tc.name !== "echo") return { pass: false, detail: `wrong tool: ${tc.name}` };
      firstToolCall = tc;
      return { pass: true, detail: `tool=${tc.name}, args=${JSON.stringify(tc.args).slice(0, 80)}` };
    })
  );

  // Case 3
  if (firstToolCall) {
    results.push(
      await runCase("tool result round-trip yields final content", async () => {
        const echoResult = `Echo: ${firstToolCall!.args?.text ?? "(no text)"}`;
        const res = await provider.chat({
          messages: [
            { role: "system", content: "You have an echo tool. Always reply with one short sentence summarizing the tool result." },
            { role: "user", content: 'Please echo the text "hello world" using the echo tool.' },
            { role: "assistant", content: null, tool_calls: [firstToolCall!] },
            { role: "tool", content: echoResult, tool_call_id: firstToolCall!.id },
          ],
          tools: [ECHO_TOOL],
        });
        if (!res.content || res.content.trim().length === 0) {
          return { pass: false, detail: `no content after tool result; toolCalls=${res.toolCalls.length}` };
        }
        return { pass: true, detail: `final="${res.content.slice(0, 80)}"` };
      })
    );
  } else {
    results.push({ name: "tool result round-trip yields final content", pass: false, detail: "skipped (no tool_call from case 2)", durationMs: 0 });
  }

  // Case 4
  results.push(
    await runCase("abort signal cancels in-flight request", async () => {
      const ac = new AbortController();
      ac.abort();
      try {
        await provider.chat({ messages: [{ role: "user", content: "should not reach" }], signal: ac.signal });
        return { pass: false, detail: "request completed despite pre-aborted signal" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { pass: true, detail: `correctly threw: ${msg.slice(0, 80)}` };
      }
    })
  );

  console.log("\n=== Results ===");
  for (const r of results) {
    const mark = r.pass ? "✓" : "✗";
    console.log(`${mark} ${r.name} (${r.durationMs}ms)`);
    console.log(`  ${r.detail}`);
  }

  const allPassed = results.every((r) => r.pass);
  console.log(`\n${allPassed ? "✓ ALL PASS" : "✗ SOME FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

main();
