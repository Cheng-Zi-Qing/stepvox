import type { LLMProvider, LLMMessage } from "./types";

interface OpenAILLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export class OpenAILLM implements LLMProvider {
  readonly id = "openai-llm";
  readonly name = "OpenAI Compatible LLM";

  private config: OpenAILLMConfig;
  private baseURL: string;

  constructor(config: OpenAILLMConfig) {
    this.config = config;
    this.baseURL = this.normalizeEndpoint(config.endpoint);
  }

  async chat(messages: LLMMessage[]): Promise<{ content: string }> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("LLM response missing content");
    }

    return { content };
  }

  async validate(): Promise<boolean> {
    try {
      await this.chat([{ role: "user", content: "hi" }]);
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {}

  private normalizeEndpoint(endpoint: string): string {
    let url = endpoint.trim().replace(/\/+$/, "");
    if (!url.endsWith("/v1")) {
      url += "/v1";
    }
    return url;
  }
}
