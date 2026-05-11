#!/usr/bin/env bun

/**
 * Test StepFun API connectivity for both API and Coding Plan modes
 * Usage: bun run scripts/test-stepfun.ts <api-key>
 */

const API_KEY = process.argv[2];

if (!API_KEY) {
  console.error("Usage: bun run scripts/test-stepfun.ts <api-key>");
  process.exit(1);
}

const TEST_MESSAGE = {
  model: "step-3.5-flash",
  messages: [
    {
      role: "user",
      content: "Hello, respond with 'OK' if you receive this message.",
    },
  ],
  max_tokens: 50,
};

async function testEndpoint(name: string, url: string) {
  console.log(`\n[${name}] Testing: ${url}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(TEST_MESSAGE),
    });

    const text = await response.text();

    if (response.ok) {
      console.log(`✓ [${name}] Success (${response.status})`);
      console.log(`  Response: ${text.slice(0, 200)}`);
      return true;
    } else {
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
  console.log("Testing StepFun API connectivity...");
  console.log(`API Key: ${API_KEY.slice(0, 10)}...`);

  const results = await Promise.all([
    testEndpoint(
      "China + API",
      "https://api.stepfun.com/v1/chat/completions"
    ),
    testEndpoint(
      "China + Coding Plan",
      "https://api.stepfun.com/step_plan/v1/chat/completions"
    ),
  ]);

  console.log("\n=== Summary ===");
  console.log(`China + API: ${results[0] ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`China + Coding Plan: ${results[1] ? "✓ PASS" : "✗ FAIL"}`);

  const allPassed = results.every((r) => r);
  process.exit(allPassed ? 0 : 1);
}

main();
