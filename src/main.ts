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
      onError: (message) => {
        this.getView()?.showError(message);
      },
    };

    this.pipeline = new VoicePipeline(this.app, this.settings, callbacks);

    this.registerView(VIEW_TYPE_STEPVOX, (leaf) => {
      const view = new StepVoxView(leaf);
      view.setOnToggle(() => this.toggleRecording());
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
  }

  onunload(): void {
    this.pipeline.dispose();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) ?? {};
    this.settings = {
      asr: { ...DEFAULT_SETTINGS.asr, ...saved.asr },
      tts: { ...DEFAULT_SETTINGS.tts, ...saved.tts },
      llm: { ...DEFAULT_SETTINGS.llm, ...saved.llm },
      interaction: { ...DEFAULT_SETTINGS.interaction, ...saved.interaction },
      audio: { ...DEFAULT_SETTINGS.audio, ...saved.audio },
      execution: { ...DEFAULT_SETTINGS.execution, ...saved.execution },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.pipeline.onSettingsChanged(this.settings);
  }

  private toggleRecording(): void {
    if (this.isRecording) {
      this.isRecording = false;
      this.pipeline.stopListening();
    } else {
      this.isRecording = true;
      void this.pipeline.startListening();
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
