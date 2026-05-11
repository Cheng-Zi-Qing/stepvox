export interface PerformanceMetrics {
  asrDuration: number;
  llmDuration: number;
  ttsFirstTokenLatency: number;
  totalDuration: number;
  timestamp: number;
}

export class PerformanceTracker {
  private startTime: number = 0;
  private asrStartTime: number = 0;
  private llmStartTime: number = 0;
  private ttsStartTime: number = 0;

  startASR(): void {
    this.startTime = Date.now();
    this.asrStartTime = Date.now();
  }

  endASR(): number {
    const duration = Date.now() - this.asrStartTime;
    return duration;
  }

  startLLM(): void {
    this.llmStartTime = Date.now();
  }

  endLLM(): number {
    const duration = Date.now() - this.llmStartTime;
    return duration;
  }

  startTTS(): void {
    this.ttsStartTime = Date.now();
  }

  getTTSFirstTokenLatency(): number {
    return Date.now() - this.ttsStartTime;
  }

  getMetrics(asrDuration: number, llmDuration: number, ttsLatency: number): PerformanceMetrics {
    return {
      asrDuration,
      llmDuration,
      ttsFirstTokenLatency: ttsLatency,
      totalDuration: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }

  reset(): void {
    this.startTime = 0;
    this.asrStartTime = 0;
    this.llmStartTime = 0;
    this.ttsStartTime = 0;
  }
}
