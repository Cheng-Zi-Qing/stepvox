import { requestUrl } from "obsidian";

export interface SearchResult {
  url: string;
  title: string;
  content: string;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

export class TavilyProvider implements SearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string): Promise<SearchResult[]> {
    try {
      const resp = await requestUrl({
        url: "https://api.tavily.com/search",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          include_raw_content: true,
          max_results: 5,
        }),
      });
      const data = resp.json;
      return (data.results ?? []).map((r: any) => ({
        url: r.url,
        title: r.title,
        content: r.raw_content ?? r.content ?? "",
      }));
    } catch (err) {
      throw new Error(`Tavily search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export class ExaProvider implements SearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string): Promise<SearchResult[]> {
    try {
      const resp = await requestUrl({
        url: "https://api.exa.ai/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query,
          contents: { text: true },
          numResults: 5,
        }),
      });
      const data = resp.json;
      return (data.results ?? []).map((r: any) => ({
        url: r.url,
        title: r.title,
        content: r.text ?? "",
      }));
    } catch (err) {
      throw new Error(`Exa search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
