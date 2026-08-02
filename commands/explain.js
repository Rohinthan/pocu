'use strict';

const { readFileSafe, previewContent } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { languageFromExt } = require('../lib/util');
const ui = require('../lib/ui');

/**
 * /explain <file>
 * Sends the file to the AI and prints a plain-English explanation.
 */
async function explainCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /explain <file>');
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
        `You are an expert ${lang} engineer and teacher. Explain what the given file does, ` +
        `covering overall purpose, key functions/structures, and any notable edge cases or ` +
        `risks. Be concise but thorough. Plain text, no markdown fences.`,
    },
    { role: 'user', content },
  ];

  const spinner = new ui.Spinner('Asking AI to explain the file...').start();
  let explanation;
  try {
    explanation = await askAI(messages, ctx.config);
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  console.log('');
  console.log(ui.color.bold('Explanation:'));
  console.log(explanation.trim());
}

module.exports = explainCommand;
