'use strict';

const readline = require('readline');
const { saveStoredConfig, HOME_DIR } = require('../config');
const { PROVIDERS } = require('../lib/api');
const ui = require('../lib/ui');

/**
 * Prompts for a value while masking typed characters with '*'.
 * Falls back to plain readline if raw mode isn't available (e.g. piped input).
 */
function promptMasked(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(question);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value.trim());
        return;
      }
      if (char === '\u0003') {
        // Ctrl+C
        process.stdout.write('\n');
        process.exit(1);
      }
      if (char === '\u007f' || char === '\b') {
        // backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      value += char;
      process.stdout.write('*');
    };

    process.stdin.on('data', onData);
  });
}

/**
 * /connect
 * Interactively asks which provider and stores the API key locally at
 * ~/.ai-cli/config.json. This file is plaintext on disk (like most CLI
 * tool credential files, e.g. ~/.npmrc) -- keep your device secured.
 */
async function connectCommand(args, ctx) {
  const providerArg = args[0];
  const providers = Object.keys(PROVIDERS).filter((p) => p !== 'local');
  let provider = providerArg && providers.includes(providerArg.toLowerCase())
    ? providerArg.toLowerCase()
    : null;

  if (!provider) {
    ui.info(`Which provider? (${providers.join(' / ')})`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    provider = await new Promise((resolve) => {
      rl.question('> ', (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  if (!providers.includes(provider)) {
    ui.error(`Unknown provider "${provider}". Available: ${providers.join(', ')}`);
    return;
  }

  const envVarName = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  const key = await promptMasked(`Enter your ${provider} API key: `);

  if (!key) {
    ui.warn('No key entered. Cancelled.');
    return;
  }

  saveStoredConfig({ provider, [envVarName]: key });
  ui.success(`Saved ${provider} API key to ${HOME_DIR}/config.json`);
  ui.info(`Active provider is now "${provider}". Switch anytime with "ai /model <provider>:<model>".`);
}

module.exports = connectCommand;
