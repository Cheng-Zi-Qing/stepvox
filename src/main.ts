import { Plugin } from "obsidian";
import { VIEW_TYPE_STEPVOX } from "./constants";
import { DEFAULT_SETTINGS, StepVoxSettingTab, migrateSettings, SETTINGS_SCHEMA_VERSION } from "./settings";
import type { StepVoxSettings } from "./settings";
import { StepVoxView } from "./ui/StepVoxView";
import { StatusBarWidget } from "./ui/StatusBarWidget";
import { VoicePipeline } from "./pipeline";
import type { PipelineCallbacks } from "./pipeline";
import { debugLog, initDebugLogger, maybeRotateLog, setDebugEnabled } from "./utils/debug-logger";

export default class StepVoxPlugin extends Plugin {
  settings!: StepVoxSettings;
  private statusBar!: StatusBarWidget;
  private pipeline!: VoicePipeline;
  private isRecording = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    initDebugLogger(this.app);
    setDebugEnabled(this.settings.debug.enabled);
    maybeRotateLog();
    // Re-check daily so long-running sessions also rotate.
    this.registerInterval(window.setInterval(() => maybeRotateLog(), 24 * 60 * 60 * 1000));

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
  }

  onunload(): void {
    this.pipeline.dispose();
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) ?? {};
    const migrated = migrateSettings(raw);
    const m = migrated as Record<string, any>;
    const savedLlm = (m.llm ?? {}) as Partial<StepVoxSettings["llm"]>;
    this.settings = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      stepfun: { ...DEFAULT_SETTINGS.stepfun, ...m.stepfun },
      asr: { ...DEFAULT_SETTINGS.asr, ...m.asr },
      tts: { ...DEFAULT_SETTINGS.tts, ...m.tts },
      llm: {
        activeProvider: savedLlm.activeProvider ?? DEFAULT_SETTINGS.llm.activeProvider,
        providerConfigs: {
          ...DEFAULT_SETTINGS.llm.providerConfigs,
          ...(savedLlm.providerConfigs ?? {}),
        },
      },
      interaction: { ...DEFAULT_SETTINGS.interaction, ...m.interaction },
      audio: { ...DEFAULT_SETTINGS.audio, ...m.audio },
      search: { ...DEFAULT_SETTINGS.search, ...m.search },
      prompt: { ...DEFAULT_SETTINGS.prompt, ...m.prompt },
      debug: { ...DEFAULT_SETTINGS.debug, ...m.debug },
    };
    // Persist the migrated shape so subsequent loads skip migration.
    if ((raw as Record<string, unknown>).schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      await this.saveData(this.settings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    setDebugEnabled(this.settings.debug.enabled);
    this.pipeline.onSettingsChanged(this.settings);
    // Sync UI state with settings
    this.getView()?.setSessionMode(this.settings.interaction.enableSessionMode);
  }

  private toggleRecording(): void {
    if (this.isRecording) {
      // Stop current session — hard cancel any in-flight work
      debugLog("MIC", "terminating current session");
      this.isRecording = false;
      this.pipeline.cancel();
    } else {
      // Start new session
      debugLog("MIC", `starting session sessionMode=${this.settings.interaction.enableSessionMode}`);
      this.isRecording = true;
      void this.pipeline.startSession(this.settings.interaction.enableSessionMode);
    }
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
