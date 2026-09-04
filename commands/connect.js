'use strict';

const readline = require('readline');
const { saveStoredConfig, HOME_DIR, PROVIDER_ENV_MAP, DEFAULT_MODELS } = require('../config');
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

function maskKey(key) {
  if (!key) return '(none)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * /api or /connect
 * View current API provider configuration or set a new API key.
 * Usage:
 *   /api                     Show active provider/key, and prompt to change
 *   /api <provider>          Prompt to set key for provider
 *   /api <provider> <key>    Set key for provider immediately
 */
async function connectCommand(args, ctx) {
  const providers = Object.keys(PROVIDERS).filter((p) => p !== 'local');

  // Direct CLI setting: /api <provider> <key>
  if (args.length >= 2) {
    const p = args[0].toLowerCase();
    const k = args.slice(1).join(' ').trim();
    if (!PROVIDERS[p]) {
      ui.error(`Unknown provider "${p}". Available: ${providers.join(', ')}`);
      return;
    }
    const envVar = PROVIDER_ENV_MAP[p] || `${p.toUpperCase()}_API_KEY`;
    const model = DEFAULT_MODELS[p] || ctx.config.model;
    saveStoredConfig({ provider: p, model, [envVar]: k });
    ctx.config.provider = p;
    ctx.config.model = model;
    ctx.config.keys[p] = k;
    ui.success(`Configured ${p} API key and active model "${model}".`);
    return;
  }

  // Display current status
  const currentProvider = ctx.config.provider || 'gemini';
  const currentKey = ctx.config.keys ? ctx.config.keys[currentProvider] : '';
  ui.info(`Active Provider: ${currentProvider}`);
  ui.info(`Active Model:    ${ctx.config.model}`);
  ui.info(`Active Key:      ${maskKey(currentKey)}`);

  let provider = null;
  if (args[0] && PROVIDERS[args[0].toLowerCase()]) {
    provider = args[0].toLowerCase();
  }

  if (!provider) {
    ui.info(`Select provider to configure (${providers.join(' / ')}):`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question(`[default: ${currentProvider}] > `, (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });
    provider = answer || currentProvider;
  }

  if (!PROVIDERS[provider]) {
    ui.error(`Unknown provider "${provider}". Available: ${providers.join(', ')}`);
    return;
  }

  const envVarName = PROVIDER_ENV_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;
  const key = await promptMasked(`Enter your ${provider} API key: `);

  if (!key) {
    ui.warn('No key entered. Configuration kept unchanged.');
    return;
  }

  const model = DEFAULT_MODELS[provider] || ctx.config.model;
  saveStoredConfig({ provider, model, [envVarName]: key });
  ctx.config.provider = provider;
  ctx.config.model = model;
  ctx.config.keys[provider] = key;
  ui.success(`Saved ${provider} API key to ${HOME_DIR}/config.json`);
  ui.info(`Active provider is now "${provider}", model "${model}". Switch anytime with "/model <provider>:<model>".`);
}

module.exports = connectCommand;
