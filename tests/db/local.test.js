import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestDb,
  createWorkspace,
  createMount,
  createContext,
  createLink
} from '../helpers.js';

describe('Database Schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe('workspaces table', () => {
    it('should create a workspace with all fields', () => {
      const ws = createWorkspace(db, {
        name: 'my-project',
        description: 'Test project'
      });

      expect(ws.name).toBe('my-project');
      expect(ws.description).toBe('Test project');
      expect(ws.id).toBeDefined();
      expect(ws.project_id).toBeDefined();
      expect(ws.created_at).toBeDefined();
      expect(ws.updated_at).toBeDefined();
    });

    it('should enforce unique project_id', () => {
      const projectId = 'proj-123';
      createWorkspace(db, { name: 'ws1', projectId });

      expect(() => {
        createWorkspace(db, { name: 'ws2', projectId });
      }).toThrow();
    });

    it('should allow null remote_id initially', () => {
      const ws = createWorkspace(db, { name: 'local-only' });
      expect(ws.remote_id).toBeNull();
    });
  });

  describe('mounts table', () => {
    it('should create a mount linked to workspace', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const mount = createMount(db, {
        workspaceId: ws.id,
        path: '/Users/test/project'
      });

      expect(mount.workspace_id).toBe(ws.id);
      expect(mount.path).toBe('/Users/test/project');
      expect(mount.scope).toBe('*');
    });

    it('should enforce unique paths', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createMount(db, { workspaceId: ws.id, path: '/unique/path' });

      expect(() => {
        createMount(db, { workspaceId: ws.id, path: '/unique/path' });
      }).toThrow();
    });

    it('should store tags as JSON', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const mount = createMount(db, {
        workspaceId: ws.id,
        path: '/tagged/path',
        tags: ['frontend', 'react']
      });

      expect(JSON.parse(mount.tags)).toEqual(['frontend', 'react']);
    });
  });

  describe('context table', () => {
    it('should create context with default type note', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const ctx = createContext(db, {
        workspaceId: ws.id,
        content: 'This is a note'
      });

      expect(ctx.type).toBe('note');
      expect(ctx.content).toBe('This is a note');
    });

    it('should support all context types', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const types = ['note', 'constraint', 'decision', 'task', 'entity', 'runbook', 'snippet'];

      types.forEach(type => {
        const ctx = createContext(db, {
          workspaceId: ws.id,
          type,
          content: `Content for ${type}`
        });
        expect(ctx.type).toBe(type);
      });
    });

    it('should store tags and meta as JSON', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const ctx = createContext(db, {
        workspaceId: ws.id,
        content: 'Test content',
        tags: ['important', 'api'],
        meta: { source: 'test', version: 1 }
      });

      expect(JSON.parse(ctx.tags)).toEqual(['important', 'api']);
      expect(JSON.parse(ctx.meta)).toEqual({ source: 'test', version: 1 });
    });

    it('should filter by workspace_id', () => {
      const ws1 = createWorkspace(db, { name: 'ws1' });
      const ws2 = createWorkspace(db, { name: 'ws2' });

      createContext(db, { workspaceId: ws1.id, content: 'ws1 content' });
      createContext(db, { workspaceId: ws2.id, content: 'ws2 content' });

      const ws1Items = db.prepare('SELECT * FROM context WHERE workspace_id = ?').all(ws1.id);
      const ws2Items = db.prepare('SELECT * FROM context WHERE workspace_id = ?').all(ws2.id);

      expect(ws1Items).toHaveLength(1);
      expect(ws1Items[0].content).toBe('ws1 content');
      expect(ws2Items).toHaveLength(1);
      expect(ws2Items[0].content).toBe('ws2 content');
    });

    it('should filter by type', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      createContext(db, { workspaceId: ws.id, type: 'constraint', content: 'Must be JSON' });
      createContext(db, { workspaceId: ws.id, type: 'decision', content: 'Use REST API' });
      createContext(db, { workspaceId: ws.id, type: 'note', content: 'General note' });

      const constraints = db.prepare('SELECT * FROM context WHERE type = ?').all('constraint');
      expect(constraints).toHaveLength(1);
      expect(constraints[0].content).toBe('Must be JSON');
    });
  });

  describe('links table', () => {
    it('should create link between context items', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const ctx1 = createContext(db, { workspaceId: ws.id, content: 'Item 1' });
      const ctx2 = createContext(db, { workspaceId: ws.id, content: 'Item 2' });

      const link = createLink(db, {
        fromId: ctx1.id,
        toId: ctx2.id,
        relation: 'depends_on'
      });

      expect(link.from_id).toBe(ctx1.id);
      expect(link.to_id).toBe(ctx2.id);
      expect(link.relation).toBe('depends_on');
    });

    it('should support all relation types', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const relations = [
        'relates_to',
        'depends_on',
        'blocks',
        'implements',
        'extends',
        'references'
      ];

      relations.forEach(relation => {
        const ctx1 = createContext(db, { workspaceId: ws.id, content: `From ${relation}` });
        const ctx2 = createContext(db, { workspaceId: ws.id, content: `To ${relation}` });
        const link = createLink(db, { fromId: ctx1.id, toId: ctx2.id, relation });
        expect(link.relation).toBe(relation);
      });
    });

    it('should allow multiple links from same context', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const ctx1 = createContext(db, { workspaceId: ws.id, content: 'Source' });
      const ctx2 = createContext(db, { workspaceId: ws.id, content: 'Target 1' });
      const ctx3 = createContext(db, { workspaceId: ws.id, content: 'Target 2' });

      createLink(db, { fromId: ctx1.id, toId: ctx2.id });
      createLink(db, { fromId: ctx1.id, toId: ctx3.id });

      const links = db.prepare('SELECT * FROM links WHERE from_id = ?').all(ctx1.id);
      expect(links).toHaveLength(2);
    });
  });
});

