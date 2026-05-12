// Compatibility shim. The canonical prompt builder now lives at
// `./prompt/index.ts` and assembles a list of PromptBlock modules under
// `./prompt/blocks/` (D62). This file preserves the legacy
// `buildSystemPrompt(app, vaultStructure?)` two-arg signature for callers
// that haven't been migrated (currently the integration test runner).
//
// New code should import from `./prompt` and pass `settings` explicitly so
// the user-editable Identity / Personality blocks (D61) read the user's
// values rather than hardcoded defaults.

import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "../settings";
import type { StepVoxSettings } from "../settings";
import { buildSystemPrompt as buildFromBlocks } from "./prompt";

export function buildSystemPrompt(
  app: App,
  vaultStructure?: string,
  settings: StepVoxSettings = DEFAULT_SETTINGS
): string {
  return buildFromBlocks(app, settings, vaultStructure ?? null);
}
