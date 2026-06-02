import { Command } from 'commander';
import { existsSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';
import { getDb, searchContext } from '../db/local.js';
import { requireStore } from '../lib/store.js';
import { scopeMatches, isSpecificScope } from '../lib/scope.js';
import { formatJson, heading, error, info, dim, contextItem } from '../lib/output.js';
import chalk from 'chalk';

const TYPE_ORDER = {
  constraint: 1,
  decision: 2,
  runbook: 3,
  note: 4,
  task: 5,
  entity: 6,
  snippet: 7
};

/** A target is a path if it has a separator or resolves to a real file. */
function looksLikePath(target, root) {
  if (target.includes('/') || target.includes('\\')) return true;
  return existsSync(resolve(process.cwd(), target)) || existsSync(resolve(root, target));
}

function byType(a, b) {
  return (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99);
}

function provenanceOf(item) {
  try {
    return JSON.parse(item.meta || '{}').provenance || null;
  } catch {
    return null;
  }
}

function printItem(item) {
  contextItem({ ...item, tags: JSON.parse(item.tags || '[]') });
  const p = provenanceOf(item);
  if (p && (p.commit || p.file)) {
    dim(`      ${[p.file, p.commit && `@${p.commit}`, p.author].filter(Boolean).join('  ')}`);
  }
}

export const whyCommand = new Command('why')
  .description('Show the context that governs or mentions a file or symbol')
  .argument('<target>', 'A file/path, or a symbol/term')
  .option('--all', 'Include superseded, deprecated, and expired context')
  .option('--json', 'Output as JSON')
  .action((target, options) => {
    const db = getDb();
    const { workspace, root } = requireStore(db, error);

    const nowIso = new Date().toISOString();
    const isActive = it =>
      options.all || (it.status === 'active' && (!it.expires_at || it.expires_at > nowIso));

    const isPath = looksLikePath(target, root);
    let relPath = null;
    if (isPath) {
      const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
      relPath = relative(root, abs).split('\\').join('/');
    }

    // Governs: items whose specific scope covers this path.
    let governs = [];
    if (isPath) {
      governs = db
        .prepare('SELECT * FROM context WHERE workspace_id = ? AND deleted_at IS NULL')
        .all(workspace.id)
        .filter(isActive)
        .filter(it => isSpecificScope(it.scope) && scopeMatches(it.scope, relPath))
        .sort(byType);
    }

    // Mentions: full-text matches on the term (path → basename, else the symbol).
    const term = isPath ? relPath.split('/').pop() || target : target;
    const governsIds = new Set(governs.map(i => i.id));
    let mentions = [];
    try {
      mentions = searchContext(db, workspace.id, term, { limit: 25 })
        .filter(isActive)
        .filter(i => !governsIds.has(i.id));
    } catch {
      mentions = [];
    }

    if (options.json) {
      const slim = i => ({
        id: i.id,
        type: i.type,
        content: i.content,
        tags: JSON.parse(i.tags || '[]'),
        scope: i.scope,
        provenance: provenanceOf(i)
      });
      console.log(
        formatJson({
          target,
          path: relPath,
          governs: governs.map(slim),
          mentions: mentions.map(slim)
        })
      );
      return;
    }

    console.log();
    heading(`why ${target}`);
    console.log();

    if (governs.length === 0 && mentions.length === 0) {
      info(`No context found for "${target}"`);
      if (isPath)
        dim(`  Scope context to it: substrate add "..." --type constraint --scope "${relPath}"`);
      console.log();
      return;
    }

    if (governs.length > 0) {
      console.log(chalk.bold(`Governs ${relPath} (${governs.length}):`));
      governs.forEach(printItem);
      console.log();
    }

    if (mentions.length > 0) {
      console.log(chalk.bold(`Mentions "${term}" (${mentions.length}):`));
      mentions.forEach(printItem);
      console.log();
    }
  });
