## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

`CONTEXT.md` lives at the repo root and is the canonical domain-language reference.

Architectural decision records (ADRs) live OUTSIDE the repo, in the maintainer's Obsidian vault at `~/Documents/Obsidian Vault/workspace/StepVox/stepvox.decisions.md`. Feature docs are colocated with the ADRs under that vault path. See `docs/agents/domain.md` for the full layout, why decisions live in the vault, and how to consume them when running with or without vault access.
