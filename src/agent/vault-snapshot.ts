import { type App, TFolder } from "obsidian";

const PER_LEVEL_CAP = 30;

/**
 * Build a two-level string view of the vault's folder tree:
 *   Top-level folders, each followed by its direct subfolders (indented).
 * Files are NOT listed — only folder skeleton. Large dirs are capped.
 *
 * Captured once per session and injected into the system prompt (D52)
 * so the LLM has immediate orientation and doesn't waste a round on
 * list_files just to discover the layout.
 */
export function snapshotVaultStructure(app: App): string {
  const root = app.vault.getRoot();
  const topFolders = root.children
    .filter((c): c is TFolder => c instanceof TFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
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
