import type { PhaseDelegate, Phase } from "./PhaseDelegate";
import { debugLog } from "../utils/debug-logger";

// ── Constants ───────────────────────────────────────────────────────

const SESSION_EXIT_KEYWORDS = ["退出", "结束", "停止", "退下", "exit", "stop", "quit"];

const FILLER_TOKENS = new Set([
  "嗯", "啊", "呃", "诶", "哦", "唔", "呀", "哎", "哈", "喔",
  "嗯嗯", "啊啊", "哦哦", "嗯哼",
  "um", "uh", "er", "ah", "oh",
]);
const TERMINAL_PUNCT = /[。.,?!？！，、]$/;

export const MAX_CONSECUTIVE_NOISE = 3;

const FALLBACK_APOLOGY = "抱歉，刚才没能整理好结果。你能再说一遍或换种说法吗？";

// ── Pure helpers ────────────────────────────────────────────────────

export function isNoiseLike(text: string): boolean {
  const stripped = text.replace(TERMINAL_PUNCT, "").trim();
  if (stripped.length === 0 || stripped.length > 2) return false;
  return FILLER_TOKENS.has(stripped) || FILLER_TOKENS.has(stripped.toLowerCase());
}

/** Strip tool-call XML / internal markers before showing assistant text in the UI. */
export function cleanForDisplay(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<function=[\s\S]*?<\/function>/g, "")
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
    .trim();
}

// ── PhaseController ─────────────────────────────────────────────────

/**
 * PhaseController — the pure state machine extracted from VoicePipeline.
 *
 * Owns phase transitions, bargeInPending, session lifecycle, noise
 * streak, and exit-keyword detection. All I/O is delegated through
 * PhaseDelegate, making this class fully testable without Obsidian,
 * audio hardware, or network providers.
 */
export class PhaseController {
  private phase: Phase = "idle";
  private sessionAlive = false;
  private sessionMode = false;
  private bargeInPending = false;
  private consecutiveNoise = 0;
  private bargeInPromptText: string;

  // Perf bookkeeping forwarded from delegate.
  private lastAsrDuration = 0;
  private lastLlmDuration = 0;

  constructor(
    private delegate: PhaseDelegate,
    bargeInPromptText?: string,
  ) {
    this.bargeInPromptText = bargeInPromptText ?? "刚刚被打断了，您还有什么需要？";
  }

  // ── Accessors ─────────────────────────────────────────────────────

  getPhase(): Phase { return this.phase; }
  getSessionAlive(): boolean { return this.sessionAlive; }

  // ── Public API ────────────────────────────────────────────────────

  /** Begin a new session or restart listening within a session. */
  async start(sessionMode: boolean): Promise<void> {
    this.sessionMode = sessionMode;
    this.consecutiveNoise = 0;
    this.setSessionAlive(true);
    await this.beginListeningPhase();
  }

  /** Hard cancel — immediate teardown. */
  cancel(): void {
    this.endSession("user-cancel");
  }

  /** [3] Vad1 says the user stopped speaking. */
  onUserSpoke(): void {
    if (this.phase !== "listening") return;
    debugLog("VAD1", "speechEnded → commit ASR");
    this.delegate.commitUtterance();
    this.setPhase("transcribing");
  }

  /** [4] ASR returned text. Core decision hub. */
  async onTranscript(text: string): Promise<void> {
    const trimmed = text.trim();

    // ① Barge-in guard: after a Vad2 barge-in, Vad1 may commit ASR that
    // comes back empty (user noise / ASR timeout). Clear the flag and
    // restart listening so we don't get stuck.
    if (this.bargeInPending && !trimmed) {
      debugLog("BARGE-IN", "empty transcript after barge-in, restarting listen");
      this.bargeInPending = false;
      if (this.sessionMode && this.sessionAlive) {
        await this.beginListeningPhase();
      } else {
        this.endSession("idle-timeout");
      }
      return;
    }
    this.bargeInPending = false;

    // ② Empty transcript — restart or end.
    if (!trimmed) {
      if (this.sessionMode && this.sessionAlive) {
        await this.beginListeningPhase();
      } else {
        this.endSession("idle-timeout");
      }
      return;
    }

    // ③ Noise filter.
    if (isNoiseLike(trimmed)) {
      this.consecutiveNoise += 1;
      debugLog(
        "ASR",
        `noise-like input "${trimmed}" (streak ${this.consecutiveNoise}/${MAX_CONSECUTIVE_NOISE})`
      );
      if (this.consecutiveNoise >= MAX_CONSECUTIVE_NOISE) {
        debugLog("SESSION", `noise streak ${this.consecutiveNoise} — ending session`);
        this.endSession("noise-timeout");
        return;
      }
      if (this.sessionMode && this.sessionAlive) {
        await this.beginListeningPhase();
      } else {
        this.endSession("idle-timeout");
      }
      return;
    }
    // Real transcript — reset the streak.
    this.consecutiveNoise = 0;

    // ④ Emit final transcript + check exit keywords.
    this.delegate.emitFinalTranscript(trimmed);

    if (this.sessionMode && SESSION_EXIT_KEYWORDS.some((kw) => trimmed.includes(kw))) {
      debugLog("EXIT", `exit keyword in "${trimmed}"`);
      this.endSession("exit-keyword");
      return;
    }

    this.lastAsrDuration = this.delegate.endASRPerf();

    // ⑤ Reasoning.
    await this.runReasoning(trimmed);
  }

