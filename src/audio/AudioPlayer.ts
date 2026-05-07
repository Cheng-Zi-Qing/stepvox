import type { AudioPlayerEvents } from "../types";

type EventName = keyof AudioPlayerEvents;

export class AudioPlayer {
  private context: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private playing = false;
  private listeners: { [K in EventName]?: Set<AudioPlayerEvents[K]> } = {};

  get isPlaying(): boolean {
    return this.playing;
  }

  on<K extends EventName>(event: K, handler: AudioPlayerEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as never;
    }
    (this.listeners[event] as Set<AudioPlayerEvents[K]>).add(handler);
  }

  off<K extends EventName>(event: K, handler: AudioPlayerEvents[K]): void {
    (this.listeners[event] as Set<AudioPlayerEvents[K]> | undefined)?.delete(
      handler
    );
  }

  async play(audioData: ArrayBuffer): Promise<void> {
    if (this.playing) {
      this.stop();
    }

    try {
      if (!this.context) {
        this.context = new AudioContext();
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      const audioBuffer = await this.context.decodeAudioData(
        audioData.slice(0)
      );
      this.currentSource = this.context.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.context.destination);

      this.currentSource.onended = () => {
        this.currentSource = null;
        this.playing = false;
        this.emit("end");
      };

      this.currentSource.start();
      this.playing = true;
      this.emit("start");
    } catch (err) {
      if (this.currentSource) {
        this.currentSource.onended = null;
      }
      this.playing = false;
      this.currentSource = null;
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (!this.playing || !this.currentSource) return;
    try {
      this.currentSource.onended = null;
      this.currentSource.stop();
    } catch {
      // already stopped
    }
    this.currentSource = null;
    this.playing = false;
    this.emit("end");
  }

  dispose(): void {
    this.stop();
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
    this.context = null;
    this.listeners = {};
  }

  private emit<K extends EventName>(
    event: K,
    ...args: Parameters<AudioPlayerEvents[K]>
  ): void {
    const handlers = this.listeners[event] as
      | Set<(...a: Parameters<AudioPlayerEvents[K]>) => void>
      | undefined;
    if (handlers) {
      for (const fn of handlers) {
        try {
          fn(...args);
        } catch (e) {
          console.error("[StepVox] AudioPlayer listener error:", e);
        }
      }
    }
  }
}