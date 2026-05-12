import type { PipelineState } from "../types";

export type Phase = PipelineState;

export interface PhaseDelegate {
  emitPhaseChange(phase: Phase): void;
  emitSessionActive(active: boolean): void;
  emitResponse(text: string): void;
  emitFinalTranscript(text: string): void;
  emitError(msg: string): void;

  armListening(): Promise<void>;
  commitUtterance(): void;
  disarmListening(): void;

  reason(text: string): Promise<string>;
  speak(text: string): Promise<void>;

  abortCurrentWork(): void;
  armBargeInDetection(mode: "watch" | "watch-speaking"): void;
  disarmBargeInDetection(): void;

  tearDown(reason: string): void;

  startASRPerf(): void;
  endASRPerf(): number;
  startLLMPerf(): void;
  endLLMPerf(): number;
  emitPerformanceMetrics(asrDuration: number, llmDuration: number): void;

  waitForEchoCooldown(): Promise<void>;
}
