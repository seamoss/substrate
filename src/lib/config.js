import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.substrate');
const DB_PATH = join(CONFIG_DIR, 'local.db');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// Project-level config directory (.substrate in cwd)
const PROJECT_CONFIG_DIR = '.substrate';
const PROJECT_CONFIG_FILE = 'config.json';

export function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_DIR;
}

export function getDbPath() {
  ensureConfigDir();
  return DB_PATH;
}

export function getConfigPath() {
  ensureConfigDir();
  return CONFIG_PATH;
}

export function getApiUrl() {
  return process.env.SUBSTRATE_API_URL || 'https://substrate.heavystack.io';
}

// Project-level config functions
export function getProjectConfigDir() {
  return join(process.cwd(), PROJECT_CONFIG_DIR);
}

export function getProjectConfigPath() {
  return join(getProjectConfigDir(), PROJECT_CONFIG_FILE);
}

export function ensureProjectConfigDir() {
  const dir = getProjectConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

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

export function saveProjectConfig(config) {
  ensureProjectConfigDir();
  const configPath = getProjectConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function getProjectId() {
  const config = loadProjectConfig();
  return config?.project_id || null;
}

export { CONFIG_DIR };
