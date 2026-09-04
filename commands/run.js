'use strict';

const { readFileSafe } = require('../lib/fs');
const { executeFile, detectLanguage } = require('../lib/exec');
const ui = require('../lib/ui');

/**
 * /run <file>
 * Detects the language by extension and executes it (gcc/python/node),
 * after a dangerous-pattern safety check. Prints stdout/stderr.
 */
async function runCommand(args, ctx) {
  const filePath = args[0];
  if (!filePath) {
    ui.error('Usage: ai /run <file>');
    return;
  }

  const lang = detectLanguage(filePath);
  if (!lang) {
    ui.error('Unsupported file type. Supported: .c, .py, .js');
    return;
  }

  const { content } = readFileSafe(filePath, ctx.config.maxFileBytes);
  const fileArgs = args.slice(1);

  const spinner = new ui.Spinner(`Running ${filePath} (${lang.name})...`).start();
  const result = await executeFile(filePath, content, fileArgs);
  spinner.stop();

  if (result.blocked) {
    ui.error(result.reason);
    return;
  }

  if (result.stage === 'compile' && result.code !== 0) {
    ui.error('Compilation failed:');
    console.log(ui.color.red(result.stderr || '(no stderr output)'));
    return;
  }

  if (result.stdout) {
    console.log(ui.color.bold('stdout:'));
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.log(ui.color.bold('stderr:'));
    console.log(ui.color.yellow(result.stderr));
  }

  if (result.code === 0) {
    ui.success(`Finished (exit code 0)`);
  } else {
    ui.warn(`Finished with exit code ${result.code}`);
  }
}

module.exports = runCommand;
