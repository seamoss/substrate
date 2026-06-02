/**
 * Git-backed sync orchestration.
 *
 * A repository's durable context lives in committed `.substrate/` files (see
 * {@link module:lib/files}); git is the transport between contributors. These
 * functions operate on an already-resolved store — the `{ workspace, root }`
 * returned by {@link module:lib/store.resolveStore}.
 *
 * - `pushChanges` serializes the local cache into the `.substrate/` files; the
 *   user (or CI) then commits and pushes them with git.
 * - `pullChanges` reads the `.substrate/` files (after a `git pull`) and reconciles
 *   them into the cache using last-write-wins by `updated_at`.
 * - `getSyncStatus` reports how many cached items are not yet serialized.
 *
 * The `synced_at` column records the last time a row was reconciled with the files;
 * a row is "pending push" when it has been modified since (or never) serialized.
 *
 * @module lib/sync
 */

import { getDb } from '../db/local.js';
import { readWorkspaceFiles, serializeWorkspace, hasWorkspaceFiles } from './files.js';

/**
 * Get sync status for a resolved store.
 *
 * @param {Object} workspace - The cache workspace row (id, name)
 * @param {string} root - The store root directory (contains `.substrate/`)
 * @returns {Promise<Object>} Status object
 */
export async function getSyncStatus(workspace, root) {
  const db = getDb();

  // Items modified since (or never) serialized -- includes tombstones so deletions push.
  const pendingPush = db
    .prepare(
      `SELECT COUNT(*) as count FROM context
       WHERE workspace_id = ?
       AND (synced_at IS NULL OR updated_at > synced_at)`
    )
    .get(workspace.id);

  const pendingLinksPush = db
    .prepare(
      `SELECT COUNT(*) as count FROM links l
       JOIN context c ON l.from_id = c.id
       WHERE c.workspace_id = ?
       AND l.created_at > COALESCE(c.synced_at, '1970-01-01')`
    )
    .get(workspace.id);

  const lastSync = db
    .prepare('SELECT MAX(synced_at) as last FROM context WHERE workspace_id = ?')
    .get(workspace.id);

  return {
    workspace: workspace.name,
    root,
    filesPresent: hasWorkspaceFiles(root),
    lastSync: lastSync?.last || null,
    pending: {
      push: {
        context: pendingPush.count,
        links: pendingLinksPush.count
      }
    }
  };
}

/**
 * Serialize local changes into the store's `.substrate/` files.
 *
 * Writes the workspace manifest, context, and links to disk, then stamps
 * `synced_at` on every context row so subsequent status checks show a clean tree.
 * The caller is responsible for committing the files with git.
 *
 * @param {Object} workspace - The cache workspace row
 * @param {string} root - The store root directory
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Log details
 * @returns {Promise<Object>} Result with counts and the root path
 */
export async function pushChanges(workspace, root, options = {}) {
  const db = getDb();
  const { verbose } = options;

  let counts;
  try {
    counts = serializeWorkspace(db, workspace, root);
  } catch (err) {
    return { error: `Failed to write .substrate files: ${err.message}` };
  }

  // Mark everything serialized as of now.
  const now = new Date().toISOString();
  db.prepare('UPDATE context SET synced_at = ? WHERE workspace_id = ?').run(now, workspace.id);

  if (verbose) {
    console.log(`  Wrote ${counts.context} context item(s) to ${root}/.substrate/`);
    console.log(`  Wrote ${counts.links} link(s)`);
    if (counts.tombstones > 0) {
      console.log(`  Including ${counts.tombstones} tombstone(s)`);
    }
    if (counts.privateContext > 0 || counts.privateLinks > 0) {
      console.log(
        `  Wrote ${counts.privateContext} private item(s) and ${counts.privateLinks} private link(s) to ${root}/.substrate/ (*.priv.jsonl)`
      );
    }
  }

  return { ...counts, root };
}

