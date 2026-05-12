import type { Tool } from "../types";
import { findFrontmatterEnd, resolveFile } from "../_helpers";

export const prepend: Tool = {
  name: "prepend",
  layer: "write",
  description: "Prepend content to the beginning of a note (after frontmatter).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Content to prepend" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const content = args.content as string;
    const file = resolveFile(ctx.app, path);
    await ctx.app.vault.process(file, (data) => {
      const fmEnd = findFrontmatterEnd(data);
      return data.slice(0, fmEnd) + content + "\n" + data.slice(fmEnd);
    });
    return `Prepended to: ${file.path}`;
  },
};
