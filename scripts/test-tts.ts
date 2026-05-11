#!/usr/bin/env bun

/**
 * Function test for StepFun TTS using the real StepFunTTS class.
 *
 * Reads provider/endpoint/key/model/voice from the plugin's data.json
 * (~/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json).
 *
 * Verifies:
 *   1. synthesize() returns non-empty MP3 audio for short Chinese text
 *   2. synthesize() returns non-empty MP3 audio for longer mixed-language text
 *   3. empty text rejects (input validation)
 *   4. invalid voice triggers HTTP error (provider-level error path)
 *
 * Usage:
 *   bun scripts/test-tts.ts            # uses configured region/mode
 *   bun scripts/test-tts.ts --save     # also writes the audio to /tmp for manual playback
 */

import { writeFileSync } from "node:fs";
import { StepFunTTS } from "../src/providers/stepfun-tts";
import { loadStepVoxData } from "./_lib/load-data";

const SAVE = process.argv.includes("--save");

function ttsEndpoint(region: "china" | "global", mode: "api" | "plan"): string {
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  return `https://api.${domain}/${prefix}v1/audio/speech`;
}

interface CaseResult { name: string; pass: boolean; detail: string; durationMs: number; }

async function runCase(name: string, fn: () => Promise<{ pass: boolean; detail: string }>): Promise<CaseResult> {
  const start = Date.now();
  try {
    const { pass, detail } = await fn();
    return { name, pass, detail, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name, pass: false,
      detail: `Threw: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

// MP3 frame header: sync word 0xFFE/0xFFF in first 2 bytes.
function looksLikeMP3(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const view = new Uint8Array(buf);
  // ID3 tag header is also valid (some encoders prepend it)
  if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) return true; // "ID3"
  if (view[0] !== 0xff) return false;
  return (view[1] & 0xe0) === 0xe0;
}

async function main() {
  const { data, path } = loadStepVoxData();
  console.log(`Loaded settings from: ${path}`);

  const apiKey = data.tts.apiKey || data.stepfun.apiKey;
  if (!apiKey) {
    console.error("No TTS API key found in data.json (tts.apiKey or stepfun.apiKey)");
    process.exit(1);
  }

  const region = data.stepfun.region;
  const mode = data.stepfun.mode;
  const endpoint = ttsEndpoint(region, mode);
  const tts = new StepFunTTS({
    endpoint,
    apiKey,
    model: data.tts.model,
    voice: data.tts.voice,
    speed: data.tts.speed,
  });

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${data.tts.model}, Voice: ${data.tts.voice}, Speed: ${data.tts.speed}`);
  console.log(`API Key: ${apiKey.slice(0, 8)}...`);

  const results: CaseResult[] = [];

  // Case 1: short Chinese text
  results.push(
    await runCase("synthesize short Chinese text returns valid MP3", async () => {
      const { audioData, format } = await tts.synthesize({ text: "你好，这是一个测试。" });
      if (!audioData || audioData.byteLength === 0) {
        return { pass: false, detail: "empty audio buffer" };
      }
      if (format !== "mp3") {
        return { pass: false, detail: `unexpected format: ${format}` };
      }
      if (!looksLikeMP3(audioData)) {
        return { pass: false, detail: `audio doesn't look like MP3 (first bytes: ${Array.from(new Uint8Array(audioData).slice(0, 4)).map(b => b.toString(16)).join(" ")})` };
      }
      if (SAVE) {
        const out = "/tmp/stepvox-tts-test-zh.mp3";
        writeFileSync(out, new Uint8Array(audioData));
        return { pass: true, detail: `${audioData.byteLength} bytes MP3 (saved to ${out})` };
      }
      return { pass: true, detail: `${audioData.byteLength} bytes valid MP3` };
    })
  );

  // Case 2: longer mixed-language text
  results.push(
    await runCase("synthesize longer mixed text returns valid MP3", async () => {
      const text = "Hello world. 这是一段更长的测试文本，用来验证 TTS 能否处理混合语言内容。";
      const { audioData } = await tts.synthesize({ text });
      if (!audioData || audioData.byteLength === 0) {
        return { pass: false, detail: "empty audio buffer" };
      }
      if (!looksLikeMP3(audioData)) {
        return { pass: false, detail: "audio doesn't look like MP3" };
      }
      if (SAVE) {
        const out = "/tmp/stepvox-tts-test-mixed.mp3";
        writeFileSync(out, new Uint8Array(audioData));
        return { pass: true, detail: `${audioData.byteLength} bytes MP3 (saved to ${out})` };
      }
      return { pass: true, detail: `${audioData.byteLength} bytes valid MP3` };
    })
  );

  // Case 3: empty text rejects
  results.push(
    await runCase("empty text rejects with input error", async () => {
      try {
        await tts.synthesize({ text: "" });
        return { pass: false, detail: "should have thrown for empty text" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("empty")) return { pass: true, detail: `correctly threw: ${msg}` };
        return { pass: false, detail: `threw but unexpected message: ${msg}` };
      }
    })
  );

  // Case 4: invalid voice → HTTP error path
  results.push(
    await runCase("invalid voice surfaces HTTP error", async () => {
      try {
        await tts.synthesize({ text: "测试", voice: "this-voice-does-not-exist-xyz123" });
        return { pass: false, detail: "request unexpectedly succeeded with invalid voice" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("TTS request failed")) {
          return { pass: true, detail: `correctly threw: ${msg.slice(0, 100)}` };
        }
        return { pass: false, detail: `threw but unexpected message: ${msg.slice(0, 100)}` };
      }
    })
  );

  console.log("\n=== Results ===");
  for (const r of results) {
    const mark = r.pass ? "✓" : "✗";
    console.log(`${mark} ${r.name} (${r.durationMs}ms)`);
    console.log(`  ${r.detail}`);
  }

  const allPassed = results.every((r) => r.pass);
  console.log(`\n${allPassed ? "✓ ALL PASS" : "✗ SOME FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

main();
