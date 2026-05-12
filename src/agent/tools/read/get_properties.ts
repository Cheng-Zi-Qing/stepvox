import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const getProperties: Tool = {
  name: "get_properties",
  layer: "read",
  description: "Get frontmatter properties of a note in the vault.",
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
    const cache = ctx.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return "No frontmatter.";
    return JSON.stringify(fm, null, 2);
  },
};
