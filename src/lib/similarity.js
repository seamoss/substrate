/**
 * Text similarity utilities for duplicate detection.
 */

/**
 * Normalize text for comparison.
 */
function normalize(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract words from text.
 */
function getWords(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Calculate Jaccard similarity between two sets.
 */
function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Calculate similarity between two texts.
 * Returns a score from 0 to 1.
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
 * Find similar context items in the database.
 * Returns items with similarity >= threshold.
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
 * Check if content is a likely duplicate.
 * Returns the most similar item if found, null otherwise.
 */
export function checkDuplicate(db, workspaceId, content, type) {
  const similar = findSimilar(db, workspaceId, content, type, 0.7);

  // Return the most similar if it's very close
  if (similar.length > 0 && similar[0].similarity >= 70) {
    return similar[0];
  }

  return null;
}
