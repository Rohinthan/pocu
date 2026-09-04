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

const DEFAULT_MODELS = {
  gemini: 'gemini-flash-lite-latest',
  google: 'gemini-flash-lite-latest',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  claude: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'google/gemini-2.0-flash-lite-001',
  ollama: 'llama3',
  local: 'llama3',
};

const PROVIDER_ENV_MAP = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  google: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: 'OLLAMA_BASE_URL',
  local: 'OLLAMA_BASE_URL',
};

function getConfig() {
  const dotenv = loadDotEnv(path.join(PROJECT_ROOT, '.env'));
  const stored = loadStoredConfig();

  // Priority: stored config (set at runtime via /model, /connect) > .env > process.env > defaults
  const provider = (
    stored.provider || dotenv.AI_PROVIDER || process.env.AI_PROVIDER || 'gemini'
  ).toLowerCase();

  let model = stored.model || dotenv.AI_MODEL || process.env.AI_MODEL;
  if (!model || model === 'test' || model === 'gemini-1.5-flash' || model === 'gemini-2.5-flash') {
    model = DEFAULT_MODELS[provider] || 'gpt-4o-mini';
  }

  const keys = {
    openai: stored.OPENAI_API_KEY || dotenv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    gemini: stored.GEMINI_API_KEY || dotenv.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    google: stored.GEMINI_API_KEY || dotenv.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    anthropic: stored.ANTHROPIC_API_KEY || dotenv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    claude: stored.ANTHROPIC_API_KEY || dotenv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    deepseek: stored.DEEPSEEK_API_KEY || dotenv.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    groq: stored.GROQ_API_KEY || dotenv.GROQ_API_KEY || process.env.GROQ_API_KEY || '',
    openrouter: stored.OPENROUTER_API_KEY || dotenv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '',
    ollama: stored.OLLAMA_BASE_URL || dotenv.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || '',
    local: stored.OLLAMA_BASE_URL || dotenv.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || '',
  };

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
    keys,
    timeoutMs,
    maxFileBytes,
  };
}

module.exports = {
  getConfig,
  saveStoredConfig,
  loadStoredConfig,
  DEFAULT_MODELS,
  PROVIDER_ENV_MAP,
  HOME_DIR,
  STORE_CONFIG_PATH,
  HISTORY_PATH,
};
