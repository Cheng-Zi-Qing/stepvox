// ============================================================
// === HOW TO ADD A NEW TOOL ===
//
// 1. Pick a layer:
//    - "read"      — never modifies the vault, always allowed
//    - "write"     — modifies the vault (no executor-level gate; per-tool
//                    guards apply, e.g. create_file refuses to overwrite,
//                    move_file refuses to clobber destination)
//    - "system"    — plugin meta (memory, settings); not vault content
//
// 2. Create a new file at `src/agent/tools/{layer}/{name}.ts`. Copy the
//    closest existing tool as a template. Each tool exports a single object
//    that satisfies the `Tool` interface in `./types.ts`:
//        { name, layer, description, parameters, execute(args, ctx) }
//    The description IS the routing signal — write it like a spec, including
//    what the tool does NOT do.
//
// 3. Add two lines below:
//        - import the new tool at the top of this file
//        - add it to TOOL_REGISTRY in the right layer section
//
// 4. Add a test under `tests/tools/` (or extend `tests/tools.test.ts`).
//    Every new tool needs at least one case covering its happy path and
//    one covering its primary error path (file-not-found, missing service,
//    etc.).
// ============================================================

import type { Tool, ToolLayer } from "./types";

// === read layer ===
import { readFile } from "./read/read_file";
import { search } from "./read/search";
import { listFiles } from "./read/list_files";
import { getProperties } from "./read/get_properties";
import { findPath } from "./read/find_path";
import { webSearch } from "./read/web_search";

// === write layer ===
import { createFile } from "./write/create_file";
import { append } from "./write/append";
import { prepend } from "./write/prepend";
import { updateContent } from "./write/update_content";
import { setProperty } from "./write/set_property";
import { openFile } from "./write/open_file";
import { moveFile } from "./write/move_file";
import { createFolder } from "./write/create_folder";
import { deleteFile } from "./write/delete_file";
import { renameFile } from "./write/rename_file";

// === system layer ===
import { readMemory } from "./system/read_memory";
import { updateMemory } from "./system/update_memory";

export const TOOL_REGISTRY: readonly Tool[] = [
  // read
  readFile,
  search,
  listFiles,
  getProperties,
  findPath,
  webSearch,
  // write
  createFile,
  append,
  prepend,
  updateContent,
  setProperty,
  openFile,
  moveFile,
  createFolder,
  deleteFile,
  renameFile,
  // system
  readMemory,
  updateMemory,
];

export function getToolByName(name: string): Tool | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function getToolLayer(name: string): ToolLayer | undefined {
  return getToolByName(name)?.layer;
}

export type { Tool, ToolContext, ToolLayer, ToolServices } from "./types";
