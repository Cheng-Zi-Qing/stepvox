/**
 * Vad2 — barge-in detector.
 *
 * Lives during the whole Session Mode lifecycle. Watches energy on every
 * audio chunk. It only fires while the pipeline is in a state where the
 * user shouldn't be talking yet — thinking or speaking. The pipeline tells
 * Vad2 the current state via setActive().
 *
 * When active and energy crosses threshold, emits onInterrupt exactly once.
 * The pipeline must call rearm() once the new listening phase is set up,
 * otherwise Vad2 won't fire again.
 *
 * Threshold is bumped during TTS to avoid the speaker triggering itself.
 */
export interface Vad2Callbacks {
  onInterrupt?: () => void;
}

export interface Vad2Config {
  /** Base threshold for speech (normal rooms). */
  baseThreshold: number;
  /** Multiplier applied to threshold while in speaking state (echo guard). */
  speakingMultiplier: number;
  /** Multiplier applied to threshold while in thinking state. */
  thinkingMultiplier: number;
  /** How many consecutive frames must exceed threshold before firing. Debounces
   *  one-frame spikes from mouse clicks, keyboard, breath noise, etc. */
  consecutiveFramesRequired: number;
}

export const DEFAULT_VAD2_CONFIG: Vad2Config = {
  baseThreshold: 0.02,
  speakingMultiplier: 10.0,
  thinkingMultiplier: 4.0,
  consecutiveFramesRequired: 4,
};

type Mode = "off" | "watch" | "watch-speaking";

export class Vad2 {
  private cfg: Vad2Config;
  private cb: Vad2Callbacks;
  private mode: Mode = "off";
  private armed = true;
  private hotFrames = 0;

  constructor(cfg: Vad2Config, cb: Vad2Callbacks) {
    this.cfg = cfg;
    this.cb = cb;
  }

  /**
   * Set whether Vad2 is monitoring at all, and whether the current state
   * is "speaking" (so threshold should be bumped). The pipeline drives this:
   *   - thinking: watch                 (threshold × thinkingMultiplier)
   *   - speaking: watch-speaking        (threshold × speakingMultiplier)
   *   - everything else: off
   */
  setMode(mode: Mode): void {
    if (this.mode !== mode) this.hotFrames = 0;
    this.mode = mode;
  }

  /** After Vad2 has fired, the pipeline must rearm before it can fire again. */
  rearm(): void {
    this.armed = true;
    this.hotFrames = 0;
  }

  /** Hard stop — leave Vad2 disabled until explicit setMode/rearm. */
  stop(): void {
    this.mode = "off";
    this.armed = true;
    this.hotFrames = 0;
  }

  feed(chunk: Float32Array): void {
    if (this.mode === "off" || !this.armed) return;

    const energy = this.computeEnergy(chunk);
    const multiplier =
      this.mode === "watch-speaking" ? this.cfg.speakingMultiplier :
      this.cfg.thinkingMultiplier;
    const threshold = this.cfg.baseThreshold * multiplier;

    if (energy > threshold) {
      this.hotFrames++;
      if (this.hotFrames >= this.cfg.consecutiveFramesRequired) {
        this.armed = false; // single-shot until rearm()
        this.hotFrames = 0;
        this.cb.onInterrupt?.();
      }
    } else {
      this.hotFrames = 0;
    }
  }

  private computeEnergy(chunk: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    return Math.sqrt(sum / chunk.length);
  }
}
