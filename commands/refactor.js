'use strict';

const { readFileSafe, writeFileSafe, previewContent } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { diffLines, printDiff, hasChanges, confirm } = require('../lib/diff');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const ui = require('../lib/ui');

/**
 * /refactor <file>
 * Asks the AI to improve structure/readability without changing behavior,
 * shows a diff, and confirms before writing.
 */
async function refactorCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /refactor <file>');
    return;
  }

  const { content } = readFileSafe(filePath, ctx.config.maxFileBytes);
  const { preview, truncated } = previewContent(content);
  ui.info(`Previewing ${filePath}${truncated ? ' (truncated)' : ''}:`);
  console.log(ui.color.gray(preview));

  const lang = languageFromExt(filePath);
  const messages = [
    {
      role: 'system',
      content:
        `You are an expert ${lang} engineer. Refactor the given file to improve readability, ` +
        `structure, and maintainability WITHOUT changing external behavior. Keep the public ` +
        `interface (function names/signatures used elsewhere) stable unless clearly internal. ` +
        `Reply with ONLY the complete refactored file content, no explanation, no markdown fences.`,
    },
    { role: 'user', content },
  ];

  const spinner = new ui.Spinner('Asking AI to refactor the file...').start();
  let refactored;
  try {
    refactored = stripCodeFence(await askAI(messages, ctx.config));
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  const diffResult = diffLines(content, refactored);
  if (!hasChanges(diffResult)) {
    ui.success('AI found no refactor opportunities.');
    return;
  }

  ui.info('Proposed changes:');
  printDiff(diffResult);

  const ok = await confirm(`Apply refactor to ${filePath}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. No changes were written.');
    return;
  }

  writeFileSafe(filePath, refactored);
  ui.success(`Updated ${filePath}`);
}

module.exports = refactorCommand;
