import type {
  ASRProvider,
  ASRStreamCallbacks,
  ASRStreamSession,
} from "./types";
import { STEPFUN_ASR_WS_ENDPOINT } from "../constants";
import { float32ToPCM16, arrayBufferToBase64 } from "./utils";

interface StepFunASRConfig {
  apiKey: string;
  model: string;
  language: string;
  sampleRate: number;
}

export class StepFunASR implements ASRProvider {
  readonly id = "stepfun-asr";
  readonly name = "StepFun ASR";

  private config: StepFunASRConfig;
  private activeSession: { ws: WebSocket } | null = null;

  constructor(config: StepFunASRConfig) {
    this.config = config;
  }

  async validate(): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(STEPFUN_ASR_WS_ENDPOINT, [
        "realtime",
        `bearer.${this.config.apiKey}`,
      ]);

      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.type === "session.created") {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          }
        } catch {
          clearTimeout(timeout);
          ws.close();
          resolve(false);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });
  }
  async startStreaming(callbacks: ASRStreamCallbacks): Promise<ASRStreamSession> {
    if (this.activeSession) {
      this.activeSession.ws.close();
      this.activeSession = null;
    }

    const ws = new WebSocket(STEPFUN_ASR_WS_ENDPOINT, [
      "realtime",
      `bearer.${this.config.apiKey}`,
    ]);

    this.activeSession = { ws };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("ASR connection timeout"));
      }, 10000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              input_audio_format: {
                type: "pcm16",
                sample_rate: this.config.sampleRate,
                channels: 1,
              },
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 800,
                threshold: 0.5,
              },
              transcription: {
                model: this.config.model,
                language: this.config.language,
                full_rerun_on_commit: true,
                enable_itn: true,
              },
            },
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          this.handleMessage(msg, callbacks, timeout, resolve);
        } catch (err) {
          callbacks.onError(
            err instanceof Error ? err : new Error(String(err))
          );
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        const err = new Error("ASR WebSocket error");
        callbacks.onError(err);
        reject(err);
      };

      ws.onclose = () => {
        this.activeSession = null;
      };
    });
  }

  private handleMessage(
    msg: { type: string; delta?: string; transcript?: string },
    callbacks: ASRStreamCallbacks,
    timeout: ReturnType<typeof setTimeout>,
    resolve: (session: ASRStreamSession) => void
  ): void {
    switch (msg.type) {
      case "session.created":
      case "session.updated":
        clearTimeout(timeout);
        resolve(this.createSession());
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (msg.delta) callbacks.onPartial(msg.delta);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (msg.transcript) callbacks.onFinal(msg.transcript);
        break;
      case "input_audio_buffer.speech_started":
        callbacks.onVADStart?.();
        break;
      case "input_audio_buffer.speech_stopped":
        callbacks.onVADStop?.();
        break;
      case "error":
        callbacks.onError(new Error(JSON.stringify(msg)));
        break;
    }
  }

  private createSession(): ASRStreamSession {
    const ws = this.activeSession?.ws;
    if (!ws) throw new Error("No active WebSocket");

    return {
      send: (chunk: Float32Array) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm16 = float32ToPCM16(chunk);
        const base64 = arrayBufferToBase64(pcm16);
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64,
          })
        );
      },
      commit: () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      },
      close: () => {
        try {
          ws.close();
        } catch {
          // already closed
        }
        this.activeSession = null;
      },
    };
  }

  dispose(): void {
    if (this.activeSession) {
      try {
        this.activeSession.ws.close();
      } catch {
        // already closed
      }
      this.activeSession = null;
    }
  }
}
