<!--
  Substrate context protocol for coding agents.

  Drop this into a project's AGENTS.md (Codex, and other agents that read AGENTS.md),
  or paste the section below into your agent's rules/instructions (Cursor `.cursor/rules`,
  Windsurf, etc.). Claude Code users should install the Substrate plugin instead — it
  does the same thing with a SessionStart hook and skills.
-->

# Substrate context protocol

This project can use [Substrate](https://github.com/seamoss/substrate), a git-backed
shared context layer. Project context (decisions, constraints, conventions) lives in
committed `.substrate/` files and is managed with the `substrate` CLI. No server, no
accounts — git is the transport.

**Requirement:** the CLI must be installed — `npm install -g substrate-cli`.

## When you start work in this project

1. Determine whether the project is already tracked: does `.substrate/config.json` exist?
   - **Yes** → load context: `substrate sync pull`, then read it with `substrate brief --format agent`.
   - **No** → check the per-machine opt-out list: is this project's absolute path in
     `~/.substrate/optout`? (`grep -qxF "$(pwd)" ~/.substrate/optout 2>/dev/null`)
     - If it **is listed** → do nothing; don't ask.
     - Otherwise → **ask the user once**:
       > "Track this project's context with Substrate? It stores decisions and constraints
       > in committed `.substrate/` files so they persist across sessions and sync via git."
       - If **yes** → `substrate init "<project-directory-name>"`. If you'll use the MCP
         server, also run `substrate config strategy mcp`.
       - If **no** → record a per-machine opt-out so you won't ask again:
         `mkdir -p ~/.substrate && pwd >> ~/.substrate/optout`

## Capturing context

When the work produces something durable a future session should know, record it:

```bash
substrate add "<clear, self-contained statement>" \
  --type <constraint|decision|note|task|entity|runbook|snippet> [--tag <tag>,<tag>]
```

- Use the most specific type; default to `note` only when nothing else fits.
- **Personal / machine-specific** facts (local ports, scratch notes): add `--private`
  so they go to the gitignored `.substrate/context.priv.jsonl` and are never committed.
- Don't capture secrets, transient chatter, or anything already obvious from the code.

## After capturing

- Write the cache to files: `substrate sync push`
- Tell the user to commit the shared context:
  `git add .substrate && git commit -m "Update context" && git push`
  (Personal `*.priv.jsonl` files are gitignored and won't be committed.)
