/**
 * Standalone R3 XML-leak test — calls StepFun API directly.
 *
 * Simulates the 3-round orchestrator flow:
 *   R1 → tool_calls (web_search)
 *   tool result injected
 *   R2 → over-long answer (>80 chars)
 *   R3 → forced summary with tools omitted
 *
 * Checks whether step-3.5-flash leaks <tool_call> XML in R3 content.
 *
 * Usage:  STEPFUN_API_KEY=<key> node tests/r3-api-test.mjs
 */

const API_KEY = process.env.STEPFUN_API_KEY;
if (!API_KEY) {
  console.error("Set STEPFUN_API_KEY env var first.");
  process.exit(2);
}
const ENDPOINT =
  "https://api.stepfun.com/step_plan/v1/chat/completions";
const MODEL = "step-3.5-flash";
const TEMPERATURE = 0.3;
const ITERATIONS = 5;

// ── XML patterns we want to detect ──
const TOOL_XML_PATTERNS = [
  /<tool_call>[\s\S]*?<\/tool_call>/,
  /<function=[\s\S]*?<\/function>/,
  /<\|tool_call_begin\|>[\s\S]*?\|tool_call_end\|>/,
];

function containsToolXML(text) {
  for (const p of TOOL_XML_PATTERNS) {
    if (p.test(text)) return true;
  }
  return false;
}

function stripToolXML(text) {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<function=[\s\S]*?<\/function>/g, "")
    .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
    .trim();
}

// ── Fake data that mirrors a real R1→R2 flow ──

const SYSTEM_PROMPT = `You are StepVox, a voice-controlled assistant inside Obsidian.
You speak the same language the user speaks.
Today's date: 2026-05-14.`;

const USER_QUERY = "帮我在网上搜索一下 2026 年最新的人工智能新闻";

// Simulated R1 assistant message with tool_calls
const R1_ASSISTANT = {
  role: "assistant",
  content: "好的，我来帮你搜索一下。",
  tool_calls: [
    {
      id: "call_fake_001",
      type: "function",
      function: {
        name: "web_search",
        arguments: JSON.stringify({ query: "2026 最新人工智能新闻" }),
      },
    },
  ],
};

// Simulated tool result
const TOOL_RESULT = {
  role: "tool",
  content: `[1] OpenAI发布GPT-5模型 引发行业震动
https://example.com/news1
OpenAI于2026年3月正式发布GPT-5，该模型在推理能力方面取得重大突破，在多项基准测试中超越人类表现。

---

[2] 中国大模型公司智谱华章港交所上市
https://example.com/news2
智谱华章于2026年1月8日在港交所挂牌，被称为全球大模型第一股，源自清华大学技术孵化，市值突破500亿港元。

---

[3] 欧盟人工智能法案全面实施
https://example.com/news3
欧盟AI法案于2026年2月正式全面实施，对高风险AI系统提出严格的透明度和问责要求。

---

[4] 谷歌Gemini 2.0发布 多模态能力大幅提升
https://example.com/news4
谷歌于2026年4月发布Gemini 2.0，在视觉理解和代码生成方面实现了跨越式进步。

---

[5] 月之暗面完成美股上市
https://example.com/news5
AI创企月之暗面于2026年3月完成美股上市，成为继智谱之后第二家上市的中国大模型公司。`,
  tool_call_id: "call_fake_001",
};

// Simulated R2 over-long answer (>80 chars triggers R3)
const R2_ASSISTANT_LONG = {
  role: "assistant",
  content:
    "2026年人工智能领域有多条重要新闻。首先，OpenAI于3月发布了GPT-5模型，在推理能力方面取得重大突破。中国方面，智谱华章于1月在港交所上市，成为全球大模型第一股；月之暗面也于3月完成美股上市。此外，欧盟AI法案于2月全面实施，对高风险AI系统提出严格要求。谷歌也在4月发布了Gemini 2.0，多模态能力大幅提升。",
};

// R3 instruction — must match orchestrator.ts exactly
const R3_INSTRUCTION = {
  role: "system",
  content:
    "Summarize the tool results above for the user in a short, spoken-style reply. Three to five sentences.",
};

// ── Build R3 messages ──

function buildR3Messages() {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: USER_QUERY },
    R1_ASSISTANT,
    TOOL_RESULT,
    R2_ASSISTANT_LONG,
    R3_INSTRUCTION,
  ];
}

// ── Scenario 2: R2 had tool_calls (progressive path) ──

const R1_SEARCH_ASSISTANT = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_fake_010",
      type: "function",
      function: {
        name: "search",
        arguments: JSON.stringify({ query: "项目周报" }),
      },
    },
  ],
};

const SEARCH_TOOL_RESULT = {
  role: "tool",
  content: `Found 1 result:
- _stepvox_test/search-xml-test.md (score: 0.92)
  Preview: 项目周报 2026-05-01 本周完成了以下工作：1. 重构了数据处理模块，性能提升30% 2. 修复了用户登录的安全漏洞 3. 新增了数据导出功能...`,
  tool_call_id: "call_fake_010",
};

