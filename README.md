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

- Obsidian **≥ 1.7.0**, desktop only (the plugin uses Node WebSockets and is not supported on mobile).
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

### Privacy & data handling

StepVox sends data to several third-party services to do its job. Below is a complete list of what leaves your machine, where it goes, and why. **The plugin author does not collect, log, or proxy any of this data — every request goes from your Obsidian directly to the provider whose API key you configured.**

| Data | Sent to | When | Why |
|------|---------|------|-----|
| Microphone audio (16 kHz PCM, streamed) | StepFun ASR endpoint (region selectable: China / Global) | While you're recording | Speech-to-text |
| Synthesised text (your transcripts + assistant replies) | StepFun TTS endpoint | When the assistant speaks back | Text-to-speech |
| Your transcript + system prompt + tool results + relevant vault snippets | The LLM provider you chose (StepFun / OpenAI / Anthropic / your custom endpoint) | Each conversation turn | Reasoning, tool selection, response generation |
| Search query strings | Tavily or Exa (only if `web_search` is enabled) | When the LLM calls the `web_search` tool | Live web search results |
| Vault file contents | The LLM provider above | When the LLM calls `read_file`, `search`, `find_path`, `list_files`, or `get_properties` | The model needs to see notes to answer questions about them |

**Local-only data:**

| Data | Where | Why |
|------|-------|-----|
| Your settings, including API keys | `<vault>/.obsidian/plugins/stepvox/data.json` | Persisted plugin config |
| Debug log (only when Debug mode is on) | `<vault>/.obsidian/plugins/stepvox/debug.log` | Troubleshooting; off by default |
| Conversation history | In-memory only | Not persisted across Obsidian restarts |

**You should know:**

- API keys are stored in plain JSON inside your vault. If you sync your vault, your keys travel with it. Use vault-level encryption (e.g. Cryptomator) if that's a concern.
- StepVox does not phone home, gather telemetry, or contact any server other than the providers you explicitly configure.
- Each provider has its own privacy policy. Check theirs (StepFun / OpenAI / Anthropic / Tavily / Exa) for retention and training-data details.
- The assistant can write to your vault (`create_file`, `append`, `update_content`, `move_file`, etc.). Review each change in Obsidian's file explorer; consider running with backup/sync enabled.

### Configuration

Most settings are documented inline in **Settings → StepVox**. A few highlights:

- **StepFun → Region** — `China` uses the China endpoint, `Global` uses the international endpoint. They have different latency profiles depending on where you are.
- **StepFun → Mode** — `Coding Plan` is cheaper for plan-tier subscribers; `API` is the standard pay-per-use API.
- **TTS → Voice** — click "Refresh" after entering your API key to load the available voice list.
- **LLM → Test Connection** — sends a one-token "hi" request to verify your provider config.
- **Interaction → Session Mode** — when on, one hotkey press starts a continuous conversation that stays open until you say an exit word ("退出", "再见", "bye", …) or trigger consecutive-noise timeout.
- **Personality** — both **Identity** and **Personality** blocks are user-editable. Click "Edit" to open a modal; leave it empty to fall back to the shipped defaults.

### Hotkeys

StepVox registers exactly two commands:

- **Open StepVox panel** — opens the side-panel view.
- **Toggle voice recording** — equivalent to clicking the mic button. If idle, starts a session; if recording, cancels.

Bind them via **Settings → Hotkeys**, search "StepVox".

