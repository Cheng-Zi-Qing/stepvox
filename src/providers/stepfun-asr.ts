import type {
  ASRProvider,
  ASRStreamCallbacks,
  ASRStreamSession,
} from "./types";
import { float32ToPCM16, arrayBufferToBase64 } from "./utils";

interface StepFunASRConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  language: string;
  sampleRate: number;
}

export class StepFunASR implements ASRProvider {
  readonly id = "stepfun-asr";
  readonly name = "StepFun ASR";

  private config: StepFunASRConfig;
  private abortController: AbortController | null = null;

  constructor(config: StepFunASRConfig) {
    this.config = config;
  }

  async validate(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async startStreaming(callbacks: ASRStreamCallbacks): Promise<ASRStreamSession> {
    const chunks: ArrayBuffer[] = [];

    return {
      send: (chunk: Float32Array) => {
        const pcm16 = float32ToPCM16(chunk);
        chunks.push(pcm16);
      },
      commit: () => {
        void this.recognize(chunks, callbacks);
      },
      close: () => {
        this.abortController?.abort();
        this.abortController = null;
      },
    };
  }

  private async recognize(
    chunks: ArrayBuffer[],
    callbacks: ASRStreamCallbacks
  ): Promise<void> {
    if (chunks.length === 0) {
      callbacks.onFinal("");
      return;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    const audioBase64 = arrayBufferToBase64(merged.buffer);

    this.abortController = new AbortController();

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          audio: {
            data: audioBase64,
            input: {
              transcription: {
                language: this.config.language,
                model: this.config.model,
                enable_itn: true,
              },
              format: {
                type: "pcm",
                codec: "pcm_s16le",
                rate: this.config.sampleRate,
                bits: 16,
                channel: 1,
              },
            },
          },
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        callbacks.onError(new Error(`ASR request failed: ${response.status} ${text}`));
        return;
      }

      await this.parseSSE(response, callbacks);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async parseSSE(
    response: Response,
    callbacks: ASRStreamCallbacks
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const event = JSON.parse(data);
          if (event.type === "transcript.text.delta" && event.delta) {
            callbacks.onPartial(event.delta);
          } else if (event.type === "transcript.text.done" && event.text) {
            callbacks.onFinal(event.text);
          } else if (event.type === "error") {
            callbacks.onError(new Error(event.message ?? "ASR error"));
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
