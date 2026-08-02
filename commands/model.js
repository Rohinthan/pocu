'use strict';

const { saveStoredConfig } = require('../config');
const { PROVIDERS } = require('../lib/api');
const ui = require('../lib/ui');

/**
 * /model <name>              -> switch model, keep current provider
 * /model <provider>:<name>   -> switch provider AND model, e.g. gemini:gemini-1.5-pro
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
  }

  if (!PROVIDERS[provider]) {
    ui.error(`Unknown provider "${provider}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
    return;
  }

  saveStoredConfig({ provider, model });
  ui.success(`Switched to provider "${provider}", model "${model}"`);
}

module.exports = modelCommand;
