import type { App } from "obsidian";
import type { StepVoxSettings } from "../../settings";

/**
 * Read-only runtime context passed to every PromptBlock's render(). Carries
 * Obsidian app handle (for current-context block to read vault name and
 * active file), the user's settings (for editable blocks like Identity and
 * Personality), and the per-session vault snapshot.
 *
 * Per D63, no `turnCount` here — the every-Nth-turn memory hint is
 * handled by the orchestrator outside the system prompt.
 */
export interface PromptContext {
  app: App;
  settings: StepVoxSettings;
  vaultSnapshot: string | null;
}

/**
 * One block of the system prompt. Per-block files under `blocks/` each
 * export an instance of this type, registered in PROMPT_BLOCKS in `index.ts`.
 *
 *   editable: true  — appears in settings UI as a textarea (D61). User
 *                     value lives in settings.prompt.<storageKey>;
 *                     empty/whitespace falls back to `default`.
 *   editable: false — content is locked; render() returns hardcoded text.
 */
export interface PromptBlock {
  id: string;
  editable: boolean;
  label?: string;        // UI label when editable
  storageKey?: keyof StepVoxSettings["prompt"];
  default?: string;      // fallback when user value is empty
  render(ctx: PromptContext): string;
}