const R2_READFILE_ASSISTANT = {
  role: "assistant",
  content: "让我看看这个文件的详细内容。",
  tool_calls: [
    {
      id: "call_fake_011",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "_stepvox_test/search-xml-test.md" }),
      },
    },
  ],
};

const READFILE_RESULT = {
  role: "tool",
  content: `# 项目周报 2026-05-01
本周完成了以下工作：
1. 重构了数据处理模块，性能提升30%
2. 修复了用户登录的安全漏洞
3. 新增了数据导出功能，支持CSV和JSON格式
4. 优化了搜索算法，响应时间降低50%
5. 编写了API文档和开发者指南`,
  tool_call_id: "call_fake_011",
};

function buildR3MessagesProgressive() {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "搜索我的笔记里有没有关于项目周报的内容，总结一下" },
    R1_SEARCH_ASSISTANT,
    SEARCH_TOOL_RESULT,
    R2_READFILE_ASSISTANT,
    READFILE_RESULT,
    R3_INSTRUCTION,
  ];
}

// ── API call ──

async function callStepFun(messages) {
  const body = {
    model: MODEL,
    messages,
    temperature: TEMPERATURE,
    // tools key intentionally OMITTED — this is what R3 does
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("No message in response");

  return {
    content: msg.content ?? "",
    hasToolCalls: (msg.tool_calls ?? []).length > 0,
    rawToolCalls: msg.tool_calls ?? [],
  };
}

// ── Run ──

async function runScenario(name, messageBuilder, iterations) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${name}`);
  console.log(`Iterations: ${iterations}`);
  console.log("=".repeat(60));

  let xmlLeaks = 0;
  let toolCallLeaks = 0;
  let emptyAfterStrip = 0;
  let cleanProse = 0;

  for (let i = 1; i <= iterations; i++) {
    process.stdout.write(`  [${i}/${iterations}] `);
    try {
      const result = await callStepFun(messageBuilder());

      const hasXML = containsToolXML(result.content);
      const stripped = stripToolXML(result.content);
      const emptyStripped = stripped.length === 0;

      if (result.hasToolCalls) {
        toolCallLeaks++;
        console.log(`⚠️  TOOL_CALLS in response (${result.rawToolCalls.length} calls)`);
      } else if (hasXML && emptyStripped) {
        xmlLeaks++;
        emptyAfterStrip++;
        console.log(`❌ XML-only content (would fallback to apology)`);
        console.log(`     raw: "${result.content.slice(0, 120)}"`);
      } else if (hasXML) {
        xmlLeaks++;
        console.log(`⚠️  XML mixed with prose (stripToolXML recovers)`);
        console.log(`     raw:     "${result.content.slice(0, 120)}"`);
        console.log(`     cleaned: "${stripped.slice(0, 120)}"`);
      } else {
        cleanProse++;
        console.log(`✅ Clean prose (${result.content.length} chars)`);
        console.log(`     "${result.content.slice(0, 100)}"`);
      }
    } catch (err) {
      console.log(`💥 Error: ${err.message}`);
    }
  }

  console.log(`\n  Summary:`);
  console.log(`    Clean prose:       ${cleanProse}/${iterations}`);
  console.log(`    XML leaks:         ${xmlLeaks}/${iterations} (${emptyAfterStrip} empty-after-strip)`);
  console.log(`    tool_calls leaks:  ${toolCallLeaks}/${iterations}`);
  return { cleanProse, xmlLeaks, toolCallLeaks, emptyAfterStrip };
}

async function main() {
  console.log("StepVox R3 XML-Leak Test");
  console.log(`Model: ${MODEL}  Endpoint: ${ENDPOINT}`);
  console.log(`Temperature: ${TEMPERATURE}`);

  const s1 = await runScenario(
    "A: web_search → over-long R2 → R3 summary",
    buildR3Messages,
    ITERATIONS
  );

  const s2 = await runScenario(
    "B: vault search → progressive R2 tool → R3 summary",
    buildR3MessagesProgressive,
    ITERATIONS
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("OVERALL RESULT");
  console.log("=".repeat(60));

  const totalClean = s1.cleanProse + s2.cleanProse;
  const totalXML = s1.xmlLeaks + s2.xmlLeaks;
  const totalToolCalls = s1.toolCallLeaks + s2.toolCallLeaks;
  const total = ITERATIONS * 2;

  console.log(`  Total clean:        ${totalClean}/${total}`);
  console.log(`  Total XML leaks:    ${totalXML}/${total}`);
  console.log(`  Total tool_calls:   ${totalToolCalls}/${total}`);

  if (totalXML === 0 && totalToolCalls === 0) {
    console.log("\n🎉 ALL CLEAN — no XML leaks detected.");
  } else if (totalToolCalls > 0) {
    console.log("\n⚠️  Model returned tool_calls even with tools omitted — API-level issue.");
  } else {
    console.log(
      `\n⚠️  ${totalXML} XML leak(s) detected — stripToolXML safety net needed.`
    );
  }

  process.exit(totalXML + totalToolCalls > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
