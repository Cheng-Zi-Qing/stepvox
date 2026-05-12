import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const setProperty: Tool = {
  name: "set_property",
  layer: "write",
  description: "Set a frontmatter property on a note.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      key: { type: "string", description: "Property name" },
      value: { type: "string", description: "Property value" },
    },
    required: ["path", "key", "value"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const key = args.key as string;
    const value = args.value as string;
    const file = resolveFile(ctx.app, path);
    await ctx.app.fileManager.processFrontMatter(file, (fm) => {
      fm[key] = value;
    });
    return `Set ${key}=${value} on ${file.path}`;
  },
};
