# CLI Reference

Complete documentation for the `substrate` command-line interface.

## Global Options

All commands support:

- `--help`, `-h` — Show help
- `--json` — Output as JSON (where applicable)

## Commands Overview

| Command   | Description                   |
| --------- | ----------------------------- |
| `init`    | Initialize a new workspace    |
| `add`     | Add context (shorthand)       |
| `ls`      | List context (shorthand)      |
| `status`  | Show mount status (shorthand) |
| `brief`   | Get context for agents        |
| `context` | Manage context objects        |
| `mount`   | Manage workspace mounts       |
| `link`    | Manage relationships          |
| `related` | Explore graph connections     |
| `sync`    | Sync with remote server       |
| `project` | Manage project identity       |
| `config`  | Manage configuration          |
| `mcp`     | MCP server for agents         |
| `auth`    | Manage authentication         |
| `session` | Manage work sessions          |
| `digest`  | Session summary               |
| `recall`  | Search history                |
| `extract` | Extract context from changes  |
| `dump`    | Export to markdown            |

---

## init

Initialize a new workspace in the current directory.

```bash
substrate init [name] [options]
```

**Arguments:**

- `name` — Workspace name (default: directory name)

**Options:**

- `-d, --description <text>` — Workspace description
- `--json` — Output as JSON

**Examples:**

```bash
substrate init myproject
substrate init myproject --description "Main API service"
```

**What it does:**

1. Creates a workspace with a unique project ID
2. Syncs workspace to remote server
3. Mounts current directory to workspace
4. Saves project ID to `.substrate/config.json`

---

## add

Add a context object (shorthand for `context add`).

```bash
substrate add <content> [options]
```

**Arguments:**

- `content` — The context content

**Options:**

- `-t, --type <type>` — Context type (default: `note`)
- `--tag <tags>` — Comma-separated tags
- `-s, --scope <scope>` — Scope path (default: `*`)
- `-f, --force` — Skip duplicate detection
- `-y, --yes` — Non-interactive mode (same as `--force`, for agent workflows)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Duplicate Detection:**

The CLI automatically checks for similar existing content. If a match is found (>70% similarity), you'll be warned. Use `--force` to add anyway.

**Context Types:**

- `constraint` — Hard rules, immutable facts
- `decision` — Architectural choices
- `note` — General knowledge
- `task` — Work items
- `entity` — Domain concepts
- `runbook` — Operational procedures
- `snippet` — Code patterns

**Examples:**

```bash
substrate add "All dates must be ISO 8601"
substrate add "Using UUID v4 for IDs" --type decision
substrate add "Rate limit is 100/min" --type constraint --tag api
substrate add "Only applies to payments" --scope "src/payments/*"
```

---

## ls

List context objects (shorthand for `context list`).

```bash
substrate ls [options]
```

**Options:**

- `-t, --type <type>` — Filter by type
- `--tag <tag>` — Filter by tag
- `-n, --limit <n>` — Limit results (default: 20)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Examples:**

```bash
substrate ls
substrate ls --type constraint
substrate ls --tag api --limit 50
substrate ls --json
```

---

## status

Show mount status for current directory (shorthand for `mount status`).

```bash
substrate status [dir] [options]
```

**Arguments:**

- `dir` — Directory to check (default: `.`)

**Options:**

- `--json` — Output as JSON

**Examples:**

```bash
substrate status
substrate status ~/projects/api
```

---

## brief

Get applicable context for agents.

```bash
substrate brief [path] [options]
```

**Arguments:**

- `path` — Path to get context for (default: current directory)

**Options:**

- `-f, --format <format>` — Output format: `default`, `agent`, `markdown`, `claudemd`
- `--compact` — Output prompt text only (legacy, use `--format`)
- `--budget <tokens>` — Token budget: number or preset (`small`=2K, `medium`=8K, `large`=32K, `xl`=100K)
- `--human` — Human-readable format with colors
- `--no-links` — Exclude relationship info
- `-t, --type <type>` — Filter by type
- `--tag <tags>` — Filter by tags
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON (default)

**Output Formats:**

- `default` — JSON with full context (default)
- `agent` — Optimized for AI agents with session info
- `markdown` — Clean markdown output
- `claudemd` — Formatted for direct injection into CLAUDE.md files

**Token Budgets:**

When `--budget` is specified, items are ranked by a priority score (type weight, recency, link density, scope relevance, tag matching) and included until the budget is exhausted. Constraints are always included. Items that don't fit are summarized in an overflow section.

```bash
substrate brief --budget small     # ~2,000 tokens
substrate brief --budget medium    # ~8,000 tokens
substrate brief --budget large     # ~32,000 tokens
substrate brief --budget xl        # ~100,000 tokens
substrate brief --budget 5000      # Custom token count
```

**Examples:**

```bash
substrate brief                        # JSON output
substrate brief --format agent         # Agent-optimized output
substrate brief --format markdown      # Clean markdown
substrate brief --format claudemd      # For CLAUDE.md injection
substrate brief --compact              # Plain text for prompts
substrate brief --budget medium        # Token-budgeted output
substrate brief --human                # Readable format with colors
substrate brief --tag api,auth         # Filter by tags
```

