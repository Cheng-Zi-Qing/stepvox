import { TFile, TFolder } from "obsidian";
import type { Tool } from "../types";

const MAX_MATCHES = 30;

/**
 * find_path — fuzzy name-match across the WHOLE vault (file + folder names).
 * Use when the LLM knows the rough name of something ("the report", "my
 * meeting notes folder") but not its full path. Returns up to 30 matches,
 * prefixed with "[file]" or "[folder]" so the LLM can pick. No file
 * contents are opened, it's purely a path-layer search.
 */
export const findPath: Tool = {
  name: "find_path",
  layer: "read",
  description:
    "Fuzzy-find files and folders in the vault by name substring. Use this BEFORE create_file / move_file / read_file whenever the user refers to a place by a rough name (\"the workspace folder\", \"my report\", \"工作目录\") instead of giving you an exact path. Returns up to 30 paths prefixed with [file] or [folder]. Much cheaper than list_files for large vaults — one call usually resolves the ambiguity.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Substring to match against file/folder names and paths (case-insensitive).",
      },
      type: {
        type: "string",
        enum: ["file", "folder", "both"],
        description: "Restrict results to a kind. Default: both.",
      },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = args.query as string;
    const kind = (args.type as "file" | "folder" | "both" | undefined) ?? "both";
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return "find_path needs a non-empty query string.";

    const all = ctx.app.vault.getAllLoadedFiles();
    const matches: { type: "file" | "folder"; path: string }[] = [];

    for (const f of all) {
      if (matches.length >= MAX_MATCHES + 1) break; // +1 so we can detect "more"
      const isFolder = f instanceof TFolder;
      if (kind === "file" && isFolder) continue;
      if (kind === "folder" && !isFolder) continue;
      if (!f.path) continue; // root has empty path
      const name = (isFolder ? f.name : (f as TFile).basename) ?? "";
      if (name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) {
        matches.push({ type: isFolder ? "folder" : "file", path: f.path });
      }
    }

    if (matches.length === 0) return `No paths found matching "${query}".`;

    const shown = matches.slice(0, MAX_MATCHES);
    const lines = shown.map((m) => `[${m.type}] ${m.path}`);
    if (matches.length > MAX_MATCHES) lines.push(`...(+${matches.length - MAX_MATCHES} more, narrow the query)`);
    return lines.join("\n");
  },
};
