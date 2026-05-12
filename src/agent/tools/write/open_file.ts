import type { Tool } from "../types";

export const openFile: Tool = {
  name: "open_file",
  layer: "write",
  description: "Open a note in the editor.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    await ctx.app.workspace.openLinkText(path, "", false);
    return `Opened: ${path}`;
  },
};
