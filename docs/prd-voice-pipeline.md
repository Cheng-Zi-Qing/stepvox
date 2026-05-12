# PRD: Voice Pipeline & Session Mode

> This file is the **runtime specification** — phase flow, parameter values, timeout tables, decision summaries. It is what you reach for when changing implementation behaviour.
>
> For domain vocabulary (what each concept is named, what gets confused with what), see `CONTEXT.md` at the repo root. For per-feature deep dives (per-tool API, error tables, etc.), see the maintainer's vault per `docs/agents/domain.md`.

## Overview

StepVox is a voice-first assistant inside Obsidian. The user speaks, the system transcribes, reasons, acts, and responds — all via voice.

---

## Core Pipeline Flow

Every interaction follows a strict **linear** cycle driven by 6 ordered functions in `VoicePipeline`:

```
beginListeningPhase
  ↓ (user speech)
onUserSpoke                    ← Vad1.onSpeechEnded
  ↓ (ASR returns text)
onTranscript
  ↓
runReasoning                   ← AgentOrchestrator D46 3-round loop
  ↓
speakReply                     ← TTS chunks through ttsChain
  ↓
onTurnComplete                 → Session Mode: echo cooldown 400ms → beginListeningPhase
                               → Single-turn:  endSession("turn-complete")
```

Two interrupts:
- **onBargeIn** — triggered by Vad2 during `thinking`/`speaking`; aborts current work and jumps into a fresh `beginListeningPhase`.
- **onVad1IdleTimeout** — user never spoke within Vad1's 5s window; either plays the "刚刚被打断了" follow-up prompt (if after a barge-in) or ends the session.

### States

| State | Description |
|---|---|
| `idle` | Session not active. Mic grey. |
| `listening` | ASR session open, Vad1 listening, Vad2 `off`. |
| `transcribing` | ASR committed, awaiting `onFinal`. Vad1 stopped. |
| `thinking` | Orchestrator running; Vad2 `watch` (base threshold × 4). |
| `speaking` | TTS playing; Vad2 `watch-speaking` (× 10 threshold to reject echo). |

Transitions are deterministic and routed exclusively through the 6 phase functions.

---

## Two-VAD Architecture

StepVox uses **two independent VAD instances**, both fed the same audio chunks from the single `AudioRecorder`:

### Vad1 — "user is done speaking"

| Config | Default | Purpose |
|---|---|---|
| `speechThreshold` | `0.02` | Absolute energy floor below which a frame is silence. |
| `backgroundRatio` | `3.0` | Effective threshold = `max(speechThreshold, backgroundEnergy × 3.0)`. |
| `silenceMs` | `1200` | Continuous silence (after speechStarted) that fires `onSpeechEnded`. |
| `idleTimeoutMs` | `5000` | Nobody speaks for this long → `onIdleTimeout`. |
| `warmupMs` | `200` | First 200ms after `start()`: collect samples but never fire. Prevents speaker tail / AEC convergence from false-triggering. |

Lives during `listening` only. Stops the moment `onSpeechEnded` or `onIdleTimeout` fires.

### Vad2 — "user interrupted"

| Config | Default | Purpose |
|---|---|---|
| `baseThreshold` | `0.02` | Base energy floor. |
| `thinkingMultiplier` | `4.0` | During `thinking`: effective threshold = base × 4. |
| `speakingMultiplier` | `10.0` | During `speaking`: base × 10. Rejects the pipeline's own TTS echo. |
| `consecutiveFramesRequired` | `4` | Must stay above threshold for N chunks in a row to fire. Single-frame spikes (click, breath) don't trigger. |

Mode table (driven by pipeline):

| Pipeline phase | Vad2 mode |
|---|---|
| `idle` / `listening` / `transcribing` | `off` |
| `thinking` | `watch` |
| `speaking` | `watch-speaking` |

After firing, the pipeline must call `vad2.rearm()` before it can fire again — a one-shot design prevents re-entrant interruptions while `onBargeIn` is still running.

---

## Agent Loop (D46 — summary, see `stepvox.command-executor.md` in vault for depth)

The orchestrator runs at most **3 rounds** per turn with the **full tool set** passed every round (no intent routing since D50).

