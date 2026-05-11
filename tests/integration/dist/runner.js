"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/agent/tools.ts
function getToolLayer(name) {
  return TOOL_LAYERS[name] ?? "dangerous";
}
var TOOL_DEFINITIONS, TOOL_LAYERS;
var init_tools = __esm({
  "src/agent/tools.ts"() {
    "use strict";
    TOOL_DEFINITIONS = [
      {
        name: "read_file",
        description: "Read the content of a note in the vault",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to vault root" }
          },
          required: ["path"]
        }
      },
      {
        name: "search",
        description: "Full-text search across the vault",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default 10)" }
          },
          required: ["query"]
        }
      },
      {
        name: "list_files",
        description: "List files in a directory",
        parameters: {
          type: "object",
          properties: {
            folder: { type: "string", description: "Folder path (default: vault root)" }
          }
        }
      },
      {
        name: "get_properties",
        description: "Get frontmatter properties of a note",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to vault root" }
          },
          required: ["path"]
        }
      },
      {
        name: "create_file",
        description: "Create a new note",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to create" },
            content: { type: "string", description: "File content" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "append",
        description: "Append content to the end of a note",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            content: { type: "string", description: "Content to append" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "prepend",
        description: "Prepend content to the beginning of a note (after frontmatter)",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            content: { type: "string", description: "Content to prepend" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "update_content",
        description: "Find and replace text in a note. Use this when the user asks to change, replace, or modify specific text in a file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path (without .md extension)" },
            old_text: { type: "string", description: "Exact text to find in the file" },
            new_text: { type: "string", description: "Text to replace it with" }
          },
          required: ["path", "old_text", "new_text"]
        }
      },
      {
        name: "set_property",
        description: "Set a frontmatter property on a note",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            key: { type: "string", description: "Property name" },
            value: { type: "string", description: "Property value" }
          },
          required: ["path", "key", "value"]
        }
      },
      {
        name: "open_file",
        description: "Open a note in the editor",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" }
          },
          required: ["path"]
        }
      },
      {
        name: "web_search",
        description: "Search the web for current information. Use when user asks about external content, recent events, or anything not in the vault.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" }
          },
          required: ["query"]
        }
      },
      {
        name: "read_memory",
        description: "Read long-term memory (user habits, preferences, project context)",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "update_memory",
        description: "Write to long-term memory. Use when you discover user habits or preferences worth remembering.",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Memory content to store" }
          },
          required: ["content"]
        }
      }
    ];
    TOOL_LAYERS = {
      read_file: "read",
      search: "read",
      list_files: "read",
      get_properties: "read",
      create_file: "write",
      append: "write",
      prepend: "write",
      update_content: "write",
      set_property: "write",
      open_file: "write",
      web_search: "read",
      read_memory: "system",
      update_memory: "system"
    };
  }
});

// src/agent/route.ts
function routeTools(input) {
  const matched = /* @__PURE__ */ new Set();
  for (const kw of QUERY_KEYWORDS) {
    if (input.includes(kw)) {
      QUERY_TOOLS.forEach((t) => matched.add(t));
      break;
    }
  }
  for (const kw of MUTATE_KEYWORDS) {
    if (input.includes(kw)) {
      MUTATE_TOOLS.forEach((t) => matched.add(t));
      break;
    }
  }
  for (const kw of EXTERNAL_KEYWORDS) {
    if (input.includes(kw)) {
      EXTERNAL_TOOLS.forEach((t) => matched.add(t));
      break;
    }
  }
  ALWAYS_TOOLS.forEach((t) => matched.add(t));
  return TOOL_DEFINITIONS.filter((t) => matched.has(t.name));
}
var QUERY_KEYWORDS, MUTATE_KEYWORDS, EXTERNAL_KEYWORDS, QUERY_TOOLS, MUTATE_TOOLS, EXTERNAL_TOOLS, ALWAYS_TOOLS;
var init_route = __esm({
  "src/agent/route.ts"() {
    "use strict";
    init_tools();
    QUERY_KEYWORDS = ["\u8BFB", "\u770B", "\u67E5", "\u627E", "\u6709\u4EC0\u4E48", "\u54EA\u4E9B", "\u663E\u793A", "\u5217\u51FA", "\u5F53\u524D", "\u6253\u5F00", "\u662F\u4EC0\u4E48", "\u5185\u5BB9"];
    MUTATE_KEYWORDS = ["\u5199", "\u5EFA", "\u521B\u5EFA", "\u6539", "\u66F4\u65B0", "\u52A0", "\u6DFB\u52A0", "\u8BB0", "\u4FEE\u6539", "\u5220", "\u79FB\u52A8", "\u91CD\u547D\u540D", "\u65B0\u5EFA"];
    EXTERNAL_KEYWORDS = ["\u7F51\u4E0A", "\u641C\u4E00\u4E0B", "\u67E5\u4E00\u4E0B", "\u7F51\u7EDC", "\u4E92\u8054\u7F51", "\u4E0A\u7F51\u67E5", "\u7F51\u4E0A\u67E5"];
    QUERY_TOOLS = /* @__PURE__ */ new Set(["read_file", "list_files", "search", "get_properties", "open_file"]);
    MUTATE_TOOLS = /* @__PURE__ */ new Set(["create_file", "append", "prepend", "update_content", "set_property"]);
    EXTERNAL_TOOLS = /* @__PURE__ */ new Set(["web_search"]);
    ALWAYS_TOOLS = /* @__PURE__ */ new Set(["read_memory", "update_memory"]);
  }
});

