# Using Substrate with Warp

This guide explains how to integrate Substrate with [Warp](https://warp.dev), the AI-powered terminal.

## Overview

Warp is an AI-native terminal with built-in assistants. While it doesn't have file-based custom instructions like code editors, you can integrate Substrate through:

- **AI Knowledge settings** — Configure AI behavior
- **Workflows** — Save common command sequences
- **Natural language commands** — Ask Warp AI to use Substrate

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

### 3. Configure Warp AI (Optional)

In Warp Settings → AI:

- Enable the AI features you want
- Configure your preferred model

## Using Substrate with Warp AI

### Loading Context

When starting work, ask Warp's AI:

```
Load project context with substrate brief --compact
```

Or run directly:

```bash
substrate brief --compact
```

### Capturing Context

Ask Warp AI to help capture context:

```
Add a constraint that all API responses must include request IDs using substrate
```

Warp will suggest:

```bash
substrate add "All API responses must include request IDs" --type constraint --tag api
```

### Natural Language Queries

Warp AI understands natural language. Ask it:

```
What substrate commands can I use to see recent decisions?
```

```
Show me how to link two substrate context items
```

## Creating Workflows

Save common Substrate operations as Warp Workflows:

### Context Brief Workflow

Create a workflow named "substrate-context":

```bash
substrate brief --compact
```

Then run it with: `substrate-context`

### Quick Add Workflows

Create workflows for common captures:

**Add Constraint** (`sub-constraint`):

```bash
substrate add "${1:constraint text}" --type constraint --tag ${2:tag}
```

**Add Decision** (`sub-decision`):

```bash
substrate add "${1:decision text}" --type decision --tag ${2:tag}
```

**Session Summary** (`sub-digest`):

```bash
substrate digest --hours ${1:8}
```

## Recommended Workflow

### Session Start

1. Navigate to your project
2. Run `substrate brief --compact` or your workflow
3. Review constraints and decisions

### During Work

Use natural language with Warp AI:

```
I just decided to use Redis for caching. Save this as a substrate decision with tag caching.
```

Warp will run:

```bash
substrate add "Using Redis for caching" --type decision --tag caching
```

### Session End

```
Show me what substrate context I added today
```

Warp will run:

```bash
substrate digest --hours 8
```

## Tips

### Use Warp's Command Suggestions

Start typing `substrate` and Warp will show command completions based on your history.

### Combine with Warp Blocks

Warp organizes terminal output into blocks. After running `substrate brief --compact`, you can:

- Copy the block output
- Share it with teammates
- Reference it in later commands

### AI Command Mode

In Warp, press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac) to enter AI command mode. Then type:

```
list all substrate constraints tagged with api
```

Warp translates this to:

```bash
substrate ls --type constraint --tag api
```

### Persistent Environment

Warp supports persistent environment variables. If using a self-hosted Substrate:

```bash
# In Warp Settings → Environment
SUBSTRATE_API_URL=https://your-substrate-server.com
```

## Example Session

```bash
# Start of session - load context
$ substrate brief --compact
## Project Context: myapp

### Constraints
- All API responses must be JSON
- Rate limit: 100 req/min per user

### Decisions
- Using PostgreSQL for persistence

# During work - capture a new constraint
$ substrate add "Auth tokens expire after 24h" --type constraint --tag auth
✓ Added constraint
b4dc3d55 [constraint] Auth tokens expire after 24h (auth)

# Link related items
$ substrate ls
b4dc3d55 [constraint] Auth tokens expire after 24h (auth)
a1b2c3d4 [decision] Using JWT for stateless auth (auth)

$ substrate link add b4dc3d55 a1b2c3d4 --relation implements
✓ Linked b4dc3d55 → a1b2c3d4 (implements)

# End of session - review
$ substrate digest
Added in last 8 hours:
- [constraint] Auth tokens expire after 24h
```

## Troubleshooting

### Substrate command not found

Ensure Substrate is installed globally:

```bash
npm install -g substrate-cli
substrate --version
```

### AI not suggesting Substrate commands

Warp AI learns from your usage. The more you use Substrate commands, the better it suggests them.

### Context not syncing

```bash
substrate auth status
substrate sync status
```

## Resources

- [Warp Documentation](https://docs.warp.dev)
- [Warp AI Features](https://www.warp.dev/warp-ai)
- [Substrate CLI Reference](cli-reference.md)
