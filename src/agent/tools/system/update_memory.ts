import { TFile } from "obsidian";
import type { Tool } from "../types";
import type { MemoryStore } from "../../memory-types";
import { EMPTY_STORE } from "../../memory-types";
import { applyMemoryAction } from "../../memory-helpers";

export const updateMemory: Tool = {
  name: "update_memory",
  layer: "system",
  description:
    "Add or remove structured long-term memory entries. Categories: preferences (user habits/corrections), facts (paths, names, recurring info), interactions (session summaries).",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "remove"],
        description: "Whether to add/upsert or remove an entry.",
      },
      category: {
        type: "string",
        enum: ["preferences", "facts", "interactions"],
        description: "Memory category.",
      },
      key: {
        type: "string",
        description: "Identifier for preferences/facts entries.",
      },
      value: {
        type: "string",
        description: "Content for preferences/facts entries.",
      },
      summary: {
        type: "string",
        description: "Summary text for interactions entries.",
      },
    },
    required: ["action", "category"],
  },
  async execute(args, ctx) {
    const path = `${ctx.pluginDataDir}/memory/memory.json`;
    let store: MemoryStore;

    const file = ctx.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      try {
        store = JSON.parse(await ctx.app.vault.cachedRead(file));
      } catch {
        store = structuredClone(EMPTY_STORE);
      }
    } else {
      store = structuredClone(EMPTY_STORE);
    }

    const updated = applyMemoryAction(store, {
      action: args.action as "add" | "remove",
      category: args.category as "preferences" | "facts" | "interactions",
      key: args.key as string | undefined,
      value: args.value as string | undefined,
      summary: args.summary as string | undefined,
    });

    const json = JSON.stringify(updated, null, 2);
    if (file instanceof TFile) {
      await ctx.app.vault.process(file, () => json);
    } else {
      await ctx.app.vault.create(path, json);
    }

    return "Memory updated.";
  },
};
