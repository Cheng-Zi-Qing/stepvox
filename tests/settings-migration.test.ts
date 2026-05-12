// Settings migration roundtrip — confirms the v1 -> v2 mapping in
// migrateSettings() preserves the user's prior LLM choice and keys.

import { describe, it, expect } from "vitest";
import { migrateSettings, SETTINGS_SCHEMA_VERSION } from "../src/settings";

describe("settings migration (D57)", () => {
  it("is a no-op when schemaVersion is already current", () => {
    const v2 = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      llm: {
        activeProvider: "openai",
        providerConfigs: { openai: { apiKey: "sk-x", model: "gpt-4o-mini" } },
      },
    };
    const out = migrateSettings(v2) as any;
    expect(out.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(out.llm.activeProvider).toBe("openai");
    expect(out.llm.providerConfigs.openai.apiKey).toBe("sk-x");
  });

  it("migrates v1 stepfun layout into providerConfigs.stepfun", () => {
    const v1 = {
      llm: { provider: "stepfun", stepfunMode: "api", model: "step-2", temperature: 0.5 },
    };
    const out = migrateSettings(v1) as any;
    expect(out.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(out.llm.activeProvider).toBe("stepfun");
    expect(out.llm.providerConfigs.stepfun.stepfunMode).toBe("api");
    expect(out.llm.providerConfigs.stepfun.model).toBe("step-2");
    expect(out.llm.providerConfigs.stepfun.temperature).toBe(0.5);
  });

  it("migrates v1 openai layout, preserving apiKey + model", () => {
    const v1 = {
      llm: { provider: "openai", apiKey: "sk-abc", model: "gpt-4o", temperature: 0.7 },
    };
    const out = migrateSettings(v1) as any;
    expect(out.llm.activeProvider).toBe("openai");
    expect(out.llm.providerConfigs.openai.apiKey).toBe("sk-abc");
    expect(out.llm.providerConfigs.openai.model).toBe("gpt-4o");
    expect(out.llm.providerConfigs.openai.temperature).toBe(0.7);
  });

  it("migrates v1 anthropic layout", () => {
    const v1 = {
      llm: { provider: "anthropic", apiKey: "sk-ant-y", model: "claude-3-5-sonnet" },
    };
    const out = migrateSettings(v1) as any;
    expect(out.llm.activeProvider).toBe("anthropic");
    expect(out.llm.providerConfigs.anthropic.apiKey).toBe("sk-ant-y");
    expect(out.llm.providerConfigs.anthropic.model).toBe("claude-3-5-sonnet");
  });

  it("migrates v1 custom layout, preserving endpoint", () => {
    const v1 = {
      llm: {
        provider: "custom",
        endpoint: "http://localhost:11434/v1",
        apiKey: "",
        model: "llama3.2",
      },
    };
    const out = migrateSettings(v1) as any;
    expect(out.llm.activeProvider).toBe("custom");
    expect(out.llm.providerConfigs.custom.endpoint).toBe("http://localhost:11434/v1");
    expect(out.llm.providerConfigs.custom.model).toBe("llama3.2");
  });

  it("populates default configs for inactive providers so they're ready when user switches", () => {
    const v1 = { llm: { provider: "openai", apiKey: "sk-x", model: "gpt-4o-mini" } };
    const out = migrateSettings(v1) as any;
    // openai is the active one; the other three should still have skeletons
    expect(out.llm.providerConfigs.stepfun).toBeDefined();
    expect(out.llm.providerConfigs.anthropic).toBeDefined();
    expect(out.llm.providerConfigs.custom).toBeDefined();
  });

  it("handles empty/null input by producing a v2 skeleton", () => {
    const out = migrateSettings({}) as any;
    expect(out.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(out.llm.activeProvider).toBe("stepfun");
    expect(out.llm.providerConfigs.stepfun).toBeDefined();
  });

  it("running migration twice is idempotent", () => {
    const v1 = { llm: { provider: "openai", apiKey: "sk-x", model: "gpt-4o" } };
    const once = migrateSettings(v1);
    const twice = migrateSettings(once);
    expect(twice).toEqual(once);
  });
});
