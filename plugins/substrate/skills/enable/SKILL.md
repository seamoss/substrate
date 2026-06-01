---
description: Enable Substrate context tracking for the current project. Invoke only when the user has agreed to track this project's context with Substrate.
disable-model-invocation: true
---

# Enable Substrate for this project

The user agreed to track this project's context with Substrate. Set it up.

## Steps

1. Confirm the `substrate` CLI is installed:

   ```bash
   substrate --version
   ```

   If it is missing, tell the user to install it (`npm install -g substrate-cli`) and stop.

2. Initialize or attach, depending on whether the repo already carries context:
   - If a `.substrate/` directory already exists (e.g. a fresh clone of a project that
     already uses Substrate), load it into the local cache:
     ```bash
     substrate sync pull
     ```
   - Otherwise, create a new workspace named after the project directory:
     ```bash
     substrate init "<project-directory-name>"
     ```
     This writes the initial `.substrate/` files and adds `*.priv.jsonl` to `.gitignore`.

3. Enable the MCP integration so the bundled Substrate MCP server can run (it requires
   the global strategy to be `mcp`):

   ```bash
   substrate config strategy mcp
   ```

4. Report what happened and tell the user:
   - Newly initialized projects: commit the context —
     `git add .substrate && git commit -m "Add Substrate context" && git push`
   - The Substrate MCP server / `capture-context` skill will now record decisions and
     constraints as the project evolves.

Do not run any of these commands until the user has actually agreed.
