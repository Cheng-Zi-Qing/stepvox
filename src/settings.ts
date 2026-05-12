import {
  DEFAULT_ASR_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_SAMPLE_RATE,
  STEPFUN_VOICES_ENDPOINT,
} from "./constants";
import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type StepVoxPlugin from "./main";
import { LLM_PROVIDERS, getLLMProviderEntry } from "./providers/llm/registry";
import type { ConfigField } from "./providers/llm/registry";
import { PROMPT_BLOCKS } from "./agent/prompt";
import type { PromptBlock } from "./agent/prompt";

interface VoiceDetail {
  "voice-name": string;
  "voice-description": string;
  recommended_scene: string;
}

interface VoicesResponse {
  voices: string[];
  "voices-details": Record<string, VoiceDetail>;
}

/**
 * Schema version for settings on disk. Bump when the layout changes in a
 * way that requires migration (loadSettings in main.ts handles it).
 *   1 — implicit (pre-D57): flat llm fields, no providerConfigs
 *   2 — D57: llm.{activeProvider, providerConfigs}
 */
export const SETTINGS_SCHEMA_VERSION = 2;

export interface StepVoxSettings {
  schemaVersion: number;
  stepfun: {
    region: "china" | "global";
    mode: "api" | "plan";
    apiKey: string;
  };
  asr: {
    provider: string;
    model: string;
    language: string;
  };
  tts: {
    enabled: boolean;
    provider: string;
    model: string;
    voice: string;
    speed: number;
  };
  llm: {
    activeProvider: string;                                 // e.g. "stepfun" / "openai" / "anthropic" / "custom"
    providerConfigs: Record<string, Record<string, unknown>>;
  };
  interaction: {
    enableSessionMode: boolean;
  };
  audio: {
    sampleRate: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
  };
  search: {
    provider: "tavily" | "exa" | "none";
    apiKey: string;
  };
  prompt: {
    /** Single-line identity statement. Empty falls back to default (D61). */
    identity: string;
    /** Multi-line personality bullets. Empty falls back to default (D61). */
    personalityTraits: string;
  };
  debug: {
    enabled: boolean;
  };
}

export const DEFAULT_SETTINGS: StepVoxSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  stepfun: {
    region: "china",
    mode: "plan",
    apiKey: "",
  },
  asr: {
    provider: "stepfun",
    model: DEFAULT_ASR_MODEL,
    language: "zh",
  },
  tts: {
    enabled: true,
    provider: "stepfun",
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
    speed: 1.0,
  },
  llm: {
    activeProvider: "stepfun",
    providerConfigs: {
      stepfun: { stepfunMode: "plan", model: "step-3.5-flash", temperature: 0.3 },
    },
  },
  interaction: {
    enableSessionMode: false,
  },
  audio: {
    sampleRate: DEFAULT_SAMPLE_RATE,
    noiseSuppression: true,
    echoCancellation: true,
  },
  search: {
    provider: "none",
    apiKey: "",
  },
  prompt: {
    identity: "",
    personalityTraits: "",
  },
  debug: {
    enabled: false,
  },
};

/**
 * One-time migration from pre-D57 settings layout to the current shape.
 * Old layout stored llm config as flat top-level fields; we rewrite them
 * into llm.providerConfigs keyed by provider id. Idempotent — re-running
 * on an already-v2 blob is a no-op.
 */
