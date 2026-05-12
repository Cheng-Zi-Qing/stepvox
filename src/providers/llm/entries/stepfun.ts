import type { LLMProviderEntry } from "../registry-types";
import { OpenAIProvider } from "../openai";
import { getChatEndpoint } from "../../../utils/endpoint";

/**
 * StepFun LLM (the project's default vendor). Reuses the OpenAI-compatible
 * provider implementation, but reads region/mode/apiKey from the global
 * StepFun config (shared with ASR/TTS, D58) instead of duplicating them
 * in providerConfigs. The user-facing schema is therefore minimal.
 */
export const stepfunEntry: LLMProviderEntry = {
  id: "stepfun",
  name: "StepFun",
  configSchema: [
    {
      key: "stepfunMode",
      label: "StepFun mode",
      type: "select",
      options: [
        { value: "plan", label: "Coding Plan" },
        { value: "api", label: "API" },
      ],
      defaultValue: "plan",
      description: "Pick the StepFun billing/route mode for LLM calls (independent of the global mode).",
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      defaultValue: "step-3.5-flash",
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      defaultValue: 0.3,
    },
  ],
  create(config, globalCtx) {
    const stepfunMode = (config.stepfunMode as "api" | "plan" | undefined) ?? "plan";
    const model = (config.model as string | undefined) ?? "step-3.5-flash";
    const temperature = (config.temperature as number | undefined) ?? 0.3;

    const endpoint = getChatEndpoint(globalCtx.stepfun.region, stepfunMode);
    return new OpenAIProvider(endpoint, globalCtx.stepfun.apiKey, model, temperature);
  },
};
