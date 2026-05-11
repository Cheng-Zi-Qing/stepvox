import type { App } from "obsidian";

let app: App | null = null;
let enabled = false;
const LOG_PATH = ".obsidian/plugins/stepvox/debug.log";
const ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let writeChain: Promise<void> = Promise.resolve();

export function initDebugLogger(obsidianApp: App): void {
  app = obsidianApp;
}

export function setDebugEnabled(value: boolean): void {
  enabled = value;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

/**
 * Truncate the debug log if its last-modified time is older than 7 days.
 * Serialised through the same write chain so it cannot race with appends.
 */
export function maybeRotateLog(): void {
  if (!app) return;
  const currentApp = app;
  writeChain = writeChain.then(async () => {
    try {
      const adapter = currentApp.vault.adapter;
      if (!(await adapter.exists(LOG_PATH))) return;
      const stat = await adapter.stat(LOG_PATH);
      if (!stat) return;
      if (Date.now() - stat.mtime >= ROTATE_AFTER_MS) {
        const stamp = new Date().toISOString();
        await adapter.write(LOG_PATH, `[${stamp}] [ROTATE] log cleared (>=7d old)\n`);
      }
    } catch {
      // Ignore stat/write errors
    }
  });
}

export function debugLog(category: string, message: string, data?: unknown): void {
  if (!enabled) return;

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
