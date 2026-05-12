import { describe, it, expect } from "vitest";
import { isNoiseLike } from "../src/pipeline/PhaseController";

describe("isNoiseLike — filler/noise ASR filter", () => {
  it("treats single Chinese filler chars as noise", () => {
    for (const t of ["嗯", "啊", "呃", "诶", "哦", "唔", "呀"]) {
      expect(isNoiseLike(t), `expected "${t}" to be noise`).toBe(true);
    }
  });

  it("treats short repeated fillers as noise", () => {
    expect(isNoiseLike("嗯嗯")).toBe(true);
    expect(isNoiseLike("啊啊")).toBe(true);
  });

  it("ignores terminal punctuation", () => {
    expect(isNoiseLike("嗯。")).toBe(true);
    expect(isNoiseLike("嗯？")).toBe(true);
    expect(isNoiseLike("uh,")).toBe(true);
  });

  it("treats English fillers as noise (case-insensitive)", () => {
    expect(isNoiseLike("uh")).toBe(true);
    expect(isNoiseLike("Um")).toBe(true);
    expect(isNoiseLike("OH")).toBe(true);
  });

  it("keeps short meaningful Chinese words", () => {
    expect(isNoiseLike("对")).toBe(false);
    expect(isNoiseLike("好的")).toBe(false);
    expect(isNoiseLike("是")).toBe(false);
    expect(isNoiseLike("没事")).toBe(false);
  });

  it("keeps short meaningful English words", () => {
    expect(isNoiseLike("ok")).toBe(false);
    expect(isNoiseLike("no")).toBe(false);
    expect(isNoiseLike("yes")).toBe(false);
  });

  it("never flags inputs longer than 2 chars (even if listed in dict)", () => {
    expect(isNoiseLike("嗯嗯嗯")).toBe(false);
    expect(isNoiseLike("退出")).toBe(false);
    expect(isNoiseLike("uhh")).toBe(false);   // 3 chars rejected by length cap
    expect(isNoiseLike("uhhh")).toBe(false);
  });

  it("empty and whitespace stay non-noise (handled by separate empty branch)", () => {
    expect(isNoiseLike("")).toBe(false);
    expect(isNoiseLike("   ")).toBe(false);
  });
});

/**
 * Behaviour spec for the consecutive-noise streak (the VoicePipeline
 * field `consecutiveNoise` and constant `MAX_CONSECUTIVE_NOISE = 3`):
 *
 * - Each noise-like ASR result increments the streak and silently
 *   re-arms listening (session mode) / ends the session (push-to-talk).
 * - Any real (non-noise) transcript resets the streak to 0.
 * - When the streak reaches MAX_CONSECUTIVE_NOISE, the session ends
 *   with reason "noise-timeout".
 * - The streak is reset on startSession so a new push doesn't inherit
 *   the previous attempt's count.
 *
 * Not exercised here because VoicePipeline depends on Obsidian's `app`
 * object; covered indirectly by manual smoke testing inside Obsidian.
 */