/**
 * Reconcile the store's `.substrate/` files into the local cache.
 *
 * Reads committed files (typically after a `git pull`) and applies them: new
 * context is inserted, existing context is updated when the file copy is newer
 * (last-write-wins by `updated_at`), and tombstones soft-delete locally. Links
 * present in the files are upserted; link deletions do not propagate (a removed
 * link is simply absent and is treated as not-present rather than deleted).
 *
 * @param {Object} workspace - The cache workspace row
 * @param {string} root - The store root directory
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Log each reconciled item
 * @returns {Promise<Object>} Result with pulled/updated/skipped/links counts
 */
export async function pullChanges(workspace, root, options = {}) {
  const db = getDb();
  const { verbose } = options;

  if (!hasWorkspaceFiles(root)) {
    return { error: `No .substrate files found at ${root}. Nothing to pull.` };
  }

  const { context: fileContext, links: fileLinks } = readWorkspaceFiles(root);

  const results = { pulled: 0, updated: 0, skipped: 0, links: 0 };
  const now = new Date().toISOString();

  const insertStmt = db.prepare(
    `INSERT INTO context
       (id, workspace_id, type, content, tags, scope, meta, private, status, expires_at, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStmt = db.prepare(
    `UPDATE context
       SET type = ?, content = ?, tags = ?, scope = ?, meta = ?, private = ?, status = ?, expires_at = ?, updated_at = ?, synced_at = ?, deleted_at = ?
     WHERE id = ?`
  );

  for (const rec of fileContext) {
    const local = db.prepare('SELECT * FROM context WHERE id = ?').get(rec.id);
    const tags = JSON.stringify(rec.tags || []);
    const meta = JSON.stringify(rec.meta || {});
    const priv = rec.private ? 1 : 0;

    if (!local) {
      insertStmt.run(
        rec.id,
        workspace.id,
        rec.type,
        rec.content,
        tags,
        rec.scope || '*',
        meta,
        priv,
        rec.status || 'active',
        rec.expires_at || null,
        rec.created_at,
        rec.updated_at,
        now,
        rec.deleted_at || null
      );
      results.pulled++;
      if (verbose) console.log(`  Pulled: ${rec.content.substring(0, 50)}...`);
    } else if (new Date(rec.updated_at).getTime() > new Date(local.updated_at).getTime()) {
      updateStmt.run(
        rec.type,
        rec.content,
        tags,
        rec.scope || '*',
        meta,
        priv,
        rec.status || 'active',
        rec.expires_at || null,
        rec.updated_at,
        now,
        rec.deleted_at || null,
        rec.id
      );
      results.updated++;
      if (verbose) console.log(`  Updated: ${rec.content.substring(0, 50)}...`);
    } else {
      results.skipped++;
    }
  }

  // Upsert links by (from_id, to_id, relation). Skip dangling references.
  const findLink = db.prepare(
    'SELECT id FROM links WHERE from_id = ? AND to_id = ? AND relation = ?'
  );
  const insertLink = db.prepare(
    'INSERT INTO links (from_id, to_id, relation, created_at) VALUES (?, ?, ?, ?)'
  );
  const ctxExists = db.prepare('SELECT 1 FROM context WHERE id = ?');

  for (const link of fileLinks) {
    if (!ctxExists.get(link.from_id) || !ctxExists.get(link.to_id)) continue;
    const existing = findLink.get(link.from_id, link.to_id, link.relation);
    if (!existing) {
      insertLink.run(link.from_id, link.to_id, link.relation, link.created_at || now);
      results.links++;
    }
  }

  return results;
}

/**
 * Full sync: reconcile files into the cache, then re-serialize the merged state.
 *
 * Mirrors a git workflow -- pull first to absorb others' changes, then push so
 * the files reflect the local cache (ready for the user to commit).
 *
 * @param {Object} workspace - The cache workspace row
 * @param {string} root - The store root directory
 * @param {Object} [options]
 * @returns {Promise<Object>} Combined pull and push results
 */
export async function syncWorkspace(workspace, root, options = {}) {
  const pullResult = await pullChanges(workspace, root, options);
  // A missing-files pull is fine on first sync; push will create them.
  const pushResult = await pushChanges(workspace, root, options);

  return {
    pull: pullResult,
    push: pushResult
  };
}
