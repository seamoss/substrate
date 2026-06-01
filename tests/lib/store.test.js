import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { findSubstrateRoot, resolveStore } from '../../src/lib/store.js';
import { createTestDb } from '../helpers.js';

describe('lib/store', () => {
  let db, cleanup, projectDir;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    projectDir = mkdtempSync(join(tmpdir(), 'substrate-store-'));
  });

  afterEach(() => {
    cleanup();
    rmSync(projectDir, { recursive: true, force: true });
  });

  function initFiles(pid = randomUUID(), name = 'demo') {
    const sub = join(projectDir, '.substrate');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'config.json'), JSON.stringify({ project_id: pid }));
    writeFileSync(
      join(sub, 'workspace.json'),
      JSON.stringify({ version: 1, project_id: pid, name })
    );
    return pid;
  }

  it('discovers .substrate by walking up from a subdirectory (like git finds .git)', () => {
    initFiles();
    const nested = join(projectDir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    expect(findSubstrateRoot(nested)).toBe(projectDir);
  });

  it('findSubstrateRoot returns null when no .substrate exists up the tree', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'substrate-none-'));
    expect(findSubstrateRoot(lonely)).toBeNull();
    rmSync(lonely, { recursive: true, force: true });
  });

  it('resolves a stable workspace by project_id, creating the cache row exactly once', () => {
    const pid = initFiles(randomUUID(), 'cloned');
    const nested = join(projectDir, 'src');
    mkdirSync(nested, { recursive: true });

    const first = resolveStore(db, nested);
    expect(first.root).toBe(projectDir);
    expect(first.workspace.project_id).toBe(pid);
    expect(first.workspace.name).toBe('cloned');

    // Resolving again (from a different dir in the same repo) reuses the cache row.
    const second = resolveStore(db, projectDir);
    expect(second.workspace.id).toBe(first.workspace.id);

    const count = db
      .prepare('SELECT COUNT(*) as c FROM workspaces WHERE project_id = ?')
      .get(pid).c;
    expect(count).toBe(1);
  });

  it('resolveStore returns null outside any Substrate project', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'substrate-none-'));
    expect(resolveStore(db, lonely)).toBeNull();
    rmSync(lonely, { recursive: true, force: true });
  });
});
