# Using Substrate with Claude Code

This guide explains how to integrate Substrate with Claude Code using a `CLAUDE.md` file in your project.

## Overview

Claude Code automatically reads `CLAUDE.md` files in your project root and follows the instructions within. By adding Substrate commands to your `CLAUDE.md`, you can give Claude persistent context across sessions.

## Setup

### 1. Install Substrate

```bash
npm install -g substrate-cli
```

### 2. Authenticate

```bash
substrate auth init
```

### 3. Initialize Your Project

```bash
cd your-project
substrate init your-project
```

### 4. Create CLAUDE.md

Create a `CLAUDE.md` file in your project root with the Substrate protocol:

````markdown
# Project Name

## Substrate Context

This project uses Substrate for persistent context. Follow this protocol:

### On Session Start

Run this command first to load project context:

```bash
substrate brief --compact
```
````

Internalize all constraints and decisions before proceeding with any work.

### During Work

When you discover or establish any of the following, capture it immediately:

| Discovery               | Command                                            |
| ----------------------- | -------------------------------------------------- |
| Hard rule or constraint | `substrate add "..." --type constraint`            |
| Architectural decision  | `substrate add "..." --type decision`              |
| Important context       | `substrate add "..." --type note`                  |
| Related concepts        | `substrate link add <id1> <id2> --relation <type>` |

Use tags to categorize: `--tag api`, `--tag auth`, `--tag database`

### On Task Completion

After completing significant work, capture:

1. Any constraints that were implicit but should be explicit
2. Decisions made (with brief rationale)
3. Relationships between concepts

### Quick Reference

```bash
substrate brief --compact    # Load context (do this first!)
substrate add "..." -t TYPE  # Save context
substrate ls                 # List recent context
substrate link add X Y       # Link related items
substrate digest             # Session summary
substrate recall "query"     # Search history
```

````

## How It Works

1. **Session Start**: Claude reads `CLAUDE.md` and sees the instruction to run `substrate brief --compact`
2. **Context Loading**: Claude runs the command and receives all stored constraints, decisions, and notes
3. **During Work**: When Claude makes decisions or discovers rules, it captures them with `substrate add`
4. **Persistence**: Context is stored in Substrate and available in future sessions

## Example CLAUDE.md

Here's a complete example for a web application:

```markdown
# MyApp

A Next.js e-commerce application.

## Substrate Context

This project uses Substrate for persistent context.

### On Session Start

```bash
substrate brief --compact
````

### Capture Protocol

| Type       | When to Use          | Example                                                                       |
| ---------- | -------------------- | ----------------------------------------------------------------------------- |
| constraint | Immutable rules      | `substrate add "All prices in cents" --type constraint --tag payments`        |
| decision   | Architecture choices | `substrate add "Using Stripe for payments" --type decision --tag payments`    |
| note       | General context      | `substrate add "Black Friday sale runs Nov 24-27" --type note --tag business` |

### Commands

```bash
substrate brief --compact    # Load context first
substrate add "..." -t TYPE  # Capture context
substrate ls --tag payments  # Filter by tag
substrate sync push          # Share with team
```

## Tech Stack

- Next.js 14 (App Router)
- PostgreSQL
- Stripe for payments
- Tailwind CSS

````

## Tips

### Be Specific About When to Capture

Tell Claude exactly what kinds of things to capture:

```markdown
### What to Capture

- API rate limits discovered during implementation
- Database schema decisions
- Security constraints (auth requirements, data handling)
- Integration details (API keys location, endpoint formats)
- Business rules that affect code logic
````

### Use Tags Consistently

Define your tag taxonomy in CLAUDE.md:

```markdown
### Tags

Use these tags for categorization:

- `api` — API endpoints and contracts
- `auth` — Authentication and authorization
- `db` — Database and data models
- `ui` — Frontend and UX decisions
- `infra` — Infrastructure and deployment
```

### Include Quick Reference

Always include a quick reference section so Claude can easily find commands:

````markdown
### Quick Reference

```bash
substrate brief --compact    # START HERE - load context
substrate add "..." -t TYPE  # Save context
substrate ls                 # List recent
substrate ls --type decision # Filter by type
substrate ls --tag api       # Filter by tag
substrate link add X Y       # Link items
substrate digest             # What was added this session
substrate recall "search"    # Find past context
```
````

```

## Verifying It Works

After setting up, start a new Claude Code session and ask Claude to check the context:

```

What constraints and decisions are stored for this project?

````

Claude should run `substrate brief --compact` and report back the stored context.

## Troubleshooting

### Claude isn't running Substrate commands

Make sure:
1. `CLAUDE.md` is in the project root
2. The "On Session Start" section is clear and prominent
3. Substrate CLI is installed globally (`substrate --version`)

### Context isn't persisting

Check authentication:
```bash
substrate auth status
````

Check you're in the right workspace:

```bash
substrate status
```

### Team members see different context

Make sure everyone has synced:

```bash
substrate sync pull   # Get latest from remote
substrate sync push   # Push your changes
```

## Next Steps

- [CLI Reference](cli-reference.md) — All available commands
- [Agent Integration](agent-integration.md) — MCP server setup for native integration
- [Authentication](authentication.md) — API keys and workspace tokens
