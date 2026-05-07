export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  encoding: "pcm" | "wav" | "mp3" | "opus";
}

export type InteractionMode = "push-to-talk" | "wake-word";

export type PipelineState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "executing"
  | "speaking";

export interface ConversationEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  commands?: string[];
}

export interface LLMResponse {
  thinking?: string;
  commands: string[];
  response: string;
}
