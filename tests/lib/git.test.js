import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isGitRepo,
  captureProvenance,
  provenanceMeta,
  changedFiles,
  recentCommits
} from '../../src/lib/git.js';

describe('lib/git', () => {
  let repo, plain;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'substrate-git-'));
    const opts = { cwd: repo, stdio: 'ignore' };
    execSync('git init -q', opts);
    execSync('git config user.name Tester', opts);
    execSync('git config user.email tester@example.com', opts);
    execSync('git config commit.gpgsign false', opts);
    writeFileSync(join(repo, 'a.txt'), 'hi');
    execSync('git add -A', opts);
    execSync('git commit -q -m "feat: initial commit"', opts);

    plain = mkdtempSync(join(tmpdir(), 'substrate-plain-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(plain, { recursive: true, force: true });
  });

  it('detects git repos', () => {
    expect(isGitRepo(repo)).toBe(true);
    expect(isGitRepo(plain)).toBe(false);
  });

  it('captures commit, author, and branch provenance in a repo', () => {
    const p = captureProvenance({ cwd: repo });
    expect(p.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(p.author).toContain('Tester');
    expect(typeof p.branch).toBe('string');
    expect(p.branch).not.toBe('HEAD');
  });

  it('records a concrete scope as the originating file (but not a glob)', () => {
    const withFile = JSON.parse(provenanceMeta({ cwd: repo, scope: 'src/api/x.js' }));
    expect(withFile.provenance.file).toBe('src/api/x.js');

    const glob = JSON.parse(provenanceMeta({ cwd: repo, scope: '*' }));
    expect(glob.provenance.file).toBeUndefined();
  });

  it('is safe outside a git repo', () => {
    expect(captureProvenance({ cwd: plain })).toEqual({});
    expect(provenanceMeta({ cwd: plain, scope: '*' })).toBe('{}');
    expect(changedFiles({ cwd: plain })).toEqual([]);
    expect(recentCommits({ cwd: plain })).toEqual([]);
  });

  it('reads recent commit subjects', () => {
    const commits = recentCommits({ cwd: repo });
    expect(commits[0].subject).toBe('feat: initial commit');
  });

  it('lists changed (untracked + modified) files', () => {
    writeFileSync(join(repo, 'b.txt'), 'new file');
    expect(changedFiles({ cwd: repo })).toContain('b.txt');
  });
});