describe('Database Queries', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  it('should find workspace by mount path (longest match)', () => {
    const ws1 = createWorkspace(db, { name: 'parent-ws' });
    const ws2 = createWorkspace(db, { name: 'child-ws' });

    createMount(db, { workspaceId: ws1.id, path: '/Users/test' });
    createMount(db, { workspaceId: ws2.id, path: '/Users/test/project' });

    const testPath = '/Users/test/project/src/file.js';

    // Query mounts sorted by path length descending
    const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

    let foundWorkspace = null;
    for (const mount of mounts) {
      if (testPath.startsWith(mount.path)) {
        foundWorkspace = db
          .prepare('SELECT * FROM workspaces WHERE id = ?')
          .get(mount.workspace_id);
        break;
      }
    }

    expect(foundWorkspace.name).toBe('child-ws');
  });

  it('should list context ordered by created_at descending', () => {
    const ws = createWorkspace(db, { name: 'test-ws' });
    const now = Date.now();

    // Insert items with explicit timestamps to ensure ordering
    db.prepare(
      `
      INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'id-1',
      ws.id,
      'note',
      'First',
      '[]',
      '*',
      '{}',
      new Date(now - 2000).toISOString(),
      new Date(now - 2000).toISOString()
    );

    db.prepare(
      `
      INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'id-2',
      ws.id,
      'note',
      'Second',
      '[]',
      '*',
      '{}',
      new Date(now - 1000).toISOString(),
      new Date(now - 1000).toISOString()
    );

    db.prepare(
      `
      INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'id-3',
      ws.id,
      'note',
      'Third',
      '[]',
      '*',
      '{}',
      new Date(now).toISOString(),
      new Date(now).toISOString()
    );

    const items = db
      .prepare('SELECT * FROM context WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(ws.id);

    expect(items[0].content).toBe('Third');
    expect(items[2].content).toBe('First');
  });

  it('should exclude soft-deleted items', () => {
    const ws = createWorkspace(db, { name: 'test-ws' });
    const ctx = createContext(db, { workspaceId: ws.id, content: 'To be deleted' });

    // Soft delete
    db.prepare('UPDATE context SET deleted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      ctx.id
    );

    const activeItems = db
      .prepare('SELECT * FROM context WHERE workspace_id = ? AND deleted_at IS NULL')
      .all(ws.id);

    expect(activeItems).toHaveLength(0);
  });

  it('should track unsynced items', () => {
    const ws = createWorkspace(db, { name: 'test-ws' });

    createContext(db, { workspaceId: ws.id, content: 'Not synced' });
    const syncedCtx = createContext(db, { workspaceId: ws.id, content: 'Synced' });

    // Mark one as synced
    db.prepare('UPDATE context SET synced_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      syncedCtx.id
    );

    const unsynced = db
      .prepare('SELECT * FROM context WHERE workspace_id = ? AND synced_at IS NULL')
      .all(ws.id);

    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].content).toBe('Not synced');
  });
});