**Agent Format Output:**

The `--format agent` output includes:

- Active session status (if any)
- Prioritized sections (constraints first)
- Quick command reference

**Budget Footer:**

When using `--budget`, the output includes a footer showing token usage:

```
---
2,450/8,000 tokens | 12/18 items
```

---

## context

Manage context objects.

### context add

```bash
substrate context add <content> [options]
```

Same as `substrate add`. See above.

### context list

```bash
substrate context list [options]
```

Same as `substrate ls`. See above.

---

## mount

Manage workspace mounts.

### mount add

Mount a directory to a workspace.

```bash
substrate mount add <dir> [options]
```

**Arguments:**

- `dir` — Directory to mount

**Options:**

- `-w, --workspace <name>` — Workspace name (required)
- `-s, --scope <path>` — Scope within directory (default: `*`)
- `-t, --tags <tags>` — Comma-separated tags
- `--json` — Output as JSON

**Examples:**

```bash
substrate mount add . --workspace myproject
substrate mount add ./api --workspace platform --scope "src/*"
```

### mount status

Show mount status.

```bash
substrate mount status [dir] [options]
```

### mount list

List all mounts.

```bash
substrate mount list [options]
substrate mount ls [options]
```

### mount remove

Remove a mount.

```bash
substrate mount remove <path> [options]
substrate mount rm <path> [options]
```

---

## link

Manage relationships between context objects.

### link add

Create a link between two context objects.

```bash
substrate link add <from> <to> [options]
```

**Arguments:**

- `from` — Source context ID (short ID)
- `to` — Target context ID (short ID)

**Options:**

- `-r, --relation <type>` — Relation type (default: `relates_to`)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Relation types:**

- `relates_to` — General relationship
- `depends_on` — Dependency
- `blocks` — Blocking relationship
- `implements` — Implementation
- `extends` — Extension
- `references` — Reference

**Examples:**

```bash
substrate link add abc123 def456
substrate link add abc123 def456 --relation implements
```

### link list

List links.

```bash
substrate link list [id] [options]
substrate link ls [id] [options]
```

**Arguments:**

- `id` — Context ID to show links for (optional, shows all if omitted)

### link remove

Remove a link.

```bash
substrate link remove <from> <to> [options]
substrate link rm <from> <to> [options]
```

---

## related

Explore related context using graph traversal.

```bash
substrate related <id> [options]
```

**Arguments:**

- `id` — Context ID to explore from

**Options:**

- `-d, --depth <n>` — Traversal depth, 1-2 (default: 1)
- `-w, --workspace <name>` — Workspace name
- `--local` — Use local cache only
- `--json` — Output as JSON

**Examples:**

```bash
substrate related abc123
substrate related abc123 --depth 2
substrate related abc123 --local
```

---

## sync

Sync local context with remote server.

```bash
substrate sync [options]
```

**Options:**

- `-w, --workspace <name>` — Workspace name
- `-v, --verbose` — Show detailed output
- `--json` — Output as JSON

Running `substrate sync` without a subcommand does bidirectional sync (push then pull).

### sync status

Show sync status.

```bash
substrate sync status [options]
```

### sync push

Push local changes to remote.

```bash
substrate sync push [options]
```

### sync pull

Pull remote changes to local.

```bash
substrate sync pull [options]
```

---

## project

Manage project identity and pinning.

### project id

Show current project ID.

```bash
substrate project id [options]
```

### project info

Show project details and sync status.

```bash
substrate project info [options]
```

### project pin

Pin directory to an existing project.

```bash
substrate project pin <id> [options]
```

**Arguments:**

- `id` — Project ID (UUID) to pin to

**Options:**

- `--force` — Overwrite existing config

### project unpin

Remove project pinning.

```bash
substrate project unpin [options]
```

**Options:**

- `--delete-local` — Also delete local workspace data

---

## config

Manage Substrate configuration.

### config show

Show current configuration.

```bash
substrate config show [options]
```

### config strategy

Set agent integration strategy.

```bash
substrate config strategy <mode>
```

**Modes:**

- `instructions` — Agent reads CLAUDE.md and runs CLI
- `mcp` — Agent uses native MCP tools

### config get

Get a specific config value.

```bash
substrate config get <key>
```

### config set

Set a config value.

```bash
substrate config set <key> <value>
```

---

## mcp

MCP server (v0.2.0) for native agent integration. Provides 9 tools and 3 resources.

### mcp serve

Start the MCP server.

```bash
substrate mcp serve
```

Use with Claude Code or other MCP-compatible agents.

### mcp status

Check MCP configuration status.

```bash
substrate mcp status
```

### MCP Tools

| Tool                | Description                                   |
| ------------------- | --------------------------------------------- |
| `substrate_brief`   | Get project context (supports `token_budget`) |
| `substrate_add`     | Add a context object                          |
| `substrate_search`  | Full-text search across all context           |
| `substrate_recall`  | Time-windowed search (legacy, wraps search)   |
| `substrate_digest`  | Session summary                               |
| `substrate_link`    | Create relationship links                     |
| `substrate_session` | Start/end/status work sessions                |
| `substrate_update`  | Update existing context by short ID           |
| `substrate_delete`  | Soft-delete context by short ID               |

