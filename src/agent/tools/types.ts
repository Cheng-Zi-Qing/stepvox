import type { App } from "obsidian";
import type { SearchProvider } from "../../providers/search";

export type ToolLayer = "read" | "write" | "system";

/**
 * External services a tool may need at runtime. Optional — tools must check
 * for null and degrade gracefully (e.g. web_search returns a friendly
 * "not configured" string when search is null).
 */
export interface ToolServices {
  search: SearchProvider | null;
  // Future slots (fetch, vectorStore, ...) go here.
}

/**
 * The complete runtime surface a tool's execute() function is allowed to
 * depend on. Anything not in here must be passed via args (LLM-controlled)
 * or imported from a pure module. Tools NEVER reach into orchestrator or
 * pipeline internals.
 */
export interface ToolContext {
  app: App;
  pluginDataDir: string;             // e.g. ".obsidian/plugins/stepvox"
  activeFilePath: string | null;     // current Obsidian active file, may be null
  services: ToolServices;
}

/**
 * A single tool definition. One file per tool under `tools/{layer}/{name}.ts`.
 * Schema and behaviour are co-located so a reviewer can read one file end to end.
 */
export interface Tool {
  name: string;
  layer: ToolLayer;
  description: string;
  parameters: Record<string, unknown>;   // JSON Schema
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
