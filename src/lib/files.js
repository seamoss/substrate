/**
 * File store for git-backed sync.
 *
 * Substrate's durable state lives in a single `.substrate/` directory, with shared
 * and personal context separated by filename rather than by directory:
 *
 * - **`context.jsonl` / `links.jsonl`** — the shared "collective mind": committed to
 *   git and synced between contributors. This is the source of truth for shared context.
 * - **`context.priv.jsonl` / `links.priv.jsonl`** — personal context: gitignored (via the
 *   `*.priv.jsonl` pattern), never committed, local to one contributor (e.g. machine-specific
 *   env notes).
 *
 * The local SQLite database (`~/.substrate/local.db`) is a rebuildable cache of both.
 * An item's privacy is recorded by the `context.private` column and, on disk, by *which
 * file it lives in* — the records themselves are identical in shape regardless of privacy.
 *
 * ## Layout
 *
 * ```
 * .substrate/
 *   config.json           project_id pin (managed by lib/config.js)   [committed]
 *   workspace.json        workspace manifest (project_id, name, ...)   [committed]
 *   context.jsonl         shared context items, sorted by id           [committed]
 *   links.jsonl           shared links, sorted by (from, to, relation) [committed]
 *   context.priv.jsonl    personal context items                       [gitignored]
 *   links.priv.jsonl      personal links (either endpoint private)     [gitignored]
 * ```
 *
 * Records are written one-per-line, deterministically ordered, with a stable key order,
 * so git can auto-merge disjoint edits to the shared files. Deletions travel as tombstone
 * records (`deleted_at` set), never as omissions.
 *
 * The shared identity of a workspace is its `project_id` (stable across machines and stored
 * in `workspace.json`); the SQLite `workspaces.id` is a machine-local cache key and is
 * intentionally NOT serialized.
 *
 * @module lib/files
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SUBSTRATE_DIR = '.substrate';
const WORKSPACE_FILE = 'workspace.json';
const CONTEXT_FILE = 'context.jsonl';
const CONTEXT_PRIVATE_FILE = 'context.priv.jsonl';
const LINKS_FILE = 'links.jsonl';
const LINKS_PRIVATE_FILE = 'links.priv.jsonl';

/** Gitignore pattern that keeps the personal `*.priv.jsonl` files out of version control. */
export const PRIVATE_IGNORE_PATTERN = '*.priv.jsonl';

/** Current on-disk format version, written into workspace.json. */
const FORMAT_VERSION = 1;

/**
 * Resolve every `.substrate/` file path for a project root directory.
 *
 * @param {string} root - The project root directory
 * @returns {{ dir: string, workspace: string, context: string, contextPrivate: string, links: string, linksPrivate: string }}
 */
export function substratePaths(root) {
  const dir = join(root, SUBSTRATE_DIR);
  return {
    dir,
    workspace: join(dir, WORKSPACE_FILE),
    context: join(dir, CONTEXT_FILE),
    contextPrivate: join(dir, CONTEXT_PRIVATE_FILE),
    links: join(dir, LINKS_FILE),
    linksPrivate: join(dir, LINKS_PRIVATE_FILE)
  };
}

/**
 * Build a context file record from a SQLite context row.
 *
 * Strips machine-local and privacy-implied columns (`workspace_id`, `private`,
 * `remote_id`, `synced_at`) and decodes JSON columns. The on-disk shape is identical
 * for shared and private items — the file the record lives in encodes privacy.
 *
 * @param {Object} row - A row from the `context` table
 * @returns {Object} Portable context record
 */
function contextRowToRecord(row) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    scope: row.scope || '*',
    meta: JSON.parse(row.meta || '{}'),
    status: row.status || 'active',
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at || null
  };
}

/**
 * Build a link file record from a SQLite links row.
 *
 * @param {Object} row - A row from the `links` table
 * @returns {Object} Portable link record
 */
function linkRowToRecord(row) {
  return {
    from_id: row.from_id,
    to_id: row.to_id,
    relation: row.relation || 'relates_to',
    created_at: row.created_at
  };
}

/**
 * Serialize an array of records to deterministic JSONL text.
 *
 * @param {Object[]} records - Already-sorted records
 * @returns {string} Newline-terminated JSONL (empty string for no records)
 */
function toJsonl(records) {
  if (records.length === 0) return '';
  return records.map(r => JSON.stringify(r)).join('\n') + '\n';
}

