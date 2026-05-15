#!/usr/bin/env bun
/**
 * Chain window test for 60+150 combination.
 * C1(60) + C2(150) concurrent, then serial C3/C4 at various sizes.
 *
 * Usage:  bun scripts/test-tts-chain-150.ts
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

async function synthOne(tts: StepFunTTS, label: string, chars: number) {
  const text = makeText(chars);
  const start = performance.now();
  const { audioData } = await tts.synthesize({ text });
  const synthMs = Math.round(performance.now() - start);
  const file = path.join(OUT_DIR, `chain150-${label}.mp3`);
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

  // Step 1: C1(60) + C2(150) concurrent
  console.log("── C1(60) + C2(150) concurrent ──");
  const [c1, c2] = await Promise.all([
    synthOne(tts, "C1", 60),
    synthOne(tts, "C2", 150),
  ]);
  console.log(`  C1: synth=${c1.synthMs}ms  play=${c1.playSec.toFixed(1)}s`);
  console.log(`  C2: synth=${c2.synthMs}ms  play=${c2.playSec.toFixed(1)}s`);
  const margin12 = c1.playSec - c2.synthMs / 1000;
  console.log(`  C1→C2: margin=${margin12.toFixed(1)}s ${margin12 >= 0 ? "✅" : "⚠️"}`);

  // Step 2: C3 fires after C2 synth. Window = C2 play.
  console.log(`\n── C3 window = C2 play = ${c2.playSec.toFixed(1)}s ──`);
  const c3Sizes = [150, 200, 250, 300];
  for (const size of c3Sizes) {
    const r = await synthOne(tts, `C3-${size}`, size);
    const fits = r.synthMs / 1000 < c2.playSec;
    console.log(`  C3(${size}): synth=${(r.synthMs/1000).toFixed(1)}s  play=${r.playSec.toFixed(1)}s  ${fits ? "✅" : "❌"} (margin=${(c2.playSec - r.synthMs/1000).toFixed(1)}s)`);
  }

  // Step 3: C4 window = C3(150 or 200) play
  // Use 150 as conservative C3 size
  const c3_150 = await synthOne(tts, "C3-ref", 150);
  console.log(`\n── C4 window = C3(150) play = ${c3_150.playSec.toFixed(1)}s ──`);
  for (const size of [150, 200, 300]) {
    const r = await synthOne(tts, `C4-${size}`, size);
    const fits = r.synthMs / 1000 < c3_150.playSec;
    console.log(`  C4(${size}): synth=${(r.synthMs/1000).toFixed(1)}s  play=${r.playSec.toFixed(1)}s  ${fits ? "✅" : "❌"} (margin=${(c3_150.playSec - r.synthMs/1000).toFixed(1)}s)`);
  }
}

main();
