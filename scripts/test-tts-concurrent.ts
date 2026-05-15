#!/usr/bin/env bun
/**
 * Test concurrent TTS synthesis: fire N chunks simultaneously,
 * measure per-chunk latency and whether rate limiting kicks in.
 *
 * Simulates the proposed fan-out strategy:
 *   C1 (60 chars) + C2 (150 chars) + C3 (150 chars) fired at the same time.
 *
 * Also tests C1 (60) + C2 (200) and C1 (60) + C2 (200) + C3 (200)
 * to find the concurrency ceiling.
 *
 * Usage:  bun scripts/test-tts-concurrent.ts
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

interface ChunkSpec { label: string; chars: number; }
interface ChunkResult { label: string; chars: number; synthMs: number; playSec: number | null; error?: string; }

async function testScenario(
  tts: StepFunTTS,
  name: string,
  chunks: ChunkSpec[],
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${name}`);
  console.log(`Chunks: ${chunks.map(c => `${c.label}(${c.chars})`).join(" + ")}`);
  console.log("=".repeat(60));

  const texts = chunks.map(c => makeText(c.chars));
  const wallStart = performance.now();

  // Fire all concurrently
  const promises = texts.map(async (text, i): Promise<ChunkResult> => {
    const start = performance.now();
    try {
      const { audioData } = await tts.synthesize({ text });
      const synthMs = Math.round(performance.now() - start);
      const file = path.join(OUT_DIR, `concurrent-${name}-c${i + 1}.mp3`);
      writeFileSync(file, new Uint8Array(audioData));
      const playSec = getAudioDuration(file);
      return { label: chunks[i].label, chars: chunks[i].chars, synthMs, playSec };
    } catch (err) {
      const synthMs = Math.round(performance.now() - start);
      return { label: chunks[i].label, chars: chunks[i].chars, synthMs, playSec: null, error: String(err) };
    }
  });

  const results = await Promise.all(promises);
  const wallMs = Math.round(performance.now() - wallStart);

  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.label}(${r.chars}): ERROR after ${r.synthMs}ms — ${r.error}`);
    } else {
      console.log(`  ${r.label}(${r.chars}): synth=${r.synthMs}ms  play=${r.playSec?.toFixed(1)}s`);
    }
  }

  const c1 = results[0];
  const c2 = results[1];
  if (c1 && c2 && c1.playSec && !c2.error) {
    const gap = c2.synthMs / 1000 - c1.playSec;
    console.log(`\n  C1 play=${c1.playSec.toFixed(1)}s vs C2 synth=${(c2.synthMs/1000).toFixed(1)}s → gap=${gap.toFixed(1)}s ${gap <= 0 ? "✅ seamless" : "⚠️ would stall"}`);
  }
  console.log(`  Wall time: ${wallMs}ms`);
}

async function main() {
  const { data, path: dataPath } = loadStepVoxData();
  console.log(`Settings: ${dataPath}`);

  const apiKey = data.tts.apiKey || data.stepfun.apiKey;
  if (!apiKey) { console.error("No TTS API key"); process.exit(1); }

  const region = data.stepfun.region;
  const mode = data.stepfun.mode;
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  const endpoint = `https://api.${domain}/${prefix}v1/audio/speech`;

  const tts = new StepFunTTS({
    endpoint, apiKey,
    model: data.tts.model,
    voice: data.tts.voice,
    speed: data.tts.speed,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}`);

  // Scenario A: 60 + 150 (2 concurrent)
  await testScenario(tts, "A", [
    { label: "C1", chars: 60 },
    { label: "C2", chars: 150 },
  ]);

  // Scenario B: 60 + 200 (2 concurrent)
  await testScenario(tts, "B", [
    { label: "C1", chars: 60 },
    { label: "C2", chars: 200 },
  ]);

  // Scenario C: 60 + 150 + 150 (3 concurrent)
  await testScenario(tts, "C", [
    { label: "C1", chars: 60 },
    { label: "C2", chars: 150 },
    { label: "C3", chars: 150 },
  ]);

  // Scenario D: 60 + 200 + 200 (3 concurrent)
  await testScenario(tts, "D", [
    { label: "C1", chars: 60 },
    { label: "C2", chars: 200 },
    { label: "C3", chars: 200 },
  ]);

  // Scenario E: 60 + 200 + 200 + 200 (4 concurrent)
  await testScenario(tts, "E", [
    { label: "C1", chars: 60 },
    { label: "C2", chars: 200 },
    { label: "C3", chars: 200 },
    { label: "C4", chars: 200 },
  ]);
}

main();
