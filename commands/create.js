'use strict';

const { fileExists, writeFileSafe } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const { confirm } = require('../lib/diff');
const ui = require('../lib/ui');

/**
 * /create <filename> "<description>"
 * Generates a brand-new file's content from a natural-language description.
 * Example: ai /create hello.py "a script that prints Hello World"
 */
async function createCommand(args, ctx) {
  const filename = args[0];
  const description = args.slice(1).join(' ').trim();

  if (!filename) {
    ui.error('Usage: ai /create <filename> "<description>"');
    return;
  }
  if (!description) {
    ui.error('Please describe what the file should contain, e.g.\n  ai /create hello.py "prints Hello World"');
    return;
  }

  if (fileExists(filename)) {
    const overwrite = await confirm(`${filename} already exists. Overwrite? (y/n)`);
    if (!overwrite) {
      ui.warn('Cancelled.');
      return;
    }
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

  console.log('');
  ui.info('Preview:');
  console.log(ui.color.gray(generated.split('\n').slice(0, 30).join('\n')));

  const ok = await confirm(`Save to ${filename}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. No file was written.');
    return;
  }

  writeFileSafe(filename, generated);
  ui.success(`Created ${filename}`);
}

module.exports = createCommand;
