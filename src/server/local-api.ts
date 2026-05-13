// src/server/local-api.ts
import http from "http";
import type { AddressInfo } from "net";
import { debugLog } from "../utils/debug-logger";

const DEFAULT_PORT = 27120;
const HOST = "127.0.0.1";

interface LocalApiOptions {
  port?: number;
  onStartError?: (message: string) => void;
}

export class LocalApiServer {
  private server: http.Server | null = null;
  private readonly onToggle: () => boolean;
  private readonly port: number;
  private readonly onStartError?: (message: string) => void;

  constructor(onToggle: () => boolean, options: LocalApiOptions = {}) {
    this.onToggle = onToggle;
    this.port = options.port ?? DEFAULT_PORT;
    this.onStartError = options.onStartError;
  }

  start(): void {
    this.server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.method !== "POST") {
        res.writeHead(405);
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      if (req.url !== "/toggle") {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      debugLog("API", "POST /toggle");

      try {
        const recording = this.onToggle();
        res.writeHead(200);
        res.end(JSON.stringify({ recording }));
      } catch (err) {
        console.error("LocalApiServer: toggle failed", err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal error" }));
      }
    });

    this.server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        const msg = `StepVox: Local API port ${this.port} is in use. Global hotkey unavailable.`;
        console.error(msg);
        this.onStartError?.(msg);
      } else {
        console.error("LocalApiServer: unexpected error", err);
      }
    });

    this.server.listen(this.port, HOST, () => {
      debugLog("API", `listening on ${HOST}:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  get address(): AddressInfo | null {
    const addr = this.server?.address();
    if (!addr || typeof addr === "string") return null;
    return addr;
  }
}
