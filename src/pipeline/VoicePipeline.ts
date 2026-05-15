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
import { extractSessionMemory } from "../agent/memory-extractor";
import { migrateMemoryIfNeeded } from "../agent/memory-migration";
import { buildSystemPrompt } from "../agent/prompt";
import { getASREndpoint, getTTSEndpoint } from "../utils/endpoint";
import { PerformanceTracker } from "../utils/performance-stats";
import type { PerformanceMetrics } from "../utils/performance-stats";
import { debugLog, initDebugLogger } from "../utils/debug-logger";
import { withTimeout } from "../utils/timeout";
import { PhaseController, cleanForDisplay } from "./PhaseController";
import type { PhaseDelegate, Phase } from "./PhaseDelegate";

// D48: ASR/TTS hard timeouts. LLM/tool timeouts live in orchestrator.
const ASR_CONNECT_TIMEOUT_MS = 5_000;
const ASR_FINAL_TIMEOUT_MS = 5_000;
// Adaptive TTS chunking — three tiers.
// C1 is small for fast first-byte latency (~3.7s synth).
// C2 is medium-sized and fires concurrently with C1; its synth (~8.5s) fits
//   within C1's playback (~12.9s).
// C3+ are large for prosody continuity; each fires serially after the
//   previous synth completes and fits within the previous chunk's playback
//   window (C2 play ≈ 30s covers C3 synth ≈ 26s; C3 play ≈ 86s covers anything).
const TTS_FIRST_CHUNK_CHARS  = 60;
const TTS_SECOND_CHUNK_CHARS = 150;
const TTS_REST_CHUNK_CHARS   = 400;
const TTS_SYNTH_TIMEOUT_MS   = 30_000;

// After a Vad2-driven barge-in, give the user this long to start speaking.
// If Vad1's onIdleTimeout fires (no speech detected) the pipeline treats it
// as a false barge-in and asks the user what they wanted.
const BARGE_IN_GRACE_MS = 3_000;

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

/**
 * Split a long TTS text into three-tiered chunks for adaptive synthesis.
 *
 * - Chunk 1 uses `firstMax` (small, fast first-byte).
 * - Chunk 2 uses `secondMax` (medium, concurrent with C1).
 * - Chunks 3+ use `restMax` (large, fewer cuts = better prosody).
 *
 * Prefers breaks on Chinese + ASCII sentence punctuation so the audio
 * sounds natural at the seams.
 */
export function chunkForTTS(
  text: string,
  firstMax: number,
  secondMax: number,
  restMax: number,
): string[] {
  if (text.length <= firstMax) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let chunkIndex = 0;

  while (remaining.length > 0) {
    const maxChars =
      chunkIndex === 0 ? firstMax :
      chunkIndex === 1 ? secondMax :
      restMax;

    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

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
    chunkIndex++;
  }

  return chunks;
}

