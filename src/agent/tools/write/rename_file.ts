import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

export const renameFile: Tool = {
  name: "rename_file",
  layer: "write",
  description:
    "Rename a note in place (keeps it in the same folder). Use when the user wants to change a file's name without moving it. For moving to a different folder, use move_file instead. Automatically updates all internal links.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Current file path" },
      new_name: { type: "string", description: "New file name (without folder path, e.g. 'meeting-notes')" },
    },
    required: ["path", "new_name"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const newName = args.new_name as string;
    const file = resolveFile(ctx.app, path);
    const folder = file.parent?.path ?? "";
    let target = newName;
    if (!target.endsWith(".md")) target += ".md";
    const targetPath = folder ? `${folder}/${target}` : target;
    if (ctx.app.vault.getAbstractFileByPath(targetPath)) {
      throw new Error(`File already exists: ${targetPath}`);
    }
    await ctx.app.fileManager.renameFile(file, targetPath);
    return `Renamed: ${file.path} → ${targetPath}`;
  },
};
