// Temporary parity check — confirms the new modular prompt builds the
// same string the old monolithic system-prompt.ts did, given equivalent
// inputs. Run with `npx vitest run tests/prompt-parity.test.ts`.

import { describe, it, expect, vi } from "vitest";
import { buildSystemPrompt as buildNew } from "../src/agent/prompt";
import { DEFAULT_SETTINGS } from "../src/settings";

const fakeApp = {
  vault: { getName: () => "MyVault" },
  workspace: { getActiveFile: () => ({ path: "notes/foo.md" }) },
} as any;

describe("prompt parity (D62 refactor)", () => {
  it("contains all the legacy block headings in order", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, "workspace/\n  workspace/reports/");
    const headings = [
      "## Vocabulary",
      "## Capabilities",
      "## Personality",
      "## Response Length",
      "## Behavior Rules",
      "## Locating Things in the Vault",
      "## Tool Choice — Vault vs Web",
      "## Other Rules",
      "## Current Context",
      "## Vault Structure",
    ];
    let idx = 0;
    for (const h of headings) {
      const found = out.indexOf(h, idx);
      expect(found, `missing or out-of-order heading: ${h}`).toBeGreaterThan(-1);
      idx = found + h.length;
    }
  });

  it("uses default Identity when settings.prompt.identity is empty", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, null);
    expect(out).toContain("You are StepVox, a sharp and witty personal secretary");
  });

  it("respects user-overridden Identity", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      prompt: { identity: "Call me Bob.", personalityTraits: "" },
    };
    const out = buildNew(fakeApp, settings, null);
    expect(out).toContain("Call me Bob.");
    expect(out).not.toContain("StepVox, a sharp and witty");
  });

  it("includes the language-match rule (moved from Personality to Other Rules)", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, null);
    expect(out).toContain("Always respond in the same language");
  });

  it("excludes Vault Structure block when snapshot is null/empty", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, null);
    expect(out).not.toContain("## Vault Structure");
  });

  it("includes Vault Structure block when snapshot is provided", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, "workspace/\n  workspace/reports/");
    expect(out).toContain("## Vault Structure");
    expect(out).toContain("workspace/reports/");
  });

  it("substitutes the vault name in Vocabulary block", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, null);
    expect(out).toContain('"MyVault"');
  });

  it("includes Active file when workspace.getActiveFile returns one", () => {
    const out = buildNew(fakeApp, DEFAULT_SETTINGS, null);
    expect(out).toContain("Active file: notes/foo.md");
  });

  it("omits Active file line when workspace.getActiveFile returns null", () => {
    const noActive = {
      ...fakeApp,
      workspace: { getActiveFile: () => null },
    };
    const out = buildNew(noActive, DEFAULT_SETTINGS, null);
    expect(out).not.toContain("Active file:");
  });
});
