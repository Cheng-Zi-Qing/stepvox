// ============================================================
// === HOW TO ADD A NEW PROMPT BLOCK ===
//
// 1. Decide: is this block user-editable (D61) or locked? Locked blocks
//    encode contracts (response length, tool-call protocol, no-markdown,
//    language matching). Editable blocks are pure style (identity, tone).
//    If in doubt, default to LOCKED — a user breaking a contract block
//    silently disables core voice-assistant behaviour.
//
// 2. Create a new file at `src/agent/prompt/blocks/{name}.ts` exporting a
//    `PromptBlock` (see ../types). For editable blocks add a textarea
//    entry to settings.ts under the "Personality" heading and a
//    matching key in `StepVoxSettings.prompt`.
//
// 3. Add two lines below: import the block, then place it in
//    PROMPT_BLOCKS where you want it to appear in the prompt.
//
// 4. Block ordering matters — the LLM reads top-to-bottom and earlier
//    rules anchor later ones. Don't drop new blocks at the end without
//    thinking about whether their content needs to come before
//    Current Context or Vault Structure.
// ============================================================

import type { App } from "obsidian";
import type { StepVoxSettings } from "../../settings";
import type { PromptBlock, PromptContext } from "./types";

import { identity } from "./blocks/identity";
import { vocabulary } from "./blocks/vocabulary";
import { capabilities } from "./blocks/capabilities";
import { personality } from "./blocks/personality";
import { responseLength } from "./blocks/response_length";
import { behaviorRules } from "./blocks/behavior_rules";
import { locating } from "./blocks/locating";
import { toolChoice } from "./blocks/tool_choice";
import { otherRules } from "./blocks/other_rules";
import { currentContext } from "./blocks/current_context";
import { vaultStructure } from "./blocks/vault_structure";

export const PROMPT_BLOCKS: readonly PromptBlock[] = [
  identity,
  vocabulary,
  capabilities,
  personality,
  responseLength,
  behaviorRules,
  locating,
  toolChoice,
  otherRules,
  currentContext,
  vaultStructure,
];

/**
 * Build the full system prompt. Each block renders independently from the
 * shared PromptContext; empty results are filtered so a missing vault
 * snapshot or empty user override doesn't leave a blank section.
 */
export function buildSystemPrompt(
  app: App,
  settings: StepVoxSettings,
  vaultSnapshot: string | null
): string {
  const ctx: PromptContext = { app, settings, vaultSnapshot };
  return PROMPT_BLOCKS.map((b) => b.render(ctx).trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
}

export type { PromptBlock, PromptContext } from "./types";
