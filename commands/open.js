'use strict';

const { scanProject } = require('../lib/project');
const chatCommand = require('./chat');
const ui = require('../lib/ui');

/**
 * /open [dir]
 * Also the default action when running `pocu` with no arguments.
 * Scans the target directory (default: cwd), prints a project tree so
 * you know what's there, then drops into project-aware chat mode where
 * you can reference any file with @relative/path.
 *
 * This is the "opencode"-style entry point: instead of pointing the tool
 * at one file, you open a whole project and work across it.
 */
async function openCommand(args, ctx) {
  const path = require('path');
  const targetDir = args[0] ? path.resolve(args[0]) : process.cwd();

  const spinner = new ui.Spinner('Scanning project...').start();
  const { tree, files } = scanProject(targetDir);
  spinner.stop();

  ui.info(`Opened project: ${targetDir}`);
  ui.info(`${files.length} file(s) found` + (files.length >= 400 ? ' (capped preview)' : ''));
  console.log(ui.color.gray(tree || '(empty directory)'));
  console.log('');
  ui.info('Reference any file in chat with @relative/path, e.g. "@src/app.py explain this"');

  await chatCommand([], { ...ctx, projectRoot: targetDir });
}

module.exports = openCommand;
