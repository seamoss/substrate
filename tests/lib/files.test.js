import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import {
  serializeWorkspace,
  readWorkspaceFiles,
  hasWorkspaceFiles,
  substratePaths
} from '../../src/lib/files.js';
import { createTestDb, createWorkspace, createContext, createLink } from '../helpers.js';

describe('lib/files', () => {
  let db, tempDir, cleanup, workspace;

  beforeEach(() => {
    ({ db, tempDir, cleanup } = createTestDb());
    workspace = createWorkspace(db, { name: 'demo', description: 'a demo' });
  });

  afterEach(() => cleanup());

  it('serializes context to deterministic, id-sorted JSONL', () => {
    createContext(db, { workspaceId: workspace.id, content: 'second' });
    createContext(db, { workspaceId: workspace.id, content: 'zeta' });
    createContext(db, { workspaceId: workspace.id, content: 'alpha' });

    const counts = serializeWorkspace(db, workspace, tempDir);
    expect(counts.context).toBe(3);

    const paths = substratePaths(tempDir);
    const lines = readFileSync(paths.context, 'utf8').trim().split('\n');
    const ids = lines.map(l => JSON.parse(l).id);
    expect(ids).toEqual([...ids].sort());
  });

  it('writes a manifest without the machine-local workspace id', () => {
    serializeWorkspace(db, workspace, tempDir);
    const { manifest } = readWorkspaceFiles(tempDir);
    expect(manifest.project_id).toBe(workspace.project_id);
    expect(manifest.name).toBe('demo');
    expect(manifest.description).toBe('a demo');
    expect(manifest.id).toBeUndefined();
    expect(manifest.version).toBe(1);
  });

  it('round-trips context records, dropping machine-local columns', () => {
    createContext(db, {
      workspaceId: workspace.id,
      type: 'constraint',
      content: 'Must use ISO 8601',
      tags: ['api', 'format'],
      meta: { reason: 'consistency' }
    });

    serializeWorkspace(db, workspace, tempDir);
    const { context } = readWorkspaceFiles(tempDir);

    expect(context).toHaveLength(1);
    const rec = context[0];
    expect(rec.type).toBe('constraint');
    expect(rec.content).toBe('Must use ISO 8601');
    expect(rec.tags).toEqual(['api', 'format']);
    expect(rec.meta).toEqual({ reason: 'consistency' });
    expect(rec).not.toHaveProperty('workspace_id');
    expect(rec).not.toHaveProperty('remote_id');
    expect(rec).not.toHaveProperty('synced_at');
  });

  it('includes soft-deleted items as tombstones', () => {
    const item = createContext(db, { workspaceId: workspace.id, content: 'gone' });
    db.prepare('UPDATE context SET deleted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      item.id
    );

    const counts = serializeWorkspace(db, workspace, tempDir);
    expect(counts.tombstones).toBe(1);

    const { context } = readWorkspaceFiles(tempDir);
    expect(context[0].deleted_at).toBeTruthy();
  });

  it('serializes links sorted and round-trips them', () => {
    const a = createContext(db, { workspaceId: workspace.id, content: 'A' });
    const b = createContext(db, { workspaceId: workspace.id, content: 'B' });
    createLink(db, { fromId: a.id, toId: b.id, relation: 'depends_on' });

    serializeWorkspace(db, workspace, tempDir);
    const { links } = readWorkspaceFiles(tempDir);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ from_id: a.id, to_id: b.id, relation: 'depends_on' });
  });

  it('splits shared and private items into sibling files in .substrate/', () => {
    createContext(db, { workspaceId: workspace.id, content: 'shared knowledge' });
    createContext(db, { workspaceId: workspace.id, content: 'my local port', private: 1 });

    const counts = serializeWorkspace(db, workspace, tempDir);
    expect(counts.context).toBe(1);
    expect(counts.privateContext).toBe(1);

    const paths = substratePaths(tempDir);

    // Shared file must not contain the private item.
    const sharedLines = readFileSync(paths.context, 'utf8').trim().split('\n');
    expect(sharedLines).toHaveLength(1);
    expect(JSON.parse(sharedLines[0]).content).toBe('shared knowledge');

    // Private file (context.priv.jsonl) holds it, in the identical format.
    expect(existsSync(paths.contextPrivate)).toBe(true);
    const privLines = readFileSync(paths.contextPrivate, 'utf8').trim().split('\n');
    expect(JSON.parse(privLines[0]).content).toBe('my local port');
    expect(JSON.parse(privLines[0])).not.toHaveProperty('private');

    // Read-back annotates origin so callers can restore the column.
    const { context } = readWorkspaceFiles(tempDir);
    const byContent = Object.fromEntries(context.map(c => [c.content, c.private]));
    expect(byContent['shared knowledge']).toBe(0);
    expect(byContent['my local port']).toBe(1);
  });

  it('does not create a private file when there is no private content', () => {
    createContext(db, { workspaceId: workspace.id, content: 'only shared' });
    serializeWorkspace(db, workspace, tempDir);
    expect(existsSync(substratePaths(tempDir).contextPrivate)).toBe(false);
  });

  it('round-trips lifecycle fields (status, expires_at)', () => {
    createContext(db, { workspaceId: workspace.id, content: 'old way', status: 'superseded' });
    createContext(db, {
      workspaceId: workspace.id,
      content: 'temporary',
      expiresAt: '2030-01-01T00:00:00.000Z'
    });

    serializeWorkspace(db, workspace, tempDir);
    const { context } = readWorkspaceFiles(tempDir);
    const byContent = Object.fromEntries(context.map(c => [c.content, c]));

    expect(byContent['old way'].status).toBe('superseded');
    expect(byContent['old way'].expires_at).toBeNull();
    expect(byContent['temporary'].status).toBe('active');
    expect(byContent['temporary'].expires_at).toBe('2030-01-01T00:00:00.000Z');
  });

  it('reports presence and yields empty arrays when nothing is written', () => {
    expect(hasWorkspaceFiles(tempDir)).toBe(false);
    const { manifest, context, links } = readWorkspaceFiles(tempDir);
    expect(manifest).toBeNull();
    expect(context).toEqual([]);
    expect(links).toEqual([]);

    serializeWorkspace(db, workspace, tempDir);
    expect(hasWorkspaceFiles(tempDir)).toBe(true);
    expect(existsSync(substratePaths(tempDir).workspace)).toBe(true);
  });
});
