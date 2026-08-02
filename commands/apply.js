'use strict';

const path = require('path');
const { readFileSafe, writeFileSafe } = require('../lib/fs');
const { diffLines, printDiff, hasChanges, confirm } = require('../lib/diff');
const { getPendingChange, clearPendingChange } = require('../lib/store');
const ui = require('../lib/ui');

/**
 * /apply <file>
 * Applies the change most recently staged by `/diff <file>`. Re-confirms
 * with the user and re-diffs against the file's CURRENT content in case
 * it changed since the diff was generated.
 */
async function applyCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /apply <file>');
    return;
  }

  const absPath = path.resolve(filePath);
  const pending = getPendingChange(absPath);
  if (!pending) {
    ui.error(`No pending changes for ${filePath}. Run "ai /diff ${filePath}" first.`);
    return;
  }

  const { content: currentContent } = readFileSafe(filePath, ctx.config.maxFileBytes);
  if (currentContent !== pending.original) {
    ui.warn('The file has changed since the diff was generated. Re-diffing against current content:');
  }

  const diffResult = diffLines(currentContent, pending.proposed);
  if (!hasChanges(diffResult)) {
    ui.success('Nothing to apply; file already matches the proposed version.');
    clearPendingChange(absPath);
    return;
  }

  ui.info('Changes to apply:');
  printDiff(diffResult);

  const ok = await confirm(`Apply these changes to ${filePath}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. Pending change kept in case you want to retry.');
    return;
  }

  writeFileSafe(filePath, pending.proposed);
  clearPendingChange(absPath);
  ui.success(`Applied changes to ${filePath}`);
}

module.exports = applyCommand;
