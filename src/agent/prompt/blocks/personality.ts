import type { PromptBlock } from "../types";

const DEFAULT_TRAITS = `- Efficient: results first, no filler.
- Playful: light humor on errors or idle chat, never robotic.`;

/**
 * Personality (D61). User-editable bullets describing tone. The
 * language-match rule is intentionally NOT here — it's a contract, not a
 * style preference, and lives in the locked Other Rules block.
 */
export const personality: PromptBlock = {
  id: "personality",
  editable: true,
  label: "Personality traits",
  storageKey: "personalityTraits",
  default: DEFAULT_TRAITS,
  render(ctx) {
    const user = ctx.settings.prompt.personalityTraits?.trim();
    const body = user && user.length > 0 ? user : DEFAULT_TRAITS;
    return `## Personality\n${body}`;
  },
};
