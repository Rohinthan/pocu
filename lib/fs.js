'use strict';

/**
 * lib/fs.js
 * ---------
 * Safe, minimal filesystem helpers used by the commands.
 * - Never writes without an explicit call from a command that has
 *   already gotten user confirmation (see lib/diff.js confirmApply).
 * - Enforces a max file size so we never blow up memory on a phone
 *   or send huge payloads to the API.
 */

const fs = require('fs');
const path = require('path');

class FileTooLargeError extends Error {}
class FileNotFoundError extends Error {}

function readFileSafe(filePath, maxBytes = 200000) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new FileNotFoundError(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new FileNotFoundError(`Not a regular file: ${filePath}`);
  }
  if (stat.size > maxBytes) {
    throw new FileTooLargeError(
      `File too large (${stat.size} bytes). Limit is ${maxBytes} bytes. ` +
        `Increase AI_MAX_FILE_BYTES in .env if you really need to send this.`
    );
  }

  const content = fs.readFileSync(resolved, 'utf8');
  return { path: resolved, content, size: stat.size };
}

function writeFileSafe(filePath, content) {
  const resolved = path.resolve(filePath);
  // Make sure the parent directory exists before writing.
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, content, 'utf8');
  return resolved;
}

function fileExists(filePath) {
  return fs.existsSync(path.resolve(filePath));
}

/**
 * Returns a short preview (first N lines) of a file's content, used to
 * show the user what is about to be sent to the API before it happens.
 */
function previewContent(content, maxLines = 20) {
  const lines = content.split('\n');
  const preview = lines.slice(0, maxLines).join('\n');
  const truncated = lines.length > maxLines;
  return { preview, truncated, totalLines: lines.length };
}

module.exports = {
  readFileSafe,
  writeFileSafe,
  fileExists,
  previewContent,
  FileTooLargeError,
  FileNotFoundError,
};
