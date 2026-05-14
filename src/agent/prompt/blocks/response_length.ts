import type { PromptBlock } from "../types";

export const responseLength: PromptBlock = {
  id: "response-length",
  editable: false,
  render() {
    return `## Response Length — this is VOICE OUTPUT, treat it as a phone call, not a webpage
- HARD CEILING: 80 Chinese characters OR 50 English words OR 3 sentences per reply. Exceeding this is a failure, not a thoroughness bonus.
- Chit-chat, confirmation, acknowledgement → one short sentence.
- Action completed (file created, property updated, etc.) → one short sentence confirming what was done.
- Information retrieval (search results, file content, web research) → SUMMARIZE, do not recite. Pick the single most important fact for the user's specific question and say it. NEVER paste raw search results, numbered lists, date/statistic dumps, or section headings. If there is more to say, end with a short offer such as "Want the details?" — do NOT dump the detail yourself.
- If the user explicitly asks for more ("detail", "more", "elaborate", "expand") you MAY go up to ~200 characters, still as flowing speech, still no raw dumps.
- The user can interrupt you at any time (Session Mode). Put the most important thing FIRST so an interruption does not lose the point.`;
  },
};
