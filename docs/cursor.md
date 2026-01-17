# Using Substrate with Cursor

This guide explains how to integrate Substrate with [Cursor](https://cursor.com), the AI-powered code editor.

## Overview

Cursor uses a rules system to provide context to its AI. You can configure Substrate integration using either:

- **Project Rules** (`.cursor/rules/*.mdc`) — Recommended, version-controlled
- **Legacy `.cursorrules`** — Single file in project root

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

### 3. Create Cursor Rules

Create `.cursor/rules/substrate.mdc` in your project:

````markdown
---
description: Substrate context management protocol
globs:
alwaysApply: true
---

# Substrate Context Protocol

This project uses Substrate for persistent context management.

## On Session Start

Run this command first to load project context:

```bash
substrate brief --compact
```
````

Internalize all constraints and decisions before proceeding.

## During Work

Capture discoveries immediately:

| Discovery             | Command                                 |
| --------------------- | --------------------------------------- |
| Hard rule             | `substrate add "..." --type constraint` |
| Architecture decision | `substrate add "..." --type decision`   |
| Important context     | `substrate add "..." --type note`       |
| Related concepts      | `substrate link add <id1> <id2>`        |

Use tags: `--tag api`, `--tag auth`, `--tag database`

## Quick Reference

```bash
substrate brief --compact    # Load context (START HERE)
substrate add "..." -t TYPE  # Save context
substrate ls                 # List recent
substrate link add X Y       # Link items
substrate digest             # Session summary
substrate recall "query"     # Search history
```

````

### Alternative: Legacy .cursorrules

If you prefer a single file, create `.cursorrules` in your project root:

```markdown
# Substrate Context Protocol

This project uses Substrate for persistent context.

## On Session Start
Run: substrate brief --compact

## Capture Protocol
- Constraints: substrate add "..." --type constraint
- Decisions: substrate add "..." --type decision
- Notes: substrate add "..." --type note

## Commands
- substrate brief --compact (load context first)
- substrate add "..." -t TYPE (save context)
- substrate ls (list recent)
- substrate digest (session summary)
````

## How It Works

1. Cursor reads the rules file when starting a session
2. The AI sees instructions to run `substrate brief --compact`
3. Context is loaded and the AI follows stored constraints/decisions
4. During work, the AI captures new context with `substrate add`

## Tips

### Use Glob Patterns for Scoped Rules

Create rules that only apply to specific files:

````markdown
---
description: API-specific Substrate rules
globs:
  - src/api/**
  - src/routes/**
---

When working on API files, always check for API-related context:

```bash
substrate ls --tag api
```
````

```

### Combine with Other Rules

You can have multiple rule files. Substrate rules work alongside your coding style rules:

```

.cursor/rules/
├── substrate.mdc # Context management
├── typescript.mdc # TypeScript conventions
└── testing.mdc # Testing guidelines

````

### Add Project-Specific Tags

Define your tag taxonomy in the rules:

```markdown
## Tags for This Project

Always use these tags when adding context:
- `api` — REST endpoints, request/response
- `auth` — Authentication, authorization
- `db` — Database, queries, migrations
- `ui` — Components, styling
- `perf` — Performance considerations
````

## Verifying It Works

Start a new Cursor session and ask:

```
What constraints and decisions exist for this project?
```

Cursor should run `substrate brief --compact` and show you the stored context.

## Troubleshooting

### Cursor isn't following the rules

1. Check the file is in `.cursor/rules/` with `.mdc` extension
2. Verify `alwaysApply: true` is set in frontmatter
3. Restart Cursor to reload rules

### Context not loading

```bash
substrate auth status    # Check auth
substrate status         # Check workspace
```

## Resources

- [Cursor Rules Documentation](https://docs.cursor.com/context/rules-for-ai)
- [Awesome Cursor Rules](https://github.com/PatrickJS/awesome-cursorrules)
- [Substrate CLI Reference](cli-reference.md)
