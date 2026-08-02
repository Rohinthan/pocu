'use strict';

const { readFileSafe, writeFileSafe, previewContent } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { diffLines, printDiff, hasChanges, confirm } = require('../lib/diff');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const ui = require('../lib/ui');

/**
 * /fix <file>
 * Asks the AI to fix bugs/errors in the given file, shows a diff,
 * and only writes the file back if the user confirms.
 */
async function fixCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /fix <file>');
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
        `You are an expert ${lang} engineer. Fix bugs, compile/runtime errors, and obvious ` +
        `correctness issues in the given file. Preserve style and structure where possible. ` +
        `Reply with ONLY the complete corrected file content, no explanation, no markdown fences.`,
    },
    { role: 'user', content },
  ];

  const spinner = new ui.Spinner('Asking AI to fix the file...').start();
  let fixed;
  try {
    fixed = stripCodeFence(await askAI(messages, ctx.config));
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  const diffResult = diffLines(content, fixed);
  if (!hasChanges(diffResult)) {
    ui.success('AI found no changes needed.');
    return;
  }

  ui.info('Proposed changes:');
  printDiff(diffResult);

  const ok = await confirm(`Apply changes to ${filePath}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. No changes were written.');
    return;
  }

  writeFileSafe(filePath, fixed);
  ui.success(`Updated ${filePath}`);
}

module.exports = fixCommand;
