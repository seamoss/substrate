import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { requireStore } from '../lib/store.js';
import { getSyncStatus, pushChanges, pullChanges, syncWorkspace } from '../lib/sync.js';
import { success, error, info, dim, heading, formatJson } from '../lib/output.js';
import chalk from 'chalk';
import ora from 'ora';

export const syncCommand = new Command('sync')
  .description('Sync context with the committed .substrate files (git is the transport)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    const spinner = options.json ? null : ora('Syncing...').start();

    try {
      const result = await syncWorkspace(workspace, root, { verbose: options.verbose });

      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();
      heading(`Sync Complete: ${workspace.name}`);
      console.log();

      // Pull (ignore the benign "no files yet" case on first sync)
      if (result.pull?.error && !/No \.substrate files/.test(result.pull.error)) {
        error(`Pull failed: ${result.pull.error}`);
      } else if (result.pull) {
        if (result.pull.pulled > 0) success(`Pulled ${result.pull.pulled} new item(s)`);
        if (result.pull.updated > 0) info(`Updated ${result.pull.updated} item(s)`);
        if (result.pull.links > 0) info(`Added ${result.pull.links} link(s)`);
      }

      if (result.push?.error) {
        error(`Write failed: ${result.push.error}`);
      } else if (result.push) {
        success(`Wrote ${result.push.context} item(s) and ${result.push.links} link(s)`);
        dim(`  to ${result.push.root}/.substrate/`);
        console.log();
        dim('  Commit them: git add .substrate && git commit -m "Update context"');
      }

      console.log();
    } catch (err) {
      spinner?.stop();
      error(`Sync failed: ${err.message}`);
    }
  });

// substrate sync status
syncCommand
  .command('status')
  .description('Show sync status')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    const status = await getSyncStatus(workspace, root);

    if (options.json) {
      console.log(formatJson(status));
      return;
    }

    console.log();
    heading(`Sync Status: ${workspace.name}`);
    console.log();

    if (status.filesPresent) {
      console.log(
        `  ${chalk.green('●')} Files: ${chalk.green('present')} (${status.root}/.substrate/)`
      );
    } else {
      console.log(`  ${chalk.yellow('●')} Files: ${chalk.yellow('not written yet')}`);
    }

    if (status.lastSync) {
      dim(`  Last write: ${new Date(status.lastSync).toLocaleString()}`);
    } else {
      dim(`  Last write: never`);
    }

    console.log();

    const pendingContext = status.pending.push.context;
    const pendingLinks = status.pending.push.links;

    if (pendingContext === 0 && pendingLinks === 0) {
      success('All changes written to .substrate files');
    } else {
      info(`Pending: ${pendingContext} context item(s), ${pendingLinks} link(s)`);
      dim('  Run: substrate sync push');
    }

    console.log();
  });

// substrate sync push -- serialize local cache into .substrate files
syncCommand
  .command('push')
  .description('Write local context to the .substrate files (then commit with git)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    const spinner = options.json ? null : ora('Writing .substrate files...').start();

    try {
      const result = await pushChanges(workspace, root, { verbose: options.verbose });

      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();

      if (result.error) {
        error(result.error);
        return;
      }

      success(`Wrote ${result.context} item(s) and ${result.links} link(s)`);
      dim(`  to ${result.root}/.substrate/`);
      console.log();
      dim('  Next: git add .substrate && git commit -m "Update context" && git push');
      console.log();
    } catch (err) {
      spinner?.stop();
      error(`Write failed: ${err.message}`);
    }
  });

// substrate sync pull -- reconcile .substrate files into local cache
syncCommand
  .command('pull')
  .description('Read the .substrate files into the local cache (after a git pull)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    const spinner = options.json ? null : ora('Reading .substrate files...').start();

    try {
      const result = await pullChanges(workspace, root, { verbose: options.verbose });

      spinner?.stop();

      if (options.json) {
        console.log(formatJson(result));
        return;
      }

      console.log();

      if (result.error) {
        error(result.error);
        return;
      }

      if (result.pulled > 0) success(`Pulled ${result.pulled} new item(s)`);
      if (result.updated > 0) info(`Updated ${result.updated} item(s)`);
      if (result.links > 0) info(`Added ${result.links} link(s)`);
      if (result.pulled === 0 && result.updated === 0 && result.links === 0) {
        info('Already up to date');
      }

      console.log();
    } catch (err) {
      spinner?.stop();
      error(`Pull failed: ${err.message}`);
    }
  });
