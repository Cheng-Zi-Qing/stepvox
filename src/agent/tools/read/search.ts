import type { Tool } from "../types";

const DEFAULT_LIMIT = 10;

export const search: Tool = {
  name: "search",
  layer: "read",
  description:
    "Full-text search across the user's LOCAL Obsidian vault. Use for questions about the user's own notes, projects, tasks, or anything they've personally written down. Do NOT use for news, companies, current events, prices, or anything about the outside world — use web_search for those.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = args.query as string;
    const limit = (args.limit as number | undefined) ?? DEFAULT_LIMIT;
    const files = ctx.app.vault.getMarkdownFiles();
    const results: { path: string; snippet: string }[] = [];
    const lower = query.toLowerCase();

    for (const file of files) {
      if (results.length >= limit) break;
      const content = await ctx.app.vault.cachedRead(file);
      const idx = content.toLowerCase().indexOf(lower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + query.length + 50);
        results.push({
          path: file.path,
          snippet: content.slice(start, end).replace(/\n/g, " "),
        });
      }
    }

    if (results.length === 0) return "No results found.";
    return results.map((r) => `${r.path}: ...${r.snippet}...`).join("\n");
  },
};
