import type { App, TFile } from "obsidian";
import type { ToolCall } from "../../src/providers/types";

export interface TestCase {
  name: string;
  setup?: (app: App) => Promise<void>;
  input: string;
  assert: (result: string, app: App, toolLog: ToolCall[], partials: string[]) => Promise<TestResult>;
  teardown?: (app: App) => Promise<void>;
}

export interface TestResult {
  pass: boolean;
  detail: string;
}

export function expectToolCalled(toolLog: ToolCall[], name: string): TestResult {
  const found = toolLog.some((c) => c.name === name);
  return {
    pass: found,
    detail: found
      ? `Tool "${name}" was called`
      : `Expected tool "${name}" but got: [${toolLog.map((c) => c.name).join(", ")}]`,
  };
}

export function expectNoTools(toolLog: ToolCall[]): TestResult {
  return {
    pass: toolLog.length === 0,
    detail:
      toolLog.length === 0
        ? "No tools called"
        : `Expected no tools but got: [${toolLog.map((c) => c.name).join(", ")}]`,
  };
}

export async function expectFileExists(app: App, path: string): Promise<TestResult> {
  const file = app.vault.getAbstractFileByPath(path);
  return {
    pass: file !== null,
    detail: file ? `File exists: ${path}` : `File not found: ${path}`,
  };
}

export async function expectFileContains(
  app: App,
  path: string,
  substring: string
): Promise<TestResult> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) return { pass: false, detail: `File not found: ${path}` };
  const content = await app.vault.cachedRead(file as TFile);
  const found = content.includes(substring);
  return {
    pass: found,
    detail: found
      ? `File contains "${substring}"`
      : `File does not contain "${substring}". Content: ${content.slice(0, 200)}`,
  };
}

export async function expectFileNotExists(app: App, path: string): Promise<TestResult> {
  const file = app.vault.getAbstractFileByPath(path);
  return {
    pass: file === null,
    detail: file === null ? `File correctly absent: ${path}` : `File unexpectedly exists: ${path}`,
  };
}

export function expectResultNotEmpty(result: string): TestResult {
  return {
    pass: result.length > 0,
    detail: result.length > 0 ? `Got response (${result.length} chars)` : "Empty response",
  };
}

export function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

export function expectLanguageMatch(partials: string[], expectedLang: "zh" | "en"): TestResult {
  if (partials.length === 0) {
    return { pass: true, detail: "No partials emitted (no tool calls, so no wait text)" };
  }
  const allText = partials.join(" ");
  const hasChinese = containsChinese(allText);

  if (expectedLang === "zh") {
    return {
      pass: hasChinese,
      detail: hasChinese
        ? `Wait text is Chinese: "${allText.slice(0, 80)}"`
        : `Expected Chinese wait text but got English: "${allText.slice(0, 80)}"`,
    };
  }
  return {
    pass: !hasChinese,
    detail: !hasChinese
      ? `Wait text is English: "${allText.slice(0, 80)}"`
      : `Expected English wait text but got Chinese: "${allText.slice(0, 80)}"`,
  };
}

export function expectResultContains(result: string, keyword: string): TestResult {
  const found = result.toLowerCase().includes(keyword.toLowerCase());
  return {
    pass: found,
    detail: found
      ? `Response contains "${keyword}"`
      : `Response missing "${keyword}": ${result.slice(0, 200)}`,
  };
}
