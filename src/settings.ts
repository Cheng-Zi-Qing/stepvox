import type { InteractionMode } from "./types";
import {
  DEFAULT_ASR_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_WAKE_WORD,
  DEFAULT_COMMAND_TIMEOUT_MS,
} from "./constants";
import { App, PluginSettingTab, Setting } from "obsidian";
import type StepVoxPlugin from "./main";

export interface StepVoxSettings {
  asr: {
    provider: string;
    apiKey: string;
    model: string;
    language: string;
  };
  tts: {
    enabled: boolean;
    provider: string;
    apiKey: string;
    model: string;
    voice: string;
    speed: number;
    volume: number;
  };
  llm: {
    endpoint: string;
    apiKey: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  interaction: {
    mode: InteractionMode;
    hotkey: string;
    wakeWord: string;
    sensitivity: number;
    silenceTimeout: number;
  };
  audio: {
    sampleRate: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
  };
  execution: {
    vaultName: string;
    commandTimeout: number;
    confirmDestructive: boolean;
  };
}

export const DEFAULT_SETTINGS: StepVoxSettings = {
  asr: {
    provider: "stepfun",
    apiKey: "",
    model: DEFAULT_ASR_MODEL,
    language: "zh",
  },
  tts: {
    enabled: true,
    provider: "stepfun",
    apiKey: "",
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
    speed: 1.0,
    volume: 1.0,
  },
  llm: {
    endpoint: "",
    apiKey: "",
    model: "",
    temperature: 0.3,
    systemPrompt: "",
  },
  interaction: {
    mode: "push-to-talk",
    hotkey: "Mod+Shift+V",
    wakeWord: DEFAULT_WAKE_WORD,
    sensitivity: 0.5,
    silenceTimeout: 1500,
  },
  audio: {
    sampleRate: DEFAULT_SAMPLE_RATE,
    noiseSuppression: true,
    echoCancellation: true,
  },
  execution: {
    vaultName: "",
    commandTimeout: DEFAULT_COMMAND_TIMEOUT_MS,
    confirmDestructive: true,
  },
};

export class StepVoxSettingTab extends PluginSettingTab {
  plugin: StepVoxPlugin;

  constructor(app: App, plugin: StepVoxPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "StepVox Settings" });

    // ASR
    containerEl.createEl("h3", { text: "ASR (Speech-to-Text)" });
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("StepFun ASR API key")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.asr.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.asr.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // TTS
    containerEl.createEl("h3", { text: "TTS (Text-to-Speech)" });
    new Setting(containerEl)
      .setName("Enabled")
      .setDesc("Enable voice responses")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tts.enabled)
          .onChange(async (value) => {
            this.plugin.settings.tts.enabled = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("StepFun TTS API key")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.tts.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.tts.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // LLM
    containerEl.createEl("h3", { text: "LLM" });
    new Setting(containerEl)
      .setName("Endpoint")
      .setDesc("OpenAI-compatible API endpoint")
      .addText((text) =>
        text
          .setPlaceholder("https://api.example.com/v1")
          .setValue(this.plugin.settings.llm.endpoint)
          .onChange(async (value) => {
            this.plugin.settings.llm.endpoint = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("API Key")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.llm.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.llm.apiKey = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Model")
      .addText((text) =>
        text
          .setPlaceholder("Model name")
          .setValue(this.plugin.settings.llm.model)
          .onChange(async (value) => {
            this.plugin.settings.llm.model = value;
            await this.plugin.saveSettings();
          })
      );

    // Interaction
    containerEl.createEl("h3", { text: "Interaction" });
    new Setting(containerEl)
      .setName("Mode")
      .setDesc("Voice activation mode")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("push-to-talk", "Push-to-Talk")
          .addOption("wake-word", "Wake Word")
          .setValue(this.plugin.settings.interaction.mode)
          .onChange(async (value) => {
            this.plugin.settings.interaction.mode = value as InteractionMode;
            await this.plugin.saveSettings();
          })
      );
  }
}
