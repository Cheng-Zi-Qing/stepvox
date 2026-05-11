/**
 * Vad1 — "user is done speaking" detector.
 *
 * Lives during the listening phase. Watches energy on each audio chunk:
 *   silent → speech started   (energy > threshold)
 *   speech started → silence for SILENCE_MS → emit speechEnded
 *
 * On speechEnded, the pipeline commits the ASR session and stops Vad1.
 *
 * Also exposes an idle timeout: if no speechStarted ever fires within
 * IDLE_TIMEOUT_MS, emit timeout. The pipeline ends the session.
 *
 * This class owns no audio resources; the pipeline feeds it chunks.
 */
export interface Vad1Callbacks {
  onSpeechStarted?: () => void;
  onSpeechEnded?: () => void;
  onIdleTimeout?: () => void;
}

export interface Vad1Config {
  /** Minimum energy to count as speech (e.g. 0.02). */
  speechThreshold: number;
  /** Background must be this much quieter than speech to count as silence. */
  backgroundRatio: number;
  /** How long of continuous silence after speech to fire onSpeechEnded. */
  silenceMs: number;
  /** No speechStarted within this window → onIdleTimeout. */
  idleTimeoutMs: number;
  /** After start(), wait this long before allowing speechStarted to fire.
   *  During warmup we still collect energy samples so backgroundEnergy
   *  can adapt to real room noise, but we refuse to trigger — this prevents
   *  the first few frames (speaker echo, AEC still converging, residual
   *  playback tail) from being misread as user speech. */
  warmupMs: number;
}

export const DEFAULT_VAD1_CONFIG: Vad1Config = {
  speechThreshold: 0.02,
  backgroundRatio: 3.0,
  silenceMs: 1200,
  idleTimeoutMs: 5000,
  warmupMs: 200,
};

export class Vad1 {
  private cfg: Vad1Config;
  private cb: Vad1Callbacks;
  private active = false;

  private energyHistory: number[] = [];
  private static HISTORY_SIZE = 30;
  private backgroundEnergy = 0;
  private speechActive = false;
  private silenceStart = 0;

  private startedAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(cfg: Vad1Config, cb: Vad1Callbacks) {
    this.cfg = cfg;
    this.cb = cb;
  }

  start(): void {
    this.active = true;
    this.energyHistory = [];
    this.backgroundEnergy = 0;
    this.speechActive = false;
    this.silenceStart = 0;
    this.startedAt = Date.now();

    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.active && !this.speechActive) {
        this.cb.onIdleTimeout?.();
      }
    }, this.cfg.idleTimeoutMs);
  }

  stop(): void {
    this.active = false;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  feed(chunk: Float32Array): void {
    if (!this.active) return;

    const energy = this.computeEnergy(chunk);
    this.energyHistory.push(energy);
    if (this.energyHistory.length > Vad1.HISTORY_SIZE) this.energyHistory.shift();

    if (this.energyHistory.length >= 10) {
      const sorted = [...this.energyHistory].sort((a, b) => a - b);
      const lowCount = Math.floor(sorted.length * 0.3);
      this.backgroundEnergy = sorted.slice(0, lowCount).reduce((a, b) => a + b, 0) / lowCount;
    }

    // Warmup: collect samples but refuse to trigger. This lets the mic
    // settle after TTS playback (echo tail, AEC convergence) without the
    // first energy spike being read as user speech.
    if (Date.now() - this.startedAt < this.cfg.warmupMs) return;

    const threshold = Math.max(
      this.cfg.speechThreshold,
      this.backgroundEnergy * this.cfg.backgroundRatio
    );
    const isSpeech = energy > threshold;

    if (isSpeech && !this.speechActive) {
      this.speechActive = true;
      this.silenceStart = 0;
      // We have a real speaker — kill the no-speech idle timer.
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      this.cb.onSpeechStarted?.();
    } else if (!isSpeech && this.speechActive) {
      if (this.silenceStart === 0) {
        this.silenceStart = Date.now();
      } else if (Date.now() - this.silenceStart > this.cfg.silenceMs) {
        this.speechActive = false;
        this.silenceStart = 0;
        this.cb.onSpeechEnded?.();
      }
    } else if (isSpeech && this.speechActive) {
      // Still speaking, reset the silence counter.
      this.silenceStart = 0;
    }
  }

  private computeEnergy(chunk: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    return Math.sqrt(sum / chunk.length);
  }
}
