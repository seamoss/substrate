/**
 * Configuration path utilities for Substrate CLI.
 *
 * Manages two types of configuration:
 * 1. **Global config** - Stored in `~/.substrate/` (API settings, auth, database)
 * 2. **Project config** - Stored in `.substrate/` in project root (project ID)
 *
 * @module lib/config
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

/**
 * Global Substrate configuration directory path.
 * Default: `~/.substrate/`
 * @type {string}
 */
const CONFIG_DIR = join(homedir(), '.substrate');

/**
 * Path to the local SQLite database.
 * Default: `~/.substrate/local.db`
 * @type {string}
 * @private
 */
const DB_PATH = join(CONFIG_DIR, 'local.db');

/**
 * Path to the global configuration file.
 * Default: `~/.substrate/config.json`
 * @type {string}
 * @private
 */
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * Project-level config directory name.
 * @type {string}
 * @private
 */
const PROJECT_CONFIG_DIR = '.substrate';

/**
 * Project-level config file name.
 * @type {string}
 * @private
 */
const PROJECT_CONFIG_FILE = 'config.json';

/**
 * Ensure the global config directory exists.
 *
 * Creates `~/.substrate/` if it doesn't exist.
 *
 * @returns {string} The config directory path
 *
 * @example
 * const configDir = ensureConfigDir();
 * // Creates ~/.substrate/ if needed
 * // Returns '/Users/username/.substrate'
 */
export function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_DIR;
}

/**
 * Get the path to the local SQLite database.
 *
 * Ensures the config directory exists before returning.
 *
 * @returns {string} Full path to `~/.substrate/local.db`
 *
 * @example
 * const dbPath = getDbPath();
 * // '/Users/username/.substrate/local.db'
 */
export function getDbPath() {
  ensureConfigDir();
  return DB_PATH;
}

/**
 * Get the path to the global configuration file.
 *
 * Ensures the config directory exists before returning.
 *
 * @returns {string} Full path to `~/.substrate/config.json`
 *
 * @example
 * const configPath = getConfigPath();
 * // '/Users/username/.substrate/config.json'
 */
export function getConfigPath() {
  ensureConfigDir();
  return CONFIG_PATH;
}

/**
 * Get the Substrate API server URL.
 *
 * Checks the `SUBSTRATE_API_URL` environment variable first,
 * falls back to the production server.
 *
 * @returns {string} The API server URL
 *
 * @example
 * // Default
 * getApiUrl(); // 'https://substrate.heavystack.io'
 *
 * // With env var
 * process.env.SUBSTRATE_API_URL = 'http://localhost:3000';
 * getApiUrl(); // 'http://localhost:3000'
 */
export function getApiUrl() {
  return process.env.SUBSTRATE_API_URL || 'https://substrate.heavystack.io';
}

/**
 * Get the project-level config directory path.
 *
 * Returns `.substrate/` in the current working directory.
 *
 * @returns {string} Full path to `.substrate/` in cwd
 *
 * @example
 * // If cwd is /Users/dev/myproject
 * getProjectConfigDir(); // '/Users/dev/myproject/.substrate'
 */
export function getProjectConfigDir() {
  return join(process.cwd(), PROJECT_CONFIG_DIR);
}

/**
 * Get the project-level config file path.
 *
 * @returns {string} Full path to `.substrate/config.json` in cwd
 *
 * @example
 * // If cwd is /Users/dev/myproject
 * getProjectConfigPath(); // '/Users/dev/myproject/.substrate/config.json'
 */
export function getProjectConfigPath() {
  return join(getProjectConfigDir(), PROJECT_CONFIG_FILE);
}

/**
 * Ensure the project-level config directory exists.
 *
 * Creates `.substrate/` in the current working directory if it doesn't exist.
 *
 * @returns {string} The project config directory path
 *
 * @example
 * ensureProjectConfigDir();
 * // Creates .substrate/ in cwd if needed
 */
export function ensureProjectConfigDir() {
  const dir = getProjectConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * @typedef {Object} ProjectConfig
 * @property {string} project_id - The workspace's unique project ID (UUID)
 */

/**
 * Load the project-level configuration.
 *
 * Reads and parses `.substrate/config.json` from the current directory.
 *
 * @returns {ProjectConfig|null} The parsed config object, or null if not found or invalid
 *
 * @example
 * const config = loadProjectConfig();
 * if (config) {
 *   console.log('Project ID:', config.project_id);
 * }
 */
export function loadProjectConfig() {
  const configPath = getProjectConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Save the project-level configuration.
 *
 * Writes config to `.substrate/config.json` in the current directory.
 * Creates the `.substrate/` directory if it doesn't exist.
 *
 * @param {ProjectConfig} config - The configuration object to save
 *
 * @example
 * saveProjectConfig({ project_id: '550e8400-e29b-41d4-a716-446655440000' });
 */
export function saveProjectConfig(config) {
  ensureProjectConfigDir();
  const configPath = getProjectConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get the current project's ID from the project config.
 *
 * Convenience function that loads the project config and returns just the project_id.
 *
 * @returns {string|null} The project ID, or null if no project config exists
 *
 * @example
 * const projectId = getProjectId();
 * if (projectId) {
 *   const workspace = findWorkspaceByProjectId(projectId);
 * }
 */
export function getProjectId() {
  const config = loadProjectConfig();
  return config?.project_id || null;
}

export { CONFIG_DIR };