// src/utils/debug-logger.ts
function debugLog(category, message, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const dataStr = data !== void 0 ? ` ${JSON.stringify(data)}` : "";
  const line = `[${timestamp}] [${category}] ${message}${dataStr}
`;
  console.log(`[${category}] ${message}`, data ?? "");
  if (!app) return;
  const currentApp = app;
  writeChain = writeChain.then(async () => {
    try {
      const adapter = currentApp.vault.adapter;
      if (await adapter.exists(LOG_PATH)) {
        await adapter.append(LOG_PATH, line);
      } else {
        await adapter.write(LOG_PATH, line);
      }
    } catch {
    }
  });
}
var app, LOG_PATH, writeChain;
var init_debug_logger = __esm({
  "src/utils/debug-logger.ts"() {
    "use strict";
    app = null;
    LOG_PATH = ".obsidian/plugins/stepvox/debug.log";
    writeChain = Promise.resolve();
  }
});

// src/agent/orchestrator.ts
var orchestrator_exports = {};
__export(orchestrator_exports, {
  AgentOrchestrator: () => AgentOrchestrator,
  _internal: () => _internal
});
function pickApology() {
  return APOLOGY_FALLBACKS[Math.floor(Math.random() * APOLOGY_FALLBACKS.length)];
}
function summarizeResults(results) {
  return results.map((r) => r.success ? `ok` : `fail: ${r.content}`);
}
var LLM_TIMEOUT_MS, TOOL_PHASE_TIMEOUT_MS, WEB_SEARCH_TIMEOUT_MS, MAX_ROUNDS, SLOW_TOOL_THRESHOLD_MS, MEMORY_HINT_INTERVAL, MAX_HISTORY_MESSAGES, APOLOGY_FALLBACKS, AgentOrchestrator, _internal;
var init_orchestrator = __esm({
  "src/agent/orchestrator.ts"() {
    "use strict";
    init_route();
    init_debug_logger();
    LLM_TIMEOUT_MS = 1e4;
    TOOL_PHASE_TIMEOUT_MS = 12e3;
    WEB_SEARCH_TIMEOUT_MS = 8e3;
    MAX_ROUNDS = 3;
    SLOW_TOOL_THRESHOLD_MS = 3e3;
    MEMORY_HINT_INTERVAL = 10;
    MAX_HISTORY_MESSAGES = 20;
    APOLOGY_FALLBACKS = [
      "\u62B1\u6B49\uFF0C\u6211\u8FD9\u8FB9\u51FA\u4E86\u70B9\u5C0F\u95EE\u9898\uFF0C\u4F60\u80FD\u518D\u8BF4\u4E00\u904D\u5417\uFF1F",
      "\u4E0D\u597D\u610F\u601D\uFF0C\u521A\u624D\u6CA1\u5904\u7406\u597D\uFF0C\u53EF\u4EE5\u518D\u8BD5\u4E00\u6B21\u5417\uFF1F",
      "\u7CDF\u7CD5\uFF0C\u6211\u5361\u4F4F\u4E86\u3002\u6362\u4E2A\u8BF4\u6CD5\u518D\u8BD5\u8BD5\uFF1F",
      "\u62B1\u6B49\uFF0C\u8FD9\u6B21\u6CA1\u641E\u5B9A\uFF0C\u80FD\u4E0D\u80FD\u91CD\u65B0\u8BF4\u4E00\u4E0B\uFF1F",
      "\u55EF\u2026\u2026\u597D\u50CF\u6709\u70B9\u6545\u969C\uFF0C\u9EBB\u70E6\u518D\u8BB2\u4E00\u6B21\u3002"
    ];
    AgentOrchestrator = class {
      constructor(opts) {
        this.history = [];
        this.roundCount = 0;
        this.abortController = null;
        this.interrupted = false;
        this.provider = opts.provider;
        this.toolExecutor = opts.toolExecutor;
        this.systemPromptBuilder = opts.systemPromptBuilder;
      }
      async run(userInput, callbacks) {
        this.interrupted = false;
        this.roundCount++;
        this.history.push({ role: "user", content: userInput });
        const messages = this.buildMessages();
        const tools = routeTools(userInput);
        let actionsTaken = [];
        const r1 = await this.callLLM(messages, tools);
        if (this.interrupted) return "";
        if (r1.error) {
          return this.finalize(pickApology());
        }
        if (r1.response.toolCalls.length === 0) {
          const final2 = r1.response.content ?? pickApology();
          return this.finalize(final2);
        }
        if (r1.response.content) callbacks?.onPartial?.(r1.response.content);
        messages.push({
          role: "assistant",
          content: r1.response.content,
          tool_calls: r1.response.toolCalls
        });
        const r1Results = await this.runToolPhase(r1.response.toolCalls, callbacks);
        if (this.interrupted) return "";
        this.pushToolResults(messages, r1Results);
        actionsTaken.push(...summarizeResults(r1Results));
        const r2 = await this.callLLM(messages, tools);
        if (this.interrupted) return "";
        if (r2.error) {
          return this.finalize(pickApology(), actionsTaken);
        }
        if (r2.response.toolCalls.length === 0) {
          const final2 = r2.response.content ?? pickApology();
          return this.finalize(final2, actionsTaken);
        }
        if (r2.response.content) callbacks?.onPartial?.(r2.response.content);
        messages.push({
          role: "assistant",
          content: r2.response.content,
          tool_calls: r2.response.toolCalls
        });
        const r2Results = await this.runToolPhase(r2.response.toolCalls, callbacks);
        if (this.interrupted) return "";
        this.pushToolResults(messages, r2Results);
        actionsTaken.push(...summarizeResults(r2Results));
        const r3 = await this.callLLM(messages, []);
        if (this.interrupted) return "";
        const final = !r3.error && r3.response.content ? r3.response.content : pickApology();
        return this.finalize(final, actionsTaken);
      }
      abort() {
        this.interrupted = true;
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }
      clearHistory() {
        this.history = [];
        this.roundCount = 0;
      }
      dispose() {
        if (this.abortController) {
          this.abortController.abort();
        }
        this.history = [];
      }
      // ---------- internals ----------
      finalize(finalContent, _actionsTaken = []) {
        this.history.push({ role: "assistant", content: finalContent });
        this.trimHistory();
        return finalContent;
      }
      async callLLM(messages, tools) {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        const timeoutId = setTimeout(() => {
          this.abortController?.abort();
        }, LLM_TIMEOUT_MS);
        try {
          const response = await this.provider.chat({ messages, tools, signal });
          return { response };
        } catch (err) {
          const reason = signal.aborted ? "timeout/aborted" : err?.message;
          debugLog("LLM", `call failed: ${reason}`);
          return { error: err };
        } finally {
          clearTimeout(timeoutId);
          this.abortController = null;
        }
      }
      /**
       * Execute all toolCalls in parallel (fan-out).
       * - web_search: 8s per-tool timeout
       * - others: no per-tool timeout (local vault ops; 12s phase cap is the safety net)
       * - phase total: 12s — any laggard gets a synthetic timeout result
       * - any failure/timeout is returned verbatim to the LLM (no special handling)
       */
      async runToolPhase(toolCalls, callbacks) {
        if (toolCalls.length === 0) return [];
        callbacks?.onToolStart?.(toolCalls);
        const slowTimers = /* @__PURE__ */ new Map();
        for (const call of toolCalls) {
          const t = setTimeout(() => {
            callbacks?.onToolSlow?.(call.name);
          }, SLOW_TOOL_THRESHOLD_MS);
          slowTimers.set(call.id, t);
        }
        const perCall = toolCalls.map((call) => this.runSingleTool(call, slowTimers));
        const phaseTimeout = new Promise((resolve) => {
          setTimeout(() => {
            const synthetic = toolCalls.map((c) => ({
              id: c.id,
              content: `Error: tool phase exceeded ${TOOL_PHASE_TIMEOUT_MS / 1e3}s timeout`,
              success: false
            }));
            resolve(synthetic);
          }, TOOL_PHASE_TIMEOUT_MS);
        });
        const results = await Promise.race([Promise.all(perCall), phaseTimeout]);
        for (const t of slowTimers.values()) clearTimeout(t);
        return results;
      }
      async runSingleTool(call, slowTimers) {
        const perToolTimeout = call.name === "web_search" ? WEB_SEARCH_TIMEOUT_MS : 0;
        const execPromise = this.toolExecutor.execute(call).then((r) => {
          const t = slowTimers.get(call.id);
          if (t) {
            clearTimeout(t);
            slowTimers.delete(call.id);
          }
          return r;
        });
        if (perToolTimeout === 0) return execPromise;
        return Promise.race([
          execPromise,
          new Promise(
            (resolve) => setTimeout(
              () => resolve({
                id: call.id,
                content: `Error: ${call.name} timed out after ${perToolTimeout / 1e3}s`,
                success: false
              }),
              perToolTimeout
            )
          )
        ]);
      }
      pushToolResults(messages, results) {
        for (const r of results) {
          messages.push({ role: "tool", content: r.content, tool_call_id: r.id });
        }
      }
      buildMessages() {
        let systemPrompt = this.systemPromptBuilder();
        if (this.roundCount % MEMORY_HINT_INTERVAL === 0 && this.roundCount > 0) {
          systemPrompt += `

## Memory Hint
You have interacted with the user for ${this.roundCount} rounds. If you have discovered user habits, preferences, or information worth remembering long-term, call update_memory to record them.`;
        }
        return [{ role: "system", content: systemPrompt }, ...this.history];
      }
      trimHistory() {
        if (this.history.length > MAX_HISTORY_MESSAGES) {
          const removed = this.history.length - MAX_HISTORY_MESSAGES;
          this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
          debugLog("HISTORY", `trimmed ${removed} old messages, keeping last ${MAX_HISTORY_MESSAGES}`);
        }
      }
    };
    _internal = {
      APOLOGY_FALLBACKS,
      LLM_TIMEOUT_MS,
      TOOL_PHASE_TIMEOUT_MS,
      WEB_SEARCH_TIMEOUT_MS,
      MAX_ROUNDS
    };
  }
});

