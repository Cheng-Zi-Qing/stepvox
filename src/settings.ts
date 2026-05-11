import {
  DEFAULT_ASR_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_COMMAND_TIMEOUT_MS,
  STEPFUN_VOICES_ENDPOINT,
} from "./constants";
import { getChatEndpoint } from "./utils/endpoint";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type StepVoxPlugin from "./main";

interface VoiceDetail {
  "voice-name": string;
  "voice-description": string;
  recommended_scene: string;
}

interface VoicesResponse {
  voices: string[];
  "voices-details": Record<string, VoiceDetail>;
}

export interface StepVoxSettings {
  stepfun: {
    region: "china" | "global";
    mode: "api" | "plan";
    apiKey: string;
  };
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
    provider: "stepfun" | "openai" | "anthropic" | "custom";
    stepfunMode: "api" | "plan";
    endpoint: string;
    apiKey: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  interaction: {
    enableSessionMode: boolean;
    hotkey: string;
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
    confirmAllWrites: boolean;
  };
  search: {
    provider: "tavily" | "exa" | "none";
    apiKey: string;
  };
}

export const DEFAULT_SETTINGS: StepVoxSettings = {
  stepfun: {
    region: "china",
    mode: "plan",
    apiKey: "",
  },
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
    provider: "stepfun",
    stepfunMode: "plan",
    endpoint: "",
    apiKey: "",
    model: "step-3.5-flash",
    temperature: 0.3,
    systemPrompt: "",
  },
  interaction: {
    enableSessionMode: false,
    hotkey: "Alt+v",
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
    confirmAllWrites: false,
  },
  search: {
    provider: "none",
    apiKey: "",
  },
};

export class StepVoxSettingTab extends PluginSettingTab {
  plugin: StepVoxPlugin;
  private voiceDropdown: import("obsidian").DropdownComponent | null = null;

