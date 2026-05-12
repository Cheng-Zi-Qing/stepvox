# StepVox Beta Tester Guide

> StepVox 还没上 Obsidian 社区市场。这份文档教你怎么在 marketplace 之前装 0.1.0 试用，以及我们最希望你帮忙试的几件事。
>
> StepVox is not in the Obsidian Community Plugins marketplace yet. This doc walks you through installing 0.1.0 before then, and lists the specific things we'd love feedback on.

---

## English

### 1. Install StepVox

You have two install paths. **BRAT is strongly preferred** — it handles auto-updates as we ship 0.1.x fixes, so you don't need to redo this dance every patch.

#### Option A — BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) is a community plugin specifically built for distributing beta plugins. Two-minute setup.

1. In Obsidian, go to **Settings → Community plugins → Browse**, search **"BRAT"**, install, and enable.
2. Open **Settings → BRAT → Beta Plugin List → Add Beta plugin**.
3. Paste: `Cheng-Zi-Qing/stepvox`
4. Leave version as "latest version" → **Add Plugin**.
5. Back to **Settings → Community plugins**, find **StepVox**, enable it.

When we ship a new 0.1.x release, BRAT picks it up automatically (or you can force-check with **Settings → BRAT → Check for updates**).

#### Option B — Manual install

Use this if you don't want to install another plugin, or if BRAT isn't an option for you.

