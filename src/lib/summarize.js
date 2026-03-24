/**
 * Overflow summarization for context items that don't fit the token budget.
 *
 * Generates a structural summary (grouping by type, extracting top tags)
 * without any LLM calls. This gives agents awareness of additional context
 * without consuming the full token budget.
 *
 * @module lib/summarize
 */

/**
 * Human-readable labels for context types.
 * @type {Object<string, string>}
 * @constant
 */
const TYPE_LABELS = {
  constraint: 'constraints',
  decision: 'decisions',
  note: 'notes',
  task: 'tasks',
  entity: 'entities',
  runbook: 'runbooks',
  snippet: 'snippets'
};

/**
 * Extract the most common tags from a set of items.
 *
 * @param {Object[]} items - Context items with parsed `tags` arrays
 * @param {number} [limit=3] - Maximum number of tags to return
 * @returns {string[]} Most frequent tags
 * @private
 */
function topTags(items, limit = 3) {
  const counts = {};
  for (const item of items) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const tag of tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * Extract a short keyword summary from item content.
 *
 * Takes the first few words from each item's content to give a sense
 * of what topics are covered.
 *
 * @param {Object[]} items - Context items
 * @param {number} [limit=3] - Maximum number of topic snippets
 * @param {number} [wordLimit=4] - Max words per snippet
 * @returns {string[]} Short topic descriptions
 * @private
 */
function topicSnippets(items, limit = 3, wordLimit = 4) {
  const seen = new Set();
  const snippets = [];

  for (const item of items) {
    if (snippets.length >= limit) break;
    const words = (item.content || '').split(/\s+/).slice(0, wordLimit).join(' ');
    const lower = words.toLowerCase();
    if (!seen.has(lower) && words.length > 0) {
      seen.add(lower);
      snippets.push(words);
    }
  }

  return snippets;
}

/**
 * Generate a structural summary of overflow items.
 *
 * Produces a compact text block that tells agents what context exists
 * but wasn't included due to budget constraints.
 *
 * @param {Object[]} overflowItems - Items that didn't fit in the budget
 * @returns {string} Formatted summary text, or empty string if no overflow
 *
 * @example
 * // Returns:
 * // ### Also in this workspace (12 items not shown)
 * // - 5 notes (auth, API design, testing)
 * // - 3 tasks (setup CI, migrate DB, ...)
 * // - 4 entities (User, Session, Token)
 */
export function generateOverflowSummary(overflowItems) {
  if (!overflowItems || overflowItems.length === 0) return '';

  const lines = [];
  lines.push(`### Also in this workspace (${overflowItems.length} items not shown)`);

  // Group by type
  const byType = {};
  for (const item of overflowItems) {
    const type = item.type || 'note';
    if (!byType[type]) byType[type] = [];
    byType[type].push(item);
  }

  // Order by type priority (constraints first, though they shouldn't be in overflow)
  const typeOrder = ['constraint', 'decision', 'note', 'task', 'entity', 'runbook', 'snippet'];

  for (const type of typeOrder) {
    const items = byType[type];
    if (!items || items.length === 0) continue;

    const label = TYPE_LABELS[type] || type;
    const tags = topTags(items);
    const topics = topicSnippets(items);

    // Use tags if available, otherwise use topic snippets
    const detail = tags.length > 0 ? tags.join(', ') : topics.join(', ');
    const suffix = detail ? ` (${detail})` : '';

    lines.push(`- ${items.length} ${label}${suffix}`);
  }

  // Add hint about how to access
  lines.push('');
  lines.push('Use `substrate recall "<query>"` to search, or increase `--budget` to see more.');

  return lines.join('\n');
}

/**
 * Generate a token-usage footer line for the brief output.
 *
 * @param {number} tokensUsed - Tokens consumed by included items
 * @param {number} budget - The token budget
 * @param {number} includedCount - Number of items included
 * @param {number} totalCount - Total number of items available
 * @returns {string} Footer line (e.g., "2,450/4,000 tokens | 12/18 items")
 */
export function generateBudgetFooter(tokensUsed, budget, includedCount, totalCount) {
  const used = tokensUsed.toLocaleString();
  const budgetStr = budget.toLocaleString();
  return `\n---\n${used}/${budgetStr} tokens | ${includedCount}/${totalCount} items`;
}
