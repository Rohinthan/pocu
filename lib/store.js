'use strict';

/**
 * lib/store.js
 * ------------
 * Persists a small rolling history of commands/prompts to
 * ~/.ai-cli/history.json so `/history` can show past activity.
 */

const fs = require('fs');
const path = require('path');
const { HISTORY_PATH, HOME_DIR } = require('../config');

const MAX_HISTORY = 200;
const PENDING_PATH = path.join(HOME_DIR, 'pending.json');

function ensureDir() {
  if (!fs.existsSync(HOME_DIR)) fs.mkdirSync(HOME_DIR, { recursive: true });
}

function loadHistory() {
  ensureDir();
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function addHistory(entry) {
  ensureDir();
  const history = loadHistory();
  history.push({
    ts: new Date().toISOString(),
    ...entry,
  });
  // keep only the most recent N entries
  const trimmed = history.slice(-MAX_HISTORY);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
}

// --- Pending changes (used by /diff to stage a change, /apply to commit it) ---

function loadPending() {
  ensureDir();
  if (!fs.existsSync(PENDING_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function savePendingChange(absPath, original, proposed) {
  ensureDir();
  const pending = loadPending();
  pending[absPath] = { original, proposed, ts: new Date().toISOString() };
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), 'utf8');
}

function getPendingChange(absPath) {
  const pending = loadPending();
  return pending[absPath] || null;
}

function clearPendingChange(absPath) {
  const pending = loadPending();
  delete pending[absPath];
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), 'utf8');
}

module.exports = {
  loadHistory,
  addHistory,
  savePendingChange,
  getPendingChange,
  clearPendingChange,
};
