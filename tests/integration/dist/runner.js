"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/agent/tools/_helpers.ts
function resolveFile(app2, path) {
  let resolved = path;
  if (!resolved.endsWith(".md")) resolved += ".md";
  const file = app2.vault.getAbstractFileByPath(resolved);
  if (!(file instanceof import_obsidian.TFile)) {
    throw new Error(`File not found: ${path}`);
  }
  return file;
}
function findFrontmatterEnd(data) {
  if (!data.startsWith("---")) return 0;
  const end = data.indexOf("---", 3);
  if (end === -1) return 0;
  return end + 3 + (data[end + 3] === "\n" ? 1 : 0);
}
var import_obsidian;
var init_helpers = __esm({
  "src/agent/tools/_helpers.ts"() {
    "use strict";
    import_obsidian = require("obsidian");
  }
});

// src/agent/tools/read/read_file.ts
var MAX_BYTES, readFile;
var init_read_file = __esm({
  "src/agent/tools/read/read_file.ts"() {
    "use strict";
    init_helpers();
    MAX_BYTES = 4e3;
    readFile = {
      name: "read_file",
      layer: "read",
      description: "Read the full content of a note already in the user's Obsidian vault. Use when the user references a specific note they already have.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to vault root" }
        },
        required: ["path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const file = resolveFile(ctx.app, path);
        const content = await ctx.app.vault.cachedRead(file);
        if (content.length > MAX_BYTES) {
          return content.slice(0, MAX_BYTES) + "\n...(truncated)";
        }
        return content;
      }
    };
  }
});

// src/agent/tools/read/search.ts
var DEFAULT_LIMIT, search;
var init_search = __esm({
  "src/agent/tools/read/search.ts"() {
    "use strict";
    DEFAULT_LIMIT = 10;
    search = {
      name: "search",
      layer: "read",
      description: "Full-text search across the user's LOCAL Obsidian vault. Use for questions about the user's own notes, projects, tasks, or anything they've personally written down. Do NOT use for news, companies, current events, prices, or anything about the outside world \u2014 use web_search for those.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 10)" }
        },
        required: ["query"]
      },
      async execute(args, ctx) {
        const query = args.query;
        const limit = args.limit ?? DEFAULT_LIMIT;
        const files = ctx.app.vault.getMarkdownFiles();
        const results = [];
        const lower = query.toLowerCase();
        for (const file of files) {
          if (results.length >= limit) break;
          const content = await ctx.app.vault.cachedRead(file);
          const idx = content.toLowerCase().indexOf(lower);
          if (idx !== -1) {
            const start = Math.max(0, idx - 50);
            const end = Math.min(content.length, idx + query.length + 50);
            results.push({
              path: file.path,
              snippet: content.slice(start, end).replace(/\n/g, " ")
            });
          }
        }
        if (results.length === 0) return "No results found.";
        return results.map((r) => `${r.path}: ...${r.snippet}...`).join("\n");
      }
    };
  }
});

// src/agent/tools/read/list_files.ts
var import_obsidian2, MAX_ENTRIES, listFiles;
var init_list_files = __esm({
  "src/agent/tools/read/list_files.ts"() {
    "use strict";
    import_obsidian2 = require("obsidian");
    MAX_ENTRIES = 50;
    listFiles = {
      name: "list_files",
      layer: "read",
      description: "List files in a directory of the user's vault.",
      parameters: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Folder path (default: vault root)" }
        }
      },
      async execute(args, ctx) {
        const folder = args.folder;
        const abstract = folder ? ctx.app.vault.getAbstractFileByPath(folder) : ctx.app.vault.getRoot();
        if (!abstract || !(abstract instanceof import_obsidian2.TFolder)) {
          return `Folder not found: ${folder ?? "(root)"}`;
        }
        const entries = abstract.children.map((c) => c instanceof import_obsidian2.TFolder ? `${c.name}/` : c.name).sort();
        if (entries.length === 0) return "(empty)";
        if (entries.length <= MAX_ENTRIES) return entries.join("\n");
        return entries.slice(0, MAX_ENTRIES).join("\n") + `
...(+${entries.length - MAX_ENTRIES} more entries; ask the user to narrow down or use search)`;
      }
    };
  }
});

// src/agent/tools/read/get_properties.ts
var getProperties;
var init_get_properties = __esm({
  "src/agent/tools/read/get_properties.ts"() {
    "use strict";
    init_helpers();
    getProperties = {
      name: "get_properties",
      layer: "read",
      description: "Get frontmatter properties of a note in the vault.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to vault root" }
        },
        required: ["path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const file = resolveFile(ctx.app, path);
        const cache = ctx.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm) return "No frontmatter.";
        return JSON.stringify(fm, null, 2);
      }
    };
  }
});

// src/agent/tools/read/find_path.ts
var import_obsidian3, MAX_MATCHES, findPath;
var init_find_path = __esm({
  "src/agent/tools/read/find_path.ts"() {
    "use strict";
    import_obsidian3 = require("obsidian");
    MAX_MATCHES = 30;
    findPath = {
      name: "find_path",
      layer: "read",
      description: 'Fuzzy-find files and folders in the vault by name substring. Use this BEFORE create_file / move_file / read_file whenever the user refers to a place by a rough name ("the workspace folder", "my report", "\u5DE5\u4F5C\u76EE\u5F55") instead of giving you an exact path. Returns up to 30 paths prefixed with [file] or [folder]. Much cheaper than list_files for large vaults \u2014 one call usually resolves the ambiguity.',
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Substring to match against file/folder names and paths (case-insensitive)."
          },
          type: {
            type: "string",
            enum: ["file", "folder", "both"],
            description: "Restrict results to a kind. Default: both."
          }
        },
        required: ["query"]
      },
      async execute(args, ctx) {
        const query = args.query;
        const kind = args.type ?? "both";
        const q = (query ?? "").trim().toLowerCase();
        if (!q) return "find_path needs a non-empty query string.";
        const all = ctx.app.vault.getAllLoadedFiles();
        const matches = [];
        for (const f of all) {
          if (matches.length >= MAX_MATCHES + 1) break;
          const isFolder = f instanceof import_obsidian3.TFolder;
          if (kind === "file" && isFolder) continue;
          if (kind === "folder" && !isFolder) continue;
          if (!f.path) continue;
          const name = (isFolder ? f.name : f.basename) ?? "";
          if (name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) {
            matches.push({ type: isFolder ? "folder" : "file", path: f.path });
          }
        }
        if (matches.length === 0) return `No paths found matching "${query}".`;
        const shown = matches.slice(0, MAX_MATCHES);
        const lines = shown.map((m) => `[${m.type}] ${m.path}`);
        if (matches.length > MAX_MATCHES) lines.push(`...(+${matches.length - MAX_MATCHES} more, narrow the query)`);
        return lines.join("\n");
      }
    };
  }
});

// src/agent/tools/read/web_search.ts
var webSearch;
var init_web_search = __esm({
  "src/agent/tools/read/web_search.ts"() {
    "use strict";
    webSearch = {
      name: "web_search",
      layer: "read",
      description: `Search the live INTERNET for information. MUST call this for any question whose answer lives outside the user's personal vault: current events, news, company info, public people, product launches, prices, stocks, weather, releases, "what is X", "when did X happen", "who is X", anything with a year/date reference. Prefer this over vault search whenever the topic is about the outside world, even if the user didn't explicitly say "online" or "web". If you're unsure whether something lives in the vault or online, try web_search first \u2014 it's almost always right for factual world queries.`,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" }
        },
        required: ["query"]
      },
      async execute(args, ctx) {
        const query = args.query;
        if (!ctx.services.search) {
          return "Web search not configured. Please add a search API key in settings.";
        }
        const results = await ctx.services.search.search(query);
        if (results.length === 0) return "No results found.";
        return results.map((r, i) => `[${i + 1}] ${r.title}
${r.url}
${r.content}`).join("\n\n---\n\n");
      }
    };
  }
});

// src/agent/tools/write/create_file.ts
var createFile;
var init_create_file = __esm({
  "src/agent/tools/write/create_file.ts"() {
    "use strict";
    createFile = {
      name: "create_file",
      layer: "write",
      description: "Create a new note in the vault.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to create" },
          content: { type: "string", description: "File content" }
        },
        required: ["path", "content"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const content = args.content;
        let resolved = path;
        if (!resolved.endsWith(".md")) resolved += ".md";
        const existing = ctx.app.vault.getAbstractFileByPath(resolved);
        if (existing) throw new Error(`File already exists: ${resolved}`);
        await ctx.app.vault.create(resolved, content);
        return `Created: ${resolved}`;
      }
    };
  }
});

// src/agent/tools/write/append.ts
var append;
var init_append = __esm({
  "src/agent/tools/write/append.ts"() {
    "use strict";
    init_helpers();
    append = {
      name: "append",
      layer: "write",
      description: "Append content to the end of a note.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "Content to append" }
        },
        required: ["path", "content"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const content = args.content;
        const file = resolveFile(ctx.app, path);
        await ctx.app.vault.append(file, "\n" + content);
        return `Appended to: ${file.path}`;
      }
    };
  }
});

// src/agent/tools/write/prepend.ts
var prepend;
var init_prepend = __esm({
  "src/agent/tools/write/prepend.ts"() {
    "use strict";
    init_helpers();
    prepend = {
      name: "prepend",
      layer: "write",
      description: "Prepend content to the beginning of a note (after frontmatter).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "Content to prepend" }
        },
        required: ["path", "content"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const content = args.content;
        const file = resolveFile(ctx.app, path);
        await ctx.app.vault.process(file, (data) => {
          const fmEnd = findFrontmatterEnd(data);
          return data.slice(0, fmEnd) + content + "\n" + data.slice(fmEnd);
        });
        return `Prepended to: ${file.path}`;
      }
    };
  }
});

// src/agent/tools/write/update_content.ts
var updateContent;
var init_update_content = __esm({
  "src/agent/tools/write/update_content.ts"() {
    "use strict";
    init_helpers();
    updateContent = {
      name: "update_content",
      layer: "write",
      description: "Find and replace text in a note. Use when the user asks to change, replace, or modify specific text.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (without .md extension)" },
          old_text: { type: "string", description: "Exact text to find in the file" },
          new_text: { type: "string", description: "Text to replace it with" }
        },
        required: ["path", "old_text", "new_text"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const oldText = args.old_text;
        const newText = args.new_text;
        const file = resolveFile(ctx.app, path);
        let found = false;
        await ctx.app.vault.process(file, (data) => {
          if (!data.includes(oldText)) throw new Error("Text not found in file");
          found = true;
          return data.replace(oldText, newText);
        });
        return found ? `Updated: ${file.path}` : "Text not found.";
      }
    };
  }
});

