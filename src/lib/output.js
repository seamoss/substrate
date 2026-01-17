/**
 * Console output utilities for consistent CLI formatting.
 *
 * Provides styled console output functions using chalk for colors
 * and consistent formatting across all commands.
 *
 * @module lib/output
 */

import chalk from 'chalk';

/**
 * Format data as pretty-printed JSON.
 *
 * @param {*} data - Any JSON-serializable data
 * @returns {string} Pretty-printed JSON string with 2-space indentation
 *
 * @example
 * console.log(formatJson({ workspace: 'test', count: 5 }));
 * // {
 * //   "workspace": "test",
 * //   "count": 5
 * // }
 */
export function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Print a success message with green checkmark.
 *
 * @param {string} msg - The message to display
 *
 * @example
 * success('Workspace created');
 * // ✓ Workspace created
 */
export function success(msg) {
  console.log(chalk.green('✓'), msg);
}

/**
 * Print an error message with red X to stderr.
 *
 * @param {string} msg - The error message to display
 *
 * @example
 * error('Workspace not found');
 * // ✗ Workspace not found
 */
export function error(msg) {
  console.error(chalk.red('✗'), msg);
}

/**
 * Print a warning message with yellow exclamation mark.
 *
 * @param {string} msg - The warning message to display
 *
 * @example
 * warn('Similar content already exists');
 * // ! Similar content already exists
 */
export function warn(msg) {
  console.log(chalk.yellow('!'), msg);
}

/**
 * Print an informational message with blue arrow.
 *
 * @param {string} msg - The info message to display
 *
 * @example
 * info('Run "substrate init" to create a workspace');
 * // → Run "substrate init" to create a workspace
 */
export function info(msg) {
  console.log(chalk.blue('→'), msg);
}

/**
 * Print a dimmed/muted message for secondary information.
 *
 * @param {string} msg - The message to display in dim style
 *
 * @example
 * dim('  ID: abc12345');
 * // (dimmed) ID: abc12345
 */
export function dim(msg) {
  console.log(chalk.dim(msg));
}

/**
 * Print a bold heading.
 *
 * @param {string} msg - The heading text to display
 *
 * @example
 * heading('Context for myproject');
 * // (bold) Context for myproject
 */
export function heading(msg) {
  console.log(chalk.bold(msg));
}

/**
 * Print data in a simple tab-separated table format.
 *
 * @param {Array<string[]>} rows - Array of row arrays, each containing cell values
 * @param {string[]} [headers] - Optional header row (displayed dimmed)
 *
 * @example
 * table([
 *   ['abc123', 'note', 'API uses JSON'],
 *   ['def456', 'decision', 'Using PostgreSQL']
 * ], ['ID', 'Type', 'Content']);
 */
export function table(rows, headers) {
  if (headers) {
    console.log(chalk.dim(headers.join('\t')));
  }
  rows.forEach(row => {
    console.log(row.join('\t'));
  });
}

/**
 * Truncate a UUID to its first 8 characters for display.
 *
 * @param {string|null} id - The full UUID string
 * @returns {string|null} First 8 characters of the ID, or null if input is null/undefined
 *
 * @example
 * shortId('550e8400-e29b-41d4-a716-446655440000');
 * // '550e8400'
 */
export function shortId(id) {
  return id ? id.substring(0, 8) : null;
}

/**
 * Color mapping for context types.
 * @type {Object<string, Function>}
 * @private
 */
const typeColors = {
  constraint: chalk.red,
  decision: chalk.yellow,
  note: chalk.blue,
  task: chalk.magenta,
  entity: chalk.cyan,
  runbook: chalk.green,
  snippet: chalk.white
};

/**
 * Print a formatted context item with type-specific coloring.
 *
 * Format: `{id} [{type}] {content} ({tags})`
 * Also prints scope if not '*'.
 *
 * @param {Object} item - The context item to display
 * @param {string} item.id - The item's UUID
 * @param {string} item.type - The context type (constraint, decision, note, etc.)
 * @param {string} item.content - The text content
 * @param {string[]} [item.tags] - Array of tags
 * @param {string} [item.scope] - Scope path ('*' for global)
 * @param {boolean} [showId=true] - Whether to show the short ID prefix
 *
 * @example
 * contextItem({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   type: 'constraint',
 *   content: 'All API responses must be JSON',
 *   tags: ['api', 'format']
 * });
 * // 550e8400 [constraint] All API responses must be JSON (api, format)
 */
export function contextItem(item, showId = true) {
  const colorFn = typeColors[item.type] || chalk.white;
  const idStr = showId && item.id ? chalk.dim(`${shortId(item.id)} `) : '';
  const prefix = colorFn(`[${item.type}]`);
  const tags = item.tags?.length ? chalk.dim(` (${item.tags.join(', ')})`) : '';

  console.log(`${idStr}${prefix} ${item.content}${tags}`);
  if (item.scope && item.scope !== '*') {
    console.log(chalk.dim(`  scope: ${item.scope}`));
  }
}
