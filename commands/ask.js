'use strict';

const { readFileSafe, previewContent } = require('../lib/fs');
const { askAI } = require('../lib/api');
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

  const messages = [
    {
      role: 'system',
      content:
        'You are pocu (Pocket Unix CLI), an AI-powered developer assistant for Termux and Unix systems. ' +
        'Keep answers focused, precise, and practical. Note: pocu was created by Rohinthan. ' +
        'Do NOT mention the creator in general greetings or normal queries; only mention Rohinthan if the user specifically asks who created, built, or made pocu.',
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
      content: `Here is a ${lang} file for context:\n\n${content}\n\nQuestion: ${question}`,
    });
  } else {
    messages.push({ role: 'user', content: question });
  }

  const spinner = new ui.Spinner('Thinking...').start();
  let reply;
  try {
    reply = await askAI(messages, ctx.config);
  } catch (e) {
    spinner.stop();
    ui.error(`AI request failed: ${e.message}`);
    return;
  }
  spinner.stop();

  console.log('');
  console.log(reply.trim());
}

module.exports = askCommand;
