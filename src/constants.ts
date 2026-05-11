export const PLUGIN_ID = "stepvox";
export const VIEW_TYPE_STEPVOX = "stepvox-view";
export const DISPLAY_NAME = "StepVox";

export const DEFAULT_ASR_MODEL = "stepaudio-2.5-asr";
export const DEFAULT_TTS_MODEL = "stepaudio-2.5-tts";
export const DEFAULT_TTS_VOICE = "youyanvsheng";
export const DEFAULT_SAMPLE_RATE = 16000;

export const STEPFUN_VOICES_ENDPOINT =
  "https://api.stepfun.com/v1/audio/system_voices";

export const STATE_LABELS = {
  idle: "Ready",
  listening: "Listening...",
  transcribing: "Transcribing...",
  thinking: "Thinking...",
  speaking: "Speaking...",
} as const;
