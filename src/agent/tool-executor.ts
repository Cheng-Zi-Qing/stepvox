import { App, TFile, TFolder } from "obsidian";
import type { ToolCall } from "../providers";
import { getToolLayer } from "./tools";

export interface ToolResult {
  id: string;
  content: string;
  success: boolean;
}

export class ToolExecutor {
  private app: App;
  private focusDir: string;
  private memoryDir: string;

  constructor(app: App, memoryDir: string) {
    this.app = app;
    this.memoryDir = memoryDir;
    this.focusDir = "";
  }

  get currentFocus(): string {
    return this.focusDir;
  }

  setFocus(dir: string): void {
    this.focusDir = dir;
  }

  syncFocusFromActiveFile(): void {
    const file = this.app.workspace.getActiveFile();
    if (file?.parent) {
      this.focusDir = file.parent.path;
    }
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
      case "get_active_file":
        return this.getActiveFile();
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
      case "set_focus":
        this.focusDir = args.path as string;
        return `Focus set to: ${this.focusDir}`;
      case "read_memory":
        return this.readMemory();
      case "update_memory":
        return this.updateMemory(args.content as string);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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
    const dir = folder ?? this.focusDir;
    const abstract = dir
      ? this.app.vault.getAbstractFileByPath(dir)
      : this.app.vault.getRoot();

    if (!abstract || !(abstract instanceof TFolder)) {
      return Promise.resolve(`Folder not found: ${dir}`);
    }

    const entries = abstract.children
      .map((c) => (c instanceof TFolder ? `${c.name}/` : c.name))
      .sort();

    return Promise.resolve(entries.join("\n") || "(empty)");
  }

  private getProperties(path: string): Promise<string> {
    const file = this.resolveFile(path);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return Promise.resolve("No frontmatter.");
    return Promise.resolve(JSON.stringify(fm, null, 2));
  }

  private getActiveFile(): Promise<string> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return Promise.resolve("No active file.");
    return Promise.resolve(
      JSON.stringify({ path: file.path, name: file.basename, folder: file.parent?.path })
    );
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
}
