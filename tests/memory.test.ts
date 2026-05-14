import { describe, it, expect } from "vitest";
import type { MemoryStore } from "../src/agent/memory-types";
import { EMPTY_STORE, MAX_MEMORY_ENTRIES } from "../src/agent/memory-types";
import { formatMemoryForDisplay, applyMemoryAction } from "../src/agent/memory-helpers";

describe("formatMemoryForDisplay", () => {
  it("returns 'No memory stored yet.' for empty store", () => {
    expect(formatMemoryForDisplay(EMPTY_STORE)).toBe("No memory stored yet.");
  });

  it("returns 'No memory stored yet.' for null", () => {
    expect(formatMemoryForDisplay(null)).toBe("No memory stored yet.");
  });

  it("formats preferences, facts, and interactions", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: [{ key: "tone", value: "casual", ts: "2026-05-14" }],
      facts: [{ key: "name", value: "Alice", ts: "2026-05-14" }],
      interactions: [{ summary: "Helped with report", ts: "2026-05-14" }],
    };
    const result = formatMemoryForDisplay(store);
    expect(result).toContain("## Your Memory");
    expect(result).toContain("### Preferences");
    expect(result).toContain("tone: casual");
    expect(result).toContain("### Facts");
    expect(result).toContain("name: Alice");
    expect(result).toContain("### Recent Interactions");
    expect(result).toContain("Helped with report");
  });

  it("omits empty sections", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: [{ key: "tone", value: "casual", ts: "2026-05-14" }],
      facts: [],
      interactions: [],
    };
    const result = formatMemoryForDisplay(store);
    expect(result).toContain("### Preferences");
    expect(result).not.toContain("### Facts");
    expect(result).not.toContain("### Recent Interactions");
  });
});

describe("applyMemoryAction", () => {
  it("adds a preference", () => {
    const store = structuredClone(EMPTY_STORE);
    const result = applyMemoryAction(store, {
      action: "add", category: "preferences", key: "tone", value: "casual",
    });
    expect(result.preferences).toHaveLength(1);
    expect(result.preferences[0].key).toBe("tone");
    expect(result.preferences[0].value).toBe("casual");
  });

  it("upserts a preference by key", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: [{ key: "tone", value: "formal", ts: "2026-05-13" }],
      facts: [], interactions: [],
    };
    const result = applyMemoryAction(store, {
      action: "add", category: "preferences", key: "tone", value: "casual",
    });
    expect(result.preferences).toHaveLength(1);
    expect(result.preferences[0].value).toBe("casual");
  });

  it("adds an interaction", () => {
    const store = structuredClone(EMPTY_STORE);
    const result = applyMemoryAction(store, {
      action: "add", category: "interactions", summary: "Helped with report",
    });
    expect(result.interactions).toHaveLength(1);
    expect(result.interactions[0].summary).toBe("Helped with report");
  });

  it("removes a preference by key", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: [{ key: "tone", value: "casual", ts: "2026-05-14" }],
      facts: [], interactions: [],
    };
    const result = applyMemoryAction(store, {
      action: "remove", category: "preferences", key: "tone",
    });
    expect(result.preferences).toHaveLength(0);
  });

  it("removes an interaction by summary substring", () => {
    const store: MemoryStore = {
      version: 1, preferences: [], facts: [],
      interactions: [{ summary: "Helped with report", ts: "2026-05-14" }],
    };
    const result = applyMemoryAction(store, {
      action: "remove", category: "interactions", summary: "report",
    });
    expect(result.interactions).toHaveLength(0);
  });

  it("enforces 30-entry cap by evicting oldest interactions", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: Array.from({ length: 5 }, (_, i) => ({ key: `pref${i}`, value: `v${i}`, ts: "2026-05-14" })),
      facts: Array.from({ length: 5 }, (_, i) => ({ key: `fact${i}`, value: `v${i}`, ts: "2026-05-14" })),
      interactions: Array.from({ length: 20 }, (_, i) => ({ summary: `interaction${i}`, ts: "2026-05-14" })),
    };
    const result = applyMemoryAction(store, {
      action: "add", category: "interactions", summary: "new interaction",
    });
    const total = result.preferences.length + result.facts.length + result.interactions.length;
    expect(total).toBeLessThanOrEqual(MAX_MEMORY_ENTRIES);
    expect(result.interactions[0].summary).not.toBe("interaction0");
    expect(result.interactions[result.interactions.length - 1].summary).toBe("new interaction");
  });

  it("evicts oldest facts when interactions is empty and over cap", () => {
    const store: MemoryStore = {
      version: 1,
      preferences: Array.from({ length: 10 }, (_, i) => ({ key: `pref${i}`, value: `v${i}`, ts: "2026-05-14" })),
      facts: Array.from({ length: 20 }, (_, i) => ({ key: `fact${i}`, value: `v${i}`, ts: "2026-05-14" })),
      interactions: [],
    };
    const result = applyMemoryAction(store, {
      action: "add", category: "facts", key: "fact_new", value: "new",
    });
    const total = result.preferences.length + result.facts.length + result.interactions.length;
    expect(total).toBeLessThanOrEqual(MAX_MEMORY_ENTRIES);
    expect(result.facts.find((f) => f.key === "fact0")).toBeUndefined();
  });
});
