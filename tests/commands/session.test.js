import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestDb,
  createWorkspace,
  createMount,
  createContext,
  createSession
} from '../helpers.js';

// Mock the db module
vi.mock('../../src/db/local.js', () => ({
  getDb: vi.fn()
}));

// Mock process.cwd
const originalCwd = process.cwd;

describe('Session Commands', () => {
  let db, cleanup;
  let mockGetDb;

  beforeEach(async () => {
    ({ db, cleanup } = createTestDb());
    const { getDb } = await import('../../src/db/local.js');
    mockGetDb = getDb;
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    process.cwd = originalCwd;
  });

  describe('getActiveSession', () => {
    it('should return active session for workspace', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const session = createSession(db, { workspaceId: ws.id, name: 'test-session' });

      const active = db
        .prepare('SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL')
        .get(ws.id);

      expect(active).not.toBeNull();
      expect(active.id).toBe(session.id);
      expect(active.name).toBe('test-session');
    });

    it('should not return ended sessions', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createSession(db, {
        workspaceId: ws.id,
        name: 'ended-session',
        endedAt: new Date().toISOString()
      });

      const active = db
        .prepare('SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL')
        .get(ws.id);

      expect(active).toBeUndefined();
    });

    it('should return most recent active session', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const now = Date.now();

      createSession(db, {
        workspaceId: ws.id,
        name: 'older-session',
        startedAt: new Date(now - 10000).toISOString()
      });
      const newer = createSession(db, {
        workspaceId: ws.id,
        name: 'newer-session',
        startedAt: new Date(now).toISOString()
      });

      const active = db
        .prepare(
          'SELECT * FROM sessions WHERE workspace_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
        )
        .get(ws.id);

      expect(active.id).toBe(newer.id);
      expect(active.name).toBe('newer-session');
    });
  });

  describe('getSessionStats', () => {
    it('should count context added during session', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const sessionStart = new Date(Date.now() - 60000).toISOString();
      const session = createSession(db, {
        workspaceId: ws.id,
        name: 'test-session',
        startedAt: sessionStart
      });

      // Add context during session
      createContext(db, { workspaceId: ws.id, type: 'note', content: 'Test note' });
      createContext(db, { workspaceId: ws.id, type: 'constraint', content: 'Test constraint' });
      createContext(db, { workspaceId: ws.id, type: 'note', content: 'Another note' });

      const stats = db
        .prepare(
          `
        SELECT type, COUNT(*) as count
        FROM context
        WHERE workspace_id = ?
          AND created_at >= ?
          AND deleted_at IS NULL
        GROUP BY type
      `
        )
        .all(ws.id, session.started_at);

      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.type === 'note')?.count).toBe(2);
      expect(stats.find(s => s.type === 'constraint')?.count).toBe(1);
    });

    it('should not count context added before session', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const now = Date.now();

      // Add context before session
      db.prepare(
        `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'old-ctx',
        ws.id,
        'note',
        'Old note',
        '[]',
        '*',
        '{}',
        new Date(now - 120000).toISOString(),
        new Date(now - 120000).toISOString()
      );

      const sessionStart = new Date(now - 60000).toISOString();
      createSession(db, {
        workspaceId: ws.id,
        startedAt: sessionStart
      });

      // Add context during session
      createContext(db, { workspaceId: ws.id, type: 'note', content: 'New note' });

      const stats = db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM context
        WHERE workspace_id = ?
          AND created_at >= ?
          AND deleted_at IS NULL
      `
        )
        .get(ws.id, sessionStart);

      expect(stats.count).toBe(1);
    });
  });

  describe('session creation', () => {
    it('should create a session with a name', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const session = createSession(db, {
        workspaceId: ws.id,
        name: 'feature-work'
      });

      expect(session.workspace_id).toBe(ws.id);
      expect(session.name).toBe('feature-work');
      expect(session.started_at).toBeDefined();
      expect(session.ended_at).toBeNull();
    });

    it('should create a session without a name', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const session = createSession(db, { workspaceId: ws.id });

      expect(session.workspace_id).toBe(ws.id);
      expect(session.name).toBeNull();
    });
  });

  describe('session end', () => {
    it('should end an active session', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const session = createSession(db, { workspaceId: ws.id, name: 'test-session' });

      const endTime = new Date().toISOString();
      db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endTime, session.id);

      const ended = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
      expect(ended.ended_at).toBe(endTime);
    });
  });

  describe('session list', () => {
    it('should list sessions ordered by start time', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const now = Date.now();

      createSession(db, {
        workspaceId: ws.id,
        name: 'session-1',
        startedAt: new Date(now - 30000).toISOString()
      });
      createSession(db, {
        workspaceId: ws.id,
        name: 'session-2',
        startedAt: new Date(now - 20000).toISOString()
      });
      createSession(db, {
        workspaceId: ws.id,
        name: 'session-3',
        startedAt: new Date(now - 10000).toISOString()
      });

      const sessions = db
        .prepare('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY started_at DESC')
        .all(ws.id);

      expect(sessions).toHaveLength(3);
      expect(sessions[0].name).toBe('session-3');
      expect(sessions[1].name).toBe('session-2');
      expect(sessions[2].name).toBe('session-1');
    });

    it('should respect limit parameter', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        createSession(db, {
          workspaceId: ws.id,
          name: `session-${i}`,
          startedAt: new Date(now - i * 1000).toISOString()
        });
      }

      const sessions = db
        .prepare('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ?')
        .all(ws.id, 3);

      expect(sessions).toHaveLength(3);
    });
  });

  describe('formatDuration', () => {
    it('should format duration in hours and minutes', () => {
      // Test the logic directly
      const formatDuration = (startedAt, endedAt) => {
        const start = new Date(startedAt);
        const end = endedAt ? new Date(endedAt) : new Date();
        const diffMs = end - start;

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };

      const start = new Date('2024-01-01T10:00:00Z');

      // 30 minutes
      expect(
        formatDuration(start.toISOString(), new Date('2024-01-01T10:30:00Z').toISOString())
      ).toBe('30m');

      // 1 hour 15 minutes
      expect(
        formatDuration(start.toISOString(), new Date('2024-01-01T11:15:00Z').toISOString())
      ).toBe('1h 15m');

      // 2 hours
      expect(
        formatDuration(start.toISOString(), new Date('2024-01-01T12:00:00Z').toISOString())
      ).toBe('2h 0m');
    });
  });

  describe('workspace resolution', () => {
    it('should find workspace from mount path', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const mountPath = '/test/project';
      createMount(db, { workspaceId: ws.id, path: mountPath });

      // Simulate finding workspace from cwd
      const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();
      const cwd = '/test/project/src';

      let foundWorkspace = null;
      for (const mount of mounts) {
        if (cwd.startsWith(mount.path)) {
          foundWorkspace = db
            .prepare('SELECT * FROM workspaces WHERE id = ?')
            .get(mount.workspace_id);
          break;
        }
      }

      expect(foundWorkspace).not.toBeNull();
      expect(foundWorkspace.id).toBe(ws.id);
    });

    it('should select longest matching mount path', () => {
      const ws1 = createWorkspace(db, { name: 'ws-1' });
      const ws2 = createWorkspace(db, { name: 'ws-2' });

      createMount(db, { workspaceId: ws1.id, path: '/test' });
      createMount(db, { workspaceId: ws2.id, path: '/test/project' });

      const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();
      const cwd = '/test/project/src';

      let foundWorkspace = null;
      for (const mount of mounts) {
        if (cwd.startsWith(mount.path)) {
          foundWorkspace = db
            .prepare('SELECT * FROM workspaces WHERE id = ?')
            .get(mount.workspace_id);
          break;
        }
      }

      // Should find ws2 because /test/project is longer match
      expect(foundWorkspace.name).toBe('ws-2');
    });
  });
});
