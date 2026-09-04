'use strict';

/**
 * commands/index.js
 * ------------------
 * Central registry mapping slash-command names to handler modules.
 * Adding a new command = write commands/foo.js exporting an async
 * function(args, ctx), then register it here. This is the tool's
 * lightweight "plugin system."
 */

const registry = {
  fix: require('./fix'),
  explain: require('./explain'),
  refactor: require('./refactor'),
  test: require('./test'),
  run: require('./run'),
  chat: require('./chat'),
  open: require('./open'),
  diff: require('./diff'),
  apply: require('./apply'),
  create: require('./create'),
  ask: require('./ask'),
  model: require('./model'),
  history: require('./history'),
  connect: require('./connect'),
  api: require('./connect'),
};

/**
 * Allows third-party/plugin commands to register themselves at runtime,
 * e.g. from a local ~/.ai-cli/plugins/*.js file (see ai.js loadPlugins()).
 */
function registerCommand(name, handler) {
  registry[name] = handler;
}

function getCommand(name) {
  return registry[name];
}

function listCommands() {
  return Object.keys(registry);
}

module.exports = { registerCommand, getCommand, listCommands };
