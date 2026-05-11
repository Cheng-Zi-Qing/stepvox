import type { App } from "obsidian";
import type { PipelineState } from "../types";
import type { StepVoxSettings } from "../settings";
import { AudioRecorder } from "../audio/AudioRecorder";
import { AudioPlayer } from "../audio/AudioPlayer";
import { StepFunASR } from "../providers/stepfun-asr";
import { StepFunTTS } from "../providers/stepfun-tts";
import { createLLMProvider } from "../providers/llm/factory";
import { TavilyProvider, ExaProvider } from "../providers/search";
import type { ASRProvider, TTSProvider, LLMProvider, ASRStreamSession } from "../providers";

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
import { AgentOrchestrator } from "../agent/orchestrator";
import { ToolExecutor } from "../agent/tool-executor";
import { buildSystemPrompt } from "../agent/system-prompt";
import { getASREndpoint, getTTSEndpoint } from "../utils/endpoint";
import { PerformanceTracker } from "../utils/performance-stats";
import type { PerformanceMetrics } from "../utils/performance-stats";
import { debugLog, initDebugLogger } from "../utils/debug-logger";

export interface PipelineCallbacks {
  onStateChange: (state: PipelineState) => void;
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onResponse: (text: string) => void;
  onError: (message: string) => void;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
  onSessionActiveChange?: (active: boolean) => void;
}

export class VoicePipeline {
  private state: PipelineState = "idle";
  private app: App;
  private settings: StepVoxSettings;
  private callbacks: PipelineCallbacks;

  private recorder: AudioRecorder;
  private player: AudioPlayer;
  private asr: ASRProvider | null = null;
  private tts: TTSProvider | null = null;
  private llm: LLMProvider | null = null;
  private orchestrator: AgentOrchestrator | null = null;
  private toolExecutor: ToolExecutor;

  private asrSession: ASRStreamSession | null = null;
  private providerDirty = true;
  private perfTracker = new PerformanceTracker();
  private ttsChain: Promise<void> = Promise.resolve();
  private ttsAborted = false; // Flag to abort all pending TTS
  private bargeInOccurred = false; // Flag to track if barge-in just happened
  private sessionActive = false; // Runtime flag: is session currently active

  // Session Mode VAD state
  private sessionIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionSpeechStarted = false;
  private readonly SESSION_IDLE_MS = 5000;
  private readonly SESSION_EXIT_KEYWORDS = ["退出", "结束", "停止", "退下", "exit", "stop", "quit"];
  private readonly INTERRUPT_KEYWORDS = ["停", "暂停", "打断", "stop", "pause", "interrupt"];

  // Client-side VAD state
  private vadEnabled = false;
  private vadSpeechActive = false;
  private vadSilenceStart = 0;
  private vadEnergyHistory: number[] = [];
  private vadBackgroundEnergy = 0;
  private readonly VAD_HISTORY_SIZE = 30;
  private readonly VAD_SILENCE_MS = 800;
  private readonly VAD_SPEECH_THRESHOLD = 0.02;
  private readonly VAD_BACKGROUND_RATIO = 3.0;
  private lastActivityTime = 0;
  private readonly ASR_SILENCE_MS = 1200;

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

    this.recorder.on("data", (chunk) => {
      if (this.vadEnabled) {
        this.processVAD(chunk);
      }
      this.asrSession?.send(chunk);
    });

