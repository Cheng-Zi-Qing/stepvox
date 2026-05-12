# Developing StepVox

Guide for anyone who wants to run StepVox from source, extend it, or cut their own release. End users should read [README.md](../README.md) instead.

## Prerequisites

- **Node.js** ≥ 18 (for `npm run build` / vitest).
- **[Bun](https://bun.sh/)** for the connectivity scripts under `scripts/`. Optional if you don't plan to run them.
- **Obsidian** ≥ 1.7.0 installed, with a vault you're willing to test against. A throwaway test vault is recommended so a broken dev build doesn't corrupt real notes.
- A **StepFun API key** for ASR/TTS and at least one LLM provider key (StepFun / OpenAI / Anthropic) — plugin won't do anything useful without these.

## Clone and install

```bash
git clone https://github.com/Cheng-Zi-Qing/stepvox.git
cd stepvox
npm install    # or: bun install
```

`bun install` is meaningfully faster and both lockfiles are checked in.

## Link your dev build into a vault

The plugin must live at `<your-vault>/.obsidian/plugins/stepvox/` for Obsidian to load it, but you don't want to copy files manually every time you rebuild. Use symlinks.

```bash
# one-time setup, adjust the vault path to your actual vault
VAULT="$HOME/Documents/Obsidian Vault"
PLUGIN_DIR="$VAULT/.obsidian/plugins/stepvox"
mkdir -p "$PLUGIN_DIR"

ln -s "$PWD/main.js"       "$PLUGIN_DIR/main.js"
ln -s "$PWD/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -s "$PWD/styles.css"    "$PLUGIN_DIR/styles.css"
```

Now anything esbuild writes to the workspace-root `main.js` is instantly visible to Obsidian through the symlink.

Why these three files specifically? See [How the plugin loads](#how-the-plugin-loads) at the bottom.

Obsidian runtime state lives alongside the symlinks as real files:

- `data.json` — plugin settings (API keys, LLM provider config, personality blocks)
- `data.json.v1-backup-*` — automatic backup written by the settings migration
- `debug.log` — populated only when Debug mode is on in settings

## Build modes

| Command | What it does | When to use |
|---------|--------------|-------------|
| `npm run dev` | esbuild in watch mode. Rebuilds `main.js` on every source save. Inline sourcemaps included. | Active development. Leave it running in a terminal. |
| `npm run build` | One-shot production build. Minified, no sourcemaps. | Before committing, before cutting a release. |

In both modes, the entry point is `src/main.ts` and the output is `main.js` at the repo root. The esbuild config (`esbuild.config.mjs`) marks `obsidian`, `electron`, all `@codemirror/*`, `@lezer/*`, and Node builtins as external — Obsidian injects these at runtime. Everything else (including `ws`) is inlined into the bundle.

## Dev loop

Cheapest fast loop, two terminals:

```bash
# Terminal 1 — rebuild on save
npm run dev

# Terminal 2 — not strictly needed, but useful for type checks
npx tsc --noEmit --watch
```

Then in Obsidian: Cmd/Ctrl + R to reload the app whenever you want to see changes.

### Even faster: Hot Reload plugin

Install the community plugin [Hot Reload](https://github.com/pjeby/hot-reload) (search for "Hot Reload" in Obsidian's Community plugins browser). It watches plugin directories and reloads the plugin automatically when `main.js` changes. Combined with `npm run dev`:

1. Edit TypeScript in your IDE, save.
2. esbuild rebuilds `main.js` within ~1s.
3. Hot Reload sees the change, reloads StepVox in-place.
4. No Cmd+R needed.

For Hot Reload to detect your dev build, add an empty marker file next to your symlinks:

```bash
touch "$PLUGIN_DIR/.hotreload"
```

## Testing

### Unit tests (vitest)

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

Unit tests live under `tests/` and cover:

- `tools.test.ts` — tool registry and individual tool implementations
- `orchestrator.test.ts` — the agent round-loop (R1/R2/R3), tool dispatch, abort handling
- `prompt.test.ts` — system prompt block composition
- `noise-filter.test.ts` — filler-word detection
- `settings-migration.test.ts` — v1 → v2 settings migration
- `utils.test.ts` — miscellaneous helpers

Vitest resolves `obsidian` imports to `tests/__mocks__/obsidian.cjs` (see `vitest.config.ts`) — the real package is a `.d.ts`-only stub.

### Integration tests

```bash
npm run test:integration
```

Runs the test suite under `tests/integration/` — exercises the plugin inside a real Obsidian runtime. Heavier, slower, needs Obsidian running. Uses a separate esbuild pipeline (`tests/integration/esbuild.config.mjs`) to bundle the test runner.

### Connectivity scripts (scripts/)

Bun-powered smoke tests that hit the real ASR / LLM / TTS endpoints with the API keys you've already saved in the plugin. Useful for isolating "is it my keys / network — or the plugin?"

```bash
bun scripts/test-asr.ts            # StepFun ASR endpoint
bun scripts/test-llm.ts            # configured LLM provider, 4 cases incl. abort
bun scripts/test-tts.ts            # TTS synthesis
bun scripts/test-tts.ts --save     # + write MP3s to /tmp for listening
```

See [`scripts/README.md`](../scripts/README.md) for the failure-mode → cause table.

There's also `scripts/test-stepfun.html` — a zero-dependency browser page for quick StepFun LLM connectivity checks. Open it locally, paste an API key, click test.

## Repo layout

```
src/
├── main.ts                     Plugin entry point (extends Plugin)
├── settings.ts                 StepVoxSettingTab, settings schema + migration
├── constants.ts                Shared timeouts, limits, magic strings
├── types.ts                    Plugin-wide types
│
├── audio/                      Mic capture, playback, VAD1/VAD2
├── pipeline/
│   └── VoicePipeline.ts        Orchestrates ASR → LLM → TTS + session mode + barge-in
├── agent/
│   ├── orchestrator.ts         R1/R2/R3 agent loop with tool dispatch
│   ├── tool-executor.ts        Runs tools, enforces ToolContext
│   ├── tools/                  Per-tool modules (read/, write/, system/)
│   └── prompt/                 System-prompt block composition
├── providers/
│   ├── stepfun-asr.ts          StepFun HTTP SSE ASR client
│   ├── stepfun-tts.ts          StepFun TTS client
│   ├── search.ts               Tavily / Exa web search
│   └── llm/                    LLM providers + registry
│       ├── openai.ts           Used by StepFun, OpenAI, Custom (OpenAI-compatible)
│       ├── anthropic.ts
│       ├── registry.ts         Provider registry + config schemas
│       └── entries/            Per-provider metadata
├── ui/
│   ├── StepVoxView.ts          Side panel (conversation log, mic button)
│   └── StatusBarWidget.ts
└── utils/
    ├── debug-logger.ts         debug.log writer
    ├── endpoint.ts             StepFun region/mode URL composition
    ├── performance-stats.ts    Per-turn timing metrics
    ├── request-url-with-abort.ts   Obsidian requestUrl + AbortSignal wrapper (fallback to fetch outside Obsidian)
    └── timeout.ts

tests/
├── __mocks__/obsidian.cjs      Minimal stub used by vitest
├── *.test.ts                   Vitest suites
└── integration/                Obsidian-hosted integration tests

scripts/                        Bun connectivity smoke tests
docs/                           This directory — developer/agent guides, PRDs
```

Every top-level folder under `src/` has an `index.ts` that re-exports the module's public surface — prefer importing from the folder root, not from inner files, to keep coupling shallow.

## How the plugin loads

When Obsidian boots, for each folder in `<vault>/.obsidian/plugins/`:

1. **Reads `manifest.json`** to discover the plugin and decide compatibility. If `minAppVersion` is higher than the running Obsidian, the plugin is skipped.
2. **`require`s `main.js`** (CommonJS bundle). The default export must be a class extending `Plugin`. StepVox's `src/main.ts` exports exactly that.
3. **Instantiates the class and calls `onload()`**. This is where the plugin registers commands, views, ribbon icons, settings tabs, and starts any background work.
4. **Injects `styles.css`** into the document head if the file exists. Obsidian handles per-plugin scoping so your classes don't conflict with core UI.

Dependencies marked `external` in esbuild (`obsidian`, `electron`, `@codemirror/*`) are resolved by Obsidian's own module loader at runtime — your `main.js` contains literal `require("obsidian")` calls, not the package source.

Everything else in `dependencies` (like `ws`) is **inlined** into `main.js` by esbuild. That's why the release bundle is a single ~74 KB file with no `node_modules` to ship.

Settings state (`data.json`) lives next to `main.js` but is written and read by the plugin itself, not Obsidian. Obsidian just exposes `loadData()` / `saveData()` APIs that round-trip to that file.

## Release process

1. **Verify quality gates**

   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   ```

   All three must pass. Also run `bun scripts/test-llm.ts` against each LLM provider you can reach (at minimum the one you're currently configured to use).

2. **Bump version**

   Update both `manifest.json` and `package.json` to the same new version (e.g. `0.1.1`). SemVer: patch for fixes, minor for additive features, major for breaking settings schema changes.

3. **Update `versions.json`**

   Add a new entry mapping the new version to the minimum Obsidian app version required. Usually the same as the previous entry unless you're using a newly-released Obsidian API.

   ```json
   {
     "0.1.0": "1.7.0",
     "0.1.1": "1.7.0"
   }
   ```

4. **Commit + tag**

   Commit the version bump. Tag with the raw version number — **no `v` prefix**, this is an Obsidian community-plugin requirement:

   ```bash
   git tag -a 0.1.1 -m "Release 0.1.1"
   git push origin main 0.1.1
   ```

5. **Create GitHub Release**

   ```bash
   gh release create 0.1.1 main.js manifest.json styles.css \
     --title "0.1.1" --notes "..."
   ```

   The three asset names must be exactly these — Obsidian's marketplace infrastructure looks for them by name.

6. **BRAT users auto-update**. Marketplace users (once StepVox is listed) auto-update when Obsidian's daily sync picks up the new release.

## Troubleshooting local dev

| Symptom | Fix |
|---------|-----|
| Changes to `.ts` don't appear in Obsidian after Cmd+R | `npm run dev` isn't running, or the symlink in the vault points to a stale location. `ls -la <vault>/.obsidian/plugins/stepvox/` should show arrows pointing at the workspace. |
| `Cannot find package 'obsidian'` when running a script under Bun | Expected — `obsidian` is Obsidian-runtime-only. The affected code path should fall back gracefully (see `src/utils/request-url-with-abort.ts` for the pattern). If a script truly needs real Obsidian APIs, move it under `tests/integration/`. |
| Settings changes aren't persisted | `saveSettings()` runs but `data.json` is unchanged — check the plugin actually loaded. Obsidian's Developer Tools console (Ctrl+Shift+I) shows any boot errors. |
| Mic permission denied | Obsidian hasn't been granted mic access by the OS. macOS: System Settings → Privacy & Security → Microphone → Obsidian. Reload Obsidian after granting. |
| `data.json` corrupted during schema migration | The migration leaves a backup at `data.json.v1-backup-<timestamp>`. Restore by copying it back over `data.json` and reload. |

## See also

- [`README.md`](../README.md) — end-user documentation.
- [`docs/BETA.md`](BETA.md) — beta-tester install guide.
- [`docs/agents/`](agents/) — conventions for AI assistants working on this codebase.
- [`CONTEXT.md`](../CONTEXT.md) — domain vocabulary.
- [`scripts/README.md`](../scripts/README.md) — connectivity diagnostics.
