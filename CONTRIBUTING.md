# Contributing to Substrate

## Documentation is part of every change — no exceptions

Substrate is a shared-context tool; its docs are the authority and must never lag the code.
**Every change — large or small — updates the docs in the same commit.** A behavior, flag,
command, schema, file-format, or integration change with stale docs is an incomplete change.

When you touch the code, sweep and update whatever applies:

- `docs/cli-reference.md` — including the **Commands Overview** table for any new/renamed command
- `docs/getting-started.md`, `docs/sync.md`, and the per-harness guides (`docs/claude-code.md`, etc.)
- the integration protocol — keep it **identical** across every harness guide and `plugins/*`
- `README.md` and the `site/` when the pitch, model, or commands change

If a change has no doc impact, that's a deliberate call — confirm it, don't assume it.

## Engineering

- Node 20 (`.nvmrc`); `npm test` (vitest) and `npm run lint` must pass.
- `lint-staged` formats staged files on commit; keep `npm run format:check` clean.
- Conventional Commits are encouraged (they feed `substrate ingest`).
- The project dogfoods itself: capture durable decisions with `substrate add` and commit `.substrate/`.
