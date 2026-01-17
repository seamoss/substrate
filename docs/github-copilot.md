# Using Substrate with GitHub Copilot

This guide explains how to integrate Substrate with [GitHub Copilot](https://github.com/features/copilot) using custom instructions.

## Overview

GitHub Copilot supports custom instructions through:

- **Repository instructions** (`.github/copilot-instructions.md`) — Applies to entire repo
- **Path-specific instructions** (`.github/instructions/*.instructions.md`) — Scoped to specific files

## Setup

### 1. Install Substrate

```bash
npm install -g substrate-cli
substrate auth init
```

### 2. Initialize Your Project

```bash
cd your-project
substrate init your-project
```

### 3. Create Copilot Instructions

Create `.github/copilot-instructions.md` in your project:

````markdown
# Project Context with Substrate

This project uses Substrate for persistent context management across sessions.

## On Session Start

Before starting any work, load the project context:

```bash
substrate brief --compact
```
````

This returns all constraints, decisions, and notes for this project. Internalize them before proceeding.

## During Work

When you discover or establish important context, capture it immediately:

### Constraints (immutable rules)

```bash
substrate add "All API responses must be JSON" --type constraint --tag api
```

### Decisions (architectural choices)

```bash
substrate add "Using PostgreSQL for ACID compliance" --type decision --tag database
```

### Notes (general context)

```bash
substrate add "Frontend team prefers Tailwind" --type note --tag ui
```

### Relationships

```bash
substrate link add <id1> <id2> --relation implements
```

## Quick Reference

| Action          | Command                                 |
| --------------- | --------------------------------------- |
| Load context    | `substrate brief --compact`             |
| Add constraint  | `substrate add "..." --type constraint` |
| Add decision    | `substrate add "..." --type decision`   |
| Add note        | `substrate add "..." --type note`       |
| List recent     | `substrate ls`                          |
| Filter by tag   | `substrate ls --tag api`                |
| Link items      | `substrate link add X Y`                |
| Session summary | `substrate digest`                      |
| Search history  | `substrate recall "query"`              |

## Tags

Use these tags for categorization:

- `api` — API endpoints and contracts
- `auth` — Authentication and authorization
- `db` — Database and data models
- `ui` — Frontend and UX
- `infra` — Infrastructure and deployment
- `security` — Security requirements

````

## Path-Specific Instructions

For different rules in different parts of your codebase, create files in `.github/instructions/`:

### API-specific context (`.github/instructions/api.instructions.md`)

```markdown
---
applyTo:
  - src/api/**
  - src/routes/**
---

When working on API files:

1. First check API-specific context:
   ```bash
   substrate ls --tag api
````

2. After modifying endpoints, capture changes:
   ```bash
   substrate add "POST /users requires Bearer token" --type constraint --tag api
   ```

````

### Frontend context (`.github/instructions/frontend.instructions.md`)

```markdown
---
applyTo:
  - src/components/**
  - src/pages/**
---

When working on frontend files:

1. Check UI context:
   ```bash
   substrate ls --tag ui
````

2. Capture component decisions:
   ```bash
   substrate add "Using shadcn/ui for all form components" --type decision --tag ui
   ```

````

## How It Works

1. Copilot reads `.github/copilot-instructions.md` for every chat request
2. Path-specific `.instructions.md` files are included when matching files are referenced
3. Instructions are prepended to the prompt sent to the model
4. Copilot follows the protocol to load and capture context

## Verifying Instructions Are Used

In VS Code with Copilot Chat:
1. Send a message to Copilot
2. Look at the "References" section in the response
3. `.github/copilot-instructions.md` should be listed if it was applied

## Priority Order

When multiple instruction sources exist:
1. **Personal instructions** (highest priority)
2. **Repository instructions** (`.github/copilot-instructions.md`)
3. **Organization instructions** (lowest priority)

All relevant instructions are combined, so avoid conflicts.

## Tips

### Keep Instructions Focused

The instructions file should tell Copilot *how* to work with Substrate, not contain the actual context. The context lives in Substrate.

**Good:**
```markdown
Load project context with: substrate brief --compact
````

**Avoid:**

```markdown
Here are all the project constraints:

- Constraint 1...
- Constraint 2...
  (This duplicates what Substrate stores)
```

### Include Tech Stack Summary

Copilot benefits from knowing your stack:

```markdown
## Tech Stack

- Next.js 14 (App Router)
- PostgreSQL with Prisma
- Tailwind CSS
- Deployed on Vercel

Run `substrate brief --compact` for detailed constraints and decisions.
```

### Use with Copilot Agents

Copilot coding agent also supports custom instructions. The same `.github/copilot-instructions.md` file works for both Chat and Agent modes.

## Troubleshooting

### Copilot not following instructions

1. Verify the file is at `.github/copilot-instructions.md` (exact path)
2. Check the file is committed to the repo
3. Look for the file in Copilot's References after a response

### Context not loading

```bash
substrate auth status    # Verify authentication
substrate status         # Check workspace
```

### Instructions not appearing in References

- The file must be in the repository root's `.github` directory
- File name must be exactly `copilot-instructions.md`
- Content must be valid Markdown

## Resources

- [GitHub Copilot Custom Instructions Docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)
- [Awesome Copilot Customizations](https://github.com/github/awesome-copilot)
- [5 Tips for Better Custom Instructions](https://github.blog/ai-and-ml/github-copilot/5-tips-for-writing-better-custom-instructions-for-copilot/)
- [Substrate CLI Reference](cli-reference.md)
