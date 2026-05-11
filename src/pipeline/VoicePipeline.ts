import type { App } from "obsidian";
import type { PipelineState } from "../types";
import type { StepVoxSettings } from "../settings";
import { AudioRecorder } from "../audio/AudioRecorder";
import { AudioPlayer } from "../audio/AudioPlayer";
import { Vad1, DEFAULT_VAD1_CONFIG } from "../audio/Vad1";
import { Vad2, DEFAULT_VAD2_CONFIG } from "../audio/Vad2";
import { StepFunASR } from "../providers/stepfun-asr";
import { StepFunTTS } from "../providers/stepfun-tts";
import { createLLMProvider } from "../providers/llm/factory";
import { TavilyProvider, ExaProvider } from "../providers/search";
import type { ASRProvider, TTSProvider, LLMProvider, ASRStreamSession } from "../providers";
import { AgentOrchestrator } from "../agent/orchestrator";
import { ToolExecutor } from "../agent/tool-executor";
import { buildSystemPrompt } from "../agent/system-prompt";
import { getASREndpoint, getTTSEndpoint } from "../utils/endpoint";
import { PerformanceTracker } from "../utils/performance-stats";
import type { PerformanceMetrics } from "../utils/performance-stats";
import { debugLog, initDebugLogger } from "../utils/debug-logger";
import { withTimeout } from "../utils/timeout";

// D48: ASR/TTS hard timeouts. LLM/tool timeouts live in orchestrator.
const ASR_CONNECT_TIMEOUT_MS = 5_000;
const ASR_FINAL_TIMEOUT_MS = 5_000;
const TTS_SYNTH_TIMEOUT_MS = 10_000;
// Upper bound on a single TTS synthesis request. step voice starts to
// 10s-timeout past ~150 chars. Keep chunks comfortably below.
const TTS_MAX_CHUNK_CHARS = 120;

// After a Vad2-driven barge-in, give the user this long to start speaking.
// If Vad1's onIdleTimeout fires (no speech detected) the pipeline treats it
// as a false barge-in and asks the user what they wanted.
const BARGE_IN_GRACE_MS = 3_000;

const SESSION_EXIT_KEYWORDS = ["退出", "结束", "停止", "退下", "exit", "stop", "quit"];

// Fallback phrase when the LLM produces no usable text (e.g. emits a
// tool_call XML payload at R3 instead of a natural-language summary).
const FALLBACK_APOLOGY = "抱歉，刚才没能整理好结果。你能再说一遍或换种说法吗？";

// After a TTS turn ends in Session Mode, give the speaker output and any
// room echo time to die down before re-arming the microphone.
// Vad1 also warms up internally for ~200ms (see Vad1.warmupMs), so this
// cooldown only needs to cover the longest part of the speaker tail.
const SESSION_ECHO_COOLDOWN_MS = 400;

const TOOL_NAME_ZH: Record<string, string> = {
  read_file: "读取文件",
  list_files: "列出文件",
  search: "搜索笔记",
  get_properties: "读取属性",
  create_file: "创建文件",
  append: "追加内容",
  prepend: "插入内容",
  update_content: "更新内容",
  set_property: "设置属性",
  open_file: "打开文件",
  web_search: "网络搜索",
  read_memory: "读取记忆",
  update_memory: "更新记忆",
};

export interface PipelineCallbacks {
  onStateChange: (state: PipelineState) => void;
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onResponse: (text: string) => void;
  /** Ephemeral status (e.g. "正在搜索 X")—UI may show in a status row, not the conversation log. */
  onToolStatus?: (text: string) => void;
  onError: (message: string) => void;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
  /** Fires whenever the runtime session lifecycle changes — UI binds mic colour to this. */
  onSessionActiveChange?: (active: boolean) => void;
}

/** Strip tool-call XML / internal markers before showing assistant text in the UI. */
function cleanForDisplay(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<function=[\s\S]*?<\/function>/g, "")
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
    .trim();
}

/**
 * Split a long TTS text into chunks that stay under the provider's
 * per-request ceiling. Prefers breaks on Chinese + ASCII sentence
 * punctuation so the audio sounds natural at the seams.
 */
