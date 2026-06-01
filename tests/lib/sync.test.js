import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * sync.js resolves its database through getDb(), which locates the SQLite file
 * under $HOME/.substrate. We point HOME at a throwaway dir and re-import the
 * modules fresh per test so each gets an isolated cache.
 */
describe('lib/sync reconciliation', () => {
  let tempHome, projectDir, sync, store, dbmod, db, workspace, originalHome;

  function writeFiles({ context = [], links = [], manifest }) {
    const dir = join(projectDir, '.substrate');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'workspace.json'),
      JSON.stringify(manifest || { version: 1, project_id: workspace.project_id, name: 'demo' })
    );
    writeFileSync(join(dir, 'context.jsonl'), context.map(r => JSON.stringify(r)).join('\n'));
    writeFileSync(join(dir, 'links.jsonl'), links.map(r => JSON.stringify(r)).join('\n'));
  }

  beforeEach(async () => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'substrate-synchome-'));
    projectDir = mkdtempSync(join(tmpdir(), 'substrate-proj-'));
    process.env.HOME = tempHome;

    vi.resetModules();
    dbmod = await import('../../src/db/local.js');
    sync = await import('../../src/lib/sync.js');
    store = await import('../../src/lib/store.js');

    db = dbmod.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workspaces (id, name, description, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, 'demo', '', randomUUID(), now, now);
    workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  });

  afterEach(() => {
    dbmod.closeDb();
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('inserts new context from files', async () => {
    writeFiles({
      context: [
        {
          id: 'ctx-1',
          type: 'constraint',
          content: 'from a teammate',
          tags: ['x'],
          scope: '*',
          meta: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null
        }
      ]
    });

    const res = await sync.pullChanges(workspace, projectDir);
    expect(res.pulled).toBe(1);

    const row = db.prepare('SELECT * FROM context WHERE id = ?').get('ctx-1');
    expect(row.content).toBe('from a teammate');
    expect(row.workspace_id).toBe(workspace.id);
    expect(JSON.parse(row.tags)).toEqual(['x']);
  });

  it('applies last-write-wins: newer file updates, older is skipped', async () => {
    const base = {
      id: 'ctx-1',
      type: 'note',
      content: 'local v1',
      tags: [],
      scope: '*',
      meta: {},
      created_at: '2026-01-01T00:00:00.000Z'
    };
    db.prepare(
      `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', '*', '{}', ?, ?)`
    ).run('ctx-1', workspace.id, 'note', 'local v1', base.created_at, '2026-03-01T00:00:00.000Z');

    // Older file copy -> skipped
    writeFiles({
      context: [
        { ...base, content: 'file old', updated_at: '2026-02-01T00:00:00.000Z', deleted_at: null }
      ]
    });
    let res = await sync.pullChanges(workspace, projectDir);
    expect(res.skipped).toBe(1);
    expect(db.prepare('SELECT content FROM context WHERE id = ?').get('ctx-1').content).toBe(
      'local v1'
    );

    // Newer file copy -> updates
    writeFiles({
      context: [
        { ...base, content: 'file new', updated_at: '2026-04-01T00:00:00.000Z', deleted_at: null }
      ]
    });
    res = await sync.pullChanges(workspace, projectDir);
    expect(res.updated).toBe(1);
    expect(db.prepare('SELECT content FROM context WHERE id = ?').get('ctx-1').content).toBe(
      'file new'
    );
  });

  it('propagates tombstones as local soft-deletes', async () => {
    db.prepare(
      `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
       VALUES (?, ?, 'note', 'doomed', '[]', '*', '{}', ?, ?)`
    ).run('ctx-1', workspace.id, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    writeFiles({
      context: [
        {
          id: 'ctx-1',
          type: 'note',
          content: 'doomed',
          tags: [],
          scope: '*',
          meta: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
          deleted_at: '2026-05-01T00:00:00.000Z'
        }
      ]
    });

    await sync.pullChanges(workspace, projectDir);
    const row = db.prepare('SELECT * FROM context WHERE id = ?').get('ctx-1');
    expect(row.deleted_at).toBe('2026-05-01T00:00:00.000Z');
  });

  it('push writes files and marks rows synced', async () => {
    db.prepare(
      `INSERT INTO context (id, workspace_id, type, content, tags, scope, meta, created_at, updated_at)
       VALUES (?, ?, 'note', 'mine', '[]', '*', '{}', ?, ?)`
    ).run('ctx-1', workspace.id, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    const res = await sync.pushChanges(workspace, projectDir);
    expect(res.context).toBe(1);
    expect(res.root).toBe(projectDir);

    const pending = db
      .prepare(
        'SELECT COUNT(*) c FROM context WHERE workspace_id = ? AND (synced_at IS NULL OR updated_at > synced_at)'
      )
      .get(workspace.id);
    expect(pending.c).toBe(0);
  });

  it('bootstraps a workspace from committed files on a fresh clone', async () => {
    const pid = randomUUID();
    writeFiles({
      manifest: { version: 1, project_id: pid, name: 'cloned', description: 'd' },
      context: []
    });

    const { workspace: ws } = store.resolveStore(db, projectDir);
    expect(ws.name).toBe('cloned');
    expect(ws.project_id).toBe(pid);
  });
});
