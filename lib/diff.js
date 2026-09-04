'use strict';

/**
 * lib/diff.js
 * -----------
 * A small, dependency-free line-based diff (classic LCS algorithm).
 * Good enough for showing AI-proposed code changes before applying them.
 * Also owns the "Apply changes? (y/n)" confirmation prompt so every
 * command that modifies files goes through the same safety gate.
 */

const readline = require('readline');
const { color } = require('./ui');

/**
 * Computes an LCS-based diff between two arrays of lines.
 * Returns an array of { type: 'same'|'add'|'remove', line } in order.
 */
function diffLines(oldContent = '', newContent = '') {
  if (!oldContent && !newContent) return [];
  if (!oldContent) {
    return newContent.split('\n').map((line) => ({ type: 'add', line }));
  }
  if (!newContent) {
    return oldContent.split('\n').map((line) => ({ type: 'remove', line }));
  }

  const a = oldContent.split('\n');
  const b = newContent.split('\n');
  const n = a.length;
  const m = b.length;

  // Build LCS length table
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', line: a[i] });
      i++;
    } else {
      result.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: 'remove', line: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: 'add', line: b[j] });
    j++;
  }
  return result;
}

/**
 * Renders a diff result to the terminal with +/- prefixes and color,
 * collapsing long runs of unchanged lines for readability on a small screen.
 */
function printDiff(diffResult, contextLines = 2) {
  let unchangedRun = [];

  function flushUnchanged() {
    if (unchangedRun.length === 0) return;
    if (unchangedRun.length <= contextLines * 2) {
      for (const l of unchangedRun) console.log(color.gray(`  ${l}`));
    } else {
      for (const l of unchangedRun.slice(0, contextLines)) {
        console.log(color.gray(`  ${l}`));
      }
      console.log(color.dim(`  ... (${unchangedRun.length - contextLines * 2} unchanged lines) ...`));
      for (const l of unchangedRun.slice(-contextLines)) {
        console.log(color.gray(`  ${l}`));
      }
    }
    unchangedRun = [];
  }

  for (const entry of diffResult) {
    if (entry.type === 'same') {
      unchangedRun.push(entry.line);
      continue;
    }
    flushUnchanged();
    if (entry.type === 'remove') {
      console.log(color.red(`- ${entry.line}`));
    } else if (entry.type === 'add') {
      console.log(color.green(`+ ${entry.line}`));
    }
  }
  flushUnchanged();
}

function hasChanges(diffResult) {
  return diffResult.some((e) => e.type !== 'same');
}

/**
 * Prompts the user with y/n. Resolves true only on an explicit 'y' or 'yes'.
 */
function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

module.exports = {
  diffLines,
  printDiff,
  hasChanges,
  confirm,
};
