import { Command } from 'commander';
import { getDb } from '../db/local.js';
import { api } from '../lib/api.js';
import { success, error, info, formatJson, contextItem, shortId, dim } from '../lib/output.js';
import chalk from 'chalk';
import ora from 'ora';

const RELATION_TYPES = ['relates_to', 'depends_on', 'blocks', 'implements', 'extends', 'references'];

function findContextByShortId(db, shortIdStr, workspaceId) {
  // Try to find by prefix match
  const items = db.prepare(
    'SELECT * FROM context WHERE workspace_id = ? AND id LIKE ?'
  ).all(workspaceId, `${shortIdStr}%`);

  if (items.length === 0) {
    return { found: false, error: `No context found with ID starting with '${shortIdStr}'` };
  }

  if (items.length > 1) {
    return {
      found: false,
      error: `Ambiguous ID '${shortIdStr}' matches multiple items. Use more characters.`,
      matches: items
    };
  }

  return { found: true, item: items[0] };
}

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

export const linkCommand = new Command('link')
  .description('Manage relationships between context objects');

// link add (default action)
linkCommand
  .command('add')
  .description('Create a link between two context objects')
  .argument('<from>', 'Source context ID (short ID)')
  .argument('<to>', 'Target context ID (short ID)')
  .option('-r, --relation <type>', `Relation type: ${RELATION_TYPES.join(', ')}`, 'relates_to')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async (from, to, options) => {
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

    // Validate relation type
    if (!RELATION_TYPES.includes(options.relation)) {
      error(`Invalid relation type '${options.relation}'. Must be one of: ${RELATION_TYPES.join(', ')}`);
      process.exit(1);
    }

    // Find source context
    const fromResult = findContextByShortId(db, from, workspace.id);
    if (!fromResult.found) {
      error(fromResult.error);
      if (fromResult.matches) {
        info('Matches:');
        fromResult.matches.forEach(m => contextItem({ ...m, tags: JSON.parse(m.tags || '[]') }));
      }
      process.exit(1);
    }

    // Find target context
    const toResult = findContextByShortId(db, to, workspace.id);
    if (!toResult.found) {
      error(toResult.error);
      if (toResult.matches) {
        info('Matches:');
        toResult.matches.forEach(m => contextItem({ ...m, tags: JSON.parse(m.tags || '[]') }));
      }
      process.exit(1);
    }

    const fromItem = fromResult.item;
    const toItem = toResult.item;

    // Check if link already exists
    const existing = db.prepare(
      'SELECT * FROM links WHERE from_id = ? AND to_id = ?'
    ).get(fromItem.id, toItem.id);

    if (existing) {
      if (options.json) {
        console.log(formatJson({ error: 'Link already exists', link: existing }));
      } else {
        error('Link already exists between these items');
      }
      process.exit(1);
    }

    // Create link
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO links (from_id, to_id, relation, created_at)
      VALUES (?, ?, ?, ?)
    `).run(fromItem.id, toItem.id, options.relation, now);

    // Try to sync to remote
    const spinner = options.json ? null : ora('Linking...').start();
    try {
      await api.linkContext(
        workspace.remote_id || workspace.name,
        fromItem.remote_id || fromItem.id,
        toItem.remote_id || toItem.id,
        options.relation
      );
      spinner?.stop();
    } catch (err) {
      spinner?.stop();
      // Offline is fine
    }

    if (options.json) {
      console.log(formatJson({
        linked: true,
        from: { id: shortId(fromItem.id), content: fromItem.content },
        to: { id: shortId(toItem.id), content: toItem.content },
        relation: options.relation
      }));
    } else {
      success(`Linked ${shortId(fromItem.id)} → ${shortId(toItem.id)} (${options.relation})`);
      dim(`  ${fromItem.content}`);
      dim(`  → ${toItem.content}`);
    }
  });

// link list
linkCommand
  .command('list')
  .alias('ls')
  .description('List links for a context object or all links')
  .argument('[id]', 'Context ID to show links for (optional)')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
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

    let links;

    if (id) {
      // Find specific context
      const result = findContextByShortId(db, id, workspace.id);
      if (!result.found) {
        error(result.error);
        process.exit(1);
      }

      const item = result.item;

      // Get links where this item is source or target
      links = db.prepare(`
        SELECT l.*,
               cf.content as from_content, cf.type as from_type,
               ct.content as to_content, ct.type as to_type
        FROM links l
        JOIN context cf ON l.from_id = cf.id
        JOIN context ct ON l.to_id = ct.id
        WHERE l.from_id = ? OR l.to_id = ?
      `).all(item.id, item.id);

      if (options.json) {
        console.log(formatJson({
          context: { id: shortId(item.id), content: item.content },
          links: links.map(l => ({
            from: { id: shortId(l.from_id), content: l.from_content, type: l.from_type },
            to: { id: shortId(l.to_id), content: l.to_content, type: l.to_type },
            relation: l.relation
          }))
        }));
      } else {
        if (links.length === 0) {
          info(`No links found for ${shortId(item.id)}`);
        } else {
          console.log(chalk.bold(`Links for ${shortId(item.id)}:`));
          links.forEach(l => {
            const direction = l.from_id === item.id ? '→' : '←';
            const otherId = l.from_id === item.id ? l.to_id : l.from_id;
            const otherContent = l.from_id === item.id ? l.to_content : l.from_content;
            console.log(`  ${direction} ${chalk.dim(shortId(otherId))} ${l.relation} ${otherContent}`);
          });
        }
      }
    } else {
      // Get all links for workspace
      links = db.prepare(`
        SELECT l.*,
               cf.content as from_content, cf.type as from_type,
               ct.content as to_content, ct.type as to_type
        FROM links l
        JOIN context cf ON l.from_id = cf.id
        JOIN context ct ON l.to_id = ct.id
        WHERE cf.workspace_id = ?
      `).all(workspace.id);

      if (options.json) {
        console.log(formatJson({
          links: links.map(l => ({
            from: { id: shortId(l.from_id), content: l.from_content, type: l.from_type },
            to: { id: shortId(l.to_id), content: l.to_content, type: l.to_type },
            relation: l.relation
          })),
          count: links.length
        }));
      } else {
        if (links.length === 0) {
          info('No links found');
        } else {
          console.log(chalk.bold(`All links (${links.length}):`));
          links.forEach(l => {
            console.log(`  ${chalk.dim(shortId(l.from_id))} ${chalk.cyan(l.relation)} ${chalk.dim(shortId(l.to_id))}`);
            dim(`    ${l.from_content} → ${l.to_content}`);
          });
        }
      }
    }
  });

// link remove
linkCommand
  .command('remove')
  .alias('rm')
  .description('Remove a link between two context objects')
  .argument('<from>', 'Source context ID (short ID)')
  .argument('<to>', 'Target context ID (short ID)')
  .option('-w, --workspace <name>', 'Workspace name')
  .option('--json', 'Output as JSON')
  .action(async (from, to, options) => {
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

    // Find source context
    const fromResult = findContextByShortId(db, from, workspace.id);
    if (!fromResult.found) {
      error(fromResult.error);
      process.exit(1);
    }

    // Find target context
    const toResult = findContextByShortId(db, to, workspace.id);
    if (!toResult.found) {
      error(toResult.error);
      process.exit(1);
    }

    const fromItem = fromResult.item;
    const toItem = toResult.item;

    // Check if link exists
    const existing = db.prepare(
      'SELECT * FROM links WHERE from_id = ? AND to_id = ?'
    ).get(fromItem.id, toItem.id);

    if (!existing) {
      if (options.json) {
        console.log(formatJson({ error: 'Link not found' }));
      } else {
        error('No link found between these items');
      }
      process.exit(1);
    }

    // Remove link
    db.prepare('DELETE FROM links WHERE from_id = ? AND to_id = ?').run(fromItem.id, toItem.id);

    if (options.json) {
      console.log(formatJson({ removed: true, from: shortId(fromItem.id), to: shortId(toItem.id) }));
    } else {
      success(`Removed link ${shortId(fromItem.id)} → ${shortId(toItem.id)}`);
    }
  });