```
Round 1 — LLM + full tools (10s timeout)
  ├─ no tool_calls → final answer → skip R2/R3 (latency win)
  └─ tool_calls   → tool phase 1 → R2
Round 2 — LLM + full tools (10s timeout)
  ├─ duplicate detection: any R2 call whose (name,args) signature matches R1
  │     is short-circuited; a "tool already called" message is injected.
  ├─ no tool_calls → final answer
  ├─ all duplicates → duplicateLoopDetected = true (affects R3)
  └─ novel calls   → tool phase 2 → R3
Round 3 — LLM + NO tools (10s timeout)
  Either:
    normal: "produce a spoken summary, no markup, ≤ 80 CJK chars / 50 EN words"
    loop:   "you just repeated R1 — ask the user ONE short clarifying question ≤ 40 chars"
  On LLM failure or empty/XML-only output → FALLBACK_APOLOGY is spoken.
```

Tool phase per-call: `web_search` has an 8s timeout; other tools have no per-tool timeout. Total phase cap: 12s.

---

## Tool Execution & Voice Feedback

### Two feedback callbacks

**`onToolStart(toolCalls)`** — fires when the orchestrator begins a tool phase.
- Emits `"正在{工具名}..."` or `"正在搜索{query}"` for search tools.
- Routed through the new **`onToolStatus(text)`** callback — **ephemeral status row**, NOT added to the conversation log.
- Also enqueued into the TTS chain so the user hears it immediately.
- **Per-turn de-duplication**: if R1 and R2 both trigger the same status string, only the first occurrence is spoken.

**`onToolSlow(toolName)`** — fires when a tool exceeds 3s.
- Emits `"正在{工具名}，请稍候..."` through the same `onToolStatus` channel.

### Partial Content

When the LLM emits `content` alongside `tool_calls`, that text is **Partial Content**:
1. Cleaned via `cleanForDisplay()` (strip `<tool_call>` / `<function=...>` / `<|tool_call_begin|>` XML).
2. If non-empty after cleaning → `onResponse(display)` → conversation log.
3. Always enqueued into TTS (TTS layer runs its own XML strip too, so display and audio stay consistent).

---

## TTS Pipeline

### ttsChain

A sequential `Promise<void>`. Each `enqueueTTS(text)` appends one `.then(async () => synth; play)`. `speakReply` awaits the chain's tail so the pipeline's `speaking → idle` transition reflects the true end of playback, not a single segment's end.

### chunkForTTS

Long text (> 120 chars) is split on sentence / comma / newline boundaries before enqueueing. Each chunk stays under the StepFun TTS synth 10s timeout. Chunks flow through the same `ttsChain` with no audible gap.

### Abort semantics

`ttsAborted` is set by `cancel()` and `onBargeIn()`. Any in-flight or pending `.then` body checks it and skips synth/play. `ttsChain` is also re-assigned to `Promise.resolve()` so queued segments are dropped.

---

## Session Mode

### Activation

- Controlled by `interaction.enableSessionMode` (user setting).
- `toggleRecording()` in `main.ts` calls `pipeline.startSession(sessionMode)`.
- A single click of the mic with Session Mode ON → enters loop.
- A single click of the mic while Session is alive → `pipeline.cancel()` → hard exit.

### Session loop (simplified)

```
startSession(sessionMode=true)
  ├─ sessionAlive = true               → onSessionActiveChange(true)  → mic turns red
  ├─ rebuildProvidersIfNeeded()
  ├─ capture vault snapshot once       → currentVaultSnapshot
  └─ beginListeningPhase()
       ↓ (one turn: listen → think → speak)
     onTurnComplete
       ├─ sessionMode && sessionAlive  → cooldown 400ms → beginListeningPhase (loop)
       └─ else                         → endSession("turn-complete")
```

### Exit conditions

Every exit path funnels through `endSession(reason)`:

| Reason | Trigger |
|---|---|
| `user-cancel` | Mic click while session alive; `pipeline.cancel()`. |
| `exit-keyword` | Transcript contains `退出`, `结束`, `停止`, `退下`, `exit`, `stop`, `quit`. |
| `idle-timeout` | Vad1 5s idle during `listening` without a prior speechStart. |
| `turn-complete` | Single-turn mode finished one cycle. |
| `empty-response` | LLM returned nothing even after apology fallback. |
| `error` | ASR connect failure, LLM not configured, etc. |

