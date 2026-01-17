/**
 * Local SQLite database management for offline-first context storage.
 *
 * This module provides the local database layer for Substrate. All context
 * is stored locally first (offline-first), then synced to the remote server.
 *
 * ## Database Schema
 *
 * - **workspaces** - Project containers with sync metadata
 * - **mounts** - Directory-to-workspace mappings
 * - **context** - The actual context items (notes, constraints, decisions, etc.)
 * - **links** - Relationships between context items
 * - **sessions** - Work session tracking
 *
 * @module db/local
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getDbPath } from '../lib/config.js';

/**
 * Singleton database instance.
 * @type {import('better-sqlite3').Database|null}
 * @private
 */
let db = null;

/**
 * @typedef {Object} Workspace
 * @property {string} id - UUID primary key
 * @property {string} name - Workspace display name
 * @property {string|null} description - Optional description
 * @property {string} project_id - Unique project identifier for pinning
 * @property {string|null} remote_id - ID on remote server (after sync)
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 * @property {string|null} synced_at - Last sync timestamp
 * @property {string|null} deleted_at - Soft delete timestamp
 */

/**
 * @typedef {Object} Mount
 * @property {number} id - Auto-increment primary key
 * @property {string} workspace_id - Foreign key to workspaces
 * @property {string} path - Absolute filesystem path
 * @property {string} scope - Scope pattern (default: '*')
 * @property {string} tags - JSON-encoded array of tags
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 */

/**
 * @typedef {Object} ContextItem
 * @property {string} id - UUID primary key
 * @property {string} workspace_id - Foreign key to workspaces
 * @property {string} type - Context type (note, constraint, decision, task, entity, runbook, snippet)
 * @property {string} content - The text content
 * @property {string} tags - JSON-encoded array of tags
 * @property {string} scope - Scope path pattern (default: '*')
 * @property {string} meta - JSON-encoded metadata object
 * @property {string|null} remote_id - ID on remote server (after sync)
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 * @property {string|null} synced_at - Last sync timestamp
 * @property {string|null} deleted_at - Soft delete timestamp
 */

/**
 * @typedef {Object} Link
 * @property {number} id - Auto-increment primary key
 * @property {string} from_id - Source context item UUID
 * @property {string} to_id - Target context item UUID
 * @property {string} relation - Relationship type (relates_to, depends_on, blocks, implements, extends, references)
 * @property {string} created_at - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Session
 * @property {string} id - UUID primary key
 * @property {string} workspace_id - Foreign key to workspaces
 * @property {string|null} name - Optional session name
 * @property {string} started_at - ISO 8601 timestamp
 * @property {string|null} ended_at - ISO 8601 timestamp (null if active)
 */

/**
 * Get the database instance, initializing it if necessary.
 *
 * On first call, this:
 * 1. Opens/creates the SQLite database at `~/.substrate/local.db`
 * 2. Creates all tables if they don't exist
 * 3. Runs any pending migrations
 *
 * Subsequent calls return the cached instance.
 *
 * @returns {import('better-sqlite3').Database} The database instance
 *
 * @example
 * const db = getDb();
 * const workspace = db.prepare('SELECT * FROM workspaces WHERE name = ?').get('myproject');
 */
export function getDb() {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_id TEXT UNIQUE,
      remote_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      scope TEXT DEFAULT '*',
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS context (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      scope TEXT DEFAULT '*',
      meta TEXT DEFAULT '{}',
      remote_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT DEFAULT 'relates_to',
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_id) REFERENCES context(id),
      FOREIGN KEY (to_id) REFERENCES context(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE INDEX IF NOT EXISTS idx_mounts_path ON mounts(path);
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(ended_at);
    CREATE INDEX IF NOT EXISTS idx_context_workspace ON context(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_context_type ON context(type);
    CREATE INDEX IF NOT EXISTS idx_context_synced ON context(synced_at);
    CREATE INDEX IF NOT EXISTS idx_workspaces_synced ON workspaces(synced_at);
  `);

  // Run migrations for existing databases
  runMigrations(db);

  return db;
}

/**
 * Run database migrations for schema updates.
 *
 * Handles backwards-compatible schema changes for existing databases:
 * - Adds `deleted_at` column to context table (soft deletes)
 * - Adds `deleted_at` column to workspaces table (soft deletes)
 * - Adds `project_id` column to workspaces table (project pinning)
 * - Creates unique index on `project_id`
 *
 * @param {import('better-sqlite3').Database} db - The database instance
 * @private
 */
function runMigrations(db) {
  // Check and add deleted_at to context if missing
  const contextInfo = db.prepare('PRAGMA table_info(context)').all();
  const hasDeletedAt = contextInfo.some(col => col.name === 'deleted_at');
  if (!hasDeletedAt) {
    db.exec('ALTER TABLE context ADD COLUMN deleted_at TEXT');
  }

  // Check and add deleted_at to workspaces if missing
  const workspaceInfo = db.prepare('PRAGMA table_info(workspaces)').all();
  const wsHasDeletedAt = workspaceInfo.some(col => col.name === 'deleted_at');
  if (!wsHasDeletedAt) {
    db.exec('ALTER TABLE workspaces ADD COLUMN deleted_at TEXT');
  }

  // Check and add project_id to workspaces if missing
  const wsHasProjectId = workspaceInfo.some(col => col.name === 'project_id');
  if (!wsHasProjectId) {
    db.exec('ALTER TABLE workspaces ADD COLUMN project_id TEXT');

    // Generate project_id for existing workspaces
    const workspaces = db.prepare('SELECT id FROM workspaces WHERE project_id IS NULL').all();
    const updateStmt = db.prepare('UPDATE workspaces SET project_id = ? WHERE id = ?');
    for (const ws of workspaces) {
      updateStmt.run(randomUUID(), ws.id);
    }
  }

  // Always ensure the project_id index exists (handles both new and migrated DBs)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id)');
}

/**
 * Close the database connection and release resources.
 *
 * Resets the singleton instance so next {@link getDb} call creates a fresh connection.
 * Call this when shutting down the CLI or in tests for cleanup.
 *
 * @example
 * // In test cleanup
 * afterEach(() => {
 *   closeDb();
 * });
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
