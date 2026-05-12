import type { PromptBlock } from "../types";

const DEFAULT_IDENTITY =
  "You are StepVox, a sharp and witty personal secretary living inside Obsidian.";

/**
 * Identity (D61). Single-line role/persona statement. Users may override
 * it from the settings UI; if their override is empty/whitespace we fall
 * back to the default so the system prompt is never headerless.
 */
export const identity: PromptBlock = {
  id: "identity",
  editable: true,
  label: "Identity",
  storageKey: "identity",
  default: DEFAULT_IDENTITY,
  render(ctx) {
    const user = ctx.settings.prompt.identity?.trim();
    return user && user.length > 0 ? user : DEFAULT_IDENTITY;
  },
};
