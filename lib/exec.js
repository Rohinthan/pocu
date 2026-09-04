'use strict';

/**
 * lib/exec.js
 * -----------
 * Detects a source file's language from its extension and runs it using
 * the appropriate interpreter/compiler via child_process. Includes a
 * heuristic guard against obviously destructive commands/content.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

// Patterns that should never be allowed to run automatically.
// This is a heuristic safety net, not a sandbox -- it blocks the most
// common destructive one-liners so the tool doesn't casually nuke a device.
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(?=\s|["'`;\n]|$)/, // rm -rf / (also catches -fr, quoted forms, via system()/exec calls)
  /rm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\/(?=\s|["'`;\n]|$)/, // rm -fr / variant
  /rm\s+-rf\s+~/, // rm -rf ~
  /rm\s+-rf\s+\*/, // rm -rf *
  /:\(\)\{.*:\|:&.*\};:/, // classic fork bomb
  /mkfs\./, // formatting a filesystem
  /dd\s+if=.*of=\/dev\//, // raw disk writes
  />\s*\/dev\/sd[a-z]/, // writing directly to a disk device
  /chmod\s+-R\s+777\s+\//, // recursive chmod on root
  /curl[^\n]*\|\s*sh/, // curl | sh remote execution
  /wget[^\n]*\|\s*sh/, // wget | sh remote execution
  /system\s*\(\s*["'`].*rm\s+-rf/, // system("rm -rf ...") style calls in C/etc.
  /os\.system\s*\(\s*["'`].*rm\s+-rf/, // Python os.system("rm -rf ...")
  /child_process|exec\s*\(\s*["'`].*rm\s+-rf/, // JS exec("rm -rf ...")
];

function findDangerousPattern(code) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) return pattern.toString();
  }
  return null;
}

const LANGUAGE_MAP = {
  '.c': { name: 'C', run: runC },
  '.py': { name: 'Python', run: runPython },
  '.js': { name: 'JavaScript', run: runNode },
};

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

function execPromise(cmd, args, options = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: stdout || '',
        stderr: stderr || (err ? err.message : ''),
        timedOut: err && err.killed === true,
      });
    });
  });
}

async function runC(filePath, args = []) {
  const tmpBinary = path.join(os.tmpdir(), `ai_cli_bin_${Date.now()}`);
  const compile = await execPromise('gcc', [filePath, '-o', tmpBinary]);
  if (compile.code !== 0) {
    return { stage: 'compile', ...compile };
  }
  const run = await execPromise(tmpBinary, args);
  try {
    fs.unlinkSync(tmpBinary);
  } catch (e) {
    /* best-effort cleanup */
  }
  return { stage: 'run', ...run };
}

async function runPython(filePath, args = []) {
  // Prefer python3 if available, fall back to python.
  const bin = process.platform === 'win32' ? 'python' : 'python3';
  const run = await execPromise(bin, [filePath, ...args]);
  return { stage: 'run', ...run };
}

async function runNode(filePath, args = []) {
  const run = await execPromise(process.execPath, [filePath, ...args]);
  return { stage: 'run', ...run };
}

/**
 * Runs a source file after checking its content for dangerous patterns.
 * Returns { blocked, reason } if blocked, otherwise the run result.
 */
async function executeFile(filePath, content, args = []) {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return { blocked: true, reason: `Unsupported file type: ${path.extname(filePath) || '(no extension)'}` };
  }

  const dangerous = findDangerousPattern(content);
  if (dangerous) {
    return {
      blocked: true,
      reason: `Refusing to execute: file content matches a dangerous pattern (${dangerous}).`,
    };
  }

  const result = await lang.run(filePath, args);
  return { blocked: false, language: lang.name, ...result };
}

module.exports = { detectLanguage, executeFile, findDangerousPattern };
