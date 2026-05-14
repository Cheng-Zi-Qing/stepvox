import type { LLMProvider, LLMMessage, ToolCall } from "../providers";
import type { ToolExecutor } from "./tool-executor";
import { debugLog } from "../utils/debug-logger";

const EXTRACTION_PROMPT = `From the conversation below, extract information worth remembering long-term.
Categorize as:
- preferences: user corrections or habits (e.g. "don't use formal language", "always search in Projects/")
- facts: long-term facts like paths, names, project info
- interactions: what you did this session — one-line summary

Call update_memory for each item worth remembering. If nothing is worth remembering, do nothing.
Be selective — only store things that will be useful in future sessions.`;

const MEMORY_TOOL_DEF = {
  name: "update_memory",
  description: "Add a memory entry.",
  parameters: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["add", "remove"] },
      category: { type: "string", enum: ["preferences", "facts", "interactions"] },
      key: { type: "string", description: "Identifier for preferences/facts" },
      value: { type: "string", description: "Content for preferences/facts" },
      summary: { type: "string", description: "Summary for interactions" },
    },
    required: ["action", "category"],
  },
};

export async function extractSessionMemory(
  history: readonly LLMMessage[],
  provider: LLMProvider,
  toolExecutor: ToolExecutor,
): Promise<void> {
  if (history.length < 2) return;

  const conversationText = history
    .map((m) => `${m.role}: ${m.content ?? ""}`)
    .join("\n");

  const messages: LLMMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: conversationText },
  ];

  try {
    const response = await provider.chat({
      messages,
      tools: [MEMORY_TOOL_DEF],
    });

    if (response.toolCalls.length === 0) {
      debugLog("MEMORY", "extraction: nothing worth remembering");
      return;
    }

    for (const call of response.toolCalls) {
      if (call.name === "update_memory") {
        try {
          await toolExecutor.execute(call);
          debugLog("MEMORY", `extracted: ${call.args.category}/${call.args.key ?? call.args.summary}`);
        } catch (err) {
          debugLog("MEMORY", `extraction tool error: ${err}`);
        }
      }
    }
  } catch (err) {
    debugLog("MEMORY", `extraction LLM call failed: ${err}`);
  }
}