// src/agent/system-prompt.ts
var system_prompt_exports = {};
__export(system_prompt_exports, {
  buildSystemPrompt: () => buildSystemPrompt
});
function buildSystemPrompt(app2) {
  const vaultName = app2.vault.getName();
  const activeFile = app2.workspace.getActiveFile();
  let fileContext = "";
  if (activeFile) {
    fileContext = `- Active file: ${activeFile.path}
`;
  }
  return `You are StepVox, a sharp and witty personal secretary living inside Obsidian.

## Your Capabilities
- You can HEAR the user through speech recognition (ASR)
- You can SPEAK to the user through text-to-speech (TTS)
- You are a voice assistant with full audio input/output capabilities

## Personality
- Efficient: results first, no filler
- Playful: light humor on errors or idle chat, never robotic
- Respond in the same language the user speaks

## Response Length (voice output \u2014 calibrate to intent)
- Chit-chat, confirmation, simple acknowledgement \u2192 1 short sentence
- Action complete (created file, updated property, etc.) \u2192 1 short sentence confirming what was done
- Information retrieval (search results, file content, web research) \u2192 complete the information faithfully; do not truncate key facts, but still prefer plain spoken language over long lists
- The user can interrupt you at any time (Session Mode) \u2014 write responses that are still useful if cut off partway

## Behavior Rules
- User has explicit action intent (create/modify/delete/record/append) \u2192 invoke tools
- User asks to READ, VIEW, or CHECK any file/note content \u2192 MUST call read_file. Do NOT answer from context or memory \u2014 always fetch fresh content via tool.
- User asks what files exist or what's in a folder \u2192 MUST call list_files. Do NOT use the directory listing in context.
- User asks about the current/active file \u2192 use the "Active file" path from Current Context below directly. No tool call needed for identifying which file is active.
- User asks to find or search notes \u2192 MUST call search.
- User is discussing or asking general questions (not about vault content) \u2192 respond only, no tool calls
- High-risk operations (delete/move/rename) \u2192 confirm in response first, execute next turn
- Writing tasks (write doc, write note, write report, \u5199\u6587\u6863/\u5199\u7B14\u8BB0/\u5199\u62A5\u544A/\u8D77\u8349/\u64B0\u5199) \u2192 ask ONE clarifying question first before writing: what is the purpose, who is the audience, what format/length, or what key points to cover. Pick the most important unknown. Only one question per turn.
- When uncertain about vault state: use read_file or search to gather info, then answer
- **CRITICAL: When calling tools, you MUST include text content alongside tool_calls** (e.g., "\u597D\u7684\uFF0C\u6211\u6765\u5E2E\u4F60\u641C\u7D22", "\u8BA9\u6211\u67E5\u4E00\u4E0B\u6587\u4EF6\u5185\u5BB9", "\u6211\u6765\u521B\u5EFA\u8FD9\u4E2A\u6587\u4EF6"). This text will be spoken to the user immediately via TTS while the tool executes, providing instant feedback. NEVER return tool_calls without accompanying text.
- Tools may fail or time out \u2014 when a tool result contains "Error:" or "Timeout:", tell the user in plain language what went wrong, and suggest a next step. Do not retry silently.
- NEVER invent or assume file contents. Even if context shows file info, you MUST call the appropriate tool to get authoritative data.
- IMPORTANT: Avoid markdown formatting in responses (no *, **, _, __, etc.) \u2014 your response will be read aloud by TTS. Use plain text only.

## Current Context
- Vault: ${vaultName}
${fileContext}`;
}
var init_system_prompt = __esm({
  "src/agent/system-prompt.ts"() {
    "use strict";
  }
});