// src/agent/tools/write/set_property.ts
var setProperty;
var init_set_property = __esm({
  "src/agent/tools/write/set_property.ts"() {
    "use strict";
    init_helpers();
    setProperty = {
      name: "set_property",
      layer: "write",
      description: "Set a frontmatter property on a note.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          key: { type: "string", description: "Property name" },
          value: { type: "string", description: "Property value" }
        },
        required: ["path", "key", "value"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const key = args.key;
        const value = args.value;
        const file = resolveFile(ctx.app, path);
        await ctx.app.fileManager.processFrontMatter(file, (fm) => {
          fm[key] = value;
        });
        return `Set ${key}=${value} on ${file.path}`;
      }
    };
  }
});

// src/agent/tools/write/open_file.ts
var openFile;
var init_open_file = __esm({
  "src/agent/tools/write/open_file.ts"() {
    "use strict";
    openFile = {
      name: "open_file",
      layer: "write",
      description: "Open a note in the editor.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" }
        },
        required: ["path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        await ctx.app.workspace.openLinkText(path, "", false);
        return `Opened: ${path}`;
      }
    };
  }
});

// src/agent/tools/write/move_file.ts
var moveFile;
var init_move_file = __esm({
  "src/agent/tools/write/move_file.ts"() {
    "use strict";
    init_helpers();
    moveFile = {
      name: "move_file",
      layer: "write",
      description: "Move or rename a note within the vault. ALWAYS confirm the destination with the user in your response text BEFORE calling this the first time \u2014 if they haven't explicitly named a target path, ask them which folder to use. Fails if the destination path already exists.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Current file path." },
          new_path: { type: "string", description: "Destination path (e.g. workspace/reports/foo.md)." }
        },
        required: ["path", "new_path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const newPath = args.new_path;
        if (!path || !newPath) throw new Error("move_file requires both 'path' and 'new_path'.");
        const src = resolveFile(ctx.app, path);
        let target = newPath;
        if (!target.endsWith(".md") && !target.endsWith("/")) target += ".md";
        if (ctx.app.vault.getAbstractFileByPath(target)) {
          throw new Error(`Target already exists: ${target}. Use a different new_path.`);
        }
        await ctx.app.fileManager.renameFile(src, target);
        return `Moved: ${src.path} \u2192 ${target}`;
      }
    };
  }
});

// src/agent/tools/write/create_folder.ts
var createFolder;
var init_create_folder = __esm({
  "src/agent/tools/write/create_folder.ts"() {
    "use strict";
    createFolder = {
      name: "create_folder",
      layer: "write",
      description: "Create a new folder in the vault. Use when the user asks to organize notes into a new directory, or before create_file when the target folder does not exist yet. Succeeds silently if the folder already exists.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Folder path to create (e.g. 'projects/2026')" }
        },
        required: ["path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const existing = ctx.app.vault.getAbstractFileByPath(path);
        if (existing) return `Folder already exists: ${path}`;
        await ctx.app.vault.createFolder(path);
        return `Created folder: ${path}`;
      }
    };
  }
});

// src/agent/tools/write/delete_file.ts
var deleteFile;
var init_delete_file = __esm({
  "src/agent/tools/write/delete_file.ts"() {
    "use strict";
    init_helpers();
    deleteFile = {
      name: "delete_file",
      layer: "write",
      description: "Move a note to the system trash (recoverable). Use when the user explicitly asks to delete or remove a note. The file is NOT permanently destroyed \u2014 it goes to the OS trash and can be restored.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" }
        },
        required: ["path"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const file = resolveFile(ctx.app, path);
        await ctx.app.vault.trash(file, true);
        return `Moved to trash: ${file.path}`;
      }
    };
  }
});

// src/agent/tools/write/rename_file.ts
var renameFile;
var init_rename_file = __esm({
  "src/agent/tools/write/rename_file.ts"() {
    "use strict";
    init_helpers();
    renameFile = {
      name: "rename_file",
      layer: "write",
      description: "Rename a note in place (keeps it in the same folder). Use when the user wants to change a file's name without moving it. For moving to a different folder, use move_file instead. Automatically updates all internal links.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Current file path" },
          new_name: { type: "string", description: "New file name (without folder path, e.g. 'meeting-notes')" }
        },
        required: ["path", "new_name"]
      },
      async execute(args, ctx) {
        const path = args.path;
        const newName = args.new_name;
        const file = resolveFile(ctx.app, path);
        const folder = file.parent?.path ?? "";
        let target = newName;
        if (!target.endsWith(".md")) target += ".md";
        const targetPath = folder ? `${folder}/${target}` : target;
        if (ctx.app.vault.getAbstractFileByPath(targetPath)) {
          throw new Error(`File already exists: ${targetPath}`);
        }
        await ctx.app.fileManager.renameFile(file, targetPath);
        return `Renamed: ${file.path} \u2192 ${targetPath}`;
      }
    };
  }
});

// src/agent/memory-types.ts
var EMPTY_STORE, MAX_MEMORY_ENTRIES;
var init_memory_types = __esm({
  "src/agent/memory-types.ts"() {
    "use strict";
    EMPTY_STORE = {
      version: 1,
      preferences: [],
      facts: [],
      interactions: []
    };
    MAX_MEMORY_ENTRIES = 30;
  }
});

// src/agent/memory-helpers.ts
function today() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatMemoryForDisplay(store) {
  if (!store) return "No memory stored yet.";
  const { preferences, facts, interactions } = store;
  if (preferences.length === 0 && facts.length === 0 && interactions.length === 0) {
    return "No memory stored yet.";
  }
  const sections = ["## Your Memory"];
  if (preferences.length > 0) {
    sections.push("### Preferences");
    for (const p of preferences) sections.push(`- ${p.key}: ${p.value} (${p.ts})`);
  }
  if (facts.length > 0) {
    sections.push("### Facts");
    for (const f of facts) sections.push(`- ${f.key}: ${f.value} (${f.ts})`);
  }
  if (interactions.length > 0) {
    sections.push("### Recent Interactions");
    for (const i of interactions) sections.push(`- ${i.summary} (${i.ts})`);
  }
  return sections.join("\n");
}
function applyMemoryAction(store, action) {
  const result = structuredClone(store);
  const ts = today();
  if (action.action === "add") {
    if (action.category === "interactions") {
      result.interactions.push({ summary: action.summary, ts });
    } else {
      const arr = result[action.category];
      const idx = arr.findIndex((e) => e.key === action.key);
      if (idx >= 0) {
        arr[idx] = { key: action.key, value: action.value, ts };
      } else {
        arr.push({ key: action.key, value: action.value, ts });
      }
    }
    enforceCapFIFO(result);
  } else {
    if (action.category === "interactions") {
      result.interactions = result.interactions.filter(
        (e) => !e.summary.includes(action.summary)
      );
    } else {
      const arr = result[action.category];
      const idx = arr.findIndex((e) => e.key === action.key);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }
  return result;
}
function enforceCapFIFO(store) {
  let total = store.preferences.length + store.facts.length + store.interactions.length;
  while (total > MAX_MEMORY_ENTRIES) {
    if (store.interactions.length > 0) {
      store.interactions.shift();
    } else if (store.facts.length > 0) {
      store.facts.shift();
    } else {
      break;
    }
    total--;
  }
}
var init_memory_helpers = __esm({
  "src/agent/memory-helpers.ts"() {
    "use strict";
    init_memory_types();
  }
});

// src/agent/tools/system/read_memory.ts
var import_obsidian4, readMemory;
var init_read_memory = __esm({
  "src/agent/tools/system/read_memory.ts"() {
    "use strict";
    import_obsidian4 = require("obsidian");
    init_memory_helpers();
    readMemory = {
      name: "read_memory",
      layer: "system",
      description: "Read long-term memory (user habits, preferences, project context).",
      parameters: { type: "object", properties: {} },
      async execute(_args, ctx) {
        const path = `${ctx.pluginDataDir}/memory/memory.json`;
        const file = ctx.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof import_obsidian4.TFile)) return "No memory stored yet.";
        try {
          const raw = await ctx.app.vault.cachedRead(file);
          const store = JSON.parse(raw);
          return formatMemoryForDisplay(store);
        } catch {
          return "No memory stored yet.";
        }
      }
    };
  }
});

// src/agent/tools/system/update_memory.ts
var import_obsidian5, updateMemory;
var init_update_memory = __esm({
  "src/agent/tools/system/update_memory.ts"() {
    "use strict";
    import_obsidian5 = require("obsidian");
    init_memory_types();
    init_memory_helpers();
    updateMemory = {
      name: "update_memory",
      layer: "system",
      description: "Add or remove structured long-term memory entries. Categories: preferences (user habits/corrections), facts (paths, names, recurring info), interactions (session summaries).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove"],
            description: "Whether to add/upsert or remove an entry."
          },
          category: {
            type: "string",
            enum: ["preferences", "facts", "interactions"],
            description: "Memory category."
          },
          key: {
            type: "string",
            description: "Identifier for preferences/facts entries."
          },
          value: {
            type: "string",
            description: "Content for preferences/facts entries."
          },
          summary: {
            type: "string",
            description: "Summary text for interactions entries."
          }
        },
        required: ["action", "category"]
      },
      async execute(args, ctx) {
        const path = `${ctx.pluginDataDir}/memory/memory.json`;
        let store;
        const file = ctx.app.vault.getAbstractFileByPath(path);
        if (file instanceof import_obsidian5.TFile) {
          try {
            store = JSON.parse(await ctx.app.vault.cachedRead(file));
          } catch {
            store = structuredClone(EMPTY_STORE);
          }
        } else {
          store = structuredClone(EMPTY_STORE);
        }
        const updated = applyMemoryAction(store, {
          action: args.action,
          category: args.category,
          key: args.key,
          value: args.value,
          summary: args.summary
        });
        const json = JSON.stringify(updated, null, 2);
        if (file instanceof import_obsidian5.TFile) {
          await ctx.app.vault.modify(file, json);
        } else {
          await ctx.app.vault.create(path, json);
        }
        return "Memory updated.";
      }
    };
  }
});

// src/agent/tools/index.ts
function getToolByName(name) {
  return TOOL_REGISTRY.find((t) => t.name === name);
}
var TOOL_REGISTRY;
var init_tools = __esm({
  "src/agent/tools/index.ts"() {
    "use strict";
    init_read_file();
    init_search();
    init_list_files();
    init_get_properties();
    init_find_path();
    init_web_search();
    init_create_file();
    init_append();
    init_prepend();
    init_update_content();
    init_set_property();
    init_open_file();
    init_move_file();
    init_create_folder();
    init_delete_file();
    init_rename_file();
    init_read_memory();
    init_update_memory();
    TOOL_REGISTRY = [
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
      updateMemory
    ];
  }
});

