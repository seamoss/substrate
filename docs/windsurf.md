# Using Substrate with Windsurf

This guide explains how to integrate Substrate with [Windsurf](https://windsurf.com), Codeium's AI-powered editor.

## Overview

Windsurf uses a rules system similar to Cursor. Rules are stored in `.windsurf/rules/` and provide persistent instructions to Cascade (Windsurf's AI).

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

### 3. Create Windsurf Rules

Create `.windsurf/rules/substrate.md` in your project:

```markdown
# Substrate Context Protocol

This project uses Substrate for persistent context management.

## On Session Start

**Always run this command first** to load project context:

```bash
substrate brief --compact
```

Read and internalize all constraints and decisions before proceeding with any work.

## During Work

When you discover or establish any of the following, capture it immediately:

| Discovery | Command |
|-----------|---------|
| Hard rule or constraint | `substrate add "..." --type constraint` |
| Architecture decision | `substrate add "..." --type decision` |
| Important context | `substrate add "..." --type note` |
| Related concepts | `substrate link add <id1> <id2>` |

Use tags to categorize: `--tag api`, `--tag auth`, `--tag database`

## On Task Completion

After completing significant work:
1. Capture any implicit constraints that should be explicit
2. Document decisions made (with brief rationale)
3. Link related concepts

## Quick Reference

```bash
substrate brief --compact    # Load context (START HERE)
substrate add "..." -t TYPE  # Save context
substrate ls                 # List recent context
substrate ls --tag api       # Filter by tag
substrate link add X Y       # Link related items
substrate digest             # What was added this session
substrate recall "query"     # Search history
```
```

## How It Works

1. Windsurf loads rules from `.windsurf/rules/` when you open the project
2. Cascade sees the instruction to run `substrate brief --compact`
3. Context is loaded and Cascade follows stored constraints/decisions
4. During work, Cascade captures new discoveries with `substrate add`

## Rule Activation Modes

Windsurf supports different activation modes for rules:

### Always Active (Recommended for Substrate)

The rule applies to all Cascade interactions:

```markdown
---
trigger: always
---

# Substrate Context Protocol
...
```

### Model Decision

Cascade decides when to apply the rule based on your description:

```markdown
---
trigger: model
description: Use when working on code that may have architectural constraints or decisions
---

# Substrate Context Protocol
...
```

## Tips

### Define Your Tag Taxonomy

Include project-specific tags in the rules:

```markdown
## Project Tags

Use these tags consistently:
- `api` — API endpoints and contracts
- `auth` — Authentication and authorization
- `db` — Database schema and queries
- `ui` — Frontend components
- `infra` — Infrastructure and deployment
- `security` — Security requirements
```

### Create Scoped Rules

For large projects, create rules scoped to specific directories:

```markdown
---
trigger: glob
globs:
  - src/api/**
  - src/routes/**
---

# API Development Rules

When working on API files:

1. Check API-specific context first:
   ```bash
   substrate ls --tag api
   ```

2. After adding/modifying endpoints, capture:
   ```bash
   substrate add "POST /users requires auth token" --type constraint --tag api
   ```
```

### Combine with Memories

Windsurf's Memories system complements Substrate:
- **Substrate**: Shared team context, version-controlled
- **Memories**: Personal preferences, auto-generated

## Character Limits

Windsurf has limits on rule content:
- Individual rules: 6,000 characters max
- Combined rules: 12,000 characters max

Keep your Substrate rules concise. The actual context lives in Substrate, not the rules file.

## Verifying It Works

Start a new Windsurf session and ask Cascade:

```
What project constraints and decisions should I know about?
```

Cascade should run `substrate brief --compact` and summarize the context.

## Troubleshooting

### Cascade isn't following the rules

1. Check the file is in `.windsurf/rules/` with `.md` extension
2. Click the Customizations icon → Rules to verify it's loaded
3. Check the trigger mode is appropriate

### Context not loading

```bash
substrate auth status    # Check authentication
substrate status         # Check workspace mount
```

### Rules truncated

If you're hitting character limits, keep the Substrate rule minimal:

```markdown
# Substrate

Run `substrate brief --compact` at session start.
Capture context with `substrate add "..." --type TYPE --tag TAG`.
```

## Resources

- [Windsurf Rules Documentation](https://docs.windsurf.com)
- [Windsurf Rules Directory](https://windsurf.com/editor/directory)
- [Substrate CLI Reference](cli-reference.md)
