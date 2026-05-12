import type { Tool } from "../types";

export const webSearch: Tool = {
  name: "web_search",
  layer: "read",
  description:
    "Search the live INTERNET for information. MUST call this for any question whose answer lives outside the user's personal vault: current events, news, company info, public people, product launches, prices, stocks, weather, releases, \"what is X\", \"when did X happen\", \"who is X\", anything with a year/date reference. Prefer this over vault search whenever the topic is about the outside world, even if the user didn't explicitly say \"online\" or \"web\". If you're unsure whether something lives in the vault or online, try web_search first — it's almost always right for factual world queries.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = args.query as string;
    if (!ctx.services.search) {
      return "Web search not configured. Please add a search API key in settings.";
    }
    const results = await ctx.services.search.search(query);
    if (results.length === 0) return "No results found.";
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
      .join("\n\n---\n\n");
  },
};