/**
 * Parse JSONL text into an array of records, skipping blank lines.
 *
 * @param {string} text - JSONL file contents
 * @returns {Object[]} Parsed records
 */
function fromJsonl(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

/**
 * Serialize a workspace's full state from the local DB into the `.substrate/` files.
 *
 * Shared items (`private = 0`) go to `context.jsonl` / `links.jsonl`; private items
 * (`private = 1`) go to `context.priv.jsonl` / `links.priv.jsonl` in the same directory.
 * A link is private when either endpoint is private. Soft-deleted context (tombstones)
 * IS included so deletions propagate.
 *
 * The private files are written when there is private content, or rewritten if they
 * already exist (so un-privating an item removes it from disk).
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {Object} workspace - The workspace row (id, project_id, name, description)
 * @param {string} root - Project root directory to write `.substrate/` into
 * @returns {{ context: number, links: number, tombstones: number, privateContext: number, privateLinks: number }}
 */
export function serializeWorkspace(db, workspace, root) {
  const paths = substratePaths(root);

  const contextRows = db
    .prepare('SELECT * FROM context WHERE workspace_id = ? ORDER BY id ASC')
    .all(workspace.id);

  const linkRows = db
    .prepare(
      `SELECT l.*, cf.private AS from_private, ct.private AS to_private
       FROM links l
       JOIN context cf ON l.from_id = cf.id
       JOIN context ct ON l.to_id = ct.id
       WHERE cf.workspace_id = ?
       ORDER BY l.from_id ASC, l.to_id ASC, l.relation ASC`
    )
    .all(workspace.id);

  const sharedContext = contextRows.filter(r => !r.private).map(contextRowToRecord);
  const privateContext = contextRows.filter(r => r.private).map(contextRowToRecord);
  const sharedLinks = linkRows.filter(l => !l.from_private && !l.to_private).map(linkRowToRecord);
  const privateLinks = linkRows.filter(l => l.from_private || l.to_private).map(linkRowToRecord);

  const manifest = {
    version: FORMAT_VERSION,
    project_id: workspace.project_id,
    name: workspace.name,
    description: workspace.description || ''
  };

  if (!existsSync(paths.dir)) mkdirSync(paths.dir, { recursive: true });

  // Shared files -- always written.
  writeFileSync(paths.workspace, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(paths.context, toJsonl(sharedContext));
  writeFileSync(paths.links, toJsonl(sharedLinks));

  // Private files -- written when there is private content, or rewritten if they
  // already exist (to clear items that were made shared).
  if (privateContext.length || existsSync(paths.contextPrivate)) {
    writeFileSync(paths.contextPrivate, toJsonl(privateContext));
  }
  if (privateLinks.length || existsSync(paths.linksPrivate)) {
    writeFileSync(paths.linksPrivate, toJsonl(privateLinks));
  }

  return {
    context: sharedContext.length,
    links: sharedLinks.length,
    tombstones: sharedContext.filter(r => r.deleted_at).length,
    privateContext: privateContext.length,
    privateLinks: privateLinks.length
  };
}

/**
 * Read a workspace's `.substrate/` files from disk, merging shared and private records.
 *
 * Each returned context and link record carries a `private` flag (0 for shared, 1 for
 * private) derived from the file it came from, so callers can reconcile the
 * `context.private` column without the on-disk format needing the field.
 *
 * @param {string} root - Project root directory
 * @returns {{ manifest: Object|null, context: Object[], links: Object[] }}
 *   `manifest` is null when no `workspace.json` exists.
 */
export function readWorkspaceFiles(root) {
  const paths = substratePaths(root);

  const manifest = existsSync(paths.workspace)
    ? JSON.parse(readFileSync(paths.workspace, 'utf8'))
    : null;

  const readFile = (file, isPrivate) =>
    existsSync(file)
      ? fromJsonl(readFileSync(file, 'utf8')).map(r => ({ ...r, private: isPrivate }))
      : [];

  return {
    manifest,
    context: [...readFile(paths.context, 0), ...readFile(paths.contextPrivate, 1)],
    links: [...readFile(paths.links, 0), ...readFile(paths.linksPrivate, 1)]
  };
}

/**
 * Whether a project root has any serialized shared substrate files.
 *
 * @param {string} root - Project root directory
 * @returns {boolean}
 */
export function hasWorkspaceFiles(root) {
  const paths = substratePaths(root);
  return existsSync(paths.workspace) || existsSync(paths.context);
}
