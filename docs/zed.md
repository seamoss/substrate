# Substrate + Zed

Zed's assistant reads a `.rules` file at the project root. Add the Substrate protocol
there so Zed loads and captures context.

## Setup

1. Install and initialize (once per repo):
   ```bash
   npm install -g substrate-cli
   substrate init your-project      # already set up? git clone + substrate sync pull
   ```
2. Create a `.rules` file in your project root:

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

**Native tools (optional):** Zed supports MCP context servers. Run
`substrate config strategy mcp`, then add `substrate mcp serve` as a context server so the
agent uses Substrate tools directly. See [Agent Integration](agent-integration.md).

## Verify

Ask in the assistant panel: _"What constraints and decisions are stored for this project?"_
Zed should run `substrate brief --format agent` and report them.

## Troubleshooting

- **Zed isn't following the rules** — confirm `.rules` is at the project root and
  `substrate --version` works.
- **No context** — `substrate status` and `substrate sync status`.
- **Team out of sync** — `git pull && substrate sync pull`; after capturing, `substrate sync push` + commit.

## See also

[CLI Reference](cli-reference.md) · [Sync & Sharing](sync.md) · [Agent Integration](agent-integration.md)