function chunkForTTS(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    // Look back for a sensible break: strong punctuation first, then weaker.
    const strongBreak = Math.max(
      window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"),
      window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?"),
      window.lastIndexOf("\n")
    );
    const softBreak = Math.max(
      window.lastIndexOf("，"), window.lastIndexOf("；"), window.lastIndexOf(";"),
      window.lastIndexOf(",")
    );

    // Use strong break if it leaves a reasonable-sized chunk (>25% of max);
    // else soft break; else hard-cut.
    let cutAt = -1;
    if (strongBreak >= maxChars * 0.25) cutAt = strongBreak + 1;
    else if (softBreak >= maxChars * 0.25) cutAt = softBreak + 1;
    else cutAt = maxChars;

    const piece = remaining.slice(0, cutAt).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

/**
 * VoicePipeline — linear, one-step-at-a-time orchestration of a voice turn.
 *
 *   beginListeningPhase()         start ASR + Vad1; user is allowed to talk
 *   onUserSpoke()                 Vad1 says "done" → commit ASR, await transcript
 *   onTranscript(text)            ASR returned text → enter thinking
 *   runReasoning(text)            orchestrator runs (D46 3-round loop)
 *   speakReply(text)              TTS plays response
 *   onTurnComplete()              → if session active, back to beginListeningPhase
 *
 *   onBargeIn()                   Vad2 says "user interrupted" while thinking/speaking
 *                                 → cancel work, jump back into a fresh listening phase
 *                                 → if user doesn't follow up within BARGE_IN_GRACE_MS,
 *                                   speakReply("刚刚被打断了，您还有什么需要？")
 *
 *   endSession(reason)            single sink for any session termination;
 *                                 emits onSessionActiveChange(false) so mic resets
 */
export class VoicePipeline {
  private app: App;
  private settings: StepVoxSettings;
  private callbacks: PipelineCallbacks;

  // Audio I/O
  private recorder: AudioRecorder;
  private player: AudioPlayer;
  private vad1: Vad1;
  private vad2: Vad2;

  // Providers (rebuilt lazily when settings change)
  private asr: ASRProvider | null = null;
  private tts: TTSProvider | null = null;
  private llm: LLMProvider | null = null;
  private orchestrator: AgentOrchestrator | null = null;
  private toolExecutor: ToolExecutor;
  private providerDirty = true;

  // Per-turn / per-session state
  private phase: Phase = "idle";
  private sessionAlive = false;
  private sessionMode = false;          // sticky flag: should we auto-loop after each turn?
  private currentVaultSnapshot = "";    // captured once at session start, reused across turns
  private asrSession: ASRStreamSession | null = null;
  private asrFinalTimer: ReturnType<typeof setTimeout> | null = null;
  private bargeInPending = false;       // set true between onBargeIn() and the next ASR result
  private spokenToolStatus = new Set<string>(); // per-turn de-dup so the user doesn't hear the same status twice
  private bargeInPromptText = "刚刚被打断了，您还有什么需要？";
  private suppressNextEcho = false;     // Vad1 onIdleTimeout in a fresh listen → suppress mic restart

  // TTS chain — segments are awaited end-to-end so speaking state is honest.
  private ttsChain: Promise<void> = Promise.resolve();
  private ttsAborted = false;

  private perfTracker = new PerformanceTracker();
  private lastAsrDuration = 0;
  private lastLlmDuration = 0;

  constructor(app: App, settings: StepVoxSettings, callbacks: PipelineCallbacks) {
    this.app = app;
    this.settings = settings;
    this.callbacks = callbacks;

    initDebugLogger(app);

    this.recorder = new AudioRecorder({
      sampleRate: settings.audio.sampleRate,
      noiseSuppression: settings.audio.noiseSuppression,
      echoCancellation: settings.audio.echoCancellation,
    });

    this.player = new AudioPlayer();
    this.toolExecutor = new ToolExecutor(app, ".obsidian/plugins/stepvox/memory");

    this.vad1 = new Vad1(DEFAULT_VAD1_CONFIG, {
      onSpeechEnded: () => this.onUserSpoke(),
      onIdleTimeout: () => this.onVad1IdleTimeout(),
    });

    this.vad2 = new Vad2(DEFAULT_VAD2_CONFIG, {
      onInterrupt: () => this.onBargeIn(),
    });

    // Recorder fans audio out to ASR + both VADs. Each ignores chunks while
    // it's not active (start()/setMode()/stop() decide).
    this.recorder.on("data", (chunk) => {
      this.asrSession?.send(chunk);
      this.vad1.feed(chunk);
      this.vad2.feed(chunk);
    });

    // Single-step audio: don't auto-flip state on each segment end —
    // speakReply() owns the speaking → listening/idle transition once the
    // full ttsChain drains.
    this.player.on("end", () => {});
  }

  // ============================================================
  // PUBLIC API — main.ts calls these.
  // ============================================================

  /** Begin a session. sessionMode=true means auto-loop after each turn. */
  async startSession(sessionMode: boolean): Promise<void> {
    debugLog("SESSION", `startSession sessionMode=${sessionMode}`);
    this.sessionMode = sessionMode;
    this.setSessionAlive(true);
    this.rebuildProvidersIfNeeded();

    // Capture the vault's two-level folder snapshot ONCE per session, so the
    // LLM can orient itself without wasting a round on list_files. Subsequent
    // turns within the same session reuse this — if structure changes
    // mid-session (create_file / move_file) the tool results inform the LLM
    // directly, no need to re-snapshot.
    this.currentVaultSnapshot = this.toolExecutor.snapshotVaultStructure();
    debugLog("SESSION", `vault snapshot: ${this.currentVaultSnapshot.split("\n").length} lines`);

    if (sessionMode) {
      this.vad2.setMode("off"); // turned on once we enter thinking/speaking
      this.vad2.rearm();
    } else {
      this.vad2.stop();
    }

    await this.beginListeningPhase();
  }

  /** Hard cancel — user wants out NOW. Drops everything, returns to idle. */
  cancel(): void {
    debugLog("SESSION", `cancel from phase=${this.phase}`);
    this.tearDownAudio();
    this.orchestrator?.abort();
    this.endSession("user-cancel");
  }

  onSettingsChanged(settings: StepVoxSettings): void {
    this.settings = settings;
    this.providerDirty = true;
  }

  clearHistory(): void {
    this.orchestrator?.clearHistory();
  }

  dispose(): void {
    this.tearDownAudio();
    this.recorder.dispose();
    this.player.dispose();
    this.asr?.dispose();
    this.tts?.dispose();
    this.llm?.dispose();
    this.orchestrator?.dispose();
  }

  // ============================================================
  // ORCHESTRATION — the linear flow, one function per step.
  // ============================================================

  /** [2] Open an ASR session, start Vad1. Vad2 idles. */
  private async beginListeningPhase(): Promise<void> {
    if (!this.sessionAlive) return;

    // Note: don't clear bargeInPending here. onBargeIn() sets it to true
    // immediately before calling us, and it must survive until either
    // onTranscript() consumes a real transcript or onVad1IdleTimeout() fires
    // the false-barge-in prompt. The still-resolving runReasoning() of the
    // interrupted previous turn also reads this flag to know it shouldn't
    // endSession just because its LLM call got aborted.
    this.ttsAborted = false;
    this.ttsChain = Promise.resolve();

    if (!this.asr) {
      this.callbacks.onError("ASR not configured");
      this.endSession("error");
      return;
    }

    this.setPhase("listening");
    this.vad2.setMode("off"); // user is allowed to talk; that's Vad1's job
    this.vad2.rearm();

    try {
      debugLog("ASR", "creating session");
      const session = await withTimeout(
        this.asr.startStreaming({
          onPartial: (text) => this.callbacks.onPartialTranscript(text),
          onFinal: (text) => {
            debugLog("ASR", `final length=${text.length}`);
            this.clearAsrFinalTimer();
            void this.onTranscript(text);
          },
          onError: (err) => {
            this.clearAsrFinalTimer();
            this.handleAsrError(err.message);
          },
        }),
        ASR_CONNECT_TIMEOUT_MS,
        `ASR connect timed out after ${ASR_CONNECT_TIMEOUT_MS / 1000}s`
      );
      this.asrSession = session;
      await this.recorder.start();
      this.vad1.start();
      this.perfTracker.startASR();
    } catch (err) {
      this.handleAsrError(err instanceof Error ? err.message : "Failed to start listening");
    }
  }

  /** [3] Vad1 says the user is done. Commit the ASR session and wait. */
  private onUserSpoke(): void {
    if (this.phase !== "listening" || !this.asrSession) return;
    debugLog("VAD1", "speechEnded → commit ASR");
    this.vad1.stop();
    this.asrSession.commit();
    this.armAsrFinalTimer();
    this.setPhase("transcribing");
  }

  /** [4] ASR returned. Filter, then enter thinking. */
  private async onTranscript(text: string): Promise<void> {
    const trimmed = text.trim();

    // After a Vad2 barge-in we waited BARGE_IN_GRACE_MS for the user to talk.
    // If they didn't (Vad1.onIdleTimeout fired) we already triggered the
    // "刚刚被打断了" prompt — drop any tardy ASR result here.
    if (this.bargeInPending && !trimmed) {
      debugLog("BARGE-IN", "empty transcript after grace, ignoring");
      return;
    }
    this.bargeInPending = false;

    if (!trimmed) {
      // No speech detected — restart listening (Session Mode) or just idle.
      if (this.sessionMode && this.sessionAlive) {
        await this.beginListeningPhase();
      } else {
        this.endSession("idle-timeout");
      }
      return;
    }

    this.callbacks.onFinalTranscript(trimmed);

    // Explicit exit keywords end the session immediately, no LLM round trip.
    if (this.sessionMode && SESSION_EXIT_KEYWORDS.some((kw) => trimmed.includes(kw))) {
      debugLog("EXIT", `exit keyword in "${trimmed}"`);
      this.endSession("exit-keyword");
      return;
    }

    this.lastAsrDuration = this.perfTracker.endASR();
    await this.runReasoning(trimmed);
  }

  /** [5] Run the agent loop (Vad2 watches for barge-in). */
  private async runReasoning(text: string): Promise<void> {
    if (!this.orchestrator) {
      this.callbacks.onError("LLM not configured");
      this.endSession("error");
      return;
    }

    this.setPhase("thinking");
    this.spokenToolStatus.clear();
    this.vad2.setMode("watch");
    this.vad2.rearm();
    this.perfTracker.startLLM();

    let response: string;
    try {
      response = await this.orchestrator.run(text, {
        onPartial: (partial) => {
          debugLog("LLM", `partial: "${partial.slice(0, 50)}"`);
          const display = cleanForDisplay(partial);
          if (display) this.callbacks.onResponse(display);
          this.enqueueTTS(partial);
        },
        onToolStart: (toolCalls) => {
          debugLog("TOOL", `start: ${toolCalls.map(c => c.name).join(", ")}`);
          for (const call of toolCalls) {
            const toolLabel = TOOL_NAME_ZH[call.name] ?? call.name;
            let msg = `正在${toolLabel}...`;
            if (call.name === "web_search" || call.name === "search") {
              const query = (call.args?.query || call.args?.q) as string | undefined;
              if (query) msg = `正在搜索${query}`;
            }
            // De-duplicate within a single turn — if the LLM asks for the
            // same tool again (e.g. R2 repeats R1's list_files), don't say
            // "正在列出文件..." twice.
            if (this.spokenToolStatus.has(msg)) continue;
            this.spokenToolStatus.add(msg);
            this.callbacks.onToolStatus?.(msg);
            this.enqueueTTS(msg);
          }
        },
        onToolSlow: (toolName) => {
          debugLog("TOOL", `slow: ${toolName}`);
          const label = TOOL_NAME_ZH[toolName] ?? toolName;
          const msg = `正在${label}，请稍候...`;
          if (this.spokenToolStatus.has(msg)) return;
          this.spokenToolStatus.add(msg);
          this.callbacks.onToolStatus?.(msg);
          this.enqueueTTS(msg);
        },
      });
      debugLog("LLM", `response length=${response?.length ?? 0}`);
    } catch (err) {
      debugLog("LLM", `error: ${err instanceof Error ? err.message : err}`);
      response = "";
    }
    this.lastLlmDuration = this.perfTracker.endLLM();

    if (!this.sessionAlive) return; // cancelled mid-thinking
    if (this.bargeInPending) return; // onBargeIn already started a fresh listening phase

    // If the model produced no usable response, surface a graceful fallback
    // instead of silence. Common case: step-3.5-flash returns a tool_call
    // XML payload at R3 even when tools=[]; cleanForDisplay strips it to
    // an empty string. Apology keeps the conversation moving.
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

    this.callbacks.onResponse(usableResponse);
    await this.speakReply(usableResponse);
  }

  /** [6] TTS the response, wait until the whole chain drains. */
  private async speakReply(text: string): Promise<void> {
    if (!this.tts || !this.settings.tts.enabled || !text.trim()) {
      await this.onTurnComplete();
      return;
    }

    this.setPhase("speaking");
    this.vad2.setMode("watch-speaking");
    this.vad2.rearm();
    this.perfTracker.startTTS();

    this.enqueueTTS(text);
    await this.ttsChain;

    if (!this.sessionAlive) return; // cancelled while speaking
    if (this.bargeInPending) return; // onBargeIn already moved us to listening

    const ttsLatency = this.perfTracker.getTTSFirstTokenLatency();
    const metrics = this.perfTracker.getMetrics(
      this.lastAsrDuration,
      this.lastLlmDuration,
      ttsLatency
    );
    this.callbacks.onPerformanceMetrics?.(metrics);

    await this.onTurnComplete();
  }

  /** [7] Turn done. If sessionMode → back to listening. Otherwise idle. */
  private async onTurnComplete(): Promise<void> {
    this.perfTracker.reset();
    this.vad2.setMode("off");

    if (this.sessionMode && this.sessionAlive) {
      // Echo cooldown so VAD doesn't trigger on lingering speaker output.
      await new Promise((r) => setTimeout(r, SESSION_ECHO_COOLDOWN_MS));
      await this.beginListeningPhase();
    } else {
      this.setPhase("idle");
      if (this.sessionAlive) this.endSession("turn-complete");
    }
  }

  /** [X] Vad2 detected the user speaking during thinking/speaking. */
  private onBargeIn(): void {
    if (this.phase !== "thinking" && this.phase !== "speaking") return;
    debugLog("VAD2", `barge-in during ${this.phase}`);

    // Cancel current work.
    this.orchestrator?.abort();
    this.ttsAborted = true;
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.clearAsrFinalTimer();
    this.asrSession?.close();
    this.asrSession = null;
    this.vad1.stop();

    this.bargeInPending = true;

    // Jump straight into a new listening phase; if the user doesn't speak
    // within BARGE_IN_GRACE_MS, Vad1.onIdleTimeout fires and we prompt them.
    // (Vad1's default idleTimeoutMs is 5s; override per-call by reconfiguring
    // would over-complicate. We rely on Vad1 default + bargeInPending flag.)
    void this.beginListeningPhase();
  }

  /** Vad1 idle timeout: nobody talked in time. */
  private async onVad1IdleTimeout(): Promise<void> {
    if (this.bargeInPending) {
      // False barge-in — Vad2 fired but user said nothing. Ask them.
      debugLog("BARGE-IN", "no follow-up speech → prompting user");
      this.bargeInPending = false;
      this.vad1.stop();
      this.clearAsrFinalTimer();
      this.asrSession?.close();
      this.asrSession = null;
      this.setPhase("speaking");
      this.vad2.setMode("watch-speaking");
      this.vad2.rearm();
      this.callbacks.onResponse(this.bargeInPromptText);
      this.enqueueTTS(this.bargeInPromptText);
      await this.ttsChain;
      await this.onTurnComplete();
      return;
    }

    // Session Mode idle: user has been silent the whole listening window.
    if (this.sessionMode) {
      debugLog("SESSION", "vad1 idle in listening → ending session");
      this.endSession("idle-timeout");
    } else {
      this.handleAsrError("Didn't hear anything");
    }
  }

  // ============================================================
  // SESSION LIFECYCLE
  // ============================================================

  private setSessionAlive(alive: boolean): void {
    if (this.sessionAlive === alive) return;
    this.sessionAlive = alive;
    this.callbacks.onSessionActiveChange?.(alive);
  }

  /** Single sink for ending a session. mic resets here. */
  private endSession(reason: string): void {
    debugLog("SESSION", `endSession reason=${reason}`);
    this.sessionMode = false;
    this.tearDownAudio();
    this.setPhase("idle");
    this.setSessionAlive(false);
  }

  private tearDownAudio(): void {
    this.vad1.stop();
    this.vad2.stop();
    this.recorder.stop();
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.ttsAborted = true;
    this.clearAsrFinalTimer();
    this.asrSession?.close();
    this.asrSession = null;
  }

  // ============================================================
  // INTERNALS
  // ============================================================

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    debugLog("PHASE", `${this.phase} → ${phase}`);
    this.phase = phase;
    this.callbacks.onStateChange(phase as PipelineState);
  }

  private armAsrFinalTimer(): void {
    this.clearAsrFinalTimer();
    this.asrFinalTimer = setTimeout(() => {
      this.asrFinalTimer = null;
      debugLog("ASR", `final transcript timed out after ${ASR_FINAL_TIMEOUT_MS / 1000}s — treating as empty`);
      // No transcript means: ASR heard nothing usable. In Session Mode loop
      // back to listening; otherwise idle out cleanly. Don't surface an error
      // — the pipeline already torn down ASR via close()-equivalent below.
      this.asrSession?.close();
      this.asrSession = null;
      void this.onTranscript("");
    }, ASR_FINAL_TIMEOUT_MS);
  }

  private clearAsrFinalTimer(): void {
    if (this.asrFinalTimer) {
      clearTimeout(this.asrFinalTimer);
      this.asrFinalTimer = null;
    }
  }

  private handleAsrError(msg: string): void {
    this.callbacks.onError(msg);
    this.endSession("error");
  }

  private enqueueTTS(text: string): void {
    if (!this.tts || !this.settings.tts.enabled) return;
    const tts = this.tts;

    let cleanedText = text;
    if (text.includes("<tool_call>") || text.includes("<function=") || text.includes("<|tool_call_begin|>")) {
      cleanedText = text
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
        .replace(/<function=[\s\S]*?<\/function>/g, "")
        .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
        .trim();
      if (!cleanedText) return;
    }

    const cleanText = cleanedText
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/^#+\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/^[-*]\s+/gm, "");

    if (!cleanText.trim()) return;

    // TTS providers have a practical length ceiling (step voice ≈ 120 chars
    // before 10s synth timeout). Split the text into short chunks on
    // sentence boundaries so each synth call stays fast; the ttsChain
    // already plays them back-to-back without a gap.
    const chunks = chunkForTTS(cleanText, TTS_MAX_CHUNK_CHARS);
    debugLog("TTS", `enqueue length=${cleanText.length} chunks=${chunks.length}: "${cleanText.slice(0, 60)}"`);

    for (const chunk of chunks) {
      this.ttsChain = this.ttsChain.then(async () => {
        if (this.ttsAborted) return;
        try {
          debugLog("TTS", `synth start length=${chunk.length}`);
          const { audioData } = await withTimeout(
            tts.synthesize({ text: chunk }),
            TTS_SYNTH_TIMEOUT_MS,
            `TTS synth timed out after ${TTS_SYNTH_TIMEOUT_MS / 1000}s`
          );
          if (this.ttsAborted) return;
          debugLog("TTS", `play start bytes=${audioData.byteLength}`);
          await this.player.play(audioData);
          debugLog("TTS", `play end`);
        } catch (err) {
          debugLog("TTS", `error: ${err instanceof Error ? err.message : err}`);
        }
      });
    }
  }

  private rebuildProvidersIfNeeded(): void {
    if (!this.providerDirty) return;
    this.providerDirty = false;

    this.asr?.dispose();
    this.tts?.dispose();
    this.llm?.dispose();

    const s = this.settings;

    this.asr = new StepFunASR({
      endpoint: getASREndpoint(s.stepfun.region, s.stepfun.mode),
      apiKey: s.stepfun.apiKey,
      model: s.asr.model,
      language: s.asr.language,
      sampleRate: s.audio.sampleRate,
    });

    this.tts = new StepFunTTS({
      endpoint: getTTSEndpoint(s.stepfun.region, s.stepfun.mode),
      apiKey: s.stepfun.apiKey,
      model: s.tts.model,
      voice: s.tts.voice,
      speed: s.tts.speed,
    });

    this.llm = createLLMProvider(s);

    const searchProvider =
      s.search.provider === "tavily" ? new TavilyProvider(s.search.apiKey) :
      s.search.provider === "exa" ? new ExaProvider(s.search.apiKey) :
      null;
    this.toolExecutor.setSearchProvider(searchProvider);

    this.orchestrator?.dispose();
    this.orchestrator = new AgentOrchestrator({
      provider: this.llm,
      toolExecutor: this.toolExecutor,
      systemPromptBuilder: () => buildSystemPrompt(this.app, this.currentVaultSnapshot),
    });
  }
}
