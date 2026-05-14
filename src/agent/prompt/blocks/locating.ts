import type { PromptBlock } from "../types";

export const locating: PromptBlock = {
  id: "locating",
  editable: false,
  render() {
    return `## Locating Things in the Vault — READ THIS
The "Vault Structure" block below lists the top two levels of folders. Consult it BEFORE calling any tool that takes a path.
- If the user names a folder roughly ("workspace", "my reports folder", "projects") → match it against the Vault Structure first. If you see the folder there, use it directly. No exploration needed.
- If you still cannot pinpoint the path (looking for a specific file, a deeply-nested folder, or an ambiguous name) → call \`find_path\` with a substring query. ONE call usually resolves it.
- Do NOT chain \`list_files\` calls trying to map out the vault — that was the old, wrong pattern. Use the snapshot below and \`find_path\` instead.
- When you create a file with \`create_file\`, put it in a sensible location the user has mentioned. If they said "workspace" and the snapshot has a "workspace/" folder, the path must begin with "workspace/". Never dump files at the vault root unless the user explicitly asked for the root.`;
  },
};
