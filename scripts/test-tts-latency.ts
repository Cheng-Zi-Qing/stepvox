#!/usr/bin/env bun
/**
 * Quick latency test: measure TTS synthesis time for 100, 200, 300 char
 * Chinese texts. Runs 3 iterations per size to account for variance.
 *
 * Usage:  bun scripts/test-tts-latency.ts
 */

import { StepFunTTS } from "../src/providers/stepfun-tts";
import { loadStepVoxData } from "./_lib/load-data";

const SIZES = [100, 200, 300] as const;
const ITERATIONS = 3;

const BASE_TEXT =
  "今年上半年，中国大模型赛道迎来了密集的上市潮。" +
  "智谱华章于一月八日在港交所挂牌，成为全球大模型第一股，" +
  "其核心技术源自清华大学的GLM系列模型，主打企业级AI解决方案。" +
  "月之暗面紧随其后，三月在纳斯达克完成上市，" +
  "凭借Kimi系列产品在消费级市场建立了强大的用户基础。" +
  "此外，百川智能和零一万物也在积极筹备上市计划。" +
  "整体来看，中国大模型行业已经从技术验证阶段进入规模化商业落地阶段。";

function makeText(chars: number): string {
  let text = BASE_TEXT;
  while (text.length < chars) text += BASE_TEXT;
  return text.slice(0, chars);
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

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}\n`);

  for (const size of SIZES) {
    const text = makeText(size);
    console.log(`--- ${size} chars (actual ${text.length}) ---`);
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const { audioData } = await tts.synthesize({ text });
      const ms = Math.round(performance.now() - start);
      times.push(ms);
      console.log(`  #${i + 1}: ${ms}ms (${audioData.byteLength} bytes)`);
    }

    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`  avg=${avg}ms  min=${min}ms  max=${max}ms\n`);
  }
}

main();
