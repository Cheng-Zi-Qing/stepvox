export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  encoding: "pcm" | "wav" | "mp3" | "opus";
}

export type PipelineState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "executing"
  | "speaking";

export interface AudioRecorderEvents {
  data: (chunk: Float32Array) => void;
  start: () => void;
  stop: () => void;
  error: (err: Error) => void;
}

export interface AudioPlayerEvents {
  start: () => void;
  end: () => void;
  error: (err: Error) => void;
}

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