1. Download these three files from the [0.1.0 release page](https://github.com/Cheng-Zi-Qing/stepvox/releases/tag/0.1.0):
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. In your vault, navigate to `.obsidian/plugins/`. Create a new folder called `stepvox`.
3. Drop all three files inside `.obsidian/plugins/stepvox/`.
4. In Obsidian: **Settings → Community plugins**. If "Restricted mode" (or "Safe mode" on older versions) is on, turn it off — you'll see a "Turn on community plugins" button.
5. Reload Obsidian (Cmd/Ctrl + R, or quit and relaunch) so it picks up the new plugin folder.
6. Go back to **Settings → Community plugins → Installed plugins**, find **StepVox**, flip the toggle on.

When we ship an update, re-download the three files and overwrite.

### 2. First-run setup

1. Get a **StepFun API key** at <https://platform.stepfun.com/>. The "Coding Plan" subscription is the cheapest way to drive ASR/TTS heavily; pay-per-use API mode also works.
2. In Obsidian: **Settings → StepVox → StepFun 配置 → API Key**, paste it.
3. (Optional) **LLM section** — by default StepVox uses StepFun for the language model too. Switch to OpenAI / Anthropic / Custom if you prefer.
4. (Optional) **Web Search** — paste a Tavily or Exa key if you want the assistant to search the web.
5. Hit the **Test Connection** button under LLM to confirm your config works.
6. Open the **StepVox panel** (ribbon icon `mic`, or command palette → "StepVox: Open StepVox panel").
7. **Bind a hotkey** — Settings → Hotkeys, search "StepVox", give "Toggle voice recording" a key combo you like (e.g. `Cmd+Shift+V`).
8. Allow Obsidian microphone access if your OS prompts. macOS: System Settings → Privacy & Security → Microphone → enable Obsidian.

Test it: press your hotkey, say "你好" (or any English sentence), wait for the response. You should see the transcript and hear a spoken reply.

### 3. What we'd really love you to try

The interesting bugs hide in the edges. If you can poke at any of these, it'd be huge:

- **Your geographic location.** If you're outside China, please test with **Settings → StepFun → 地区 → 国际版** ("Global"). We tested heavily on the China region; the Global endpoint path has less mileage.
- **A non-StepFun LLM provider.** We did live testing on the StepFun LLM (which internally uses the OpenAI-compatible code path), but we did NOT live-test the Anthropic provider during release prep — only static type checks. If you have an Anthropic API key, please switch the LLM provider to Anthropic and confirm conversations work end-to-end.
- **Cancellation / barge-in.** Start a long question. While the assistant is replying, either (a) press the hotkey again, or (b) just start talking. The reply should stop immediately and listen to you. If there's lag, please report what platform/provider.
- **Tool calls.** Try things like "把我最近的会议笔记总结一下", "search my vault for projects mentioning X", "create a note called Y with content Z". Confirm the assistant actually does the vault operations and that nothing destructive happens that wasn't intended.
- **Session mode.** Toggle **Settings → Interaction → Enable Session Mode** on, then start a session. Have a 3-4 turn conversation. Confirm it ends naturally when you say "bye" / "再见" / "退出" / "结束" (or after silence/noise).
- **TTS voices.** **Settings → TTS → Voice** → press Refresh, try a few voices. Tell us which sound natural and which don't.

### 4. Where to report issues

GitHub Issues: <https://github.com/Cheng-Zi-Qing/stepvox/issues>

What helps us:
- A one-line description of what you tried.
- What you expected vs. what happened.
- Your OS + Obsidian version.
- If the pipeline misbehaved: enable **Settings → Debug → Debug mode**, reproduce, then attach the relevant lines from `.obsidian/plugins/stepvox/debug.log` (redact API keys before pasting).
- For audio-quality complaints (voice sounds wrong, TTS gargled, ASR mishears), include the actual transcript / voice you used.

### 5. Updating

- **BRAT users**: automatic. Optionally check manually under Settings → BRAT.
- **Manual users**: redownload the three files from the [latest release](https://github.com/Cheng-Zi-Qing/stepvox/releases), overwrite, reload Obsidian.

### 6. Uninstalling

- **Settings → Community plugins → installed plugins** → disable StepVox → click the trash icon.
- (BRAT users) also remove StepVox from BRAT's Beta Plugin List.
- Your API keys live in `<vault>/.obsidian/plugins/stepvox/data.json`. If you want them gone too, delete that file before uninstalling.

---

## 中文

### 1. 安装 StepVox

两种方式，**强烈推荐用 BRAT** —— 后续我们发 0.1.x 修复版会自动更新，省得你每次手动覆盖。

#### 方式 A — BRAT（推荐）

[BRAT](https://github.com/TfTHacker/obsidian42-brat) 是社区做的"装 beta 插件"专用工具，两分钟搞定。

1. Obsidian 里 **Settings → Community plugins → Browse**，搜 **"BRAT"**，安装，开启。
2. 打开 **Settings → BRAT → Beta Plugin List → Add Beta plugin**。
3. 粘贴：`Cheng-Zi-Qing/stepvox`
4. 版本保留 "latest version" → **Add Plugin**。
5. 回到 **Settings → Community plugins**，找到 **StepVox**，开启。

之后我们每发新版，BRAT 会自动检测并更新（也可以在 Settings → BRAT 里手动 Check for updates）。

#### 方式 B — 手动安装

如果你不想装额外插件，或者 BRAT 对你不可用。

1. 去 [0.1.0 release 页](https://github.com/Cheng-Zi-Qing/stepvox/releases/tag/0.1.0) 下载这三个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 在你的 vault 里找到 `.obsidian/plugins/` 目录，新建一个叫 `stepvox` 的文件夹。
3. 把三个文件丢进 `.obsidian/plugins/stepvox/`。
4. Obsidian 里 **Settings → Community plugins**。如果"受限模式 / Restricted mode"（旧版叫 "Safe mode"）是开的，先关掉 —— 会看到一个 "Turn on community plugins" 按钮点一下。
5. **重载 Obsidian**（Cmd/Ctrl + R，或者退出重新打开）—— Obsidian 只在启动时扫一次 plugins 目录，不重载看不到新插件。
6. 回到 **Settings → Community plugins → Installed plugins**，找到 **StepVox**，打开开关。

更新时重新下载三个文件覆盖即可。

### 2. 首次配置

1. 在 <https://platform.stepfun.com/> 注册并拿到 **StepFun API key**。订 "Coding Plan" 是高频用 ASR/TTS 最划算的方式；按量计费的 API 模式也能用。
2. Obsidian 里 **Settings → StepVox → StepFun 配置 → API Key**，粘贴。
3. （可选）**LLM 那一节** — 默认 LLM 也用 StepFun，你可以切到 OpenAI / Anthropic / 自定义。
4. （可选）**Web Search** — 想让助手联网搜索就填 Tavily 或 Exa 的 key。
5. 点 LLM 下面的 **Test Connection** 按钮，确认配置可用。
6. 通过 ribbon 图标 `mic` 或命令面板「StepVox: Open StepVox panel」打开 **StepVox 面板**。
7. **绑定快捷键** — Settings → Hotkeys，搜 "StepVox"，给 "Toggle voice recording" 绑一个你喜欢的组合键（比如 `Cmd+Shift+V`）。
8. 给 Obsidian 麦克风权限。macOS：系统设置 → 隐私与安全 → 麦克风 → 勾选 Obsidian。

测一下：按快捷键，说"你好"（或任何中英文句子），等响应。你应该能看到转写文本并听到回复。

### 3. 我们最希望你帮忙试的几件事

最有意思的 bug 都藏在边缘。下面任何一项你能帮忙试，都帮我们大忙：

- **你所在的地理位置。** 如果你在中国境外，请把 **Settings → StepFun → 地区** 切到 **国际版**。我们在国内端点做了大量测试，国际端点路径跑得少。
- **非 StepFun 的 LLM provider。** 我们在发布前实测了 StepFun（内部走的是 OpenAI 兼容代码路径），**但没实测 Anthropic** —— 只过了静态类型检查。如果你有 Anthropic key，请切到 Anthropic，确认整轮对话能正常跑通。
- **取消 / 打断（barge-in）。** 问一个长问题。助手回答到一半时，要么（a）再按一次快捷键，要么（b）直接开口说话。回复应该立刻停下来开始听你。如果感觉有延迟，请告诉我们你的平台和 provider。
- **工具调用。** 试一些像 "把我最近的会议笔记总结一下"、"search my vault for projects mentioning X"、"create a note called Y with content Z" 这样的请求。确认助手真的在 vault 里做了对应操作，且没有意外的破坏性变更。
- **持续对话模式（Session Mode）。** 打开 **Settings → Interaction → Enable Session Mode**，开始一次会话，进行 3-4 轮对话。确认你说 "bye" / "再见" / "退出" / "结束" 时（或安静一段时间 / 有持续噪音时）会话自动结束。
- **TTS 音色。** **Settings → TTS → Voice** → 点 Refresh，试几个不同音色。告诉我们哪些自然、哪些机械。

### 4. 怎么反馈问题

GitHub Issues： <https://github.com/Cheng-Zi-Qing/stepvox/issues>

最有用的反馈包含：
- 一句话描述你做了什么。
- 你期望的行为 vs. 实际发生的。
- 你的操作系统 + Obsidian 版本。
- 流水线出错时：开 **Settings → Debug → Debug mode**，复现一次，然后把 `.obsidian/plugins/stepvox/debug.log` 里的相关行附上（**粘贴前请遮掉 API key**）。
- 音质 / 识别错误的反馈，请把当时实际的转写文本 / 你说的话也附上。

### 5. 更新

- **BRAT 用户**：自动。也可以在 Settings → BRAT 里手动 check。
- **手动安装用户**：从 [最新 release](https://github.com/Cheng-Zi-Qing/stepvox/releases) 重新下载三个文件覆盖，重启 Obsidian。

### 6. 卸载

- **Settings → Community plugins → installed plugins** → 关闭 StepVox → 点垃圾桶图标。
- （BRAT 用户）记得也从 BRAT 的 Beta Plugin List 里移除。
- 你的 API key 存在 `<vault>/.obsidian/plugins/stepvox/data.json`。如果想一并清掉，卸载前把这个文件删了。
