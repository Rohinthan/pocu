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
  if (!text) return '';
  const trimmed = text.trim();
  // Match full fence with any language tag and CRLF/LF
  const exactMatch = trimmed.match(/^```[a-zA-Z0-9_+-]*[\r\n]+([\s\S]*?)[\r\n]+```$/);
  if (exactMatch) return exactMatch[1];

  // If model added surrounding conversational text, extract the largest fenced code block
  const blockRegex = /```[a-zA-Z0-9_+-]*[\r\n]+([\s\S]*?)[\r\n]+```/g;
  let match;
  let best = null;
  while ((match = blockRegex.exec(trimmed)) !== null) {
    if (!best || match[1].length > best.length) {
      best = match[1];
    }
  }
  if (best !== null) return best;

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