  constructor(app: App, plugin: StepVoxPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private async fetchVoices(): Promise<void> {
    const apiKey = this.plugin.settings.stepfun.apiKey;
    if (!apiKey) {
      new Notice("Please enter a StepFun API Key first");
      return;
    }
    const model = this.plugin.settings.tts.model;
    try {
      const resp = await fetch(
        `${STEPFUN_VOICES_ENDPOINT}?model=${encodeURIComponent(model)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!resp.ok) {
        new Notice(`Failed to fetch voices: ${resp.status}`);
        return;
      }
      const data = (await resp.json()) as VoicesResponse;
      if (!this.voiceDropdown) return;

      const selectEl = this.voiceDropdown.selectEl;
      selectEl.empty();
      for (const id of data.voices) {
        const detail = data["voices-details"]?.[id];
        const label = detail
          ? `${detail["voice-name"]} — ${detail["voice-description"]}`
          : id;
        this.voiceDropdown.addOption(id, label);
      }
      this.voiceDropdown.setValue(this.plugin.settings.tts.voice);
      new Notice(`Loaded ${data.voices.length} voices`);
    } catch (e) {
      new Notice(`Error fetching voices: ${(e as Error).message}`);
    }
  }

  private async testSearchProvider(): Promise<void> {
    const { provider, apiKey } = this.plugin.settings.search;
    if (!apiKey) {
      new Notice("Please enter an API key first");
      return;
    }
    try {
      const { TavilyProvider, ExaProvider } = await import("./providers/search");
      const searchProvider = provider === "tavily"
        ? new TavilyProvider(apiKey)
        : new ExaProvider(apiKey);

      new Notice("Testing search...");
      const results = await searchProvider.search("test");

      if (results.length > 0) {
        new Notice(`✓ Search test successful! Found ${results.length} results`);
      } else {
        new Notice("✓ API key valid, but no results found");
      }
    } catch (e) {
      new Notice(`✗ Search test failed: ${(e as Error).message}`);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("stepvox-settings");

    // StepFun Global
    new Setting(containerEl).setName("StepFun 配置").setHeading();
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("StepFun API Key (用于 ASR、TTS 和 LLM)")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.stepfun.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.stepfun.apiKey = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("地区")
      .setDesc("选择服务地区")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("china", "中国")
          .addOption("global", "国际版")
          .setValue(this.plugin.settings.stepfun.region)
          .onChange(async (value) => {
            this.plugin.settings.stepfun.region = value as "china" | "global";
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("模式")
      .setDesc("选择 API 模式（Coding Plan 计费更友好）")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("plan", "Coding Plan")
          .addOption("api", "API")
          .setValue(this.plugin.settings.stepfun.mode)
          .onChange(async (value) => {
            this.plugin.settings.stepfun.mode = value as "api" | "plan";
            await this.plugin.saveSettings();
          })
      );

    // ASR
    new Setting(containerEl).setName("ASR (Speech-to-Text)").setHeading();

    // TTS
    new Setting(containerEl).setName("TTS (Text-to-Speech)").setHeading();
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
      .setName("Model")
      .setDesc("TTS model")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("stepaudio-2.5-tts", "stepaudio-2.5-tts (推荐)")
          .setValue(this.plugin.settings.tts.model)
          .onChange(async (value) => {
            this.plugin.settings.tts.model = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Voice")
      .setDesc("TTS voice style — click Refresh to load available voices")
      .addDropdown((dropdown) => {
        const current = this.plugin.settings.tts.voice;
        if (current) {
          dropdown.addOption(current, current);
        }
        dropdown.setValue(current).onChange(async (value) => {
          this.plugin.settings.tts.voice = value;
          await this.plugin.saveSettings();
        });
        this.voiceDropdown = dropdown;
      })
      .addButton((btn) =>
        btn.setButtonText("Refresh").onClick(() => this.fetchVoices())
      );

    // LLM
    new Setting(containerEl).setName("LLM").setHeading();
    new Setting(containerEl)
      .setName("Provider")
      .setDesc("选择 LLM 提供商")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("stepfun", "StepFun")
          .addOption("openai", "OpenAI")
          .addOption("anthropic", "Anthropic")
          .addOption("custom", "Custom (本地模型)")
          .setValue(this.plugin.settings.llm.provider)
          .onChange(async (value) => {
            this.plugin.settings.llm.provider = value as any;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show/hide conditional fields
          })
      );

    // StepFun Mode (only when provider is stepfun)
    if (this.plugin.settings.llm.provider === "stepfun") {
      new Setting(containerEl)
        .setName("StepFun 模式")
        .setDesc("选择 LLM 使用的模式（可与全局模式不同）")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("plan", "Coding Plan")
            .addOption("api", "API")
            .setValue(this.plugin.settings.llm.stepfunMode)
            .onChange(async (value) => {
              this.plugin.settings.llm.stepfunMode = value as "api" | "plan";
              await this.plugin.saveSettings();
            })
        );
    }

    // Endpoint (only when provider is custom)
    if (this.plugin.settings.llm.provider === "custom") {
      new Setting(containerEl)
        .setName("Endpoint")
        .setDesc("本地模型 API endpoint")
        .addText((text) =>
          text
            .setPlaceholder("http://localhost:11434/v1")
            .setValue(this.plugin.settings.llm.endpoint)
            .onChange(async (value) => {
              this.plugin.settings.llm.endpoint = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // API Key (only when provider is not stepfun)
    if (this.plugin.settings.llm.provider !== "stepfun") {
      new Setting(containerEl)
        .setName("API Key")
        .setDesc("LLM provider API key")
        .addText((text) =>
          text
            .setPlaceholder("Enter API key")
            .setValue(this.plugin.settings.llm.apiKey)
            .onChange(async (value) => {
              this.plugin.settings.llm.apiKey = value;
              await this.plugin.saveSettings();
            })
        );
    }
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
    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Send a test request to verify endpoint, key, and model")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          const { llm, stepfun } = this.plugin.settings;
          new Notice("Testing LLM connection...");
          try {
            let endpoint: string;
            let apiKey: string;

            if (llm.provider === "stepfun") {
              endpoint = getChatEndpoint(stepfun.region, llm.stepfunMode);
              apiKey = stepfun.apiKey;
            } else {
              endpoint = llm.endpoint;
              apiKey = llm.apiKey;
            }

            const url = this.buildTestURL(endpoint, llm.provider === "anthropic" ? "anthropic" : "openai");
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            let body: string;
            if (llm.provider === "anthropic") {
              headers["x-api-key"] = apiKey;
              headers["anthropic-version"] = "2023-06-01";
              body = JSON.stringify({
                model: llm.model,
                max_tokens: 32,
                messages: [{ role: "user", content: "hi" }],
              });
            } else {
              headers["Authorization"] = `Bearer ${apiKey}`;
              body = JSON.stringify({
                model: llm.model,
                temperature: llm.temperature,
                messages: [{ role: "user", content: "hi" }],
              });
            }
            const resp = await fetch(url, { method: "POST", headers, body });
            const text = await resp.text();
            if (resp.ok) {
              new Notice(`OK (${resp.status}). Response: ${text.slice(0, 120)}`);
            } else {
              new Notice(`FAILED (${resp.status}): ${text.slice(0, 200)}`);
            }
          } catch (e) {
            new Notice(`Error: ${(e as Error).message}`);
          }
        })
      );

    // Interaction
    new Setting(containerEl).setName("Interaction").setHeading();
    new Setting(containerEl)
      .setName("Enable Session Mode")
      .setDesc("持续对话模式：按一次进入会话，多轮对话直到退出")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.interaction.enableSessionMode)
          .onChange(async (value) => {
            this.plugin.settings.interaction.enableSessionMode = value;
            await this.plugin.saveSettings();
          })
      );

    // Search
    new Setting(containerEl).setName("Web Search").setHeading();
    new Setting(containerEl)
      .setName("Provider")
      .setDesc("外部搜索服务（用于 web_search 工具）")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "Disabled")
          .addOption("tavily", "Tavily")
          .addOption("exa", "Exa")
          .setValue(this.plugin.settings.search.provider)
          .onChange(async (value) => {
            this.plugin.settings.search.provider = value as "tavily" | "exa" | "none";
            await this.plugin.saveSettings();
            this.display();
          })
      );
    if (this.plugin.settings.search.provider !== "none") {
      new Setting(containerEl)
        .setName("API Key")
        .addText((text) =>
          text
            .setPlaceholder("Enter API key")
            .setValue(this.plugin.settings.search.apiKey)
            .onChange(async (value) => {
              this.plugin.settings.search.apiKey = value;
              await this.plugin.saveSettings();
            })
        )
        .addButton((button) =>
          button
            .setButtonText("Test")
            .onClick(async () => {
              await this.testSearchProvider();
            })
        );
    }
  }

  private buildTestURL(endpoint: string, format: string): string {
    const url = endpoint.trim().replace(/\/+$/, "");
    if (format === "anthropic") {
      if (url.endsWith("/messages")) return url;
      const base = url.endsWith("/v1") ? url : `${url}/v1`;
      return `${base}/messages`;
    }
    if (/\/chat\/completions?$/.test(url)) return url;
    const base = url.endsWith("/v1") ? url : `${url}/v1`;
    return `${base}/chat/completions`;
  }
}
