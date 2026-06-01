import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { requireStore } from '../lib/store.js';
import { hasWorkspaceFiles } from '../lib/files.js';
import { error, formatJson, dim } from '../lib/output.js';
import chalk from 'chalk';

export const projectCommand = new Command('project').description('Show project identity');

// project id — print the stable project ID (from .substrate/config.json)
projectCommand
  .command('id')
  .description('Print this project’s ID')
  .option('--json', 'Output as JSON')
  .action(options => {
    const { workspace } = requireStore(getDb(), error);
    if (options.json) {
      console.log(formatJson({ project_id: workspace.project_id }));
    } else {
      console.log(workspace.project_id);
    }
  });

// project info — show details about the current project's store
projectCommand
  .command('info')
  .description('Show project details')
  .option('--json', 'Output as JSON')
  .action(options => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);
    const filesPresent = hasWorkspaceFiles(root);
    const contexts = db
      .prepare('SELECT COUNT(*) as c FROM context WHERE workspace_id = ? AND deleted_at IS NULL')
      .get(workspace.id).c;

    const result = {
      project_id: workspace.project_id,
      name: workspace.name,
      description: workspace.description || null,
      root,
      contexts,
      files_present: filesPresent
    };

    if (options.json) {
      console.log(formatJson(result));
      return;
    }

    console.log();
    console.log(chalk.bold('Project Information'));
    console.log();
    console.log(`  ${chalk.dim('Project ID:')}  ${chalk.cyan(workspace.project_id)}`);
    console.log(`  ${chalk.dim('Name:')}        ${workspace.name}`);
    if (workspace.description) {
      console.log(`  ${chalk.dim('Description:')} ${workspace.description}`);
    }
    console.log(`  ${chalk.dim('Root:')}        ${root}`);
    console.log(`  ${chalk.dim('Context:')}     ${contexts} item(s)`);
    console.log();
    if (filesPresent) {
      console.log(`  ${chalk.green('●')} .substrate files present`);
    } else {
      console.log(`  ${chalk.yellow('●')} No .substrate files yet`);
      dim('    Run "substrate sync push" to write them');
    }
    console.log();
  });