// src/agent/tools.ts
var TOOL_DEFINITIONS, getToolByName2;
var init_tools2 = __esm({
  "src/agent/tools.ts"() {
    "use strict";
    init_tools();
    TOOL_DEFINITIONS = TOOL_REGISTRY.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
    getToolByName2 = getToolByName;
  }
});

// src/utils/debug-logger.ts
function debugLog(category, message, data) {
  if (!enabled) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const dataStr = data !== void 0 ? ` ${JSON.stringify(data)}` : "";
  const line = `[${timestamp}] [${category}] ${message}${dataStr}
`;
  console.log(`[${category}] ${message}`, data ?? "");
  if (!app) return;
  const currentApp = app;
  writeChain = writeChain.then(async () => {
    try {
      const adapter = currentApp.vault.adapter;
      if (await adapter.exists(LOG_PATH)) {
        await adapter.append(LOG_PATH, line);
      } else {
        await adapter.write(LOG_PATH, line);
      }
    } catch {
    }
  });
}
var app, enabled, LOG_PATH, ROTATE_AFTER_MS, writeChain;
var init_debug_logger = __esm({
  "src/utils/debug-logger.ts"() {
    "use strict";
    app = null;
    enabled = false;
    LOG_PATH = ".obsidian/plugins/stepvox/debug.log";
    ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1e3;
    writeChain = Promise.resolve();
  }
});

// src/agent/orchestrator.ts
var orchestrator_exports = {};
__export(orchestrator_exports, {
  AgentOrchestrator: () => AgentOrchestrator
});
function estimateTokens(messages, tools) {
  let system = 0;
  let history = 0;
  let historyCount = 0;
  for (const m of messages) {
    const len = Math.ceil((m.content?.length ?? 0) / 3.5);
    if (m.role === "system") {
      system += len;
    } else {
      history += len;
      historyCount++;
    }
  }
  let toolTokens = 0;
  for (const t of tools) {
    toolTokens += Math.ceil(JSON.stringify(t).length / 3.5);
  }
  return { system, history, historyCount, tools: toolTokens, total: system + history + toolTokens };
}
function pickApology() {
  return APOLOGY_FALLBACKS[Math.floor(Math.random() * APOLOGY_FALLBACKS.length)];
}
function stripToolXML(text) {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").replace(/<function=[\s\S]*?<\/function>/g, "").replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "").trim();
}
function callSignature(call) {
  return `${call.name}|${JSON.stringify(call.args ?? {})}`;
}
function partitionCalls(calls, alreadyCalled) {
  const novelCalls = [];
  const duplicateCalls = [];
  for (const call of calls) {
    if (alreadyCalled.has(callSignature(call))) duplicateCalls.push(call);
    else novelCalls.push(call);
  }
  return { novelCalls, duplicateCalls };
}
var LLM_TIMEOUT_MS, TOOL_PHASE_TIMEOUT_MS, WEB_SEARCH_TIMEOUT_MS, SLOW_TOOL_THRESHOLD_MS, MAX_HISTORY_MESSAGES, LONG_ANSWER_CHAR_LIMIT, APOLOGY_FALLBACKS, AgentOrchestrator;
var init_orchestrator = __esm({
  "src/agent/orchestrator.ts"() {
    "use strict";
    init_tools2();
    init_debug_logger();
    LLM_TIMEOUT_MS = 1e4;
    TOOL_PHASE_TIMEOUT_MS = 12e3;
    WEB_SEARCH_TIMEOUT_MS = 8e3;
    SLOW_TOOL_THRESHOLD_MS = 3e3;
    MAX_HISTORY_MESSAGES = 40;
    LONG_ANSWER_CHAR_LIMIT = 80;
    APOLOGY_FALLBACKS = [
      "\u62B1\u6B49\uFF0C\u6211\u8FD9\u8FB9\u51FA\u4E86\u70B9\u5C0F\u95EE\u9898\uFF0C\u4F60\u80FD\u518D\u8BF4\u4E00\u904D\u5417\uFF1F",
      "\u4E0D\u597D\u610F\u601D\uFF0C\u521A\u624D\u6CA1\u5904\u7406\u597D\uFF0C\u53EF\u4EE5\u518D\u8BD5\u4E00\u6B21\u5417\uFF1F",
      "\u7CDF\u7CD5\uFF0C\u6211\u5361\u4F4F\u4E86\u3002\u6362\u4E2A\u8BF4\u6CD5\u518D\u8BD5\u8BD5\uFF1F",
      "\u62B1\u6B49\uFF0C\u8FD9\u6B21\u6CA1\u641E\u5B9A\uFF0C\u80FD\u4E0D\u80FD\u91CD\u65B0\u8BF4\u4E00\u4E0B\uFF1F",
      "\u55EF\u2026\u2026\u597D\u50CF\u6709\u70B9\u6545\u969C\uFF0C\u9EBB\u70E6\u518D\u8BB2\u4E00\u6B21\u3002"
    ];
    AgentOrchestrator = class {
      constructor(opts) {
        this.history = [];
        this.roundCount = 0;
        this.abortController = null;
        this.interrupted = false;
        this.provider = opts.provider;
        this.toolExecutor = opts.toolExecutor;
        this.systemPromptBuilder = opts.systemPromptBuilder;
      }
      async run(userInput, callbacks) {
        this.interrupted = false;
        this.roundCount++;
        this.history.push({ role: "user", content: userInput });
        const messages = this.buildMessages();
        const tools = TOOL_DEFINITIONS;
        const r1 = await this.callLLM(messages, tools, "R1");
        if (this.interrupted) return "";
        if (r1.error) {
          return this.finalize(pickApology());
        }
        if (r1.response.toolCalls.length === 0) {
          const final2 = r1.response.content ?? pickApology();
          return this.finalize(final2);
        }
        if (r1.response.content) callbacks?.onPartial?.(r1.response.content);
        messages.push({
          role: "assistant",
          content: r1.response.content,
          tool_calls: r1.response.toolCalls
        });
        const r1Results = await this.runToolPhase(r1.response.toolCalls, callbacks);
        if (this.interrupted) return "";
        this.pushToolResults(messages, r1Results);
        const r1Signatures = new Set(
          r1.response.toolCalls.map((c) => callSignature(c))
        );
        const r2 = await this.callLLM(messages, tools, "R2");
        if (this.interrupted) return "";
        if (r2.error) {
          return this.finalize(pickApology());
        }
        let duplicateLoopDetected = false;
        if (r2.response.toolCalls.length === 0) {
          const r2Content = r2.response.content ?? "";
          const usedBulkTool = r1.response.toolCalls.some(
            (c) => c.name === "web_search" || c.name === "search"
          );
          const overSpokenLimit = r2Content.length > LONG_ANSWER_CHAR_LIMIT;
          if (!(usedBulkTool && overSpokenLimit)) {
            return this.finalize(r2Content || pickApology());
          }
          debugLog(
            "LOOP",
            `R2 over-long answer (${r2Content.length} chars) after bulk tool \u2014 forcing R3 summary`
          );
          messages.push({ role: "assistant", content: r2Content });
        } else {
          if (r2.response.content) callbacks?.onPartial?.(r2.response.content);
          messages.push({
            role: "assistant",
            content: r2.response.content,
            tool_calls: r2.response.toolCalls
          });
          const { novelCalls, duplicateCalls } = partitionCalls(r2.response.toolCalls, r1Signatures);
          if (duplicateCalls.length > 0) {
            duplicateLoopDetected = duplicateCalls.length === r2.response.toolCalls.length;
            for (const dup of duplicateCalls) {
              debugLog("LOOP", `R2 duplicate tool ${dup.name} ${JSON.stringify(dup.args ?? {})} \u2014 short-circuiting`);
              messages.push({
                role: "tool",
                content: "This tool has already been called with the same arguments in this turn. The previous result is in the conversation above \u2014 use it instead of asking again.",
                tool_call_id: dup.id
              });
            }
          }
          const r2Results = novelCalls.length > 0 ? await this.runToolPhase(novelCalls, callbacks) : [];
          if (this.interrupted) return "";
          this.pushToolResults(messages, r2Results);
        }
        const r3Instruction = duplicateLoopDetected ? "The user's request may be ambiguous. Ask one short clarifying question." : "Summarize the tool results above for the user in a short, spoken-style reply. Three to five sentences.";
        messages.push({ role: "system", content: r3Instruction });
        const r3 = await this.callLLM(messages, [], "R3");
        if (this.interrupted) return "";
        let final = r3.error ? "" : r3.response.content ?? "";
        final = stripToolXML(final);
        if (!final) {
          debugLog("LLM", `R3 empty after strip (raw ${r3.response?.content?.length ?? 0} chars)`);
          final = pickApology();
        }
        return this.finalize(final);
      }
      abort() {
        this.interrupted = true;
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }
      clearHistory() {
        this.history = [];
        this.roundCount = 0;
      }
      getHistory() {
        return this.history;
      }
      dispose() {
        if (this.abortController) {
          this.abortController.abort();
        }
        this.history = [];
      }
      // ---------- internals ----------
      finalize(finalContent) {
        this.history.push({ role: "assistant", content: finalContent });
        this.trimHistory();
        return finalContent;
      }
      async callLLM(messages, tools, roundLabel) {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        const est = estimateTokens(messages, tools);
        debugLog(
          "TOKENS",
          `${roundLabel ?? "?"} system=${est.system} history=${est.history}(${est.historyCount}msg) tools=${est.tools} total=${est.total}`
        );
        const timeoutId = setTimeout(() => {
          this.abortController?.abort();
        }, LLM_TIMEOUT_MS);
        try {
          const response = await this.provider.chat({ messages, tools, signal });
          return { response };
        } catch (err) {
          const reason = signal.aborted ? "timeout/aborted" : err?.message;
          debugLog("LLM", `call failed: ${reason}`);
          return { error: err };
        } finally {
          clearTimeout(timeoutId);
          this.abortController = null;
        }
      }
      /**
       * Execute all toolCalls in parallel (fan-out).
       * - web_search: 8s per-tool timeout
       * - others: no per-tool timeout (local vault ops; 12s phase cap is the safety net)
       * - phase total: 12s — any laggard gets a synthetic timeout result
       * - any failure/timeout is returned verbatim to the LLM (no special handling)
       */
      async runToolPhase(toolCalls, callbacks) {
        if (toolCalls.length === 0) return [];
        callbacks?.onToolStart?.(toolCalls);
        const slowTimers = /* @__PURE__ */ new Map();
        for (const call of toolCalls) {
          const t = setTimeout(() => {
            callbacks?.onToolSlow?.(call.name);
          }, SLOW_TOOL_THRESHOLD_MS);
          slowTimers.set(call.id, t);
        }
        const perCall = toolCalls.map((call) => this.runSingleTool(call, slowTimers));
        const phaseTimeout = new Promise((resolve) => {
          setTimeout(() => {
            const synthetic = toolCalls.map((c) => ({
              id: c.id,
              content: `Error: tool phase exceeded ${TOOL_PHASE_TIMEOUT_MS / 1e3}s timeout`,
              success: false
            }));
            resolve(synthetic);
          }, TOOL_PHASE_TIMEOUT_MS);
        });
        const results = await Promise.race([Promise.all(perCall), phaseTimeout]);
        for (const t of slowTimers.values()) clearTimeout(t);
        return results;
      }
      async runSingleTool(call, slowTimers) {
        const perToolTimeout = call.name === "web_search" ? WEB_SEARCH_TIMEOUT_MS : 0;
        const execPromise = this.toolExecutor.execute(call).then((r) => {
          const t = slowTimers.get(call.id);
          if (t) {
            clearTimeout(t);
            slowTimers.delete(call.id);
          }
          return r;
        });
        if (perToolTimeout === 0) return execPromise;
        return Promise.race([
          execPromise,
          new Promise(
            (resolve) => setTimeout(
              () => resolve({
                id: call.id,
                content: `Error: ${call.name} timed out after ${perToolTimeout / 1e3}s`,
                success: false
              }),
              perToolTimeout
            )
          )
        ]);
      }
      pushToolResults(messages, results) {
        for (const r of results) {
          messages.push({ role: "tool", content: r.content, tool_call_id: r.id });
        }
      }
      buildMessages() {
        const systemPrompt = this.systemPromptBuilder();
        const dateMatch = systemPrompt.match(/Today's date:\s*([^\n]+)/);
        if (dateMatch) debugLog("PROMPT", `injected date: ${dateMatch[1]}`);
        return [{ role: "system", content: systemPrompt }, ...this.history];
      }
      trimHistory() {
        if (this.history.length > MAX_HISTORY_MESSAGES) {
          const removed = this.history.length - MAX_HISTORY_MESSAGES;
          this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
          debugLog("HISTORY", `trimmed ${removed} old messages, keeping last ${MAX_HISTORY_MESSAGES}`);
        }
      }
    };
  }
});

// src/constants.ts
var DEFAULT_ASR_MODEL, DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE, DEFAULT_SAMPLE_RATE;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    DEFAULT_ASR_MODEL = "stepaudio-2.5-asr";
    DEFAULT_TTS_MODEL = "stepaudio-2.5-tts";
    DEFAULT_TTS_VOICE = "youyanvsheng";
    DEFAULT_SAMPLE_RATE = 16e3;
  }
});

