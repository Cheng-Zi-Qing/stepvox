// tests/server/local-api.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { LocalApiServer } from "../../src/server/local-api";

async function listen(server: LocalApiServer): Promise<string> {
  server.start();
  await new Promise((r) => setTimeout(r, 50));
  const addr = server.address;
  if (!addr) throw new Error("Server failed to start");
  return `http://127.0.0.1:${addr.port}`;
}

describe("LocalApiServer", () => {
  let server: LocalApiServer | null = null;

  afterEach(() => {
    server?.stop();
    server = null;
  });

  it("POST /toggle returns 200 with recording state", async () => {
    let state = false;
    server = new LocalApiServer(
      () => { state = !state; return state; },
      { port: 0 },
    );
    const url = await listen(server);

    const res = await fetch(`${url}/toggle`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: true });

    const res2 = await fetch(`${url}/toggle`, { method: "POST" });
    expect(await res2.json()).toEqual({ recording: false });
  });

  it("GET /toggle returns 405 Method Not Allowed", async () => {
    server = new LocalApiServer(() => true, { port: 0 });
    const url = await listen(server);

    const res = await fetch(`${url}/toggle`);
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "Method not allowed" });
  });

  it("POST /unknown returns 404 Not Found", async () => {
    server = new LocalApiServer(() => true, { port: 0 });
    const url = await listen(server);

    const res = await fetch(`${url}/unknown`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 500 when toggle callback throws", async () => {
    server = new LocalApiServer(
      () => { throw new Error("boom"); },
      { port: 0 },
    );
    const url = await listen(server);

    const res = await fetch(`${url}/toggle`, { method: "POST" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  it("start and stop lifecycle works cleanly", async () => {
    server = new LocalApiServer(() => true, { port: 0 });
    server.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.address).not.toBeNull();

    server.stop();
    expect(server.address).toBeNull();
    server = null;
  });

  it("calls onStartError when port is already in use", async () => {
    const blocker = http.createServer();
    const blockerPort = await new Promise<number>((resolve) => {
      blocker.listen(0, "127.0.0.1", () => {
        resolve((blocker.address() as AddressInfo).port);
      });
    });

    const onStartError = vi.fn();
    server = new LocalApiServer(() => true, {
      port: blockerPort,
      onStartError,
    });
    server.start();
    await new Promise((r) => setTimeout(r, 100));

    expect(onStartError).toHaveBeenCalledWith(
      expect.stringContaining("port"),
    );

    server.stop();
    server = null;
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  });
});