### MCP Resources

| URI                               | Description                       |
| --------------------------------- | --------------------------------- |
| `substrate://workspace/current`   | Current workspace info            |
| `substrate://context/constraints` | All constraints (immutable facts) |
| `substrate://session/active`      | Active session info and stats     |

---

## auth

Manage authentication.

### auth init

Initialize authentication (primary method).

```bash
substrate auth init [options]
```

**Options:**

- `--force` — Overwrite existing credentials
- `--json` — Output as JSON

Creates an anonymous account and API key, saved to `~/.substrate/auth.json`.

### auth status

Show current auth status.

```bash
substrate auth status [options]
```

### auth logout

Clear local credentials.

```bash
substrate auth logout [options]
```

### auth keys

Manage API keys.

```bash
substrate auth keys list          # List your API keys
substrate auth keys create <name> # Create new key
substrate auth keys revoke <id>   # Revoke a key
```

### auth token

Manage workspace tokens (for CI/agents).

```bash
substrate auth token create <workspace> <name> [options]
substrate auth token list <workspace>
substrate auth token revoke <id>
```

**Options for create:**

- `-s, --scope <scope>` — `read` or `read_write` (default: `read_write`)
- `-e, --expires <days>` — Expiration in days

See [Authentication](authentication.md) for details.

---

## session

Manage work sessions for tracking agent activity.

### session start

Start a new work session.

```bash
substrate session start [name] [options]
```

**Arguments:**

- `name` — Optional session name

**Options:**

- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Examples:**

```bash
substrate session start
substrate session start "implementing auth"
substrate session start "bug-fix-123" --workspace myproject
```

### session end

End the current work session.

```bash
substrate session end [options]
```

**Options:**

- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

Shows session statistics including:

- Duration
- Context items added during the session
- Links created

### session status

Show current session status.

```bash
substrate session status [options]
```

**Options:**

- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

### session list

List recent sessions.

```bash
substrate session list [options]
substrate session ls [options]
```

**Options:**

- `-n, --limit <n>` — Number of sessions to show (default: 10)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

---

## digest

Summarize context added in current session.

```bash
substrate digest [options]
```

**Options:**

- `--hours <n>` — Time window (default: 8)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Examples:**

```bash
substrate digest              # Last 8 hours
substrate digest --hours 24   # Last 24 hours
```

---

## recall

Search and recall context from history. Uses FTS5 full-text search for ranked results when a query is provided.

```bash
substrate recall [query] [options]
```

**Arguments:**

- `query` — Search query (optional)

**Options:**

- `-t, --type <type>` — Filter by type
- `--hours <n>` — Time window (default: 24)
- `-n, --limit <n>` — Limit results (default: 10)
- `-w, --workspace <name>` — Workspace name
- `--json` — Output as JSON

**Examples:**

```bash
substrate recall "database"
substrate recall --type decision
substrate recall "auth" --hours 48
```

---

## extract

Extract context suggestions from work or show extraction checklist.

### extract checklist

Show extraction checklist (default action).

```bash
substrate extract
substrate extract checklist [options]
```

**Options:**

- `--json` — Output as JSON

Use after completing work to ensure important context is captured.

### extract diff

Analyze git diff and suggest context to extract.

```bash
substrate extract diff [options]
```

**Options:**

- `--staged` — Analyze staged changes only
- `--json` — Output as JSON

**Examples:**

```bash
substrate extract diff              # Analyze all uncommitted changes
substrate extract diff --staged     # Analyze only staged changes
```

The command analyzes changed files and suggests context based on:

- File types (config, test, schema, API, migration)
- Change size (large changes prompt architectural decisions)
- New files added

### extract commit

Analyze a specific commit and suggest context to extract.

```bash
substrate extract commit [hash] [options]
```

**Arguments:**

- `hash` — Commit hash (optional, shows recent commits if omitted)

**Options:**

- `--json` — Output as JSON

**Examples:**

```bash
substrate extract commit              # List recent commits
substrate extract commit abc123       # Analyze specific commit
```

---

## dump

Export all project context to a markdown file.

```bash
substrate dump [options]
```

**Options:**

- `-o, --output <path>` — Output file (default: `.substrate/CONTEXT.md`)
- `--flat` — Flat list without sections
- `--no-links` — Exclude relationships
- `-w, --workspace <name>` — Workspace name

**Examples:**

```bash
substrate dump
substrate dump -o docs/CONTEXT.md
substrate dump --flat --no-links
```

---

## Environment Variables

| Variable            | Description    | Default                 |
| ------------------- | -------------- | ----------------------- |
| `SUBSTRATE_API_URL` | API server URL | `http://localhost:3000` |

---

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0    | Success |
| 1    | Error   |

---

## Configuration Files

| File                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `~/.substrate/auth.json`   | Authentication credentials        |
| `~/.substrate/config.json` | Global configuration              |
| `~/.substrate/log`         | Global audit log                  |
| `.substrate/config.json`   | Project-level config (project ID) |
| `.substrate/log`           | Project-level audit log           |
