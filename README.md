# Substrate

A shared context layer for humans and AI agents.

Substrate provides persistent, graph-backed context that syncs across contributors and devices through **git** — context lives in committed `.substrate/` files, with no server and no accounts.

## Why Substrate?

- **Agents lose context** between sessions. Substrate gives them deterministic retrieval.
- **Teams lose context** across repos and contributors. Substrate provides shared truth, versioned alongside the code.
- **Static docs rot**. Substrate context is structured and dynamic.
- **No server to run**. Sync rides on the git infrastructure you already have; identity and access control are your git host's.

## Install

```bash
npm install -g substrate-cli
```

Or from source:

```bash
git clone <repo-url> substrate
cd substrate/cli
npm install && npm link
```

## Quick Start

```bash
# Initialize a workspace (no account needed)
substrate init myproject

# Add context
substrate add "All API responses must be JSON" --type constraint
substrate add "Using PostgreSQL for persistence" --type decision
substrate add "My local DB runs on port 5544" --type note --private  # personal, not committed

# Share it: write the .substrate files, then commit with git
substrate sync push
git add .substrate && git commit -m "Add context" && git push

# Get context brief (for agents)
substrate brief --format agent
substrate brief --budget medium    # Token-aware output
```

## Core Concepts

| Concept       | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| **Workspace** | A shared context universe for a team or project               |
| **Mount**     | Binds a workspace to a local directory                        |
| **Context**   | Typed objects: constraints, decisions, notes, tasks, entities |
| **Links**     | Graph relationships between context objects                   |
| **Brief**     | Agent-optimized context retrieval                             |

## Context Types

| Type         | Priority | Use For                              |
| ------------ | -------- | ------------------------------------ |
| `constraint` | Highest  | Hard rules, immutable facts          |
| `decision`   | High     | Architectural choices with rationale |
| `note`       | Medium   | General knowledge                    |
| `task`       | Low      | Work items                           |
| `entity`     | Low      | Domain concepts                      |
| `runbook`    | Low      | Operational procedures               |
| `snippet`    | Low      | Canonical code patterns              |

## Example Workflow

```bash
# Working on a feature...
substrate add "Auth tokens expire after 24h" --type constraint --tag auth
substrate add "Using JWT for stateless auth" --type decision --tag auth

# Link related concepts
substrate ls                                    # Get IDs
substrate link add abc123 def456 --relation implements

# Later, or on another machine...
git pull && substrate sync pull                 # Reconcile committed context into the local cache
substrate brief --format agent                  # Rehydrate context

# Share with teammates
substrate sync push                             # Write the .substrate files
git add .substrate && git commit -m "..." && git push
```

## Documentation

- [Getting Started](docs/getting-started.md) — Installation and first steps
- [CLI Reference](docs/cli-reference.md) — Complete command documentation
- [Sync & Sharing](docs/sync.md) — Git-backed sync and the shared/private stores

### Editor & Tool Integrations

- [Claude Code plugin](plugins/substrate/README.md) — installable plugin: asks once per project to track context, captures decisions/constraints, and registers the MCP server
- [Claude Code](docs/claude-code.md) — CLAUDE.md integration
- [Cursor](docs/cursor.md) — .cursor/rules integration
- [Windsurf](docs/windsurf.md) — .windsurf/rules integration
- [GitHub Copilot](docs/github-copilot.md) — copilot-instructions.md integration
- [Zed](docs/zed.md) — .rules file integration
- [Warp](docs/warp.md) — AI terminal integration
- [MCP Server](docs/agent-integration.md) — Native tool integration

## License

MIT
