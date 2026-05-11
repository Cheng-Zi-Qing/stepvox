export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LLMRequest {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
  validate(): Promise<boolean>;
  dispose(): void;
}
