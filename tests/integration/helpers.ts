import type { App, TFile } from "obsidian";
import type { ToolCall } from "../../src/providers/types";

export interface TestCase {
  name: string;
  setup?: (app: App) => Promise<void>;
  input: string;
  assert: (result: string, app: App, toolLog: ToolCall[]) => Promise<TestResult>;
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

export function expectResultContains(result: string, keyword: string): TestResult {
  const found = result.toLowerCase().includes(keyword.toLowerCase());
  return {
    pass: found,
    detail: found
      ? `Response contains "${keyword}"`
      : `Response missing "${keyword}": ${result.slice(0, 200)}`,
  };
}
