import { Plugin } from "obsidian";
import { VIEW_TYPE_STEPVOX } from "./constants";
import { DEFAULT_SETTINGS, StepVoxSettingTab } from "./settings";
import type { StepVoxSettings } from "./settings";
import { StepVoxView } from "./ui/StepVoxView";
import { StatusBarWidget } from "./ui/StatusBarWidget";

export default class StepVoxPlugin extends Plugin {
  settings!: StepVoxSettings;
  private statusBar!: StatusBarWidget;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_STEPVOX, (leaf) => new StepVoxView(leaf));

    this.addRibbonIcon("mic", "StepVox", () => this.activateView());

    this.statusBar = new StatusBarWidget(this);

    this.addSettingTab(new StepVoxSettingTab(this.app, this));

    this.addCommand({
      id: "open-stepvox",
      name: "Open StepVox panel",
      callback: () => this.activateView(),
    });
  }

  onunload(): void {}

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
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_STEPVOX)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_STEPVOX, active: true });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
