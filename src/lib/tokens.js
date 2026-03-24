/**
 * Token estimation and budget management for context delivery.
 *
 * Uses a heuristic estimator (~4 characters per token) to approximate
 * token counts without external dependencies. The budget system ensures
 * context fits within an agent's available context window.
 *
 * @module lib/tokens
 */

/**
 * Characters per token heuristic.
 * Claude tokenizer averages ~3.5-4.5 chars/token for English text.
 * We use 4 as a conservative middle ground.
 * @type {number}
 * @constant
 */
const CHARS_PER_TOKEN = 4;

/**
 * Named budget presets mapping to token counts.
 * @type {Object<string, number>}
 * @constant
 */
export const BUDGET_PRESETS = {
  small: 2000,
  medium: 8000,
  large: 32000,
  xl: 100000
};

/**
 * Estimate the token count of a string.
 *
 * @param {string} text - The text to estimate
 * @returns {number} Approximate token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the token cost of rendering a context item in brief format.
 *
 * Accounts for the item content, tags, scope, links, and formatting
 * overhead (bullet points, headers, arrows, etc.).
 *
 * @param {Object} item - A context item (with parsed tags/meta)
 * @param {Object} [options]
 * @param {Object[]} [options.links] - Links associated with this item
 * @returns {number} Approximate token count for this item when rendered
 */
export function estimateItemTokens(item, options = {}) {
  let chars = 0;

  // Content + bullet prefix ("- " or "* ")
  chars += (item.content || '').length + 2;

  // Tags rendering: " [tag1, tag2]"
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.length > 0) {
    chars += tags.join(', ').length + 3; // " [" + tags + "]"
  }

  // Scope rendering if non-global
  if (item.scope && item.scope !== '*') {
    chars += item.scope.length + 8; // " (scope: ...)"
  }

  // Links rendering: "  → relation: content" per link
  const links = options.links || [];
  for (const link of links) {
    const target = link.to || link.from || '';
    chars += target.length + (link.relation || '').length + 8; // "  → rel: content\n"
  }

  // Newline
  chars += 1;

  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Overhead tokens for a section header (e.g., "### Constraints (treat as immutable facts)\n").
 * @type {number}
 * @constant
 */
const SECTION_HEADER_TOKENS = 15;

/**
 * Overhead tokens for the brief header (workspace name, session info, etc.).
 * @type {number}
 * @constant
 */
const BRIEF_HEADER_TOKENS = 30;

/**
 * Parse a budget value from a string. Accepts preset names or numeric token counts.
 *
 * @param {string} value - Budget value ("small", "medium", "large", "xl", or a number)
 * @returns {number|null} Token count, or null if invalid
 */
export function parseBudget(value) {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  if (BUDGET_PRESETS[lower] !== undefined) {
    return BUDGET_PRESETS[lower];
  }
  const num = parseInt(value, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Fit a scored, sorted array of context items into a token budget.
 *
 * Uses a greedy approach: items are included in order (highest priority first)
 * until the budget is exhausted. Constraints are always included regardless
 * of budget (they are "immutable facts" that should never be dropped).
 *
 * @param {Object[]} items - Context items sorted by priority score (highest first).
 *   Each item should have `type`, `content`, `tags`, `scope`, and optionally `_links`.
 * @param {number} budget - Maximum token count
 * @param {Object} [options]
 * @param {Object<string, Object[]>} [options.linkMap] - Map of item ID to link arrays
 * @returns {{ included: Object[], overflow: Object[], tokenCount: number, budgetUsed: number }}
 */
export function fitToBudget(items, budget, options = {}) {
  const { linkMap = {} } = options;

  const included = [];
  const overflow = [];
  let tokenCount = BRIEF_HEADER_TOKENS;

  // Track which sections we've started (for header overhead)
  const seenTypes = new Set();

  for (const item of items) {
    // Constraints always survive the cut
    const isConstraint = item.type === 'constraint';

    // Calculate section header cost if this is a new type
    let headerCost = 0;
    if (!seenTypes.has(item.type)) {
      headerCost = SECTION_HEADER_TOKENS;
    }

    const itemLinks = linkMap[item.id] || [];
    const slimLinks = itemLinks.map(l => {
      if (l.direction === 'out') {
        return { relation: l.relation, to: l.target?.content };
      } else {
        return { relation: l.relation, from: l.source?.content };
      }
    });
    const itemCost = estimateItemTokens(item, { links: slimLinks });
    const totalCost = headerCost + itemCost;

    if (isConstraint || tokenCount + totalCost <= budget) {
      if (!seenTypes.has(item.type)) {
        seenTypes.add(item.type);
        tokenCount += headerCost;
      }
      tokenCount += itemCost;
      included.push(item);
    } else {
      overflow.push(item);
    }
  }

  return {
    included,
    overflow,
    tokenCount,
    budgetUsed: budget
  };
}
