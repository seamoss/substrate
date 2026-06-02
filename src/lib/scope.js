/**
 * Scope matching.
 *
 * A context item's `scope` is a path or glob (default `*` = whole project). These
 * helpers decide whether a scope applies to a given repo-relative path — used by
 * `substrate why` (which context governs a file) and `brief --changed` (context for
 * the working set).
 *
 * @module lib/scope
 */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a scope applies to a path.
 *
 * - `*` (or empty) is global → always matches.
 * - A directory/file prefix matches itself and anything under it (`src/api` matches
 *   `src/api/x.js`).
 * - Globs are supported, with `*` matching any run of characters (`src/api/*.js`).
 *
 * @param {string} scope - The item's scope
 * @param {string} path - A repo-relative path (forward slashes)
 * @returns {boolean}
 */
export function scopeMatches(scope, path) {
  if (!scope || scope === '*') return true;
  if (!path) return false;
  const s = scope.replace(/\/+$/, '');
  if (path === s || path.startsWith(s + '/')) return true;
  if (!s.includes('*')) return false;
  const re = new RegExp('^' + s.split('*').map(escapeRegExp).join('.*') + '$');
  return re.test(path);
}

/**
 * Whether a scope applies to any of several paths.
 *
 * @param {string} scope
 * @param {string[]} paths
 * @returns {boolean}
 */
export function scopeMatchesAny(scope, paths) {
  return paths.some(p => scopeMatches(scope, p));
}

/**
 * Whether a scope is specific (i.e. not the global `*`).
 *
 * @param {string} scope
 * @returns {boolean}
 */
export function isSpecificScope(scope) {
  return Boolean(scope) && scope !== '*';
}
