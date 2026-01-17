import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getDbPath } from '../lib/config.js';

let db = null;

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

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
