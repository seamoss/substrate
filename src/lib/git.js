/**
 * Thin git helpers.
 *
 * Substrate is git-native, so several features (provenance on capture, ingest from
 * history, working-set briefs) need to read git state. All helpers are best-effort:
 * outside a repo (or on any failure) they return null / empty rather than throwing,
 * so the CLI keeps working in non-git directories.
 *
 * @module lib/git
 */

import { execSync } from 'child_process';

/**
 * Run a git command, returning trimmed stdout or null on any failure.
 *
 * @param {string} args - Arguments after `git`
 * @param {string} [cwd] - Working directory (default: process.cwd())
 * @returns {string|null}
 */
function git(args, cwd = process.cwd()) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Whether a directory is inside a git work tree.
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function isGitRepo(cwd) {
  return git('rev-parse --is-inside-work-tree', cwd) === 'true';
}

/**
 * Capture provenance for a context item: where/when/who it came from.
 *
 * Returns an object suitable for `meta.provenance`. Omits any field git can't
 * provide (e.g. a repo with no commits yet), and returns `{}` outside a repo.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - Working directory
 * @param {string} [opts.file] - Associated file/path, if known
 * @returns {Object} Provenance object (possibly empty)
 */
export function captureProvenance({ cwd, file } = {}) {
  if (!isGitRepo(cwd)) return file ? { file } : {};

  const prov = {};
  const commit = git('rev-parse --short HEAD', cwd);
  if (commit) prov.commit = commit;
  const branch = git('rev-parse --abbrev-ref HEAD', cwd);
  if (branch && branch !== 'HEAD') prov.branch = branch;
  const name = git('config user.name', cwd);
  const email = git('config user.email', cwd);
  const author = [name, email && `<${email}>`].filter(Boolean).join(' ');
  if (author) prov.author = author;
  if (file) prov.file = file;
  return prov;
}

/**
 * Build the `meta` JSON string for a new context item, stamping git provenance.
 *
 * A concrete (non-glob) scope is recorded as the originating file. Returns '{}'
 * outside a git repo so capture still works anywhere.
 *
 * @param {Object} [opts]
 * @param {string} [opts.scope] - The item's scope (a plain path is treated as a file)
 * @param {string} [opts.cwd]
 * @returns {string} JSON for the `meta` column
 */
export function provenanceMeta({ scope, cwd } = {}) {
  const file = scope && scope !== '*' && !scope.includes('*') ? scope : undefined;
  const provenance = captureProvenance({ cwd, file });
  return JSON.stringify(Object.keys(provenance).length ? { provenance } : {});
}

/**
 * Files changed in the working tree (and optionally staged), relative to the repo root.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {boolean} [opts.staged] - Include only staged changes
 * @returns {string[]} Repo-relative paths (empty if none/not a repo)
 */
export function changedFiles({ cwd, staged = false } = {}) {
  const out = git(`diff --name-only${staged ? ' --cached' : ''}`, cwd);
  const untracked = staged ? '' : git('ls-files --others --exclude-standard', cwd);
  const files = [out, untracked]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(files)];
}

/**
 * Recent commits as `{ hash, subject, body }`.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.since] - A git revision range start (e.g. a tag)
 * @returns {Array<{hash: string, subject: string, body: string}>}
 */
export function recentCommits({ cwd, limit = 20, since } = {}) {
  const range = since ? `${since}..HEAD` : '';
  // Records separated by NUL; fields by Unit Separator.
  const raw = git(`log ${range} -n ${limit} --pretty=format:%h%x1f%s%x1f%b%x00`, cwd);
  if (!raw) return [];
  return raw
    .split('\x00')
    .map(r => r.trim())
    .filter(Boolean)
    .map(rec => {
      const [hash, subject, body] = rec.split('\x1f');
      return { hash, subject: subject || '', body: (body || '').trim() };
    });
}

/**
 * Absolute path to the repo root, or null.
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function repoRoot(cwd) {
  return git('rev-parse --show-toplevel', cwd);
}
