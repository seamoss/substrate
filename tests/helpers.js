import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { vi } from 'vitest';

/**
 * Creates an isolated test database with the full schema.
 * Returns the database instance and a cleanup function.
 */
export function createTestDb() {
  const tempDir = mkdtempSync(join(tmpdir(), 'substrate-test-'));
  const dbPath = join(tempDir, 'test.db');
  const db = new Database(dbPath);

  // Initialize schema (mirrors src/db/local.js)
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

    CREATE INDEX IF NOT EXISTS idx_mounts_path ON mounts(path);
    CREATE INDEX IF NOT EXISTS idx_context_workspace ON context(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_context_type ON context(type);
    CREATE INDEX IF NOT EXISTS idx_context_synced ON context(synced_at);
    CREATE INDEX IF NOT EXISTS idx_workspaces_synced ON workspaces(synced_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id);
  `);

  const cleanup = () => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  };

  return { db, dbPath, tempDir, cleanup };
}

/**
 * Creates a workspace in the test database.
 */
export function createWorkspace(
  db,
  { name = 'test-workspace', description = '', projectId = null } = {}
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const pid = projectId || randomUUID();

  db.prepare(
    `
    INSERT INTO workspaces (id, name, description, project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(id, name, description, pid, now, now);

  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
}

/**
 * Creates a mount in the test database.
 */
export function createMount(db, { workspaceId, path, scope = '*', tags = [] }) {
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO mounts (workspace_id, path, scope, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(workspaceId, path, scope, JSON.stringify(tags), now, now);

  return db
    .prepare('SELECT * FROM mounts WHERE workspace_id = ? AND path = ?')
    .get(workspaceId, path);
}

/**
 * Creates a context item in the test database.
 */
export function createContext(
  db,
  { workspaceId, type = 'note', content, tags = [], scope = '*', meta = {} }
) {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    workspaceId,
    type,
    content,
    JSON.stringify(tags),
    scope,
    JSON.stringify(meta),
    now,
    now
  );

  return db.prepare('SELECT * FROM context WHERE id = ?').get(id);
}

/**
 * Creates a link between two context items.
 */
export function createLink(db, { fromId, toId, relation = 'relates_to' }) {
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO links (from_id, to_id, relation, created_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(fromId, toId, relation, now);

  return db.prepare('SELECT * FROM links WHERE from_id = ? AND to_id = ?').get(fromId, toId);
}

/**
 * Mock the API module with default implementations.
 * All methods return successful responses by default.
 */
export function createMockApi() {
  return {
    listWorkspaces: vi.fn().mockResolvedValue({ workspaces: [] }),
    getWorkspace: vi.fn().mockResolvedValue({ workspace: null }),
    createWorkspace: vi.fn().mockResolvedValue({ workspace: { id: 'remote-123' } }),
    getWorkspaceByProjectId: vi.fn().mockResolvedValue({ workspace: null }),
    listMounts: vi.fn().mockResolvedValue({ mounts: [] }),
    resolveMount: vi.fn().mockResolvedValue({ mount: null }),
    createMount: vi.fn().mockResolvedValue({ mount: { id: 1 } }),
    listContext: vi.fn().mockResolvedValue({ context: [] }),
    getBrief: vi.fn().mockResolvedValue({ brief: {} }),
    addContext: vi.fn().mockResolvedValue({ context: { id: 'ctx-123' } }),
    linkContext: vi.fn().mockResolvedValue({ link: { id: 1 } }),
    getRelated: vi.fn().mockResolvedValue({ related: [] }),
    syncPush: vi.fn().mockResolvedValue({ synced: [] }),
    syncPull: vi.fn().mockResolvedValue({ changes: [] }),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    init: vi.fn().mockResolvedValue({ api_key: 'test-key' }),
    signup: vi.fn().mockResolvedValue({ message: 'Code sent' }),
    verify: vi.fn().mockResolvedValue({ api_key: 'test-key' }),
    me: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
    listKeys: vi.fn().mockResolvedValue({ keys: [] }),
    createKey: vi.fn().mockResolvedValue({ key: { id: 'key-123' } }),
    revokeKey: vi.fn().mockResolvedValue({ success: true }),
    createWorkspaceToken: vi.fn().mockResolvedValue({ token: 'ws-token' }),
    listWorkspaceTokens: vi.fn().mockResolvedValue({ tokens: [] }),
    revokeWorkspaceToken: vi.fn().mockResolvedValue({ success: true })
  };
}

/**
 * Captures console output during a test.
 */
export function captureConsole() {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));

  const restore = () => {
    console.log = originalLog;
    console.error = originalError;
  };

  return { logs, errors, restore };
}
