'use strict';

const readline = require('readline');
const { readFileSafe, previewContent } = require('../lib/fs');
const { getAgentSystemPrompt, runAgentLoop } = require('../lib/agent');
const { languageFromExt } = require('../lib/util');
const ui = require('../lib/ui');

/**
 * /ask "<question>" [file]
 * Also used as the fallback handler for `ai "some prompt" [file]`
 * (i.e. when the user doesn't type a leading slash command).
 */
async function askCommand(args, ctx) {
  // Last arg may be an existing file path; everything before it is the question.
  let question = args.join(' ').trim();
  let filePath = null;

  if (ctx.maybeFile) {
    filePath = ctx.maybeFile;
    question = args.filter((a) => a !== ctx.maybeFile).join(' ').trim();
  }

  if (!question) {
    ui.error('Usage: ai /ask "<question>" [file]');
    return;
  }

  const root = ctx.projectRoot || process.cwd();

  const messages = [
    {
      role: 'system',
      content: getAgentSystemPrompt(root),
    },
  ];

  if (filePath) {
    const { content } = readFileSafe(filePath, ctx.config.maxFileBytes);
    const { preview, truncated } = previewContent(content);
    ui.info(`Previewing ${filePath}${truncated ? ' (truncated)' : ''}:`);
    console.log(ui.color.gray(preview));

    const lang = languageFromExt(filePath);
    messages.push({
      role: 'user',
      content: `Here is a ${lang} file for context:\n\n${content}\n\nTask/Question: ${question}`,
    });
  } else {
    messages.push({ role: 'user', content: question });
  }

  let localRl = null;
  if (!ctx.rl) {
    localRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    ctx.rl = localRl;
  }

  try {
    await runAgentLoop(messages, ctx, { root, rl: ctx.rl });
  } catch (e) {
    ui.error(`AI request failed: ${e.message}`);
  } finally {
    if (localRl) {
      localRl.close();
      ctx.rl = null;
    }
  }
}

module.exports = askCommand;
