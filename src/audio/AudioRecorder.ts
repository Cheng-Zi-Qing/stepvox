import type { AudioRecorderEvents } from "../types";
import { createWorkletBlobURL } from "./pcm-worklet";

type EventName = keyof AudioRecorderEvents;

export class AudioRecorder {
  private sampleRate: number;
  private noiseSuppression: boolean;
  private echoCancellation: boolean;

  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private recording = false;
  private listeners: { [K in EventName]?: Set<AudioRecorderEvents[K]> } = {};

  constructor(opts: {
    sampleRate: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
  }) {
    this.sampleRate = opts.sampleRate;
    this.noiseSuppression = opts.noiseSuppression;
    this.echoCancellation = opts.echoCancellation;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  on<K extends EventName>(event: K, handler: AudioRecorderEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    (this.listeners[event] as Set<AudioRecorderEvents[K]>).add(handler);
  }

  off<K extends EventName>(event: K, handler: AudioRecorderEvents[K]): void {
    (this.listeners[event] as Set<AudioRecorderEvents[K]> | undefined)?.delete(
      handler
    );
  }

  async start(): Promise<void> {
    if (this.recording) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1,
          noiseSuppression: this.noiseSuppression,
          echoCancellation: this.echoCancellation,
        },
      });

      this.context = new AudioContext({ sampleRate: this.sampleRate });
      if (this.context.state === "suspended") {
        await this.context.resume();
      }

      const blobURL = createWorkletBlobURL();
      try {
        await this.context.audioWorklet.addModule(blobURL);
      } finally {
        URL.revokeObjectURL(blobURL);
      }

      this.source = this.context.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.context, "pcm-processor");

      this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        this.emit("data", e.data);
      };

      this.source.connect(this.workletNode);
      this.workletNode.connect(this.context.destination);

      this.recording = true;
      this.emit("start");
    } catch (err) {
      this.cleanup();
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (!this.recording) return;
    this.cleanup();
    this.recording = false;
    this.emit("stop");
  }

  dispose(): void {
    this.stop();
    this.listeners = {};
  }

  private cleanup(): void {
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context && this.context.state !== "closed") {
      void this.context.close();
    }
    this.context = null;
  }

  private emit<K extends EventName>(
    event: K,
    ...args: Parameters<AudioRecorderEvents[K]>
  ): void {
    const handlers = this.listeners[event] as
      | Set<(...a: Parameters<AudioRecorderEvents[K]>) => void>
      | undefined;
    if (handlers) {
      for (const fn of handlers) {
        fn(...args);
      }
    }
  }
}
