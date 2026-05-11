import { Plugin } from "obsidian";
import { VIEW_TYPE_STEPVOX } from "./constants";
import { DEFAULT_SETTINGS, StepVoxSettingTab } from "./settings";
import type { StepVoxSettings } from "./settings";
import { StepVoxView } from "./ui/StepVoxView";
import { StatusBarWidget } from "./ui/StatusBarWidget";
import { VoicePipeline } from "./pipeline";
import type { PipelineCallbacks } from "./pipeline";

export default class StepVoxPlugin extends Plugin {
  settings!: StepVoxSettings;
  private statusBar!: StatusBarWidget;
  private pipeline!: VoicePipeline;
  private isRecording = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    const callbacks: PipelineCallbacks = {
      onStateChange: (state) => {
        this.statusBar.setState(state);
        this.getView()?.setPipelineState(state);
        if (state === "idle") this.isRecording = false;
      },
      onPartialTranscript: (text) => {
        this.getView()?.setPartialTranscript(text);
      },
      onFinalTranscript: (text) => {
        this.getView()?.addEntry({
          role: "user",
          text,
          timestamp: Date.now(),
        });
      },
      onResponse: (text) => {
        this.getView()?.addEntry({
          role: "assistant",
          text,
          timestamp: Date.now(),
        });
      },
      onToolStatus: (text) => {
        this.getView()?.setToolStatus(text);
      },
      onError: (message) => {
        this.getView()?.showError(message);
      },
      onPerformanceMetrics: (metrics) => {
        this.getView()?.addPerformanceMetrics(metrics);
      },
      onSessionActiveChange: (active) => {
        this.isRecording = active;
        this.getView()?.setSessionMode(active);
      },
    };

    this.pipeline = new VoicePipeline(this.app, this.settings, callbacks);

    this.registerView(VIEW_TYPE_STEPVOX, (leaf) => {
      const view = new StepVoxView(leaf);
      view.setOnToggle(() => this.toggleRecording());
      view.setOnClearHistory(() => this.pipeline.clearHistory());
      return view;
    });

    this.addRibbonIcon("mic", "StepVox", () => this.activateView());

    this.statusBar = new StatusBarWidget(this);

    this.addSettingTab(new StepVoxSettingTab(this.app, this));

    this.addCommand({
      id: "open-stepvox",
      name: "Open StepVox panel",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "toggle-recording",
      name: "Toggle voice recording",
      callback: () => this.toggleRecording(),
    });

    this.addCommand({
      id: "start-recording",
      name: "Start voice recording",
      callback: () => {
        if (!this.isRecording) this.toggleRecording();
      },
    });

    this.addCommand({
      id: "stop-recording",
      name: "Stop voice recording",
      callback: () => {
        if (this.isRecording) this.toggleRecording();
      },
    });

    this.addCommand({
      id: "toggle-session-mode",
      name: "Toggle session mode",
      callback: () => this.toggleSessionMode(),
    });
  }

  onunload(): void {
    this.pipeline.dispose();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) ?? {};
    this.settings = {
      stepfun: { ...DEFAULT_SETTINGS.stepfun, ...saved.stepfun },
      asr: { ...DEFAULT_SETTINGS.asr, ...saved.asr },
      tts: { ...DEFAULT_SETTINGS.tts, ...saved.tts },
      llm: { ...DEFAULT_SETTINGS.llm, ...saved.llm },
      interaction: { ...DEFAULT_SETTINGS.interaction, ...saved.interaction },
      audio: { ...DEFAULT_SETTINGS.audio, ...saved.audio },
      search: { ...DEFAULT_SETTINGS.search, ...saved.search },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.pipeline.onSettingsChanged(this.settings);
    // Sync UI state with settings
    this.getView()?.setSessionMode(this.settings.interaction.enableSessionMode);
  }

  private toggleRecording(): void {
    if (this.isRecording) {
      // Stop current session — hard cancel any in-flight work
      console.log("[Mic Button] terminating current session");
      this.isRecording = false;
      this.pipeline.cancel();
    } else {
      // Start new session
      console.log("[Mic Button] starting session (sessionMode=" + this.settings.interaction.enableSessionMode + ")");
      this.isRecording = true;
      void this.pipeline.startSession(this.settings.interaction.enableSessionMode);
    }
  }

  private toggleSessionMode(): void {
    this.settings.interaction.enableSessionMode = !this.settings.interaction.enableSessionMode;
    void this.saveSettings();
    this.getView()?.setSessionMode(this.settings.interaction.enableSessionMode);
  }

  private getView(): StepVoxView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_STEPVOX);
    if (leaves.length === 0) return null;
    return leaves[0].view as StepVoxView;
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_STEPVOX)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(true)!;
      await leaf.setViewState({ type: VIEW_TYPE_STEPVOX, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
