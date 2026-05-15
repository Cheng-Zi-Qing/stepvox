#!/usr/bin/env bun
/**
 * Measure TTS synth latency AND actual playback duration for various
 * chunk sizes. This tells us whether chunk N's playback covers chunk
 * N+1's synthesis time.
 *
 * Usage:  bun scripts/test-tts-duration.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { StepFunTTS } from "../src/providers/stepfun-tts";
import { loadStepVoxData } from "./_lib/load-data";

const OUT_DIR = path.resolve(import.meta.dir, "out");
const SIZES = [40, 60, 80, 100, 150] as const;

const BASE_TEXT =
  "今年上半年，中国大模型赛道迎来了密集的上市潮。" +
  "智谱华章于一月八日在港交所挂牌，成为全球大模型第一股，" +
  "其核心技术源自清华大学的GLM系列模型，主打企业级AI解决方案。" +
  "月之暗面紧随其后，三月在纳斯达克完成上市，" +
  "凭借Kimi系列产品在消费级市场建立了强大的用户基础。";

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

  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}\n`);
  console.log("chars | synth(ms) | play(s) | ratio(play/synth)");
  console.log("------|-----------|---------|------------------");

  for (const size of SIZES) {
    const text = makeText(size);
    const start = performance.now();
    const { audioData } = await tts.synthesize({ text });
    const synthMs = Math.round(performance.now() - start);

    const file = path.join(OUT_DIR, `latency-${size}.mp3`);
    writeFileSync(file, new Uint8Array(audioData));
    const playSec = getAudioDuration(file);

    const ratio = playSec ? (playSec / (synthMs / 1000)).toFixed(2) : "?";
    console.log(
      `${String(size).padStart(5)} | ${String(synthMs).padStart(9)} | ${playSec ? playSec.toFixed(1).padStart(7) : "     ?"} | ${ratio}`
    );
  }
}

main();
