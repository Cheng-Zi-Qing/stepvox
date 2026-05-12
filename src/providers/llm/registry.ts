// ============================================================
// === HOW TO ADD A NEW LLM PROVIDER ===
//
// 1. Implement the LLMProvider interface (see ../types). If the API speaks
//    OpenAI-compatible JSON, you can probably reuse OpenAIProvider; if the
//    API has its own message/tool shape (Anthropic, Gemini, ...), write a
//    new class beside openai.ts / anthropic.ts.
//
// 2. Create an entry file under `entries/{name}.ts` exporting an
//    `LLMProviderEntry` (see registry-types.ts):
//        id           — short stable identifier, used as the storage key in
//                       settings.llm.providerConfigs
//        name         — human label shown in the settings dropdown
//        configSchema — list the fields the user must fill in (the settings
//                       UI auto-renders this; no UI code edits needed)
//        create       — given the user's config and the global context,
//                       return a fresh LLMProvider instance
//
//    `globalCtx.stepfun` is read-only and shared with ASR/TTS — only touch
//    it if your provider really integrates with StepFun (D58).
//
// 3. Add two lines below: import the entry, then push it into LLM_PROVIDERS.
//
// 4. Add a connectivity test under `scripts/test-llm.ts` (or copy the
//    pattern). Every new provider must prove the round-trip works against
//    a real key before merging.
// ============================================================

import type { LLMProviderEntry } from "./registry-types";

import { stepfunEntry } from "./entries/stepfun";
import { openaiEntry } from "./entries/openai";
import { anthropicEntry } from "./entries/anthropic";
import { customEntry } from "./entries/custom";

export const LLM_PROVIDERS: readonly LLMProviderEntry[] = [
  stepfunEntry,
  openaiEntry,
  anthropicEntry,
  customEntry,
];

export function getLLMProviderEntry(id: string): LLMProviderEntry | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}

export type {
  LLMProviderEntry,
  ConfigField,
  GlobalProviderContext,
} from "./registry-types";
