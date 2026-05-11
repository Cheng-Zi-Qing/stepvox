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

export interface ASRStreamCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
}

export interface ASRStreamSession {
  send(chunk: Float32Array): void;
  commit(): void;
  close(): void;
}

export interface ASRProvider {
  readonly id: string;
  readonly name: string;
  startStreaming(callbacks: ASRStreamCallbacks): Promise<ASRStreamSession>;
  dispose(): void;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  synthesize(request: {
    text: string;
    voice?: string;
    speed?: number;
  }): Promise<{ audioData: ArrayBuffer; format: string }>;
  dispose(): void;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
  dispose(): void;
}
