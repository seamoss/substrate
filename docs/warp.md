# Substrate + Warp

Warp is a terminal, so there's no rules file — you drive Substrate from the command line
(or Warp AI), and optionally save the common commands as Warp Workflows.

## Setup

1. Install and initialize (once per repo):
   ```bash
   npm install -g substrate-cli
   substrate init your-project      # already set up? git clone + substrate sync pull
   ```

## The protocol

Same flow as every other harness — just run it in the terminal (Warp AI will also suggest
these from natural language):

- **At the start of a session**, load and follow context:
  ```bash
  substrate brief --format agent
  ```
- **When the work produces something durable** (a constraint, decision, or convention),
  capture it — add `--private` for personal/machine-specific notes (kept out of git):
  ```bash
  substrate add "<statement>" --type <constraint|decision|note|task|entity|runbook|snippet> [--tag <tag>]
  ```
- **After capturing**, share it:
  ```bash
  substrate sync push
  git add .substrate && git commit -m "Update context" && git push
  ```
- On a fresh clone, run `substrate sync pull` first.

## Optional: Warp Workflows

Save the two you'll use most as Workflows for one-keystroke access:

- **substrate-context** → `substrate brief --format agent`
- **substrate-add** → `substrate add "{{content}}" --type {{type}}` (parameterized)

## Verify

Run `substrate brief --format agent` (or ask Warp AI to). You should see the stored
constraints and decisions.

## Troubleshooting

- **`substrate: command not found`** — `npm install -g substrate-cli`, then reopen Warp.
- **No context** — `substrate status` and `substrate sync status`.
- **Team out of sync** — `git pull && substrate sync pull`; after capturing, `substrate sync push` + commit.

## See also

[CLI Reference](cli-reference.md) · [Sync & Sharing](sync.md) · [Agent Integration](agent-integration.md)
