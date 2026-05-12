# StepVox

> This file is the **domain-language reference** — names of concepts, what each thing is, what avoids being confused with what, and how the pieces relate. It defines vocabulary, not implementation.
>
> For implementation specs (parameter values, timeouts, the phase-by-phase flow, decision rationale), see `docs/prd-voice-pipeline.md`. For per-feature deep dives (per-tool API, error tables, debug log layout), see the maintainer's vault under `~/Documents/Obsidian Vault/workspace/StepVox/features/` (per `docs/agents/domain.md`).

Voice-first assistant living inside Obsidian. Converts spoken language into vault operations through an LLM agent loop.

## Language

### Pipeline & Flow

**VoicePipeline**:
The end-to-end controller that owns the phase machine (idle → listening → transcribing → thinking → speaking). Six ordered functions — `beginListeningPhase`, `onUserSpoke`, `onTranscript`, `runReasoning`, `speakReply`, `onTurnComplete` — plus two interrupt handlers (`onBargeIn`, `onVad1IdleTimeout`) own every state transition. No ad-hoc `setPhase` elsewhere.
_Avoid_: Controller, Manager, Handler.

**PipelineState**:
One of: `idle`, `listening`, `transcribing`, `thinking`, `speaking`. Exactly one state active at any time. Transitions are deterministic and driven by the phase machine above.
_Avoid_: Status, Mode.

**Session Mode**:
Continuous conversation mode where the pipeline automatically restarts listening after each response until it's explicitly ended. The sticky `sessionMode` flag requests auto-loop behaviour; the runtime `sessionAlive` flag is what the UI mic binds to.
_Avoid_: Continuous mode, Auto mode, Loop mode.

**`sessionAlive` (runtime flag)**:
The authoritative "is a session currently running" signal. Toggles through the single sink `endSession(reason)`. The UI mic's red/grey state is driven exclusively by `onSessionActiveChange(sessionAlive)` — no other signal.
_Avoid_: isActive, micOn, running.

**endSession(reason)**:
The one entry point to end a session. Reasons: `user-cancel`, `exit-keyword`, `idle-timeout`, `turn-complete`, `empty-response`, `error`. Resets phase to idle, tears down audio, emits `onSessionActiveChange(false)`.

**Session Flow**:
The complete lifecycle of a Session Mode interaction:
1. User clicks mic → `startSession(sessionMode=true)` → vault snapshot captured once
2. `beginListeningPhase` opens a new ASR session, starts Vad1, disables Vad2
3. User speaks → Vad1 detects end of speech → ASR commits → transcript
4. `runReasoning` calls orchestrator (D46 3-round loop). Vad2 watches for barge-in.
5. `speakReply` synthesises TTS and plays to the speaker. Vad2 watches with raised threshold.
6. `onTurnComplete` → echo cooldown → back to step 2 (Session Mode) or `endSession("turn-complete")` (single-turn)
7. Click mic again OR say exit keyword OR stay silent 5s → `endSession(...)` → mic resets

### VAD (two separate instances)

**Vad1 (end-of-utterance detector)**:
Lives during the listening phase only. Watches each audio chunk. Energy crossing an adaptive threshold triggers `speechStarted`; subsequent 1200ms silence triggers `speechEnded`. Also fires `idleTimeout` after 5s if nobody ever speaks. A 200ms `warmupMs` at the start of each listen ignores speaker tail / AEC convergence so the first few frames don't false-trigger.
_Avoid_: VAD, Silence detector.

