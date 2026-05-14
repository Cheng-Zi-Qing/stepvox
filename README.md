# StepVox

Voice-controlled AI assistant for [Obsidian](https://obsidian.md). Speak to query, edit, and create notes — hands-free.

用语音操控 Obsidian 的 AI 助手。说话就能查询、编辑、创建笔记，无需动手。

## Features / 功能

- **End-to-end voice loop** — microphone → ASR → LLM (with vault tools) → TTS → speakers, fully streamed.
- **Vault-aware tools** — read, search, create, append, update, move, and open notes; query frontmatter.
- **Web search** — optional Tavily or Exa integration for questions beyond your vault.
- **Multi-provider LLM** — StepFun, OpenAI, Anthropic, or any OpenAI-compatible endpoint.
- **Two modes** — *Single-shot* (default): one question, one answer, done. *Session mode*: continuous multi-turn conversation that exits on keyword ("退出", "bye", …) or silence.
- **Barge-in** — speak while the assistant is talking and it stops to listen.
- **Personality** — customise the assistant's identity and personality traits in settings.

---

- **端到端语音流水线** — 麦克风 → ASR → LLM（带 vault 工具）→ TTS → 扬声器，全程流式。
- **Vault 工具** — 读、搜、建、追加、修改、移动、打开笔记；查询 frontmatter。
- **网络搜索** — 可选 Tavily 或 Exa，回答 vault 之外的问题。
- **多 LLM 接入** — StepFun / OpenAI / Anthropic / 任意 OpenAI 兼容端点。
- **两种模式** — *单次*（默认）：一问一答结束。*持续对话*：多轮连续对话，说退出关键词（"退出"、"再见"、"bye"…）或静默后自动结束。
- **打断** — 助手说话时直接开口，它会立刻停下来听。
- **人格自定义** — 在设置里修改助手的身份和性格描述。

## Requirements / 前提

- Obsidian **≥ 1.7.0**, desktop only / 仅桌面端。
- [StepFun](https://platform.stepfun.com/step-plan) API key（ASR & TTS）。[Global / 国际版](https://platform.stepfun.ai/step-plan)
- LLM API key — StepFun, OpenAI, Anthropic, or custom endpoint.
- Microphone permission for Obsidian / 需授予 Obsidian 麦克风权限。
- *(Optional)* Tavily or Exa API key for web search / 联网搜索需要 Tavily 或 Exa key。

## Quick start / 快速开始

1. Install from Community Plugins, or manually copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/stepvox/`.
   从社区插件安装，或手动把三个文件放入 `<vault>/.obsidian/plugins/stepvox/`。
2. **Settings → StepVox** — paste your StepFun API key / 填入 StepFun API key。
3. *(Optional)* Switch LLM provider or enable web search / 切换 LLM 或启用网络搜索。
4. Open the StepVox panel — ribbon icon or command palette → *"StepVox: Open StepVox panel"*.
   通过 ribbon 图标或命令面板打开 StepVox 面板。
5. **Settings → Hotkeys** — bind *"StepVox: Toggle voice recording"* / 绑定录音快捷键。
6. Press the hotkey and speak. Press again to cancel.
   按快捷键说话，再按一次取消。

## Global hotkey / 全局快捷键

StepVox runs a local HTTP server on `127.0.0.1:27120` so you can trigger it from any app:

```bash
curl -X POST http://localhost:27120/toggle
```

Bind this to a system-wide shortcut with Raycast, Alfred, AutoHotkey, GNOME custom shortcuts, etc. The server binds to localhost only and starts automatically with the plugin.

用 Raycast / Alfred / AutoHotkey / GNOME 自定义快捷键等工具绑定上述命令即可在任意 app 中触发。服务仅绑定 localhost，随插件自动启动。

## Privacy / 隐私

Audio goes to StepFun (ASR/TTS), transcripts and vault snippets go to your chosen LLM provider, and search queries go to Tavily/Exa if enabled. **The plugin author does not collect, log, or proxy any data.** API keys are stored in `data.json` inside your vault.

音频发送至 StepFun，文本和 vault 片段发送至你选择的 LLM，搜索查询发送至 Tavily/Exa（如启用）。**插件作者不收集、不记录、不代理任何数据。** API key 明文存储在 vault 的 `data.json` 中。

## License

[MIT](LICENSE) © 2026 ZiqingCheng — [Issues & PRs](https://github.com/Cheng-Zi-Qing/stepvox/issues)
