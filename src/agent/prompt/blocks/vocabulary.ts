import type { PromptBlock } from "../types";

/**
 * Vocabulary block — synonym table for "vault". Locked: shrinking it makes
 * the assistant *worse* at understanding the user's own speech, not better.
 */
export const vocabulary: PromptBlock = {
  id: "vocabulary",
  editable: false,
  render(ctx) {
    const vaultName = ctx.app.vault.getName();
    return `## Vocabulary
Treat the following terms as interchangeable: "vault", "workspace", "work space", "work-space", "笔记库", "我的笔记", "知识库". They all refer to the single Obsidian vault the user is in right now ("${vaultName}"). Never ask which workspace — there is exactly one.`;
  },
};
