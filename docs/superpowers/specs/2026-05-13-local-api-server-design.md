# Local API Server — Design Spec

**Date:** 2026-05-13
**Issue:** [#1 — Add system-wide global hotkey for toggle-recording](https://github.com/Cheng-Zi-Qing/stepVox/issues/1)
**Status:** Approved

## Problem

Obsidian hotkeys only fire when Obsidian has window focus. Users need to trigger `stepvox:toggle-recording` from any app without switching to Obsidian first.

## Solution

Run a local HTTP server inside the plugin. External tools (Raycast, Alfred, Shortcuts, Hammerspoon, or plain `curl`) send a POST request to toggle recording.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API scope | Toggle only | YAGNI — extend later if needed |
| Port strategy | Fixed `27120` | Predictable; external scripts can hardcode |
| Security | Bind `127.0.0.1` only | Only local processes can reach it; toggle-recording is low-risk (equivalent to clicking the mic button) |
| Lifecycle | Always on | Starts in `onload()`, stops in `onunload()`. Zero config. |
| Implementation | Node `http.createServer` | Zero external dependencies; Obsidian desktop runs Node.js |
| Auth | None | Localhost-only binding is sufficient for this risk level |

## API

### `POST /toggle`

Toggles voice recording on or off.

**Request:** No body required. Any body is ignored.

**Response:**
```json
{ "recording": true }
```
or
```json
{ "recording": false }
```

**Status codes:**
- `200` — success
- `500` — internal error (toggle callback threw)

### Error responses

| Request | Status | Body |
|---------|--------|------|
| `GET /toggle` | `405` | `{ "error": "Method not allowed" }` |
| `POST /unknown` | `404` | `{ "error": "Not found" }` |
| Any non-POST to any path | `405` | `{ "error": "Method not allowed" }` |

### Headers

- Response `Content-Type: application/json`
- No CORS headers (not intended for browser consumption)

## Architecture

### New file

```
src/server/local-api.ts
```

### `LocalApiServer` class

```typescript
import http from "http";

const PORT = 27120;
const HOST = "127.0.0.1";

export class LocalApiServer {
  private server: http.Server | null = null;
  private onToggle: () => boolean;

  constructor(onToggle: () => boolean);
  start(): void;
  stop(): void;
}
```

- `onToggle` callback is injected at construction — the server has no dependency on `StepVoxPlugin`. Returns the new `isRecording` state after toggling.
- `start()` creates the HTTP server and calls `listen(PORT, HOST)`.
- `stop()` calls `server.close()`.

### Integration with `main.ts`

```typescript
// onload()
this.localApi = new LocalApiServer(() => {
  this.toggleRecording();
  return this.isRecording;
});
this.localApi.start();

// onunload()
this.localApi.stop();
```

New private field on `StepVoxPlugin`:
```typescript
private localApi!: LocalApiServer;
```

## Security Model

1. **Bind `127.0.0.1` only** — non-local traffic cannot reach the server.
2. **POST only** — prevents browser prefetch, favicon requests, or accidental GET triggers.
3. **No CORS headers** — browser pages on other origins cannot call the endpoint.
4. **Minimal response surface** — only `{ recording: boolean }` is returned. No vault paths, settings, or internal state exposed.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Port in use (`EADDRINUSE`) | `new Notice(...)` warning + `console.error`. Plugin continues without local API. |
| `toggleRecording()` throws | 500 response, error logged via `console.error` |
| Unknown path | 404 |
| Wrong HTTP method | 405 |

## Logging

- Uses existing `debugLog("API", ...)` — only active when debug mode is enabled.
- No logging noise in normal operation.

## Testing

**New file:** `tests/server/local-api.test.ts`

| Test case | Validates |
|-----------|-----------|
| `POST /toggle → 200 + { recording }` | Normal toggle, callback invoked, correct state returned |
| `GET /toggle → 405` | Rejects non-POST |
| `POST /unknown → 404` | Unknown paths return 404 |
| `start() + stop() lifecycle` | Server starts and shuts down cleanly |
| `EADDRINUSE handling` | Port conflict does not throw or block |

Tests use real `http.createServer` + `fetch` (port 0 for OS-assigned port). No HTTP mocking.

## Cleanup

- Remove unused `ws` and `@types/ws` from `package.json`.

## User-Facing Documentation

Add a section to `docs/` (or README) explaining how to set up the global hotkey:

```bash
curl -X POST http://localhost:27120/toggle
```

With examples for:
- **Raycast** — Script Command
- **Alfred** — Workflow → Run Script
- **Apple Shortcuts** — "Run Shell Script" action
- **Hammerspoon** — `hs.execute(...)`

## Scope Boundary

Out of scope for this spec:
- Expandable command routing (future work)
- Auth tokens
- Configurable port
- WebSocket / SSE streaming
- Settings page toggle to enable/disable the server
