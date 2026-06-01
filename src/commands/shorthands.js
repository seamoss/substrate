import { Command } from 'commander';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { resolveStore, requireStore } from '../lib/store.js';
import { getSyncStatus } from '../lib/sync.js';
import {
  success,
  error,
  info,
  warn,
  formatJson,
  contextItem,
  shortId,
  dim
} from '../lib/output.js';
import { checkDuplicate } from '../lib/similarity.js';

const VALID_TYPES = ['note', 'constraint', 'decision', 'task', 'entity', 'runbook', 'snippet'];

// substrate add "content" - shorthand for context add
export const addCommand = new Command('add')
  .description('Add a context object (shorthand for "context add")')
  .argument('<content>', 'Content of the context object')
  .option('-t, --type <type>', `Type: ${VALID_TYPES.join(', ')}`, 'note')
  .option('--tag <tags>', 'Comma-separated tags')
  .option('-s, --scope <scope>', 'Scope path', '*')
  .option('-f, --force', 'Skip duplicate check')
  .option('-y, --yes', 'Non-interactive mode (skip duplicate check, same as --force)')
  .option(
    '--private',
    'Keep personal (written to gitignored .substrate/*.priv.jsonl, never committed)'
  )
  .option('--json', 'Output as JSON')
  .action(async (content, options) => {
    // --yes is an alias for --force (for agent workflows)
    if (options.yes) options.force = true;
    const db = getDb();
    const { workspace } = requireStore(db, error);

    if (!VALID_TYPES.includes(options.type)) {
      error(`Invalid type '${options.type}'. Must be one of: ${VALID_TYPES.join(', ')}`);
      process.exit(1);
    }

    // Check for duplicates unless --force is used
    if (!options.force) {
      const duplicate = checkDuplicate(db, workspace.id, content, options.type);
      if (duplicate) {
        if (options.json) {
          console.log(
            formatJson({
              error: 'Similar content exists',
              existing: duplicate,
              hint: 'Use --force to add anyway'
            })
          );
        } else {
          warn(`Similar ${duplicate.type} already exists (${duplicate.similarity}% match):`);
          console.log(`  ${shortId(duplicate.id)} ${duplicate.content}`);
          info('Use --force to add anyway');
        }
        process.exit(1);
      }
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const tags = options.tag ? options.tag.split(',').map(t => t.trim()) : [];

    db.prepare(
      `
      INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, private, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      workspace.id,
      options.type,
      content,
      JSON.stringify(tags),
      options.scope,
      '{}',
      options.private ? 1 : 0,
      now,
      now
    );

    const ctx = db.prepare('SELECT * FROM context WHERE id = ?').get(id);
    ctx.tags = JSON.parse(ctx.tags);

    if (options.json) {
      console.log(formatJson({ context: ctx, created: true }));
    } else {
      success(`Added ${options.type}${options.private ? ' (private)' : ''}`);
      contextItem(ctx);
    }
  });

// substrate ls - shorthand for context list
export const lsCommand = new Command('ls')
  .description('List context objects (shorthand for "context list")')
  .option('-t, --type <type>', 'Filter by type')
  .option('--tag <tag>', 'Filter by tag')
  .option('-n, --limit <n>', 'Limit results', '20')
  .option('--json', 'Output as JSON')
  .action(async options => {
    const db = getDb();
    const { workspace } = requireStore(db, error);

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

// substrate status - show the Substrate workspace for a directory
export const statusCommand = new Command('status')
  .description('Show the Substrate workspace for a directory')
  .argument('[dir]', 'Directory to check', '.')
  .option('--json', 'Output as JSON')
  .action(async (dir, options) => {
    const db = getDb();
    const fullPath = resolve(dir);
    const store = resolveStore(db, fullPath);

    if (!store) {
      if (options.json) {
        console.log(formatJson({ tracked: false, path: fullPath }));
        return;
      }
      info(`No Substrate workspace found for '${fullPath}'`);
      dim(`Run 'substrate init' here to create one`);
      return;
    }

    const { workspace, root } = store;
    const ctxCount = db
      .prepare('SELECT COUNT(*) as c FROM context WHERE workspace_id = ? AND deleted_at IS NULL')
      .get(workspace.id).c;
    const linkCount = db
      .prepare(
        'SELECT COUNT(*) as c FROM links l JOIN context c ON l.from_id = c.id WHERE c.workspace_id = ?'
      )
      .get(workspace.id).c;
    const sync = await getSyncStatus(workspace, root);

    if (options.json) {
      console.log(
        formatJson({
          tracked: true,
          workspace: workspace.name,
          root,
          context: ctxCount,
          links: linkCount,
          filesPresent: sync.filesPresent,
          pending: sync.pending.push
        })
      );
      return;
    }

    success(`Workspace '${workspace.name}'`);
    info(`Root: ${root}`);
    console.log(`  ${ctxCount} context, ${linkCount} link(s)`);
    if (sync.pending.push.context > 0 || sync.pending.push.links > 0) {
      dim(
        `  ${sync.pending.push.context} item(s), ${sync.pending.push.links} link(s) pending — run 'substrate sync push'`
      );
    } else {
      dim('  All changes written to .substrate files');
    }
  });
