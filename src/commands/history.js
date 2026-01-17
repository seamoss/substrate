import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { formatJson, heading, contextItem, info, dim, shortId } from '../lib/output.js';
import chalk from 'chalk';

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

function parseTimeAgo(hoursAgo) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
  return cutoff.toISOString();
}

function formatTimeAgo(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

// substrate digest - summarize recent additions
export const digestCommand = new Command('digest')
  .description('Summarize context added in current session')
  .option('-h, --hours <n>', 'Hours to look back', '8')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(options => {
    const db = getDb();
    const hoursAgo = parseFloat(options.hours);
    const cutoff = parseTimeAgo(hoursAgo);

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      info('No workspace found');
      return;
    }

    // Get recent context
    const items = db
      .prepare(
        `
      SELECT * FROM context
      WHERE workspace_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `
      )
      .all(workspace.id, cutoff);

    items.forEach(item => {
      item.tags = JSON.parse(item.tags || '[]');
    });

    // Get recent links
    const links = db
      .prepare(
        `
      SELECT l.*, cf.content as from_content, ct.content as to_content
      FROM links l
      JOIN context cf ON l.from_id = cf.id
      JOIN context ct ON l.to_id = ct.id
      WHERE cf.workspace_id = ? AND l.created_at >= ?
      ORDER BY l.created_at DESC
    `
      )
      .all(workspace.id, cutoff);

    // Group by type
    const byType = {
      constraint: items.filter(i => i.type === 'constraint'),
      decision: items.filter(i => i.type === 'decision'),
      note: items.filter(i => i.type === 'note'),
      task: items.filter(i => i.type === 'task'),
      entity: items.filter(i => i.type === 'entity'),
      other: items.filter(
        i => !['constraint', 'decision', 'note', 'task', 'entity'].includes(i.type)
      )
    };

    if (options.json) {
      console.log(
        formatJson({
          workspace: workspace.name,
          period: `last ${hoursAgo} hours`,
          summary: {
            total: items.length,
            constraints: byType.constraint.length,
            decisions: byType.decision.length,
            notes: byType.note.length,
            tasks: byType.task.length,
            entities: byType.entity.length,
            links: links.length
          },
          items: items.map(i => ({
            id: shortId(i.id),
            type: i.type,
            content: i.content,
            tags: i.tags,
            created: i.created_at
          })),
          links: links.map(l => ({
            from: shortId(l.from_id),
            to: shortId(l.to_id),
            relation: l.relation
          }))
        })
      );
      return;
    }

    // Human output
    console.log();
    heading(`Session Digest (last ${hoursAgo}h)`);
    dim(`Workspace: ${workspace.name}`);
    console.log();

    if (items.length === 0) {
      info('No context added in this period');
      return;
    }

    // Summary line
    const parts = [];
    if (byType.constraint.length) parts.push(`${byType.constraint.length} constraint(s)`);
    if (byType.decision.length) parts.push(`${byType.decision.length} decision(s)`);
    if (byType.note.length) parts.push(`${byType.note.length} note(s)`);
    if (byType.task.length) parts.push(`${byType.task.length} task(s)`);
    if (byType.entity.length) parts.push(`${byType.entity.length} entit(ies)`);
    if (links.length) parts.push(`${links.length} link(s)`);

    console.log(chalk.green(`Added: ${parts.join(', ')}`));
    console.log();

    // List items by type
    if (byType.constraint.length > 0) {
      console.log(chalk.red.bold('Constraints:'));
      byType.constraint.forEach(item => {
        console.log(`  ${chalk.dim(formatTimeAgo(item.created_at))} ${item.content}`);
      });
      console.log();
    }

    if (byType.decision.length > 0) {
      console.log(chalk.yellow.bold('Decisions:'));
      byType.decision.forEach(item => {
        console.log(`  ${chalk.dim(formatTimeAgo(item.created_at))} ${item.content}`);
      });
      console.log();
    }

    if (byType.note.length > 0) {
      console.log(chalk.blue.bold('Notes:'));
      byType.note.forEach(item => {
        console.log(`  ${chalk.dim(formatTimeAgo(item.created_at))} ${item.content}`);
      });
      console.log();
    }

    if (links.length > 0) {
      console.log(chalk.cyan.bold('Links created:'));
      links.forEach(l => {
        console.log(
          `  ${chalk.dim(formatTimeAgo(l.created_at))} ${l.from_content} → ${l.to_content}`
        );
      });
      console.log();
    }
  });

// substrate recall - search/query history
export const recallCommand = new Command('recall')
  .description('Search and recall context from session history')
  .argument('[query]', 'Search term (searches content)')
  .option('-h, --hours <n>', 'Hours to look back', '24')
  .option('-t, --type <type>', 'Filter by type')
  .option('--tag <tag>', 'Filter by tag')
  .option('-n, --limit <n>', 'Limit results', '20')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action((query, options) => {
    const db = getDb();
    const hoursAgo = parseFloat(options.hours);
    const cutoff = parseTimeAgo(hoursAgo);

    let workspace;
    if (options.workspace) {
      workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get(options.workspace);
    } else {
      workspace = findWorkspaceForCwd();
    }

    if (!workspace) {
      info('No workspace found');
      return;
    }

    // Build query
    let sql = `
      SELECT * FROM context
      WHERE workspace_id = ? AND created_at >= ?
    `;
    const params = [workspace.id, cutoff];

    if (query) {
      sql += ` AND content LIKE ?`;
      params.push(`%${query}%`);
    }

    if (options.type) {
      sql += ` AND type = ?`;
      params.push(options.type);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(options.limit));

    const items = db.prepare(sql).all(...params);

    items.forEach(item => {
      item.tags = JSON.parse(item.tags || '[]');
    });

    // Filter by tag if specified
    let filtered = items;
    if (options.tag) {
      filtered = items.filter(item => item.tags.includes(options.tag));
    }

    if (options.json) {
      console.log(
        formatJson({
          query: query || null,
          period: `last ${hoursAgo} hours`,
          results: filtered.map(i => ({
            id: shortId(i.id),
            type: i.type,
            content: i.content,
            tags: i.tags,
            created: i.created_at,
            timeAgo: formatTimeAgo(i.created_at)
          })),
          count: filtered.length
        })
      );
      return;
    }

    // Human output
    if (filtered.length === 0) {
      info(query ? `No results for "${query}"` : 'No recent context found');
      dim(`Try: substrate recall --hours 48`);
      return;
    }

    console.log();
    if (query) {
      heading(`Recall: "${query}" (last ${hoursAgo}h)`);
    } else {
      heading(`Recent Context (last ${hoursAgo}h)`);
    }
    console.log();

    filtered.forEach(item => {
      const timeStr = chalk.dim(`[${formatTimeAgo(item.created_at)}]`);
      const idStr = chalk.dim(shortId(item.id));
      contextItem(item, false);
      dim(`    ${idStr} ${timeStr}`);
    });

    console.log();
    dim(`${filtered.length} result(s)`);
  });
