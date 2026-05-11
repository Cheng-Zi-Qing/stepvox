import { App, TFile, TFolder } from "obsidian";
import type { ToolCall } from "../providers";
import { getToolLayer } from "./tools";
import type { SearchProvider } from "../providers/search";

export interface ToolResult {
  id: string;
  content: string;
  success: boolean;
}

/**
 * ToolExecutor — pure execution, no timeouts, no async-pending state.
 * Timeouts and parallelism are the orchestrator's responsibility (D46/D48).
 */
export class ToolExecutor {
  private app: App;
  private memoryDir: string;
  private searchProvider: SearchProvider | null = null;

  constructor(app: App, memoryDir: string) {
    this.app = app;
    this.memoryDir = memoryDir;
  }

  setSearchProvider(provider: SearchProvider | null): void {
    this.searchProvider = provider;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const layer = getToolLayer(call.name);

    if (layer === "dangerous") {
      return {
        id: call.id,
        content: `Rejected: "${call.name}" requires user confirmation. Ask the user first.`,
        success: false,
      };
    }

    try {
      const content = await this.dispatch(call.name, call.args);
      return { id: call.id, content, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: call.id, content: `Error: ${msg}`, success: false };
    }
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    switch (name) {
      case "read_file":
        return this.readFile(args.path as string);
      case "search":
        return this.search(args.query as string, args.limit as number | undefined);
      case "list_files":
        return this.listFiles(args.folder as string | undefined);
      case "get_properties":
        return this.getProperties(args.path as string);
      case "create_file":
        return this.createFile(args.path as string, args.content as string);
      case "append":
        return this.appendFile(args.path as string, args.content as string);
      case "prepend":
        return this.prependFile(args.path as string, args.content as string);
      case "update_content":
        return this.updateContent(
          args.path as string,
          args.old_text as string,
          args.new_text as string
        );
      case "set_property":
        return this.setProperty(
          args.path as string,
          args.key as string,
          args.value as string
        );
      case "open_file":
        return this.openFile(args.path as string);
      case "find_path":
        return this.findPath(args.query as string, args.type as "file" | "folder" | "both" | undefined);
      case "move_file":
        return this.moveFile(args.path as string, args.new_path as string);
      case "read_memory":
        return this.readMemory();
      case "update_memory":
        return this.updateMemory(args.content as string);
      case "web_search":
        return this.webSearch(args.query as string);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ============================================================
  // VAULT SNAPSHOT — captured once at session start; injected into
  // system prompt so the LLM has immediate orientation and doesn't
  // need to waste a round on list_files just to discover the layout.
  // ============================================================

  /**
   * Build a two-level string view of the vault's folder tree:
   *   Top-level folders, each followed by its direct subfolders (indented).
   * Files are NOT listed — only folder skeleton. Large dirs are capped.
   */
  snapshotVaultStructure(): string {
    const PER_LEVEL_CAP = 30;
    const root = this.app.vault.getRoot();
    const topFolders = root.children.filter((c): c is TFolder => c instanceof TFolder).sort((a, b) => a.name.localeCompare(b.name));
    if (topFolders.length === 0) return "(vault has no subfolders)";

    const lines: string[] = [];
    const truncated = topFolders.slice(0, PER_LEVEL_CAP);
    for (const folder of truncated) {
      lines.push(`${folder.name}/`);
      const subs = folder.children
        .filter((c): c is TFolder => c instanceof TFolder)
        .sort((a, b) => a.name.localeCompare(b.name));
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

  private resolveFile(path: string): TFile {
    let resolved = path;
    if (!resolved.endsWith(".md")) resolved += ".md";
    const file = this.app.vault.getAbstractFileByPath(resolved);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }

  private async readFile(path: string): Promise<string> {
    const file = this.resolveFile(path);
    const content = await this.app.vault.cachedRead(file);
    if (content.length > 4000) {
      return content.slice(0, 4000) + "\n...(truncated)";
    }
    return content;
  }

  private async search(query: string, limit?: number): Promise<string> {
    const max = limit ?? 10;
    const files = this.app.vault.getMarkdownFiles();
    const results: { path: string; snippet: string }[] = [];
    const lower = query.toLowerCase();

    for (const file of files) {
      if (results.length >= max) break;
      const content = await this.app.vault.cachedRead(file);
      const idx = content.toLowerCase().indexOf(lower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + query.length + 50);
        results.push({
          path: file.path,
          snippet: content.slice(start, end).replace(/\n/g, " "),
        });
      }
    }

    if (results.length === 0) return "No results found.";
    return results.map((r) => `${r.path}: ...${r.snippet}...`).join("\n");
  }

  private listFiles(folder?: string): Promise<string> {
    const abstract = folder
      ? this.app.vault.getAbstractFileByPath(folder)
      : this.app.vault.getRoot();

    if (!abstract || !(abstract instanceof TFolder)) {
      return Promise.resolve(`Folder not found: ${folder ?? "(root)"}`);
    }

    const entries = abstract.children
      .map((c) => (c instanceof TFolder ? `${c.name}/` : c.name))
      .sort();

    if (entries.length === 0) return Promise.resolve("(empty)");

    // Truncate large directories so the LLM context isn't drowned (and to
    // discourage the model from re-asking when it can't make sense of a
    // 1000-line listing). Show the first 50 entries with a tail count.
    const MAX = 50;
    if (entries.length <= MAX) return Promise.resolve(entries.join("\n"));
    return Promise.resolve(
      entries.slice(0, MAX).join("\n") +
        `\n...(+${entries.length - MAX} more entries; ask the user to narrow down or use search)`
    );
  }

  private getProperties(path: string): Promise<string> {
    const file = this.resolveFile(path);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return Promise.resolve("No frontmatter.");
    return Promise.resolve(JSON.stringify(fm, null, 2));
  }

  private async createFile(path: string, content: string): Promise<string> {
    let resolved = path;
    if (!resolved.endsWith(".md")) resolved += ".md";
    const existing = this.app.vault.getAbstractFileByPath(resolved);
    if (existing) throw new Error(`File already exists: ${resolved}`);
    await this.app.vault.create(resolved, content);
    return `Created: ${resolved}`;
  }

  private async appendFile(path: string, content: string): Promise<string> {
    const file = this.resolveFile(path);
    await this.app.vault.append(file, "\n" + content);
    return `Appended to: ${file.path}`;
  }

  private async prependFile(path: string, content: string): Promise<string> {
    const file = this.resolveFile(path);
    await this.app.vault.process(file, (data) => {
      const fmEnd = this.findFrontmatterEnd(data);
      return data.slice(0, fmEnd) + content + "\n" + data.slice(fmEnd);
    });
    return `Prepended to: ${file.path}`;
  }

  private async updateContent(
    path: string,
    oldText: string,
    newText: string
  ): Promise<string> {
    const file = this.resolveFile(path);
    let found = false;
    await this.app.vault.process(file, (data) => {
      if (!data.includes(oldText)) throw new Error("Text not found in file");
      found = true;
      return data.replace(oldText, newText);
    });
    return found ? `Updated: ${file.path}` : "Text not found.";
  }

  private async setProperty(
    path: string,
    key: string,
    value: string
  ): Promise<string> {
    const file = this.resolveFile(path);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[key] = value;
    });
    return `Set ${key}=${value} on ${file.path}`;
  }

  private async openFile(path: string): Promise<string> {
    await this.app.workspace.openLinkText(path, "", false);
    return `Opened: ${path}`;
  }

  /**
   * find_path — fuzzy name-match across the WHOLE vault (file + folder names).
   * Use when the LLM knows the rough name of something ("the report", "my
   * meeting notes folder") but not its full path. Returns up to 30 matches,
   * prefixed with "[file]" or "[folder]" so the LLM can pick. No file
   * contents are opened, it's purely a path-layer search.
   */
  private async findPath(query: string, kind: "file" | "folder" | "both" = "both"): Promise<string> {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return "find_path needs a non-empty query string.";
    const MAX = 30;

    // getAllLoadedFiles returns every TAbstractFile (TFile + TFolder) in the vault.
    const all = this.app.vault.getAllLoadedFiles();
    const matches: { type: "file" | "folder"; path: string }[] = [];

    for (const f of all) {
      if (matches.length >= MAX + 1) break; // +1 so we can detect "more"
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

    const shown = matches.slice(0, MAX);
    const lines = shown.map((m) => `[${m.type}] ${m.path}`);
    if (matches.length > MAX) lines.push(`...(+${matches.length - MAX} more, narrow the query)`);
    return lines.join("\n");
  }

  /**
   * move_file — move (or rename) a note. If new_path points to an existing
   * file/folder, this fails rather than overwriting. Vault paths only, no
   * escaping to outside the vault.
   */
  private async moveFile(path: string, newPath: string): Promise<string> {
    if (!path || !newPath) throw new Error("move_file requires both 'path' and 'new_path'.");
    const src = this.resolveFile(path);

    // Normalise target: append .md if user omitted (mirrors resolveFile behaviour).
    let target = newPath;
    if (!target.endsWith(".md") && !target.endsWith("/")) target += ".md";

    if (this.app.vault.getAbstractFileByPath(target)) {
      throw new Error(`Target already exists: ${target}. Use a different new_path.`);
    }
    await this.app.fileManager.renameFile(src, target);
    return `Moved: ${src.path} → ${target}`;
  }

  private async readMemory(): Promise<string> {
    const path = `${this.memoryDir}/memory.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "No memory stored yet.";
    return this.app.vault.cachedRead(file);
  }

  private async updateMemory(content: string): Promise<string> {
    const path = `${this.memoryDir}/memory.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(path, content);
    }
    return "Memory updated.";
  }

  private findFrontmatterEnd(data: string): number {
    if (!data.startsWith("---")) return 0;
    const end = data.indexOf("---", 3);
    if (end === -1) return 0;
    return end + 3 + (data[end + 3] === "\n" ? 1 : 0);
  }

  private async webSearch(query: string): Promise<string> {
    if (!this.searchProvider) return "Web search not configured. Please add a search API key in settings.";
    const results = await this.searchProvider.search(query);
    if (results.length === 0) return "No results found.";
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
      .join("\n\n---\n\n");
  }
}
