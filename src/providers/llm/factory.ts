import type { LLMProvider } from "../types";
import type { StepVoxSettings } from "../../settings";
import { getLLMProviderEntry, LLM_PROVIDERS } from "./registry";
import type { GlobalProviderContext } from "./registry-types";

function buildGlobalCtx(settings: StepVoxSettings): GlobalProviderContext {
  return {
    stepfun: {
      region: settings.stepfun.region,
      mode: settings.stepfun.mode,
      apiKey: settings.stepfun.apiKey,
    },
  };
}

export function createLLMProvider(settings: StepVoxSettings): LLMProvider {
  const activeId = settings.llm.activeProvider;
  const entry = getLLMProviderEntry(activeId);
  if (!entry) {
    const known = LLM_PROVIDERS.map((p) => p.id).join(", ");
    throw new Error(
      `Unknown LLM provider: "${activeId}". Known: ${known}.`
    );
  }
  const config = settings.llm.providerConfigs[activeId] ?? {};
  return entry.create(config, buildGlobalCtx(settings));
}
