'use strict';

const path = require('path');
const { readFileSafe, writeFileSafe, fileExists } = require('../lib/fs');
const { askAI } = require('../lib/api');
const { stripCodeFence, languageFromExt } = require('../lib/util');
const { confirm } = require('../lib/diff');
const ui = require('../lib/ui');

// Suggests a conventional test file name/location per language.
function suggestTestPath(filePath) {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);

  if (ext === '.py') return path.join(dir, `test_${base}${ext}`);
  if (ext === '.js') return path.join(dir, `${base}.test${ext}`);
  if (ext === '.c') return path.join(dir, `test_${base}${ext}`);
  return path.join(dir, `${base}.test${ext || '.txt'}`);
}

/**
 * /test <file>
 * Generates tests for the given file and writes them to a new test file
 * (after confirmation), without touching the original source.
 */
async function testCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /test <file>');
    return;
  }

  const { content } = readFileSafe(filePath, ctx.config.maxFileBytes);
  const lang = languageFromExt(filePath);

  const messages = [
    {
      role: 'system',
      content:
        `You are an expert ${lang} test engineer. Write a focused test suite for the given ` +
        `file, covering normal cases, edge cases, and error handling. Use a common testing ` +
        `convention for the language (e.g. pytest for Python, a simple assert-based main for C, ` +
        `Node's built-in assert or a lightweight pattern for JS). ` +
        `Reply with ONLY the complete test file content, no explanation, no markdown fences.`,
    },
    { role: 'user', content },
  ];

  const spinner = new ui.Spinner('Generating tests...').start();
  let testCode;
  try {
    testCode = stripCodeFence(await askAI(messages, ctx.config));
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  const testPath = suggestTestPath(filePath);
  console.log('');
  ui.info(`Generated test file preview (will save to ${testPath}):`);
  console.log(ui.color.gray(testCode.split('\n').slice(0, 30).join('\n')));

  if (fileExists(testPath)) {
    ui.warn(`${testPath} already exists.`);
  }
  const ok = await confirm(`Save tests to ${testPath}? (y/n)`);
  if (!ok) {
    ui.warn('Discarded. No file was written.');
    return;
  }

  writeFileSafe(testPath, testCode);
  ui.success(`Saved ${testPath}`);
}

module.exports = testCommand;
