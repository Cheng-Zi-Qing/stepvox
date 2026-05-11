# StepVox

Voice-first assistant living inside Obsidian. Converts spoken language into vault operations through an LLM agent loop.

## Language

### Pipeline & Flow

**VoicePipeline**:
The end-to-end controller that owns the state machine (idle → listening → transcribing → thinking → speaking). Coordinates all other components.
_Avoid_: Controller, Manager, Handler

**PipelineState**:
One of: `idle`, `listening`, `transcribing`, `thinking`, `speaking`. Exactly one state active at any time. Transitions are deterministic.
_Avoid_: Status, Mode

**Session Mode**:
Continuous conversation mode where the pipeline automatically restarts listening after each response until manually stopped. Contrasts with single-turn mode where each interaction requires manual activation.
_Avoid_: Continuous mode, Auto mode, Loop mode

**Session Flow**:
The complete lifecycle of a Session Mode interaction:
1. User clicks mic → session starts
2. ASR + VAD activate → user speaks → VAD detects speech end → ASR stops
3. LLM processes + tool execution
   - Tool progress messages ("正在搜索...") → TTS only, no ASR restart
   - Final response (needs user feedback) → TTS then ASR restart
4. Loop steps 2-3 until user clicks mic again
5. Mic click during session → terminate all activities → session ends
6. Next mic click → new session begins

**VAD (Voice Activity Detection)**:
Client-side speech boundary detection with dual timeout modes:
- **ASR mode**: 500ms silence threshold → stops ASR when user finishes speaking
- **Idle mode**: 5s inactivity threshold → closes session when no speech/tasks
Switches between modes based on pipeline state. Tracks `lastActivityTime` refreshed on: speech detected, tool starts, TTS starts.
_Avoid_: Speech detector, Silence detector

**Barge-in**:
Mechanism allowing user to interrupt TTS playback by speaking. When VAD detects speech start during `speaking` state, immediately stops TTS and activates ASR. Enables natural conversation flow.
_Avoid_: Interruption, Override, Cut-in

