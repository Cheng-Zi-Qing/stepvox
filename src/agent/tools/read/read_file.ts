import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

const MAX_BYTES = 4000;

export const readFile: Tool = {
  name: "read_file",
  layer: "read",
  description:
    "Read the full content of a note already in the user's Obsidian vault. Use when the user references a specific note they already have.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to vault root" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const file = resolveFile(ctx.app, path);
    const content = await ctx.app.vault.cachedRead(file);
    if (content.length > MAX_BYTES) {
      return content.slice(0, MAX_BYTES) + "\n...(truncated)";
    }
    return content;
  },
};
