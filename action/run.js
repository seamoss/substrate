/**
 * Substrate GitHub Action runner.
 *
 * On a pull_request event: load the repo's committed context, find which constraints/
 * decisions govern the PR's changed files (`substrate why --json`), and upsert a sticky
 * PR comment. Best-effort throughout — it never fails the PR (any error exits 0).
 *
 * Runs from the consumer repo's checkout (CWD = github.workspace); the `substrate` CLI is
 * linked from the action's own source by action.yml.
 */

import { execFileSync, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { renderComment, COMMENT_MARKER } = await import(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'prComment.js')
);

const TYPE_ORDER = {
  constraint: 1,
  decision: 2,
  runbook: 3,
  note: 4,
  task: 5,
  entity: 6,
  snippet: 7
};

function changedFilesVsBase(baseRef) {
  try {
    execSync(`git fetch --no-tags --depth=200 origin ${baseRef}`, { stdio: 'ignore' });
    return execSync(`git diff --name-only origin/${baseRef}...HEAD`, { encoding: 'utf8' })
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function governingItems(files) {
  const byId = new Map();
  for (const file of files) {
    let res;
    try {
      res = JSON.parse(execFileSync('substrate', ['why', file, '--json'], { encoding: 'utf8' }));
    } catch {
      continue;
    }
    for (const it of res.governs || []) {
      const entry = byId.get(it.id) || { ...it, files: [] };
      entry.files.push(file);
      byId.set(it.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99));
}

async function upsertComment({ token, repo, prNumber, body }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'substrate-action'
  };
  const base = `https://api.github.com/repos/${repo}`;
  const list = await (
    await fetch(`${base}/issues/${prNumber}/comments?per_page=100`, { headers })
  ).json();
  const existing = Array.isArray(list)
    ? list.find(c => c.body && c.body.includes(COMMENT_MARKER))
    : null;

  if (existing) {
    await fetch(`${base}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body })
    });
  } else {
    await fetch(`${base}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body })
    });
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repo || !eventPath) {
    console.log('substrate-action: missing GitHub env, skipping.');
    return;
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    console.log('substrate-action: not a pull_request event, skipping.');
    return;
  }

  if (!existsSync('.substrate')) {
    console.log('substrate-action: no .substrate/ in this repo, skipping.');
    return;
  }

  try {
    execFileSync('substrate', ['sync', 'pull'], { stdio: 'ignore' });
  } catch {
    // best-effort
  }

  const changed = changedFilesVsBase(pr.base.ref)
    .filter(f => !f.startsWith('.substrate/'))
    .slice(0, 100);

  const items = governingItems(changed);
  const body = renderComment({ items, changedCount: changed.length });
  await upsertComment({ token, repo, prNumber: pr.number, body });
  console.log(
    `substrate-action: ${items.length} context item(s) across ${changed.length} changed file(s).`
  );
}

main().catch(err => {
  // Never fail the PR over context surfacing.
  console.error('substrate-action:', err.message);
  process.exit(0);
});
