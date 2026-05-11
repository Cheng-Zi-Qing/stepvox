import { describe, it, expect } from "vitest";
import { routeTools } from "../src/agent/route";

const ALWAYS = ["read_memory", "update_memory"];

describe("routeTools", () => {
  it("Query keywords activate Query group", () => {
    const names = routeTools("帮我看一下今天的笔记").map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("list_files");
    expect(names).toContain("search");
    expect(names).toContain("open_file");
    // get_active_file removed per D47
    expect(names).not.toContain("get_active_file");
  });

  it("Mutate keywords activate Mutate group", () => {
    const names = routeTools("帮我写一段总结").map((t) => t.name);
    expect(names).toContain("create_file");
    expect(names).toContain("append");
    expect(names).toContain("update_content");
  });

  it("External keywords activate web_search", () => {
    const names = routeTools("上网查一下天气").map((t) => t.name);
    expect(names).toContain("web_search");
  });

  it("ALWAYS_TOOLS always included regardless of input", () => {
    const names = routeTools("随便聊聊").map((t) => t.name);
    for (const t of ALWAYS) expect(names).toContain(t);
  });

  it("D49: no keyword match → ALWAYS_TOOLS only (no full-set fallback)", () => {
    const names = routeTools("你好").map((t) => t.name);
    expect(names.sort()).toEqual([...ALWAYS].sort());
    // mutation/query/external tools must be absent
    expect(names).not.toContain("read_file");
    expect(names).not.toContain("create_file");
    expect(names).not.toContain("web_search");
  });

  it("D47: get_active_file removed from all routes", () => {
    for (const input of ["看当前文件", "读一下", "改一下", "上网查"]) {
      const names = routeTools(input).map((t) => t.name);
      expect(names).not.toContain("get_active_file");
    }
  });
});
