# Authentication

Substrate uses a token-based authentication system designed for CLI-first workflows.

## Overview

Authentication in Substrate provides:

- **User identity** — Anonymous accounts, no email required
- **API keys** — Personal access tokens for CLI and scripts
- **Workspace tokens** — Scoped tokens for CI/CD and agents

## Quick Start

```bash
# Create an account and get your API key
substrate auth init

# Check your status
substrate auth status
```

That's it. Your credentials are saved to `~/.substrate/auth.json` and automatically used for all API requests.

## Authentication Flow

### 1. Initialize (Recommended)

```bash
substrate auth init
```

This creates an anonymous account and generates your first API key. No email required.

**Output:**

```
✓ Account created
→ User ID: user:abc123xyz

  Credentials saved to ~/.substrate/auth.json
  API key prefix: sub_fe613000
```

### 2. Verify Status

```bash
substrate auth status
```

**Output:**

```
✓ Authenticated
  User ID: user:abc123xyz
```

### 3. You're Ready

All subsequent CLI commands automatically include your API key.

## Credentials Storage

Credentials are stored in `~/.substrate/auth.json`:

```json
{
  "user_id": "user:abc123xyz",
  "api_key": "sub_fe6130001234567890abcdef12345678"
}
```

**Security notes:**

- This file contains your secret API key
- It has 0600 permissions (owner read/write only)
- Don't commit it to version control
- Don't share it

## API Keys

API keys are personal access tokens with full account access.

### Token Format

```
sub_<32 hex characters>
```

Example: `sub_fe6130001234567890abcdef12345678`

The prefix `sub_` identifies it as a Substrate user token.

### Managing Keys

**List your keys:**

```bash
substrate auth keys list
```

**Create a new key:**

```bash
substrate auth keys create laptop
substrate auth keys create ci-server
substrate auth keys create backup
```

**Revoke a key:**

```bash
substrate auth keys revoke <key-id>
```

### Use Cases

- **Multiple devices** — Create a key for each machine
- **CI/CD pipelines** — Dedicated key for automation
- **Backup** — Keep a backup key in a password manager

## Workspace Tokens

Workspace tokens provide scoped access to a single workspace. Ideal for:

- CI/CD pipelines that only need one project
- AI agents with limited permissions
- Third-party integrations

### Token Format

```
sub_ws_<32 hex characters>
```

The prefix `sub_ws_` identifies it as a workspace-scoped token.

### Creating Workspace Tokens

```bash
# Full access (read + write)
substrate auth token create <workspace-id> deploy-bot

# Read-only access
substrate auth token create <workspace-id> monitoring --scope read

# Expiring token (30 days)
substrate auth token create <workspace-id> temp-access --expires 30
```

### Managing Workspace Tokens

**List tokens for a workspace:**

```bash
substrate auth token list <workspace-id>
```

**Revoke a token:**

```bash
substrate auth token revoke <token-id>
```

### Scope Options

| Scope        | Permissions                    |
| ------------ | ------------------------------ |
| `read`       | Read context, brief, sync pull |
| `read_write` | Full access (default)          |

## Using Tokens in CI/CD

### GitHub Actions

```yaml
env:
  SUBSTRATE_API_KEY: ${{ secrets.SUBSTRATE_TOKEN }}

steps:
  - name: Get context
    run: |
      echo "$SUBSTRATE_API_KEY" > ~/.substrate/auth.json
      substrate brief --compact
```

### Generic CI

```bash
# Store token in CI secrets, then:
mkdir -p ~/.substrate
echo '{"api_key":"'$SUBSTRATE_TOKEN'"}' > ~/.substrate/auth.json
substrate sync pull
```

## API Authentication

When making direct API requests, include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer sub_your_token_here" \
  https://substrate.heavystack.io/api/auth/me
```

## Logout

Clear local credentials:

```bash
substrate auth logout
```

This removes `~/.substrate/auth.json` but doesn't revoke the API key server-side. To fully revoke access, also run:

```bash
substrate auth keys list    # Find the key ID
substrate auth keys revoke <key-id>
```

## Security Best Practices

1. **Use workspace tokens for CI** — Don't use your personal API key
2. **Set expiration on temporary tokens** — Use `--expires` flag
3. **Use read-only scope when possible** — Principle of least privilege
4. **Rotate keys periodically** — Create new keys, revoke old ones
5. **Don't commit auth.json** — It's in `.gitignore` by default

## Troubleshooting

### "Not logged in"

```bash
substrate auth init
```

### "Invalid API key"

Your key may have been revoked. Create a new one:

```bash
substrate auth init --force
```

### "Not authorized for this workspace"

Workspace tokens can only access their assigned workspace. Use a personal API key or create a token for the correct workspace.

### Check API connectivity

```bash
curl https://substrate.heavystack.io/health
```
