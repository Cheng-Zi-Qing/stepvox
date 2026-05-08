import type { App } from "obsidian";
import type { PipelineState } from "../types";
import type { StepVoxSettings } from "../settings";
import { AudioRecorder } from "../audio/AudioRecorder";
import { AudioPlayer } from "../audio/AudioPlayer";
import { StepFunASR } from "../providers/stepfun-asr";
import { StepFunTTS } from "../providers/stepfun-tts";
import { OpenAILLM } from "../providers/openai-llm";
import { AnthropicLLM } from "../providers/anthropic-llm";
import type { ASRProvider, TTSProvider, LLMProvider, ASRStreamSession } from "../providers";
import { AgentOrchestrator } from "../agent/orchestrator";
import { ToolExecutor } from "../agent/tool-executor";
import { buildSystemPrompt } from "../agent/system-prompt";

export interface PipelineCallbacks {
  onStateChange: (state: PipelineState) => void;
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onResponse: (text: string) => void;
  onError: (message: string) => void;
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

  constructor(app: App, settings: StepVoxSettings, callbacks: PipelineCallbacks) {
    this.app = app;
    this.settings = settings;
    this.callbacks = callbacks;

    this.recorder = new AudioRecorder({
      sampleRate: settings.audio.sampleRate,
      noiseSuppression: settings.audio.noiseSuppression,
      echoCancellation: settings.audio.echoCancellation,
    });

    this.player = new AudioPlayer();
    this.toolExecutor = new ToolExecutor(app, ".obsidian/plugins/stepvox/memory");

    this.recorder.on("data", (chunk) => {
      this.asrSession?.send(chunk);
    });

    this.player.on("end", () => {
      if (this.state === "speaking") {
        this.setState("idle");
      }
    });
  }
  async startListening(): Promise<void> {
    if (this.state === "speaking") {
      this.player.stop();
    }
    if (this.state === "thinking") {
      this.orchestrator?.abort();
    }

    this.rebuildProvidersIfNeeded();

    if (!this.asr) {
      this.handleError("ASR not configured");
      return;
    }

    this.setState("listening");

    try {
      this.asrSession = await this.asr.startStreaming({
        onPartial: (text) => this.callbacks.onPartialTranscript(text),
        onFinal: (text) => this.handleTranscript(text),
        onError: (err) => this.handleError(err.message),
        onVADStart: () => {},
        onVADStop: () => {},
      });
      await this.recorder.start();
    } catch (err) {
      this.handleError(
        err instanceof Error ? err.message : "Failed to start listening"
      );
    }
  }

  stopListening(): void {
    if (this.state !== "listening") return;
    this.recorder.stop();
    this.asrSession?.commit();
    this.setState("transcribing");
  }

  onSettingsChanged(settings: StepVoxSettings): void {
    this.settings = settings;
    this.providerDirty = true;
  }

  dispose(): void {
    this.recorder.dispose();
    this.player.dispose();
    this.asr?.dispose();
    this.tts?.dispose();
    this.llm?.dispose();
    this.orchestrator?.dispose();
  }

  private async handleTranscript(text: string): Promise<void> {
    if (!text.trim()) {
      this.handleError("Didn't hear anything");
      return;
    }

    this.callbacks.onFinalTranscript(text);
    this.setState("thinking");

    try {
      const response = await this.orchestrator!.run(text);
      if (!response) {
        this.setState("idle");
        return;
      }

      this.callbacks.onResponse(response);

      if (this.tts && this.settings.tts.enabled) {
        this.setState("speaking");
        const { audioData } = await this.tts.synthesize({ text: response });
        await this.player.play(audioData);
      } else {
        this.setState("idle");
      }
    } catch (err) {
      this.handleError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  }

  private handleError(message: string): void {
    this.recorder.stop();
    this.asrSession?.close();
    this.asrSession = null;
    this.player.stop();
    this.setState("idle");
    this.callbacks.onError(message);
  }

  private setState(state: PipelineState): void {
    this.state = state;
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
      apiKey: s.asr.apiKey,
      model: s.asr.model,
      language: s.asr.language,
      sampleRate: s.audio.sampleRate,
    });

    this.tts = new StepFunTTS({
      apiKey: s.tts.apiKey,
      model: s.tts.model,
      voice: s.tts.voice,
      speed: s.tts.speed,
    });

    if (s.llm.format === "anthropic") {
      this.llm = new AnthropicLLM({
        endpoint: s.llm.endpoint,
        apiKey: s.llm.apiKey,
        model: s.llm.model,
        temperature: s.llm.temperature,
      });
    } else {
      this.llm = new OpenAILLM({
        endpoint: s.llm.endpoint,
        apiKey: s.llm.apiKey,
        model: s.llm.model,
        temperature: s.llm.temperature,
      });
    }

    this.orchestrator?.dispose();
    this.orchestrator = new AgentOrchestrator({
      provider: this.llm,
      toolExecutor: this.toolExecutor,
      systemPromptBuilder: () => buildSystemPrompt(this.app, this.toolExecutor),
    });

    this.toolExecutor.syncFocusFromActiveFile();
  }
}
