/**
 * Ingest — bootstrap context candidates from a repo's existing history and docs.
 *
 * Pure, heuristic candidate generation (no LLM): mine Conventional-Commit subjects
 * and a few well-known docs for likely constraints/decisions/notes. The command layer
 * decides whether to print, apply, or hand the raw material to an agent (`--plan`).
 *
 * Each candidate is `{ type, content, tags, source }` where `source` is `{ commit }` or
 * `{ file }` for provenance.
 *
 * @module lib/ingest
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { recentCommits } from './git.js';

/** type(scope)!: subject  — Conventional Commits */
const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

/** Imperative phrasing that signals a hard rule (→ constraint). */
const RULE = /\b(must not|must|never|always|do not|don't|shall|required|may not|forbidden)\b/i;

const DOC_FILES = ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'CONVENTIONS.md'];
const ADR_DIRS = ['docs/adr', 'docs/decisions', 'doc/adr', 'adr'];

/**
 * Candidates from Conventional-Commit history.
 *
 * `feat:` → decision, `fix|perf|refactor:` → note, breaking (`!` or BREAKING CHANGE) →
 * constraint. Other types (chore/docs/test/ci/style/build) are skipped.
 *
 * @param {string} root - Repo root
 * @param {Object} [opts]
 * @param {string} [opts.since] - Only commits after this revision
 * @param {number} [opts.limit=50]
 * @returns {Array<{type,content,tags,source}>}
 */
export function candidatesFromCommits(root, { since, limit = 50 } = {}) {
  const out = [];
  for (const c of recentCommits({ cwd: root, since, limit })) {
    const m = c.subject.match(CONVENTIONAL);
    if (!m) continue;
    const [, kind, scope, bang, subject] = m;
    const breaking = Boolean(bang) || /BREAKING CHANGE/.test(c.body);

    let type;
    if (breaking) type = 'constraint';
    else if (kind === 'feat') type = 'decision';
    else if (kind === 'fix' || kind === 'perf' || kind === 'refactor') type = 'note';
    else continue;

    out.push({
      type,
      content: subject.trim(),
      tags: scope ? [scope.trim()] : [],
      source: { commit: c.hash }
    });
  }
  return out;
}

/**
 * Candidates from well-known docs: imperative lines → constraints; ADR titles → decisions.
 *
 * @param {string} root - Repo root
 * @returns {Array<{type,content,tags,source}>}
 */
export function candidatesFromDocs(root) {
  const out = [];

  for (const f of DOC_FILES) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    let text;
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    for (const raw of text.split('\n')) {
      const line = raw.replace(/^[\s>*\-\d.]+/, '').trim();
      if (line.length < 12 || line.length > 200) continue;
      if (line.startsWith('#') || line.startsWith('```') || line.includes('](')) continue;
      if (RULE.test(line))
        out.push({ type: 'constraint', content: line, tags: [], source: { file: f } });
    }
  }

  for (const dir of ADR_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    let entries;
    try {
      entries = readdirSync(abs).filter(n => n.endsWith('.md'));
    } catch {
      continue;
    }
    for (const name of entries) {
      let text;
      try {
        text = readFileSync(join(abs, name), 'utf8');
      } catch {
        continue;
      }
      const title = (text.split('\n').find(l => l.startsWith('# ')) || '')
        .replace(/^#\s*/, '')
        .replace(/^(ADR[-\s]?\d+[:.\s-]*)/i, '')
        .trim();
      if (title.length >= 6) {
        out.push({
          type: 'decision',
          content: title,
          tags: ['adr'],
          source: { file: join(dir, name) }
        });
      }
    }
  }

  return out;
}

/**
 * Gather candidates from the requested sources, de-duplicated by normalized content.
 *
 * @param {string} root - Repo root
 * @param {Object} [opts]
 * @param {('git'|'docs'|'all')} [opts.from='all']
 * @param {string} [opts.since]
 * @param {number} [opts.limit]
 * @returns {Array<{type,content,tags,source}>}
 */
export function gatherCandidates(root, { from = 'all', since, limit } = {}) {
  let candidates = [];
  if (from === 'git' || from === 'all') {
    candidates = candidates.concat(candidatesFromCommits(root, { since, limit }));
  }
  if (from === 'docs' || from === 'all') {
    candidates = candidates.concat(candidatesFromDocs(root));
  }

  const seen = new Set();
  return candidates.filter(c => {
    const key = c.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
