import { TFile } from "obsidian";
import type { Tool } from "../types";
import type { MemoryStore } from "../../memory-types";
import { formatMemoryForDisplay } from "../../memory-helpers";

export const readMemory: Tool = {
  name: "read_memory",
  layer: "system",
  description: "Read long-term memory (user habits, preferences, project context).",
  parameters: { type: "object", properties: {} },
  async execute(_args, ctx) {
    const path = `${ctx.pluginDataDir}/memory/memory.json`;
    const file = ctx.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "No memory stored yet.";
    try {
      const raw = await ctx.app.vault.cachedRead(file);
      const store: MemoryStore = JSON.parse(raw);
      return formatMemoryForDisplay(store);
    } catch {
      return "No memory stored yet.";
    }
  },
};
