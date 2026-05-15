import { describe, it, expect } from "vitest";
import { chunkForTTS } from "../src/pipeline/VoicePipeline";

// Constants matching production values
const C1 = 60;
const C2 = 150;
const C3 = 400;

describe("chunkForTTS (three-tier adaptive)", () => {
  it("returns text as-is when shorter than firstMax", () => {
    const text = "短文本。";
    expect(chunkForTTS(text, C1, C2, C3)).toEqual([text]);
  });

  it("returns text as-is when exactly firstMax length", () => {
    const text = "A".repeat(C1);
    expect(chunkForTTS(text, C1, C2, C3)).toEqual([text]);
  });

  it("splits into 2 chunks with C1 + C2 tiers", () => {
    // Build text that exceeds C1(60) but fits within C1+C2(210)
    const base = "这是一段测试文本。";
    let text = base;
    while (text.length < 100) text += base;
    // Now text > C1 and < C1+C2
    expect(text.length).toBeGreaterThan(C1);
    expect(text.length).toBeLessThanOrEqual(C1 + C2);

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBeLessThanOrEqual(C1);
    expect(chunks[1].length).toBeLessThanOrEqual(C2);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("uses strong punctuation breaks preferentially", () => {
    // Text with strong breaks (。) that exceeds C1(60)
    const base = "这是一段带句号的文本。";
    let text = base;
    while (text.length < 100) text += base;

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should end on a sentence boundary (。)
    expect(chunks[0]).toMatch(/[。！？.!?]$/);
  });

  it("falls back to soft breaks when no strong breaks exist", () => {
    // Text with only commas (soft breaks) — no periods, must exceed C1(60)
    let text = "";
    for (let i = 0; i < 15; i++) text += "一二三四五，";
    // 15 * 6 = 90 chars, all soft-break commas
    expect(text.length).toBeGreaterThan(C1);

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should end on comma
    expect(chunks[0]).toMatch(/[，,；;]$/);
  });

  it("hard-cuts when no punctuation in first 25%", () => {
    // Long string with no punctuation at all
    const text = "无标点纯文字" .repeat(30); // 180 chars
    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should be exactly C1 length (hard cut)
    expect(chunks[0].length).toBe(C1);
  });

  it("splits long text into 3+ chunks with C1, C2, C3 tiers", () => {
    // ~700 chars: C1(60) + C2(150) + C3(400) covers it
    const base = "今年上半年，中国大模型赛道迎来了密集的上市潮。智谱华章于一月八日在港交所挂牌，成为全球大模型第一股。";
    let text = base;
    while (text.length < 650) text += base;

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // First chunk respects C1 limit
    expect(chunks[0].length).toBeLessThanOrEqual(C1);
    // Second chunk respects C2 limit
    expect(chunks[1].length).toBeLessThanOrEqual(C2);
    // Third chunk respects C3 limit
    expect(chunks[2].length).toBeLessThanOrEqual(C3);
  });

  it("all chunks together reconstruct the original text (minus whitespace)", () => {
    const base = "这是一段很长的文本，用于测试文本完整性。每一段都有标点符号，确保断句正确。不同的标点符号测试不同的断句逻辑！";
    let text = base;
    while (text.length < 800) text += base;

    const chunks = chunkForTTS(text, C1, C2, C3);
    const reconstructed = chunks.join("");
    // Trim may eat whitespace at chunk boundaries, but all chars preserved
    expect(reconstructed.replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("handles very long text with many C3 chunks", () => {
    const base = "这是一段很长的文本。每段有标点。";
    let text = base;
    while (text.length < 2000) text += base;

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    // Chunk 1: <= C1
    expect(chunks[0].length).toBeLessThanOrEqual(C1);
    // Chunk 2: <= C2
    expect(chunks[1].length).toBeLessThanOrEqual(C2);
    // Chunks 3+: <= C3
    for (let i = 2; i < chunks.length; i++) {
      expect(chunks[i].length).toBeLessThanOrEqual(C3);
    }
  });

  it("handles empty string", () => {
    expect(chunkForTTS("", C1, C2, C3)).toEqual([""]);
  });

  it("handles single-character text", () => {
    expect(chunkForTTS("A", C1, C2, C3)).toEqual(["A"]);
  });

  it("respects sentence boundaries across all tiers", () => {
    // Build text where sentences align with tier boundaries
    const sent1 = "A".repeat(50) + "。";  // 51 chars < C1
    const sent2 = "B".repeat(140) + "。"; // 141 chars < C2
    const sent3 = "C".repeat(390) + "。"; // 391 chars < C3
    const text = sent1 + sent2 + sent3;

    const chunks = chunkForTTS(text, C1, C2, C3);
    expect(chunks[0]).toBe(sent1);
    expect(chunks[1]).toBe(sent2);
    expect(chunks[2]).toBe(sent3);
  });
});