// src/utils/request-url-with-abort.ts
function getRequestUrl() {
  if (cachedRequestUrl !== void 0) return cachedRequestUrl;
  try {
    const mod = require("obsidian");
    cachedRequestUrl = typeof mod?.requestUrl === "function" ? mod.requestUrl : null;
  } catch {
    cachedRequestUrl = null;
  }
  return cachedRequestUrl ?? null;
}
async function requestUrlWithAbort(opts, signal) {
  if (signal?.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }
  const ru = getRequestUrl();
  if (ru) {
    return requestViaObsidian(ru, opts, signal);
  }
  return requestViaFetch(opts, signal);
}
async function requestViaObsidian(ru, opts, signal) {
  if (!signal) {
    const r = await ru({ ...opts, throw: false });
    return { status: r.status, text: r.text, json: r.json };
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    ru({ ...opts, throw: false }).then((r) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return;
      resolve({ status: r.status, text: r.text, json: r.json });
    }).catch((err) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return;
      reject(err);
    });
  });
}
async function requestViaFetch(opts, signal) {
  const response = await fetch(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    signal
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
  }
  return { status: response.status, text, json };
}
var cachedRequestUrl;
var init_request_url_with_abort = __esm({
  "src/utils/request-url-with-abort.ts"() {
    "use strict";
  }
});

// src/providers/llm/openai.ts
var OpenAIProvider;
var init_openai = __esm({
  "src/providers/llm/openai.ts"() {
    "use strict";
    init_request_url_with_abort();
    OpenAIProvider = class {
      constructor(endpoint, apiKey, model, temperature) {
        this.id = "openai-provider";
        this.name = "OpenAI Compatible Provider";
        this.config = { endpoint, apiKey, model, temperature };
        this.chatURL = this.buildChatURL(endpoint);
      }
      async chat(request) {
        const apiMessages = request.messages.map((msg2) => {
          const apiMsg = {
            role: msg2.role,
            content: msg2.content
          };
          if (msg2.tool_calls && msg2.tool_calls.length > 0) {
            apiMsg.tool_calls = msg2.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args)
              }
            }));
          }
          if (msg2.tool_call_id) {
            apiMsg.tool_call_id = msg2.tool_call_id;
          }
          return apiMsg;
        });
        const body = {
          model: this.config.model,
          messages: apiMessages,
          temperature: this.config.temperature
        };
        if (request.tools?.length) {
          body.tools = request.tools.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }));
        }
        const response = await requestUrlWithAbort(
          {
            url: this.chatURL,
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          },
          request.signal
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`OpenAI API error (${response.status}): ${response.text}`);
        }
        const data = response.json;
        const msg = data.choices?.[0]?.message;
        if (!msg) {
          throw new Error("LLM response missing message");
        }
        const toolCalls = (msg.tool_calls ?? []).map(
          (tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments)
          })
        );
        return {
          content: msg.content ?? null,
          toolCalls
        };
      }
      dispose() {
      }
      buildChatURL(endpoint) {
        const url = endpoint.trim().replace(/\/+$/, "");
        if (/\/chat\/completions?$/.test(url)) {
          return url;
        }
        const base = url.endsWith("/v1") ? url : `${url}/v1`;
        return `${base}/chat/completions`;
      }
    };
  }
});

// src/utils/endpoint.ts
function getStepFunEndpoint(region, mode, service) {
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  return `https://api.${domain}/${prefix}v1/${service}`;
}
function getChatEndpoint(region, mode) {
  return getStepFunEndpoint(region, mode, "chat/completions");
}
var init_endpoint = __esm({
  "src/utils/endpoint.ts"() {
    "use strict";
  }
});

// src/providers/llm/entries/stepfun.ts
var stepfunEntry;
var init_stepfun = __esm({
  "src/providers/llm/entries/stepfun.ts"() {
    "use strict";
    init_openai();
    init_endpoint();
    stepfunEntry = {
      id: "stepfun",
      name: "StepFun",
      configSchema: [
        {
          key: "stepfunMode",
          label: "LLM billing mode",
          type: "select",
          options: [
            { value: "plan", label: "Coding Plan" },
            { value: "api", label: "API" }
          ],
          defaultValue: "plan",
          description: "Billing mode for LLM calls. Independent of the ASR/TTS billing mode."
        },
        {
          key: "model",
          label: "Model",
          type: "text",
          defaultValue: "step-3.5-flash"
        },
        {
          key: "temperature",
          label: "Temperature",
          type: "number",
          defaultValue: 0.3
        }
      ],
      create(config, globalCtx) {
        const stepfunMode = config.stepfunMode ?? "plan";
        const model = config.model ?? "step-3.5-flash";
        const temperature = config.temperature ?? 0.3;
        const endpoint = getChatEndpoint(globalCtx.stepfun.region, stepfunMode);
        return new OpenAIProvider(endpoint, globalCtx.stepfun.apiKey, model, temperature);
      }
    };
  }
});