// src/providers/llm/openai.ts
var OpenAIProvider;
var init_openai = __esm({
  "src/providers/llm/openai.ts"() {
    "use strict";
    OpenAIProvider = class {
      constructor(endpoint, apiKey, model, temperature) {
        this.id = "openai-provider";
        this.name = "OpenAI Compatible Provider";
        this.config = { endpoint, apiKey, model, temperature };
        this.chatURL = this.buildChatURL(endpoint);
      }
      async chat(request) {
        const apiMessages = request.messages.map((msg2) => {
          const apiMsg = {
            role: msg2.role,
            content: msg2.content
          };
          if (msg2.tool_calls && msg2.tool_calls.length > 0) {
            apiMsg.tool_calls = msg2.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args)
              }
            }));
          }
          if (msg2.tool_call_id) {
            apiMsg.tool_call_id = msg2.tool_call_id;
          }
          return apiMsg;
        });
        const body = {
          model: this.config.model,
          messages: apiMessages,
          temperature: this.config.temperature
        };
        if (request.tools?.length) {
          body.tools = request.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }));
        }
        const response = await fetch(this.chatURL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: request.signal
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`OpenAI API error (${response.status}): ${text}`);
        }
        const data = await response.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) {
          throw new Error("LLM response missing message");
        }
        const toolCalls = (msg.tool_calls ?? []).map(
          (tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments)
          })
        );
        return {
          content: msg.content ?? null,
          toolCalls
        };
      }
      async validate() {
        try {
          await this.chat({
            messages: [{ role: "user", content: "hi" }]
          });
          return true;
        } catch {
          return false;
        }
      }
      dispose() {
      }
      buildChatURL(endpoint) {
        const url = endpoint.trim().replace(/\/+$/, "");
        if (/\/chat\/completions?$/.test(url)) {
          return url;
        }
        const base = url.endsWith("/v1") ? url : `${url}/v1`;
        return `${base}/chat/completions`;
      }
    };
  }
});

// src/providers/llm/anthropic.ts
var AnthropicProvider;
var init_anthropic = __esm({
  "src/providers/llm/anthropic.ts"() {
    "use strict";
    AnthropicProvider = class {
      constructor(endpoint, apiKey, model, temperature) {
        this.id = "anthropic-provider";
        this.name = "Anthropic Provider";
        const base = endpoint.trim().replace(/\/+$/, "");
        const normalized = base.endsWith("/v1") ? base : `${base}/v1`;
        this.config = { endpoint: normalized, apiKey, model, temperature };
      }
      async chat(request) {
        const url = `${this.config.endpoint}/messages`;
        const systemParts = [];
        const convoMessages = request.messages.filter((m) => {
          if (m.role === "system") {
            if (m.content) systemParts.push(m.content);
            return false;
          }
          return true;
        });
        const body = {
          model: this.config.model,
          messages: convoMessages,
          temperature: this.config.temperature,
          max_tokens: 4096
        };
        if (systemParts.length > 0) {
          body.system = systemParts.join("\n\n");
        }
        if (request.tools?.length) {
          body.tools = request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
          }));
        }
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(body),
          signal: request.signal
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`Anthropic API error (${response.status}): ${text}`);
        }
        const data = await response.json();
        const textContent = data.content?.find((c) => c.type === "text")?.text ?? null;
        const toolUses = data.content?.filter((c) => c.type === "tool_use") ?? [];
        const toolCalls = toolUses.map((tu) => ({
          id: tu.id,
          name: tu.name,
          args: tu.input
        }));
        return {
          content: textContent,
          toolCalls
        };
      }
      async validate() {
        try {
          await this.chat({
            messages: [{ role: "user", content: "hi" }]
          });
          return true;
        } catch {
          return false;
        }
      }
      dispose() {
      }
    };
  }
});

