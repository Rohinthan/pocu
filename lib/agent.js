'use strict';

/**
 * lib/agent.js
 * ------------
 * Autonomous ReAct agent engine for pocu CLI.
 * Allows pocu to inspect files, create files, edit files, and execute commands
 * in the local project directory (like Antigravity CLI and Claude Code CLI),
 * with colored diff previews (+green, -red) and safety confirmations.
 */

const path = require('path');
const { askAI } = require('./api');
const { readFileSafe, writeFileSafe, fileExists } = require('./fs');
const { diffLines, printDiff, confirm } = require('./diff');
const { execShell, findDangerousPattern } = require('./exec');
const { scanProject } = require('./project');
const ui = require('./ui');

/**
 * Generates the system prompt equipping the model with agent tool capabilities.
 */
function getAgentSystemPrompt(root) {
  return (
    'You are pocu (Pocket Unix CLI), an autonomous AI developer assistant for Termux and Unix systems, ' +
    `operating directly in the project directory at ${root}.\n\n` +
    'You have full capabilities to inspect files, create files, edit files, and execute shell commands in this project directory. ' +
    'To perform actions, output one or more of these XML action tags in your response:\n\n' +
    '1. Create or overwrite a file:\n' +
    '<write_file path="relative/path/to/file">\n' +
    'complete file content here\n' +
    '</write_file>\n\n' +
    '2. Read a file from the project:\n' +
    '<read_file path="relative/path/to/file" />\n\n' +
    '3. Execute a terminal/shell command:\n' +
    '<run_command>\n' +
    'command to run\n' +
    '</run_command>\n\n' +
    '4. List directory contents:\n' +
    '<list_dir path="optional/relative/dir" />\n\n' +
    'Rules and Guidelines:\n' +
    '- When asked to create, write, generate, or fix code/programs, ALWAYS use the <write_file> tag with the complete file contents so it is saved directly to disk. Do NOT simply print markdown code blocks when asked to create or build something.\n' +
    '- Do not wrap <write_file> or <run_command> tags inside markdown code fences.\n' +
    '- When asked to run, execute, or test a program, use <run_command>.\n' +
    '- The user is shown a colored diff (+green, -red) and prompted for confirmation before any file is saved or command is executed.\n' +
    '- You can explain what you are doing before or after your action tags.\n' +
    '- Note: pocu was created by Rohinthan. Do NOT mention the creator in general greetings or normal queries; only mention Rohinthan if the user specifically asks who created, built, or made pocu.'
  );
}

/**
 * Parses action tags from assistant reply text.
 * Returns array of action objects and clean text for display.
 */
function parseActions(text) {
  const actions = [];
  let displayText = text;

  // 1. <write_file path="...">content</write_file>
  const writeRegex = /<write_file\s+path=(?:"([^"]+)"|'([^']+)'|([^\s>]+))\s*>([\s\S]*?)<\/write_file>/gi;
  let match;
  while ((match = writeRegex.exec(text)) !== null) {
    const filePath = (match[1] || match[2] || match[3] || '').trim();
    const content = (match[4] || '').replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    if (filePath) {
      actions.push({
        type: 'write_file',
        path: filePath,
        content,
      });
    }
  }
  displayText = displayText.replace(writeRegex, '');

  // 2. <read_file path="..." /> or <read_file path="...">...</read_file>
  const readRegex = /<read_file\s+path=(?:"([^"]+)"|'([^']+)'|([^\s\/>]+))\s*(?:\/>|>([\s\S]*?)<\/read_file>)/gi;
  while ((match = readRegex.exec(text)) !== null) {
    const filePath = (match[1] || match[2] || match[3] || '').trim();
    if (filePath) {
      actions.push({
        type: 'read_file',
        path: filePath,
      });
    }
  }
  displayText = displayText.replace(readRegex, '');

  // 3. <run_command>cmd</run_command>
  const runRegex = /<run_command>([\s\S]*?)<\/run_command>/gi;
  while ((match = runRegex.exec(text)) !== null) {
    const cmd = (match[1] || '').trim();
    if (cmd) {
      actions.push({
        type: 'run_command',
        command: cmd,
      });
    }
  }
  displayText = displayText.replace(runRegex, '');

  // 4. <list_dir path="..." /> or <list_dir>path</list_dir>
  const listRegex = /<list_dir(?:\s+path=(?:"([^"]+)"|'([^']+)'|([^\s\/>]+)))?\s*(?:\/>|>([\s\S]*?)<\/list_dir>)/gi;
  while ((match = listRegex.exec(text)) !== null) {
    const dirPath = (match[1] || match[2] || match[3] || match[4] || '.').trim();
    actions.push({
      type: 'list_dir',
      path: dirPath || '.',
    });
  }
  displayText = displayText.replace(listRegex, '');

  // Clean up any residual empty code blocks from tag removal
  displayText = displayText.replace(/```(?:xml|bash|sh)?\s*```/gi, '').trim();

  return { actions, displayText };
}

/**
 * Resolves a path securely relative to root.
 */
function resolveSafePath(root, relPath) {
  const rootAbs = path.resolve(root);
  const resolved = path.resolve(rootAbs, relPath);
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    throw new Error(`Refusing path access outside project root: ${relPath}`);
  }
  return resolved;
}

/**
 * Executes an individual action (write_file, read_file, run_command, list_dir)
 * with diff previews, safety checks, and user confirmations.
 */
