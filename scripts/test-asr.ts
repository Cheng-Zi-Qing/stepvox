#!/usr/bin/env bun

/**
 * Test StepFun ASR SSE endpoint connectivity.
 *
 * Reads StepFun API key + region/mode from the plugin's data.json
 * (~/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json).
 *
 * Usage:
 *   bun scripts/test-asr.ts            # uses configured region/mode only
 *   bun scripts/test-asr.ts --all      # also tries the other mode for comparison
 */

import { loadStepVoxData } from "./_lib/load-data";

const ALL = process.argv.includes("--all");

function generateSilencePCM16(durationSec: number, sampleRate: number): string {
  const numSamples = durationSec * sampleRate;
  const buffer = new ArrayBuffer(numSamples * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < numSamples; i++) view.setInt16(i * 2, 0, true);
  return Buffer.from(buffer).toString("base64");
}

function asrEndpoint(region: "china" | "global", mode: "api" | "plan"): string {
  const domain = region === "china" ? "stepfun.com" : "stepfun.ai";
  const prefix = mode === "plan" ? "step_plan/" : "";
  return `https://api.${domain}/${prefix}v1/audio/asr/sse`;
}

async function testASR(name: string, url: string, apiKey: string, model: string, language: string, sampleRate: number) {
  console.log(`\n[${name}] Testing ASR: ${url}`);
  const audioBase64 = generateSilencePCM16(1, sampleRate);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        audio: {
          data: audioBase64,
          input: {
            transcription: { language, model, enable_itn: true },
            format: { type: "pcm", codec: "pcm_s16le", rate: sampleRate, bits: 16, channel: 1 },
          },
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`✗ [${name}] Failed (${response.status})`);
      console.log(`  Error: ${text.slice(0, 200)}`);
      return false;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.log(`✗ [${name}] No response body`);
      return false;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let receivedEvents = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          console.log(`✓ [${name}] Success (received ${receivedEvents} events, stream closed)`);
          return true;
        }
        try {
          const event = JSON.parse(data);
          receivedEvents++;
          if (event.type === "error") {
            console.log(`✗ [${name}] ASR error: ${event.message}`);
            return false;
          }
        } catch {
          // skip malformed
        }
      }
    }

    console.log(`✓ [${name}] Success (received ${receivedEvents} events)`);
    return true;
  } catch (error) {
    console.log(`✗ [${name}] Error: ${(error as Error).message}`);
    return false;
  }
}

async function main() {
  const { data, path } = loadStepVoxData();
  console.log(`Loaded settings from: ${path}`);

  const apiKey = data.asr.apiKey || data.stepfun.apiKey;
  if (!apiKey) {
    console.error("No ASR API key found in data.json (asr.apiKey or stepfun.apiKey)");
    process.exit(1);
  }

  const region = data.stepfun.region;
  const configuredMode = data.stepfun.mode;
  const model = data.asr.model;
  const language = data.asr.language;
  const sampleRate = data.audio.sampleRate;

  console.log(`API Key: ${apiKey.slice(0, 8)}...`);
  console.log(`Region: ${region}, Mode: ${configuredMode}, Model: ${model}, Lang: ${language}, Rate: ${sampleRate}`);

  const targets = ALL
    ? [
        { name: `${region} + api`, url: asrEndpoint(region, "api") },
        { name: `${region} + plan`, url: asrEndpoint(region, "plan") },
      ]
    : [{ name: `${region} + ${configuredMode} (configured)`, url: asrEndpoint(region, configuredMode) }];

  const results: boolean[] = [];
  for (const t of targets) {
    results.push(await testASR(t.name, t.url, apiKey, model, language, sampleRate));
  }

  console.log("\n=== Summary ===");
  for (let i = 0; i < targets.length; i++) {
    console.log(`${targets[i].name}: ${results[i] ? "✓ PASS" : "✗ FAIL"}`);
  }

  const allPassed = results.every((r) => r);
  process.exit(allPassed ? 0 : 1);
}

main();
