import type { LLMProviderEntry } from "../registry-types";
import { AnthropicProvider } from "../anthropic";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com";

export const anthropicEntry: LLMProviderEntry = {
  id: "anthropic",
  name: "Anthropic",
  configSchema: [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-ant-..." },
    { key: "model", label: "Model", type: "text", defaultValue: "claude-3-5-sonnet-latest" },
    { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 },
  ],
  create(config) {
    const apiKey = (config.apiKey as string | undefined) ?? "";
    const model = (config.model as string | undefined) ?? "claude-3-5-sonnet-latest";
    const temperature = (config.temperature as number | undefined) ?? 0.3;
    return new AnthropicProvider(ANTHROPIC_ENDPOINT, apiKey, model, temperature);
  },
};
