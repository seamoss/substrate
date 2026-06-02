import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  gatherCandidates,
  candidatesFromCommits,
  candidatesFromDocs
} from '../../src/lib/ingest.js';

describe('lib/ingest', () => {
  let repo;
  const g = cmd => execSync(cmd, { cwd: repo, stdio: 'ignore' });
  const commit = (file, msg) => {
    writeFileSync(join(repo, file), Math.random().toString());
    g('git add -A');
    g(`git commit -q -m ${JSON.stringify(msg)}`);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'substrate-ingest-'));
    g('git init -q');
    g('git config user.name Tester');
    g('git config user.email tester@example.com');
    g('git config commit.gpgsign false');

    commit('a', 'feat(auth): add login flow');
    commit('b', 'fix: handle null token');
    commit('c', 'chore: bump deps');
    commit('d', 'feat!: drop node 16 support');

    writeFileSync(
      join(repo, 'README.md'),
      '# Project\n\n- All API responses must be JSON.\n- We use Tailwind for styling.\n'
    );
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(
      join(repo, 'docs', 'adr', '0001-use-postgres.md'),
      '# ADR-0001: Use PostgreSQL for persistence\n\nContext and consequences...'
    );
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('classifies Conventional Commits (feat→decision, fix→note, breaking→constraint, chore skipped)', () => {
    const byContent = Object.fromEntries(candidatesFromCommits(repo).map(c => [c.content, c]));
    expect(byContent['add login flow'].type).toBe('decision');
    expect(byContent['add login flow'].tags).toEqual(['auth']);
    expect(byContent['handle null token'].type).toBe('note');
    expect(byContent['drop node 16 support'].type).toBe('constraint');
    expect(byContent['bump deps']).toBeUndefined();
  });

  it('extracts imperative rules → constraints and ADR titles → decisions', () => {
    const docs = candidatesFromDocs(repo);
    const rule = docs.find(c => c.content.includes('must be JSON'));
    expect(rule.type).toBe('constraint');
    expect(docs.find(c => c.content.includes('Tailwind'))).toBeUndefined();

    const adr = docs.find(c => c.content.includes('Use PostgreSQL'));
    expect(adr.type).toBe('decision');
    expect(adr.tags).toContain('adr');
  });

  it('gatherCandidates dedups and honors --from', () => {
    expect(gatherCandidates(repo, { from: 'all' }).length).toBeGreaterThan(2);
    expect(gatherCandidates(repo, { from: 'git' }).every(c => c.source.commit)).toBe(true);
    expect(gatherCandidates(repo, { from: 'docs' }).every(c => c.source.file)).toBe(true);
  });
});
