# StepVox

> Voice-controlled AI assistant for Obsidian. Speak to query, edit, and create notes — without taking your hands off whatever you're doing.

> 用语音操控 Obsidian 的 AI 助手。说话就能查询、编辑、创建笔记，手不用离开当前任务。

---

## English

### Features

- **End-to-end voice loop** — local microphone → cloud ASR → LLM (with tools) → cloud TTS → speakers, all streamed.
- **Vault-aware tools** — the assistant can read, search, find, list, create, append, prepend, update, move, and open notes in your vault, plus query frontmatter properties.
- **Web search** — optional `web_search` tool backed by Tavily or Exa for real-world questions outside the vault.
- **Multi-provider LLM** — pick StepFun, OpenAI, Anthropic, or a custom OpenAI-compatible endpoint. Hot-swappable in settings.
- **Session mode** — hold a continuous multi-turn conversation; exits on keyword ("退出", "结束", "bye", …) or after consecutive noise/silence.
- **Barge-in** — start speaking while the assistant is talking and it stops to listen.
- **Personality blocks** — customise the system prompt's Identity and Personality sections from settings; the rest of the prompt scaffolding stays managed.
- **Status bar + side panel** — see pipeline state (listening / transcribing / thinking / speaking) and the running transcript.

### Requirements

- Obsidian **≥ 1.7.0**, desktop only (the plugin uses Node.js APIs not available on mobile).
- A **StepFun API key** for ASR (speech recognition) and TTS (speech synthesis). StepFun is currently the only provider for these two stages. Get your key at <https://platform.stepfun.com/step-plan> (China) or <https://platform.stepfun.ai/step-plan> (Global).
- An **LLM API key** for at least one of: StepFun, OpenAI, Anthropic, or a custom OpenAI-compatible endpoint.
- **Microphone permission** for Obsidian. macOS: System Settings → Privacy & Security → Microphone → enable Obsidian.
- (Optional) A **Tavily** or **Exa** API key if you want the assistant to search the live web.

### Quick start

1. **Install** StepVox (Obsidian Community Plugins — coming soon — or install manually by dropping `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/stepvox/`).
2. Open **Settings → StepVox** and paste your **StepFun API key**.
3. (Optional) Configure your **LLM provider** — defaults to StepFun, but you can switch to OpenAI / Anthropic / Custom in the LLM section.
4. (Optional) Enable **Web Search** with a Tavily or Exa key.
5. Open the **StepVox panel** (ribbon icon `mic`, or command palette → "StepVox: Open StepVox panel").
6. Open **Settings → Hotkeys**, search for "StepVox", and bind a key to **"Toggle voice recording"**.
7. Press the hotkey, speak, release nothing — the pipeline detects when you stop talking. Press again to cancel mid-flight.

### Hotkeys

StepVox registers two commands — bind them via **Settings → Hotkeys**, search "StepVox":

- **Open StepVox panel** — opens the side-panel view.
- **Toggle voice recording** — equivalent to clicking the mic button. If idle, starts a session; if recording, cancels.

