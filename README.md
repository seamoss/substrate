# Substrate

A shared context layer for humans and AI agents.

Substrate provides persistent, graph-backed context that syncs across contributors, devices, and projects—without polluting repositories with documentation files.

## Why Substrate?

- **Agents lose context** between sessions. Substrate gives them deterministic retrieval.
- **Teams lose context** across repos and contributors. Substrate provides shared truth.
- **Static docs rot**. Substrate context is dynamic and versioned.
- **Repos are siloed**. Substrate context spans multiple projects.

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
# Authenticate (creates anonymous account)
substrate auth init

# Initialize a workspace
substrate init myproject

# Add context
substrate add "All API responses must be JSON" --type constraint
substrate add "Using PostgreSQL for persistence" --type decision

# Get context brief (for agents)
substrate brief --compact
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
substrate brief --compact                       # Rehydrate context

# Share with teammates
substrate sync push                             # Push to remote
```

## Documentation

- [Getting Started](docs/getting-started.md) — Installation and first steps
- [CLI Reference](docs/cli-reference.md) — Complete command documentation
- [Authentication](docs/authentication.md) — Auth system and API keys

### Editor & Tool Integrations

- [Claude Code](docs/claude-code.md) — CLAUDE.md integration
- [Cursor](docs/cursor.md) — .cursor/rules integration
- [Windsurf](docs/windsurf.md) — .windsurf/rules integration
- [GitHub Copilot](docs/github-copilot.md) — copilot-instructions.md integration
- [Zed](docs/zed.md) — .rules file integration
- [Warp](docs/warp.md) — AI terminal integration
- [MCP Server](docs/agent-integration.md) — Native tool integration

## License

MIT