// src/providers/llm/entries/openai.ts
var OPENAI_ENDPOINT, openaiEntry;
var init_openai2 = __esm({
  "src/providers/llm/entries/openai.ts"() {
    "use strict";
    init_openai();
    OPENAI_ENDPOINT = "https://api.openai.com/v1";
    openaiEntry = {
      id: "openai",
      name: "OpenAI",
      configSchema: [
        { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-..." },
        { key: "model", label: "Model", type: "text", defaultValue: "gpt-4o-mini" },
        { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 }
      ],
      create(config) {
        const apiKey = config.apiKey ?? "";
        const model = config.model ?? "gpt-4o-mini";
        const temperature = config.temperature ?? 0.3;
        return new OpenAIProvider(OPENAI_ENDPOINT, apiKey, model, temperature);
      }
    };
  }
});

// src/providers/llm/anthropic.ts
var AnthropicProvider;
var init_anthropic = __esm({
  "src/providers/llm/anthropic.ts"() {
    "use strict";
    init_request_url_with_abort();
    AnthropicProvider = class {
      constructor(endpoint, apiKey, model, temperature) {
        this.id = "anthropic-provider";
        this.name = "Anthropic Provider";
        const base = endpoint.trim().replace(/\/+$/, "");
        const normalized = base.endsWith("/v1") ? base : `${base}/v1`;
        this.config = { endpoint: normalized, apiKey, model, temperature };
      }
      async chat(request) {
        const url = `${this.config.endpoint}/messages`;
        const systemParts = [];
        const convoMessages = request.messages.filter((m) => {
          if (m.role === "system") {
            if (m.content) systemParts.push(m.content);
            return false;
          }
          return true;
        });
        const body = {
          model: this.config.model,
          messages: convoMessages,
          temperature: this.config.temperature,
          max_tokens: 4096
        };
        if (systemParts.length > 0) {
          body.system = systemParts.join("\n\n");
        }
        if (request.tools?.length) {
          body.tools = request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters
          }));
        }
        const response = await requestUrlWithAbort(
          {
            url,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.config.apiKey,
              "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(body)
          },
          request.signal
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Anthropic API error (${response.status}): ${response.text}`);
        }
        const data = response.json;
        const textContent = data.content?.find((c) => c.type === "text")?.text ?? null;
        const toolUses = data.content?.filter((c) => c.type === "tool_use") ?? [];
        const toolCalls = toolUses.map((tu) => ({
          id: tu.id,
          name: tu.name,
          args: tu.input
        }));
        return {
          content: textContent,
          toolCalls
        };
      }
      dispose() {
      }
    };
  }
});

// src/providers/llm/entries/anthropic.ts
var ANTHROPIC_ENDPOINT, anthropicEntry;
var init_anthropic2 = __esm({
  "src/providers/llm/entries/anthropic.ts"() {
    "use strict";
    init_anthropic();
    ANTHROPIC_ENDPOINT = "https://api.anthropic.com";
    anthropicEntry = {
      id: "anthropic",
      name: "Anthropic",
      configSchema: [
        { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-ant-..." },
        { key: "model", label: "Model", type: "text", defaultValue: "claude-3-5-sonnet-latest" },
        { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 }
      ],
      create(config) {
        const apiKey = config.apiKey ?? "";
        const model = config.model ?? "claude-3-5-sonnet-latest";
        const temperature = config.temperature ?? 0.3;
        return new AnthropicProvider(ANTHROPIC_ENDPOINT, apiKey, model, temperature);
      }
    };
  }
});

// src/providers/llm/entries/custom.ts
var customEntry;
var init_custom = __esm({
  "src/providers/llm/entries/custom.ts"() {
    "use strict";
    init_openai();
    customEntry = {
      id: "custom",
      name: "Custom (OpenAI-compatible)",
      configSchema: [
        {
          key: "endpoint",
          label: "Endpoint",
          type: "text",
          placeholder: "http://localhost:11434/v1",
          description: "OpenAI-compatible base URL. Examples: ollama (http://localhost:11434/v1), vLLM, LM Studio."
        },
        {
          key: "apiKey",
          label: "API Key",
          type: "password",
          description: "Leave blank for local services that don't validate."
        },
        { key: "model", label: "Model", type: "text", placeholder: "llama3.2" },
        { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.3 }
      ],
      create(config) {
        const endpoint = config.endpoint ?? "";
        const apiKey = config.apiKey ?? "";
        const model = config.model ?? "";
        const temperature = config.temperature ?? 0.3;
        return new OpenAIProvider(endpoint, apiKey, model, temperature);
      }
    };
  }
});

// src/providers/llm/registry.ts
function getLLMProviderEntry(id) {
  return LLM_PROVIDERS.find((p) => p.id === id);
}
var LLM_PROVIDERS;
var init_registry = __esm({
  "src/providers/llm/registry.ts"() {
    "use strict";
    init_stepfun();
    init_openai2();
    init_anthropic2();
    init_custom();
    LLM_PROVIDERS = [
      stepfunEntry,
      openaiEntry,
      anthropicEntry,
      customEntry
    ];
  }
});

// src/agent/prompt/blocks/identity.ts
var DEFAULT_IDENTITY, identity;
var init_identity = __esm({
  "src/agent/prompt/blocks/identity.ts"() {
    "use strict";
    DEFAULT_IDENTITY = "You are StepVox, a sharp and witty personal secretary living inside Obsidian.";
    identity = {
      id: "identity",
      editable: true,
      label: "Identity",
      storageKey: "identity",
      default: DEFAULT_IDENTITY,
      render(ctx) {
        const user = ctx.settings.prompt.identity?.trim();
        return user && user.length > 0 ? user : DEFAULT_IDENTITY;
      }
    };
  }
});

// src/agent/prompt/blocks/vocabulary.ts
var vocabulary;
var init_vocabulary = __esm({
  "src/agent/prompt/blocks/vocabulary.ts"() {
    "use strict";
    vocabulary = {
      id: "vocabulary",
      editable: false,
      render(ctx) {
        const vaultName = ctx.app.vault.getName();
        return `## Vocabulary
Treat the following terms as interchangeable: "vault", "workspace", "work space", "work-space", "notebook", "knowledge base", "notes". They all refer to the single Obsidian vault the user is in right now ("${vaultName}"). Never ask which workspace \u2014 there is exactly one.`;
      }
    };
  }
});

// src/agent/prompt/blocks/capabilities.ts
var capabilities;
var init_capabilities = __esm({
  "src/agent/prompt/blocks/capabilities.ts"() {
    "use strict";
    capabilities = {
      id: "capabilities",
      editable: false,
      render() {
        return `## Capabilities
- You HEAR the user through speech recognition (ASR).
- You SPEAK to the user through text-to-speech (TTS).
- You are a voice assistant with full audio I/O.`;
      }
    };
  }
});

// src/agent/prompt/blocks/personality.ts
var DEFAULT_TRAITS, personality;
var init_personality = __esm({
  "src/agent/prompt/blocks/personality.ts"() {
    "use strict";
    DEFAULT_TRAITS = `- Efficient: results first, no filler.
- Playful: light humor on errors or idle chat, never robotic.`;
    personality = {
      id: "personality",
      editable: true,
      label: "Personality traits",
      storageKey: "personalityTraits",
      default: DEFAULT_TRAITS,
      render(ctx) {
        const user = ctx.settings.prompt.personalityTraits?.trim();
        const body = user && user.length > 0 ? user : DEFAULT_TRAITS;
        return `## Personality
${body}`;
      }
    };
  }
});

// src/agent/prompt/blocks/response_length.ts
var responseLength;
var init_response_length = __esm({
  "src/agent/prompt/blocks/response_length.ts"() {
    "use strict";
    responseLength = {
      id: "response-length",
      editable: false,
      render() {
        return `## Response Length \u2014 this is VOICE OUTPUT, treat it as a phone call, not a webpage
- HARD CEILING: 80 Chinese characters OR 50 English words OR 3 sentences per reply. Exceeding this is a failure, not a thoroughness bonus.
- Chit-chat, confirmation, acknowledgement \u2192 one short sentence.
- Action completed (file created, property updated, etc.) \u2192 one short sentence confirming what was done.
- Information retrieval (search results, file content, web research) \u2192 SUMMARIZE, do not recite. Pick the single most important fact for the user's specific question and say it. NEVER paste raw search results, numbered lists, date/statistic dumps, or section headings. If there is more to say, end with a short offer such as "Want the details?" \u2014 do NOT dump the detail yourself.
- If the user explicitly asks for more ("detail", "more", "elaborate", "expand") you MAY go up to ~200 characters, still as flowing speech, still no raw dumps.
- The user can interrupt you at any time (Session Mode). Put the most important thing FIRST so an interruption does not lose the point.`;
      }
    };
  }
});

// src/agent/prompt/blocks/behavior_rules.ts
var behaviorRules;
var init_behavior_rules = __esm({
  "src/agent/prompt/blocks/behavior_rules.ts"() {
    "use strict";
    behaviorRules = {
      id: "behavior-rules",
      editable: false,
      render() {
        return `## Behavior Rules
- User has explicit action intent (create / modify / delete / record / append) \u2192 invoke tools.
- User asks to READ, VIEW, or CHECK any file/note content \u2192 MUST call read_file. Do NOT answer from context or memory \u2014 always fetch fresh content via tool.
- User asks what files exist or what is in a folder \u2192 MUST call list_files. Do NOT rely on any directory listing in context.
- User asks about the current/active file \u2192 use the "Active file" path from Current Context below directly. No tool call needed to identify which file is active.
- High-risk operations (delete / move / rename) \u2192 confirm in the response first, execute only on the next turn.`;
      }
    };
  }
});

// src/agent/prompt/blocks/locating.ts
var locating;
var init_locating = __esm({
  "src/agent/prompt/blocks/locating.ts"() {
    "use strict";
    locating = {
      id: "locating",
      editable: false,
      render() {
        return `## Locating Things in the Vault \u2014 READ THIS
The "Vault Structure" block below lists the top two levels of folders. Consult it BEFORE calling any tool that takes a path.
- If the user names a folder roughly ("workspace", "my reports folder", "projects") \u2192 match it against the Vault Structure first. If you see the folder there, use it directly. No exploration needed.
- If you still cannot pinpoint the path (looking for a specific file, a deeply-nested folder, or an ambiguous name) \u2192 call \`find_path\` with a substring query. ONE call usually resolves it.
- Do NOT chain \`list_files\` calls trying to map out the vault \u2014 that was the old, wrong pattern. Use the snapshot below and \`find_path\` instead.
- When you create a file with \`create_file\`, put it in a sensible location the user has mentioned. If they said "workspace" and the snapshot has a "workspace/" folder, the path must begin with "workspace/". Never dump files at the vault root unless the user explicitly asked for the root.`;
      }
    };
  }
});

// src/agent/prompt/blocks/tool_choice.ts
var toolChoice;
var init_tool_choice = __esm({
  "src/agent/prompt/blocks/tool_choice.ts"() {
    "use strict";
    toolChoice = {
      id: "tool-choice",
      editable: false,
      render() {
        return `## Tool Choice \u2014 Vault vs Web
You have both \`search\` (the user's LOCAL Obsidian vault) and \`web_search\` (the live internet). Pick based on WHERE the answer actually lives.
- Personal content \u2014 the user's own notes, projects, tasks, things they've written down \u2192 \`search\`.
- The outside world \u2014 news, current events, companies, public figures, product releases, prices, stocks, weather, anything with a year/date reference, anything phrased "latest", "recent", "what is X", "who is X", "when did X happen" \u2192 \`web_search\`.
- When unsure: if the topic is a factual real-world query (company, person, event, product, number), prefer \`web_search\`. If the topic is clearly personal ("my notes on X", "that meeting last week"), prefer \`search\`.
- Never claim you searched online if \`web_search\` was not provided as a tool this turn \u2014 just say you cannot look it up online.`;
      }
    };
  }
});

// src/agent/prompt/blocks/other_rules.ts
var otherRules;
var init_other_rules = __esm({
  "src/agent/prompt/blocks/other_rules.ts"() {
    "use strict";
    otherRules = {
      id: "other-rules",
      editable: false,
      render() {
        return `## Other Rules
- Always respond in the same language the user spoke. If the user mixes languages, match the dominant one.
- General questions that do not need any tool \u2192 just respond, no tool calls.
- Writing tasks (write doc / write note / write report / draft / compose) \u2192 ask ONE clarifying question first before writing: purpose, audience, format/length, or key points \u2014 pick the most important unknown. Only one question per turn.
- When uncertain about vault state, use read_file or search to gather info, then answer.
- CRITICAL \u2014 when calling tools, you MUST include short text content alongside tool_calls (e.g. "Let me check.", "I'll search for that."). That text is spoken immediately while the tool runs, giving instant feedback. NEVER return tool_calls without accompanying text.
- Tools may fail or time out. If a tool result contains "Error:" or "Timeout:", tell the user in plain language what went wrong and suggest a next step. Do not retry silently.
- NEVER invent or assume file contents. Even if context seems to show file info, you MUST call the appropriate tool for authoritative data.
- IMPORTANT: avoid markdown formatting (no *, **, _, __, #, -, etc.) \u2014 the response will be read aloud by TTS. Use plain prose.`;
      }
    };
  }
});

