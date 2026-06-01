---
description: Capture durable project knowledge into Substrate. Use when the conversation produces a decision, constraint, convention, or other fact worth persisting across sessions — or when the user asks to remember/store/record context. Requires the project to be tracked by Substrate (a .substrate/ directory).
---

# Capture context with Substrate

Substrate stores project context in committed `.substrate/` files (the shared
"collective mind") plus gitignored `*.priv.jsonl` files (personal context). The local
SQLite cache is rebuilt from those files; git is the sync transport.

## When to use this

Capture context when something durable emerges that a future session (yours or a
teammate's) would benefit from knowing:

- a **constraint** (hard rule / immutable fact): "All API responses must be JSON"
- a **decision** (architectural choice + why): "Chose PostgreSQL over Mongo for ACID"
- a **note**, **task**, **entity**, **runbook**, or **snippet**

Do NOT capture transient chatter, secrets, or anything already obvious from the code.

## Prerequisite

Only act if the project is tracked (a `.substrate/` directory exists). If it does not,
the project hasn't opted in — don't create context; defer to the `enable` flow.

## How to capture

1. Choose the most specific type. Default to `note` only when nothing else fits.
2. Record it:
   ```bash
   substrate add "<clear, self-contained statement>" --type <type> [--tag <tag>,<tag>]
   ```
3. For **personal or machine-specific** facts (local ports, your own scratch notes),
   add `--private` so they go to the gitignored `*.priv.jsonl` and are never committed:
   ```bash
   substrate add "My local DB runs on port 5544" --type note --private
   ```
4. Link related items when useful: `substrate link add <fromShortId> <toShortId> --relation <relates_to|depends_on|blocks|implements|extends|references>`

## After capturing

- Write the cache out to files: `substrate sync push`
- Tell the user to commit the shared context:
  `git add .substrate && git commit -m "Update context" && git push`
  (The `*.priv.jsonl` personal files are gitignored and won't be committed.)

## Loading context

At the start of work in a tracked project, you can rehydrate context with:

```bash
substrate brief --format agent      # or: --budget medium  for a token-bounded brief
```

On a fresh clone, run `substrate sync pull` first to load the committed files into the cache.
