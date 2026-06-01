# Agent Integration

Substrate provides two strategies for integrating with AI agents: **Instructions** (CLI-based) and **MCP** (native tools). This guide helps you choose the right strategy and set it up.

## Which Strategy Should I Use?

### Quick Decision Guide

| If you're using...                    | Recommended Strategy |
| ------------------------------------- | -------------------- |
| Claude Code (CLI)                     | **Instructions**     |
| Claude Desktop with MCP support       | **MCP**              |
| Cursor                                | **Instructions**     |
| Windsurf                              | **Instructions**     |
| GitHub Copilot                        | **Instructions**     |
| Zed                                   | **Instructions**     |
| Custom agent with MCP support         | **MCP**              |
| Any agent that can run shell commands | **Instructions**     |

### Strategy Comparison

| Aspect                | Instructions                 | MCP                            |
| --------------------- | ---------------------------- | ------------------------------ |
| **Setup complexity**  | Simple (just CLAUDE.md)      | Requires MCP server config     |
| **Works with**        | Any agent with shell access  | Only MCP-compatible agents     |
| **Context loading**   | Agent runs `substrate brief` | Agent calls `substrate_brief`  |
| **Reliability**       | Very reliable                | Depends on MCP implementation  |
| **Visibility**        | Commands visible in output   | Tools called silently          |
| **CLAUDE.md needed?** | Yes                          | Optional (can remove protocol) |

### When to Use Instructions (Recommended for Most Users)

Use **Instructions** if:

- You want maximum compatibility across different AI tools
- You're using Claude Code, Cursor, Windsurf, or similar IDE integrations
- You want to see exactly what commands the agent runs
- You prefer explicit agent behavior over implicit tool calls
- You're just getting started with Substrate

### When to Use MCP

Use **MCP** if:

- You're building a custom agent that supports MCP natively
- You want the cleanest possible agent interface (no shell commands in output)
- You're using Claude Desktop with MCP server support
- You understand MCP and want tighter integration

---

## Instructions Strategy (Default)

The agent reads instructions from your `CLAUDE.md` file and executes CLI commands.

### Setup

