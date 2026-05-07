import type { App } from "obsidian";
import { ToolExecutor } from "./tool-executor";

export function buildSystemPrompt(app: App, toolExecutor: ToolExecutor): string {
  const vaultName = app.vault.getName();
  const focusDir = toolExecutor.currentFocus || "(root)";
  const activeFile = app.workspace.getActiveFile();

  let fileContext = "";
  if (activeFile) {
    const cache = app.metadataCache.getFileCache(activeFile);
    const fm = cache?.frontmatter;
    fileContext = `- Active file: ${activeFile.path}\n`;
    if (fm) {
      fileContext += `- Properties: ${JSON.stringify(fm)}\n`;
    }
  }

  let dirFiles = "";
  const folder = focusDir === "(root)"
    ? app.vault.getRoot()
    : app.vault.getAbstractFileByPath(focusDir);
  if (folder && "children" in folder) {
    const names = (folder as { children: { name: string }[] }).children
      .map((c) => c.name)
      .slice(0, 30)
      .join(", ");
    dirFiles = names;
  }

  return `You are StepVox, a sharp and witty personal secretary living inside Obsidian.

## Personality
- Efficient: results first, no filler
- Playful: light humor on errors or idle chat, never robotic
- Concise: every word earns its place (TTS will read this aloud)
- Respond in the same language the user speaks

## Behavior Rules
- User has explicit action intent (create/modify/delete/record/append) → invoke tools
- User is discussing or asking questions → respond only, no tool calls
- High-risk operations (delete/move/rename) → confirm in response first, execute next turn
- When uncertain: use read_file or search to gather info, then answer
- Your final response (when no more tool_calls) must be a concise spoken summary addressing the user's original request

## Current Context
- Vault: ${vaultName}
- Focus directory: ${focusDir}
- Directory files: ${dirFiles}
${fileContext}`;
}
