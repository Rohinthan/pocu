'use strict';

const { saveStoredConfig, DEFAULT_MODELS } = require('../config');
const { PROVIDERS } = require('../lib/api');
const ui = require('../lib/ui');

/**
 * /model <name>              -> switch model, or switch provider if provider name
 * /model <provider>:<name>   -> switch provider AND model, e.g. gemini:gemini-flash-latest
 * /model                     -> show current model/provider
 */
async function modelCommand(args, ctx) {
  if (args.length === 0) {
    ui.info(`Current provider: ${ctx.config.provider}`);
    ui.info(`Current model:    ${ctx.config.model}`);
    ui.info(`Available providers: ${Object.keys(PROVIDERS).join(', ')}`);
    return;
  }

  const raw = args[0];
  let provider = ctx.config.provider;
  let model = raw;

  if (raw.includes(':')) {
    const [p, m] = raw.split(':');
    provider = p.trim().toLowerCase();
    model = m.trim();
  } else if (PROVIDERS[raw.toLowerCase()]) {
    provider = raw.toLowerCase();
    model = DEFAULT_MODELS[provider] || raw;
  }

  if (!PROVIDERS[provider]) {
    ui.error(`Unknown provider "${provider}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
    return;
  }

  saveStoredConfig({ provider, model });
  ctx.config.provider = provider;
  ctx.config.model = model;
  ui.success(`Switched to provider "${provider}", model "${model}"`);
}

module.exports = modelCommand;
