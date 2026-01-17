import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { getSyncStatus, pushChanges, pullChanges, syncWorkspace } from '../lib/sync.js';
import { success, error, info, dim, heading, formatJson } from '../lib/output.js';
import chalk from 'chalk';
import ora from 'ora';

function findWorkspaceForCwd() {
  const db = getDb();
  const cwd = process.cwd();

  const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

  for (const mount of mounts) {
    if (cwd.startsWith(mount.path)) {
      return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(mount.workspace_id);
    }
  }

  return null;
}

export const syncCommand = new Command('sync')
  .description('Sync local context with remote server')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    let workspace;
    const db = getDb();

    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      error('No workspace found. Specify with -w or run from a mounted directory.');
      return;
    }

    const spinner = ora('Syncing...').start();

    try {
      const result = await syncWorkspace(workspace.id, { verbose: options.verbose });

      spinner.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();
      heading(`Sync Complete: ${workspace.name}`);
      console.log();

      if (result.push.error) {
        error(`Push failed: ${result.push.error}`);
      } else {
        if (result.push.pushed > 0) {
          success(`Pushed ${result.push.pushed} item(s)`);
        }
        if (result.push.failed > 0) {
          error(`Failed to push ${result.push.failed} item(s)`);
        }
      }

      if (result.pull) {
        if (result.pull.error) {
          error(`Pull failed: ${result.pull.error}`);
        } else {
          if (result.pull.pulled > 0) {
            success(`Pulled ${result.pull.pulled} new item(s)`);
          }
          if (result.pull.updated > 0) {
            info(`Updated ${result.pull.updated} item(s)`);
          }
          if (result.pull.skipped > 0) {
            dim(`  Skipped ${result.pull.skipped} unchanged item(s)`);
          }
        }
      }

      console.log();
    } catch (err) {
      spinner.stop();
      error(`Sync failed: ${err.message}`);
    }
  });

// substrate sync status
syncCommand
  .command('status')
  .description('Show sync status')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async options => {
    let workspace;
    const db = getDb();

    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      error('No workspace found. Specify with -w or run from a mounted directory.');
      return;
    }

    const status = await getSyncStatus(workspace.id);

    if (options.json) {
      console.log(formatJson(status));
      return;
    }

    console.log();
    heading(`Sync Status: ${workspace.name}`);
    console.log();

    // Connectivity
    if (status.online) {
      console.log(`  ${chalk.green('●')} Remote: ${chalk.green('connected')}`);
    } else {
      console.log(`  ${chalk.red('●')} Remote: ${chalk.red('offline')}`);
    }

    // Last sync
    if (status.lastSync) {
      dim(`  Last sync: ${new Date(status.lastSync).toLocaleString()}`);
    } else {
      dim(`  Last sync: never`);
    }

    console.log();

    // Pending changes
    const pendingContext = status.pending.push.context;
    const pendingLinks = status.pending.push.links;

    if (pendingContext === 0 && pendingLinks === 0) {
      success('All changes synced');
    } else {
      info(`Pending push: ${pendingContext} context item(s), ${pendingLinks} link(s)`);
      dim('  Run: substrate sync push');
    }

    console.log();
  });

// substrate sync push
syncCommand
  .command('push')
  .description('Push local changes to remote')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    let workspace;
    const db = getDb();

    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      error('No workspace found. Specify with -w or run from a mounted directory.');
      return;
    }

    const spinner = ora('Pushing changes...').start();

    try {
      const result = await pushChanges(workspace.id, { verbose: options.verbose });

      spinner.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();

      if (result.error) {
        error(result.error);
        return;
      }

      if (result.pushed > 0) {
        success(`Pushed ${result.pushed} item(s) to remote`);
      } else {
        info('Nothing to push');
      }

      if (result.failed > 0) {
        error(`Failed to push ${result.failed} item(s)`);
        result.errors.forEach(e => dim(`  ${e.id}: ${e.error}`));
      }

      console.log();
    } catch (err) {
      spinner.stop();
      error(`Push failed: ${err.message}`);
    }
  });

// substrate sync pull
syncCommand
  .command('pull')
  .description('Pull remote changes to local')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    let workspace;
    const db = getDb();

    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      error('No workspace found. Specify with -w or run from a mounted directory.');
      return;
    }

    const spinner = ora('Pulling changes...').start();

    try {
      const result = await pullChanges(workspace.id, { verbose: options.verbose });

      spinner.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();

      if (result.error) {
        error(result.error);
        return;
      }

      if (result.pulled > 0) {
        success(`Pulled ${result.pulled} new item(s)`);
      }
      if (result.updated > 0) {
        info(`Updated ${result.updated} item(s)`);
      }
      if (result.pulled === 0 && result.updated === 0) {
        info('Already up to date');
      }

      console.log();
    } catch (err) {
      spinner.stop();
      error(`Pull failed: ${err.message}`);
    }
  });