async function executeAction(action, ctx, root) {
  const maxBytes = ctx.config.maxFileBytes || 200000;

  if (action.type === 'write_file') {
    try {
      const absPath = resolveSafePath(root, action.path);
      const relPath = path.relative(root, absPath) || path.basename(absPath);
      let oldContent = '';
      if (fileExists(absPath)) {
        try {
          oldContent = readFileSafe(absPath, maxBytes).content;
        } catch (_) {}
      }

      const diffResult = diffLines(oldContent, action.content);
      console.log('');
      ui.info(oldContent ? `Proposed changes to ${relPath}:` : `Proposed new file ${relPath}:`);
      printDiff(diffResult);

      const ok = await confirm(`Apply changes to ${relPath}? (y/n)`, ctx && ctx.rl);
      if (!ok) {
        ui.warn(`Discarded changes to ${relPath}.`);
        return `User declined to apply changes to ${relPath}.`;
      }

      writeFileSafe(absPath, action.content);
      ui.success(`Saved ${relPath}`);
      return `File ${relPath} written successfully.`;
    } catch (err) {
      ui.error(`Failed to write file ${action.path}: ${err.message}`);
      return `Error writing file ${action.path}: ${err.message}`;
    }
  }

  if (action.type === 'read_file') {
    try {
      const absPath = resolveSafePath(root, action.path);
      const relPath = path.relative(root, absPath) || path.basename(absPath);
      if (!fileExists(absPath)) {
        return `File not found: ${relPath}`;
      }
      const { content } = readFileSafe(absPath, maxBytes);
      ui.info(`Read file: ${relPath} (${content.split('\n').length} lines)`);
      return `Content of ${relPath}:\n${content}`;
    } catch (err) {
      return `Error reading file ${action.path}: ${err.message}`;
    }
  }

  if (action.type === 'run_command') {
    const cmd = action.command.trim();
    const dangerous = findDangerousPattern(cmd);
    if (dangerous) {
      ui.error(`Blocked command matching dangerous pattern: ${dangerous}`);
      return `Refusing to execute: command matches dangerous pattern (${dangerous}).`;
    }

    console.log('');
    const ok = await confirm(`Execute: ${ui.color.cyan(cmd)}? (y/n)`, ctx && ctx.rl);
    if (!ok) {
      ui.warn(`Command execution declined by user.`);
      return `User declined to execute command: "${cmd}".`;
    }

    const spinner = new ui.Spinner(`Running: ${cmd}...`).start();
    const res = await execShell(cmd, { cwd: root });
    spinner.stop();

    if (res.stdout) {
      console.log(ui.color.bold('stdout:'));
      console.log(res.stdout);
    }
    if (res.stderr) {
      console.log(ui.color.bold('stderr:'));
      console.log(ui.color.yellow(res.stderr));
    }

    if (res.code === 0) {
      ui.success(`Command completed with exit code 0`);
    } else {
      ui.warn(`Command failed with exit code ${res.code}`);
    }

    return `Command: ${cmd}\nExit Code: ${res.code}\nStdout:\n${res.stdout}\nStderr:\n${res.stderr}`;
  }

  if (action.type === 'list_dir') {
    try {
      const absPath = resolveSafePath(root, action.path);
      const relPath = path.relative(root, absPath) || '.';
      const { files, tree } = scanProject(absPath, { maxDepth: 2, maxEntries: 50 });
      ui.info(`Scanned directory: ${relPath || '.'}`);
      return `Directory tree for ${relPath || '.'}:\n${tree}\nFiles found: ${files.join(', ')}`;
    } catch (err) {
      return `Error listing directory ${action.path}: ${err.message}`;
    }
  }

  return `Unknown action type: ${action.type}`;
}

/**
 * Runs a multi-turn ReAct agent loop.
 * Executes actions until the model finishes or reaches maxTurns.
 */
async function runAgentLoop(messages, ctx, options = {}) {
  const root = options.root || ctx.projectRoot || process.cwd();
  const maxTurns = options.maxTurns || 5;
  const askAIFn = options.askAI || askAI;
  const executedActions = new Set();
  let turn = 0;

  while (turn < maxTurns) {
    turn++;
    const spinner = new ui.Spinner(turn === 1 ? 'Thinking...' : 'Continuing agent steps...').start();
    let reply;
    try {
      reply = await askAIFn(messages, ctx.config);
    } catch (err) {
      spinner.stop();
      throw err;
    }
    spinner.stop();

    const { actions, displayText } = parseActions(reply);

    if (displayText) {
      console.log(`${ui.color.green('ai>')} ${displayText}`);
      console.log('');
    }

    messages.push({ role: 'assistant', content: reply });

    if (actions.length === 0) {
      break;
    }

    const actionResults = [];
    for (const action of actions) {
      const actionKey = `${action.type}:${action.path || action.command || ''}:${action.content || ''}`;
      if (executedActions.has(actionKey)) {
        actionResults.push(`[Action: ${action.type}${action.path ? ' ' + action.path : ''}]\nResult:\nAction already performed previously in this conversation.`);
        continue;
      }
      executedActions.add(actionKey);

      const res = await executeAction(action, ctx, root);
      actionResults.push(`[Action: ${action.type}${action.path ? ' ' + action.path : ''}]\nResult:\n${res}`);
    }

    const feedback = `[System: Action Results]\n${actionResults.join('\n\n')}`;
    messages.push({ role: 'user', content: feedback });
  }
}

module.exports = {
  getAgentSystemPrompt,
  parseActions,
  executeAction,
  runAgentLoop,
};
