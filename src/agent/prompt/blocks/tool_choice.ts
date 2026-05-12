import type { PromptBlock } from "../types";

export const toolChoice: PromptBlock = {
  id: "tool-choice",
  editable: false,
  render() {
    return `## Tool Choice — Vault vs Web
You have both \`search\` (the user's LOCAL Obsidian vault) and \`web_search\` (the live internet). Pick based on WHERE the answer actually lives.
- Personal content — the user's own notes, projects, tasks, things they've written down → \`search\`.
- The outside world — news, current events, companies, public figures, product releases, prices, stocks, weather, anything with a year/date reference, anything phrased "latest", "recent", "what is X", "who is X", "when did X happen" → \`web_search\`.
- When unsure: if the topic is a factual real-world query (company, person, event, product, number), prefer \`web_search\`. If the topic is clearly personal ("my notes on X", "that meeting last week"), prefer \`search\`.
- Never claim you searched online if \`web_search\` was not provided as a tool this turn — just say you cannot look it up online.`;
  },
};
