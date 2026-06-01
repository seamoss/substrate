# Substrate plugin for Claude Code

Brings [Substrate](../../README.md) context management into Claude Code:

- **Asks once per project** (at session start) whether to track context with Substrate.
- **Captures durable knowledge** — decisions, constraints, conventions — into committed
  `.substrate/` files via the `capture-context` skill.
- **Registers the Substrate MCP server** so the agent can read/write context natively.

## Prerequisite

The `substrate` CLI must be installed and on `PATH`:

```bash
npm install -g substrate-cli
```

## Install

From this repo's marketplace:

```bash
/plugin marketplace add seamoss/substrate
/plugin install substrate@substrate
```

Or for local development against a checkout:

```bash
claude --plugin-dir ./plugins/substrate
# after edits: /reload-plugins
```

## How it works

### Ask-before-track (SessionStart)

Claude Code hooks can't prompt interactively, so the `SessionStart` hook
(`hooks/session-start.sh`) inspects the project and injects guidance for the agent:

| Project state                    | Behavior                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.substrate/config.json` present | Already tracked → inject capture guidance (and suggest `substrate sync pull` on fresh clones).                      |
| Path in `~/.substrate/optout`    | User declined here → stay silent.                                                                                   |
| Neither (fresh session only)     | Inject an instruction telling the agent to ask the user once, then run `/substrate:enable` or `/substrate:opt-out`. |

The decision persists per project: enabling writes the committed `.substrate/` files;
opting out appends the project path to `~/.substrate/optout` (per machine, never committed).

### Skills

| Skill             | Invocation           | Purpose                                                                               |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `capture-context` | model-invoked        | When/how to record context (`substrate add`, `--private`, `sync push`).               |
| `enable`          | `/substrate:enable`  | Set up tracking: `substrate init` (or `sync pull`) + `substrate config strategy mcp`. |
| `opt-out`         | `/substrate:opt-out` | Record a per-machine opt-out so the prompt stops.                                     |

### MCP server

`.mcp.json` registers `substrate mcp serve` (stdio). The CLI's MCP server requires the
global strategy to be `mcp`; the `enable` skill runs `substrate config strategy mcp` to
satisfy this. Until then the server won't start (the instruction-mode skills still work
by running `substrate` shell commands).

## Other agents (Codex, Cursor, …)

This plugin targets Claude Code. For other agents, install the `substrate` CLI and point
them at `substrate brief --format agent` / the MCP server; the `capture-context` guidance
above applies as plain instructions.
