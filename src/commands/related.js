import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { error, info, formatJson, dim, shortId } from '../lib/output.js';
import { requireStore } from '../lib/store.js';
import chalk from 'chalk';

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
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    const db = getDb();
    const depth = Math.min(2, Math.max(1, parseInt(options.depth) || 1));

    const { workspace } = requireStore(db, error);

    // Find the context item
    const result = findContextByShortId(db, id, workspace.id);
    if (!result.found) {
      error(result.error);
      process.exit(1);
    }

    const item = result.item;
    item.tags = JSON.parse(item.tags || '[]');

    // Graph traversal over the local link cache.
    const related = [];

    {
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
          depth
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
  });
