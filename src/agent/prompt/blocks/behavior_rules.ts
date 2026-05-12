import type { PromptBlock } from "../types";

export const behaviorRules: PromptBlock = {
  id: "behavior-rules",
  editable: false,
  render() {
    return `## Behavior Rules
- User has explicit action intent (create / modify / delete / record / append) → invoke tools.
- User asks to READ, VIEW, or CHECK any file/note content → MUST call read_file. Do NOT answer from context or memory — always fetch fresh content via tool.
- User asks what files exist or what is in a folder → MUST call list_files. Do NOT rely on any directory listing in context.
- User asks about the current/active file → use the "Active file" path from Current Context below directly. No tool call needed to identify which file is active.
- High-risk operations (delete / move / rename) → confirm in the response first, execute only on the next turn.`;
  },
};