**Vad2 (barge-in detector)**:
Lives across the whole session. Mode set by the pipeline: `off` during idle/listening/transcribing; `watch` during thinking; `watch-speaking` during speaking (threshold × 10 to reject the speaker's own echo). Fires once on `consecutiveFramesRequired` (default 4) hot frames in a row — single-frame pops (click, breath) don't trigger. Pipeline calls `rearm()` after each firing to re-enable.
_Avoid_: Interrupt detector, Cut-in watcher.

**Barge-in**:
`Vad2.onInterrupt` handler fired during `thinking` or `speaking`. `onBargeIn()` aborts the orchestrator, stops the player, clears the TTS chain, closes the current ASR session, sets `bargeInPending = true`, and jumps straight into `beginListeningPhase`. If the new Vad1 idle-times out without speech (user didn't actually want to say anything), a friendly "刚刚被打断了，您还有什么需要？" TTS prompt is issued before looping back.
_Avoid_: Interruption, Override.

**Exit Intent Detection**:
Two-stage process for handling session exit requests:
1. Keyword detection: transcript contains any of `退出`, `结束`, `停止`, `退下`, `exit`, `stop`, `quit`.
2. Today this short-circuits directly to `endSession("exit-keyword")`. LLM-based disambiguation is currently disabled because it added a full round-trip of latency — bring it back if we see user-confusion cases.

**Interaction Mode**:
How the user activates voice. Currently: click mic, or a user-assigned Obsidian hotkey (bound via Obsidian's Hotkeys UI, not a plugin setting — avoids macOS conflicts). Wake-word mode is deferred, see [[stepvox.wake-word]].

### Agent & Reasoning

**AgentOrchestrator**:
The three-round LLM reasoning loop (D46). Round 1: LLM with full tool set. Round 2: same tools, plus duplicate-call detection. Round 3: tools=[], forced summary. Per-round 10s timeout; per tool-phase 12s total; web_search per-tool 8s. Returns a final string or an apology fallback.
_Avoid_: Agent, Brain, Executor.

**Duplicate-call detection (R2)**:
`callSignature(call) = name|JSON(args)`. Any R2 tool call whose signature matches an R1 call is short-circuited — not re-executed, and a "This tool has already been called with the same arguments..." message is injected back to the LLM. If every R2 call is a duplicate, the pipeline flips `duplicateLoopDetected = true` and R3's system instruction switches from "summarize" to "ask the user ONE short clarifying question".
_Avoid_: Loop guard, Retry suppressor.

**R3 clarification mode**:
When the R2 tool calls are all duplicates of R1, R3 asks a clarifying question (≤ 40 chars) instead of forcing a summary. Deals with the "LLM is stuck and doesn't know what the user wanted" failure mode gracefully.

**Tool**:
A single atomic operation the LLM can invoke via function calling. Has a name, parameters schema, and description. Executed by ToolExecutor. The full set is passed to the LLM every turn — tool choice is model-driven via descriptions, not keyword-routed (see D50).
_Avoid_: Command, Action, Function.

**ToolExecutor**:
Receives a ToolCall from the LLM, validates permissions by layer, executes against Obsidian API, returns a ToolResult. Also owns `snapshotVaultStructure()` for the per-session prompt injection.
_Avoid_: Command executor, Tool runner.

**Tool Layer**:
Permission classification: `read` (always allowed), `write` (allowed with intent), `dangerous` (requires explicit user confirmation), `system` (internal state).
_Avoid_: Permission level, Access tier.

**Vault Snapshot**:
A two-level folder tree of the vault, captured once at `startSession()` and injected into the system prompt's `## Vault Structure` block. Reused across all turns of the same session. Lets the LLM pick folder paths (like `workspace/reports/`) directly without chaining `list_files` calls. Capped at 30 folders per level with a truncation marker.
_Avoid_: Vault tree, Folder map.

**find_path** (tool):
Fuzzy substring search across file + folder names in the whole vault. Returns up to 30 `[file]`/`[folder]` path lines. The LLM uses this to resolve ambiguous user references ("the report", "我的工作目录") without a chain of `list_files` probes.

**move_file** (tool):
Vault-internal rename via `fileManager.renameFile` (updates links). Refuses to overwrite existing paths. The system prompt requires the LLM to confirm the destination with the user before calling it.

### Events & Feedback

**Callbacks (not events)**:
The pipeline exposes per-turn callbacks the UI and orchestrator consume: `onPartial`, `onToolStart`, `onToolSlow`, `onResponse`, `onToolStatus`, `onStateChange`, `onSessionActiveChange`, `onPerformanceMetrics`. No pub/sub — direct function handles passed into `orchestrator.run()` / `VoicePipeline` constructor.

**Partial Content**:
Text the LLM returns alongside `tool_calls` (before the final response). Examples: "好的，我来查一下". Pushed to `onPartial`, cleaned of tool-call XML for display, and enqueued into TTS immediately.
_Avoid_: Intermediate response, Status message.

**onToolStatus** (ephemeral UI row):
Short live-status text like `"正在搜索2026年A股上市公司"`. Rendered by `StepVoxView.setToolStatus()` into a single replaceable row (CSS class `stepvox-tool-status`), NOT appended to the conversation log. Cleared on the next real `addEntry` call or on state `idle`/`listening`. Per-turn de-duplication (`spokenToolStatus` set) prevents saying "正在列出文件..." twice when R1 and R2 both request the same tool.

### Memory

**Short-term Memory**:
In-memory conversation history in `AgentOrchestrator.history`, trimmed to `MAX_HISTORY_MESSAGES = 20`. Cleared on `dispose()` or user command.
_Avoid_: Context, History buffer.

**Long-term Memory**:
User preferences and habits persisted to `<vault>/.obsidian/plugins/stepvox/memory/memory.md`. Only stored via `update_memory` tool. NOT for vault structure or file content — the vault itself is the source of truth.
_Avoid_: Knowledge base, User profile.

### Providers

**Provider**:
An interface implementation for an external service. Three kinds currently: `ASRProvider`, `TTSProvider`, `LLMProvider`. Search is a separate module (`SearchProvider`) reached only through the `web_search` tool. Each is replaceable independently.

**LLMProvider** (OpenAI / Anthropic / custom):
`createLLMProvider(settings)` picks the right class. OpenAI-compatible endpoint covers StepFun, OpenAI, and custom; Anthropic uses its own Messages API. Per-round 10s timeout is enforced by the orchestrator via `AbortController`.

**SearchProvider** (Tavily / Exa / none):
Chosen via `settings.search.provider`. Called from `ToolExecutor.webSearch`. Returns top results as text; the LLM summarises them into the response.

### Timeouts (D48)

| Stage | Timeout |
|---|---|
| ASR connection | 5 s |
| ASR final transcript | 5 s |
| LLM call per round | 10 s |
| Tool phase total | 12 s |
| web_search per-tool | 8 s |
| TTS synth per chunk | 10 s |

**Timeouts surface as tool results** — errors are formatted into text and fed back to the LLM, not thrown upward. ASR final-transcript timeout degrades to an empty transcript (no error notice; the session loops or ends idle as appropriate).

### TTS

**ttsChain**:
A serial `Promise<void>` chain. Every enqueued segment appends one `.then`. `speakReply` awaits the chain's tail to know when playback truly finishes.

**chunkForTTS(text, maxChars=120)**:
Splits long text on sentence / comma / newline boundaries so the StepFun TTS doesn't time out on >120-char inputs. Enqueued chunks play back-to-back through the same `ttsChain` with no audible gap.

**cleanForDisplay(text)**:
Strips `<tool_call>`, `<function=...>`, `<|tool_call_begin|>` XML (step-3.5-flash sometimes leaks these) before pushing assistant text to the conversation log. The TTS layer applies the same filter — display and audio never diverge.

### Tool set

14 tools, organised by layer:

| Layer | Tools |
|---|---|
| `read` | `read_file`, `search`, `list_files`, `get_properties`, `find_path`, `web_search` |
| `write` | `create_file`, `append`, `prepend`, `update_content`, `set_property`, `open_file`, `move_file` |
| `system` | `read_memory`, `update_memory` |

Removed historically: `get_active_file` (D47 — active file now injected via prompt), `discard_pending` + async-pending infrastructure (D46).

## Relationships

- A **VoicePipeline** owns one **Vad1**, one **Vad2**, one **AgentOrchestrator**, one **ToolExecutor**, and one each of ASR / TTS / LLM / optional Search providers.
- **Vad1** lives within `listening`. **Vad2** lives across `thinking` + `speaking`. `mode="off"` otherwise.
- All phase transitions go through the 6 phase functions + 2 interrupt handlers in `VoicePipeline`.
- Every session end goes through **`endSession(reason)`**, which emits `onSessionActiveChange(false)`. The **UI mic** binds only to that signal.
- The **vault snapshot** is captured in `startSession()` and passed to `buildSystemPrompt(app, vaultStructure)` on every `systemPromptBuilder()` call during that session.
- **Duplicate-call detection** lives in the orchestrator, not in individual tools — it's a behavioural guard, not per-tool logic.
- **Long-term Memory** is accessed only via `read_memory` / `update_memory` tools, never injected into the system prompt.
- The **tool set** is passed in full every turn; no intent routing (D50).

## Example dialogue

> **Dev:** "User says '帮我查一下 2026 上半年上市的中国大模型公司然后记到笔记里', what happens?"
> **Domain expert:** "Phase `listening`. Vad1 commits when the user stops talking. Phase `transcribing`. ASR returns the text. Phase `thinking`. The orchestrator sends the full tool set + the vault snapshot + today's date. The LLM picks `web_search` based on the word '今年' and its own description (web search is for external/time-sensitive queries). It may also emit Partial Content like '好的，我来查一下' which flows to the speaker via TTS chunking while the tool runs. After R1 tool phase, R2 may call `create_file` with a path under `workspace/` because the snapshot showed `workspace/` exists. R3 (tools=[]) produces the final spoken summary capped at 80 chars."

> **Dev:** "In Session Mode, what happens when the user starts speaking while the assistant is still talking?"
> **Domain expert:** "**Vad2** fires after 4 consecutive hot frames. `onBargeIn()` aborts the orchestrator, stops the player, sets `bargeInPending = true`, and calls `beginListeningPhase()`. The aborted `runReasoning` later sees `bargeInPending` and returns early — it does NOT call `endSession`. The user's new input is captured fresh; if they don't follow through within the Vad1 idle window, a friendly '刚刚被打断了' prompt plays before looping back."

> **Dev:** "How does the pipeline know the difference between 'user finished speaking' and 'no one is speaking'?"
> **Domain expert:** "That's Vad1's two exits. `speechEnded` fires only if `speechStarted` was observed earlier — user spoke, then 1200ms of silence. `idleTimeout` fires if `speechStarted` never happened at all — nobody spoke for 5s. Different handlers: `onUserSpoke` commits the ASR; `onVad1IdleTimeout` either prompts after a barge-in or ends the session."

> **Dev:** "What if the LLM keeps calling `list_files` over and over?"
> **Domain expert:** "The orchestrator signs every R1 tool call with `name|JSON(args)`. When R2 asks for a call with an existing signature, the executor short-circuits and tells the LLM 'already called — use the previous result'. If every R2 call is a duplicate, R3 switches into clarification mode — it asks the user one short question instead of forcing a summary that would likely come back as garbled XML."

## Flagged ambiguities

- "tool" vs "command" — resolved: we use **Tool** exclusively. "Command" is reserved for Obsidian's internal command palette (`app.commands`).
- "memory" — resolved: always qualified as **Short-term Memory** or **Long-term Memory**. Unqualified "memory" is ambiguous.
- "context" — resolved: in system prompt discussions, means "information injected into the LLM request" (including the vault snapshot). In code, means Obsidian's `metadataCache` context.
- "session" vs "turn" — resolved: a **session** is one entire sessionAlive lifetime (can contain many turns). A **turn** is one beginListening → onTurnComplete cycle within a session.
- "focus" — resolved: concept removed (D34). If someone says "focus", ask what they mean.
- "VAD" (bare) — resolved: always qualified as **Vad1** or **Vad2**. Unqualified "VAD" is ambiguous.
