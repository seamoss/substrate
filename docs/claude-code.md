# Substrate + Claude Code

Two ways to use Substrate with Claude Code: the **plugin** (recommended) or a
**`CLAUDE.md`** protocol.

## Option A — Plugin (recommended)

The [Substrate plugin](../plugins/substrate/README.md) asks once per project whether to
track context, captures decisions/constraints for you, and registers the MCP server.

```bash
npm install -g substrate-cli      # prerequisite
/plugin marketplace add seamoss/substrate
/plugin install substrate@substrate
```

## Option B — CLAUDE.md protocol

Claude Code auto-reads `CLAUDE.md` from the project root. Use this if you prefer
instructions over the plugin.

1. Install and initialize (once per repo):
   ```bash
   npm install -g substrate-cli
   substrate init your-project      # already set up? git clone + substrate sync pull
   ```
2. Add this block to `CLAUDE.md`:

   ```markdown
   ## Substrate context

   This project uses Substrate for persistent, shared context — decisions, constraints,
   and conventions stored in committed `.substrate/` files (git is the transport; no
   server, no accounts).

   - **At the start of a session**, load and follow context: `substrate brief --format agent`
   - **When the work produces something durable** (a constraint, decision, or convention),
     capture it: `substrate add "<statement>" --type <constraint|decision|note|task|entity|runbook|snippet> [--tag <tag>]`.
     Add `--private` for personal/machine-specific notes (kept out of git).
   - **After capturing**, share it: `substrate sync push`, then
     `git add .substrate && git commit -m "Update context" && git push`.
   - On a fresh clone, run `substrate sync pull` first.
   ```

## Verify

Start a session and ask: _"What constraints and decisions are stored for this project?"_
Claude should run `substrate brief --format agent` and report them back.

## Troubleshooting

- **Claude isn't running the commands** — confirm `CLAUDE.md` is in the repo root (or the
  plugin is installed) and `substrate --version` works.
- **No context** — `substrate status` and `substrate sync status` to check the store/files.
- **Team out of sync** — `git pull && substrate sync pull`; after capturing, `substrate sync push` + commit.

## See also

[CLI Reference](cli-reference.md) · [Sync & Sharing](sync.md) · [Agent Integration](agent-integration.md)
