import type { LLMProviderEntry } from "../registry-types";
import { OpenAIProvider } from "../openai";

/**
 * Custom OpenAI-compatible endpoint — the catch-all for ollama, vLLM, LM
 * Studio, and various Chinese OpenAI-compatible services (D60). The user
 * supplies the endpoint URL; api key is optional (many local services
 * don't validate).
 */
export const customEntry: LLMProviderEntry = {
  id: "custom",
  name: "Custom (OpenAI-compatible)",
  configSchema: [
    {
      key: "endpoint",
      label: "Endpoint",
      type: "text",
      placeholder: "http://localhost:11434/v1",
      description: "OpenAI-compatible base URL. Examples: ollama (http://localhost:11434/v1), vLLM, LM Studio.",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      description: "Leave blank for local services that don't validate.",
    },
    { key: "model", label: "Model", type: "text", placeholder: "llama3.2" },
    { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 },
  ],
  create(config) {
    const endpoint = (config.endpoint as string | undefined) ?? "";
    const apiKey = (config.apiKey as string | undefined) ?? "";
    const model = (config.model as string | undefined) ?? "";
    const temperature = (config.temperature as number | undefined) ?? 0.3;
    return new OpenAIProvider(endpoint, apiKey, model, temperature);
  },
};