> **System-wide global hotkey?** Obsidian hotkeys only fire while Obsidian has focus. See [Global Hotkey (Local API)](#global-hotkey-local-api) below to trigger StepVox from any app.

### Global Hotkey (Local API)

StepVox runs a local HTTP server on `127.0.0.1:27120`. Send a `POST` request to toggle recording from any app:

```bash
curl -X POST http://localhost:27120/toggle
# → {"recording":true}  or  {"recording":false}
```

Bind this to a system-wide shortcut with your launcher of choice:

| Platform | Tool | Setup |
|----------|------|-------|
| **macOS** | Raycast | Create a Script Command → `curl -s -X POST http://localhost:27120/toggle` → assign a hotkey |
| | Alfred | Workflow → Run Script → same `curl` command |
| | Apple Shortcuts | Add a "Run Shell Script" action → same `curl` command → assign keyboard shortcut in System Settings |
| | Hammerspoon | `hs.hotkey.bind({"cmd","shift"}, "v", function() hs.execute("curl -s -X POST http://localhost:27120/toggle") end)` |
| **Windows** | AutoHotkey | Install [AutoHotkey v2](https://www.autohotkey.com/), create a `.ahk` file: `#^v:: { Run 'curl -s -X POST http://localhost:27120/toggle',, "Hide" }` (Win+Ctrl+V) |
| **Linux** | GNOME | Settings → Keyboard → Custom Shortcuts → command: `curl -s -X POST http://localhost:27120/toggle` |
| | KDE | System Settings → Shortcuts → Custom Shortcuts → same command |

The server starts automatically with the plugin and binds to localhost only — not reachable from the network. If port `27120` is occupied, the plugin shows a Notice and continues without the local API; all other features work normally.

### Privacy

StepVox sends audio to StepFun (ASR/TTS), transcripts and vault snippets to your chosen LLM provider, and optionally search queries to Tavily/Exa. **The plugin author does not collect, log, or proxy any data** — every request goes directly from your Obsidian to the provider you configured. API keys are stored in plain JSON in your vault (`data.json`); use vault-level encryption if you sync. See each provider's privacy policy for retention details.

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| "ASR not configured" | Paste your StepFun API key in Settings → StepVox. |
| Mic icon doesn't activate | Grant Obsidian microphone permission. macOS: System Settings → Privacy & Security → Microphone. |
| LLM hangs / times out | Use Settings → LLM → Test Connection. Check API key, region, and rate limits. |
| Want detailed logs | Enable Settings → Debug → Debug mode. Logs go to console and `.obsidian/plugins/stepvox/debug.log`. |

### License

[MIT](LICENSE) © 2026 ZiqingCheng

### Contributing & issues

Issues and PRs welcome at <https://github.com/Cheng-Zi-Qing/stepvox/issues>.

---

## 中文

### 功能特性

- **端到端语音流水线** — 麦克风 → 云端 ASR → LLM（带工具调用）→ 云端 TTS → 扬声器，全程流式。
- **Vault 工具** — 助手可以在你的 vault 里读、搜、定位、列举、新建、追加、前置、修改、移动、打开笔记，还能查询 frontmatter 属性。
- **网络搜索** — 可选的 `web_search` 工具，后端可选 Tavily 或 Exa，用于回答 vault 之外的现实世界问题。
- **多 LLM provider** — StepFun / OpenAI / Anthropic / 自定义 OpenAI 兼容端点，settings 里随时切换。
- **持续对话模式（Session Mode）** — 一次按键开启连续多轮对话，说退出关键词（"退出"、"再见"、"bye"…）或连续噪音/静默后自动结束。
- **打断（Barge-in）** — 助手讲话时你直接开口，它会立刻停下来听你说。
- **人格自定义** — Identity 和 Personality 两块 system prompt 可在 settings 里修改，其它 prompt 骨架由插件管理。
- **状态栏 + 侧栏面板** — 实时显示流水线状态（listening / transcribing / thinking / speaking）和对话记录。

### 使用前提

- Obsidian **≥ 1.7.0**，仅桌面端（插件使用了移动端不可用的 Node.js API）。
- **StepFun API key**（用于 ASR 语音识别和 TTS 语音合成）。这两个阶段目前只支持 StepFun。国内版：<https://platform.stepfun.com/step-plan>；国际版：<https://platform.stepfun.ai/step-plan>。
- 至少一个 **LLM provider** 的 API key：StepFun / OpenAI / Anthropic / 自定义 OpenAI 兼容端点 任选。
- **Obsidian 麦克风权限**。macOS 在「系统设置 → 隐私与安全 → 麦克风」里勾选 Obsidian。
- （可选）**Tavily** 或 **Exa** 的 API key，如果你想让助手联网搜索。

### 快速开始

1. **安装** StepVox（社区插件市场——即将上架——或者手动把 `main.js` / `manifest.json` / `styles.css` 拖进 `<vault>/.obsidian/plugins/stepvox/` 目录）。
2. 打开 **Settings → StepVox**，填入 **StepFun API key**。
3. （可选）在 LLM 那一节切换到你想用的 provider（默认 StepFun）。
4. （可选）启用 **Web Search**，填 Tavily 或 Exa key。
5. 通过 ribbon 图标 `mic` 或命令面板「StepVox: Open StepVox panel」打开 **StepVox 面板**。
6. 打开 **Settings → Hotkeys**，搜索 "StepVox"，给 **"Toggle voice recording"** 绑一个快捷键。
7. 按快捷键，开口说话；说完不用做任何事，流水线会自动检测说话结束。再按一次可中途取消。

### 快捷键

StepVox 注册了两个命令，在 **Settings → Hotkeys** 里搜 "StepVox" 绑定：

- **Open StepVox panel** — 打开侧栏面板。
- **Toggle voice recording** — 等价于点击麦克风按钮：空闲时开始 session，正在录音时取消。

> **想要全局快捷键（在其他 app 里也能用）？** Obsidian 快捷键仅在 Obsidian 是前台时生效。请看下方[全局快捷键（本地 API）](#全局快捷键本地-api)章节。

### 全局快捷键（本地 API）

StepVox 在 `127.0.0.1:27120` 运行一个本地 HTTP 服务。在任何 app 里发一个 `POST` 请求即可切换录音：

```bash
curl -X POST http://localhost:27120/toggle
# → {"recording":true}  或  {"recording":false}
```

用你习惯的启动器绑定到系统级快捷键：

| 平台 | 工具 | 设置方式 |
|------|------|---------|
| **macOS** | Raycast | 新建 Script Command → `curl -s -X POST http://localhost:27120/toggle` → 分配快捷键 |
| | Alfred | Workflow → Run Script → 同上 `curl` 命令 |
| | Apple 快捷指令 | 添加「运行 Shell 脚本」操作 → 同上 `curl` 命令 → 在系统设置中分配键盘快捷键 |
| | Hammerspoon | `hs.hotkey.bind({"cmd","shift"}, "v", function() hs.execute("curl -s -X POST http://localhost:27120/toggle") end)` |
| **Windows** | AutoHotkey | 安装 [AutoHotkey v2](https://www.autohotkey.com/)，新建 `.ahk` 文件：`#^v:: { Run 'curl -s -X POST http://localhost:27120/toggle',, "Hide" }` (Win+Ctrl+V) |
| **Linux** | GNOME | 设置 → 键盘 → 自定义快捷键 → 命令：`curl -s -X POST http://localhost:27120/toggle` |
| | KDE | 系统设置 → 快捷键 → 自定义快捷键 → 同上命令 |

服务随插件自动启动，仅绑定 localhost（外部网络不可达）。若端口 `27120` 被其他进程占用，插件会弹出 Notice 提示，不影响其他功能正常运行。

### 隐私

StepVox 会将音频发送到 StepFun（ASR/TTS），将转写文本和 vault 片段发送到你选择的 LLM provider，可选地将搜索查询发送到 Tavily/Exa。**插件作者不收集、不记录、不代理任何数据** —— 所有请求都直接从你本地的 Obsidian 发到你配置的 provider。API key 以明文 JSON 存在 vault 里（`data.json`）；如果你同步 vault，建议用 vault 级加密。各 provider 的数据保留政策请查看各家官网。

### 故障排查

| 现象 | 解决 |
|------|------|
| 提示 "ASR not configured" | 在 Settings → StepVox 里填入 StepFun API key。 |
| 麦克风按钮点了没反应 | 给 Obsidian 麦克风权限。macOS：系统设置 → 隐私与安全 → 麦克风。 |
| LLM 卡住或超时 | 用 Settings → LLM → Test Connection 测试；检查 API key、区域、provider 端限流。 |
| 想看详细日志 | 开启 Settings → Debug → Debug mode。日志写到 console 和 `.obsidian/plugins/stepvox/debug.log`。 |

### 开源协议

[MIT](LICENSE) © 2026 ZiqingCheng

### 反馈与贡献

欢迎在 <https://github.com/Cheng-Zi-Qing/stepvox/issues> 提 issue 或 PR。