/**
 * VoicePipeline — owns all hardware I/O and provider lifecycle.
 *
 * Phase decision logic (state machine, barge-in, noise filter, exit keywords)
 * is delegated to PhaseController via the PhaseDelegate interface. This makes
 * the core state machine testable without Obsidian, audio, or network.
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

  // Per-turn / per-session state (NOT phase-related — those live in controller)
  private currentVaultSnapshot = "";    // captured once at session start, reused across turns
  private asrSession: ASRStreamSession | null = null;
  private asrFinalTimer: ReturnType<typeof setTimeout> | null = null;
  private spokenToolStatus = new Set<string>(); // per-turn de-dup so the user doesn't hear the same status twice

  // TTS pipeline. ttsChain is the "everything has finished playing" promise.
  // Playback is always sequential; synthesis scheduling varies by chunk
  // position (see enqueueTTS for the C1+C2 concurrent / C3+ serial strategy).
  private ttsChain: Promise<void> = Promise.resolve();
  private ttsAborted = false;

  private perfTracker = new PerformanceTracker();

  // Phase controller — pure state machine
  private controller: PhaseController;

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
      onSpeechEnded: () => this.controller.onUserSpoke(),
      onIdleTimeout: () => void this.controller.onVad1IdleTimeout(),
    });

    this.vad2 = new Vad2(DEFAULT_VAD2_CONFIG, {
      onInterrupt: () => this.controller.onBargeIn(),
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

    // Build the delegate that bridges controller → pipeline I/O
    const delegate = this.buildDelegate();
    this.controller = new PhaseController(delegate);
  }

  // ============================================================
  // PUBLIC API — main.ts calls these.
  // ============================================================

  /** Begin a session. sessionMode=true means auto-loop after each turn. */
  async startSession(sessionMode: boolean): Promise<void> {
    debugLog("SESSION", `startSession sessionMode=${sessionMode}`);
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

    await migrateMemoryIfNeeded(this.app, ".obsidian/plugins/stepvox");
    await this.controller.start(sessionMode);
  }

  /** Hard cancel — user wants out NOW. Drops everything, returns to idle. */
  cancel(): void {
    debugLog("SESSION", `cancel`);
    this.orchestrator?.abort();
    this.controller.cancel();
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
  // PhaseDelegate BUILDER — maps each delegate method to pipeline I/O
  // ============================================================

  private buildDelegate(): PhaseDelegate {
    return {
      emitPhaseChange: (phase: Phase) => {
        this.callbacks.onStateChange(phase as PipelineState);
      },
      emitSessionActive: (active: boolean) => {
        this.callbacks.onSessionActiveChange?.(active);
      },
      emitResponse: (text: string) => {
        this.callbacks.onResponse(text);
      },
      emitFinalTranscript: (text: string) => {
        this.callbacks.onFinalTranscript(text);
      },
      emitError: (msg: string) => {
        this.callbacks.onError(msg);
      },

      armListening: async () => {
        await this.armListening();
      },
      commitUtterance: () => {
        this.commitUtterance();
      },
      disarmListening: () => {
        this.disarmListening();
      },

      reason: async (text: string) => {
        return await this.runReasoning(text);
      },
      speak: async (text: string) => {
        await this.speakReply(text);
      },

      abortCurrentWork: () => {
        this.abortCurrentWork();
      },
      armBargeInDetection: (mode: "watch" | "watch-speaking") => {
        this.vad2.setMode(mode);
        this.vad2.rearm();
      },
      disarmBargeInDetection: () => {
        this.vad2.setMode("off");
      },

      tearDown: (reason: string) => {
        this.tearDownAudio();
      },

      extractMemory: () => {
        if (!this.orchestrator || !this.llm) return;
        const history = this.orchestrator.getHistory();
        if (history.length < 2) return;
        void extractSessionMemory(history, this.llm, this.toolExecutor);
      },

      startASRPerf: () => {
        this.perfTracker.startASR();
      },
      endASRPerf: () => {
        return this.perfTracker.endASR();
      },
      startLLMPerf: () => {
        this.perfTracker.startLLM();
      },
      endLLMPerf: () => {
        return this.perfTracker.endLLM();
      },
      emitPerformanceMetrics: (asrDuration: number, llmDuration: number) => {
        const ttsLatency = this.perfTracker.getTTSFirstTokenLatency();
        const metrics = this.perfTracker.getMetrics(asrDuration, llmDuration, ttsLatency);
        this.callbacks.onPerformanceMetrics?.(metrics);
        this.perfTracker.reset();
      },

      waitForEchoCooldown: async () => {
        await new Promise((r) => setTimeout(r, SESSION_ECHO_COOLDOWN_MS));
      },
    };
  }

  // ============================================================
  // DELEGATE IMPLEMENTATIONS — the actual I/O work
  // ============================================================

  /** Open an ASR session, start Vad1, begin recording. */
  private async armListening(): Promise<void> {
    this.ttsAborted = false;
    this.ttsChain = Promise.resolve();

    if (!this.asr) {
      throw new Error("ASR not configured");
    }

    this.vad2.setMode("off"); // user is allowed to talk; that's Vad1's job
    this.vad2.rearm();

    debugLog("ASR", "creating session");
    const session = await withTimeout(
      this.asr.startStreaming({
        onPartial: (text) => this.callbacks.onPartialTranscript(text),
        onFinal: (text) => {
          debugLog("ASR", `final length=${text.length}`);
          this.clearAsrFinalTimer();
          void this.controller.onTranscript(text);
        },
        onError: (err) => {
          this.clearAsrFinalTimer();
          this.callbacks.onError(err.message);
          this.controller.cancel();
        },
      }),
      ASR_CONNECT_TIMEOUT_MS,
      `ASR connect timed out after ${ASR_CONNECT_TIMEOUT_MS / 1000}s`
    );
    this.asrSession = session;
    await this.recorder.start();
    this.vad1.start();
  }

  /** Stop Vad1, commit ASR, arm final timer. */
  private commitUtterance(): void {
    if (!this.asrSession) return;
    this.vad1.stop();
    this.asrSession.commit();
    this.armAsrFinalTimer();
  }

  /** Stop listening hardware. */
  private disarmListening(): void {
    this.vad1.stop();
    this.clearAsrFinalTimer();
    this.asrSession?.close();
    this.asrSession = null;
  }

  /** Run the agent orchestrator loop. Returns the raw response text. */
  private async runReasoning(text: string): Promise<string> {
    if (!this.orchestrator) {
      debugLog("LLM", "no orchestrator configured — aborting reasoning");
      this.callbacks.onError("LLM not configured");
      return "";
    }

    this.spokenToolStatus.clear();

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

    return response;
  }

  /** TTS the response text, wait until the whole chain drains. */
  private async speakReply(text: string): Promise<void> {
    if (!this.tts || !this.settings.tts.enabled || !text.trim()) {
      return;
    }

    this.perfTracker.startTTS();
    this.enqueueTTS(text);
    await this.ttsChain;
  }

  /** Cancel all in-flight work (orchestrator + TTS + player). */
  private abortCurrentWork(): void {
    this.orchestrator?.abort();
    this.ttsAborted = true;
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.clearAsrFinalTimer();
    this.asrSession?.close();
    this.asrSession = null;
    this.vad1.stop();
  }

  // ============================================================
  // INTERNALS
  // ============================================================

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
      void this.controller.onTranscript("");
    }, ASR_FINAL_TIMEOUT_MS);
  }

  private clearAsrFinalTimer(): void {
    if (this.asrFinalTimer) {
      clearTimeout(this.asrFinalTimer);
      this.asrFinalTimer = null;
    }
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

    // Three-tier adaptive chunking: C1(60) + C2(150) + C3+(400).
    // C1 and C2 synthesize concurrently; C3+ fire serially after the
    // previous chunk's synth completes. Each chunk's playback (3x+ synth
    // time) creates a natural window for the next chunk's synthesis.
    const chunks = chunkForTTS(
      cleanText, TTS_FIRST_CHUNK_CHARS, TTS_SECOND_CHUNK_CHARS, TTS_REST_CHUNK_CHARS,
    );
    debugLog("TTS", `enqueue length=${cleanText.length} chunks=${chunks.length}: "${cleanText.slice(0, 60)}"`);

    const synthOne = async (chunk: string): Promise<ArrayBuffer | null> => {
      if (this.ttsAborted) return null;
      try {
        debugLog("TTS", `synth start length=${chunk.length}`);
        const { audioData } = await withTimeout(
          tts.synthesize({ text: chunk }),
          TTS_SYNTH_TIMEOUT_MS,
          `TTS synth timed out after ${TTS_SYNTH_TIMEOUT_MS / 1000}s`
        );
        return audioData;
      } catch (err) {
        debugLog("TTS", `synth error: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    };

    const enqueuePlay = (synthPromise: Promise<ArrayBuffer | null>) => {
      this.ttsChain = this.ttsChain.then(async () => {
        const audioData = await synthPromise;
        if (this.ttsAborted || !audioData) return;
        debugLog("TTS", `play start bytes=${audioData.byteLength}`);
        try {
          await this.player.play(audioData);
          debugLog("TTS", `play end`);
        } catch (err) {
          debugLog("TTS", `play error: ${err instanceof Error ? err.message : err}`);
        }
      });
    };

    if (chunks.length <= 2) {
      // C1 + C2: fire both concurrently, play sequentially.
      for (const chunk of chunks) {
        const p = synthOne(chunk);
        enqueuePlay(p);
      }
    } else {
      // C1 + C2 concurrent, C3+ serial after previous synth completes.
      const p1 = synthOne(chunks[0]);
      const p2 = synthOne(chunks[1]);
      enqueuePlay(p1);
      enqueuePlay(p2);

      // C3+ wait for the previous synth to complete before firing.
      let prevSynth: Promise<ArrayBuffer | null> = p2;
      for (let i = 2; i < chunks.length; i++) {
        const prev = prevSynth;
        const chunk = chunks[i];
        const p: Promise<ArrayBuffer | null> = prev.then(() => synthOne(chunk));
        enqueuePlay(p);
        prevSynth = p;
      }
    }
  }

  private rebuildProvidersIfNeeded(): void {
    if (!this.providerDirty) return;
    this.providerDirty = false;

    this.rebuildAsr();
    this.rebuildTts();
    this.rebuildLlm();
    this.rebuildSearch();

    this.orchestrator?.dispose();
    this.orchestrator = new AgentOrchestrator({
      provider: this.llm!,
      toolExecutor: this.toolExecutor,
      systemPromptBuilder: () => buildSystemPrompt(this.app, this.settings, this.currentVaultSnapshot),
      responseLanguage: this.settings.interaction.responseLanguage,
    });
  }

  private rebuildAsr(): void {
    this.asr?.dispose();
    const s = this.settings;
    this.asr = new StepFunASR({
      endpoint: getASREndpoint(s.stepfun.region, s.stepfun.mode),
      apiKey: s.stepfun.apiKey,
      model: s.asr.model,
      language: s.asr.language,
      sampleRate: s.audio.sampleRate,
    });
  }

  private rebuildTts(): void {
    this.tts?.dispose();
    const s = this.settings;
    this.tts = new StepFunTTS({
      endpoint: getTTSEndpoint(s.stepfun.region, s.stepfun.mode),
      apiKey: s.stepfun.apiKey,
      model: s.tts.model,
      voice: s.tts.voice,
      speed: s.tts.speed,
    });
  }

  private rebuildLlm(): void {
    this.llm?.dispose();
    this.llm = createLLMProvider(this.settings);
  }

  private rebuildSearch(): void {
    const s = this.settings;
    const searchProvider =
      s.search.provider === "tavily" ? new TavilyProvider(s.search.apiKey) :
      s.search.provider === "exa" ? new ExaProvider(s.search.apiKey) :
      null;
    this.toolExecutor.setSearchProvider(searchProvider);
  }
}
