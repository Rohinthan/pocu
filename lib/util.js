'use strict';

/**
 * lib/util.js
 * -----------
 * Small shared helpers used across multiple commands.
 */

const path = require('path');

/**
 * Strips a single leading/trailing markdown code fence from an AI
 * response, e.g. ```c\n...code...\n``` -> ...code...
 * If the response has no fence, it is returned unchanged.
 */
function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (fenceMatch) return fenceMatch[1];
  return trimmed;
}

/**
 * Maps a file extension to a human-friendly language name, used to
 * give the AI better context in prompts.
 */
function languageFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.c': 'C',
    '.h': 'C header',
    '.py': 'Python',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.java': 'Java',
    '.cpp': 'C++',
    '.rs': 'Rust',
    '.go': 'Go',
  };
  return map[ext] || 'code';
}

module.exports = { stripCodeFence, languageFromExt };
