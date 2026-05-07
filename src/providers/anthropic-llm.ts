import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  ToolDefinition,
  ToolCall,
} from "./types";

interface AnthropicLLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

export class AnthropicLLM implements LLMProvider {
  readonly id = "anthropic-llm";
  readonly name = "Anthropic LLM";

  private config: AnthropicLLMConfig;
  private baseURL: string;

  constructor(config: AnthropicLLMConfig) {
    this.config = config;
    this.baseURL = config.endpoint.trim().replace(/\/+$/, "");
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = this.extractSystem(request.messages);
    const messages = this.convertMessages(request.messages);

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 4096,
      messages,
      temperature: this.config.temperature,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.tools?.length) {
      body.tools = request.tools.map((t: ToolDefinition) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    return this.parseResponse(data);
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

  private extractSystem(messages: LLMMessage[]): string | null {
    const sys = messages.find((m) => m.role === "system");
    return sys?.content ?? null;
  }

  private convertMessages(
    messages: LLMMessage[]
  ): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];

    for (const msg of messages) {
      if (msg.role === "system") continue;

      if (msg.role === "assistant" && msg.tool_calls?.length) {
        const content: AnthropicContentBlock[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          });
        }
        result.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: msg.content,
            },
          ],
        });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }

  private parseResponse(data: AnthropicResponse): LLMResponse {
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        content = content ? content + block.text : block.text;
      } else if (block.type === "tool_use" && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input ?? {},
        });
      }
    }

    return { content, toolCalls };
  }
}
