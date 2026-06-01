# Substrate + GitHub Copilot

Copilot reads `.github/copilot-instructions.md` for the whole repo (and optional
path-scoped `.github/instructions/*.instructions.md`). Add the Substrate protocol there.

## Setup

1. Install and initialize (once per repo):
   ```bash
   npm install -g substrate-cli
   substrate init your-project      # already set up? git clone + substrate sync pull
   ```
2. Create `.github/copilot-instructions.md`:

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

**Path-scoped context (optional):** for a subtree, add
`.github/instructions/api.instructions.md` with an `applyTo: "src/api/**"` frontmatter and
capture matching context with `--scope "src/api/*"`.

## Verify

Open Copilot Chat and ask: _"What constraints and decisions are stored for this project?"_
It should run `substrate brief --format agent` and report them.

## Troubleshooting

- **Copilot isn't following instructions** — confirm `.github/copilot-instructions.md`
  exists and instruction files are enabled in settings; check `substrate --version`.
- **No context** — `substrate status` and `substrate sync status`.
- **Team out of sync** — `git pull && substrate sync pull`; after capturing, `substrate sync push` + commit.

## See also

[CLI Reference](cli-reference.md) · [Sync & Sharing](sync.md) · [Agent Integration](agent-integration.md)
