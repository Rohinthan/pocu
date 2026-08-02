'use strict';

const path = require('path');
const { readFileSafe } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { diffLines, printDiff, hasChanges } = require('../lib/diff');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const { savePendingChange } = require('../lib/store');
const ui = require('../lib/ui');

/**
 * /diff <file>
 * Asks the AI what it would change, shows the diff, and stages the
 * proposed content so a follow-up `/apply <file>` can write it.
 * Does NOT modify the file itself.
 */
async function diffCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /diff <file>');
    return;
  }

  const { content, path: absPath } = readFileSafe(filePath, ctx.config.maxFileBytes);
  const lang = languageFromExt(filePath);

  const messages = [
    {
      role: 'system',
      content:
        `You are an expert ${lang} engineer. Review the file and produce an improved version ` +
        `(bug fixes, clarity, minor safety issues). Do not rewrite things that are already fine. ` +
        `Reply with ONLY the complete updated file content, no explanation, no markdown fences.`,
    },
    { role: 'user', content },
  ];

  const spinner = new ui.Spinner('Asking AI for a proposed diff...').start();
  let proposed;
  try {
    proposed = stripCodeFence(await askAI(messages, ctx.config));
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  const diffResult = diffLines(content, proposed);
  if (!hasChanges(diffResult)) {
    ui.success('No changes proposed.');
    return;
  }

  ui.info('Proposed changes (not yet applied):');
  printDiff(diffResult);

  savePendingChange(absPath, content, proposed);
  ui.info(`Run "ai /apply ${filePath}" to write these changes, or ignore to discard.`);
}

module.exports = diffCommand;
