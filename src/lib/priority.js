/**
 * Priority scoring engine for context items.
 *
 * Replaces simple type-then-recency ordering with a weighted score
 * that considers type importance, recency, connectivity, scope
 * relevance, and tag matching.
 *
 * @module lib/priority
 */

/**
 * Weight for each context type. Higher = more important.
 * @type {Object<string, number>}
 * @constant
 */
const TYPE_WEIGHTS = {
  constraint: 5,
  decision: 4,
  note: 3,
  runbook: 2,
  task: 2,
  entity: 1,
  snippet: 1
};

/**
 * Recency half-life in days. Items lose half their recency score
 * after this many days.
 * @type {number}
 * @constant
 */
const RECENCY_HALF_LIFE_DAYS = 14;

/**
 * Scoring weights for each factor.
 * @type {Object<string, number>}
 * @constant
 */
const WEIGHTS = {
  type: 100,
  recency: 30,
  links: 20,
  scope: 25,
  tagMatch: 15
};

/**
 * Compute an exponential decay recency score.
 *
 * Returns 1.0 for items created now, decaying toward 0 over time.
 * Half-life is configurable via RECENCY_HALF_LIFE_DAYS.
 *
 * @param {string} createdAt - ISO 8601 timestamp
 * @returns {number} Score between 0 and 1
 * @private
 */
function recencyScore(createdAt) {
  if (!createdAt) return 0;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential decay: score = 2^(-age/halfLife)
  return Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Compute a link density score.
 *
 * Items with more connections are generally more central and important.
 * Uses a logarithmic scale to avoid over-weighting highly connected items.
 *
 * @param {number} linkCount - Number of links to/from this item
 * @returns {number} Score between 0 and 1
 * @private
 */
function linkScore(linkCount) {
  if (linkCount <= 0) return 0;
  // log2(count + 1) / log2(11) normalizes to ~1.0 at 10 links
  return Math.min(1, Math.log2(linkCount + 1) / Math.log2(11));
}

/**
 * Compute a scope relevance score.
 *
 * Items scoped to the current path are more relevant than global items.
 * Exact path matches score highest; parent path matches get partial credit.
 *
 * @param {string} itemScope - Item's scope pattern
 * @param {string} currentPath - The path being queried
 * @returns {number} Score between 0 and 1
 * @private
 */
function scopeScore(itemScope, currentPath) {
  if (!currentPath || !itemScope || itemScope === '*') return 0.5; // Global items get neutral score
  if (currentPath === itemScope) return 1.0; // Exact match
  if (currentPath.startsWith(itemScope)) return 0.8; // Item scope is a parent of current path
  if (itemScope.startsWith(currentPath)) return 0.6; // Item is more specific than current path
  return 0.2; // No path relationship
}

/**
 * Compute a tag match bonus.
 *
 * When the user has specified filter tags, items matching those tags
 * should be prioritized.
 *
 * @param {string[]} itemTags - Item's tags
 * @param {string[]} filterTags - Tags the user is filtering by
 * @returns {number} Score between 0 and 1
 * @private
 */
function tagMatchScore(itemTags, filterTags) {
  if (!filterTags || filterTags.length === 0) return 0;
  if (!itemTags || itemTags.length === 0) return 0;
  const matches = filterTags.filter(t => itemTags.includes(t)).length;
  return matches / filterTags.length;
}

/**
 * Score a single context item.
 *
 * @param {Object} item - Context item with `type`, `created_at`, `tags`, `scope`
 * @param {Object} context - Scoring context
 * @param {string} [context.currentPath] - The path being queried (relative to mount)
 * @param {string[]} [context.filterTags] - Tags the user is filtering by
 * @param {Object<string, number>} [context.linkCounts] - Map of item ID to link count
 * @returns {number} Composite priority score (higher = more important)
 */
export function scoreItem(item, context = {}) {
  const { currentPath = '', filterTags = [], linkCounts = {} } = context;

  const typeW = (TYPE_WEIGHTS[item.type] || 1) / 5; // Normalize to 0-1
  const recencyW = recencyScore(item.created_at);
  const linksW = linkScore(linkCounts[item.id] || 0);
  const scopeW = scopeScore(item.scope, currentPath);
  const tagW = tagMatchScore(Array.isArray(item.tags) ? item.tags : [], filterTags);

  return (
    WEIGHTS.type * typeW +
    WEIGHTS.recency * recencyW +
    WEIGHTS.links * linksW +
    WEIGHTS.scope * scopeW +
    WEIGHTS.tagMatch * tagW
  );
}

/**
 * Build a link count map from a link map.
 *
 * @param {Object<string, Object[]>} linkMap - Map of item ID to link arrays
 * @returns {Object<string, number>} Map of item ID to link count
 */
export function buildLinkCounts(linkMap) {
  const counts = {};
  for (const [id, links] of Object.entries(linkMap)) {
    counts[id] = links.length;
  }
  return counts;
}

/**
 * Rank an array of context items by priority score.
 *
 * @param {Object[]} items - Context items to rank
 * @param {Object} context - Scoring context (same as scoreItem)
 * @returns {Object[]} Items sorted by score descending, each with `_score` attached
 */
export function rankItems(items, context = {}) {
  return items
    .map(item => ({
      ...item,
      _score: scoreItem(item, context)
    }))
    .sort((a, b) => b._score - a._score);
}