> **System-wide global hotkey?** Obsidian hotkeys only fire while Obsidian has focus. To trigger StepVox from any app, see [issue #1](https://github.com/Cheng-Zi-Qing/stepvox/issues/1) for OS-level recipes (Apple Shortcuts, Hammerspoon, Raycast, Advanced URI plugin, …).

### Verify your setup (optional)

The repo ships standalone Bun scripts that hit the real ASR / LLM / TTS endpoints with the API keys you've already saved in StepVox settings. Useful when something feels off and you want to isolate "is it my keys / network / region — or the plugin?". They read `data.json` from your vault automatically; you don't pass keys on the command line.

Requires [Bun](https://bun.sh/) and a StepVox install that has been configured at least once.

```bash
git clone https://github.com/Cheng-Zi-Qing/stepvox && cd stepvox
bun scripts/test-asr.ts            # ping StepFun ASR
bun scripts/test-llm.ts            # 4 functional cases against your configured LLM
bun scripts/test-tts.ts            # TTS synthesis sanity check
bun scripts/test-tts.ts --save     # also write /tmp/stepvox-tts-test-*.mp3 — open them
                                   # and listen, this is the fastest way to confirm
                                   # your voice / region / model combo sounds right
```

See [`scripts/README.md`](scripts/README.md) for the full diagnostic table (mapping each failure mode to the likely cause).

> **No Bun installed?** [`scripts/test-stepfun.html`](scripts/test-stepfun.html) is a standalone browser page that pings StepFun's LLM endpoints — open it locally, paste your API key, click "开始测试". Useful as a zero-dependency first check before installing anything.

### Troubleshooting

| Symptom | Likely cause / fix |
|---------|-------|
| "ASR not configured" | Missing StepFun API key in settings. |
| Mic icon doesn't activate | Obsidian doesn't have microphone permission. macOS: System Settings → Privacy & Security → Microphone. |
| Silence is being transcribed as filler ("en", "ah", …) | Working as designed — these are filtered out before reaching the LLM. After 3 consecutive noise hits the session ends with reason `noise-timeout`. |
| Long replies get cut into multiple TTS chunks | Working as designed — chunks synth and play in parallel. If you want shorter replies, edit the Personality block to ask for terser output. |
| LLM hangs / times out | Use **Settings → LLM → Test Connection**. Check API key, region, and rate limits with your provider. |
| Want detailed logs | Enable **Settings → Debug → Debug mode**. Logs go to browser console *and* `.obsidian/plugins/stepvox/debug.log`. |

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

- Obsidian **≥ 1.7.0**，仅桌面端（插件用了 Node WebSocket，移动端跑不动）。
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

### 隐私与数据流向

StepVox 为了完成功能会把数据发送给若干第三方服务。下面是完整列表：什么数据、发到哪里、为什么发。**插件作者不收集、不记录、不代理任何这些数据 —— 所有请求都直接从你本地的 Obsidian 发到你配置过 API key 的 provider。**

| 数据 | 发送到 | 何时 | 用途 |
|------|--------|------|------|
| 麦克风音频（16 kHz PCM，流式） | StepFun ASR 端点（区域可选：中国 / 国际） | 录音期间 | 语音识别 |
| 待合成文本（你的转写 + 助手的回复） | StepFun TTS 端点 | 助手开口讲话时 | 语音合成 |
| 你的转写 + system prompt + 工具调用结果 + 相关 vault 片段 | 你选择的 LLM provider（StepFun / OpenAI / Anthropic / 自定义端点） | 每一轮对话 | 推理、工具选择、回复生成 |
| 搜索查询字符串 | Tavily 或 Exa（仅当启用了 `web_search`） | LLM 调用 `web_search` 工具时 | 联网搜索 |
| Vault 文件内容 | 上述 LLM provider | LLM 调用 `read_file`、`search`、`find_path`、`list_files`、`get_properties` 时 | 模型需要看到笔记内容才能回答相关问题 |

**只在本地的数据：**

| 数据 | 位置 | 用途 |
|------|------|------|
| 你的设置（含 API keys） | `<vault>/.obsidian/plugins/stepvox/data.json` | 持久化插件配置 |
| 调试日志（仅当 Debug 模式开启时） | `<vault>/.obsidian/plugins/stepvox/debug.log` | 排错；默认关闭 |
| 对话历史 | 仅内存中 | 不跨 Obsidian 重启保留 |

**你应该知道：**

- API key 以明文 JSON 存在你的 vault 里。如果你同步 vault，key 也会被同步。介意的话用 vault 级加密（比如 Cryptomator）。
- StepVox 不会回连作者服务器、不上报遥测、不联系任何你没配置的 provider。
- 每个 provider 都有自己的隐私政策，关于数据保留与训练数据使用细节请查看各家（StepFun / OpenAI / Anthropic / Tavily / Exa）。
- 助手能写入你的 vault（`create_file`、`append`、`update_content`、`move_file`…）。请用 Obsidian 文件浏览器审查每次变更，建议开启备份/同步。

### 配置说明

大部分设置在 **Settings → StepVox** 里有 inline 说明。这里挑几个重点：

- **StepFun → 地区** — `中国` 用国内端点，`国际版` 用海外端点。延迟取决于你所在地。
- **StepFun → 模式** — `Coding Plan` 对订阅了 plan 的用户更便宜；`API` 是标准按量计费。
- **TTS → Voice** — 填好 API key 后点 "Refresh" 加载可用音色列表。
- **LLM → Test Connection** — 发一个一字 "hi" 请求验证 provider 配置是否对。
- **Interaction → Session Mode** — 开启后，一次按键进入连续对话；说退出关键词（"退出"、"再见"、"bye"…）或连续噪音超时后自动结束。
- **Personality** — Identity 和 Personality 两块都可编辑。点 "Edit" 打开 Modal；留空回退到内置默认。

### 快捷键

StepVox 只注册两个命令：

- **Open StepVox panel** — 打开侧栏面板。
- **Toggle voice recording** — 等价于点击麦克风按钮：空闲时开始 session，正在录音时取消。

绑定方式：**Settings → Hotkeys**，搜 "StepVox"。

> **想要全局快捷键（在其他 app 里也能用）？** Obsidian 快捷键仅在 Obsidian 是前台时生效。跨 app 触发的方案见 [issue #1](https://github.com/Cheng-Zi-Qing/stepvox/issues/1)（涉及 Apple Shortcuts、Hammerspoon、Raycast、Advanced URI 插件等系统级方案）。

### 验证配置（可选）

仓库里有几个独立 Bun 脚本，可以拿你已经在 settings 里保存的 API key 直接打到真实的 ASR / LLM / TTS 端点上。当感觉不对劲、想区分到底是 key / 网络 / 区域问题还是插件本身有 bug 时很有用。脚本会自动从你 vault 里读 `data.json`，不需要在命令行里传 key。

前提：装了 [Bun](https://bun.sh/)，并且 StepVox 至少配置过一次（settings 已存盘）。

```bash
git clone https://github.com/Cheng-Zi-Qing/stepvox && cd stepvox
bun scripts/test-asr.ts            # 测 StepFun ASR 连通性
bun scripts/test-llm.ts            # 用你配置的 LLM 跑 4 个功能用例
bun scripts/test-tts.ts            # TTS 合成基本检查
bun scripts/test-tts.ts --save     # 同时把音频写到 /tmp/stepvox-tts-test-*.mp3
                                   # 打开试听 —— 这是确认音色 / 区域 / 模型搭配
                                   # 听起来对不对的最快办法
```

完整的诊断对照表（每种失败模式对应的可能原因）见 [`scripts/README.md`](scripts/README.md)。

> **没装 Bun？** [`scripts/test-stepfun.html`](scripts/test-stepfun.html) 是一个独立的浏览器页面，专门测 StepFun 的 LLM 端点 —— 本地打开 → 粘 API key → 点「开始测试」就行。没有任何依赖，适合在装其它东西之前先做个零依赖的连通性自检。

### 故障排查

| 现象 | 可能原因 / 解决 |
|------|----------|
| 提示 "ASR not configured" | settings 里没填 StepFun API key |
| 麦克风按钮点了没反应 | Obsidian 没有麦克风权限。macOS 在「系统设置 → 隐私与安全 → 麦克风」开启 |
| 只说一两个语气词（"嗯"、"啊"）也被识别 | 已设计为过滤掉这类填充词；连续 3 次噪音命中后会自动结束 session（reason: `noise-timeout`） |
| 长回复被切成多个 TTS 片段播 | 设计如此：chunk 并行合成 + 播放。想要更短回复，改 Personality 块要求精简 |
| LLM 卡住或超时 | 用 **Settings → LLM → Test Connection** 测一下；检查 API key、区域、provider 端的限流 |
| 想看详细日志 | 开 **Settings → Debug → Debug mode**。日志同时写到浏览器 console 和 `.obsidian/plugins/stepvox/debug.log` |

### 开源协议

[MIT](LICENSE) © 2026 ZiqingCheng

### 反馈与贡献

欢迎在 <https://github.com/Cheng-Zi-Qing/stepvox/issues> 提 issue 或 PR。
