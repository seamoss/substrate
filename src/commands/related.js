import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { api } from '../lib/api.js';
import { error, info, formatJson, dim, shortId } from '../lib/output.js';
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

function findContextByShortId(db, shortIdStr, workspaceId) {
  const items = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?')
    .all(workspaceId, `${shortIdStr}%`);

  if (items.length === 0) {
    return { found: false, error: `No context found with ID starting with '${shortIdStr}'` };
  }

  if (items.length > 1) {
    return {
      found: false,
      error: `Ambiguous ID '${shortIdStr}' matches multiple items. Use more characters.`
    };
  }

  return { found: true, item: items[0] };
}

const TYPE_COLORS = {
  constraint: chalk.red,
  decision: chalk.yellow,
  note: chalk.blue,
  task: chalk.magenta,
  entity: chalk.cyan
};

export const relatedCommand = new Command('related')
  .description('Explore related context using graph traversal')
  .argument('<id>', 'Context ID (short ID) to explore from')
  .option('-d, --depth <n>', 'Traversal depth (1-2)', '1')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .option('--local', 'Use local links only (offline mode)')
  .action(async (id, options) => {
    const db = getDb();
    const depth = Math.min(2, Math.max(1, parseInt(options.depth) || 1));

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

    // Find the context item
    const result = findContextByShortId(db, id, workspace.id);
    if (!result.found) {
      error(result.error);
      process.exit(1);
    }

    const item = result.item;
    item.tags = JSON.parse(item.tags || '[]');

    // Try remote graph traversal first (uses SurrealDB's native graph queries)
    let related = [];
    let source = 'local';

    const spinner = options.json ? null : ora('Exploring graph...').start();

    if (!options.local && workspace.remote_id) {
      try {
        const remoteResult = await api.getRelated(
          workspace.remote_id,
          item.remote_id || item.id,
          depth
        );

        if (!remoteResult.error && !remoteResult.offline) {
          related = remoteResult.related || [];
          source = 'remote';
        }
      } catch (err) {
        // Fall back to local
      }
    }

    spinner?.stop();

    // Fallback: use local SQLite links
    if (source === 'local') {
      const links = db
        .prepare(
          `
        SELECT l.*,
               cf.id as from_id, cf.type as from_type, cf.content as from_content, cf.tags as from_tags,
               ct.id as to_id, ct.type as to_type, ct.content as to_content, ct.tags as to_tags
        FROM links l
        JOIN context cf ON l.from_id = cf.id
        JOIN context ct ON l.to_id = ct.id
        WHERE l.from_id = ? OR l.to_id = ?
      `
        )
        .all(item.id, item.id);

      const seen = new Set([item.id]);

      links.forEach(l => {
        const isOutbound = l.from_id === item.id;
        const otherId = isOutbound ? l.to_id : l.from_id;
        const otherType = isOutbound ? l.to_type : l.from_type;
        const otherContent = isOutbound ? l.to_content : l.from_content;
        const otherTags = isOutbound ? l.to_tags : l.from_tags;

        if (!seen.has(otherId)) {
          seen.add(otherId);
          related.push({
            id: shortId(otherId),
            type: otherType,
            content: otherContent,
            tags: JSON.parse(otherTags || '[]'),
            direction: isOutbound ? 'outbound' : 'inbound',
            relation: l.relation,
            hops: 1
          });
        }
      });

      // Depth 2: find links from related items
      if (depth >= 2 && related.length > 0) {
        for (const rel of [...related]) {
          const fullId = db.prepare('SELECT id FROM context WHERE id LIKE ?').get(`${rel.id}%`)?.id;
          if (!fullId) continue;

          const secondLinks = db
            .prepare(
              `
            SELECT l.*,
                   cf.id as from_id, cf.type as from_type, cf.content as from_content, cf.tags as from_tags,
                   ct.id as to_id, ct.type as to_type, ct.content as to_content, ct.tags as to_tags
            FROM links l
            JOIN context cf ON l.from_id = cf.id
            JOIN context ct ON l.to_id = ct.id
            WHERE (l.from_id = ? OR l.to_id = ?) AND l.from_id != ? AND l.to_id != ?
          `
            )
            .all(fullId, fullId, item.id, item.id);

          secondLinks.forEach(l => {
            const isOutbound = l.from_id === fullId;
            const otherId = isOutbound ? l.to_id : l.from_id;

            if (!seen.has(otherId)) {
              seen.add(otherId);
              related.push({
                id: shortId(otherId),
                type: isOutbound ? l.to_type : l.from_type,
                content: isOutbound ? l.to_content : l.from_content,
                tags: JSON.parse((isOutbound ? l.to_tags : l.from_tags) || '[]'),
                direction: isOutbound ? 'outbound' : 'inbound',
                relation: l.relation,
                hops: 2
              });
            }
          });
        }
      }
    }

    // Output
    if (options.json) {
      console.log(
        formatJson({
          context: {
            id: shortId(item.id),
            type: item.type,
            content: item.content,
            tags: item.tags
          },
          related,
          depth,
          source
        })
      );
      return;
    }

    // Human output
    console.log();
    const typeColor = TYPE_COLORS[item.type] || chalk.white;
    console.log(typeColor.bold(`[${item.type}]`), item.content);
    dim(`  ${shortId(item.id)}`);
    console.log();

    if (related.length === 0) {
      info('No related context found');
      dim(`  Try: substrate link add ${shortId(item.id)} <other-id>`);
    } else {
      console.log(chalk.bold(`Related (depth ${depth}, ${related.length} items):`));
      console.log();

      // Group by hops
      const hop1 = related.filter(r => r.hops === 1);
      const hop2 = related.filter(r => r.hops === 2);

      if (hop1.length > 0) {
        hop1.forEach(r => {
          const arrow = r.direction === 'outbound' ? '→' : '←';
          const relType = r.relation ? chalk.dim(`(${r.relation})`) : '';
          const rTypeColor = TYPE_COLORS[r.type] || chalk.white;
          console.log(`  ${arrow} ${rTypeColor(`[${r.type}]`)} ${r.content} ${relType}`);
          dim(`    ${r.id}`);
        });
      }

      if (hop2.length > 0) {
        console.log();
        dim('  2 hops away:');
        hop2.forEach(r => {
          const rTypeColor = TYPE_COLORS[r.type] || chalk.white;
          console.log(`    ${rTypeColor(`[${r.type}]`)} ${r.content}`);
          dim(`      ${r.id}`);
        });
      }
    }

    console.log();
    if (source === 'local') {
      dim(`  Source: local cache`);
    }
  });
