# Agent Integration

Substrate provides two strategies for integrating with AI agents: **MCP Server** for native tool integration, and **Instructions Protocol** for any agent that can run shell commands.

## Strategy Overview

| Strategy         | Best For                           | How It Works                    |
| ---------------- | ---------------------------------- | ------------------------------- |
| **MCP**          | Claude Code, MCP-compatible agents | Native tools, no shell commands |
| **Instructions** | Any agent                          | Agent reads protocol, runs CLI  |

Check your current strategy:

```bash
substrate config show
```

Switch strategies:

```bash
substrate config strategy mcp          # Use MCP tools
substrate config strategy instructions # Use CLI commands
```

---

## MCP Server (Recommended)

The MCP (Model Context Protocol) server exposes Substrate functionality as native tools that agents can call directly.

### Setup

1. **Enable MCP mode:**

   ```bash
   substrate config strategy mcp
   ```

2. **Start the server:**

   ```bash
   substrate mcp serve
   ```

3. **Configure your agent** to connect to the MCP server.

### Available Tools

| Tool               | Description               |
| ------------------ | ------------------------- |
| `substrate_brief`  | Get project context       |
| `substrate_add`    | Add context object        |
| `substrate_recall` | Search context history    |
| `substrate_digest` | Session summary           |
| `substrate_link`   | Create relationship links |

### Claude Code Integration

Add to your Claude Code MCP configuration:

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

### Tool Schemas

**substrate_brief**

```json
{
  "name": "substrate_brief",
  "description": "Get project context for the current workspace",
  "parameters": {
    "compact": { "type": "boolean", "description": "Return plain text only" },
    "tags": { "type": "string", "description": "Filter by tags (comma-separated)" }
  }
}
```

**substrate_add**

```json
{
  "name": "substrate_add",
  "description": "Add a context object",
  "parameters": {
    "content": { "type": "string", "required": true },
    "type": { "type": "string", "enum": ["note", "constraint", "decision", "task", "entity"] },
    "tags": { "type": "string", "description": "Comma-separated tags" }
  }
}
```

**substrate_recall**

```json
{
  "name": "substrate_recall",
  "description": "Search context history",
  "parameters": {
    "query": { "type": "string" },
    "type": { "type": "string" },
    "hours": { "type": "number" }
  }
}
```

**substrate_digest**

```json
{
  "name": "substrate_digest",
  "description": "Get summary of recent context additions",
  "parameters": {
    "hours": { "type": "number", "default": 8 }
  }
}
```

**substrate_link**

```json
{
  "name": "substrate_link",
  "description": "Create a link between context objects",
  "parameters": {
    "from": { "type": "string", "required": true },
    "to": { "type": "string", "required": true },
    "relation": {
      "type": "string",
      "enum": ["relates_to", "depends_on", "blocks", "implements", "extends", "references"]
    }
  }
}
```

---

## Instructions Protocol

For agents without MCP support, use the instructions protocol. The agent reads instructions from CLAUDE.md and executes CLI commands.

### Setup

1. **Enable instructions mode:**

   ```bash
   substrate config strategy instructions
   ```

2. **Include protocol in agent context** — The protocol is in CLAUDE.md

### Agent Protocol

Include these instructions in your agent's system prompt or context file:

```markdown
## Substrate Protocol

This project uses Substrate for persistent context. Follow this protocol:

### On Session Start

Run `substrate brief --compact` to load project context.
Internalize constraints and decisions before proceeding.

### During Work

Capture discoveries immediately:

| Discovery    | Command                                 |
| ------------ | --------------------------------------- |
| Hard rule    | `substrate add "..." --type constraint` |
| Decision     | `substrate add "..." --type decision`   |
| Context      | `substrate add "..." --type note`       |
| Relationship | `substrate link add <id1> <id2>`        |

### On Task Completion

1. Run `substrate extract` for checklist
2. Capture implicit constraints
3. Document decisions with rationale
4. Link related concepts

### Quick Reference
```

substrate brief --compact # Load context
substrate add "..." -t TYPE # Save context
substrate ls # List recent
substrate link add X Y # Link items
substrate digest # Session summary
substrate recall "query" # Search history

```

```

### Example Agent Behavior

**Good — Agent loads context first:**

```
User: Help me add authentication

Agent: Let me first check the project context.
> substrate brief --compact

I see there are constraints about security and a decision to use JWT.
Based on this context, I'll implement authentication using...
```

**Good — Agent captures decisions:**

```
Agent: I've decided to use bcrypt for password hashing because...
> substrate add "Using bcrypt for password hashing - industry standard, configurable work factor" --type decision --tag auth
```

---

## Context Priority

Agents should prioritize context types:

1. **Constraints** — Treat as immutable facts
2. **Decisions** — Respect unless explicitly changing
3. **Notes** — Background information

Example brief output:

```markdown
## Project Context: myproject

### Constraints (treat as immutable facts)

- All API responses must be JSON
- Never store passwords in plain text
- Rate limit: 100 req/min per user

### Decisions (architectural choices made)

- Using PostgreSQL for ACID compliance
- JWT tokens for stateless auth
  → implements: API is stateless

### Notes

- Frontend team prefers Tailwind
- Deployment is on AWS ECS
```

---

## Session Recovery

If an agent session is interrupted:

```bash
# What was captured before crash?
substrate digest --hours 2

# What was discussed about X?
substrate recall "authentication"

# Full context refresh
substrate brief --compact
```

---

## Multi-Agent Scenarios

### Shared Workspace

Multiple agents can share context through a common workspace:

```bash
# Agent 1 adds context
substrate add "API rate limiting implemented" --type note --tag api

# Agent 2 sees it immediately
substrate brief --compact
```

### Workspace Tokens for Agents

Create dedicated tokens for each agent:

```bash
# Read-only agent (monitoring, reporting)
substrate auth token create myworkspace analytics-bot --scope read

# Read-write agent (development)
substrate auth token create myworkspace dev-agent --scope read_write
```

---

## Best Practices

### For MCP Integration

1. Start with `substrate_brief` to load context
2. Use `substrate_add` for discoveries during work
3. Call `substrate_digest` to review session additions
4. Use `substrate_link` to connect related concepts

### For Instructions Protocol

1. Always run `substrate brief --compact` at session start
2. Capture context immediately when discovered
3. Use tags consistently for categorization
4. Run `substrate extract` before ending sessions

### Context Quality

- **Be specific** — "Auth tokens expire after 24 hours" not "tokens expire"
- **Include rationale** — "Using Postgres for ACID compliance"
- **Use appropriate types** — Constraints for rules, decisions for choices
- **Tag consistently** — `--tag auth,security` for searchability

---

## Troubleshooting

### MCP server not responding

```bash
substrate mcp status
# Check if mode is enabled

substrate mcp serve
# Start server manually to see errors
```

### Agent not seeing context

```bash
substrate brief --compact
# Verify context exists

substrate status
# Verify workspace is mounted
```

### Agent adding too much context

Set guidelines in your prompt:

- Only capture non-obvious information
- Avoid duplicating existing constraints
- Focus on project-specific knowledge
