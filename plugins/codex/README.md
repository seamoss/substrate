# Substrate for Codex & other agents

A portable way to give non–Claude-Code agents the same behavior as the
[Claude Code plugin](../substrate/README.md): ask once per project whether to track
context with Substrate, then capture decisions/constraints into committed `.substrate/`
files.

Claude Code has hooks and skills, so it gets a real plugin. Codex, Cursor, Windsurf, and
other agents instead read an instructions file at session start — so the same protocol
ships as [`AGENTS.md`](./AGENTS.md).

## Install

**Prerequisite:** `npm install -g substrate-cli`

### Codex (and anything that reads `AGENTS.md`)

Copy the protocol into your project's `AGENTS.md` (create it if absent):

```bash
cat path/to/substrate/plugins/codex/AGENTS.md >> AGENTS.md
```

### Cursor / Windsurf / Zed / etc.

Paste the "Substrate context protocol" section of [`AGENTS.md`](./AGENTS.md) into that
tool's rules file (`.cursor/rules`, `.windsurf/rules`, `.rules`, …). See the per-editor
guides in [`../../docs/`](../../docs/).

## MCP server (optional, native tools)

Agents that support MCP can use the Substrate server directly instead of shelling out.
The CLI's server requires the global strategy to be `mcp`:

```bash
substrate config strategy mcp
```

**Codex** — in `~/.codex/config.toml`:

```toml
[mcp_servers.substrate]
command = "substrate"
args = ["mcp", "serve"]
```

**Generic MCP client** — JSON form:

```json
{
  "mcpServers": {
    "substrate": { "command": "substrate", "args": ["mcp", "serve"] }
  }
}
```

## How "ask once" persists without hooks

These agents can't run a SessionStart hook, so persistence is file-based and lives in the
instructions: a tracked project has `.substrate/config.json`; a declined project gets a
`.substrate-optout` marker. The agent checks both before asking, so it only asks once.
