import type { Tool } from "../types";
import { resolveFile } from "../_helpers";

/**
 * move_file — move (or rename) a note. If new_path points to an existing
 * file/folder, this fails rather than overwriting. Vault paths only, no
 * escaping to outside the vault.
 */
export const moveFile: Tool = {
  name: "move_file",
  layer: "write",
  description:
    "Move or rename a note within the vault. ALWAYS confirm the destination with the user in your response text BEFORE calling this the first time — if they haven't explicitly named a target path, ask them which folder to use. Fails if the destination path already exists.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Current file path." },
      new_path: { type: "string", description: "Destination path (e.g. workspace/reports/foo.md)." },
    },
    required: ["path", "new_path"],
  },
  async execute(args, ctx) {
    const path = args.path as string;
    const newPath = args.new_path as string;
    if (!path || !newPath) throw new Error("move_file requires both 'path' and 'new_path'.");
    const src = resolveFile(ctx.app, path);

    // Normalise target: append .md if user omitted (mirrors resolveFile behaviour).
    let target = newPath;
    if (!target.endsWith(".md") && !target.endsWith("/")) target += ".md";

    if (ctx.app.vault.getAbstractFileByPath(target)) {
      throw new Error(`Target already exists: ${target}. Use a different new_path.`);
    }
    await ctx.app.fileManager.renameFile(src, target);
    return `Moved: ${src.path} → ${target}`;
  },
};
