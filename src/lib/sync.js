/**
 * Git-backed sync orchestration.
 *
 * Substrate no longer syncs through a remote HTTP server. Instead, a workspace's
 * durable state lives in committed `.substrate/` files (see {@link module:lib/files})
 * and git is the transport between contributors.
 *
 * - `pushChanges` serializes the local DB into `.substrate/` files. The user (or CI)
 *   then commits and pushes them with git.
 * - `pullChanges` reads `.substrate/` files (after a `git pull`) and reconciles them
 *   into the local DB using last-write-wins by `updated_at`.
 * - `getSyncStatus` reports how many local items are not yet serialized.
 *
 * The `synced_at` column records the last time a row was reconciled with the files;
 * a row is "pending push" when it has been modified since (or never) serialized.
 *
 * @module lib/sync
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/local.js';
import { readWorkspaceFiles, serializeWorkspace, hasWorkspaceFiles } from './files.js';

/**
 * Bootstrap (or find) a local workspace cache from committed `.substrate` files.
 *
 * Used on a fresh clone, where the repo carries `.substrate/` files but the
 * local machine has no workspace row yet. Resolves by the manifest's stable
 * `project_id`, creating a cache shell if needed. Returns null when there are no
 * files to bootstrap from.
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {string} root - Project root directory containing `.substrate/`
 * @returns {Object|null} The workspace row, or null if no files present
 */
export function bootstrapWorkspaceFromFiles(db, root) {
  if (!hasWorkspaceFiles(root)) return null;

  const { manifest } = readWorkspaceFiles(root);
  const projectId = manifest?.project_id;

  if (projectId) {
    const existing = db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(projectId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO workspaces (id, name, description, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    manifest?.name || 'default',
    manifest?.description || '',
    projectId || randomUUID(),
    now,
    now
  );
  // Mount the project root so subsequent commands resolve this workspace by cwd.
  db.prepare(
    `INSERT OR IGNORE INTO mounts (workspace_id, path, scope, tags, created_at, updated_at)
     VALUES (?, ?, '*', '[]', ?, ?)`
  ).run(id, root, now, now);
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
}

/**
 * Resolve the project root directory holding a workspace's `.substrate/` files.
 *
 * Uses the workspace's shortest mount path (the directory it was mounted at),
 * falling back to the current working directory.
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {Object} workspace - The workspace row
 * @returns {string} Absolute project root directory
 */
export function resolveWorkspaceRoot(db, workspace) {
  const mount = db
    .prepare('SELECT path FROM mounts WHERE workspace_id = ? ORDER BY length(path) ASC LIMIT 1')
    .get(workspace.id);
  return mount?.path || process.cwd();
}

/**
 * Get sync status for a workspace.
 *
 * Reports how many context items / links have local changes not yet written to
 * `.substrate/` files, whether the files exist on disk, and the last serialize time.
 *
 * @param {string} workspaceId - The workspace UUID
 * @returns {Promise<Object>} Status object
 */
export async function getSyncStatus(workspaceId) {
  const db = getDb();

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  // Items modified since (or never) serialized -- includes tombstones so deletions push.
  const pendingPush = db
    .prepare(
      `SELECT COUNT(*) as count FROM context
       WHERE workspace_id = ?
       AND (synced_at IS NULL OR updated_at > synced_at)`
    )
    .get(workspaceId);

  const pendingLinksPush = db
    .prepare(
      `SELECT COUNT(*) as count FROM links l
       JOIN context c ON l.from_id = c.id
       WHERE c.workspace_id = ?
       AND l.created_at > COALESCE(c.synced_at, '1970-01-01')`
    )
    .get(workspaceId);

  const lastSync = db
    .prepare('SELECT MAX(synced_at) as last FROM context WHERE workspace_id = ?')
    .get(workspaceId);

  const root = resolveWorkspaceRoot(db, workspace);

  return {
    workspace: workspace.name,
    workspaceId,
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
 * Serialize local changes into `.substrate/` files.
 *
 * Writes the workspace manifest, context, and links to disk, then stamps
 * `synced_at` on every context row so subsequent status checks show a clean tree.
 * The caller is responsible for committing the files with git.
 *
 * @param {string} workspaceId - The workspace UUID
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Log each written file
 * @returns {Promise<Object>} Result with counts, root path, and written files
 */
export async function pushChanges(workspaceId, options = {}) {
  const db = getDb();
  const { verbose } = options;

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  const root = resolveWorkspaceRoot(db, workspace);

  let counts;
  try {
    counts = serializeWorkspace(db, workspace, root);
  } catch (err) {
    return { error: `Failed to write .substrate files: ${err.message}` };
  }

  // Mark everything serialized as of now.
  const now = new Date().toISOString();
  db.prepare('UPDATE context SET synced_at = ? WHERE workspace_id = ?').run(now, workspaceId);

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
 * Reconcile `.substrate/` files into the local DB.
 *
 * Reads committed files (typically after a `git pull`) and applies them to the
 * cache: new context is inserted, existing context is updated when the file copy
 * is newer (last-write-wins by `updated_at`), and tombstones soft-delete locally.
 * Links present in the files are upserted; link deletions do not propagate (a
 * removed link is simply absent and is treated as not-present rather than deleted).
 *
 * @param {string} workspaceId - The workspace UUID
 * @param {Object} [options]
 * @param {boolean} [options.verbose] - Log each reconciled item
 * @returns {Promise<Object>} Result with pulled/updated/skipped counts
 */
export async function pullChanges(workspaceId, options = {}) {
  const db = getDb();
  const { verbose } = options;

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  if (!workspace) {
    return { error: 'Workspace not found' };
  }

  const root = resolveWorkspaceRoot(db, workspace);

  if (!hasWorkspaceFiles(root)) {
    return { error: `No .substrate files found at ${root}. Nothing to pull.` };
  }

  const { manifest, context: fileContext, links: fileLinks } = readWorkspaceFiles(root);

  const results = { pulled: 0, updated: 0, skipped: 0, links: 0 };
  const now = new Date().toISOString();

  // Adopt workspace identity from the manifest (corrects a freshly-pinned shell).
  if (manifest && (workspace.name === 'pending-sync' || !workspace.name)) {
    db.prepare('UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
      manifest.name || workspace.name,
      manifest.description || '',
      now,
      workspaceId
    );
  }

  const insertStmt = db.prepare(
    `INSERT INTO context
       (id, workspace_id, type, content, tags, scope, meta, private, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStmt = db.prepare(
    `UPDATE context
       SET type = ?, content = ?, tags = ?, scope = ?, meta = ?, private = ?, updated_at = ?, synced_at = ?, deleted_at = ?
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
        workspaceId,
        rec.type,
        rec.content,
        tags,
        rec.scope || '*',
        meta,
        priv,
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
 * Full sync: reconcile files into the DB, then re-serialize the merged state.
 *
 * Mirrors a git workflow -- pull first to absorb others' changes, then push so
 * the files reflect the local DB (ready for the user to commit).
 *
 * @param {string} workspaceId - The workspace UUID
 * @param {Object} [options]
 * @returns {Promise<Object>} Combined pull and push results
 */
export async function syncWorkspace(workspaceId, options = {}) {
  const pullResult = await pullChanges(workspaceId, options);
  // A missing-files pull is fine on first sync; push will create them.
  const pushResult = await pushChanges(workspaceId, options);

  return {
    pull: pullResult,
    push: pushResult
  };
}
