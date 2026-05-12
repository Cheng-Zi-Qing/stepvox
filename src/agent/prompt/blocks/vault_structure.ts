import type { PromptBlock } from "../types";

/**
 * Vault Structure snapshot block (D52). Captured once per session by the
 * pipeline and passed through `ctx.vaultSnapshot`. If the snapshot is
 * null/empty, this block contributes nothing (filtered out in index.ts).
 */
export const vaultStructure: PromptBlock = {
  id: "vault-structure",
  editable: false,
  render(ctx) {
    const snapshot = ctx.vaultSnapshot?.trim();
    if (!snapshot) return "";
    return `## Vault Structure (captured at session start, 2-level deep)\n${snapshot}`;
  },
};
