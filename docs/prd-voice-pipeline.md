# PRD: Voice Pipeline & Session Mode

## Overview

StepVox is a voice-first assistant inside Obsidian. The user speaks, the system transcribes, reasons, acts, and responds — all via voice.

---

## Core Pipeline Flow

Every interaction follows this strict sequential loop:

```
ASR → LLM (+ Tool Calls) → TTS → [Session: restart ASR]
```

### States

| State | Description |
|-------|-------------|
| `idle` | Waiting for user to initiate |
| `listening` | Microphone active, collecting audio |
| `transcribing` | Audio committed to ASR, awaiting transcript |
| `thinking` | LLM processing (including all tool calls) |
| `speaking` | TTS playing response audio |

Transitions are deterministic. No two states are active simultaneously.

---

## Tool Execution & Voice Feedback

### Sync Tool Execution

All tools (including `web_search`) execute **synchronously** within the `thinking` state. The pipeline does not return to `listening` until the full LLM loop completes.

### Voice Feedback During Tool Calls

Two feedback events exist:

**`onToolStart`** — fires immediately when the LLM calls a tool.
- TTS plays: `"好的，我来{工具名称}"` + **task summary from LLM**
- Example: `"好的，我来网络搜索，查询 React 最新版本号"`
- The task summary must be derived from the LLM's Partial Content, not hardcoded

**`onToolSlow`** — fires if a tool exceeds 3 seconds.
- TTS plays: `"正在{工具名称}，请稍候..."`
- Example: `"正在网络搜索，请稍候..."`

### Partial Content

When the LLM returns text alongside a tool call (before the final response), that text is **Partial Content**. It is:
1. Displayed in the UI immediately
2. Sent to TTS immediately
3. Used as the task summary in `onToolStart` feedback

The LLM is responsible for generating meaningful Partial Content. The pipeline must not override or suppress it.

---

## Session Mode

Session Mode enables continuous conversation without manual mic button presses.

### Activation

- Enabled via settings toggle (`interaction.enableSessionMode`)
- Activated by clicking the mic button once
- Deactivated by saying an exit keyword or by idle timeout

### Loop Behavior

After each complete pipeline loop (TTS finishes):
1. ASR restarts automatically → `startListening(sessionMode=true)`
2. Idle timer starts (5 seconds)
3. If speech detected (audio energy > threshold) → idle timer cancelled, VAD silence detection begins
4. If silence after speech (800ms) → auto-commit, proceed to LLM
5. If no speech within 5 seconds → exit Session Mode, return to `idle`

### VAD (Voice Activity Detection)

Client-side energy-based VAD. No external model required.

- **Speech threshold**: `0.002` RMS energy
- **Silence duration**: `800ms` of sub-threshold energy after speech started
- **Idle timeout**: `5000ms` with no speech detected at all

VAD only runs during `listening` state in Session Mode. It does not run during `thinking` or `speaking`.

### Exit Conditions

Session Mode exits when:
1. User says an exit keyword: `退出`, `结束`, `停止`, `exit`, `stop`, `quit`
2. Idle timer fires (5s with no speech)
3. User manually clicks the mic button (calls `stopListening()`)

### Session Timer Rule

**The idle timer only starts after TTS finishes and ASR restarts.** It does not run during `thinking` or `speaking`. This ensures the user has time to respond after the assistant finishes speaking.

---

## Web Search Flow (Example)

```
User: "帮我搜索 Obsidian 最新版本"

1. [listening]     VAD detects speech → silence → auto-commit
2. [transcribing]  ASR returns: "帮我搜索 Obsidian 最新版本"
3. [thinking]      LLM receives text
                   LLM returns: Partial Content "好的，我来网络搜索 Obsidian 最新版本" + web_search call
                   → TTS plays Partial Content immediately
                   → web_search executes (sync, may trigger onToolSlow after 3s)
                   → LLM receives search results
                   → LLM returns final answer
4. [speaking]      TTS plays final answer
5. [listening]     Session Mode: ASR restarts, idle timer starts
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| web_search is synchronous | Async execution caused duplicate tool_call_id messages, confusing the LLM into repeated calls |
| VAD uses audio energy, not ASR partial events | ASR partials fire after commit, not during recording — unusable for real-time detection |
| Session idle timer starts after TTS | Prevents premature timeout while assistant is still speaking |
| No bidirectional ASR (WebSocket) | Browser WebSocket API doesn't support custom headers; bidirectional ASR can respond without LLM, violating the pipeline contract |
| Partial Content drives tool feedback | LLM generates contextual summaries dynamically; hardcoded strings lose task context |