// src/agent/prompt/blocks/current_context.ts
function formatToday() {
  const d = /* @__PURE__ */ new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const weekdayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${yyyy}-${mm}-${dd} ${weekdayEn}`;
}
var currentContext;
var init_current_context = __esm({
  "src/agent/prompt/blocks/current_context.ts"() {
    "use strict";
    currentContext = {
      id: "current-context",
      editable: false,
      render(ctx) {
        const vaultName = ctx.app.vault.getName();
        const activeFile = ctx.app.workspace.getActiveFile();
        const fileLine = activeFile ? `
- Active file: ${activeFile.path}` : "";
        return `## Current Context
- Today's date: ${formatToday()} \u2014 use this as the authoritative "now". When the user says "this year", "today", "recent", or "latest", resolve against this date, not your training cutoff.
- Vault: ${vaultName}${fileLine}`;
      }
    };
  }
});

// src/agent/prompt/blocks/vault_structure.ts
var vaultStructure;
var init_vault_structure = __esm({
  "src/agent/prompt/blocks/vault_structure.ts"() {
    "use strict";
    vaultStructure = {
      id: "vault-structure",
      editable: false,
      render(ctx) {
        const snapshot = ctx.vaultSnapshot?.trim();
        if (!snapshot) return "";
        return `## Vault Structure (captured at session start, 2-level deep)
${snapshot}`;
      }
    };
  }
});

// src/agent/prompt/index.ts
function buildSystemPrompt(app2, settings, vaultSnapshot) {
  const ctx = { app: app2, settings, vaultSnapshot };
  return PROMPT_BLOCKS.map((b) => b.render(ctx).trim()).filter((s) => s.length > 0).join("\n\n");
}
var PROMPT_BLOCKS;
var init_prompt = __esm({
  "src/agent/prompt/index.ts"() {
    "use strict";
    init_identity();
    init_vocabulary();
    init_capabilities();
    init_personality();
    init_response_length();
    init_behavior_rules();
    init_locating();
    init_tool_choice();
    init_other_rules();
    init_current_context();
    init_vault_structure();
    PROMPT_BLOCKS = [
      identity,
      vocabulary,
      capabilities,
      personality,
      responseLength,
      behaviorRules,
      locating,
      toolChoice,
      otherRules,
      currentContext,
      vaultStructure
    ];
  }
});

// src/settings.ts
var import_obsidian7, SETTINGS_SCHEMA_VERSION, DEFAULT_SETTINGS;
var init_settings = __esm({
  "src/settings.ts"() {
    "use strict";
    init_constants();
    import_obsidian7 = require("obsidian");
    init_registry();
    init_prompt();
    SETTINGS_SCHEMA_VERSION = 2;
    DEFAULT_SETTINGS = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      stepfun: {
        region: "china",
        mode: "plan",
        apiKey: ""
      },
      asr: {
        provider: "stepfun",
        model: DEFAULT_ASR_MODEL,
        language: "zh"
      },
      tts: {
        enabled: true,
        provider: "stepfun",
        model: DEFAULT_TTS_MODEL,
        voice: DEFAULT_TTS_VOICE,
        speed: 1
      },
      llm: {
        activeProvider: "stepfun",
        providerConfigs: {
          stepfun: { stepfunMode: "plan", model: "step-3.5-flash", temperature: 0.3 }
        }
      },
      interaction: {
        enableSessionMode: false
      },
      audio: {
        sampleRate: DEFAULT_SAMPLE_RATE,
        noiseSuppression: true,
        echoCancellation: true
      },
      search: {
        provider: "none",
        apiKey: ""
      },
      prompt: {
        identity: "",
        personalityTraits: ""
      },
      debug: {
        enabled: false
      }
    };
  }
});

// src/agent/system-prompt.ts
var system_prompt_exports = {};
__export(system_prompt_exports, {
  buildSystemPrompt: () => buildSystemPrompt2
});
function buildSystemPrompt2(app2, vaultStructure2, settings = DEFAULT_SETTINGS) {
  return buildSystemPrompt(app2, settings, vaultStructure2 ?? null);
}
var init_system_prompt = __esm({
  "src/agent/system-prompt.ts"() {
    "use strict";
    init_settings();
    init_prompt();
  }
});

// src/providers/llm/factory.ts
var factory_exports = {};
__export(factory_exports, {
  createLLMProvider: () => createLLMProvider
});
function buildGlobalCtx(settings) {
  return {
    stepfun: {
      region: settings.stepfun.region,
      mode: settings.stepfun.mode,
      apiKey: settings.stepfun.apiKey
    }
  };
}
function createLLMProvider(settings) {
  const activeId = settings.llm.activeProvider;
  const entry = getLLMProviderEntry(activeId);
  if (!entry) {
    const known = LLM_PROVIDERS.map((p) => p.id).join(", ");
    throw new Error(
      `Unknown LLM provider: "${activeId}". Known: ${known}.`
    );
  }
  const config = settings.llm.providerConfigs[activeId] ?? {};
  return entry.create(config, buildGlobalCtx(settings));
}
var init_factory = __esm({
  "src/providers/llm/factory.ts"() {
    "use strict";
    init_registry();
  }
});

// src/providers/search.ts
var search_exports = {};
__export(search_exports, {
  ExaProvider: () => ExaProvider,
  TavilyProvider: () => TavilyProvider
});
var import_obsidian8, TavilyProvider, ExaProvider;
var init_search2 = __esm({
  "src/providers/search.ts"() {
    "use strict";
    import_obsidian8 = require("obsidian");
    TavilyProvider = class {
      constructor(apiKey) {
        this.apiKey = apiKey;
      }
      async search(query) {
        try {
          const resp = await (0, import_obsidian8.requestUrl)({
            url: "https://api.tavily.com/search",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: this.apiKey,
              query,
              include_raw_content: true,
              max_results: 5
            })
          });
          const data = resp.json;
          return (data.results ?? []).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.raw_content ?? r.content ?? ""
          }));
        } catch (err) {
          throw new Error(`Tavily search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    ExaProvider = class {
      constructor(apiKey) {
        this.apiKey = apiKey;
      }
      async search(query) {
        try {
          const resp = await (0, import_obsidian8.requestUrl)({
            url: "https://api.exa.ai/search",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey
            },
            body: JSON.stringify({
              query,
              contents: { text: true },
              numResults: 5
            })
          });
          const data = resp.json;
          return (data.results ?? []).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.text ?? ""
          }));
        } catch (err) {
          throw new Error(`Exa search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
  }
});

// tests/integration/runner.ts
var runner_exports = {};
__export(runner_exports, {
  runIntegrationTests: () => runIntegrationTests,
  runWebSearchTest: () => runWebSearchTest
});
module.exports = __toCommonJS(runner_exports);

// src/agent/tool-executor.ts
init_tools2();

// src/agent/vault-snapshot.ts
var import_obsidian6 = require("obsidian");
var PER_LEVEL_CAP = 30;
function snapshotVaultStructure(app2) {
  const root = app2.vault.getRoot();
  const topFolders = root.children.filter((c) => c instanceof import_obsidian6.TFolder).sort((a, b) => a.name.localeCompare(b.name));
  if (topFolders.length === 0) return "(vault has no subfolders)";
  const lines = [];
  const truncated = topFolders.slice(0, PER_LEVEL_CAP);
  for (const folder of truncated) {
    lines.push(`${folder.name}/`);
    const subs = folder.children.filter((c) => c instanceof import_obsidian6.TFolder).sort((a, b) => a.name.localeCompare(b.name));
    const subTruncated = subs.slice(0, PER_LEVEL_CAP);
    for (const sub of subTruncated) {
      lines.push(`  ${folder.name}/${sub.name}/`);
    }
    if (subs.length > PER_LEVEL_CAP) {
      lines.push(`  ...(+${subs.length - PER_LEVEL_CAP} more subfolders)`);
    }
  }
  if (topFolders.length > PER_LEVEL_CAP) {
    lines.push(`...(+${topFolders.length - PER_LEVEL_CAP} more top-level folders)`);
  }
  return lines.join("\n");
}

// src/agent/tool-executor.ts
var ToolExecutor = class {
  constructor(app2, pluginDataDir) {
    this.searchProvider = null;
    this.app = app2;
    this.pluginDataDir = pluginDataDir;
  }
  setSearchProvider(provider) {
    this.searchProvider = provider;
  }
  async execute(call) {
    const tool = getToolByName2(call.name);
    if (!tool) {
      return {
        id: call.id,
        content: `Unknown tool: ${call.name}`,
        success: false
      };
    }
    const ctx = {
      app: this.app,
      pluginDataDir: this.pluginDataDir,
      activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
      services: {
        search: this.searchProvider
      }
    };
    try {
      const content = await tool.execute(call.args, ctx);
      return { id: call.id, content, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: call.id, content: `Error: ${msg}`, success: false };
    }
  }
  /**
   * Capture a 2-level folder snapshot of the vault for prompt injection (D52).
   * Lives here for backwards compatibility with VoicePipeline's existing
   * `toolExecutor.snapshotVaultStructure()` call site; the canonical helper
   * is in `agent/vault-snapshot.ts`.
   */
  snapshotVaultStructure() {
    return snapshotVaultStructure(this.app);
  }
};

// tests/integration/runner.ts
init_orchestrator();
init_system_prompt();

// tests/integration/helpers.ts
function expectToolCalled(toolLog, name) {
  const found = toolLog.some((c) => c.name === name);
  return {
    pass: found,
    detail: found ? `Tool "${name}" was called` : `Expected tool "${name}" but got: [${toolLog.map((c) => c.name).join(", ")}]`
  };
}
async function expectFileExists(app2, path) {
  const file = app2.vault.getAbstractFileByPath(path);
  return {
    pass: file !== null,
    detail: file ? `File exists: ${path}` : `File not found: ${path}`
  };
}
async function expectFileContains(app2, path, substring) {
  const file = app2.vault.getAbstractFileByPath(path);
  if (!file) return { pass: false, detail: `File not found: ${path}` };
  const content = await app2.vault.cachedRead(file);
  const found = content.includes(substring);
  return {
    pass: found,
    detail: found ? `File contains "${substring}"` : `File does not contain "${substring}". Content: ${content.slice(0, 200)}`
  };
}
async function expectFileNotExists(app2, path) {
  const file = app2.vault.getAbstractFileByPath(path);
  return {
    pass: file === null,
    detail: file === null ? `File correctly absent: ${path}` : `File unexpectedly exists: ${path}`
  };
}
function expectResultNotEmpty(result) {
  return {
    pass: result.length > 0,
    detail: result.length > 0 ? `Got response (${result.length} chars)` : "Empty response"
  };
}
function containsChinese(text) {
  return /[一-鿿]/.test(text);
}
function expectLanguageMatch(partials, expectedLang) {
  if (partials.length === 0) {
    return { pass: true, detail: "No partials emitted (no tool calls, so no wait text)" };
  }
  const allText = partials.join(" ");
  const hasChinese = containsChinese(allText);
  if (expectedLang === "zh") {
    return {
      pass: hasChinese,
      detail: hasChinese ? `Wait text is Chinese: "${allText.slice(0, 80)}"` : `Expected Chinese wait text but got English: "${allText.slice(0, 80)}"`
    };
  }
  return {
    pass: !hasChinese,
    detail: !hasChinese ? `Wait text is English: "${allText.slice(0, 80)}"` : `Expected English wait text but got Chinese: "${allText.slice(0, 80)}"`
  };
}
var TOOL_XML_PATTERNS = [
  /<tool_call>[\s\S]*?<\/tool_call>/,
  /<function=[\s\S]*?<\/function>/,
  /<\|tool_call_begin\|>[\s\S]*?\|tool_call_end\|>/
];
function expectNoToolXML(result) {
  for (const pattern of TOOL_XML_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      return {
        pass: false,
        detail: `Response contains tool XML: ${match[0].slice(0, 100)}`
      };
    }
  }
  return {
    pass: true,
    detail: "No tool XML in response"
  };
}
function expectNotApology(result) {
  const apologyPatterns = ["\u62B1\u6B49", "\u4E0D\u597D\u610F\u601D", "\u7CDF\u7CD5", "\u5361\u4F4F", "\u6545\u969C", "\u6CA1\u80FD\u6574\u7406\u597D"];
  const isApology = apologyPatterns.some((p) => result.includes(p));
  return {
    pass: !isApology,
    detail: isApology ? `Response is a fallback apology: "${result.slice(0, 100)}"` : `Response is substantive: "${result.slice(0, 100)}"`
  };
}

// tests/integration/cases.ts
var TEST_DIR = "_stepvox_test";
function buildCases() {
  return [
    // === Read Layer ===
    {
      name: "R1: read_file on existing note",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/sample.md`, "# Sample\nHello world");
      },
      input: `\u8BFB\u4E00\u4E0B ${TEST_DIR}/sample \u7684\u5185\u5BB9`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "read_file");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/sample.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "R3: list_files",
      setup: async (app2) => {
        const existing = app2.vault.getAbstractFileByPath(TEST_DIR);
        if (!existing) await app2.vault.createFolder(TEST_DIR);
        const a = app2.vault.getAbstractFileByPath(`${TEST_DIR}/a.md`);
        if (!a) await app2.vault.create(`${TEST_DIR}/a.md`, "a");
        const b = app2.vault.getAbstractFileByPath(`${TEST_DIR}/b.md`);
        if (!b) await app2.vault.create(`${TEST_DIR}/b.md`, "b");
      },
      input: `${TEST_DIR} \u76EE\u5F55\u4E0B\u6709\u54EA\u4E9B\u6587\u4EF6`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "list_files");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        for (const name of ["a.md", "b.md"]) {
          const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/${name}`);
          if (f) await app2.vault.delete(f);
        }
      }
    },
    {
      name: "R5: active file handled via injected system prompt (no tool needed)",
      setup: async (app2) => {
        const existing = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (!existing) await app2.vault.create(`${TEST_DIR}/active-test.md`, "active file");
        const file = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (file) await app2.workspace.getLeaf().openFile(file);
      },
      input: "\u6211\u73B0\u5728\u6253\u5F00\u7684\u662F\u4EC0\u4E48\u6587\u4EF6",
      assert: async (result, _app, toolLog) => {
        const mentionsFile = result.toLowerCase().includes("active-test");
        if (mentionsFile) return { pass: true, detail: "File mentioned in response (no tool call needed)" };
        return { pass: false, detail: `Response did not mention active file. Tools: [${toolLog.map((c) => c.name).join(", ")}], response: ${result.slice(0, 80)}` };
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Write Layer ===
    {
      name: "W1: create_file",
      input: `\u5728 ${TEST_DIR} \u76EE\u5F55\u4E0B\u521B\u5EFA\u4E00\u4E2A\u53EB new-note \u7684\u7B14\u8BB0\uFF0C\u5185\u5BB9\u5199 hello world`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "create_file");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/new-note.md`, "hello");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/new-note.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W2: append",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/append-test.md`, "line1");
      },
      input: `\u5728 ${TEST_DIR}/append-test \u672B\u5C3E\u52A0\u4E00\u884C line2`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "append");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/append-test.md`, "line2");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/append-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W3: update_content",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/update-test.md`, "old text here");
      },
      input: `\u628A ${TEST_DIR}/update-test \u91CC\u7684 "old text" \u6539\u6210 "new text"`,
      assert: async (result, app2, toolLog) => {
        const fileResult = await expectFileContains(app2, `${TEST_DIR}/update-test.md`, "new text");
        if (!fileResult.pass) {
          const t = expectToolCalled(toolLog, "update_content");
          if (!t.pass) return { pass: false, detail: `update_content not called. Tools: [${toolLog.map((c) => c.name).join(", ")}]` };
          return fileResult;
        }
        return fileResult;
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/update-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W4: prepend",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/prepend-test.md`, "---\ntitle: Test\n---\noriginal content");
      },
      input: `\u5728 ${TEST_DIR}/prepend-test \u5F00\u5934\u6DFB\u52A0\u4E00\u884C new first line`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "prepend");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/prepend-test.md`, "new first line");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/prepend-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "W5: open_file",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/open-test.md`, "test content");
      },
      input: `\u5728\u7F16\u8F91\u5668\u91CC\u6253\u5F00 ${TEST_DIR}/open-test \u8FD9\u4E2A\u6587\u4EF6`,
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "open_file");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/open-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Delete ===
    {
      name: "D1: delete_file moves note to trash",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/to-delete.md`, "delete me");
      },
      input: `\u5220\u9664 ${TEST_DIR}/to-delete \u8FD9\u4E2A\u6587\u4EF6`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "delete_file");
        if (!t.pass) return t;
        return expectFileNotExists(app2, `${TEST_DIR}/to-delete.md`);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/to-delete.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Create Folder ===
    {
      name: "CF1: create_folder",
      input: `\u5728 ${TEST_DIR} \u4E0B\u521B\u5EFA\u4E00\u4E2A\u53EB subfolder \u7684\u6587\u4EF6\u5939`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "create_folder");
        if (!t.pass) return t;
        const folder = app2.vault.getAbstractFileByPath(`${TEST_DIR}/subfolder`);
        return {
          pass: folder !== null,
          detail: folder ? `Folder exists: ${TEST_DIR}/subfolder` : `Folder not found: ${TEST_DIR}/subfolder`
        };
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/subfolder`);
        if (f) await app2.vault.delete(f, true);
      }
    },
    // === Rename ===
    {
      name: "RN1: rename_file",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/old-name.md`, "rename me");
      },
      input: `\u628A ${TEST_DIR}/old-name \u91CD\u547D\u540D\u4E3A new-name`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "rename_file");
        if (!t.pass) return t;
        const gone = await expectFileNotExists(app2, `${TEST_DIR}/old-name.md`);
        if (!gone.pass) return { pass: false, detail: "Old file still exists after rename" };
        return expectFileExists(app2, `${TEST_DIR}/new-name.md`);
      },
      teardown: async (app2) => {
        for (const name of ["old-name.md", "new-name.md"]) {
          const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/${name}`);
          if (f) await app2.vault.delete(f);
        }
      }
    },
    // === Edge Cases ===
    {
      name: "E1: read non-existent file",
      input: `\u8BFB\u4E00\u4E0B ${TEST_DIR}/does-not-exist \u7684\u5185\u5BB9`,
      assert: async (result, _app, toolLog) => {
        return expectResultNotEmpty(result);
      }
    },
    {
      name: "E3: casual chat, no vault tools",
      input: "\u4F60\u597D\uFF0C\u7ED9\u6211\u8BB2\u4E2A\u7B11\u8BDD",
      assert: async (result, _app, toolLog) => {
        const vaultTools = toolLog.filter((c) => !["read_memory", "update_memory"].includes(c.name));
        if (vaultTools.length > 0) {
          return { pass: false, detail: `Unexpected vault tools called: [${vaultTools.map((c) => c.name).join(", ")}]` };
        }
        return expectResultNotEmpty(result);
      }
    },
    // === Search ===
    {
      name: "S1: vault search",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/search-target.md`, "unique keyword xyzabc123");
      },
      input: "\u641C\u7D22\u5305\u542B xyzabc123 \u7684\u7B14\u8BB0",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "search");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/search-target.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Properties ===
    {
      name: "P2: set_property",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/prop-test.md`, "---\ntitle: Old\n---\ncontent");
      },
      input: `\u628A ${TEST_DIR}/prop-test \u7684 status \u5C5E\u6027\u8BBE\u4E3A done`,
      assert: async (result, app2, toolLog) => {
        const t = expectToolCalled(toolLog, "set_property");
        if (!t.pass) return t;
        return expectFileContains(app2, `${TEST_DIR}/prop-test.md`, "done");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/prop-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "P3: get_properties",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/getprop-test.md`, "---\ntags: [test]\nauthor: alice\n---\ncontent");
      },
      input: `${TEST_DIR}/getprop-test \u8FD9\u4E2A\u6587\u4EF6\u6709\u54EA\u4E9B\u5C5E\u6027`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "get_properties");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/getprop-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === Memory ===
    {
      name: "M1: read_memory",
      input: "\u4F60\u8BB0\u5F97\u6211\u4E4B\u524D\u8BF4\u8FC7\u4EC0\u4E48\u5417",
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "read_memory");
      }
    },
    // === Web Search (requires search provider configured) ===
    {
      name: "WS1: web_search triggered",
      input: "\u5E2E\u6211\u5728\u7F51\u4E0A\u67E5\u4E00\u4E0B Obsidian \u6700\u65B0\u7248\u672C",
      assert: async (result, _app, toolLog, _partials) => {
        const called = toolLog.some((c) => c.name === "web_search");
        if (!called) {
          return { pass: false, detail: `web_search not called. Tools: [${toolLog.map((c) => c.name).join(", ")}]` };
        }
        return expectResultNotEmpty(result);
      }
    },
    // === Language Consistency (English prompts + Chinese user) ===
    {
      name: "L1: Chinese input \u2192 Chinese wait text (tool call)",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/lang-test.md`, "# \u8BED\u8A00\u6D4B\u8BD5\n\u5185\u5BB9");
      },
      input: `\u8BFB\u4E00\u4E0B ${TEST_DIR}/lang-test \u7684\u5185\u5BB9`,
      assert: async (result, _app, toolLog, partials) => {
        const t = expectToolCalled(toolLog, "read_file");
        if (!t.pass) return t;
        return expectLanguageMatch(partials, "zh");
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/lang-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "L2: Chinese input \u2192 Chinese final response",
      input: "\u4F60\u597D\uFF0C\u4ECA\u5929\u5929\u6C14\u600E\u4E48\u6837",
      assert: async (result, _app, _toolLog, _partials) => {
        const hasChinese = containsChinese(result);
        return {
          pass: hasChinese,
          detail: hasChinese ? `Response in Chinese: "${result.slice(0, 80)}"` : `Expected Chinese response but got: "${result.slice(0, 80)}"`
        };
      }
    },
    {
      name: "L3: English input \u2192 English final response",
      input: "Hello, how are you?",
      assert: async (result, _app, _toolLog, _partials) => {
        const hasChinese = containsChinese(result);
        return {
          pass: !hasChinese,
          detail: !hasChinese ? `Response in English: "${result.slice(0, 80)}"` : `Expected English response but got: "${result.slice(0, 80)}"`
        };
      }
    },
    {
      name: "L4: Chinese search \u2192 Chinese wait text + Chinese response",
      setup: async (app2) => {
        await app2.vault.create(`${TEST_DIR}/search-lang.md`, "\u9879\u76EE\u5468\u62A5\u5185\u5BB9 xyzlang456");
      },
      input: "\u641C\u7D22\u5305\u542B xyzlang456 \u7684\u7B14\u8BB0",
      assert: async (result, _app, toolLog, partials) => {
        const t = expectToolCalled(toolLog, "search");
        if (!t.pass) return t;
        const langCheck = expectLanguageMatch(partials, "zh");
        if (!langCheck.pass) return langCheck;
        const hasChinese = containsChinese(result);
        return {
          pass: hasChinese,
          detail: hasChinese ? `Search response in Chinese: "${result.slice(0, 80)}"` : `Expected Chinese search response but got: "${result.slice(0, 80)}"`
        };
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/search-lang.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    // === R3 XML Recovery (requires web search provider configured) ===
    // These cases trigger the forced R3 summary path (R1 bulk tool + R2
    // over-long answer) and verify the final output is clean prose, not
    // raw tool-call XML or a fallback apology.
    {
      name: "X1: web_search \u2192 R3 summary is clean prose (no XML leak)",
      input: "\u5E2E\u6211\u5728\u7F51\u4E0A\u641C\u7D22\u4E00\u4E0B 2026 \u5E74\u6700\u65B0\u7684\u4EBA\u5DE5\u667A\u80FD\u65B0\u95FB",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "web_search");
        if (!t.pass) return t;
        const xmlCheck = expectNoToolXML(result);
        if (!xmlCheck.pass) return xmlCheck;
        const notEmpty = expectResultNotEmpty(result);
        if (!notEmpty.pass) return notEmpty;
        return expectNotApology(result);
      }
    },
    {
      name: "X2: vault search \u2192 R3 summary is clean prose (no XML leak)",
      setup: async (app2) => {
        const content = [
          "# \u9879\u76EE\u5468\u62A5 2026-05-01",
          "\u672C\u5468\u5B8C\u6210\u4E86\u4EE5\u4E0B\u5DE5\u4F5C\uFF1A",
          "1. \u91CD\u6784\u4E86\u6570\u636E\u5904\u7406\u6A21\u5757\uFF0C\u6027\u80FD\u63D0\u534730%",
          "2. \u4FEE\u590D\u4E86\u7528\u6237\u767B\u5F55\u7684\u5B89\u5168\u6F0F\u6D1E",
          "3. \u65B0\u589E\u4E86\u6570\u636E\u5BFC\u51FA\u529F\u80FD\uFF0C\u652F\u6301CSV\u548CJSON\u683C\u5F0F",
          "4. \u4F18\u5316\u4E86\u641C\u7D22\u7B97\u6CD5\uFF0C\u54CD\u5E94\u65F6\u95F4\u964D\u4F4E50%",
          "5. \u7F16\u5199\u4E86API\u6587\u6863\u548C\u5F00\u53D1\u8005\u6307\u5357"
        ].join("\n");
        await app2.vault.create(`${TEST_DIR}/search-xml-test.md`, content);
      },
      input: "\u641C\u7D22\u6211\u7684\u7B14\u8BB0\u91CC\u6709\u6CA1\u6709\u5173\u4E8E\u9879\u76EE\u5468\u62A5\u7684\u5185\u5BB9\uFF0C\u603B\u7ED3\u4E00\u4E0B",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "search");
        if (!t.pass) return t;
        const xmlCheck = expectNoToolXML(result);
        if (!xmlCheck.pass) return xmlCheck;
        const notEmpty = expectResultNotEmpty(result);
        if (!notEmpty.pass) return notEmpty;
        return expectNotApology(result);
      },
      teardown: async (app2) => {
        const f = app2.vault.getAbstractFileByPath(`${TEST_DIR}/search-xml-test.md`);
        if (f) await app2.vault.delete(f);
      }
    },
    {
      name: "X3: web_search repeated 3x \u2014 verify no XML in any run",
      input: "\u641C\u7D22\u4E00\u4E0B\u6700\u8FD1\u7684\u79D1\u6280\u65B0\u95FB",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "web_search");
        if (!t.pass) return t;
        const xmlCheck = expectNoToolXML(result);
        if (!xmlCheck.pass) return xmlCheck;
        return expectNotApology(result);
      }
    }
  ];
}