export function migrateSettings(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const blob: Record<string, unknown> = { ...(raw ?? {}) };
  const oldLlm = (blob.llm as Record<string, unknown> | undefined) ?? {};
  const version = (blob.schemaVersion as number | undefined) ?? 1;

  if (version >= SETTINGS_SCHEMA_VERSION) return blob;

  // pre-D57: llm carried flat fields. Promote them into providerConfigs.
  const oldProvider = (oldLlm.provider as string | undefined) ?? "stepfun";
  const oldStepfunMode = (oldLlm.stepfunMode as string | undefined) ?? "plan";
  const oldEndpoint = (oldLlm.endpoint as string | undefined) ?? "";
  const oldApiKey = (oldLlm.apiKey as string | undefined) ?? "";
  const oldModel = (oldLlm.model as string | undefined) ?? "step-3.5-flash";
  const oldTemperature = (oldLlm.temperature as number | undefined) ?? 0.3;

  const providerConfigs: Record<string, Record<string, unknown>> = {
    stepfun: { stepfunMode: oldStepfunMode, model: "step-3.5-flash", temperature: 0.3 },
    openai: { apiKey: "", model: "gpt-4o-mini", temperature: 0.3 },
    anthropic: { apiKey: "", model: "claude-3-5-sonnet-latest", temperature: 0.3 },
    custom: { endpoint: "", apiKey: "", model: "", temperature: 0.3 },
  };

  // Honour the user's existing per-provider values where applicable.
  if (oldProvider === "stepfun") {
    providerConfigs.stepfun = {
      stepfunMode: oldStepfunMode,
      model: oldModel,
      temperature: oldTemperature,
    };
  } else if (oldProvider === "openai") {
    providerConfigs.openai = { apiKey: oldApiKey, model: oldModel, temperature: oldTemperature };
  } else if (oldProvider === "anthropic") {
    providerConfigs.anthropic = { apiKey: oldApiKey, model: oldModel, temperature: oldTemperature };
  } else if (oldProvider === "custom") {
    providerConfigs.custom = {
      endpoint: oldEndpoint,
      apiKey: oldApiKey,
      model: oldModel,
      temperature: oldTemperature,
    };
  }

  blob.llm = {
    activeProvider: oldProvider,
    providerConfigs,
  };
  blob.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return blob;
}

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
      .addDropdown((dropdown) => {
        for (const p of LLM_PROVIDERS) dropdown.addOption(p.id, p.name);
        dropdown
          .setValue(this.plugin.settings.llm.activeProvider)
          .onChange(async (value) => {
            this.plugin.settings.llm.activeProvider = value;
            await this.plugin.saveSettings();
            this.display(); // re-render fields for the new provider
          });
      });

    // Auto-render the active provider's config schema. Adding a new
    // provider requires zero edits to this UI code (D57).
    const activeEntry = getLLMProviderEntry(this.plugin.settings.llm.activeProvider);
    if (activeEntry) {
      this.renderProviderConfig(containerEl, activeEntry.id, activeEntry.configSchema);
    }

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Send a test request to verify the active provider's settings")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          new Notice("Testing LLM connection...");
          try {
            const { createLLMProvider } = await import("./providers/llm/factory");
            const provider = createLLMProvider(this.plugin.settings);
            const resp = await provider.chat({
              messages: [{ role: "user", content: "hi" }],
            });
            const preview = (resp.content ?? "").slice(0, 120);
            new Notice(`OK. Response: ${preview}`);
          } catch (e) {
            new Notice(`FAILED: ${(e as Error).message}`);
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

    // Personality (D61: Identity + Personality traits — only style is exposed)
    new Setting(containerEl).setName("Personality").setHeading();
    this.renderEditablePromptBlocks(containerEl);

    // Hotkeys — direct user to Obsidian's built-in hotkey manager.
    new Setting(containerEl).setName("Hotkeys").setHeading();
    new Setting(containerEl)
      .setName("快捷键配置")
      .setDesc("StepVox 仅提供一个快捷键：Toggle voice recording —— 触发一次等同于点击面板上的麦克风按钮。请在 Obsidian 的 Settings → Hotkeys 中搜索 \"StepVox\" 进行绑定。")
      .addButton((btn) =>
        btn.setButtonText("打开 Hotkeys 设置").onClick(() => {
          // Navigate Obsidian to its Hotkeys settings page, scoped to "StepVox".
          const setting = (this.app as unknown as {
            setting?: { open: () => void; openTabById: (id: string) => unknown };
          }).setting;
          if (setting?.openTabById) {
            setting.open();
            const tab = setting.openTabById("hotkeys") as { searchComponent?: { setValue: (v: string) => void; onChanged?: () => void } } | undefined;
            tab?.searchComponent?.setValue("StepVox");
            tab?.searchComponent?.onChanged?.();
          } else {
            new Notice("请打开 Settings → Hotkeys 搜索 StepVox");
          }
        })
      );

    // Debug
    new Setting(containerEl).setName("Debug").setHeading();
    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("在浏览器 console 输出调试日志，并写入 .obsidian/plugins/stepvox/debug.log")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug.enabled)
          .onChange(async (value) => {
            this.plugin.settings.debug.enabled = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * Auto-render an LLM provider's config schema (D57). For each ConfigField,
   * produce the matching Setting input bound to
   * `settings.llm.providerConfigs[providerId][field.key]`. Writes are
   * scoped to the per-provider record so switching providers doesn't lose
   * other providers' config.
   */
  private renderProviderConfig(
    containerEl: HTMLElement,
    providerId: string,
    schema: ConfigField[]
  ): void {
    const llm = this.plugin.settings.llm;
    if (!llm.providerConfigs[providerId]) llm.providerConfigs[providerId] = {};
    const config = llm.providerConfigs[providerId];

    for (const field of schema) {
      const setting = new Setting(containerEl).setName(field.label);
      if (field.description) setting.setDesc(field.description);

      const current = config[field.key] ?? field.defaultValue ?? "";

      if (field.type === "text" || field.type === "password") {
        setting.addText((text) => {
          if (field.placeholder) text.setPlaceholder(field.placeholder);
          text.setValue(String(current)).onChange(async (value) => {
            config[field.key] = value;
            await this.plugin.saveSettings();
          });
          if (field.type === "password") {
            text.inputEl.type = "password";
          }
        });
      } else if (field.type === "number") {
        setting.addText((text) => {
          if (field.placeholder) text.setPlaceholder(field.placeholder);
          text.inputEl.type = "number";
          text.setValue(String(current)).onChange(async (value) => {
            const parsed = parseFloat(value);
            config[field.key] = Number.isFinite(parsed) ? parsed : field.defaultValue ?? 0;
            await this.plugin.saveSettings();
          });
        });
      } else if (field.type === "select") {
        setting.addDropdown((dd) => {
          for (const opt of field.options ?? []) dd.addOption(opt.value, opt.label);
          dd.setValue(String(current)).onChange(async (value) => {
            config[field.key] = value;
            await this.plugin.saveSettings();
          });
        });
      } else if (field.type === "toggle") {
        setting.addToggle((tg) => {
          tg.setValue(Boolean(current)).onChange(async (value) => {
            config[field.key] = value;
            await this.plugin.saveSettings();
          });
        });
      }
    }
  }

  /**
   * Render every PromptBlock with `editable: true` as a textarea bound to
   * `settings.prompt.<storageKey>` (D61). Blank values fall back to each
   * block's default at render time, so the "Reset" button just writes "".
   */
  private renderEditablePromptBlocks(containerEl: HTMLElement): void {
    const editable = PROMPT_BLOCKS.filter(
      (b): b is PromptBlock & { storageKey: keyof StepVoxSettings["prompt"]; default: string } =>
        b.editable === true && !!b.storageKey
    );
    for (const block of editable) {
      const key = block.storageKey;
      const current = this.plugin.settings.prompt[key] ?? "";
      const isCustom = current.trim().length > 0;
      const previewSource = isCustom ? current : block.default ?? "";
      const preview = previewSource.replace(/\s+/g, " ").trim();
      const truncated = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;
      const status = isCustom ? "Customised" : "Default";

      const setting = new Setting(containerEl)
        .setName(block.label ?? block.id)
        .setDesc(`${status} — ${truncated}`);

      setting.addButton((btn) =>
        btn.setButtonText("Edit").onClick(() => {
          new PromptBlockEditModal(
            this.app,
            block.label ?? block.id,
            block.default ?? "",
            current,
            async (next) => {
              this.plugin.settings.prompt[key] = next;
              await this.plugin.saveSettings();
              this.display();
            }
          ).open();
        })
      );

      if (isCustom) {
        setting.addExtraButton((btn) =>
          btn
            .setIcon("rotate-ccw")
            .setTooltip("Reset to default")
            .onClick(async () => {
              this.plugin.settings.prompt[key] = "";
              await this.plugin.saveSettings();
              this.display();
            })
        );
      }
    }
  }
}

/**
 * Modal editor for a single prompt block (D61). Shows the default value
 * for reference and a large textarea for the user's override. Save writes
 * the new value via the supplied callback; Reset writes empty (which
 * means "use default" at render time); Cancel discards edits.
 */
class PromptBlockEditModal extends Modal {
  private label: string;
  private defaultText: string;
  private currentText: string;
  private onSave: (value: string) => Promise<void> | void;

  constructor(
    app: App,
    label: string,
    defaultText: string,
    currentText: string,
    onSave: (value: string) => Promise<void> | void
  ) {
    super(app);
    this.label = label;
    this.defaultText = defaultText;
    this.currentText = currentText;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("stepvox-prompt-modal");
    contentEl.empty();

    contentEl.createEl("h2", { text: `Edit ${this.label}` });
    contentEl.createEl("p", {
      text: "Leave the editor empty to fall back to the default shown below.",
      cls: "setting-item-description",
    });

    const defaultBox = contentEl.createEl("details");
    defaultBox.createEl("summary", { text: "Show default" });
    const defaultPre = defaultBox.createEl("pre", { cls: "stepvox-prompt-modal-default" });
    defaultPre.setText(this.defaultText || "(no default)");

    const textarea = contentEl.createEl("textarea", { cls: "stepvox-prompt-modal-textarea" });
    textarea.value = this.currentText;
    textarea.placeholder = this.defaultText;
    textarea.rows = 12;

    const buttonRow = contentEl.createDiv({ cls: "stepvox-prompt-modal-buttons" });

    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const resetBtn = buttonRow.createEl("button", { text: "Reset to default" });
    resetBtn.addEventListener("click", async () => {
      await this.onSave("");
      this.close();
    });

    const saveBtn = buttonRow.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", async () => {
      await this.onSave(textarea.value);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
