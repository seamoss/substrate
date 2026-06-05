# Substrate GitHub Action

Comment on every pull request with the Substrate context — the constraints and decisions
that **govern the files being changed** — so the rules show up at the moment of review.
No server; it reads the committed `.substrate/` files.

## Usage

Add `.github/workflows/substrate.yml` to your repo:

```yaml
name: Substrate context
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # needed to diff against the base branch
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: seamoss/substrate@main # pin a release tag for stability, e.g. @v0.7.0
```

On each PR it posts — and keeps updated — a single comment listing the context governing
the changed files.

## How it works

1. Loads committed context into the local cache (`substrate sync pull`).
2. Computes the PR's changed files versus the base branch.
3. Runs `substrate why <file> --json` for each and aggregates the governing constraints/decisions.
4. Upserts one **sticky** comment (marker-based, so it edits rather than spams).

It is best-effort and **never fails your PR**: if the repo has no `.substrate/`, or nothing
governs the changes, it skips or posts a short note.

## Requirements

- The repo uses Substrate (a committed `.substrate/` directory — see [Getting Started](getting-started.md)).
- Permissions: `pull-requests: write` (to comment) and `contents: read`.
- `actions/checkout` with `fetch-depth: 0` so it can diff against the base branch.
- Node 20 on the runner (`actions/setup-node@v4`).

## Dogfooding

Substrate runs this Action on its own pull requests — see
[`.github/workflows/substrate.yml`](../.github/workflows/substrate.yml) (it references the
local action with `uses: ./`) and this repo's committed [`.substrate/`](../.substrate)
context.

## See also

[CLI Reference](cli-reference.md) (`substrate why`) · [Sync & Sharing](sync.md)