**Exit Intent Detection**:
Two-stage process for handling session exit requests:
1. Keyword detection: Check if user input contains exit keywords ("退出", "结束", "停止", "exit", "stop", "quit")
2. LLM judgment: If keywords found, ask LLM to determine if user truly intends to exit the session
Prevents false positives (e.g., "如何停止服务" or "退出这个话题" won't trigger exit).
_Avoid_: Exit detection, Quit handler

**Interaction Mode**:
How the user activates voice input. Either `push-to-talk` (hold key) or `wake-word` (say "Hey Vox").
_Avoid_: Input mode, Trigger mode

### Agent & Reasoning

**AgentOrchestrator**:
The LLM reasoning loop. Receives user text, sends to LLM with tools, executes tool calls, feeds results back, repeats until LLM produces a final response. Max 5 iterations.
_Avoid_: Agent, Brain, Executor

**Intent Group**:
A category of user intent determined by keyword matching: Query, Mutate, Dangerous, System. Each group maps to a subset of tools.
_Avoid_: Tool category, Action type, Command group

**Intent Router**:
Local keyword-based classifier that runs before the LLM call. Matches user input to one or more Intent Groups, returns the union of their tool subsets. Falls back to full tool set on no match.
_Avoid_: Classifier, Dispatcher, Tool selector

**Tool**:
A single atomic operation the LLM can invoke via function calling. Has a name, parameters schema, and description. Executed by ToolExecutor.
_Avoid_: Command, Action, Function

**Tool Subset**:
The filtered list of Tool definitions sent to the LLM for a given request. Determined by Intent Router. Smaller subsets improve selection accuracy.
_Avoid_: Tool list, Available tools

**ToolExecutor**:
Receives a ToolCall from the LLM, validates permissions by layer, executes against Obsidian API, returns a ToolResult.
_Avoid_: Command executor, Tool runner

**Tool Layer**:
Permission classification for a tool: `query` (always allowed), `mutate` (allowed with intent), `dangerous` (requires explicit user confirmation), `system` (internal state operations).
_Avoid_: Permission level, Access tier

### Events & Feedback

**Partial Content**:
Text the LLM returns alongside tool_calls (before the final response). Represents a natural-language status update generated dynamically by the LLM (e.g., "正在帮你搜索..."). Immediately sent to TTS.
_Avoid_: Intermediate response, Status message, Progress text

**Event (assistant:partial)**:
Emitted when the LLM produces Partial Content. UI/TTS layer subscribes to play it immediately without waiting for the loop to finish.
_Avoid_: Callback, Hook, Notification

**Event (tool:slow)**:
Emitted when a tool execution exceeds 3 seconds. Signals that the user should receive feedback about the ongoing operation.
_Avoid_: Timeout event, Long-running notification

### Memory

**Short-term Memory**:
The conversation history held in RAM for the current session. Not truncated by the plugin — relies on the model's context window. Cleared on session end or user request.
_Avoid_: Context, History buffer, Chat log

**Long-term Memory**:
User preferences and habits persisted to disk (plugin data directory). Only stores information the LLM cannot derive from the vault. NOT for vault structure or file content.
_Avoid_: Knowledge base, User profile, Persistent state

### Providers

**Provider**:
An interface implementation for an external service. Four types: ASRProvider, TTSProvider, LLMProvider, SearchProvider. Each is replaceable independently.
_Avoid_: Service, Client, Adapter

**SearchProvider**:
External web search service (Tavily or Exa). Returns full page content for research-and-record workflows.
_Avoid_: Web client, Research tool

### Vault Operations

**Focus Directory**:
~~The implicit working directory that determined which files were injected into context.~~ Removed (D34). Users specify paths explicitly or LLM navigates via list_files.
_Avoid_: Working directory, Current folder

## Relationships

- A **VoicePipeline** owns exactly one **AgentOrchestrator**
- An **AgentOrchestrator** uses one **LLMProvider** and one **ToolExecutor**
- The **Intent Router** runs before each **AgentOrchestrator** loop iteration, producing a **Tool Subset**
- A **Tool Subset** contains tools from one or more **Intent Groups**
- **ToolExecutor** checks **Tool Layer** before executing any **Tool**
- **Partial Content** is emitted as an **Event (assistant:partial)** and sent to **TTSProvider**
- **Long-term Memory** is accessed only via tools (read_memory, update_memory), never injected into system prompt
- A **SearchProvider** is invoked by the `web_search` tool, which belongs to the Query **Intent Group**
- **Session Mode** controls the **Session Flow**, which determines when **ASR** and **VAD** are activated
- **VAD** operates in two modes: ASR mode (500ms threshold) when listening, Idle mode (5s threshold) when no tasks active
- **Barge-in** is triggered by **VAD** detecting speech during **PipelineState** = `speaking`, stops **TTSProvider** and activates **ASRProvider**
- **Exit Intent Detection** uses keyword matching followed by **LLMProvider** judgment to determine session termination

## Example dialogue

> **Dev:** "When the user says '帮我查一下 React 的最新文档然后记到笔记里', what happens?"
> **Domain expert:** "The **Intent Router** matches both Query ('查') and Mutate ('记') keywords, so the **Tool Subset** is the union of both groups. The **AgentOrchestrator** sends this subset to the LLM. The LLM first returns **Partial Content** ('正在搜索...') plus a `web_search` tool call. The **Partial Content** plays via TTS immediately. After search completes, the LLM calls `create_file` to write the note, then produces a final spoken summary."

> **Dev:** "What if the Intent Router misses the keywords entirely?"
> **Domain expert:** "Fallback — the full tool set is sent. The LLM still picks correctly, just with slightly lower accuracy due to more options. It's graceful degradation, not failure."

> **Dev:** "In Session Mode, what happens when the user starts speaking while the assistant is still talking?"
> **Domain expert:** "**Barge-in** activates. **VAD** detects speech start, immediately stops **TTSProvider**, and activates **ASRProvider**. The user's new input is captured without waiting for the previous response to finish. This enables natural conversation flow."

> **Dev:** "How does VAD know when to close the ASR vs when to close the entire session?"
> **Domain expert:** "**VAD** operates in two modes. In ASR mode (when user is speaking), 500ms silence closes the ASR. After ASR stops, **VAD** switches to Idle mode with a 5s threshold. If no speech or tasks occur for 5s, the session closes. The `lastActivityTime` is refreshed whenever speech is detected, tools start, or TTS begins."

> **Dev:** "What if the user says '我想退出这个话题' — will that exit the session?"
> **Domain expert:** "No. **Exit Intent Detection** first detects the keyword '退出', then asks the **LLMProvider** to judge intent. The LLM understands '退出这个话题' means changing topics, not exiting the session, so it returns '否' and the session continues."

## Flagged ambiguities

- "tool" vs "command" — resolved: we use **Tool** exclusively. "Command" is reserved for Obsidian's internal command palette (`app.commands`).
- "memory" — resolved: always qualified as **Short-term Memory** or **Long-term Memory**. Unqualified "memory" is ambiguous.
- "context" — resolved: in system prompt discussions, means "information injected into the LLM request." In code, means Obsidian's `metadataCache` context. Always specify which.
- "focus" — resolved: concept removed (D34). If someone says "focus", ask what they mean.
