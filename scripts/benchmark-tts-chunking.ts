#!/usr/bin/env bun
/**
 * Benchmark: TTS chunking strategies for ~300-char Chinese text.
 *
 * Compares three modes:
 *   A) One-shot — send the full text as a single TTS request
 *   B) Hard-cut at 120 chars — split at fixed character boundary (no regard for punctuation)
 *   C) Smart-cut at 120 chars — split at sentence/comma boundaries (current StepVox approach)
 *
 * Measures per mode:
 *   - First-byte latency (time until first TTS response arrives)
 *   - Per-chunk synth time
 *   - Total wall-clock time (synth + simulated playback, serial)
 *   - Chunk boundaries (where cuts happen)
 *
 * Saves all audio to scripts/out/benchmark-* for manual listening comparison.
 *
 * Usage:
 *   bun scripts/benchmark-tts-chunking.ts
 *   afplay scripts/out/benchmark-A-oneshot.mp3
 *   afplay scripts/out/benchmark-B-hardcut.mp3
 *   afplay scripts/out/benchmark-C-smartcut.mp3
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { StepFunTTS } from "../src/providers/stepfun-tts";
import { loadStepVoxData } from "./_lib/load-data";

const OUT_DIR = path.resolve(import.meta.dir, "out");

const TEST_TEXT =
  "今年上半年，中国大模型赛道迎来了密集的上市潮。" +
  "智谱华章于一月八日在港交所挂牌，成为全球大模型第一股，" +
  "其核心技术源自清华大学的 GLM 系列模型，主打企业级 AI 解决方案。" +
  "月之暗面紧随其后，三月在纳斯达克完成上市，" +
  "凭借 Kimi 系列产品在消费级市场建立了强大的用户基础。" +
  "此外，百川智能和零一万物也在积极筹备上市计划。" +
  "整体来看，中国大模型行业已经从技术验证阶段进入规模化商业落地阶段，" +
  "资本市场对这一赛道的热情持续高涨。" +
  "从技术路线来看，这些公司各有侧重：智谱走的是通用大模型加企业私有化部署的路子，" +
  "月之暗面则押注长上下文和多模态能力，百川在医疗和金融垂直领域深耕。" +
  "值得注意的是，开源生态也在同步发展，" +
  "DeepSeek 和阶跃星辰相继发布了高质量的开源模型，" +
  "推动整个行业的技术水位持续提升。";

// --- Chunking strategies ---

function chunkHardCut(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    const piece = text.slice(i, i + maxChars).trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}

function chunkSmartCut(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const strongBreak = Math.max(
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?"),
      window.lastIndexOf("\n"),
    );
    const softBreak = Math.max(
      window.lastIndexOf("，"),
      window.lastIndexOf("；"),
      window.lastIndexOf(";"),
      window.lastIndexOf(","),
    );

    let cutAt = -1;
    if (strongBreak >= maxChars * 0.25) cutAt = strongBreak + 1;
    else if (softBreak >= maxChars * 0.25) cutAt = softBreak + 1;
    else cutAt = maxChars;

    const piece = remaining.slice(0, cutAt).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

// --- Benchmark runner ---

interface ChunkResult {
  index: number;
  text: string;
  chars: number;
  synthMs: number;
  audioBytes: number;
  estimatedPlayMs: number;
}

interface ModeResult {
  mode: string;
  label: string;
  chunks: ChunkResult[];
  firstByteMs: number;
  totalSynthMs: number;
  totalEstimatedMs: number;
  audioBuffers: ArrayBuffer[];
}

function estimatePlayMs(audio: ArrayBuffer): number {
  return Math.round((audio.byteLength / 3200) * 1000);
}

async function benchmarkMode(
  tts: StepFunTTS,
  mode: string,
  label: string,
  chunks: string[],
): Promise<ModeResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Mode ${mode}: ${label}`);
  console.log(`Chunks: ${chunks.length}, chars: [${chunks.map((c) => c.length).join(", ")}]`);
  console.log(`${"=".repeat(60)}`);

  const results: ChunkResult[] = [];
  const audioBuffers: ArrayBuffer[] = [];
  let firstByteMs = 0;
  let totalSynthMs = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n  Chunk ${i + 1}/${chunks.length} (${chunk.length} chars):`);
    console.log(`  "${chunk.slice(0, 50)}${chunk.length > 50 ? "..." : ""}"`);

    const synthStart = performance.now();
    const { audioData } = await tts.synthesize({ text: chunk });
    const synthMs = Math.round(performance.now() - synthStart);
    const playMs = estimatePlayMs(audioData);

    if (i === 0) firstByteMs = synthMs;
    totalSynthMs += synthMs;

    results.push({
      index: i,
      text: chunk,
      chars: chunk.length,
      synthMs,
      audioBytes: audioData.byteLength,
      estimatedPlayMs: playMs,
    });
    audioBuffers.push(audioData);

    console.log(`  synth: ${synthMs}ms | audio: ${audioData.byteLength} bytes | est. play: ${playMs}ms`);
  }

  const totalEstimatedMs = totalSynthMs + results.reduce((s, r) => s + r.estimatedPlayMs, 0);

  return { mode, label, chunks: results, firstByteMs, totalSynthMs, totalEstimatedMs, audioBuffers };
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), off);
    off += b.byteLength;
  }
  return out.buffer;
}

function printChunkBoundaries(label: string, chunks: string[]): void {
  console.log(`\n  ${label} chunk boundaries:`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const tail = c.slice(-15);
    const head = i + 1 < chunks.length ? chunks[i + 1].slice(0, 15) : "(end)";
    console.log(`    [${i + 1}] ...${tail} | ${head}...  (${c.length} chars)`);
  }
}

async function main() {
  const { data, path: dataPath } = loadStepVoxData();
  console.log(`Settings: ${dataPath}`);

  const apiKey = data.tts.apiKey || data.stepfun.apiKey;
  if (!apiKey) {
    console.error("No TTS API key found");
    process.exit(1);
  }

  const region = data.stepfun.region;
  const mode = data.stepfun.mode;
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  const endpoint = `https://api.${domain}/${prefix}v1/audio/speech`;

  const tts = new StepFunTTS({
    endpoint,
    apiKey,
    model: data.tts.model,
    voice: data.tts.voice,
    speed: data.tts.speed,
  });

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}, Speed: ${data.tts.speed}`);
  console.log(`\nTest text (${TEST_TEXT.length} chars):`);
  console.log(`"${TEST_TEXT}"\n`);

  const MAX_CHARS = 120;

  const chunksA = [TEST_TEXT];
  const chunksB = chunkHardCut(TEST_TEXT, MAX_CHARS);
  const chunksC = chunkSmartCut(TEST_TEXT, MAX_CHARS);

  console.log("\n--- Chunk boundary comparison ---");
  printChunkBoundaries("A (one-shot)", chunksA);
  printChunkBoundaries("B (hard-cut)", chunksB);
  printChunkBoundaries("C (smart-cut)", chunksC);

  const resultA = await benchmarkMode(tts, "A", "One-shot (full text)", chunksA);
  const resultB = await benchmarkMode(tts, "B", `Hard-cut at ${MAX_CHARS} chars`, chunksB);
  const resultC = await benchmarkMode(tts, "C", `Smart-cut at ${MAX_CHARS} chars (StepVox)`, chunksC);

  // Save audio files — each chunk individually + concatenated
  mkdirSync(OUT_DIR, { recursive: true });
  const files: Record<string, string> = {};
  const durations: Record<string, number> = {};

  for (const r of [resultA, resultB, resultC]) {
    const tag = r.mode === "A" ? "oneshot" : r.mode === "B" ? "hardcut" : "smartcut";

    // Save each chunk individually
    let totalDuration = 0;
    for (let i = 0; i < r.audioBuffers.length; i++) {
      const chunkFile = path.join(OUT_DIR, `benchmark-${r.mode}-${tag}-chunk${i + 1}.mp3`);
      writeFileSync(chunkFile, new Uint8Array(r.audioBuffers[i]));
      try {
        const info = execSync(`afinfo "${chunkFile}" 2>/dev/null`, { encoding: "utf-8" });
        const match = info.match(/estimated duration:\s+([\d.]+)/);
        if (match) {
          const dur = parseFloat(match[1]);
          totalDuration += dur;
          r.chunks[i].estimatedPlayMs = Math.round(dur * 1000);
        }
      } catch { /* afinfo unavailable, keep estimate */ }
    }

    // Save concatenated
    const concatFile = path.join(OUT_DIR, `benchmark-${r.mode}-${tag}.mp3`);
    writeFileSync(concatFile, new Uint8Array(concatBuffers(r.audioBuffers)));
    files[r.mode] = concatFile;
    durations[r.mode] = Math.round(totalDuration * 10) / 10;

    // Recalculate total with real durations
    r.totalEstimatedMs = r.totalSynthMs + r.chunks.reduce((s, c) => s + c.estimatedPlayMs, 0);
  }

  // Summary table
  console.log("\n\n" + "=".repeat(80));
  console.log("BENCHMARK RESULTS");
  console.log("=".repeat(80));
  console.log(`\nTest text: ${TEST_TEXT.length} chars | TTS max chunk: ${MAX_CHARS} chars`);
  console.log(`Voice: ${data.tts.voice} | Model: ${data.tts.model}\n`);

  const header = [
    "Mode".padEnd(35),
    "Chunks".padStart(6),
    "1st byte".padStart(10),
    "Total synth".padStart(12),
    "Audio dur".padStart(10),
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of [resultA, resultB, resultC]) {
    console.log(
      [
        `${r.mode}: ${r.label}`.padEnd(35),
        String(r.chunks.length).padStart(6),
        `${r.firstByteMs}ms`.padStart(10),
        `${r.totalSynthMs}ms`.padStart(12),
        `${durations[r.mode]}s`.padStart(10),
      ].join(" | "),
    );
  }

  console.log("\nPer-chunk breakdown:");
  for (const r of [resultA, resultB, resultC]) {
    console.log(`\n  ${r.mode}: ${r.label}`);
    for (const c of r.chunks) {
      const durSec = (c.estimatedPlayMs / 1000).toFixed(1);
      console.log(
        `    chunk ${c.index + 1}: ${c.chars} chars → synth ${c.synthMs}ms, ` +
          `${c.audioBytes} bytes, duration ${durSec}s`,
      );
    }
  }

  console.log("\nSaved audio files:");
  for (const [m, f] of Object.entries(files)) {
    console.log(`  ${m}: ${f}`);
  }

  console.log("\nPlay & compare:");
  console.log(`  afplay "${files.A}" && echo "---" && afplay "${files.B}" && echo "---" && afplay "${files.C}"`);
}

main();
