import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ToolDefinition,
  ToolCall,
} from "./types";

interface OpenAILLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChoice {
  message: {
    content?: string | null;
    tool_calls?: OpenAIToolCall[];
  };
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

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: request.messages,
      temperature: this.config.temperature,
    };

    if (request.tools?.length) {
      body.tools = request.tools.map((t: ToolDefinition) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { choices?: OpenAIChoice[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      throw new Error("LLM response missing message");
    }

    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map(
      (tc: OpenAIToolCall) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })
    );

    return {
      content: msg.content ?? null,
      toolCalls,
    };
  }

  async validate(): Promise<boolean> {
    try {
      await this.chat({
        messages: [{ role: "user", content: "hi" }],
      });
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
