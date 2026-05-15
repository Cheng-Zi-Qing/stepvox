import { normalizePath } from "obsidian";
import type { Tool } from "../types";

export const createFile: Tool = {
  name: "create_file",
  layer: "write",
  description: "Create a new note in the vault.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to create" },
      content: { type: "string", description: "File content" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    let resolved = normalizePath(args.path as string);
    const content = args.content as string;
    if (!resolved.endsWith(".md")) resolved += ".md";
    const existing = ctx.app.vault.getAbstractFileByPath(resolved);
    if (existing) throw new Error(`File already exists: ${resolved}`);
    await ctx.app.vault.create(resolved, content);
    return `Created: ${resolved}`;
  },
};