// tests/integration/runner.ts
var TEST_DIR2 = "_stepvox_test";
function createSpyExecutor(app2) {
  const realExecutor = new ToolExecutor(app2, ".obsidian/plugins/stepvox/memory");
  const log = [];
  const originalExecute = realExecutor.execute.bind(realExecutor);
  realExecutor.execute = async (call) => {
    log.push(call);
    return originalExecute(call);
  };
  return {
    executor: realExecutor,
    log,
    reset: () => {
      log.length = 0;
    }
  };
}
async function runIntegrationTests(app2) {
  const results = [];
  const cases = buildCases();
  const plugin = app2.plugins.plugins["stepvox"];
  if (!plugin) {
    return [{ name: "SETUP", pass: false, detail: "StepVox plugin not loaded", duration: 0 }];
  }
  const settings = plugin.settings;
  const { executor, log, reset } = createSpyExecutor(app2);
  const testFolder = app2.vault.getAbstractFileByPath(TEST_DIR2);
  if (!testFolder) {
    await app2.vault.createFolder(TEST_DIR2);
  }
  const { createLLMProvider: createLLMProvider2 } = await Promise.resolve().then(() => (init_factory(), factory_exports));
  const llmProvider = createLLMProvider2(settings);
  for (const tc of cases) {
    reset();
    const start = Date.now();
    try {
      if (tc.setup) await tc.setup(app2);
      const orchestrator = new AgentOrchestrator({
        provider: llmProvider,
        toolExecutor: executor,
        systemPromptBuilder: () => buildSystemPrompt2(app2)
      });
      const partials = [];
      const result = await orchestrator.run(tc.input, {
        onPartial: (text) => {
          partials.push(text);
        }
      });
      const assertion = await tc.assert(result ?? "", app2, [...log], partials);
      results.push({
        name: tc.name,
        pass: assertion.pass,
        detail: assertion.detail,
        duration: Date.now() - start
      });
      orchestrator.dispose();
    } catch (err) {
      results.push({
        name: tc.name,
        pass: false,
        detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
        duration: Date.now() - start
      });
    } finally {
      try {
        if (tc.teardown) await tc.teardown(app2);
      } catch {
      }
    }
  }
  try {
    const folder = app2.vault.getAbstractFileByPath(TEST_DIR2);
    if (folder) await app2.vault.delete(folder, true);
  } catch {
  }
  llmProvider.dispose();
  return results;
}
async function runWebSearchTest(app2) {
  const plugin = app2.plugins.plugins["stepvox"];
  if (!plugin) {
    console.error("[WSTest] StepVox not loaded");
    return;
  }
  const settings = plugin.settings;
  console.log("[WSTest] search.provider:", settings.search?.provider, "| key:", settings.search?.apiKey ? "set" : "EMPTY");
  const { createLLMProvider: createLLMProvider2 } = await Promise.resolve().then(() => (init_factory(), factory_exports));
  const { TavilyProvider: TavilyProvider2, ExaProvider: ExaProvider2 } = await Promise.resolve().then(() => (init_search2(), search_exports));
  const llmProvider = createLLMProvider2(settings);
  const realExecutor = new ToolExecutor(app2, ".obsidian/plugins/stepvox/memory");
  const searchProvider = settings.search?.provider === "tavily" ? new TavilyProvider2(settings.search.apiKey) : settings.search?.provider === "exa" ? new ExaProvider2(settings.search.apiKey) : null;
  realExecutor.setSearchProvider(searchProvider);
  console.log("[WSTest] searchProvider:", searchProvider ? searchProvider.constructor.name : "null");
  const toolLog = [];
  const origExecute = realExecutor.execute.bind(realExecutor);
  realExecutor.execute = async (call) => {
    toolLog.push(`execute:${call.name}`);
    console.log(`[WSTest] execute: ${call.name}`, JSON.stringify(call.args).slice(0, 80));
    return origExecute(call);
  };
  const { AgentOrchestrator: AgentOrchestrator2 } = await Promise.resolve().then(() => (init_orchestrator(), orchestrator_exports));
  const { buildSystemPrompt: buildSystemPrompt3 } = await Promise.resolve().then(() => (init_system_prompt(), system_prompt_exports));
  const orchestrator = new AgentOrchestrator2({
    provider: llmProvider,
    toolExecutor: realExecutor,
    systemPromptBuilder: () => buildSystemPrompt3(app2)
  });
  const input = "\u5E2E\u6211\u5728\u7F51\u4E0A\u641C\u7D22\u4E00\u4E0B Obsidian \u6700\u65B0\u7248\u672C\u53F7";
  console.log("[WSTest] input:", input);
  const response = await orchestrator.run(input, {
    onPartial: (t) => console.log("[WSTest] partial:", t.slice(0, 60)),
    onToolStart: (names) => console.log("[WSTest] toolStart:", names),
    onToolSlow: (name) => console.log("[WSTest] toolSlow:", name)
  });
  console.log("[WSTest] final response:", response?.slice(0, 100) || "(empty)");
  console.log("[WSTest] tool log:", toolLog.join(", "));
  orchestrator.dispose();
  llmProvider.dispose();
}
(async () => {
  const app2 = globalThis.app;
  if (!app2) {
    console.error("[StepVox Test] No app found");
    return;
  }
  console.log("[StepVox Test] Starting integration tests...");
  const results = await runIntegrationTests(app2);
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`[${icon}] ${r.name} (${r.duration}ms) \u2014 ${r.detail}`);
    if (r.pass) passed++;
    else failed++;
  }
  console.log(`
[StepVox Test] Done: ${passed} passed, ${failed} failed`);
  globalThis.__stepvoxTestResults = results;
})();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runIntegrationTests,
  runWebSearchTest
});
