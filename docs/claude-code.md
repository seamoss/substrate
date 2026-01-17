# Using Substrate with Claude Code

This guide explains how to integrate Substrate with Claude Code using a `CLAUDE.md` file in your project.

## Overview

Claude Code automatically reads `CLAUDE.md` files in your project root and follows the instructions within. By adding Substrate commands to your `CLAUDE.md`, you can give Claude persistent context across sessions.

> **Strategy Note:** This guide uses the **Instructions** strategy (the default). Claude Code runs Substrate CLI commands directly. See [Agent Integration](agent-integration.md) for alternative strategies.

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
substrate brief --format agent
```

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

### Session Tracking (Optional)

Track your work sessions for better context:

```bash
substrate session start "task-name"  # Start tracking
substrate session end                 # End with summary
```

### On Task Completion

After completing significant work:

1. Run `substrate extract diff` to review changes
2. Capture any constraints that were implicit
3. Document decisions with rationale
4. Link related concepts

### Quick Reference

```bash
substrate brief --format agent  # Load context (do this first!)
substrate add "..." -t TYPE     # Save context
substrate ls                    # List recent context
substrate extract diff          # Suggest context from changes
substrate link add X Y          # Link related items
substrate session status        # Check active session
substrate digest                # Session summary
substrate recall "query"        # Search history
```
````

## How It Works

1. **Session Start**: Claude reads `CLAUDE.md` and sees the instruction to run `substrate brief --format agent`
2. **Context Loading**: Claude runs the command and receives prioritized context (constraints, decisions, notes)
3. **During Work**: When Claude makes decisions or discovers rules, it captures them with `substrate add`
4. **Session Tracking**: Optionally, Claude starts a session to track activity
5. **Persistence**: Context is stored in Substrate and available in future sessions

## Example CLAUDE.md

Here's a complete example for a web application:

````markdown
# MyApp

A Next.js e-commerce application.

## Substrate Context

This project uses Substrate for persistent context.

### On Session Start

```bash
substrate brief --format agent
substrate session start "current-task"
```
````

### Capture Protocol

| Type       | When to Use          | Example                                                                       |
| ---------- | -------------------- | ----------------------------------------------------------------------------- |
| constraint | Immutable rules      | `substrate add "All prices in cents" --type constraint --tag payments`        |
| decision   | Architecture choices | `substrate add "Using Stripe for payments" --type decision --tag payments`    |
| note       | General context      | `substrate add "Black Friday sale runs Nov 24-27" --type note --tag business` |

### Commands

```bash
substrate brief --format agent  # Load context first
substrate add "..." -t TYPE     # Capture context
substrate extract diff          # Review changes for context
substrate ls --tag payments     # Filter by tag
substrate session end           # End session with stats
substrate sync push             # Share with team
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
substrate brief --format agent  # START HERE - load context
substrate session start "task"  # Track this session
substrate add "..." -t TYPE     # Save context
substrate ls                    # List recent
substrate ls --type decision    # Filter by type
substrate ls --tag api          # Filter by tag
substrate extract diff          # Suggest context from changes
substrate link add X Y          # Link items
substrate session end           # End session with stats
substrate recall "search"       # Find past context
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
