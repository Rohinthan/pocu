'use strict';

/**
 * lib/project.js
 * --------------
 * Gives the CLI "agent" awareness of the current working directory,
 * similar to how tools like OpenCode/aider open a whole project instead
 * of a single file. This stays dependency-free: plain fs walking with a
 * small ignore list, no .gitignore parser (kept intentionally simple for
 * a low-RAM mobile environment).
 */

const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.ai-cli', 'dist', 'build', '__pycache__',
  '.venv', 'venv', '.idea', '.vscode', 'target', '.cache',
]);

const IGNORE_FILES = new Set(['.env', '.DS_Store']);

/**
 * Recursively walks `dir` and returns an indented tree string plus a
 * flat list of relative file paths (files only, capped at maxEntries).
 */
function scanProject(dir = process.cwd(), { maxDepth = 3, maxEntries = 400 } = {}) {
  const files = [];
  const lines = [];

  function walk(current, depth, prefix) {
    if (depth > maxDepth || files.length >= maxEntries) return;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      return;
    }

    entries = entries
      .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
      .filter((e) => !(e.isDirectory() && IGNORE_DIRS.has(e.name)))
      .filter((e) => !(e.isFile() && IGNORE_FILES.has(e.name)))
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

    for (const entry of entries) {
      if (files.length >= maxEntries) break;
      const rel = path.relative(dir, path.join(current, entry.name));
      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`);
        walk(path.join(current, entry.name), depth + 1, prefix + '  ');
      } else {
        lines.push(`${prefix}${entry.name}`);
        files.push(rel);
      }
    }
  }

  walk(dir, 0, '');
  return { tree: lines.join('\n'), files, root: dir };
}

/**
 * Resolves an "@relative/path" mention (used in /chat and /ask) to an
 * absolute path, guarding against escaping the project root.
 */
function resolveMention(root, mention) {
  const cleaned = mention.replace(/^@/, '');
  const resolved = path.resolve(root, cleaned);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error(`Refusing to read a path outside the project directory: ${mention}`);
  }
  return resolved;
}

/**
 * Finds every "@path" token in a string and returns the unique list.
 */
function extractMentions(text) {
  const matches = text.match(/@[\w./-]+/g) || [];
  return [...new Set(matches)];
}

module.exports = { scanProject, resolveMention, extractMentions };
