import type { ToolDefinition } from "../providers";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the full content of a note already in the user's Obsidian vault. Use when the user references a specific note they already have.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to vault root" },
      },
      required: ["path"],
    },
  },
  {
    name: "search",
    description:
      "Full-text search across the user's LOCAL Obsidian vault. Use for questions about the user's own notes, projects, tasks, or anything they've personally written down. Do NOT use for news, companies, current events, prices, or anything about the outside world — use web_search for those.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_files",
    description: "List files in a directory of the user's vault.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Folder path (default: vault root)" },
      },
    },
  },
  {
    name: "get_properties",
    description: "Get frontmatter properties of a note in the vault.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to vault root" },
      },
      required: ["path"],
    },
  },
  {
    name: "create_file",
    description: "Create a new note in the vault.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to create" },
        content: { type: "string", description: "File content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "append",
    description: "Append content to the end of a note.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Content to append" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "prepend",
    description: "Prepend content to the beginning of a note (after frontmatter).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Content to prepend" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "update_content",
    description:
      "Find and replace text in a note. Use when the user asks to change, replace, or modify specific text.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (without .md extension)" },
        old_text: { type: "string", description: "Exact text to find in the file" },
        new_text: { type: "string", description: "Text to replace it with" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "set_property",
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
  },
  {
    name: "open_file",
    description: "Open a note in the editor.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "find_path",
    description:
      "Fuzzy-find files and folders in the vault by name substring. Use this BEFORE create_file / move_file / read_file whenever the user refers to a place by a rough name (\"the workspace folder\", \"my report\", \"工作目录\") instead of giving you an exact path. Returns up to 30 paths prefixed with [file] or [folder]. Much cheaper than list_files for large vaults — one call usually resolves the ambiguity.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to match against file/folder names and paths (case-insensitive)." },
        type: {
          type: "string",
          enum: ["file", "folder", "both"],
          description: "Restrict results to a kind. Default: both.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "move_file",
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
  },
  {
    name: "web_search",
    description:
      "Search the live INTERNET for information. MUST call this for any question whose answer lives outside the user's personal vault: current events, news, company info, public people, product launches, prices, stocks, weather, releases, \"what is X\", \"when did X happen\", \"who is X\", anything with a year/date reference. Prefer this over vault search whenever the topic is about the outside world, even if the user didn't explicitly say \"online\" or \"web\". If you're unsure whether something lives in the vault or online, try web_search first — it's almost always right for factual world queries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_memory",
    description: "Read long-term memory (user habits, preferences, project context).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_memory",
    description:
      "Write to long-term memory. Use when you discover user habits or preferences worth remembering.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Memory content to store" },
      },
      required: ["content"],
    },
  },
];

export type ToolLayer = "read" | "write" | "dangerous" | "system";

const TOOL_LAYERS: Record<string, ToolLayer> = {
  read_file: "read",
  search: "read",
  list_files: "read",
  get_properties: "read",
  find_path: "read",
  create_file: "write",
  append: "write",
  prepend: "write",
  update_content: "write",
  set_property: "write",
  open_file: "write",
  move_file: "write",
  web_search: "read",
  read_memory: "system",
  update_memory: "system",
};

export function getToolLayer(name: string): ToolLayer {
  return TOOL_LAYERS[name] ?? "dangerous";
}
