import type { App } from "obsidian";

let app: App | null = null;
const LOG_PATH = ".obsidian/plugins/stepvox/debug.log";
let writeChain: Promise<void> = Promise.resolve();

export function initDebugLogger(obsidianApp: App): void {
  app = obsidianApp;
}

export function debugLog(category: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  const line = `[${timestamp}] [${category}] ${message}${dataStr}\n`;

  console.log(`[${category}] ${message}`, data ?? "");

  if (!app) return;
  const currentApp = app;

  // Serialize writes to avoid races; use adapter.append for O(1) appends.
  writeChain = writeChain.then(async () => {
    try {
      const adapter = currentApp.vault.adapter;
      if (await adapter.exists(LOG_PATH)) {
        await adapter.append(LOG_PATH, line);
      } else {
        await adapter.write(LOG_PATH, line);
      }
    } catch {
      // Ignore file write errors
    }
  });
}
