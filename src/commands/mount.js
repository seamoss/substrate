import { Command } from 'commander';
import { resolve } from 'path';
import { getDb } from '../db/local.js';
import { api } from '../lib/api.js';
import { getProjectId } from '../lib/config.js';
import { success, error, info, warn, formatJson, table, dim } from '../lib/output.js';
import ora from 'ora';

export const mountCommand = new Command('mount')
  .description('Manage workspace mounts');

// mount add
mountCommand
  .command('add')
  .description('Mount a workspace to a directory')
  .argument('<dir>', 'Directory to mount')
  .requiredOption('-w, --workspace <name>', 'Workspace name')
  .option('-s, --scope <path>', 'Scope within the directory', '*')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--json', 'Output as JSON')
  .action(async (dir, options) => {
    const db = getDb();
    const fullPath = resolve(dir);

    // Find workspace
    const workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);

    if (!workspace) {
      if (options.json) {
        console.log(formatJson({ error: `Workspace '${options.workspace}' not found` }));
      } else {
        error(`Workspace '${options.workspace}' not found. Run 'substrate init ${options.workspace}' first.`);
      }
      process.exit(1);
    }

    // Check if already mounted
    const existing = db.prepare('SELECT * FROM mounts WHERE path = ?').get(fullPath);
    if (existing) {
      if (options.json) {
        console.log(formatJson({ error: 'Path already mounted', mount: existing }));
      } else {
        warn(`Path already mounted to workspace`);
        info(`Use 'substrate mount remove ${fullPath}' to unmount first`);
      }
      process.exit(1);
    }

    const now = new Date().toISOString();
    const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [];

    db.prepare(`
      INSERT INTO mounts (workspace_id, path, scope, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspace.id, fullPath, options.scope, JSON.stringify(tags), now, now);

    // Try to sync to remote
    const spinner = options.json ? null : ora('Mounting...').start();
    try {
      await api.createMount(workspace.remote_id || workspace.name, fullPath, options.scope, tags);
      spinner?.stop();
    } catch (err) {
      spinner?.stop();
      // Offline is fine
    }

    const mount = db.prepare('SELECT * FROM mounts WHERE path = ?').get(fullPath);

    if (options.json) {
      console.log(formatJson({ mount, created: true }));
    } else {
      success(`Mounted '${fullPath}' to workspace '${options.workspace}'`);
    }
  });

// mount status
mountCommand
  .command('status')
  .description('Show mount status for current or specified directory')
  .argument('[dir]', 'Directory to check', '.')
  .option('--json', 'Output as JSON')
  .action(async (dir, options) => {
    const db = getDb();
    const fullPath = resolve(dir);

    // Check for project pinning first
    const projectId = getProjectId();
    let pinnedWorkspace = null;
    if (projectId) {
      pinnedWorkspace = db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(projectId);
    }

    // Find mount that contains this path
    const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

    let activeMount = null;
    for (const mount of mounts) {
      if (fullPath.startsWith(mount.path)) {
        activeMount = mount;
        break;
      }
    }

    const mountedWorkspace = activeMount
      ? db.prepare('SELECT * FROM workspaces WHERE id = ?').get(activeMount.workspace_id)
      : null;

    if (options.json) {
      console.log(formatJson({
        path: fullPath,
        pinned: pinnedWorkspace ? {
          project_id: projectId,
          workspace: pinnedWorkspace
        } : null,
        mounted: activeMount ? {
          mount: activeMount,
          workspace: mountedWorkspace
        } : null
      }));
      return;
    }

    // Show pinned project info
    if (pinnedWorkspace) {
      success(`Pinned to project '${pinnedWorkspace.name}'`);
      info(`Project ID: ${projectId}`);
    }

    // Show mount info
    if (activeMount) {
      if (pinnedWorkspace) {
        console.log(); // Separator
      }
      success(`Mounted to workspace '${mountedWorkspace.name}'`);
      info(`Mount path: ${activeMount.path}`);
      if (activeMount.scope !== '*') {
        info(`Scope: ${activeMount.scope}`);
      }
      const tags = JSON.parse(activeMount.tags || '[]');
      if (tags.length > 0) {
        info(`Tags: ${tags.join(', ')}`);
      }
    }

    // No pinning or mount
    if (!pinnedWorkspace && !activeMount) {
      info(`No project pinned or mount found for '${fullPath}'`);
      dim(`Run 'substrate init <name>' to create a project`);
      dim(`Or 'substrate mount add ${dir} --workspace <name>' to mount`);
    }
  });

// mount list
mountCommand
  .command('list')
  .alias('ls')
  .description('List all mounts')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const db = getDb();
    const mounts = db.prepare(`
      SELECT m.*, w.name as workspace_name
      FROM mounts m
      JOIN workspaces w ON m.workspace_id = w.id
      ORDER BY m.path
    `).all();

    if (options.json) {
      console.log(formatJson({ mounts }));
    } else if (mounts.length === 0) {
      info('No mounts configured');
      dim(`Run 'substrate mount add <dir> --workspace <name>' to create one`);
    } else {
      mounts.forEach(m => {
        console.log(`${m.path} → ${m.workspace_name}`);
      });
    }
  });

// mount remove
mountCommand
  .command('remove')
  .alias('rm')
  .description('Remove a mount')
  .argument('<path>', 'Path to unmount')
  .option('--json', 'Output as JSON')
  .action(async (path, options) => {
    const db = getDb();
    const fullPath = resolve(path);

    const mount = db.prepare('SELECT * FROM mounts WHERE path = ?').get(fullPath);

    if (!mount) {
      if (options.json) {
        console.log(formatJson({ error: 'Mount not found', path: fullPath }));
      } else {
        error(`No mount found at '${fullPath}'`);
      }
      process.exit(1);
    }

    db.prepare('DELETE FROM mounts WHERE path = ?').run(fullPath);

    if (options.json) {
      console.log(formatJson({ removed: true, path: fullPath }));
    } else {
      success(`Removed mount at '${fullPath}'`);
    }
  });
