'use strict';

const { loadHistory } = require('../lib/store');
const ui = require('../lib/ui');

/**
 * /history [n]
 * Shows the last n history entries (default 20).
 */
async function historyCommand(args, ctx) {
  const n = parseInt(args[0], 10) || 20;
  const history = loadHistory();

  if (history.length === 0) {
    ui.info('No history yet.');
    return;
  }

  const recent = history.slice(-n);
  for (const entry of recent) {
    const time = new Date(entry.ts).toLocaleString();
    const cmdLabel = entry.command ? ui.color.cyan(entry.command) : ui.color.gray('(prompt)');
    console.log(`${ui.color.dim(time)}  ${cmdLabel}  ${entry.detail || ''}`);
  }
}

module.exports = historyCommand;
