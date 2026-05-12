import type { LLMProvider } from "../types";

/**
 * A field in a provider's self-describing config schema. Used by the
 * settings UI to auto-render the form (D57) — every provider entry lists
 * the user-facing fields it needs; the form renderer reads this list and
 * produces text/password/select/number/toggle inputs accordingly.
 */
export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "number" | "toggle";
  options?: { value: string; label: string }[]; // select only
  defaultValue?: unknown;
  description?: string;
  placeholder?: string;
}

/**
 * Read-only, whitelisted snapshot of plugin-global configuration that LLM
 * providers may legitimately depend on (D58). Used by stepfun-as-LLM to
 * share the API key with ASR/TTS rather than asking the user to type it
 * twice. Only put things here that genuinely belong to the whole plugin,
 * never one provider's preferences.
 */
export interface GlobalProviderContext {
  stepfun: {
    region: "china" | "global";
    mode: "api" | "plan";
    apiKey: string;
  };
  // Future cross-cutting fields (debug, networkProxy, ...) go here.
}

/**
 * A single LLM provider definition. Each entry lives in its own file
 * (D54, D57) and is registered in providers/llm/registry.ts.
 */
export interface LLMProviderEntry {
  id: string;
  name: string;
  configSchema: ConfigField[];
  create(
    config: Record<string, unknown>,
    globalCtx: GlobalProviderContext
  ): LLMProvider;
}
