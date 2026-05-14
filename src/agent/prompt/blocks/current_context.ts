import type { PromptBlock } from "../types";

function formatToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const weekdayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${yyyy}-${mm}-${dd} ${weekdayEn}`;
}

/**
 * Current Context block — dynamic per-turn data: today's date, vault
 * name, and the user's currently active file path. Combines what was
 * three separate dynamic chunks in the legacy system-prompt.ts. The
 * Vault Structure (a session-scoped snapshot) is appended in a separate
 * block so it can be omitted cleanly when the snapshot is null.
 */
export const currentContext: PromptBlock = {
  id: "current-context",
  editable: false,
  render(ctx) {
    const vaultName = ctx.app.vault.getName();
    const activeFile = ctx.app.workspace.getActiveFile();
    const fileLine = activeFile ? `\n- Active file: ${activeFile.path}` : "";
    return `## Current Context
- Today's date: ${formatToday()} — use this as the authoritative "now". When the user says "this year", "today", "recent", or "latest", resolve against this date, not your training cutoff.
- Vault: ${vaultName}${fileLine}`;
  },
};