// src/utils/endpoint.ts
function getStepFunEndpoint(region, mode, service) {
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  return `https://api.${domain}/${prefix}v1/${service}`;
}
function getChatEndpoint(region, mode) {
  return getStepFunEndpoint(region, mode, "chat/completions");
}
var init_endpoint = __esm({
  "src/utils/endpoint.ts"() {
    "use strict";
  }
});

// src/providers/llm/factory.ts
var factory_exports = {};
__export(factory_exports, {
  createLLMProvider: () => createLLMProvider
});
function createLLMProvider(settings) {
  const { llm, stepfun } = settings;
  switch (llm.provider) {
    case "stepfun": {
      const endpoint = getChatEndpoint(stepfun.region, llm.stepfunMode);
      return new OpenAIProvider(endpoint, stepfun.apiKey, llm.model, llm.temperature);
    }
    case "openai": {
      const endpoint = "https://api.openai.com/v1";
      return new OpenAIProvider(endpoint, llm.apiKey, llm.model, llm.temperature);
    }
    case "anthropic": {
      const endpoint = "https://api.anthropic.com";
      return new AnthropicProvider(endpoint, llm.apiKey, llm.model, llm.temperature);
    }
    case "custom": {
      return new OpenAIProvider(llm.endpoint, llm.apiKey, llm.model, llm.temperature);
    }
    default:
      throw new Error(`Unknown LLM provider: ${llm.provider}`);
  }
}
var init_factory = __esm({
  "src/providers/llm/factory.ts"() {
    "use strict";
    init_openai();
    init_anthropic();
    init_endpoint();
  }
});

// src/providers/search.ts
var search_exports = {};
__export(search_exports, {
  ExaProvider: () => ExaProvider,
  TavilyProvider: () => TavilyProvider
});
var import_obsidian2, TavilyProvider, ExaProvider;
var init_search = __esm({
  "src/providers/search.ts"() {
    "use strict";
    import_obsidian2 = require("obsidian");
    TavilyProvider = class {
      constructor(apiKey) {
        this.apiKey = apiKey;
      }
      async search(query) {
        try {
          const resp = await (0, import_obsidian2.requestUrl)({
            url: "https://api.tavily.com/search",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: this.apiKey,
              query,
              include_raw_content: true,
              max_results: 5
            })
          });
          const data = resp.json;
          return (data.results ?? []).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.raw_content ?? r.content ?? ""
          }));
        } catch (err) {
          throw new Error(`Tavily search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    ExaProvider = class {
      constructor(apiKey) {
        this.apiKey = apiKey;
      }
      async search(query) {
        try {
          const resp = await (0, import_obsidian2.requestUrl)({
            url: "https://api.exa.ai/search",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey
            },
            body: JSON.stringify({
              query,
              contents: { text: true },
              numResults: 5
            })
          });
          const data = resp.json;
          return (data.results ?? []).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.text ?? ""
          }));
        } catch (err) {
          throw new Error(`Exa search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
  }
});

// tests/integration/runner.ts
var runner_exports = {};
__export(runner_exports, {
  runIntegrationTests: () => runIntegrationTests,
  runWebSearchTest: () => runWebSearchTest
});
module.exports = __toCommonJS(runner_exports);

