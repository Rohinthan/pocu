#!/usr/bin/env node
'use strict';

/**
 * pocu.js
 * -------
 * Entry point for "pocu" - Pocket Unix CLI.
 * An AI-powered, agent-style CLI assistant for Termux: open a project
 * directory (like OpenCode/aider), reference any file with @path inside
 * chat, or use single-file slash commands for quick fixes.
 *
 * Usage:
 *   pocu                          Open the current directory (agent mode)
 *   pocu /open [dir]              Open a specific directory (agent mode)
 *   pocu "prompt"                 Ask a general question
 *   pocu "prompt" file.js         Ask a question with a file as context
 *   pocu /fix file.c              Fix bugs/errors in a file
 *   pocu /explain file.py         Explain what a file does
 *   pocu /run file.c              Execute a file
 *   pocu /chat                    Interactive chat (no directory scan)
 *   pocu /connect                 Save an API key for a provider
 *   pocu --help                   Show full command list
 *
 * Argument parsing is manual (no yargs/commander) to keep this dependency-free
 * and light enough for a low-RAM Termux/mobile environment.
 */

const fs = require('fs');
const path = require('path');

const { getConfig, HOME_DIR } = require('./config');
const { getCommand, listCommands, registerCommand } = require('./commands/index');
const { addHistory } = require('./lib/store');
const { fileExists } = require('./lib/fs');
const ui = require('./lib/ui');

const HELP_TEXT = `
${ui.color.bold('pocu')} - Pocket Unix CLI (AI-powered assistant for Termux)

${ui.color.bold('Agent mode:')}
  pocu                            Open the current directory and chat across it
  pocu /open [dir]                Open a specific directory (default: cwd)
                                   Inside: reference any file with @relative/path

${ui.color.bold('Single-file commands:')}
  pocu "<prompt>"                 Ask a general question
  pocu "<prompt>" <file>          Ask a question with a file as context
  pocu /fix <file>                Fix bugs/errors in a file
  pocu /explain <file>            Explain what a file does
  pocu /refactor <file>           Improve a file's structure
  pocu /test <file>                Generate tests for a file
  pocu /run <file>                 Execute a file (.c/.py/.js)
  pocu /diff <file>                Preview AI-proposed changes (no write)
  pocu /apply <file>               Apply a previously staged /diff
  pocu /create <file> "<desc>"     Generate a new file from a description
  pocu /ask "<question>" [file]    General query (same as bare prompt)
  pocu /chat                       Interactive chat, no directory scan

${ui.color.bold('Setup:')}
  pocu /model [provider:model]     Show or switch active model
  pocu /connect                    Save an API key for a provider
  pocu /history [n]                Show past prompts/commands

${ui.color.bold('Config:')}
  Copy .env.example to .env and set your API key, or run "pocu /connect".
  Settings are stored at ${HOME_DIR}
`;

/**
 * Loads optional user plugins from ~/.ai-cli/plugins/*.js.
 * Each plugin file should export { name, handler(args, ctx) }.
 * This is the "plugin system for future commands" bonus feature.
 */
function loadPlugins() {
  const pluginDir = path.join(HOME_DIR, 'plugins');
  if (!fs.existsSync(pluginDir)) return;

  for (const file of fs.readdirSync(pluginDir)) {
    if (!file.endsWith('.js')) continue;
    try {
      const plugin = require(path.join(pluginDir, file));
      if (plugin && plugin.name && typeof plugin.handler === 'function') {
        registerCommand(plugin.name, plugin.handler);
      }
    } catch (e) {
      ui.warn(`Failed to load plugin ${file}: ${e.message}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(HELP_TEXT);
    return;
  }

  loadPlugins();

  const config = getConfig();
  const ctx = { config };

  // --- Bare invocation: open the current directory in agent mode ---
  // This mirrors the OpenCode/aider-style workflow: `pocu` with no args
  // scans the project you're standing in and drops you into chat with
  // @file mention support, instead of just printing a help screen.
  if (argv.length === 0) {
    const openHandler = getCommand('open');
    try {
      await openHandler([], ctx);
    } catch (e) {
      ui.error(`Failed to open project: ${e.message}`);
      if (process.env.AI_DEBUG) console.error(e.stack);
    }
    return;
  }

  const first = argv[0];

  // --- Slash command dispatch ---
  if (first.startsWith('/')) {
    const name = first.slice(1);
    const handler = getCommand(name);
    const rest = argv.slice(1);

    if (!handler) {
      ui.error(`Unknown command "/${name}". Available: ${listCommands().map((c) => '/' + c).join(', ')}`);
      return;
    }

    try {
      await handler(rest, ctx);
      addHistory({ command: `/${name}`, detail: rest.join(' ') });
    } catch (e) {
      ui.error(`Command failed: ${e.message}`);
      if (process.env.AI_DEBUG) console.error(e.stack);
    }
    return;
  }

  // --- Default: free-text prompt, optionally with a trailing file argument ---
  // e.g. ai "explain this" file.js
  let maybeFile = null;
  const lastArg = argv[argv.length - 1];
  if (argv.length > 1 && fileExists(lastArg)) {
    maybeFile = lastArg;
  }

  const askHandler = getCommand('ask');
  ctx.maybeFile = maybeFile;
  try {
    await askHandler(argv, ctx);
    addHistory({ command: '/ask', detail: argv.join(' ') });
  } catch (e) {
    ui.error(`Request failed: ${e.message}`);
    if (process.env.AI_DEBUG) console.error(e.stack);
  }
}

main().catch((e) => {
  ui.error(`Fatal error: ${e.message}`);
  if (process.env.AI_DEBUG) console.error(e.stack);
  process.exit(1);
});
