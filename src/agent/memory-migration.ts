import { TFile, type App } from "obsidian";
import type { MemoryStore } from "./memory-types";
import { EMPTY_STORE } from "./memory-types";
import { debugLog } from "../utils/debug-logger";

export async function migrateMemoryIfNeeded(
  app: App,
  pluginDataDir: string,
): Promise<void> {
  const mdPath = `${pluginDataDir}/memory/memory.md`;
  const jsonPath = `${pluginDataDir}/memory/memory.json`;

  const mdFile = app.vault.getAbstractFileByPath(mdPath);
  const jsonFile = app.vault.getAbstractFileByPath(jsonPath);

  if (!(mdFile instanceof TFile)) return;
  if (jsonFile instanceof TFile) return;

  debugLog("MEMORY", "migrating memory.md → memory.json");

  const content = await app.vault.cachedRead(mdFile);
  const store: MemoryStore = structuredClone(EMPTY_STORE);

  if (content.trim()) {
    store.facts.push({
      key: "migrated_legacy",
      value: content.trim().slice(0, 500),
      ts: new Date().toISOString().slice(0, 10),
    });
  }

  await app.vault.create(jsonPath, JSON.stringify(store, null, 2));
  await app.vault.delete(mdFile);
  debugLog("MEMORY", "migration complete");
}
