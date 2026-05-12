/**
 * Locate the StepVox plugin data.json from the user's Obsidian vault.
 *
 * Search order:
 *  1. $STEPVOX_DATA_JSON (explicit override)
 *  2. $OBSIDIAN_VAULT/.obsidian/plugins/stepvox/data.json
 *  3. ~/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json (default Mac path)
 *  4. Recursive search under ~/Documents for any vault directory
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StepVoxData {
  schemaVersion?: number;
  stepfun: { region: "china" | "global"; mode: "api" | "plan"; apiKey: string };
  asr: { provider: string; apiKey?: string; model: string; language: string };
  tts: { enabled: boolean; provider: string; apiKey?: string; model: string; voice: string; speed: number; volume?: number };
  llm: {
    activeProvider: "stepfun" | "openai" | "anthropic" | "custom";
    providerConfigs: {
      stepfun?: { stepfunMode: "api" | "plan"; model: string; temperature: number };
      openai?: { apiKey: string; model: string; temperature: number };
      anthropic?: { apiKey: string; model: string; temperature: number };
      custom?: { endpoint: string; apiKey: string; model: string; temperature: number };
    };
  };
  audio: { sampleRate: number; noiseSuppression: boolean; echoCancellation: boolean };
  execution?: { vaultName?: string; commandTimeout?: number; confirmDestructive?: boolean; confirmAllWrites?: boolean };
  search?: { provider: string; apiKey: string };
}

function findInDir(dir: string, depth: number): string | null {
  if (depth < 0) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".") && entry !== ".obsidian") continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const candidate = join(full, ".obsidian/plugins/stepvox/data.json");
    if (existsSync(candidate)) return candidate;
    const found = findInDir(full, depth - 1);
    if (found) return found;
  }
  return null;
}

export function locateDataJson(): string {
  if (process.env.STEPVOX_DATA_JSON && existsSync(process.env.STEPVOX_DATA_JSON)) {
    return process.env.STEPVOX_DATA_JSON;
  }
  if (process.env.OBSIDIAN_VAULT) {
    const p = join(process.env.OBSIDIAN_VAULT, ".obsidian/plugins/stepvox/data.json");
    if (existsSync(p)) return p;
  }
  const defaultPath = join(homedir(), "Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json");
  if (existsSync(defaultPath)) return defaultPath;

  const docs = join(homedir(), "Documents");
  const found = findInDir(docs, 3);
  if (found) return found;

  throw new Error(
    "Could not locate StepVox data.json. Set $STEPVOX_DATA_JSON or $OBSIDIAN_VAULT to override."
  );
}

export function loadStepVoxData(): { data: StepVoxData; path: string } {
  const path = locateDataJson();
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as StepVoxData;
  return { data, path };
}
