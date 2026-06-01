import { Command } from 'commander';
import { existsSync, unlinkSync } from 'fs';
import { getDb } from '../db/local.js';
import { resolveWorkspaceRoot } from '../lib/sync.js';
import { hasWorkspaceFiles } from '../lib/files.js';
import {
  getProjectId,
  getProjectConfigPath,
  saveProjectConfig,
  loadProjectConfig
} from '../lib/config.js';
import { success, error, info, formatJson, dim } from '../lib/output.js';
import chalk from 'chalk';
import { randomUUID } from 'crypto';

export const projectCommand = new Command('project').description(
  'Manage project identity and pinning'
);

// project id
projectCommand
  .command('id')
  .description('Show current project ID')
  .option('--json', 'Output as JSON')
  .action(options => {
    const projectId = getProjectId();

    if (!projectId) {
      if (options.json) {
        console.log(formatJson({ project_id: null, error: 'No project pinned' }));
      } else {
        error('No project pinned to this directory');
        dim('  Run "substrate init <name>" to create a new project');
        dim('  Or "substrate project pin <id>" to join an existing project');
      }
      process.exit(1);
    }

    if (options.json) {
      console.log(formatJson({ project_id: projectId }));
    } else {
      console.log(projectId);
    }
  });

// project info
projectCommand
  .command('info')
  .description('Show project details')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const projectId = getProjectId();

    if (!projectId) {
      if (options.json) {
        console.log(formatJson({ error: 'No project pinned' }));
      } else {
        error('No project pinned to this directory');
        dim('  Run "substrate init <name>" to create a new project');
        dim('  Or "substrate project pin <id>" to join an existing project');
      }
      process.exit(1);
    }

    const db = getDb();

    // Get local workspace by project_id
    const workspace = db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(projectId);

    const root = workspace ? resolveWorkspaceRoot(db, workspace) : null;
    const filesPresent = root ? hasWorkspaceFiles(root) : false;

    const result = {
      project_id: projectId,
      name: workspace?.name || null,
      description: workspace?.description || null,
      local: workspace
        ? {
            id: workspace.id,
            synced_at: workspace.synced_at
          }
        : null,
      files_present: filesPresent,
      root
    };

    if (options.json) {
      console.log(formatJson(result));
      return;
    }

    console.log();
    console.log(chalk.bold('Project Information'));
    console.log();
    console.log(`  ${chalk.dim('Project ID:')}  ${chalk.cyan(projectId)}`);

    if (workspace) {
      console.log(`  ${chalk.dim('Name:')}        ${workspace.name}`);
      if (workspace.description) {
        console.log(`  ${chalk.dim('Description:')} ${workspace.description}`);
      }
      console.log();
      console.log(`  ${chalk.dim('Local ID:')}    ${workspace.id}`);
      if (workspace.synced_at) {
        console.log(`  ${chalk.dim('Last Write:')}  ${workspace.synced_at}`);
      }
    }

    console.log();
    if (filesPresent) {
      console.log(`  ${chalk.green('●')} Files: present (${root}/.substrate/)`);
    } else {
      console.log(`  ${chalk.yellow('●')} Files: not written yet`);
      dim('    Run "substrate sync push" to write .substrate files');
    }
    console.log();
  });

// project pin
projectCommand
  .command('pin')
  .description('Pin this directory to an existing project by ID')
  .argument('<id>', 'Project ID (UUID) to pin to')
  .option('--force', 'Overwrite existing project config')
  .action(async (id, options) => {
    // Check if already pinned
    const existingConfig = loadProjectConfig();
    if (existingConfig?.project_id && !options.force) {
      error(`Directory already pinned to project: ${existingConfig.project_id}`);
      dim('  Use --force to overwrite');
      process.exit(1);
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      error('Invalid project ID format (expected UUID)');
      process.exit(1);
    }

    const db = getDb();

    // Check if we already have this project locally
    let workspace = db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(id);

    if (!workspace) {
      // Create a local cache shell; `substrate sync pull` populates it from the
      // committed .substrate files (and corrects the name from workspace.json).
      const now = new Date().toISOString();
      const localId = randomUUID();

      db.prepare(
        `INSERT INTO workspaces (id, name, description, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(localId, 'pending-sync', '', id, now, now);

      workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(localId);
    }

    // Save project config
    saveProjectConfig({ project_id: id });

    success(`Pinned to project: ${id}`);
    if (workspace?.name && workspace.name !== 'pending-sync') {
      info(`Workspace: ${workspace.name}`);
    }
    console.log();
    dim('  Run "substrate sync pull" to load project context from .substrate files');
  });

// project unpin
projectCommand
  .command('unpin')
  .description('Remove project pinning from this directory')
  .option('--delete-local', 'Also delete local workspace data')
  .action(options => {
    const configPath = getProjectConfigPath();

    if (!existsSync(configPath)) {
      error('No project pinned to this directory');
      process.exit(1);
    }

    const projectId = getProjectId();

    if (options.deleteLocal && projectId) {
      const db = getDb();
      // Delete workspace and associated data
      const workspace = db.prepare('SELECT id FROM workspaces WHERE project_id = ?').get(projectId);
      if (workspace) {
        db.prepare('DELETE FROM context WHERE workspace_id = ?').run(workspace.id);
        db.prepare('DELETE FROM mounts WHERE workspace_id = ?').run(workspace.id);
        db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspace.id);
        info('Deleted local workspace data');
      }
    }

    // Remove config file
    unlinkSync(configPath);

    success('Unpinned project from this directory');
    if (!options.deleteLocal) {
      dim('  Local workspace data retained. Use --delete-local to remove.');
    }
  });
