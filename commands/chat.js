'use strict';

const readline = require('readline');
const path = require('path');
const { askAI } = require('../lib/api');
const { addHistory } = require('../lib/store');
const { readFileSafe } = require('../lib/fs');
const { scanProject, resolveMention, extractMentions } = require('../lib/project');
const { languageFromExt } = require('../lib/util');
const ui = require('../lib/ui');

/**
 * Expands any "@relative/path" mentions in a chat message into inline
 * file context, agent-style (like OpenCode/aider). Unreadable mentions
 * are reported but don't block the rest of the message from going out.
 */
function expandMentions(message, root, maxFileBytes) {
  const mentions = extractMentions(message);
  if (mentions.length === 0) return { text: message, notes: [] };

  const notes = [];
  let context = '';
  for (const mention of mentions) {
    try {
      const abs = resolveMention(root, mention);
      const { content } = readFileSafe(abs, maxFileBytes);
      const lang = languageFromExt(abs);
      context += `\n\n--- ${mention} (${lang}) ---\n${content}`;
      notes.push(`loaded ${mention}`);
    } catch (e) {
      notes.push(`could not load ${mention}: ${e.message}`);
    }
  }
  return { text: `${message}${context}`, notes };
}

/**
 * /chat
 * Enters an interactive REPL loop, maintaining conversation memory
 * (all turns are sent back to the API each request, standard for
 * stateless chat APIs). Type "exit" or "/exit" or Ctrl+C to leave.
 *
 * Supports "@relative/path" mentions to pull a file's content into the
 * conversation on demand, so you can work across a whole project
 * directory instead of one file at a time.
 */
async function chatCommand(args, ctx) {
  const root = ctx.projectRoot || process.cwd();
  ui.info(`Chat mode. Provider: ${ctx.config.provider}, model: ${ctx.config.model}`);
  ui.info(`Project root: ${root}`);
  ui.info('Type your message and press Enter. Mention files with @path/to/file. Type "exit" to leave.');

  const messages = [
    {
      role: 'system',
      content:
        'You are a helpful coding and systems assistant running inside a Termux CLI chat session, ' +
        `operating on the project at ${root}. Keep replies concise and practical, formatted as ` +
        'plain text (no markdown fences unless the user asks for a code block). When the user ' +
        'mentions a file with @path, its content is appended to their message for you to use.',
    },
  ];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  while (true) {
    const userInput = (await ask(ui.color.cyan('you> '))).trim();

    if (!userInput) continue;
    if (userInput === 'exit' || userInput === '/exit' || userInput === 'quit') {
      break;
    }

    const { text, notes } = expandMentions(userInput, root, ctx.config.maxFileBytes);
    for (const note of notes) ui.info(note);

    messages.push({ role: 'user', content: text });
    addHistory({ command: '/chat', detail: userInput });

    const spinner = new ui.Spinner('Thinking...').start();
    let reply;
    try {
      reply = await askAI(messages, ctx.config);
    } catch (e) {
      spinner.stop();
      ui.error(`AI request failed: ${e.message}`);
      messages.pop();
      continue;
    }
    spinner.stop();

    messages.push({ role: 'assistant', content: reply });
    console.log(`${ui.color.green('ai>')} ${reply.trim()}`);
    console.log('');
  }

  rl.close();
  ui.info('Left chat mode.');
}

module.exports = chatCommand;
