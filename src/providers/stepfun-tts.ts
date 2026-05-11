import type { TTSProvider } from "./types";

interface StepFunTTSConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
}

export class StepFunTTS implements TTSProvider {
  readonly id = "stepfun-tts";
  readonly name = "StepFun TTS";

  private config: StepFunTTSConfig;

  constructor(config: StepFunTTSConfig) {
    this.config = config;
  }

  async synthesize(request: {
    text: string;
    voice?: string;
    speed?: number;
  }): Promise<{ audioData: ArrayBuffer; format: string }> {
    if (!request.text.trim()) {
      throw new Error("TTS: empty text");
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        input: request.text,
        voice: request.voice ?? this.config.voice,
        speed: request.speed ?? this.config.speed,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`TTS request failed (${response.status}): ${body}`);
    }

    const audioData = await response.arrayBuffer();
    return { audioData, format: "mp3" };
  }

  dispose(): void {}
}
