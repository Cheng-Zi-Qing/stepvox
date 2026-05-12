# scripts/

Developer-facing connectivity tests for the three external services StepVox depends on: ASR, LLM, TTS. Run them when something feels off in the plugin and you want to isolate whether the problem is the network, the API key, the endpoint config, or the plugin's own logic.

| Script | Tests | Default runtime |
|---|---|---|
| `test-asr.ts` | StepFun ASR HTTP SSE endpoint | ~2s |
| `test-llm.ts` | Configured LLM provider (4 functional cases) | ~5-10s |
| `test-tts.ts` | StepFun TTS synthesis (4 functional cases) | ~5-10s |

All three are self-contained: they read provider config + API key from the plugin's `data.json`, so **you don't pass keys on the command line**.

## Prerequisites

- [Bun](https://bun.sh/) installed (`bun --version` works).
- StepVox plugin configured at least once — the settings UI must have saved `data.json` with valid keys. No fresh-install testing.

## How config is located

`scripts/_lib/load-data.ts` resolves the plugin's `data.json` in this order:

1. `$STEPVOX_DATA_JSON` if set and exists.
2. `$OBSIDIAN_VAULT/.obsidian/plugins/stepvox/data.json` if `$OBSIDIAN_VAULT` is set.
3. `~/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json` (default macOS path).
4. Recursive search under `~/Documents` (depth 3) for any vault containing `.obsidian/plugins/stepvox/data.json`.

If the file can't be found, the script aborts with a clear error. Override with `$STEPVOX_DATA_JSON=/path/to/data.json` if your vault lives somewhere odd.

The scripts print the resolved path on launch (`Loaded settings from: ...`) so you always know which config was used.

## Running

```bash
bun scripts/test-asr.ts            # configured region/mode only
bun scripts/test-asr.ts --all      # also probe the other mode for comparison
bun scripts/test-llm.ts            # exercises the LLM provider you have configured
bun scripts/test-tts.ts            # synth two phrases; verify MP3 frames
bun scripts/test-tts.ts --save     # also write /tmp/stepvox-tts-test-*.mp3 for manual listening
```

Exit code: `0` if all cases pass, `1` if any fail. Easy to wire into a smoke-test target later if needed.

## What each script verifies

### `test-asr.ts`

Sends 1s of silence as PCM16 to the ASR HTTP SSE endpoint and verifies:

- 200 response.
- SSE stream is well-formed (`data:` events parse as JSON).
- No `type: "error"` event arrives.

It doesn't verify transcript content — the input is silence, the model returns nothing useful. The point is "endpoint reachable + auth OK + stream protocol parses".

Sample output:

```
Loaded settings from: /Users/<you>/Documents/Obsidian Vault/.obsidian/plugins/stepvox/data.json
API Key: 19Qnl0Fy...
Region: china, Mode: plan, Model: stepaudio-2.5-asr, Lang: zh, Rate: 16000

[china + plan (configured)] Testing ASR: https://api.stepfun.com/step_plan/v1/audio/asr/sse
✓ [china + plan (configured)] Success (received 3 events)

=== Summary ===
china + plan (configured): ✓ PASS
```

### `test-llm.ts`

Constructs the real provider class (`OpenAIProvider` or `AnthropicProvider`) from `data.json` and runs four functional cases:

1. **Plain chat** — plain user turn returns non-empty content.
2. **Tool definitions trigger tool_call** — request with an `echo` tool definition + a prompt that demands echoing must produce a tool_call.
3. **Tool result round-trip** — feed an `echo` tool result back; LLM produces a final natural-language reply.
4. **Abort signal cancels in-flight request** — pre-aborted `AbortController` causes `chat()` to throw.

Pass = all four green. This is the closest thing to a contract test for whatever provider you have configured.

### `test-tts.ts`

Calls `StepFunTTS.synthesize` directly and verifies the returned ArrayBuffer:

1. **Short Chinese text** synthesises to a valid MP3 frame (ID3 / MPEG sync word).
2. **Longer mixed-language text** same check at length.
3. **Empty text rejects** with a synchronous `TTS: empty text` error.
4. **Invalid voice surfaces HTTP error** (`400` from server) — confirms the error path returns a useful message.

`--save` writes `/tmp/stepvox-tts-test-zh.mp3` and `/tmp/stepvox-tts-test-mixed.mp3` so you can play them and hear whether the voice config (region / model / voice id) sounds right.

## Typical failure → diagnosis

| Symptom | Probable cause | Next step |
|---|---|---|
| `Loaded settings from: ...` then `No ASR/LLM/TTS API key found` | `data.json` exists but the key field is empty | Open StepVox settings, paste key, save. |
| `test-asr.ts` returns `Failed (401)` | API key rejected by StepFun | Check StepFun dashboard; regenerate key if needed. |
| `test-asr.ts` returns `Failed (404)` | Wrong region/mode combo | StepFun "Coding Plan" keys only work on `/step_plan/v1/...`. Try `--all` to see if the OTHER mode works. |
| `test-llm.ts` case 1 fails with `model not found` | LLM model id is wrong for the chosen provider | Check `data.json` `llm.model` value against the provider's docs. |
| `test-llm.ts` case 2 passes but case 3 returns empty content | LLM doesn't reliably handle tool result round-trip | Could be a weak model; try `step-3.5-flash` or `gpt-4o-mini` to confirm. |
| `test-tts.ts` case 1 fails with `TTS synth timed out after 10s` | Network slow OR TTS service degraded | Retry; if persistent, check StepFun status. |
| `test-tts.ts` case 4 fails with "request unexpectedly succeeded" | The voice id `this-voice-does-not-exist-xyz123` somehow exists | Either the provider relaxed validation or something is very wrong — open an issue. |
| Any script prints `Could not locate StepVox data.json` | The auto-locate failed | Set `$STEPVOX_DATA_JSON` to the absolute path, e.g. `STEPVOX_DATA_JSON=/path/to/data.json bun scripts/test-llm.ts`. |

## Adding a new test

The pattern is the same in all three scripts: load data → construct the provider → run independent `runCase(name, fn)` blocks → print a summary.

Keep new cases:
- **Independent** — case N must not depend on case N-1's state.
- **Self-cleaning** — if a case creates a file or modifies global state, undo it in the same function.
- **Cheap** — under 1s each ideally. Don't run heavy regression suites here; this directory is for connectivity smoke checks.

For deeper integration tests (real audio, real vault operations), see `tests/integration/` instead.

## Why not `tests/` or `tests/integration/`?

- `tests/` is the unit test suite (vitest). Pure logic only, no network.
- `tests/integration/` runs against the real plugin loaded inside Obsidian (esbuild bundle + Obsidian command). Heavy, slow, needs Obsidian running.
- `scripts/` is the lightweight in-between: real network, no Obsidian, no test runner. Run from any terminal in seconds.

Three layers, three speeds, each catches a different class of failure.

## Related

- `_lib/load-data.ts` — the config-locator module shared by all three scripts.
- `src/providers/llm/factory.ts` — the runtime factory `test-llm.ts` mirrors.
- `src/providers/stepfun-{asr,tts}.ts` — the classes `test-asr.ts` / `test-tts.ts` use directly.
- See `stepvox.providers.md` / `stepvox.llm-providers.md` in the maintainer's vault for the full provider docs.
