# Using Substrate with Zed

This guide explains how to integrate Substrate with [Zed](https://zed.dev), the high-performance code editor with built-in AI.

## Overview

Zed's AI assistant supports custom context through:
- **Rules files** (`.rules`) — Project-specific instructions
- **@mentions** — Reference files, symbols, and rules in chat
- **MCP support** — Model Context Protocol integration

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

### 3. Create Rules File

Create a `.rules` file in your project root:

```markdown
# Substrate Context Protocol

This project uses Substrate for persistent context management.

## On Session Start

Always run this command first to load project context:

```bash
substrate brief --compact
```

Read and internalize all constraints and decisions before proceeding.

## During Work

Capture discoveries immediately:

| Discovery | Command |
|-----------|---------|
| Hard rule | `substrate add "..." --type constraint` |
| Decision | `substrate add "..." --type decision` |
| Context | `substrate add "..." --type note` |
| Relationship | `substrate link add <id1> <id2>` |

Use tags: `--tag api`, `--tag auth`, `--tag database`

## Quick Reference

```bash
substrate brief --compact    # Load context first
substrate add "..." -t TYPE  # Save context
substrate ls                 # List recent
substrate link add X Y       # Link items
substrate digest             # Session summary
substrate recall "query"     # Search history
```
```

## How It Works

1. Zed detects `.rules` in your project root
2. The rules content is available via `@rules` mention
3. You can reference it in the Agent Panel or use it automatically
4. The AI follows the protocol to load and capture context

## Using Rules in Zed

### Automatic Detection

When you create a `.rules` file, Zed automatically makes it available. The AI will use its contents when generating code.

### Manual Reference

In the Agent Panel, type `@rules` to explicitly include your rules in the conversation:

```
@rules What constraints exist for the API?
```

### With File Context

Combine rules with file references:

```
@rules @src/api/users.ts Add input validation following project constraints
```

## Tips

### Use the Rules Library

Zed has a built-in rules library. You can create custom rules and reference them:

1. Open Command Palette → "Open Rules Library"
2. Create a new rule called "substrate"
3. Paste your Substrate protocol
4. Reference with `@substrate` in chat

### Combine with @file

Bring in relevant context alongside Substrate:

```
@rules @package.json What database should we use for this project?
```

### Thread Management

Zed allows editing previous messages. If the AI didn't load Substrate context:

1. Click on your message
2. Add: "First run `substrate brief --compact`"
3. Re-submit

### Checkpoints

After the AI makes changes, use "Restore Checkpoint" if needed. Then capture what worked:

```bash
substrate add "Approach X worked better than Y for auth" --type decision --tag auth
```

## Project-Specific Tags

Include your tag taxonomy in `.rules`:

```markdown
## Project Tags

- `api` — REST endpoints, GraphQL
- `auth` — Authentication, sessions
- `db` — Database, migrations
- `ui` — Components, styling
- `test` — Testing patterns
```

## MCP Integration (Advanced)

Zed supports the Model Context Protocol. While Substrate has an MCP server, you can also use the CLI-based approach through rules for simpler setup.

If you want to use MCP:

```bash
substrate config strategy mcp
substrate mcp serve
```

Then configure Zed to use the MCP server (see Zed's MCP documentation).

## Verifying It Works

In Zed's Agent Panel:

```
@rules What does this project use for context management?
```

The AI should recognize Substrate and offer to run `substrate brief --compact`.

## Troubleshooting

### Rules not loading

1. Verify `.rules` file is in project root
2. Check the file has valid Markdown content
3. Restart Zed to reload the workspace

### AI not running Substrate commands

Be explicit in your prompts:

```
Following the project rules, first load the Substrate context, then help me with [task]
```

### Context not saving

```bash
substrate auth status    # Check auth
substrate status         # Check workspace mount
```

## Resources

- [Zed AI Documentation](https://zed.dev/docs/ai/overview)
- [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel)
- [Substrate CLI Reference](cli-reference.md)
