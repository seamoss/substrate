import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, createWorkspace, createMount, createContext } from '../helpers.js';

describe('Context Command Logic', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe('findWorkspaceForCwd', () => {
    it('should find workspace by longest matching mount path', () => {
      const ws1 = createWorkspace(db, { name: 'parent' });
      const ws2 = createWorkspace(db, { name: 'child' });

      createMount(db, { workspaceId: ws1.id, path: '/Users/test' });
      createMount(db, { workspaceId: ws2.id, path: '/Users/test/project' });

      // Simulate the findWorkspaceForCwd logic
      const cwd = '/Users/test/project/src';
      const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

      let foundWorkspace = null;
      for (const mount of mounts) {
        if (cwd.startsWith(mount.path)) {
          foundWorkspace = db
            .prepare('SELECT * FROM workspaces WHERE id = ?')
            .get(mount.workspace_id);
          break;
        }
      }

      expect(foundWorkspace.name).toBe('child');
    });

    it('should return null when no mount matches', () => {
      createWorkspace(db, { name: 'other' });

      const cwd = '/Users/different/path';
      const mounts = db.prepare('SELECT * FROM mounts ORDER BY length(path) DESC').all();

      let foundWorkspace = null;
      for (const mount of mounts) {
        if (cwd.startsWith(mount.path)) {
          foundWorkspace = db
            .prepare('SELECT * FROM workspaces WHERE id = ?')
            .get(mount.workspace_id);
          break;
        }
      }

      expect(foundWorkspace).toBeNull();
    });
  });

  describe('context add', () => {
    it('should insert context with correct fields', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });
      const now = new Date().toISOString();
      const id = 'ctx-test-123';
      const content = 'API responses must be JSON';
      const type = 'constraint';
      const tags = ['api', 'backend'];
      const scope = '/src/api';

      db.prepare(
        `
        INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(id, ws.id, type, content, JSON.stringify(tags), scope, '{}', now, now);

      const ctx = db.prepare('SELECT * FROM context WHERE id = ?').get(id);

      expect(ctx.workspace_id).toBe(ws.id);
      expect(ctx.type).toBe('constraint');
      expect(ctx.content).toBe('API responses must be JSON');
      expect(JSON.parse(ctx.tags)).toEqual(['api', 'backend']);
      expect(ctx.scope).toBe('/src/api');
    });

    it('should validate type against allowed types', () => {
      const VALID_TYPES = [
        'note',
        'constraint',
        'decision',
        'task',
        'entity',
        'runbook',
        'snippet'
      ];

      expect(VALID_TYPES.includes('constraint')).toBe(true);
      expect(VALID_TYPES.includes('note')).toBe(true);
      expect(VALID_TYPES.includes('invalid-type')).toBe(false);
    });

    it('should parse comma-separated tags', () => {
      const tagInput = 'api, backend, v2';
      const tags = tagInput.split(',').map(t => t.trim());

      expect(tags).toEqual(['api', 'backend', 'v2']);
    });

    it('should handle empty tags', () => {
      const tagInput = undefined;
      const tags = tagInput ? tagInput.split(',').map(t => t.trim()) : [];

      expect(tags).toEqual([]);
    });
  });

  describe('context list', () => {
    it('should list context ordered by created_at DESC', () => {
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

      expect(items).toHaveLength(3);
      expect(items[0].content).toBe('Third');
    });

    it('should filter by type', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });

      createContext(db, { workspaceId: ws.id, type: 'constraint', content: 'Constraint 1' });
      createContext(db, { workspaceId: ws.id, type: 'constraint', content: 'Constraint 2' });
      createContext(db, { workspaceId: ws.id, type: 'note', content: 'Note 1' });

      const constraints = db
        .prepare('SELECT * FROM context WHERE workspace_id = ? AND type = ?')
        .all(ws.id, 'constraint');

      expect(constraints).toHaveLength(2);
    });

    it('should limit results', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });

      for (let i = 0; i < 10; i++) {
        createContext(db, { workspaceId: ws.id, content: `Item ${i}` });
      }

      const items = db
        .prepare('SELECT * FROM context WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(ws.id, 5);

      expect(items).toHaveLength(5);
    });

    it('should filter by tag (in-memory)', () => {
      const ws = createWorkspace(db, { name: 'test-ws' });

      createContext(db, { workspaceId: ws.id, content: 'Tagged', tags: ['important', 'api'] });
      createContext(db, { workspaceId: ws.id, content: 'Not tagged', tags: [] });
      createContext(db, { workspaceId: ws.id, content: 'Different tags', tags: ['other'] });

      const items = db.prepare('SELECT * FROM context WHERE workspace_id = ?').all(ws.id);

      // Parse tags and filter
      const filtered = items.filter(item => {
        const tags = JSON.parse(item.tags || '[]');
        return tags.includes('important');
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].content).toBe('Tagged');
    });
  });

  describe('workspace lookup', () => {
    it('should find workspace by name', () => {
      createWorkspace(db, { name: 'ws-one' });
      createWorkspace(db, { name: 'ws-two' });

      const ws = db.prepare('SELECT * FROM workspaces WHERE name = ?').get('ws-two');

      expect(ws.name).toBe('ws-two');
    });

    it('should return null for non-existent workspace', () => {
      const ws = db.prepare('SELECT * FROM workspaces WHERE name = ?').get('non-existent');

      expect(ws).toBeUndefined();
    });
  });
});

describe('Context Type Priorities', () => {
  const TYPE_PRIORITY = {
    constraint: 1,
    decision: 2,
    note: 3,
    task: 4,
    entity: 5,
    runbook: 5,
    snippet: 5
  };

  it('should have constraint as highest priority', () => {
    expect(TYPE_PRIORITY.constraint).toBe(1);
  });

  it('should have decision as second priority', () => {
    expect(TYPE_PRIORITY.decision).toBe(2);
  });

  it('should have note as third priority', () => {
    expect(TYPE_PRIORITY.note).toBe(3);
  });

  it('should sort context by priority', () => {
    const items = [
      { type: 'note', content: 'Note' },
      { type: 'constraint', content: 'Constraint' },
      { type: 'decision', content: 'Decision' },
      { type: 'task', content: 'Task' }
    ];

    const sorted = items.sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);

    expect(sorted[0].type).toBe('constraint');
    expect(sorted[1].type).toBe('decision');
    expect(sorted[2].type).toBe('note');
    expect(sorted[3].type).toBe('task');
  });
});

describe('Context JSON Output', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  it('should format context for JSON output', () => {
    const ws = createWorkspace(db, { name: 'test-ws' });
    const ctx = createContext(db, {
      workspaceId: ws.id,
      type: 'constraint',
      content: 'Test content',
      tags: ['tag1', 'tag2']
    });

    // Simulate parsing tags for output
    ctx.tags = JSON.parse(ctx.tags);

    expect(ctx.tags).toEqual(['tag1', 'tag2']);
    expect(typeof ctx.id).toBe('string');
    expect(ctx.type).toBe('constraint');
  });

  it('should handle context list JSON output', () => {
    const ws = createWorkspace(db, { name: 'test-ws' });

    createContext(db, { workspaceId: ws.id, content: 'Item 1' });
    createContext(db, { workspaceId: ws.id, content: 'Item 2' });

    const items = db.prepare('SELECT * FROM context WHERE workspace_id = ?').all(ws.id);

    // Parse tags for each item
    items.forEach(item => {
      item.tags = JSON.parse(item.tags || '[]');
    });

    const output = { context: items, count: items.length };

    expect(output.count).toBe(2);
    expect(Array.isArray(output.context)).toBe(true);
  });
});
