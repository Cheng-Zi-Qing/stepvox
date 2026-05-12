import { TFolder } from "obsidian";
import type { Tool } from "../types";

const MAX_ENTRIES = 50;

export const listFiles: Tool = {
  name: "list_files",
  layer: "read",
  description: "List files in a directory of the user's vault.",
  parameters: {
    type: "object",
    properties: {
      folder: { type: "string", description: "Folder path (default: vault root)" },
    },
  },
  async execute(args, ctx) {
    const folder = args.folder as string | undefined;
    const abstract = folder
      ? ctx.app.vault.getAbstractFileByPath(folder)
      : ctx.app.vault.getRoot();

    if (!abstract || !(abstract instanceof TFolder)) {
      return `Folder not found: ${folder ?? "(root)"}`;
    }

    const entries = abstract.children
      .map((c) => (c instanceof TFolder ? `${c.name}/` : c.name))
      .sort();

    if (entries.length === 0) return "(empty)";

    // Truncate large directories so the LLM context isn't drowned (and to
    // discourage the model from re-asking when it can't make sense of a
    // 1000-line listing). Show the first 50 entries with a tail count.
    if (entries.length <= MAX_ENTRIES) return entries.join("\n");
    return (
      entries.slice(0, MAX_ENTRIES).join("\n") +
      `\n...(+${entries.length - MAX_ENTRIES} more entries; ask the user to narrow down or use search)`
    );
  },
};