// src/agent/tool-executor.ts
var import_obsidian = require("obsidian");
init_tools();
var ToolExecutor = class {
  constructor(app2, memoryDir) {
    this.searchProvider = null;
    this.app = app2;
    this.memoryDir = memoryDir;
  }
  setSearchProvider(provider) {
    this.searchProvider = provider;
  }
  async execute(call) {
    const layer = getToolLayer(call.name);
    if (layer === "dangerous") {
      return {
        id: call.id,
        content: `Rejected: "${call.name}" requires user confirmation. Ask the user first.`,
        success: false
      };
    }
    try {
      const content = await this.dispatch(call.name, call.args);
      return { id: call.id, content, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: call.id, content: `Error: ${msg}`, success: false };
    }
  }
  async dispatch(name, args) {
    switch (name) {
      case "read_file":
        return this.readFile(args.path);
      case "search":
        return this.search(args.query, args.limit);
      case "list_files":
        return this.listFiles(args.folder);
      case "get_properties":
        return this.getProperties(args.path);
      case "create_file":
        return this.createFile(args.path, args.content);
      case "append":
        return this.appendFile(args.path, args.content);
      case "prepend":
        return this.prependFile(args.path, args.content);
      case "update_content":
        return this.updateContent(
          args.path,
          args.old_text,
          args.new_text
        );
      case "set_property":
        return this.setProperty(
          args.path,
          args.key,
          args.value
        );
      case "open_file":
        return this.openFile(args.path);
      case "read_memory":
        return this.readMemory();
      case "update_memory":
        return this.updateMemory(args.content);
      case "web_search":
        return this.webSearch(args.query);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
  resolveFile(path) {
    let resolved = path;
    if (!resolved.endsWith(".md")) resolved += ".md";
    const file = this.app.vault.getAbstractFileByPath(resolved);
    if (!(file instanceof import_obsidian.TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }
  async readFile(path) {
    const file = this.resolveFile(path);
    const content = await this.app.vault.cachedRead(file);
    if (content.length > 4e3) {
      return content.slice(0, 4e3) + "\n...(truncated)";
    }
    return content;
  }
  async search(query, limit) {
    const max = limit ?? 10;
    const files = this.app.vault.getMarkdownFiles();
    const results = [];
    const lower = query.toLowerCase();
    for (const file of files) {
      if (results.length >= max) break;
      const content = await this.app.vault.cachedRead(file);
      const idx = content.toLowerCase().indexOf(lower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + query.length + 50);
        results.push({
          path: file.path,
          snippet: content.slice(start, end).replace(/\n/g, " ")
        });
      }
    }
    if (results.length === 0) return "No results found.";
    return results.map((r) => `${r.path}: ...${r.snippet}...`).join("\n");
  }
  listFiles(folder) {
    const abstract = folder ? this.app.vault.getAbstractFileByPath(folder) : this.app.vault.getRoot();
    if (!abstract || !(abstract instanceof import_obsidian.TFolder)) {
      return Promise.resolve(`Folder not found: ${folder ?? "(root)"}`);
    }
    const entries = abstract.children.map((c) => c instanceof import_obsidian.TFolder ? `${c.name}/` : c.name).sort();
    return Promise.resolve(entries.join("\n") || "(empty)");
  }
  getProperties(path) {
    const file = this.resolveFile(path);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return Promise.resolve("No frontmatter.");
    return Promise.resolve(JSON.stringify(fm, null, 2));
  }
  async createFile(path, content) {
    let resolved = path;
    if (!resolved.endsWith(".md")) resolved += ".md";
    const existing = this.app.vault.getAbstractFileByPath(resolved);
    if (existing) throw new Error(`File already exists: ${resolved}`);
    await this.app.vault.create(resolved, content);
    return `Created: ${resolved}`;
  }
  async appendFile(path, content) {
    const file = this.resolveFile(path);
    await this.app.vault.append(file, "\n" + content);
    return `Appended to: ${file.path}`;
  }
  async prependFile(path, content) {
    const file = this.resolveFile(path);
    await this.app.vault.process(file, (data) => {
      const fmEnd = this.findFrontmatterEnd(data);
      return data.slice(0, fmEnd) + content + "\n" + data.slice(fmEnd);
    });
    return `Prepended to: ${file.path}`;
  }
  async updateContent(path, oldText, newText) {
    const file = this.resolveFile(path);
    let found = false;
    await this.app.vault.process(file, (data) => {
      if (!data.includes(oldText)) throw new Error("Text not found in file");
      found = true;
      return data.replace(oldText, newText);
    });
    return found ? `Updated: ${file.path}` : "Text not found.";
  }
  async setProperty(path, key, value) {
    const file = this.resolveFile(path);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[key] = value;
    });
    return `Set ${key}=${value} on ${file.path}`;
  }
  async openFile(path) {
    await this.app.workspace.openLinkText(path, "", false);
    return `Opened: ${path}`;
  }
  async readMemory() {
    const path = `${this.memoryDir}/memory.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) return "No memory stored yet.";
    return this.app.vault.cachedRead(file);
  }
  async updateMemory(content) {
    const path = `${this.memoryDir}/memory.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(path, content);
    }
    return "Memory updated.";
  }
  findFrontmatterEnd(data) {
    if (!data.startsWith("---")) return 0;
    const end = data.indexOf("---", 3);
    if (end === -1) return 0;
    return end + 3 + (data[end + 3] === "\n" ? 1 : 0);
  }
  async webSearch(query) {
    if (!this.searchProvider) return "Web search not configured. Please add a search API key in settings.";
    const results = await this.searchProvider.search(query);
    if (results.length === 0) return "No results found.";
    return results.map((r, i) => `[${i + 1}] ${r.title}
${r.url}
${r.content}`).join("\n\n---\n\n");
  }
};

// tests/integration/runner.ts
init_orchestrator();
init_system_prompt();

// tests/integration/helpers.ts
function expectToolCalled(toolLog, name) {
  const found = toolLog.some((c) => c.name === name);
  return {
    pass: found,
    detail: found ? `Tool "${name}" was called` : `Expected tool "${name}" but got: [${toolLog.map((c) => c.name).join(", ")}]`
  };
}
async function expectFileExists(app2, path) {
  const file = app2.vault.getAbstractFileByPath(path);
  return {
    pass: file !== null,
    detail: file ? `File exists: ${path}` : `File not found: ${path}`
  };
}
async function expectFileContains(app2, path, substring) {
  const file = app2.vault.getAbstractFileByPath(path);
  if (!file) return { pass: false, detail: `File not found: ${path}` };
  const content = await app2.vault.cachedRead(file);
  const found = content.includes(substring);
  return {
    pass: found,
    detail: found ? `File contains "${substring}"` : `File does not contain "${substring}". Content: ${content.slice(0, 200)}`
  };
}
function expectResultNotEmpty(result) {
  return {
    pass: result.length > 0,
    detail: result.length > 0 ? `Got response (${result.length} chars)` : "Empty response"
  };
}

