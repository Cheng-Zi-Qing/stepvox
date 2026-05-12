import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const append: Tool = {
  name: "append",
  layer: "write",
  description: "Append content to the end of a note.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Content to append" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const content = args.content as string;
    const file = resolveFile(ctx.app, path);
    await ctx.app.vault.append(file, "\n" + content);
    return `Appended to: ${file.path}`;
  },
};
