export type PipelineState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
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
}
