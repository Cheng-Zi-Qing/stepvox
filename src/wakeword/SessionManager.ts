export interface SessionManagerConfig {
  silenceTimeoutMs: number;
  promptTimeoutMs: number;
}

export class SessionManager {
  private active = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private promptTimer: NodeJS.Timeout | null = null;
  private config: SessionManagerConfig;
  private onTimeout: () => void;
  private onPrompt: () => void;

  constructor(
    config: SessionManagerConfig,
    callbacks: {
      onTimeout: () => void;
      onPrompt: () => void;
    }
  ) {
    this.config = config;
    this.onTimeout = callbacks.onTimeout;
    this.onPrompt = callbacks.onPrompt;
  }

  start(): void {
    this.active = true;
    this.resetSilenceTimer();
  }

  stop(): void {
    this.active = false;
    this.clearTimers();
  }

  resetSilenceTimer(): void {
    this.clearTimers();
    if (!this.active) return;

    this.silenceTimer = setTimeout(() => {
      this.onPrompt();
      this.promptTimer = setTimeout(() => {
        this.onTimeout();
      }, this.config.promptTimeoutMs);
    }, this.config.silenceTimeoutMs);
  }

  isActive(): boolean {
    return this.active;
  }

  private clearTimers(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
  }
}
