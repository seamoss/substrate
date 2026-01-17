/**
 * Text similarity utilities for duplicate detection.
 *
 * This module provides functions to detect duplicate or near-duplicate
 * context items by comparing text content using multiple similarity metrics.
 *
 * @module lib/similarity
 */

/**
 * @typedef {Object} SimilarItem
 * @property {string} id - The context item's UUID
 * @property {string} type - The context type (note, constraint, decision, etc.)
 * @property {string} content - The text content
 * @property {string[]} tags - Array of tags
 * @property {number} similarity - Similarity score as percentage (0-100)
 */

/**
 * Normalize text for comparison by lowercasing, trimming, and collapsing whitespace.
 *
 * @param {string} text - The text to normalize
 * @returns {string} Normalized text
 * @private
 */
function normalize(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract significant words from text (words longer than 2 characters).
 *
 * @param {string} text - The text to extract words from
 * @returns {string[]} Array of significant words
 * @private
 */
function getWords(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Calculate Jaccard similarity coefficient between two sets.
 *
 * The Jaccard index is defined as the size of the intersection
 * divided by the size of the union of two sets.
 *
 * @param {Set<string>} set1 - First set
 * @param {Set<string>} set2 - Second set
 * @returns {number} Jaccard similarity coefficient (0 to 1)
 * @private
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Calculate similarity between two text strings.
 *
 * Uses a multi-strategy approach:
 * 1. Exact match after normalization → 1.0
 * 2. Containment (one contains the other) → ratio of lengths
 * 3. Word overlap using Jaccard similarity
 *
 * @param {string} text1 - First text to compare
 * @param {string} text2 - Second text to compare
 * @returns {number} Similarity score from 0 (completely different) to 1 (identical)
 *
 * @example
 * // Exact match
 * textSimilarity('hello world', 'Hello World') // → 1.0
 *
 * @example
 * // Containment
 * textSimilarity('API responses', 'API responses must be JSON') // → ~0.5
 *
 * @example
 * // Word overlap
 * textSimilarity('Use JSON for API', 'API returns JSON data') // → ~0.4
 */
export function textSimilarity(text1, text2) {
  const norm1 = normalize(text1);
  const norm2 = normalize(text2);

  // Exact match
  if (norm1 === norm2) {
    return 1.0;
  }

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length < norm2.length ? norm2 : norm1;
    return shorter.length / longer.length;
  }

  // Word overlap (Jaccard)
  const words1 = new Set(getWords(text1));
  const words2 = new Set(getWords(text2));

  return jaccardSimilarity(words1, words2);
}

/**
 * Find context items similar to the given content.
 *
 * Searches the most recent 100 context items in the workspace and returns
 * those with similarity at or above the threshold, sorted by similarity
 * in descending order.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} workspaceId - UUID of the workspace to search
 * @param {string} content - The content to find similar items for
 * @param {string} type - The context type (currently unused, reserved for type-specific matching)
 * @param {number} [threshold=0.6] - Minimum similarity score (0 to 1) to include in results
 * @returns {SimilarItem[]} Array of similar items, sorted by similarity descending
 *
 * @example
 * const similar = findSimilar(db, workspaceId, 'API must return JSON', 'constraint', 0.5);
 * // Returns: [{ id: '...', type: 'constraint', content: 'API responses must be JSON', similarity: 75 }]
 */
export function findSimilar(db, workspaceId, content, type, threshold = 0.6) {
  // Get existing items of the same type (or all if checking broadly)
  const items = db
    .prepare(
      `
    SELECT id, type, content, tags FROM context
    WHERE workspace_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 100
  `
    )
    .all(workspaceId);

  const similar = [];

  for (const item of items) {
    const similarity = textSimilarity(content, item.content);

    if (similarity >= threshold) {
      similar.push({
        id: item.id,
        type: item.type,
        content: item.content,
        tags: JSON.parse(item.tags || '[]'),
        similarity: Math.round(similarity * 100)
      });
    }
  }

  // Sort by similarity descending
  similar.sort((a, b) => b.similarity - a.similarity);

  return similar;
}

/**
 * Check if content is a likely duplicate of existing context.
 *
 * This is a convenience wrapper around {@link findSimilar} that returns
 * only the most similar item if it exceeds the 70% similarity threshold.
 * Used by the `add` command to warn users about potential duplicates.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} workspaceId - UUID of the workspace to check
 * @param {string} content - The content to check for duplicates
 * @param {string} type - The context type
 * @returns {SimilarItem|null} The most similar item if ≥70% match, null otherwise
 *
 * @example
 * const duplicate = checkDuplicate(db, workspaceId, 'API returns JSON', 'constraint');
 * if (duplicate) {
 *   console.log(`Similar content exists (${duplicate.similarity}% match)`);
 * }
 */
export function checkDuplicate(db, workspaceId, content, type) {
  const similar = findSimilar(db, workspaceId, content, type, 0.7);

  // Return the most similar if it's very close
  if (similar.length > 0 && similar[0].similarity >= 70) {
    return similar[0];
  }

  return null;
}
