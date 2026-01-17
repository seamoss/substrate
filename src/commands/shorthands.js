import { Command } from 'commander';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { api } from '../lib/api.js';
import { getProjectId } from '../lib/config.js';
import { success, error, info, formatJson, contextItem, dim } from '../lib/output.js';

const VALID_TYPES = ['note', 'constraint', 'decision', 'task', 'entity', 'runbook', 'snippet'];

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

// substrate add "content" - shorthand for context add
export const addCommand = new Command('add')
  .description('Add a context object (shorthand for "context add")')
  .argument('<content>', 'Content of the context object')
  .option('-t, --type <type>', `Type: ${VALID_TYPES.join(', ')}`, 'note')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--tag <tags>', 'Comma-separated tags')
  .option('-s, --scope <scope>', 'Scope path', '*')
  .option('--json', 'Output as JSON')
  .action(async (content, options) => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        info(`Run from a mounted directory or specify --workspace`);
        process.exit(1);
      }
    }

    if (!VALID_TYPES.includes(options.type)) {
      error(`Invalid type '${options.type}'. Must be one of: ${VALID_TYPES.join(', ')}`);
      process.exit(1);
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const tags = options.tag ? options.tag.split(',').map(t => t.trim()) : [];

    db.prepare(`
      INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspace.id, options.type, content, JSON.stringify(tags), options.scope, '{}', now, now);

    // Try to sync to remote
    try {
      const result = await api.addContext(
        workspace.remote_id || workspace.name,
        options.type,
        content,
        tags,
        options.scope
      );
      if (result.context?.id) {
        db.prepare('UPDATE context SET remote_id = ?, synced_at = ? WHERE id = ?')
          .run(result.context.id, now, id);
      }
    } catch (err) {
      // Offline is fine
    }

    const ctx = db.prepare('SELECT * FROM context WHERE id = ?').get(id);
    ctx.tags = JSON.parse(ctx.tags);

    if (options.json) {
      console.log(formatJson({ context: ctx, created: true }));
    } else {
      success(`Added ${options.type}`);
      contextItem(ctx);
    }
  });

// substrate ls - shorthand for context list
export const lsCommand = new Command('ls')
  .description('List context objects (shorthand for "context list")')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('-t, --type <type>', 'Filter by type')
  .option('--tag <tag>', 'Filter by tag')
  .option('-n, --limit <n>', 'Limit results', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const db = getDb();

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
      if (!workspace) {
        error(`Workspace '${options.workspace}' not found`);
        process.exit(1);
      }
    } else {
      workspace = findWorkspaceForCwd();
      if (!workspace) {
        error('No workspace found for current directory');
        process.exit(1);
      }
    }

    let query = 'SELECT * FROM context WHERE workspace_id = ?';
    const params = [workspace.id];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(options.limit));

    const items = db.prepare(query).all(...params);

    items.forEach(item => {
      item.tags = JSON.parse(item.tags || '[]');
    });

    let filtered = items;
    if (options.tag) {
      filtered = items.filter(item => item.tags.includes(options.tag));
    }

    if (options.json) {
      console.log(formatJson({ context: filtered, count: filtered.length }));
    } else if (filtered.length === 0) {
      info('No context objects found');
    } else {
      filtered.forEach(item => contextItem(item));
    }
  });

// substrate status - shorthand for mount status
export const statusCommand = new Command('status')
  .description('Show mount status (shorthand for "mount status")')
  .argument('[dir]', 'Directory to check', '.')
  .option('--json', 'Output as JSON')
  .action(async (dir, options) => {
    const db = getDb();
    const fullPath = resolve(dir);

    // Check for project pinning
    const projectId = getProjectId();
    let pinnedWorkspace = null;
    if (projectId) {
      pinnedWorkspace = db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(projectId);
    }

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

    // Use pinned workspace or mounted workspace for stats
    const workspace = pinnedWorkspace || mountedWorkspace;

    if (options.json) {
      const result = {
        path: fullPath,
        pinned: pinnedWorkspace ? { project_id: projectId, workspace: pinnedWorkspace.name } : null,
        mounted: activeMount ? { path: activeMount.path, workspace: mountedWorkspace?.name } : null,
        stats: workspace ? {
          contexts: db.prepare('SELECT COUNT(*) as count FROM context WHERE workspace_id = ?').get(workspace.id).count,
          links: db.prepare(`SELECT COUNT(*) as count FROM links l JOIN context c ON l.from_id = c.id WHERE c.workspace_id = ?`).get(workspace.id).count
        } : null
      };
      console.log(formatJson(result));
      return;
    }

    // Show pinned project
    if (pinnedWorkspace) {
      success(`Pinned to project '${pinnedWorkspace.name}'`);
      info(`Project ID: ${projectId}`);
    }

    // Show mount info
    if (activeMount) {
      if (pinnedWorkspace) console.log();
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

    // Show stats
    if (workspace) {
      const contextCount = db.prepare('SELECT COUNT(*) as count FROM context WHERE workspace_id = ?').get(workspace.id);
      const linkCount = db.prepare(`SELECT COUNT(*) as count FROM links l JOIN context c ON l.from_id = c.id WHERE c.workspace_id = ?`).get(workspace.id);
      console.log(`  ${contextCount.count} context(s), ${linkCount.count} link(s)`);
    }

    // No pinning or mount
    if (!pinnedWorkspace && !activeMount) {
      info(`No project pinned or mount found for '${fullPath}'`);
      dim(`Run 'substrate init <name>' to create a project`);
      dim(`Or 'substrate mount add ${dir} --workspace <name>' to mount`);
    }
  });