1. **Verify strategy is set (it's the default):**

   ```bash
   substrate config show
   # Strategy: instructions
   ```

2. **Add protocol to your CLAUDE.md:**

   ````markdown
   ## Substrate Protocol

   This project uses Substrate for persistent context.

   ### On Session Start

   ```bash
   substrate brief --format agent
   ```
   ````

   ### During Work

   | Discovery | Command                                 |
   | --------- | --------------------------------------- |
   | Hard rule | `substrate add "..." --type constraint` |
   | Decision  | `substrate add "..." --type decision`   |
   | Context   | `substrate add "..." --type note`       |

   ### Session Tracking

   ```bash
   substrate session start "task-name"  # Start tracking
   substrate session end                 # End with summary
   ```

   ### Quick Reference

   ```bash
   substrate brief --format agent  # Load context
   substrate add "..." -t TYPE     # Save context
   substrate ls                    # List recent
   substrate extract diff          # Review changes for context
   substrate session status        # Check session
   ```

   ```

   ```

3. **Initialize your workspace:**

   ```bash
   substrate init myproject
   ```

### How It Works

1. Agent reads `CLAUDE.md` at session start
2. Agent runs `substrate brief --format agent` to load context
3. During work, agent captures discoveries with `substrate add`
4. Context persists across sessions

### Output Formats

The `brief` command supports multiple formats:

```bash
substrate brief                        # JSON (default)
substrate brief --format agent         # Optimized for AI agents
substrate brief --format markdown      # Clean markdown
substrate brief --format claudemd      # For CLAUDE.md injection
substrate brief --compact              # Plain text prompt
substrate brief --budget medium        # Token-budgeted output (~8K tokens)
substrate brief --human                # Human-readable with colors
```

The `--format agent` output includes:

- Active session information
- Prioritized context sections (constraints first)
- Quick command reference for the agent

---

## MCP Strategy

The MCP server exposes Substrate as native tools that agents can call directly.

### Setup

1. **Enable MCP mode:**

   ```bash
   substrate config strategy mcp
   ```

2. **Configure your MCP client.** For Claude Desktop, add to your config:

   ```json
   {
     "mcpServers": {
       "substrate": {
         "command": "substrate",
         "args": ["mcp", "serve"]
       }
     }
   }
   ```

3. **Start the server** (if not auto-started):

   ```bash
   substrate mcp serve
   ```

### Available Tools (v0.2.0)

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

### MCP Tool Schemas

<details>
<summary>substrate_brief</summary>

```json
{
  "name": "substrate_brief",
  "description": "Get project context. Supports token budgets for efficient context window usage.",
  "parameters": {
    "path": { "type": "string", "description": "Path to get context for (default: cwd)" },
    "token_budget": {
      "type": "number",
      "description": "Max tokens (presets: 2000, 8000, 32000, 100000)"
    },
    "types": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter by context types"
    },
    "tags": { "type": "string", "description": "Comma-separated tag filter" }
  }
}
```

</details>

<details>
<summary>substrate_add</summary>

```json
{
  "name": "substrate_add",
  "description": "Add a context object",
  "parameters": {
    "content": { "type": "string", "required": true },
    "type": {
      "type": "string",
      "enum": ["note", "constraint", "decision", "task", "entity", "runbook", "snippet"]
    },
    "tags": { "type": "string", "description": "Comma-separated tags" },
    "scope": { "type": "string", "description": "Scope path pattern (default: *)" },
    "path": { "type": "string", "description": "Working directory path" }
  }
}
```

</details>

<details>
<summary>substrate_search</summary>

```json
{
  "name": "substrate_search",
  "description": "Full-text search across all context (FTS5-powered)",
  "parameters": {
    "query": { "type": "string", "description": "Search term" },
    "type": { "type": "string", "description": "Filter by type" },
    "tag": { "type": "string", "description": "Filter by tag" },
    "limit": { "type": "number", "description": "Max results (default: 20)" },
    "path": { "type": "string", "description": "Working directory path" }
  }
}
```

</details>

<details>
<summary>substrate_recall</summary>

```json
{
  "name": "substrate_recall",
  "description": "Search context from recent history (time-windowed)",
  "parameters": {
    "query": { "type": "string" },
    "type": { "type": "string" },
    "hours": { "type": "number", "description": "Hours to look back (default: 24)" },
    "limit": { "type": "number", "description": "Max results (default: 20)" },
    "path": { "type": "string" }
  }
}
```

</details>

<details>
<summary>substrate_digest</summary>

```json
{
  "name": "substrate_digest",
  "description": "Get summary of recent context additions",
  "parameters": {
    "hours": { "type": "number", "default": 8 },
    "path": { "type": "string" }
  }
}
```

</details>

<details>
<summary>substrate_link</summary>

```json
{
  "name": "substrate_link",
  "description": "Create a link between context objects",
  "parameters": {
    "from": { "type": "string", "required": true, "description": "Source context short ID" },
    "to": { "type": "string", "required": true, "description": "Target context short ID" },
    "relation": {
      "type": "string",
      "enum": ["relates_to", "depends_on", "blocks", "implements", "extends", "references"]
    },
    "path": { "type": "string" }
  }
}
```

</details>

<details>
<summary>substrate_session</summary>

```json
{
  "name": "substrate_session",
  "description": "Manage work sessions",
  "parameters": {
    "action": {
      "type": "string",
      "enum": ["start", "end", "status"],
      "description": "Session action"
    },
    "name": { "type": "string", "description": "Session name (for start)" },
    "path": { "type": "string" }
  }
}
```

</details>

<details>
<summary>substrate_update</summary>

```json
{
  "name": "substrate_update",
  "description": "Update an existing context object",
  "parameters": {
    "id": { "type": "string", "required": true, "description": "Context short ID" },
    "content": { "type": "string" },
    "type": { "type": "string" },
    "tags": { "type": "string", "description": "New comma-separated tags" },
    "scope": { "type": "string" },
    "path": { "type": "string" }
  }
}
```

</details>

<details>
<summary>substrate_delete</summary>

```json
{
  "name": "substrate_delete",
  "description": "Soft-delete a context object",
  "parameters": {
    "id": { "type": "string", "required": true, "description": "Context short ID" },
    "path": { "type": "string" }
  }
}
```

</details>

### What About CLAUDE.md?

When using MCP, you can:

- **Remove the Substrate protocol section** from CLAUDE.md (agent uses tools directly)
- **Keep it for fallback** (if MCP connection fails, agent can use CLI)
- **Simplify it** to just document the project, not the protocol

---

## Switching Strategies

### From Instructions to MCP

```bash
substrate config strategy mcp
```

Then optionally remove the Substrate protocol section from CLAUDE.md.

### From MCP to Instructions

```bash
substrate config strategy instructions
```

Then add the Substrate protocol to CLAUDE.md (see Instructions setup above).

---

## Session Tracking

Both strategies support session tracking to monitor agent activity:

```bash
# Start a session
substrate session start "implementing auth"

# Check status
substrate session status

# End session (shows stats)
substrate session end

# List recent sessions
substrate session list
```

Sessions track:

- Duration
- Context items added during the session
- Links created

---

## Context Extraction from Git

After completing work, extract context suggestions from your changes:

```bash
# Analyze uncommitted changes
substrate extract diff

# Analyze staged changes only
substrate extract diff --staged

# Analyze a specific commit
substrate extract commit abc123

# Show general extraction checklist
substrate extract checklist
```

The extract command analyzes changed files and suggests context to capture based on:

- File types (config, test, schema, API, migration)
- Change size
- New files added

---

## Context Priority

Agents should prioritize context by type:

1. **Constraints** — Immutable facts, treat as hard requirements
2. **Decisions** — Architectural choices, respect unless explicitly changing
3. **Notes** — Background information, helpful but not binding
4. **Tasks** — Active work items
5. **Entities** — Key domain concepts

---

## Best Practices

### For All Integrations

1. **Load context first** — Always get brief before starting work
2. **Capture immediately** — Don't wait until end of session
3. **Be specific** — "Auth tokens expire after 24h" not "tokens expire"
4. **Include rationale** — "Using Postgres for ACID compliance"
5. **Use tags consistently** — Define a taxonomy and stick to it

### For Instructions Strategy

1. Put the protocol near the top of CLAUDE.md
2. Include the quick reference section
3. Be explicit about what to capture
4. Consider using `--format agent` for cleaner output

### For MCP Strategy

1. Test the MCP connection before relying on it
2. Keep CLAUDE.md as fallback documentation
3. Use `substrate mcp status` to check server health

### Context Quality

Good context:

```bash
substrate add "API rate limit: 100 req/min per user, returns 429 with Retry-After header" --type constraint --tag api
```

Poor context:

```bash
substrate add "There's a rate limit" --type note
```

---

## Troubleshooting

### Agent isn't loading context

```bash
# Check workspace is set up
substrate status

# Verify context exists
substrate brief --compact

# Make sure the latest context is loaded into the cache
substrate sync pull
```

### MCP server not responding

```bash
# Check mode is enabled
substrate config show

# Start server manually to see errors
substrate mcp serve

# Check server status
substrate mcp status
```

### Agent adding duplicate context

The CLI now has duplicate detection built in:

```bash
# This will warn if similar content exists
substrate add "API responses must be JSON"

# Use --force or --yes to add anyway (--yes is better for agent workflows)
substrate add "API responses must be JSON" --force
substrate add "API responses must be JSON" --yes
```

### Context not syncing across team

Substrate shares context through committed `.substrate/` files — git is the
transport, so make sure everyone is pulling and pushing through git:

```bash
# Load teammates' changes (after git pull)
git pull
substrate sync pull

# Write your changes to the files, then commit with git
substrate sync push
git add .substrate && git commit -m "Update context" && git push

# Check what's present and pending
substrate sync status
```

---

## IDE-Specific Guides

For detailed setup instructions for your specific tool:

- [Claude Code](claude-code.md)
- [Cursor](cursor.md)
- [Windsurf](windsurf.md)
- [GitHub Copilot](github-copilot.md)
- [Zed](zed.md)
- [Warp](warp.md)
