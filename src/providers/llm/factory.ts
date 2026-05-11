import type { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { getChatEndpoint } from "../../utils/endpoint";
import type { StepVoxSettings } from "../../settings";

export function createLLMProvider(settings: StepVoxSettings): LLMProvider {
  const { llm, stepfun } = settings;

  switch (llm.provider) {
    case "stepfun": {
      const endpoint = getChatEndpoint(stepfun.region, llm.stepfunMode);
      return new OpenAIProvider(endpoint, stepfun.apiKey, llm.model, llm.temperature);
    }

    case "openai": {
      const endpoint = "https://api.openai.com/v1";
      return new OpenAIProvider(endpoint, llm.apiKey, llm.model, llm.temperature);
    }

    case "anthropic": {
      const endpoint = "https://api.anthropic.com";
      return new AnthropicProvider(endpoint, llm.apiKey, llm.model, llm.temperature);
    }

    case "custom": {
      return new OpenAIProvider(llm.endpoint, llm.apiKey, llm.model, llm.temperature);
    }

    default:
      throw new Error(`Unknown LLM provider: ${llm.provider}`);
  }
}
