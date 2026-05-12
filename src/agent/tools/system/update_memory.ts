import { TFile } from "obsidian";
import type { Tool } from "../types";

export const updateMemory: Tool = {
  name: "update_memory",
  layer: "system",
  description:
    "Write to long-term memory. Use when you discover user habits or preferences worth remembering.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "Memory content to store" },
    },
    required: ["content"],
  },
  async execute(args, ctx) {
    const content = args.content as string;
    const path = `${ctx.pluginDataDir}/memory/memory.md`;
    const file = ctx.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await ctx.app.vault.modify(file, content);
    } else {
      await ctx.app.vault.create(path, content);
    }
    return "Memory updated.";
  },
};
