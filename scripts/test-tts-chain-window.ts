#!/usr/bin/env bun
/**
 * Chain timing test: measure the time window each chunk's playback
 * gives to the next chunk's synthesis.
 *
 * Strategy: C1(60) + C2(200) fired concurrently.
 * C3 fires after C2 synth completes. C4 fires after C3 synth completes.
 * Question: how big can C3/C4 be given that their synth must fit
 * within the previous chunk's playback duration?
 *
 * Usage:  bun scripts/test-tts-chain-window.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { StepFunTTS } from "../src/providers/stepfun-tts";
import { loadStepVoxData } from "./_lib/load-data";

const OUT_DIR = path.resolve(import.meta.dir, "out");

const BASE_TEXT =
  "今年上半年，中国大模型赛道迎来了密集的上市潮。" +
  "智谱华章于一月八日在港交所挂牌，成为全球大模型第一股，" +
  "其核心技术源自清华大学的GLM系列模型，主打企业级AI解决方案。" +
  "月之暗面紧随其后，三月在纳斯达克完成上市，" +
  "凭借Kimi系列产品在消费级市场建立了强大的用户基础。" +
  "此外，百川智能和零一万物也在积极筹备上市计划。" +
  "整体来看，中国大模型行业已经从技术验证阶段进入规模化商业落地阶段，" +
  "资本市场对这一赛道的热情持续高涨。" +
  "从技术路线来看，这些公司各有侧重：智谱走的是通用大模型加企业私有化部署的路子，" +
  "月之暗面则押注长上下文和多模态能力，百川在医疗和金融垂直领域深耕。";

function makeText(chars: number): string {
  let text = BASE_TEXT;
  while (text.length < chars) text += BASE_TEXT;
  return text.slice(0, chars);
}

function getAudioDuration(filePath: string): number | null {
  try {
    const info = execSync(`afinfo "${filePath}" 2>/dev/null`, { encoding: "utf-8" });
    const match = info.match(/estimated duration:\s+([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  } catch { return null; }
}

interface Result {
  label: string;
  chars: number;
  synthMs: number;
  playSec: number;
}

async function synth(tts: StepFunTTS, label: string, chars: number): Promise<Result> {
  const text = makeText(chars);
  const start = performance.now();
  const { audioData } = await tts.synthesize({ text });
  const synthMs = Math.round(performance.now() - start);
  const file = path.join(OUT_DIR, `chain-${label}.mp3`);
  writeFileSync(file, new Uint8Array(audioData));
  const playSec = getAudioDuration(file) ?? 0;
  return { label, chars, synthMs, playSec };
}

async function main() {
  const { data } = loadStepVoxData();
  const apiKey = data.tts.apiKey || data.stepfun.apiKey;
  if (!apiKey) { console.error("No TTS API key"); process.exit(1); }

  const region = data.stepfun.region;
  const mode = data.stepfun.mode;
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  const endpoint = `https://api.${domain}/${prefix}v1/audio/speech`;

  const tts = new StepFunTTS({
    endpoint, apiKey,
    model: data.tts.model, voice: data.tts.voice, speed: data.tts.speed,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}\n`);

  // Step 1: C1(60) + C2(200) concurrently
  console.log("── Step 1: C1(60) + C2(200) concurrent ──");
  const [c1, c2] = await Promise.all([
    synth(tts, "C1", 60),
    synth(tts, "C2", 200),
  ]);
  console.log(`  C1: synth=${c1.synthMs}ms  play=${c1.playSec.toFixed(1)}s`);
  console.log(`  C2: synth=${c2.synthMs}ms  play=${c2.playSec.toFixed(1)}s`);
  console.log(`  C1 play covers C2 synth? ${c1.playSec > c2.synthMs/1000 ? "✅" : "⚠️"} (${(c1.playSec - c2.synthMs/1000).toFixed(1)}s margin)`);

  // Step 2: C3 fires after C2 synth completes (serial).
  // C3's synth window = C2's playback duration.
  // Test C3 at 200, 250, 300 chars to find boundary.
  console.log(`\n── Step 2: C3 window = C2 play = ${c2.playSec.toFixed(1)}s ──`);
  console.log(`  Testing C3 sizes to find what fits in ${c2.playSec.toFixed(1)}s...\n`);

  const c3Sizes = [200, 250, 300, 400];
  const c3Results: Result[] = [];
  for (const size of c3Sizes) {
    const r = await synth(tts, `C3-${size}`, size);
    c3Results.push(r);
    const fits = r.synthMs / 1000 < c2.playSec;
    console.log(`  C3(${size}): synth=${r.synthMs}ms (${(r.synthMs/1000).toFixed(1)}s)  play=${r.playSec.toFixed(1)}s  ${fits ? "✅ fits" : "❌ exceeds"} in ${c2.playSec.toFixed(1)}s window`);
  }

  // Step 3: pick the largest C3 that fits, then check C4 window
  const bestC3 = c3Results.filter(r => r.synthMs / 1000 < c2.playSec).pop();
  if (bestC3) {
    console.log(`\n── Step 3: C4 window = C3(${bestC3.chars}) play = ${bestC3.playSec.toFixed(1)}s ──`);
    console.log(`  Testing C4 sizes...\n`);

    for (const size of [200, 300, 400]) {
      const r = await synth(tts, `C4-${size}`, size);
      const fits = r.synthMs / 1000 < bestC3.playSec;
      console.log(`  C4(${size}): synth=${r.synthMs}ms (${(r.synthMs/1000).toFixed(1)}s)  play=${r.playSec.toFixed(1)}s  ${fits ? "✅ fits" : "❌ exceeds"} in ${bestC3.playSec.toFixed(1)}s window`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("CHAIN SUMMARY");
  console.log("=".repeat(60));
  console.log(`  C1(60):  synth=${c1.synthMs}ms  play=${c1.playSec.toFixed(1)}s → window for C2`);
  console.log(`  C2(200): synth=${c2.synthMs}ms  play=${c2.playSec.toFixed(1)}s → window for C3`);
  for (const r of c3Results) {
    console.log(`  C3(${r.chars}): synth=${r.synthMs}ms  play=${r.playSec.toFixed(1)}s → window for C4`);
  }
}

main();
