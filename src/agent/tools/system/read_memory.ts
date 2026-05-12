import { TFile } from "obsidian";
import type { Tool } from "../types";

export const readMemory: Tool = {
  name: "read_memory",
  layer: "system",
  description: "Read long-term memory (user habits, preferences, project context).",
  parameters: { type: "object", properties: {} },
  async execute(_args, ctx) {
    const path = `${ctx.pluginDataDir}/memory/memory.md`;
    const file = ctx.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "No memory stored yet.";
    return ctx.app.vault.cachedRead(file);
  },
};
