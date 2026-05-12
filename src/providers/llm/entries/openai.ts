import type { LLMProviderEntry } from "../registry-types";
import { OpenAIProvider } from "../openai";

const OPENAI_ENDPOINT = "https://api.openai.com/v1";

export const openaiEntry: LLMProviderEntry = {
  id: "openai",
  name: "OpenAI",
  configSchema: [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-..." },
    { key: "model", label: "Model", type: "text", defaultValue: "gpt-4o-mini" },
    { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 },
  ],
  create(config) {
    const apiKey = (config.apiKey as string | undefined) ?? "";
    const model = (config.model as string | undefined) ?? "gpt-4o-mini";
    const temperature = (config.temperature as number | undefined) ?? 0.3;
    return new OpenAIProvider(OPENAI_ENDPOINT, apiKey, model, temperature);
  },
};