    this.player.on("end", () => {
      if (this.state === "speaking") {
        this.setState("idle");
      }
    });
  }

  async startListening(sessionMode = false): Promise<void> {
    // Set session active flag
    this.sessionActive = sessionMode;
    if (sessionMode) {
      this.callbacks.onSessionActiveChange?.(true);
    }

    // Immediately stop any ongoing playback and cancel pending TTS
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.ttsAborted = false; // Reset abort flag for new session
    this.bargeInOccurred = false; // Reset barge-in flag

    this.recorder.stop();
    this.asrSession?.close();
    this.asrSession = null;
    this.clearSessionTimers();

    if (this.state === "thinking") {
      this.orchestrator?.abort();
    }

    this.rebuildProvidersIfNeeded();

    // Session Mode uses HTTP ASR with client-side VAD
    const asrProvider = this.asr;
    console.log(`[Pipeline] sessionMode=${sessionMode}, using ${asrProvider?.id} with ${sessionMode ? 'client VAD' : 'manual commit'}`);
    if (!asrProvider) {
      this.handleError("ASR not configured");
      return;
    }

    // Enable VAD for Session Mode
    this.vadEnabled = sessionMode;
    if (this.vadEnabled) {
      this.resetVAD();
      this.lastActivityTime = Date.now();
    }

    this.perfTracker.startASR();
    this.setState("listening");

    if (sessionMode) {
      this.sessionSpeechStarted = false;
      // Exit session if no speech detected within idle timeout
      this.sessionIdleTimer = setTimeout(() => {
        this.sessionIdleTimer = null;
        if (this.state === "listening" && !this.sessionSpeechStarted) {
          this.recorder.stop();
          this.asrSession?.close();
          this.asrSession = null;
          this.vadEnabled = false;
          this.setState("idle");
        }
      }, this.SESSION_IDLE_MS);
    }

    try {
      debugLog("ASR", "creating ASR session");
      this.asrSession = await asrProvider.startStreaming({
        onPartial: (text) => this.callbacks.onPartialTranscript(text),
        onFinal: (text) => {
          debugLog("ASR", `onFinal callback triggered, text length: ${text.length}`);
          this.handleTranscript(text, sessionMode);
        },
        onError: (err) => this.handleError(err.message),
      });
      debugLog("ASR", "ASR session created, starting recorder");
      await this.recorder.start();
      debugLog("ASR", "recorder started, now listening");
    } catch (err) {
      this.handleError(
        err instanceof Error ? err.message : "Failed to start listening"
      );
    }
  }

  stopListening(): void {
    debugLog("STOP", `stopping from state: ${this.state}`);
    const wasListening = this.state === "listening";

    // Deactivate session (don't modify user settings)
    if (this.sessionActive) {
      this.sessionActive = false;
      this.callbacks.onSessionActiveChange?.(false);
    }

    // Abort all ongoing operations immediately
    this.ttsAborted = true;
    this.player.stop();
    this.ttsChain = Promise.resolve();

    if (this.state === "thinking") {
      this.orchestrator?.abort();
    }

    // Stop all activities
    this.clearSessionTimers();
    this.vadEnabled = false;
    this.resetVAD();
    this.recorder.stop();

    // Handle ASR session and set final state
    if (wasListening && this.asrSession) {
      // If was listening, commit to get transcription
      this.asrSession.commit();
      this.setState("transcribing");
    } else {
      // Otherwise, immediately go to idle
      this.asrSession?.close();
      this.asrSession = null;
      this.setState("idle");
    }
  }

  onSettingsChanged(settings: StepVoxSettings): void {
    this.settings = settings;
    this.providerDirty = true;
  }

  clearHistory(): void {
    this.orchestrator?.clearHistory();
  }

  dispose(): void {
    this.recorder.dispose();
    this.player.dispose();
    this.asr?.dispose();
    this.tts?.dispose();
    this.llm?.dispose();
    this.orchestrator?.dispose();
    this.clearSessionTimers();
  }

  private clearSessionTimers(): void {
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
      this.sessionIdleTimer = null;
    }
    this.sessionSpeechStarted = false;
  }

  private async handleTranscript(text: string, sessionMode = false): Promise<void> {
    if (!text.trim()) {
      // If barge-in occurred but no valid input, ask user
      if (this.bargeInOccurred && this.sessionActive) {
        this.bargeInOccurred = false;
        debugLog("BARGE-IN", "no input after barge-in, asking user");
        const msg = "刚刚被打断了，请问有什么需要吗？";
        this.callbacks.onResponse(msg);
        this.enqueueTTS(msg);
        await this.ttsChain;
        void this.startListening(true);
        return;
      }
      this.handleError("Didn't hear anything");
      return;
    }

    // Session Mode: filter invalid inputs
    if (this.sessionActive) {
      const invalidInputs = ["嗯", "啊", "呃", "额", "哦", "唔", "um", "uh", "er", "ah"];
      // Remove punctuation for comparison
      const cleanText = text.trim().replace(/[。，！？、.!?,]/g, "");

      // Check if text only contains invalid inputs (including repetitions)
      const isInvalid = invalidInputs.some(word => cleanText === word) ||
        invalidInputs.some(word => {
          // Check if cleanText only contains repetitions of this invalid input
          const regex = new RegExp(`^${word}+$`, 'i');
          return regex.test(cleanText);
        });

      if (isInvalid) {
        debugLog("ASR", `ignored invalid input: "${text}"`);

        // If barge-in occurred, ask user what they need
        if (this.bargeInOccurred) {
          this.bargeInOccurred = false;
          debugLog("BARGE-IN", "invalid input after barge-in, asking user");
          const msg = "刚刚被打断了，请问有什么需要吗？";
          this.callbacks.onResponse(msg);
          this.enqueueTTS(msg);
          await this.ttsChain;
        }

        // Restart listening immediately
        void this.startListening(true);
        return;
      }

      // Check for interrupt keywords (user wants to interrupt TTS)
      if (this.INTERRUPT_KEYWORDS.some(kw => cleanText === kw)) {
        debugLog("INTERRUPT", `interrupt keyword detected: "${text}", restarting listening`);
        void this.startListening(true);
        return;
      }
    }

    // Session Mode: check for exit keywords
    debugLog("EXIT", `checking exit: sessionActive=${this.sessionActive}, text="${text}", keywords=[${this.SESSION_EXIT_KEYWORDS.join(",")}]`);
    if (this.sessionActive && this.SESSION_EXIT_KEYWORDS.some(kw => text.includes(kw))) {
      debugLog("EXIT", `exit keyword detected in: "${text}"`);
      const shouldExit = await this.checkExitIntent(text);
      debugLog("EXIT", `LLM intent check result: ${shouldExit ? "exit" : "continue"}`);
      if (shouldExit) {
        debugLog("EXIT", "confirmed exit intent, closing session");
        this.clearSessionTimers();
        this.sessionActive = false;
        this.callbacks.onSessionActiveChange?.(false);
        this.vadEnabled = false;
        // Stop TTS immediately
        this.player.stop();
        this.ttsChain = Promise.resolve();
        // Stop recorder and close ASR session
        this.recorder.stop();
        this.asrSession?.close();
        this.asrSession = null;
        this.setState("idle");
        return;
      }
      // Continue to normal processing if not confirmed
      debugLog("EXIT", "exit keyword found but intent not confirmed, continuing");
    }

    // Clear barge-in flag for valid input
    this.bargeInOccurred = false;

    const asrDuration = this.perfTracker.endASR();
    debugLog("ASR", `transcript: "${text}"`);
    this.callbacks.onFinalTranscript(text);
    this.setState("thinking");

    this.perfTracker.startLLM();

    try {
      const response = await this.orchestrator!.run(text, {
        onPartial: (partial) => {
          debugLog("LLM", `partial: "${partial.slice(0, 50)}"`);
          this.callbacks.onResponse(partial);
          this.enqueueTTS(partial);
        },
        onToolStart: (toolCalls) => {
          this.updateActivity();
          debugLog("TOOL", `start: ${toolCalls.map(c => c.name).join(", ")}`);

          // Generate specific messages for each tool
          for (const call of toolCalls) {
            const toolLabel = TOOL_NAME_ZH[call.name] ?? call.name;
            let msg = `正在${toolLabel}...`;

            // For search tools, include the query
            if (call.name === "web_search" || call.name === "search") {
              const query = call.args?.query || call.args?.q;
              if (query) {
                msg = `正在搜索${query}`;
              }
            }

            this.callbacks.onResponse(msg);
            this.enqueueTTS(msg);
          }
        },
        onToolSlow: (toolName) => {
          debugLog("TOOL", `slow: ${toolName}`);
          const label = TOOL_NAME_ZH[toolName] ?? toolName;
          const msg = `正在${label}，请稍候...`;
          this.callbacks.onResponse(msg);
          this.enqueueTTS(msg);
        },
      });
      const llmDuration = this.perfTracker.endLLM();

      if (!response) {
        // Even with empty response (e.g. async tool started), keep session alive
        if (this.sessionActive) {
          void this.startListening(true);
        } else {
          this.setState("idle");
        }
        return;
      }

      this.callbacks.onResponse(response);

      if (this.tts && this.settings.tts.enabled) {
        this.setState("speaking");
        this.perfTracker.startTTS();
        this.enqueueTTS(response);
        await this.ttsChain;
        const ttsLatency = this.perfTracker.getTTSFirstTokenLatency();
        const metrics = this.perfTracker.getMetrics(asrDuration, llmDuration, ttsLatency);
        this.callbacks.onPerformanceMetrics?.(metrics);
      } else {
        const metrics = this.perfTracker.getMetrics(asrDuration, llmDuration, 0);
        this.callbacks.onPerformanceMetrics?.(metrics);
        this.setState("idle");
      }

      if (this.sessionActive) {
        // Wait for all TTS to finish to avoid echo in auto-restart
        await this.ttsChain;
        // Additional delay to let acoustic echo dissipate
        await new Promise(resolve => setTimeout(resolve, 500));
        void this.startListening(true);
      }

      this.perfTracker.reset();
    } catch (err) {
      this.handleError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  }

  private enqueueTTS(text: string): void {
    if (!this.tts || !this.settings.tts.enabled) return;
    this.updateActivity();
    const tts = this.tts;

    // Remove tool call XML but keep other text
    let cleanedText = text;
    if (text.includes("<tool_call>") || text.includes("<function=")) {
      // Remove tool call XML blocks
      cleanedText = text
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
        .replace(/<function=[\s\S]*?<\/function>/g, "")
        .trim();

      if (!cleanedText) {
        debugLog("TTS", "skip pure tool call XML");
        return;
      }
      debugLog("TTS", `removed tool call XML, remaining text: "${cleanedText.slice(0, 50)}"`);
    }

    // Clean markdown formatting for TTS
    const cleanText = cleanedText
      .replace(/\*\*(.+?)\*\*/g, "$1")  // **bold**
      .replace(/\*(.+?)\*/g, "$1")      // *italic*
      .replace(/`(.+?)`/g, "$1")        // `code`
      .replace(/\[(.+?)\]\(.+?\)/g, "$1") // [text](url)
      .replace(/^#+\s+/gm, "")          // # headers
      .replace(/^>\s+/gm, "")           // > quotes
      .replace(/^[-*]\s+/gm, "");       // - lists

    debugLog("TTS", `enqueueTTS: original length=${text.length}, clean length=${cleanText.length}, text="${cleanText.slice(0, 100)}"`);

    if (!cleanText.trim()) {
      debugLog("TTS", "skip empty text after cleaning");
      return;
    }

    this.ttsChain = this.ttsChain.then(async () => {
      // Check if TTS was aborted
      if (this.ttsAborted) {
        debugLog("TTS", "skipping TTS (aborted)");
        return;
      }

      try {
        debugLog("TTS", `starting synthesis, text length: ${cleanText.length}`);
        const { audioData } = await tts.synthesize({ text: cleanText });
        debugLog("TTS", `synthesis completed, audio size: ${audioData.byteLength} bytes`);

        // Check again after synthesis (in case aborted during synthesis)
        if (this.ttsAborted) {
          debugLog("TTS", "skipping playback (aborted during synthesis)");
          return;
        }

        debugLog("TTS", "starting playback");
        await this.player.play(audioData);
        debugLog("TTS", "playback completed");
      } catch (err) {
        console.error(`[TTS] error:`, err);
      }
    });
  }

  private handleError(message: string): void {
    this.vadEnabled = false;
    this.resetVAD();
    this.recorder.stop();
    this.asrSession?.close();
    this.asrSession = null;
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.clearSessionTimers();
    this.setState("idle");
    this.callbacks.onError(message);
  }

  private setState(state: PipelineState): void {
    const oldState = this.state;
    this.state = state;
    debugLog("STATE", `${oldState} → ${state}`);
    this.callbacks.onStateChange(state);
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
      systemPromptBuilder: () => buildSystemPrompt(this.app),
    });
  }

  private processVAD(chunk: Float32Array): void {
    const energy = this.calculateEnergy(chunk);

    // Update energy history and background level
    this.vadEnergyHistory.push(energy);
    if (this.vadEnergyHistory.length > this.VAD_HISTORY_SIZE) {
      this.vadEnergyHistory.shift();
    }

    // Calculate background energy (average of lowest 30%)
    if (this.vadEnergyHistory.length >= 10) {
      const sorted = [...this.vadEnergyHistory].sort((a, b) => a - b);
      const lowCount = Math.floor(sorted.length * 0.3);
      this.vadBackgroundEnergy = sorted.slice(0, lowCount).reduce((a, b) => a + b, 0) / lowCount;
    }

    // Calculate threshold - increase 10x during TTS playback to reduce false positives
    let threshold = Math.max(this.VAD_SPEECH_THRESHOLD, this.vadBackgroundEnergy * this.VAD_BACKGROUND_RATIO);
    if (this.state === "speaking") {
      threshold *= 10.0;
      debugLog("VAD", `TTS active, threshold increased to ${threshold.toFixed(4)}`);
    }
    const isSpeech = energy > threshold;

    if (isSpeech && !this.vadSpeechActive) {
      // Barge-in: interrupt TTS if speaking
      if (this.state === "speaking") {
        this.handleBargeIn();
        return;
      }

      // Speech started
      this.vadSpeechActive = true;
      this.vadSilenceStart = 0;
      this.sessionSpeechStarted = true;
      this.updateActivity();
      if (this.sessionIdleTimer) {
        clearTimeout(this.sessionIdleTimer);
        this.sessionIdleTimer = null;
      }
      debugLog("VAD", `speech started, energy=${energy.toFixed(4)}, threshold=${threshold.toFixed(4)}`);
    } else if (!isSpeech && this.vadSpeechActive) {
      // Potential speech end - use ASR timeout (1200ms)
      if (this.vadSilenceStart === 0) {
        this.vadSilenceStart = Date.now();
      } else if (Date.now() - this.vadSilenceStart > this.ASR_SILENCE_MS) {
        // Speech ended
        this.vadSpeechActive = false;
        this.vadSilenceStart = 0;
        debugLog("VAD", `speech ended after ${this.ASR_SILENCE_MS}ms silence`);

        // In Session Mode, commit current ASR and start new session for barge-in
        if (this.settings.interaction.enableSessionMode && this.asrSession) {
          debugLog("VAD", "committing ASR and restarting session for barge-in");
          this.asrSession.commit();
          this.setState("transcribing");

          // Start new ASR session immediately to keep recorder active
          const asrProvider = this.asr;
          if (asrProvider) {
            asrProvider.startStreaming({
              onPartial: (text) => this.callbacks.onPartialTranscript(text),
              onFinal: (text) => this.handleTranscript(text, true),
              onError: (err) => this.handleError(err.message),
            }).then(session => {
              this.asrSession = session;
              debugLog("VAD", "new ASR session started for barge-in");
            }).catch(err => {
              debugLog("VAD", `failed to start new ASR session: ${err}`);
            });
          }
        } else {
          // Non-session mode: stop recording normally
          this.stopListening();
        }
      }
    } else if (!isSpeech && !this.vadSpeechActive) {
      // Idle state - check session timeout (5s)
      // Only timeout if in listening state (not thinking/speaking)
      if (this.vadEnabled && this.state === "listening" && Date.now() - this.lastActivityTime > this.SESSION_IDLE_MS) {
        debugLog("VAD", `session idle for ${this.SESSION_IDLE_MS}ms, closing session`);
        this.sessionActive = false;
        this.callbacks.onSessionActiveChange?.(false);
        this.vadEnabled = false;
        this.resetVAD();
        this.recorder.stop();
        this.asrSession?.close();
        this.asrSession = null;
        this.setState("idle");
      }
    } else if (isSpeech && this.vadSpeechActive) {
      // Speech continuing, reset silence timer
      this.vadSilenceStart = 0;
    }
  }

  private calculateEnergy(chunk: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
    }
    return Math.sqrt(sum / chunk.length);
  }

  private resetVAD(): void {
    this.vadSpeechActive = false;
    this.vadSilenceStart = 0;
    this.vadEnergyHistory = [];
    this.vadBackgroundEnergy = 0;
  }

  private handleBargeIn(): void {
    debugLog("VAD", "barge-in detected, stopping TTS");
    this.player.stop();
    this.ttsChain = Promise.resolve();
    this.setState("listening");
    this.vadSpeechActive = true;
    this.vadSilenceStart = 0;
    this.bargeInOccurred = true;
  }

  private updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  private async checkExitIntent(text: string): Promise<boolean> {
    if (!this.llm) return false;

    const prompt = `判断用户是否想要退出当前对话会话。只回答"是"或"否"。\n\n用户输入: "${text}"`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 500)
      );

      const llmPromise = this.llm.chat({
        messages: [{ role: "user", content: prompt }],
        tools: []
      });

      const response = await Promise.race([llmPromise, timeoutPromise]);
      const isExit = response.content?.toLowerCase().includes("是") ?? false;
      debugLog("EXIT", `intent check: "${text}" → ${isExit ? "exit" : "continue"}`);
      return isExit;
    } catch (err) {
      debugLog("EXIT", `intent check failed: ${err}, defaulting to continue`);
      return false;
    }
  }
}