// tests/integration/cases.ts
var TEST_DIR = "_stepvox_test";
function buildCases() {
  return [
    // === Read Layer ===
    {
      name: "R1: read_file on existing note",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/sample.md`, "# Sample\nHello world");
      },
      input: `\u8BFB\u4E00\u4E0B ${TEST_DIR}/sample \u7684\u5185\u5BB9`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "read_file");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/sample.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "R3: list_files",
      setup: async (app2) => {
        const existing = app2.vault.getAbstractFileByPath(TEST_DIR);
        if (!existing) await app2.vault.createFolder(TEST_DIR);
        const a = app2.vault.getAbstractFileByPath(`${TEST_DIR}/a.md`);
        if (!a) await app2.vault.create(`${TEST_DIR}/a.md`, "a");
        const b = app2.vault.getAbstractFileByPath(`${TEST_DIR}/b.md`);
        if (!b) await app2.vault.create(`${TEST_DIR}/b.md`, "b");
      },
      input: `${TEST_DIR} \u76EE\u5F55\u4E0B\u6709\u54EA\u4E9B\u6587\u4EF6`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "list_files");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        for (const name of ["a.md", "b.md"]) {
          const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/${name}`);
          if (f) await app2.vault.delete(f);
        }
      }
    },
    {
      name: "R5: active file handled via injected system prompt (no tool needed)",
      setup: async (app2) => {
        const existing = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (!existing) await app2.vault.create(`${TEST_DIR}/active-test.md`, "active file");
        const file = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (file) await app2.workspace.getLeaf().openFile(file);
      },
      input: "\u6211\u73B0\u5728\u6253\u5F00\u7684\u662F\u4EC0\u4E48\u6587\u4EF6",
      assert: async (result, _app, toolLog) => {
        const mentionsFile = result.toLowerCase().includes("active-test");
        if (mentionsFile) return { pass: true, detail: "File mentioned in response (no tool call needed)" };
        return { pass: false, detail: `Response did not mention active file. Tools: [${toolLog.map((c) => c.name).join(", ")}], response: ${result.slice(0, 80)}` };
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Write Layer ===
    {
      name: "W1: create_file",
      input: `\u5728 ${TEST_DIR} \u76EE\u5F55\u4E0B\u521B\u5EFA\u4E00\u4E2A\u53EB new-note \u7684\u7B14\u8BB0\uFF0C\u5185\u5BB9\u5199 hello world`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "create_file");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/new-note.md`, "hello");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/new-note.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W2: append",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/append-test.md`, "line1");
      },
      input: `\u5728 ${TEST_DIR}/append-test \u672B\u5C3E\u52A0\u4E00\u884C line2`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "append");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/append-test.md`, "line2");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/append-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W3: update_content",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/update-test.md`, "old text here");
      },
      input: `\u628A ${TEST_DIR}/update-test \u91CC\u7684 "old text" \u6539\u6210 "new text"`,
      assert: async (result, app2, toolLog) => {
        const fileResult = await expectFileContains(app2, `${TEST_DIR}/update-test.md`, "new text");
        if (!fileResult.pass) {
          const t = expectToolCalled(toolLog, "update_content");
          if (!t.pass) return { pass: false, detail: `update_content not called. Tools: [${toolLog.map((c) => c.name).join(", ")}]` };
          return fileResult;
        }
        return fileResult;
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/update-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W4: prepend",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/prepend-test.md`, "---\ntitle: Test\n---\noriginal content");
      },
      input: `\u5728 ${TEST_DIR}/prepend-test \u5F00\u5934\u6DFB\u52A0\u4E00\u884C new first line`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "prepend");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/prepend-test.md`, "new first line");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/prepend-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W5: open_file",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/open-test.md`, "test content");
      },
      input: `\u5728\u7F16\u8F91\u5668\u91CC\u6253\u5F00 ${TEST_DIR}/open-test \u8FD9\u4E2A\u6587\u4EF6`,
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "open_file");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/open-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Permission Gate ===
    {
      name: "P1: dangerous tool rejected",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/protected.md`, "do not delete");
      },
      input: `\u5220\u9664 ${TEST_DIR}/protected \u8FD9\u4E2A\u6587\u4EF6`,
      assert: async (result, app2, toolLog) => {
        const fileStillExists = await expectFileExists(app2, `${TEST_DIR}/protected.md`);
        if (!fileStillExists.pass) return fileStillExists;
        const dangerousCalled = toolLog.some(
          (c) => c.name === "delete_file" || c.name === "move_file"
        );
        return {
          pass: !dangerousCalled,
          detail: dangerousCalled ? "Dangerous tool was executed (should have been rejected)" : "Dangerous tool correctly rejected, file preserved"
        };
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/protected.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Edge Cases ===
    {
      name: "E1: read non-existent file",
      input: `\u8BFB\u4E00\u4E0B ${TEST_DIR}/does-not-exist \u7684\u5185\u5BB9`,
      assert: async (result, _app, toolLog) => {
        return expectResultNotEmpty(result);
      }
    },
    {
      name: "E3: casual chat, no vault tools",
      input: "\u4F60\u597D\uFF0C\u7ED9\u6211\u8BB2\u4E2A\u7B11\u8BDD",
      assert: async (result, _app, toolLog) => {
        const vaultTools = toolLog.filter((c) => !["read_memory", "update_memory"].includes(c.name));
        if (vaultTools.length > 0) {
          return { pass: false, detail: `Unexpected vault tools called: [${vaultTools.map((c) => c.name).join(", ")}]` };
        }
        return expectResultNotEmpty(result);
      }
    },
    // === Search ===
    {
      name: "S1: vault search",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/search-target.md`, "unique keyword xyzabc123");
      },
      input: "\u641C\u7D22\u5305\u542B xyzabc123 \u7684\u7B14\u8BB0",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "search");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/search-target.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Properties ===
    {
      name: "P2: set_property",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/prop-test.md`, "---\ntitle: Old\n---\ncontent");
      },
      input: `\u628A ${TEST_DIR}/prop-test \u7684 status \u5C5E\u6027\u8BBE\u4E3A done`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "set_property");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/prop-test.md`, "done");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/prop-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "P3: get_properties",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/getprop-test.md`, "---\ntags: [test]\nauthor: alice\n---\ncontent");
      },
      input: `${TEST_DIR}/getprop-test \u8FD9\u4E2A\u6587\u4EF6\u6709\u54EA\u4E9B\u5C5E\u6027`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "get_properties");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/getprop-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Memory ===
    {
      name: "M1: read_memory",
      input: "\u4F60\u8BB0\u5F97\u6211\u4E4B\u524D\u8BF4\u8FC7\u4EC0\u4E48\u5417",
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "read_memory");
      }
    },
    // === Web Search (requires search provider configured) ===
    {
      name: "WS1: web_search triggered",
      input: "\u5E2E\u6211\u5728\u7F51\u4E0A\u67E5\u4E00\u4E0B Obsidian \u6700\u65B0\u7248\u672C",
      assert: async (result, _app, toolLog) => {
        const called = toolLog.some((c) => c.name === "web_search");
        if (!called) {
          return { pass: false, detail: `web_search not called. Tools: [${toolLog.map((c) => c.name).join(", ")}]` };
        }
        return expectResultNotEmpty(result);
      }
    }
  ];
}

// tests/integration/runner.ts
var TEST_DIR2 = "_stepvox_test";
function createSpyExecutor(app2) {
  const realExecutor = new ToolExecutor(app2, ".obsidian/plugins/stepvox/memory");
  const log = [];
  const originalExecute = realExecutor.execute.bind(realExecutor);
  realExecutor.execute = async (call) => {
    log.push(call);
    return originalExecute(call);
  };
  return {
    executor: realExecutor,
    log,
    reset: () => {
      log.length = 0;
    }
  };
}
async function runIntegrationTests(app2) {
  const results = [];
  const cases = buildCases();
  const plugin = app2.plugins.plugins["stepvox"];
  if (!plugin) {
    return [{ name: "SETUP", pass: false, detail: "StepVox plugin not loaded", duration: 0 }];
  }
  const settings = plugin.settings;
  const { executor, log, reset } = createSpyExecutor(app2);
  const testFolder = app2.vault.getAbstractFileByPath(TEST_DIR2);
  if (!testFolder) {
    await app2.vault.createFolder(TEST_DIR2);
  }
  const { createLLMProvider: createLLMProvider2 } = await Promise.resolve().then(() => (init_factory(), factory_exports));
  const llmProvider = createLLMProvider2(settings);
  for (const tc of cases) {
    reset();
    const start = Date.now();
    try {
      if (tc.setup) await tc.setup(app2);
      const orchestrator = new AgentOrchestrator({
        provider: llmProvider,
        toolExecutor: executor,
        systemPromptBuilder: () => buildSystemPrompt(app2)
      });
      const result = await orchestrator.run(tc.input);
      const assertion = await tc.assert(result ?? "", app2, [...log]);
      results.push({
        name: tc.name,
        pass: assertion.pass,
        detail: assertion.detail,
        duration: Date.now() - start
      });
      orchestrator.dispose();
    } catch (err) {
      results.push({
        name: tc.name,
        pass: false,
        detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
        duration: Date.now() - start
      });
    } finally {
      try {
        if (tc.teardown) await tc.teardown(app2);
      } catch {
      }
    }
  }
  try {
    const folder = app2.vault.getAbstractFileByPath(TEST_DIR2);
    if (folder) await app2.vault.delete(folder, true);
  } catch {
  }
  llmProvider.dispose();
  return results;
}
async function runWebSearchTest(app2) {
  const plugin = app2.plugins.plugins["stepvox"];
  if (!plugin) {
    console.error("[WSTest] StepVox not loaded");
    return;
  }
  const settings = plugin.settings;
  console.log("[WSTest] search.provider:", settings.search?.provider, "| key:", settings.search?.apiKey ? "set" : "EMPTY");
  const { createLLMProvider: createLLMProvider2 } = await Promise.resolve().then(() => (init_factory(), factory_exports));
  const { TavilyProvider: TavilyProvider2, ExaProvider: ExaProvider2 } = await Promise.resolve().then(() => (init_search(), search_exports));
  const llmProvider = createLLMProvider2(settings);
  const realExecutor = new ToolExecutor(app2, ".obsidian/plugins/stepvox/memory");
  const searchProvider = settings.search?.provider === "tavily" ? new TavilyProvider2(settings.search.apiKey) : settings.search?.provider === "exa" ? new ExaProvider2(settings.search.apiKey) : null;
  realExecutor.setSearchProvider(searchProvider);
  console.log("[WSTest] searchProvider:", searchProvider ? searchProvider.constructor.name : "null");
  const toolLog = [];
  const origExecute = realExecutor.execute.bind(realExecutor);
  realExecutor.execute = async (call) => {
    toolLog.push(`execute:${call.name}`);
    console.log(`[WSTest] execute: ${call.name}`, JSON.stringify(call.args).slice(0, 80));
    return origExecute(call);
  };
  const { AgentOrchestrator: AgentOrchestrator2 } = await Promise.resolve().then(() => (init_orchestrator(), orchestrator_exports));
  const { buildSystemPrompt: buildSystemPrompt2 } = await Promise.resolve().then(() => (init_system_prompt(), system_prompt_exports));
  const orchestrator = new AgentOrchestrator2({
    provider: llmProvider,
    toolExecutor: realExecutor,
    systemPromptBuilder: () => buildSystemPrompt2(app2)
  });
  const input = "\u5E2E\u6211\u5728\u7F51\u4E0A\u641C\u7D22\u4E00\u4E0B Obsidian \u6700\u65B0\u7248\u672C\u53F7";
  console.log("[WSTest] input:", input);
  const response = await orchestrator.run(input, {
    onPartial: (t) => console.log("[WSTest] partial:", t.slice(0, 60)),
    onToolStart: (names) => console.log("[WSTest] toolStart:", names),
    onToolSlow: (name) => console.log("[WSTest] toolSlow:", name)
  });
  console.log("[WSTest] final response:", response?.slice(0, 100) || "(empty)");
  console.log("[WSTest] tool log:", toolLog.join(", "));
  orchestrator.dispose();
  llmProvider.dispose();
}
(async () => {
  const app2 = globalThis.app;
  if (!app2) {
    console.error("[StepVox Test] No app found");
    return;
  }
  console.log("[StepVox Test] Starting integration tests...");
  const results = await runIntegrationTests(app2);
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`[${icon}] ${r.name} (${r.duration}ms) \u2014 ${r.detail}`);
    if (r.pass) passed++;
    else failed++;
  }
  console.log(`
[StepVox Test] Done: ${passed} passed, ${failed} failed`);
  globalThis.__stepvoxTestResults = results;
})();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runIntegrationTests,
  runWebSearchTest
});
