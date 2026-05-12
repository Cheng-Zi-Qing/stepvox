# Domain docs — consumer rules

## Layout

This project keeps domain documents in **two different places**, on purpose:

| Document | Location | Tracked by git? |
|---|---|---|
| `CONTEXT.md` (domain-language reference) | repo root | yes |
| `docs/prd-voice-pipeline.md` (PRD-style spec) | repo root | yes |
| `docs/agents/*.md` (these agent contracts) | repo root | yes |
| Feature docs (`stepvox.<feature>.md`) | `~/Documents/Obsidian Vault/workspace/StepVox/features/` | **no** — lives in maintainer's Obsidian vault |
| Architectural decisions (`stepvox.decisions.md`) | `~/Documents/Obsidian Vault/workspace/StepVox/stepvox.decisions.md` | **no** — vault |
| Architecture index (`stepvox.index.md`) | `~/Documents/Obsidian Vault/workspace/StepVox/stepvox.index.md` | **no** — vault |
| Implementation plans (`plans/`) | `~/Documents/Obsidian Vault/workspace/StepVox/plans/` | **no** — vault |

### Why ADRs and feature docs live outside the repo

- They are product / design records, not code artifacts. Their natural lifecycle is independent of commits — one ADR may motivate many commits across months, or several ADRs may land in a single commit.
- Keeping them in the maintainer's Obsidian vault lets feature docs sit next to project plans, daily notes, and other thinking material. `[[stepvox.decisions]]` wikilinks resolve naturally inside Obsidian.
- The repo stays focused on shipping code + the minimum context AI/contributors need to navigate it. Heavyweight design history doesn't bloat clones.
- Trade-off: contributors who don't have the vault can't read the design history directly. They get `CONTEXT.md`, `docs/prd-voice-pipeline.md`, commit messages, and the ADR IDs (e.g. "D46", "D52") referenced from code comments and PR descriptions.

## How skills (and AI agents) consume these files

### `CONTEXT.md`

- Read it before proposing architectural changes, naming new modules, or reviewing domain logic.
- Use the terminology defined there — don't invent synonyms.
- If a term is missing or wrong, propose adding it to `CONTEXT.md` as part of the PR. This file IS in the repo, so it can move with code changes.

### `docs/prd-voice-pipeline.md`

- The single source of truth for the voice pipeline's runtime contract (phases, VAD configs, timeouts, callbacks). When something looks weird in the code, check the PRD before assuming the code is wrong.

### ADRs in the vault (`stepvox.decisions.md`)

- ADRs are numbered `D01`, `D02`, ..., `D46`, ..., `D53`, ... The numbering is append-only; superseded decisions are kept and marked `~~D??: ...~~ → Superseded by D??`.
- When code or other docs reference a decision by ID (e.g. "(D46)", "see D51"), that ID resolves to a section in `stepvox.decisions.md`.

#### When you have vault access (maintainer's local environment)

- Open `~/Documents/Obsidian Vault/workspace/StepVox/stepvox.decisions.md` (or browse the vault in Obsidian directly).
- Read the relevant ADRs before proposing changes that touch the same area.
- If your change contradicts an existing ADR, either update the ADR (marking the old one superseded) or explain why the deviation is justified.
- New architectural decisions should be recorded as a new ADR appended to that file. Follow the existing style: `## D<N+1>: <Title>`, then `**Context** / **Options considered** / **Decision** / **Rationale** / **Consequences**`.

#### When you do NOT have vault access (CI, fresh clone, remote contributor)

- The repo carries `CONTEXT.md` + `docs/prd-voice-pipeline.md` as the practical substitute — both reflect the current state of the decisions that matter for code.
- Commit messages and PR descriptions reference ADR IDs (e.g. "D46 3-round agent loop"). Search them for context.
- When in doubt, ASK the maintainer rather than reverting an architectural choice you can't trace.
- If you propose a change that touches an established design, note in your PR that you're working without vault access and request the maintainer cross-check against the relevant ADR.

### Feature docs in the vault (`stepvox.<feature>.md`)

- Each feature has a per-feature spec document under `features/` in the vault, e.g. `stepvox.audio-layer.md`, `stepvox.command-executor.md`. These are deeper than the PRD but narrower than `CONTEXT.md`.
- Same access pattern as ADRs: vault if available, otherwise infer from PRD + code + commit history.

## When these files don't exist yet

If `CONTEXT.md` doesn't exist in a fresh repo, skills that depend on it will note its absence and suggest creating it. This is not an error — it just means the project hasn't documented its domain language yet.

The same applies to the vault — a fresh maintainer setup won't have the `workspace/StepVox` directory until they create it. The repo functions independently; vault docs are an enrichment, not a dependency.
