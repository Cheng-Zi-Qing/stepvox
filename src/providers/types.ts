export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ASRStreamCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
  onVADStart?: () => void;
  onVADStop?: () => void;
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
  validate(): Promise<boolean>;
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
  getVoices(): Promise<{ id: string; name: string }[]>;
  validate(): Promise<boolean>;
  dispose(): void;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(messages: LLMMessage[]): Promise<{ content: string }>;
  validate(): Promise<boolean>;
  dispose(): void;
}
