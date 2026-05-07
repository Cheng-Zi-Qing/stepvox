# Domain docs — consumer rules

## Layout

This project uses a **single-context** layout:

- `CONTEXT.md` at the repo root — the project's domain language, bounded contexts, and key concepts.
- `docs/adr/` at the repo root — architectural decision records.

## How skills consume these files

### CONTEXT.md

- Read `CONTEXT.md` before proposing architectural changes, naming new modules, or reviewing domain logic.
- Use the terminology defined there — don't invent synonyms.
- If a term is missing, propose adding it to `CONTEXT.md` as part of your PR.

### ADRs (docs/adr/)

- Read relevant ADRs before proposing changes that touch the same area.
- If your change contradicts an existing ADR, either update the ADR (marking the old one superseded) or explain why the deviation is justified.
- New architectural decisions should be recorded as a new ADR using the template in `docs/adr/`.

## When these files don't exist yet

If `CONTEXT.md` or `docs/adr/` don't exist, skills that depend on them will note their absence and suggest creating them. This is not an error — it just means the project hasn't documented its domain language or decisions yet.
