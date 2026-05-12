import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const updateContent: Tool = {
  name: "update_content",
  layer: "write",
  description:
    "Find and replace text in a note. Use when the user asks to change, replace, or modify specific text.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path (without .md extension)" },
      old_text: { type: "string", description: "Exact text to find in the file" },
      new_text: { type: "string", description: "Text to replace it with" },
    },
    required: ["path", "old_text", "new_text"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const oldText = args.old_text as string;
    const newText = args.new_text as string;
    const file = resolveFile(ctx.app, path);
    let found = false;
    await ctx.app.vault.process(file, (data) => {
      if (!data.includes(oldText)) throw new Error("Text not found in file");
      found = true;
      return data.replace(oldText, newText);
    });
    return found ? `Updated: ${file.path}` : "Text not found.";
  },
};
