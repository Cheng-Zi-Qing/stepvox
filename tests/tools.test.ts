import { describe, it, expect } from "vitest";
import { getToolLayer, TOOL_DEFINITIONS } from "../src/agent/tools";

describe("getToolLayer", () => {
  it("classifies read tools correctly", () => {
    expect(getToolLayer("read_file")).toBe("read");
    expect(getToolLayer("search")).toBe("read");
    expect(getToolLayer("list_files")).toBe("read");
    expect(getToolLayer("get_properties")).toBe("read");
    expect(getToolLayer("find_path")).toBe("read");
  });

  it("classifies write tools correctly", () => {
    expect(getToolLayer("create_file")).toBe("write");
    expect(getToolLayer("append")).toBe("write");
    expect(getToolLayer("prepend")).toBe("write");
    expect(getToolLayer("update_content")).toBe("write");
    expect(getToolLayer("set_property")).toBe("write");
    expect(getToolLayer("open_file")).toBe("write");
    expect(getToolLayer("move_file")).toBe("write");
  });

  it("classifies system tools correctly", () => {
    expect(getToolLayer("read_memory")).toBe("system");
    expect(getToolLayer("update_memory")).toBe("system");
  });

  it("set_focus is removed — treated as dangerous (unknown)", () => {
    expect(getToolLayer("set_focus")).toBe("dangerous");
  });

  it("TOOL_DEFINITIONS does not contain set_focus", () => {
    expect(TOOL_DEFINITIONS.find((t) => t.name === "set_focus")).toBeUndefined();
  });

  it("defaults unknown tools to dangerous", () => {
    expect(getToolLayer("delete_file")).toBe("dangerous");
    expect(getToolLayer("rename_file")).toBe("dangerous");
    expect(getToolLayer("anything_unknown")).toBe("dangerous");
  });
});
