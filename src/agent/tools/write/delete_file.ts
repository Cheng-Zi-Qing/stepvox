import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const deleteFile: Tool = {
  name: "delete_file",
  layer: "write",
  description:
    "Move a note to the system trash (recoverable). Use when the user explicitly asks to delete or remove a note. The file is NOT permanently destroyed — it goes to the OS trash and can be restored.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to delete" },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const file = resolveFile(ctx.app, path);
    await ctx.app.vault.trash(file, true);
    return `Moved to trash: ${file.path}`;
  },
};
