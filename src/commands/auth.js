import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { api } from '../lib/api.js';
import { success, error, info, formatJson, dim } from '../lib/output.js';
import chalk from 'chalk';
import ora from 'ora';

const AUTH_FILE = join(homedir(), '.substrate', 'auth.json');

/**
 * Load saved auth credentials
 */
export function loadAuth() {
  try {
    if (existsSync(AUTH_FILE)) {
      return JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    }
  } catch (err) {
    // Ignore
  }
  return null;
}

/**
 * Save auth credentials
 */
function saveAuth(data) {
  const dir = join(homedir(), '.substrate');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

/**
 * Clear auth credentials
 */
function clearAuth() {
  if (existsSync(AUTH_FILE)) {
    unlinkSync(AUTH_FILE);
  }
}

export const authCommand = new Command('auth').description('Manage authentication');

// auth init (primary flow)
authCommand
  .command('init')
  .description('Initialize authentication (creates account and API key)')
  .option('--json', 'Output as JSON')
  .option('--force', 'Overwrite existing credentials')
  .action(async options => {
    const existing = loadAuth();

    if (existing?.api_key && !options.force) {
      if (options.json) {
        console.log(formatJson({ error: 'Already authenticated', user_id: existing.user_id }));
      } else {
        error('Already authenticated');
        info(`User ID: ${existing.user_id}`);
        dim('  Use --force to create a new account');
      }
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Creating account...').start();

    try {
      const result = await api.init();
      spinner?.stop();

      // Save credentials
      saveAuth({
        user_id: result.user.id,
        api_key: result.api_key.token
      });

      if (options.json) {
        console.log(formatJson({ ...result, api_key: { ...result.api_key, token: '[saved]' } }));
      } else {
        success('Account created');
        info(`User ID: ${result.user.id}`);
        console.log();
        dim('  Credentials saved to ~/.substrate/auth.json');
        dim(`  API key prefix: ${result.api_key.prefix}`);
      }
    } catch (err) {
      spinner?.stop();
      if (options.json) {
        console.log(formatJson({ error: err.message }));
      } else {
        error(err.message || 'Initialization failed');
      }
      process.exit(1);
    }
  });

// auth status
authCommand
  .command('status')
  .description('Show current auth status')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const auth = loadAuth();

    if (!auth?.api_key) {
      if (options.json) {
        console.log(formatJson({ authenticated: false }));
      } else {
        info('Not logged in');
        dim('  Run: substrate auth init');
      }
      return;
    }

    const spinner = options.json ? null : ora('Checking status...').start();

    try {
      const result = await api.me();
      spinner?.stop();

      if (options.json) {
        console.log(formatJson({ authenticated: true, ...result }));
      } else {
        if (result.user.email) {
          success(`Logged in as ${result.user.email}`);
        } else {
          success('Authenticated');
        }
        dim(`  User ID: ${result.user.id}`);
      }
    } catch (err) {
      spinner?.stop();
      if (options.json) {
        console.log(formatJson({ authenticated: false, error: err.message }));
      } else {
        error('Session invalid or expired');
        dim('  Run: substrate auth init --force');
      }
    }
  });

// auth logout
authCommand
  .command('logout')
  .description('Log out and clear credentials')
  .option('--json', 'Output as JSON')
  .action(options => {
    clearAuth();

    if (options.json) {
      console.log(formatJson({ logged_out: true }));
    } else {
      success('Logged out');
    }
  });

// auth keys (subcommand group)
const keysCommand = authCommand.command('keys').description('Manage API keys');

// auth keys list
keysCommand
  .command('list')
  .alias('ls')
  .description('List your API keys')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Loading keys...').start();

    try {
      const result = await api.listKeys();
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else if (result.keys.length === 0) {
        info('No API keys found');
      } else {
        console.log(chalk.bold('API Keys:'));
        console.log();
        result.keys.forEach(key => {
          console.log(`  ${chalk.cyan(key.key_prefix)}  ${key.name}`);
          if (key.last_used_at) {
            dim(`    Last used: ${key.last_used_at}`);
          }
        });
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to list keys');
      process.exit(1);
    }
  });

// auth keys create
keysCommand
  .command('create')
  .description('Create a new API key')
  .argument('<name>', 'Key name (e.g., "laptop", "ci")')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Creating key...').start();

    try {
      const result = await api.createKey(name);
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else {
        success(`Created API key "${name}"`);
        console.log();
        console.log(chalk.bold('  Token: ') + chalk.green(result.api_key.token));
        console.log();
        info('Save this token - it will only be shown once!');
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to create key');
      process.exit(1);
    }
  });

// auth keys revoke
keysCommand
  .command('revoke')
  .description('Revoke an API key')
  .argument('<id>', 'Key ID or prefix')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Revoking key...').start();

    try {
      const result = await api.revokeKey(id);
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else {
        success('API key revoked');
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to revoke key');
      process.exit(1);
    }
  });

// auth token (subcommand group for workspace tokens)
const tokenCommand = authCommand.command('token').description('Manage workspace tokens');

// auth token create
tokenCommand
  .command('create')
  .description('Create a workspace token')
  .argument('<workspace>', 'Workspace ID')
  .argument('<name>', 'Token name')
  .option('-s, --scope <scope>', 'Token scope: read or read_write', 'read_write')
  .option('-e, --expires <days>', 'Expiration in days')
  .option('--json', 'Output as JSON')
  .action(async (workspace, name, options) => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Creating token...').start();

    try {
      const result = await api.createWorkspaceToken(
        workspace,
        name,
        options.scope,
        options.expires
      );
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else {
        success(`Created workspace token "${name}"`);
        console.log();
        console.log(chalk.bold('  Token: ') + chalk.green(result.workspace_token.token));
        console.log();
        info('Save this token - it will only be shown once!');
        if (result.workspace_token.expires_at) {
          dim(`  Expires: ${result.workspace_token.expires_at}`);
        }
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to create token');
      process.exit(1);
    }
  });

// auth token list
tokenCommand
  .command('list')
  .alias('ls')
  .description('List workspace tokens')
  .argument('<workspace>', 'Workspace ID')
  .option('--json', 'Output as JSON')
  .action(async (workspace, options) => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Loading tokens...').start();

    try {
      const result = await api.listWorkspaceTokens(workspace);
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else if (result.tokens.length === 0) {
        info('No workspace tokens found');
      } else {
        console.log(chalk.bold('Workspace Tokens:'));
        console.log();
        result.tokens.forEach(token => {
          const scopeColor = token.scope === 'read' ? chalk.yellow : chalk.green;
          console.log(
            `  ${chalk.cyan(token.token_prefix)}  ${token.name}  ${scopeColor(token.scope)}`
          );
          if (token.expires_at) {
            dim(`    Expires: ${token.expires_at}`);
          }
        });
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to list tokens');
      process.exit(1);
    }
  });

// auth token revoke
tokenCommand
  .command('revoke')
  .description('Revoke a workspace token')
  .argument('<id>', 'Token ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    const auth = loadAuth();
    if (!auth?.api_key) {
      error('Not logged in');
      process.exit(1);
    }

    const spinner = options.json ? null : ora('Revoking token...').start();

    try {
      const result = await api.revokeWorkspaceToken(id);
      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
      } else {
        success('Workspace token revoked');
      }
    } catch (err) {
      spinner?.stop();
      error(err.message || 'Failed to revoke token');
      process.exit(1);
    }
  });
