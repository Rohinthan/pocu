'use strict';

const { fileExists, readFileSafe, writeFileSafe } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const { diffLines, printDiff, confirm } = require('../lib/diff');
const ui = require('../lib/ui');

/**
 * /create <filename> "<description>"
 * Generates a brand-new file's content from a natural-language description.
 * Example: pocu /create hello.py "a script that prints Hello World"
 */
async function createCommand(args, ctx) {
  const filename = args[0];
  const description = args.slice(1).join(' ').trim();

  if (!filename) {
    ui.error('Usage: pocu /create <filename> "<description>"');
    return;
  }
  if (!description) {
    ui.error('Please describe what the file should contain, e.g.\n  pocu /create hello.py "prints Hello World"');
    return;
  }

  let oldContent = '';
  if (fileExists(filename)) {
    try {
      oldContent = readFileSafe(filename, ctx.config.maxFileBytes).content;
      ui.warn(`${filename} already exists. Proposed changes will be diffed against existing file.`);
    } catch (_) {}
  }

  const lang = languageFromExt(filename);
  const messages = [
    {
      role: 'system',
      content:
        `You are an expert ${lang} engineer. Generate a complete, working file based on the ` +
        `user's description. Reply with ONLY the file content, no explanation, no markdown fences.`,
    },
    { role: 'user', content: description },
  ];

  const spinner = new ui.Spinner('Generating file...').start();
  let generated;
  try {
    generated = stripCodeFence(await askAI(messages, ctx.config));
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  const diffResult = diffLines(oldContent, generated);
  console.log('');
  ui.info(oldContent ? 'Proposed changes:' : 'Proposed additions:');
  printDiff(diffResult);

  const ok = await confirm(`Save to ${filename}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. No file was written.');
    return;
  }

  writeFileSafe(filename, generated);
  ui.success(`Created ${filename}`);
}

module.exports = createCommand;
