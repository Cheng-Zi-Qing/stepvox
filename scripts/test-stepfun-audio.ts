#!/usr/bin/env bun

/**
 * Test StepFun Audio API (TTS) connectivity for both API and Coding Plan modes
 * Usage: bun scripts/test-stepfun-audio.ts <api-key>
 */

const API_KEY = process.argv[2];

if (!API_KEY) {
  console.error("Usage: bun scripts/test-stepfun-audio.ts <api-key>");
  process.exit(1);
}

const TEST_TEXT = "你好，这是一个测试。";

async function testTTS(name: string, url: string) {
  console.log(`\n[${name}] Testing TTS: ${url}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "stepaudio-2.5-tts",
        input: TEST_TEXT,
        voice: "youyanvsheng",
      }),
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");
      console.log(`✓ [${name}] Success (${response.status})`);
      console.log(`  Content-Type: ${contentType}`);
      console.log(`  Content-Length: ${contentLength} bytes`);
      return true;
    } else {
      const text = await response.text();
      console.log(`✗ [${name}] Failed (${response.status})`);
      console.log(`  Error: ${text.slice(0, 200)}`);
      return false;
    }
  } catch (error) {
    console.log(`✗ [${name}] Error: ${(error as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("Testing StepFun Audio API (TTS) connectivity...");
  console.log(`API Key: ${API_KEY.slice(0, 10)}...`);

  const results = await Promise.all([
    testTTS("China + API", "https://api.stepfun.com/v1/audio/speech"),
    testTTS(
      "China + Coding Plan",
      "https://api.stepfun.com/step_plan/v1/audio/speech"
    ),
  ]);

  console.log("\n=== Summary ===");
  console.log(`China + API: ${results[0] ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`China + Coding Plan: ${results[1] ? "✓ PASS" : "✗ FAIL"}`);

  const allPassed = results.every((r) => r);
  process.exit(allPassed ? 0 : 1);
}

main();
