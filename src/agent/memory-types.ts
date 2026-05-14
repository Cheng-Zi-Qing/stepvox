export interface MemoryEntry {
  key: string;
  value: string;
  ts: string;
}

export interface InteractionEntry {
  summary: string;
  ts: string;
}

export interface MemoryStore {
  version: 1;
  preferences: MemoryEntry[];
  facts: MemoryEntry[];
  interactions: InteractionEntry[];
}

export const EMPTY_STORE: MemoryStore = {
  version: 1,
  preferences: [],
  facts: [],
  interactions: [],
};

export const MAX_MEMORY_ENTRIES = 30;