  /** [X] Vad2 detected the user speaking during thinking/speaking. */
  onBargeIn(): void {
    if (this.phase !== "thinking" && this.phase !== "speaking") return;
    debugLog("VAD2", `barge-in during ${this.phase}`);

    this.delegate.abortCurrentWork();
    this.bargeInPending = true;

    // Jump straight into a new listening phase. Fire-and-forget: the
    // still-resolving runReasoning() / speakReply() of the interrupted
    // turn checks bargeInPending and returns early.
    void this.beginListeningPhase();
  }

  /** Vad1 idle timeout: nobody talked in time. */
  async onVad1IdleTimeout(): Promise<void> {
    if (this.bargeInPending) {
      // False barge-in — Vad2 fired but user said nothing. Ask them.
      debugLog("BARGE-IN", "no follow-up speech → prompting user");
      this.bargeInPending = false;
      this.delegate.disarmListening();
      this.setPhase("speaking");
      this.delegate.armBargeInDetection("watch-speaking");
      this.delegate.emitResponse(this.bargeInPromptText);
      await this.delegate.speak(this.bargeInPromptText);
      if (!this.sessionAlive) return;
      if (this.bargeInPending) return;
      await this.onTurnComplete();
      return;
    }

    // Session Mode idle: user has been silent the whole listening window.
    if (this.sessionMode) {
      debugLog("SESSION", "vad1 idle in listening → ending session");
      this.endSession("idle-timeout");
    } else {
      this.delegate.emitError("Didn't hear anything");
      this.endSession("error");
    }
  }

  // ── Private ───────────────────────────────────────────────────────

  private async beginListeningPhase(): Promise<void> {
    if (!this.sessionAlive) return;

    this.setPhase("listening");
    this.delegate.disarmBargeInDetection();

    try {
      await this.delegate.armListening();
      this.delegate.startASRPerf();
    } catch (err) {
      this.delegate.emitError(err instanceof Error ? err.message : "Failed to start listening");
      this.endSession("error");
    }
  }

  /** [5] Run the agent loop (Vad2 watches for barge-in). */
  private async runReasoning(text: string): Promise<void> {
    this.setPhase("thinking");
    this.delegate.armBargeInDetection("watch");
    this.delegate.startLLMPerf();

    const response = await this.delegate.reason(text);
    this.lastLlmDuration = this.delegate.endLLMPerf();

    if (!this.sessionAlive) return;
    if (this.bargeInPending) return;

    const cleaned = cleanForDisplay(response);
    const usableResponse = cleaned || (response ? FALLBACK_APOLOGY : "");
    if (!usableResponse) {
      debugLog("LLM", "empty response, ending session");
      this.endSession("empty-response");
      return;
    }
    if (cleaned !== usableResponse) {
      debugLog("LLM", `response was unusable XML (${response.length} chars), falling back`);
    }

    this.delegate.emitResponse(usableResponse);
    await this.speakReply(usableResponse);
  }

  /** [6] TTS the response, wait until done. */
  private async speakReply(text: string): Promise<void> {
    this.setPhase("speaking");
    this.delegate.armBargeInDetection("watch-speaking");

    await this.delegate.speak(text);

    if (!this.sessionAlive) return;
    if (this.bargeInPending) return;

    this.delegate.emitPerformanceMetrics(this.lastAsrDuration, this.lastLlmDuration);
    await this.onTurnComplete();
  }

  /** [7] Turn done. Session → back to listening. Otherwise idle + end. */
  private async onTurnComplete(): Promise<void> {
    this.delegate.disarmBargeInDetection();

    if (this.sessionMode && this.sessionAlive) {
      await this.delegate.waitForEchoCooldown();
      await this.beginListeningPhase();
    } else {
      this.setPhase("idle");
      if (this.sessionAlive) this.endSession("turn-complete");
    }
  }

  // ── Session lifecycle ─────────────────────────────────────────────

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    debugLog("PHASE", `${this.phase} → ${phase}`);
    this.phase = phase;
    this.delegate.emitPhaseChange(phase);
  }

  private setSessionAlive(alive: boolean): void {
    if (this.sessionAlive === alive) return;
    this.sessionAlive = alive;
    this.delegate.emitSessionActive(alive);
  }

  private endSession(reason: string): void {
    debugLog("SESSION", `endSession reason=${reason}`);
    this.sessionMode = false;
    this.setPhase("idle");
    this.setSessionAlive(false);
    if (reason !== "error") {
      this.delegate.extractMemory();
    }
    this.delegate.tearDown(reason);
  }
}
