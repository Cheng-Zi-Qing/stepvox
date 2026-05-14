import type { MemoryStore, MemoryEntry, InteractionEntry } from "./memory-types";
import { MAX_MEMORY_ENTRIES } from "./memory-types";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface MemoryAction {
  action: "add" | "remove";
  category: "preferences" | "facts" | "interactions";
  key?: string;
  value?: string;
  summary?: string;
}

export function formatMemoryForDisplay(store: MemoryStore | null): string {
  if (!store) return "No memory stored yet.";
  const { preferences, facts, interactions } = store;
  if (preferences.length === 0 && facts.length === 0 && interactions.length === 0) {
    return "No memory stored yet.";
  }

  const sections: string[] = ["## Your Memory"];

  if (preferences.length > 0) {
    sections.push("### Preferences");
    for (const p of preferences) sections.push(`- ${p.key}: ${p.value} (${p.ts})`);
  }
  if (facts.length > 0) {
    sections.push("### Facts");
    for (const f of facts) sections.push(`- ${f.key}: ${f.value} (${f.ts})`);
  }
  if (interactions.length > 0) {
    sections.push("### Recent Interactions");
    for (const i of interactions) sections.push(`- ${i.summary} (${i.ts})`);
  }

  return sections.join("\n");
}

export function applyMemoryAction(store: MemoryStore, action: MemoryAction): MemoryStore {
  const result = structuredClone(store);
  const ts = today();

  if (action.action === "add") {
    if (action.category === "interactions") {
      result.interactions.push({ summary: action.summary!, ts });
    } else {
      const arr = result[action.category] as MemoryEntry[];
      const idx = arr.findIndex((e) => e.key === action.key);
      if (idx >= 0) {
        arr[idx] = { key: action.key!, value: action.value!, ts };
      } else {
        arr.push({ key: action.key!, value: action.value!, ts });
      }
    }
    enforceCapFIFO(result);
  } else {
    if (action.category === "interactions") {
      result.interactions = result.interactions.filter(
        (e) => !e.summary.includes(action.summary!)
      );
    } else {
      const arr = result[action.category] as MemoryEntry[];
      const idx = arr.findIndex((e) => e.key === action.key);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  return result;
}

function enforceCapFIFO(store: MemoryStore): void {
  let total = store.preferences.length + store.facts.length + store.interactions.length;
  while (total > MAX_MEMORY_ENTRIES) {
    if (store.interactions.length > 0) {
      store.interactions.shift();
    } else if (store.facts.length > 0) {
      store.facts.shift();
    } else {
      break;
    }
    total--;
  }
}
