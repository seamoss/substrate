/**
 * Context command - Manage context objects in a workspace.
 *
 * Context objects are the core data type in Substrate. Each context item
 * represents a piece of knowledge about the project:
 *
 * - **constraint** - Hard rules, immutable facts (highest priority)
 * - **decision** - Architectural choices that have been made
 * - **note** - General knowledge and information
 * - **task** - Work items to be completed
 * - **entity** - Domain concepts and entities
 * - **runbook** - Operational procedures
 * - **snippet** - Code patterns and examples
 *
 * Context is stored locally first (offline-first) then synced to remote.
 *
 * @module commands/context
 *
 * @example
 * // Add a constraint
 * substrate context add "All dates must be ISO 8601" --type constraint
 *
 * @example
 * // List context with filters
 * substrate context list --type decision --tag api
 */

import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { success, error, info, warn, formatJson, contextItem, shortId } from '../lib/output.js';
import { checkDuplicate } from '../lib/similarity.js';
import { requireStore } from '../lib/store.js';

/**
 * Valid context type values.
 * @type {string[]}
 * @constant
 */
const VALID_TYPES = ['note', 'constraint', 'decision', 'task', 'entity', 'runbook', 'snippet'];

/**
 * The context command for Commander.js.
 *
 * Provides subcommands for context management:
 * - `add <content>` - Add a new context item
 * - `list` / `ls` - List context items with filters
 *
 * Also aliased as `ctx` for brevity.
 *
 * @type {Command}
 */
export const contextCommand = new Command('context')
  .alias('ctx')
  .description('Manage context objects');

// context add (also aliased as just 'add' at root level)
contextCommand
  .command('add')
  .description('Add a context object')
  .argument('<content>', 'Content of the context object')
  .option('-t, --type <type>', `Type: ${VALID_TYPES.join(', ')}`, 'note')
  .option('--tag <tags>', 'Comma-separated tags')
  .option('-s, --scope <scope>', 'Scope path', '*')
  .option('-f, --force', 'Skip duplicate check')
  .option(
    '--private',
    'Keep personal (written to gitignored .substrate/*.priv.jsonl, never committed)'
  )
  .option('--json', 'Output as JSON')
  .action(async (content, options) => {
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

// context list
contextCommand
  .command('list')
  .alias('ls')
  .description('List context objects')
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

    // Parse tags
    items.forEach(item => {
      item.tags = JSON.parse(item.tags || '[]');
    });

    // Filter by tag if specified
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
