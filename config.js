'use strict';

/**
 * config.js
 * ---------
 * Loads configuration from three layers, in increasing priority:
 *   1. .env.example defaults (none used directly, just documents keys)
 *   2. .env file in the project directory (hand-rolled parser, no dependency)
 *   3. Persisted user config at ~/.ai-cli/config.json (set via /model, /connect)
 *
 * Also exposes paths used by lib/store.js for history + saved config.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = __dirname;
const HOME_DIR = path.join(os.homedir(), '.ai-cli');
const STORE_CONFIG_PATH = path.join(HOME_DIR, 'config.json');
const HISTORY_PATH = path.join(HOME_DIR, 'history.json');

// --- tiny .env parser (avoids pulling in the `dotenv` dependency) ---
function loadDotEnv(envPath) {
  const result = {};
  if (!fs.existsSync(envPath)) return result;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function ensureHomeDir() {
  if (!fs.existsSync(HOME_DIR)) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
  }
}

function loadStoredConfig() {
  ensureHomeDir();
  if (!fs.existsSync(STORE_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveStoredConfig(partial) {
  ensureHomeDir();
  const current = loadStoredConfig();
  const merged = { ...current, ...partial };
  fs.writeFileSync(STORE_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getConfig() {
  const dotenv = loadDotEnv(path.join(PROJECT_ROOT, '.env'));
  const stored = loadStoredConfig();

  // Priority: stored config (set at runtime via /model, /connect) > .env > process.env > defaults
  const provider =
    stored.provider || dotenv.AI_PROVIDER || process.env.AI_PROVIDER || 'openai';
  const model =
    stored.model || dotenv.AI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini';

  const openaiKey =
    stored.OPENAI_API_KEY || dotenv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  const geminiKey =
    stored.GEMINI_API_KEY || dotenv.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  const timeoutMs = parseInt(
    dotenv.AI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || '60000',
    10
  );
  const maxFileBytes = parseInt(
    dotenv.AI_MAX_FILE_BYTES || process.env.AI_MAX_FILE_BYTES || '200000',
    10
  );

  return {
    provider,
    model,
    keys: {
      openai: openaiKey,
      gemini: geminiKey,
    },
    timeoutMs,
    maxFileBytes,
  };
}

module.exports = {
  getConfig,
  saveStoredConfig,
  loadStoredConfig,
  HOME_DIR,
  STORE_CONFIG_PATH,
  HISTORY_PATH,
};
