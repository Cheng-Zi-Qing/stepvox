import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ToolDefinition,
  ToolCall,
} from "./types";

interface OpenAIConfig {
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

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai-provider";
  readonly name = "OpenAI Compatible Provider";

  private config: OpenAIConfig;
  private chatURL: string;

  constructor(endpoint: string, apiKey: string, model: string, temperature: number) {
    this.config = { endpoint, apiKey, model, temperature };
    this.chatURL = this.buildChatURL(endpoint);
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    // Convert messages to OpenAI format
    const apiMessages = request.messages.map((msg) => {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content,
      };

      // Convert tool_calls from internal format to OpenAI format
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        apiMsg.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        }));
      }

      // Add tool_call_id for tool role messages
      if (msg.tool_call_id) {
        apiMsg.tool_call_id = msg.tool_call_id;
      }

      return apiMsg;
    });

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: apiMessages,
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

    const response = await fetch(this.chatURL, {
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
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      throw new Error("LLM response missing message");
    }

    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map(
      (tc: OpenAIToolCall) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
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

  private buildChatURL(endpoint: string): string {
    const url = endpoint.trim().replace(/\/+$/, "");
    if (/\/chat\/completions?$/.test(url)) {
      return url;
    }
    const base = url.endsWith("/v1") ? url : `${url}/v1`;
    return `${base}/chat/completions`;
  }
}
