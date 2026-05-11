import type { App, TFile } from "obsidian";
import type { ToolCall } from "../../src/providers/types";
import type { TestCase } from "./helpers";
import {
  expectToolCalled,
  expectNoTools,
  expectFileExists,
  expectFileContains,
  expectFileNotExists,
  expectResultNotEmpty,
} from "./helpers";

const TEST_DIR = "_stepvox_test";

export function buildCases(): TestCase[] {
  return [
    // === Read Layer ===
    {
      name: "R1: read_file on existing note",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/sample.md`, "# Sample\nHello world");
      },
      input: `读一下 ${TEST_DIR}/sample 的内容`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "read_file");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/sample.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "R3: list_files",
      setup: async (app) => {
        const existing = app.vault.getAbstractFileByPath(TEST_DIR);
        if (!existing) await app.vault.createFolder(TEST_DIR);
        const a = app.vault.getAbstractFileByPath(`${TEST_DIR}/a.md`);
        if (!a) await app.vault.create(`${TEST_DIR}/a.md`, "a");
        const b = app.vault.getAbstractFileByPath(`${TEST_DIR}/b.md`);
        if (!b) await app.vault.create(`${TEST_DIR}/b.md`, "b");
      },
      input: `${TEST_DIR} 目录下有哪些文件`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "list_files");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app) => {
        for (const name of ["a.md", "b.md"]) {
          const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/${name}`);
          if (f) await app.vault.delete(f);
        }
      },
    },
    {
      name: "R5: active file handled via injected system prompt (no tool needed)",
      setup: async (app) => {
        const existing = app.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (!existing) await app.vault.create(`${TEST_DIR}/active-test.md`, "active file");
        const file = app.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (file) await app.workspace.getLeaf().openFile(file as TFile);
      },
      input: "我现在打开的是什么文件",
      assert: async (result, _app, toolLog) => {
        // D47: get_active_file tool is removed. LLM should answer from the active file
        // path that's injected into the system prompt, without calling any tool.
        const mentionsFile = result.toLowerCase().includes("active-test");
        if (mentionsFile) return { pass: true, detail: "File mentioned in response (no tool call needed)" };
        return { pass: false, detail: `Response did not mention active file. Tools: [${toolLog.map(c => c.name).join(", ")}], response: ${result.slice(0, 80)}` };
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/active-test.md`);
        if (f) await app.vault.delete(f);
      },
    },

    // === Write Layer ===
    {
      name: "W1: create_file",
      input: `在 ${TEST_DIR} 目录下创建一个叫 new-note 的笔记，内容写 hello world`,
      assert: async (result, app, toolLog) => {
        const t = expectToolCalled(toolLog, "create_file");
        if (!t.pass) return t;
        return expectFileContains(app, `${TEST_DIR}/new-note.md`, "hello");
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/new-note.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "W2: append",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/append-test.md`, "line1");
      },
      input: `在 ${TEST_DIR}/append-test 末尾加一行 line2`,
      assert: async (result, app, toolLog) => {
        const t = expectToolCalled(toolLog, "append");
        if (!t.pass) return t;
        return expectFileContains(app, `${TEST_DIR}/append-test.md`, "line2");
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/append-test.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "W3: update_content",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/update-test.md`, "old text here");
      },
      input: `把 ${TEST_DIR}/update-test 里的 "old text" 改成 "new text"`,
      assert: async (result, app, toolLog) => {
        const fileResult = await expectFileContains(app, `${TEST_DIR}/update-test.md`, "new text");
        if (!fileResult.pass) {
          const t = expectToolCalled(toolLog, "update_content");
          if (!t.pass) return { pass: false, detail: `update_content not called. Tools: [${toolLog.map(c => c.name).join(", ")}]` };
          return fileResult;
        }
        return fileResult;
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/update-test.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "W4: prepend",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/prepend-test.md`, "---\ntitle: Test\n---\noriginal content");
      },
      input: `在 ${TEST_DIR}/prepend-test 开头添加一行 new first line`,
      assert: async (result, app, toolLog) => {
        const t = expectToolCalled(toolLog, "prepend");
        if (!t.pass) return t;
        return expectFileContains(app, `${TEST_DIR}/prepend-test.md`, "new first line");
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/prepend-test.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "W5: open_file",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/open-test.md`, "test content");
      },
      input: `在编辑器里打开 ${TEST_DIR}/open-test 这个文件`,
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "open_file");
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/open-test.md`);
        if (f) await app.vault.delete(f);
      },
    },

    // === Permission Gate ===
    {
      name: "P1: dangerous tool rejected",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/protected.md`, "do not delete");
      },
      input: `删除 ${TEST_DIR}/protected 这个文件`,
      assert: async (result, app, toolLog) => {
        const fileStillExists = await expectFileExists(app, `${TEST_DIR}/protected.md`);
        if (!fileStillExists.pass) return fileStillExists;
        const dangerousCalled = toolLog.some(
          (c) => c.name === "delete_file" || c.name === "move_file"
        );
        return {
          pass: !dangerousCalled,
          detail: dangerousCalled
            ? "Dangerous tool was executed (should have been rejected)"
            : "Dangerous tool correctly rejected, file preserved",
        };
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/protected.md`);
        if (f) await app.vault.delete(f);
      },
    },

    // === Edge Cases ===
    {
      name: "E1: read non-existent file",
      input: `读一下 ${TEST_DIR}/does-not-exist 的内容`,
      assert: async (result, _app, toolLog) => {
        return expectResultNotEmpty(result);
      },
    },
    {
      name: "E3: casual chat, no vault tools",
      input: "你好，给我讲个笑话",
      assert: async (result, _app, toolLog) => {
        const vaultTools = toolLog.filter((c) => !["read_memory", "update_memory"].includes(c.name));
        if (vaultTools.length > 0) {
          return { pass: false, detail: `Unexpected vault tools called: [${vaultTools.map(c => c.name).join(", ")}]` };
        }
        return expectResultNotEmpty(result);
      },
    },

    // === Search ===
    {
      name: "S1: vault search",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/search-target.md`, "unique keyword xyzabc123");
      },
      input: "搜索包含 xyzabc123 的笔记",
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "search");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/search-target.md`);
        if (f) await app.vault.delete(f);
      },
    },

    // === Properties ===
    {
      name: "P2: set_property",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/prop-test.md`, "---\ntitle: Old\n---\ncontent");
      },
      input: `把 ${TEST_DIR}/prop-test 的 status 属性设为 done`,
      assert: async (result, app, toolLog) => {
        const t = expectToolCalled(toolLog, "set_property");
        if (!t.pass) return t;
        return expectFileContains(app, `${TEST_DIR}/prop-test.md`, "done");
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/prop-test.md`);
        if (f) await app.vault.delete(f);
      },
    },
    {
      name: "P3: get_properties",
      setup: async (app) => {
        await app.vault.create(`${TEST_DIR}/getprop-test.md`, "---\ntags: [test]\nauthor: alice\n---\ncontent");
      },
      input: `${TEST_DIR}/getprop-test 这个文件有哪些属性`,
      assert: async (result, _app, toolLog) => {
        const t = expectToolCalled(toolLog, "get_properties");
        if (!t.pass) return t;
        return expectResultNotEmpty(result);
      },
      teardown: async (app) => {
        const f = app.vault.getAbstractFileByPath(`${TEST_DIR}/getprop-test.md`);
        if (f) await app.vault.delete(f);
      },
    },

    // === Memory ===
    {
      name: "M1: read_memory",
      input: "你记得我之前说过什么吗",
      assert: async (result, _app, toolLog) => {
        return expectToolCalled(toolLog, "read_memory");
      },
    },

    // === Web Search (requires search provider configured) ===
    {
      name: "WS1: web_search triggered",
      input: "帮我在网上查一下 Obsidian 最新版本",
      assert: async (result, _app, toolLog) => {
        const called = toolLog.some((c) => c.name === "web_search");
        if (!called) {
          return { pass: false, detail: `web_search not called. Tools: [${toolLog.map(c => c.name).join(", ")}]` };
        }
        // D46: web_search now runs synchronously inside the tool phase
        // (8s per-tool timeout, 12s phase cap). Result lands in the same turn.
        return expectResultNotEmpty(result);
      },
    },
  ];
}