`endSession`:
1. Tears down audio (Vad1/Vad2/recorder/player/ASR/timers).
2. Sets phase to `idle`.
3. Emits `onSessionActiveChange(false)` → UI mic goes grey.

---

## mic visual ≡ sessionAlive

The UI mic's "red" state binds exclusively to the runtime `sessionAlive` flag, not to `PipelineState`. Every path that changes `sessionAlive` goes through `setSessionAlive(...)`, which emits `onSessionActiveChange(...)`. `StepVoxView.updateMicBtn()` reads the corresponding `sessionMode` field set by the callback — nothing else influences the mic colour.

This replaces the old behaviour where `listening` also turned the mic red; that lied when the pipeline was transcribing/thinking/speaking.

---

## Timeouts (D48)

| Stage | Timeout | Failure mode |
|---|---|---|
| ASR WebSocket/HTTP connect | 5s | `handleAsrError` → `endSession("error")` |
| ASR final transcript (after commit) | 5s | Degrades to empty transcript → loops or idles, no error raised |
| LLM per round | 10s | In orchestrator: `callLLM` returns `{error: ...}` → R3 apology fallback |
| Tool phase total | 12s | Unfinished tools synthesized as `"Error: tool phase exceeded..."` |
| web_search per-tool | 8s | Synthesized `"Error: web_search timed out after 8s"` fed back to LLM |
| TTS synth per chunk | 10s | Logged as TTS error; playback skipped for that chunk, chain continues |

---

## Vault awareness (D52)

### Snapshot injection

On `startSession()`:

```ts
this.currentVaultSnapshot = this.toolExecutor.snapshotVaultStructure();
```

`snapshotVaultStructure()` walks the vault root two levels deep (folders only, not files), capped at 30 per level, produces a plain text like:

```
Excalidraw/
workspace/
  workspace/projects/
  workspace/meetings/
工作/
  工作/2026/
  工作/draft/
```

This is injected into `system-prompt.ts` as:

```
## Vault Structure (captured at session start, 2-level deep)
<snapshot>
```

Plus a rule block telling the LLM:
- Consult the snapshot **before** any path-taking tool call.
- For uncertain paths, use `find_path(query)` — do NOT chain `list_files` calls.
- `create_file` must put the file in a sensible snapshot-visible folder, not the vault root.

### Two new tools

| Tool | Layer | Purpose |
|---|---|---|
| `find_path(query, type?)` | `read` | Fuzzy substring search over file + folder names across the whole vault. Returns up to 30 `[file]`/`[folder]` lines. |
| `move_file(path, new_path)` | `write` | Rename or move a note via `fileManager.renameFile` (updates links). Refuses to overwrite. Description tells the LLM to confirm with the user first. |

---

## Design Decisions (summary — detailed in `stepvox.decisions.md`)

| Decision | Rationale |
|---|---|
| D46 — 3-round agent loop | Bounded latency (≤ 3 LLM calls / turn) + room for progressive tool chaining. |
| D48 — Layered timeouts | Prevent indefinite hangs at every I/O boundary; fail fast. |
| D50 — Drop intent routing | Keyword routing was brittle; model-driven tool choice (via descriptions) is more accurate and doesn't need maintenance as tools grow. |
| D51 — Two VADs | Separating "end of utterance" (Vad1) from "barge-in detection" (Vad2) lets each optimise its own thresholds without interfering. |
| D52 — Vault snapshot | LLM needs orientation to pick folder paths; injecting a 2-level snapshot at session start is cheaper than multiple `list_files` probes. |
| D53 — R2 duplicate detection + R3 clarification mode | When step-3.5-flash gets stuck repeating the same call, switch R3 from "summarize" to "ask a clarifying question". |
| TTS chunking | StepFun TTS synth times out above ~150 chars. Split at punctuation, play back-to-back through ttsChain. |
| `bargeInPending` survives `beginListeningPhase` | The aborted previous turn's runReasoning must not endSession on its empty response — the flag telling it "barge-in is in progress" has to outlive the new phase's start. |
| Cooldown 400ms + Vad1 warmup 200ms | Covers speaker output buffer + room reverb + AEC convergence. Tuned jointly so the total "can't speak yet" window is ≤ 600ms. |
