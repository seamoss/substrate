# Getting Started

This guide walks you through installing Substrate and creating your first workspace.

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

### Install via npm

```bash
npm install -g substrate-cli
```

### Or from source

```bash
git clone <repo-url> substrate
cd substrate/cli
npm install
npm link
```

This installs the `substrate` command globally.

There are no accounts to create — Substrate stores context in committed
`.substrate/` files and uses git to share it. See [Sync & Sharing](sync.md).

## Create Your First Workspace

### Initialize a Workspace

```bash
cd ~/projects/myproject
substrate init myproject
```

This:

1. Creates a workspace named "myproject"
2. Generates a unique project ID (UUID)
3. Saves config to `.substrate/config.json`
4. Writes the initial `.substrate/` files, ready to commit with git

### Add Context

Add different types of context:

```bash
# Hard rules (highest priority)
substrate add "Never store passwords in plain text" --type constraint

# Architectural decisions
substrate add "Using REST over GraphQL for simplicity" --type decision

# General notes
substrate add "Frontend team prefers Tailwind CSS" --type note

# With tags for filtering
substrate add "Rate limit: 100 req/min per user" --type constraint --tag api --tag security
```

### View Context

```bash
# List recent context
substrate ls

# Filter by type
substrate ls --type constraint

# Filter by tag
substrate ls --tag api

# Get full context brief
substrate brief --format agent

# Alternative formats
substrate brief --format claudemd  # Output for CLAUDE.md injection
substrate brief --budget medium    # Token-budgeted output (~8K tokens)
```

## Working with Multiple Directories

### Mount Additional Directories

```bash
# Mount another repo to the same workspace
cd ~/projects/api-service
substrate mount add . --workspace myproject

# Check mount status
substrate mount status
substrate mount list
```

### Scoped Context

Add context that only applies to specific paths:

```bash
substrate add "Use snake_case for API fields" --type constraint --scope "src/api/*"
```

## Linking Context

Create relationships between context objects:

```bash
# List context to get IDs
substrate ls
# Output shows short IDs like: abc123, def456

# Link related items
substrate link add abc123 def456 --relation implements
substrate link add abc123 ghi789 --relation depends_on

# View links
substrate link list abc123

# Explore related context
substrate related abc123 --depth 2
```

**Relation types:** `relates_to`, `depends_on`, `blocks`, `implements`, `extends`, `references`

## Syncing Context

Substrate stores context in committed `.substrate/` files and shares it through
git — there's no server. See [Sync & Sharing](sync.md) for the full model.

### Write Local Changes to Files

```bash
substrate sync push          # serialize the local cache into .substrate/ files
git add .substrate && git commit -m "Update context" && git push
```

### Load Teammates' Changes

```bash
git pull
substrate sync pull          # reconcile .substrate/ files into the local cache
```

### Check Sync Status

```bash
substrate sync status
```

### Personal vs shared context

Anything you add is **shared** (committed to `.substrate/context.jsonl`) by default.
Add `--private` to keep an item local to you — it's written to the sibling
`.substrate/context.priv.jsonl`, which is gitignored and never committed:

```bash
substrate add "My local DB runs on port 5544" --type note --private
```

## Team Collaboration

### Share Your Project

Commit the `.substrate/` directory; that's all a teammate needs. Your project ID
is in `.substrate/config.json`:

```bash
substrate project id
# Output: 550e8400-e29b-41d4-a716-446655440000
```

### Join an Existing Project

```bash
git clone <repo-url> && cd <repo>
substrate sync pull          # bootstraps a workspace from the committed files
```

## Using with AI Agents

### Quick Setup

```bash
substrate brief --format agent
```

Copy the output into your agent's system prompt, or set up editor-specific integration:

| Editor/Tool    | Guide                                        |
| -------------- | -------------------------------------------- |
| Claude Code    | [CLAUDE.md setup](claude-code.md)            |
| Cursor         | [.cursor/rules setup](cursor.md)             |
| Windsurf       | [.windsurf/rules setup](windsurf.md)         |
| GitHub Copilot | [copilot-instructions.md](github-copilot.md) |
| Zed            | [.rules file setup](zed.md)                  |
| Warp           | [AI terminal setup](warp.md)                 |

For native tool integration, use the MCP server:

```bash
substrate config strategy mcp
substrate mcp serve
```

See [Agent Integration](agent-integration.md) for MCP details.

## Session Workflow

### Capture Context as You Work

```bash
# After making a decision
substrate add "Chose PostgreSQL over MongoDB for ACID compliance" --type decision --tag database

# After discovering a constraint
substrate add "Legacy API requires XML responses" --type constraint --tag api
```

### Review Your Session

```bash
# What did I add in the last 8 hours?
substrate digest

# Expand time window
substrate digest --hours 24

# Search for specific topics
substrate recall "database"
substrate recall --type decision --hours 4
```

### Export Context

```bash
# Export to markdown
substrate dump

# Custom output path
substrate dump -o docs/CONTEXT.md
```

## Next Steps

- [CLI Reference](cli-reference.md) — Complete command documentation
- [Claude Code Setup](claude-code.md) — Using Substrate with Claude Code
- [Sync & Sharing](sync.md) — How git-backed sync works
- [Agent Integration](agent-integration.md) — MCP server setup
