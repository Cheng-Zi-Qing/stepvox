import { type App, TFile } from "obsidian";

/**
 * Look up a markdown file by vault-relative path. Appends `.md` if missing
 * (matches the legacy ToolExecutor behaviour). Throws if the path resolves
 * to a folder or doesn't exist.
 */
export function resolveFile(app: App, path: string): TFile {
  let resolved = path;
  if (!resolved.endsWith(".md")) resolved += ".md";
  const file = app.vault.getAbstractFileByPath(resolved);
  if (!(file instanceof TFile)) {
    throw new Error(`File not found: ${path}`);
  }
  return file;
}

/**
 * Index immediately AFTER a frontmatter block (--- ... ---\n). Returns 0
 * if the file has no frontmatter. Used by prepend to insert below the
 * frontmatter rather than above it.
 */
export function findFrontmatterEnd(data: string): number {
  if (!data.startsWith("---")) return 0;
  const end = data.indexOf("---", 3);
  if (end === -1) return 0;
  return end + 3 + (data[end + 3] === "\n" ? 1 : 0);
}
