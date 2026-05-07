import type { ToolDefinition } from "../providers";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the content of a note in the vault",
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
    description: "Full-text search across the vault",
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
    description: "List files in a directory",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Folder path (default: focus directory)" },
      },
    },
  },
  {
    name: "get_properties",
    description: "Get frontmatter properties of a note",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to vault root" },
      },
      required: ["path"],
    },
  },
  {
    name: "get_active_file",
    description: "Get info about the currently active file",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_file",
    description: "Create a new note",
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
    description: "Append content to the end of a note",
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
    description: "Prepend content to the beginning of a note (after frontmatter)",
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
    description: "Replace a specific text segment in a note",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        old_text: { type: "string", description: "Text to find" },
        new_text: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "set_property",
    description: "Set a frontmatter property on a note",
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
    description: "Open a note in the editor",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "set_focus",
    description: "Switch working directory focus",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to focus on" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_memory",
    description: "Read long-term memory (user habits, preferences, project context)",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_memory",
    description: "Write to long-term memory. Use when you discover user habits or preferences worth remembering.",
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
  get_active_file: "read",
  create_file: "write",
  append: "write",
  prepend: "write",
  update_content: "write",
  set_property: "write",
  open_file: "write",
  set_focus: "system",
  read_memory: "system",
  update_memory: "system",
};

export function getToolLayer(name: string): ToolLayer {
  return TOOL_LAYERS[name] ?? "dangerous";
}
