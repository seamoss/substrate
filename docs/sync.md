# Sync & Sharing

Substrate has no remote server and no accounts. A workspace's context lives in
committed `.substrate/` files, and **git is the transport** between contributors.
Identity and access control are whatever your git host already provides.

## How it works

```
your-repo/
  .substrate/
    config.json         # project_id pin                          [committed]
    workspace.json      # workspace manifest                       [committed]
    context.jsonl       # shared context items (source of truth)   [committed]
    links.jsonl         # shared links                             [committed]
    context.priv.jsonl  # personal context items                   [gitignored]
    links.priv.jsonl    # personal links                           [gitignored]
```

- The committed `.substrate/` files (`context.jsonl`, `links.jsonl`, `workspace.json`)
  are the **shared source of truth** — the "collective mind".
- The `*.priv.jsonl` files alongside them hold **personal context**: same format, but
  gitignored and never committed (see [Personal context](#personal-context)).
- `~/.substrate/local.db` is a **local cache**, rebuilt from all of the above. It lives
  in your home directory and is never committed.

`substrate sync push` writes the cache out to the files; `substrate sync pull`
reads the files back into the cache. Committing and pushing the files is done with
git, in your normal workflow.

## Everyday flow

```bash
# Capture context as you work (writes to the local cache)
substrate add "Auth tokens expire after 24h" --type constraint --tag auth

# Serialize the cache into .substrate/ files
substrate sync push

# Commit and share with git
git add .substrate
git commit -m "Update context"
git push
```

## Receiving teammates' context

```bash
git pull
substrate sync pull   # reconcile .substrate/ files into your local cache
```

`substrate sync pull` uses last-write-wins by each item's `updated_at`: newer file
records update the cache, older ones are skipped, and tombstones (items marked
deleted) propagate as local soft-deletes.

## Joining an existing project

A fresh clone already carries the committed `.substrate/` files, so you can pull
straight away — Substrate bootstraps a local workspace from `workspace.json`:

```bash
git clone <repo-url>
cd <repo>
substrate sync pull
```

To attach a directory to a project you know the ID of (e.g. before any files
exist locally), pin it first:

```bash
substrate project pin <project-id>
substrate sync pull
```

Your project ID is in `.substrate/config.json`:

```bash
substrate project id
```

## Personal context

Some context is just for you — a local DB port, a scratch reminder, machine-specific
paths. Add `--private` and it's written to the `*.priv.jsonl` files inside `.substrate/`
instead of the shared ones:

```bash
substrate add "My local DB runs on port 5544" --type note --private
```

Private items use the **same format** as shared ones; only their file differs. Because
`*.priv.jsonl` is gitignored, they're never committed and never reach teammates — but
they survive in your local cache and round-trip through `substrate sync push`/`pull` on
your own machine. `substrate init` adds the `*.priv.jsonl` pattern to your `.gitignore`
automatically.

A link is treated as private if either of its endpoints is private.

## Merge behavior

Records are written one-per-line, sorted by ID, with a stable key order, so git
auto-merges disjoint edits. Concurrent edits to the **same** item produce a normal
git merge conflict in `context.jsonl` — resolve it like any other conflicted file,
then run `substrate sync pull`.

> **Note:** link deletions do not propagate through git (a removed link is simply
> absent from `links.jsonl` and is treated as not-present rather than deleted).

## CI usage

Because everything is files in the repo, CI needs no credentials:

```yaml
steps:
  - uses: actions/checkout@v4
  - run: npm install -g substrate-cli
  - run: substrate sync pull && substrate brief --format agent
```
