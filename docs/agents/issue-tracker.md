# Issue tracker — GitHub Issues

## Where issues live

This project tracks issues in **GitHub Issues** on the repo's origin remote.

## CLI

Use the `gh` CLI for all issue operations:

- **Create**: `gh issue create --title "..." --body "..." --label "..."`
- **List**: `gh issue list --label "..." --state open`
- **View**: `gh issue view <number>`
- **Close**: `gh issue close <number>`
- **Comment**: `gh issue comment <number> --body "..."`
- **Edit labels**: `gh issue edit <number> --add-label "..." --remove-label "..."`

## Conventions

- Issue titles should be concise and actionable (imperative mood).
- The body should contain enough context for someone unfamiliar with the problem to understand and reproduce it.
- Always apply at least one triage label (see `triage-labels.md`).
- Reference related issues with `#<number>` in the body when relevant.
