/**
 * Render the Substrate PR comment.
 *
 * Pure (no I/O) so it's easily tested. The GitHub Action (action/run.js) gathers the
 * context governing a PR's changed files via `substrate why --json` and renders it here.
 *
 * @module lib/prComment
 */

/** Hidden marker used to find-and-update the sticky comment. */
export const COMMENT_MARKER = '<!-- substrate-context -->';

const TYPE_ORDER = {
  constraint: 1,
  decision: 2,
  runbook: 3,
  note: 4,
  task: 5,
  entity: 6,
  snippet: 7
};

function provenanceSuffix(provenance) {
  if (!provenance) return '';
  const parts = [];
  if (provenance.file) parts.push(provenance.file);
  if (provenance.commit) parts.push(`\`${provenance.commit}\``);
  return parts.length ? ` _(from ${parts.join(' @ ')})_` : '';
}

function filesSuffix(files) {
  if (!files || !files.length) return '';
  const shown = files
    .slice(0, 3)
    .map(f => `\`${f}\``)
    .join(', ');
  return `  ·  ${shown}${files.length > 3 ? ` +${files.length - 3} more` : ''}`;
}

/**
 * Render the comment body (markdown).
 *
 * @param {Object} input
 * @param {Array<{id,type,content,provenance?,files?}>} input.items - Governing context items
 * @param {number} input.changedCount - Number of changed files inspected
 * @returns {string} Markdown comment body (begins with COMMENT_MARKER)
 */
export function renderComment({ items = [], changedCount = 0 } = {}) {
  const lines = [COMMENT_MARKER, '', '### 🧠 Substrate context for this PR', ''];

  if (!items.length) {
    lines.push(`No tracked context governs the ${changedCount} changed file(s).`);
    lines.push('');
    lines.push(
      '_Capture decisions and constraints with `substrate add` so future PRs surface them._'
    );
    lines.push('');
    lines.push(
      '<sub>Posted by [Substrate](https://github.com/seamoss/substrate) · context lives in `.substrate/`</sub>'
    );
    return lines.join('\n');
  }

  lines.push('These decisions and constraints govern files changed here — keep them in mind:');
  lines.push('');

  const sorted = [...items].sort((a, b) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99));
  for (const it of sorted) {
    lines.push(
      `- **[${it.type}]** ${it.content}${provenanceSuffix(it.provenance)}${filesSuffix(it.files)}`
    );
  }

  lines.push('');
  lines.push(
    '<sub>Posted by [Substrate](https://github.com/seamoss/substrate) · context lives in `.substrate/`</sub>'
  );
  return lines.join('\n');
}
