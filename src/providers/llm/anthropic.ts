import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ToolDefinition,
  ToolCall,
} from "../types";

interface AnthropicConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic-provider";
  readonly name = "Anthropic Provider";

  private config: AnthropicConfig;

  constructor(endpoint: string, apiKey: string, model: string, temperature: number) {
    const base = endpoint.trim().replace(/\/+$/, "");
    const normalized = base.endsWith("/v1") ? base : `${base}/v1`;
    this.config = { endpoint: normalized, apiKey, model, temperature };
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const url = `${this.config.endpoint}/messages`;

    // Anthropic requires `system` as a top-level field, not as a role in messages.
    // Extract all system messages and concatenate; convert the remaining messages.
    const systemParts: string[] = [];
    const convoMessages = request.messages.filter((m) => {
      if (m.role === "system") {
        if (m.content) systemParts.push(m.content);
        return false;
      }
      return true;
    });

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: convoMessages,
      temperature: this.config.temperature,
      max_tokens: 4096,
    };

    if (systemParts.length > 0) {
      body.system = systemParts.join("\n\n");
    }

    if (request.tools?.length) {
      body.tools = request.tools.map((t: ToolDefinition) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }

    const data = await response.json();

    const textContent = data.content?.find((c: any) => c.type === "text")?.text ?? null;
    const toolUses = data.content?.filter((c: any) => c.type === "tool_use") ?? [];

    const toolCalls: ToolCall[] = toolUses.map((tu: any) => ({
      id: tu.id,
      name: tu.name,
      args: tu.input,
    }));

    return {
      content: textContent,
      toolCalls,
    };
  }

  dispose(): void {}
}
