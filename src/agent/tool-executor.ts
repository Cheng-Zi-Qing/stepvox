import type { App } from "obsidian";
import type { ToolCall } from "../providers";
import type { SearchProvider } from "../providers/search";
import { getToolByName } from "./tools";
import { snapshotVaultStructure } from "./vault-snapshot";
import type { ToolContext } from "./tools";

export interface ToolResult {
  id: string;
  content: string;
  success: boolean;
}

/**
 * ToolExecutor — pure execution, no timeouts, no async-pending state.
 * Timeouts and parallelism are the orchestrator's responsibility (D46/D48).
 *
 * Internally delegates to the tool registry (D54-D56). This class is the
 * stable surface that orchestrator + pipeline depend on; the registry is the
 * contribution surface community tools land on.
 */
export class ToolExecutor {
  private app: App;
  private pluginDataDir: string;
  private searchProvider: SearchProvider | null = null;

  constructor(app: App, pluginDataDir: string) {
    this.app = app;
    this.pluginDataDir = pluginDataDir;
  }

  setSearchProvider(provider: SearchProvider | null): void {
    this.searchProvider = provider;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const tool = getToolByName(call.name);
    if (!tool) {
      return {
        id: call.id,
        content: `Unknown tool: ${call.name}`,
        success: false,
      };
    }

    if (tool.layer === "dangerous") {
      return {
        id: call.id,
        content: `Rejected: "${call.name}" requires user confirmation. Ask the user first.`,
        success: false,
      };
    }

    const ctx: ToolContext = {
      app: this.app,
      pluginDataDir: this.pluginDataDir,
      activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
      services: {
        search: this.searchProvider,
      },
    };

    try {
      const content = await tool.execute(call.args, ctx);
      return { id: call.id, content, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { id: call.id, content: `Error: ${msg}`, success: false };
    }
  }

  /**
   * Capture a 2-level folder snapshot of the vault for prompt injection (D52).
   * Lives here for backwards compatibility with VoicePipeline's existing
   * `toolExecutor.snapshotVaultStructure()` call site; the canonical helper
   * is in `agent/vault-snapshot.ts`.
   */
  snapshotVaultStructure(): string {
    return snapshotVaultStructure(this.app);
  }
}
