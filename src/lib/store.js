/**
 * Store resolution.
 *
 * Substrate operates on the `.substrate/` directory of the repository you're in,
 * discovered by walking up from the current directory — exactly like git finds
 * `.git`. One repo = one `.substrate/` = one context store. There is no
 * workspace registry, no mounts, and no project pinning: the location of
 * `.substrate/` defines the project.
 *
 * The SQLite database is a per-machine cache; a `workspaces` row is an internal
 * cache anchor keyed by the store's stable `project_id` (from `workspace.json` /
 * `config.json`). It is created on demand from the committed files and is never
 * user-managed.
 *
 * @module lib/store
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { readWorkspaceFiles } from './files.js';

/**
 * Walk up from a starting directory to find the nearest `.substrate/` store root.
 *
 * @param {string} [start] - Directory to start from (default: cwd)
 * @returns {string|null} The directory containing `.substrate/`, or null if none
 */
export function findSubstrateRoot(start = process.cwd()) {
  let dir = start;
  for (;;) {
    const sub = join(dir, '.substrate');
    if (existsSync(join(sub, 'config.json')) || existsSync(join(sub, 'workspace.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Read the store's stable project_id from its `.substrate/` files.
 *
 * @param {string} root - Store root directory
 * @returns {string|null}
 */
function readProjectId(root) {
  const cfgPath = join(root, '.substrate', 'config.json');
  if (existsSync(cfgPath)) {
    try {
      const id = JSON.parse(readFileSync(cfgPath, 'utf8')).project_id;
      if (id) return id;
    } catch {
      // fall through to manifest
    }
  }
  return readWorkspaceFiles(root).manifest?.project_id || null;
}

/**
 * Resolve the context store for the current directory.
 *
 * Finds the enclosing `.substrate/`, then returns its cache anchor row (creating
 * one from the committed files if this machine hasn't seen the store yet).
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {string} [start] - Directory to resolve from (default: cwd)
 * @returns {{ workspace: Object, root: string }|null} The store, or null if not in a Substrate project
 */
export function resolveStore(db, start = process.cwd()) {
  const root = findSubstrateRoot(start);
  if (!root) return null;

  const projectId = readProjectId(root);
  let workspace = projectId
    ? db.prepare('SELECT * FROM workspaces WHERE project_id = ?').get(projectId)
    : null;

  if (!workspace) {
    const { manifest } = readWorkspaceFiles(root);
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
    workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  }

  return { workspace, root };
}

/**
 * Resolve the store or print a consistent error and exit.
 *
 * Convenience for command actions: every command operates on the enclosing
 * `.substrate/`, so this centralizes the "not in a project" message.
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {(msg: string) => void} onError - Error printer (e.g. output.error)
 * @returns {{ workspace: Object, root: string }} The resolved store (process exits if none)
 */
export function requireStore(db, onError) {
  const store = resolveStore(db);
  if (!store) {
    onError('Not in a Substrate project. Run `substrate init` here first.');
    process.exit(1);
  }
  return store;
}
