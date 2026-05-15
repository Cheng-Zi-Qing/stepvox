import { normalizePath } from "obsidian";
import type { Tool } from "../types";

export const createFolder: Tool = {
  name: "create_folder",
  layer: "write",
  description:
    "Create a new folder in the vault. Use when the user asks to organize notes into a new directory, or before create_file when the target folder does not exist yet. Succeeds silently if the folder already exists.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Folder path to create (e.g. 'projects/2026')" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const resolved = normalizePath(args.path as string);
    const existing = ctx.app.vault.getAbstractFileByPath(resolved);
    if (existing) return `Folder already exists: ${resolved}`;
    await ctx.app.vault.createFolder(resolved);
    return `Created folder: ${resolved}`;
  },
};
