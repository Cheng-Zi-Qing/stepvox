# Triage labels

## Label mapping

| Role | Label | When to apply |
|------|-------|---------------|
| Needs evaluation | `needs-triage` | New issue, maintainer has not yet reviewed |
| Waiting on reporter | `needs-info` | Cannot proceed without more information from the reporter |
| Ready for agent | `ready-for-agent` | Fully specified, an AI agent can implement without human context |
| Ready for human | `ready-for-human` | Requires human judgement, creativity, or access to implement |
| Won't fix | `wontfix` | Will not be actioned — out of scope, duplicate, or not a bug |

## Rules

- Every open issue must have exactly one of these labels at all times.
- When moving an issue between states, remove the old label and add the new one.
- `ready-for-agent` issues must have a clear acceptance criteria in the body — if not, move to `needs-info` first.
