'use strict';

/**
 * lib/ui.js
 * ---------
 * Minimal terminal UI helpers: ANSI colors + a spinner.
 * No dependencies (no chalk/ora) to keep the tool light for Termux.
 */

const isTTY = process.stdout.isTTY || Boolean(process.env.FORCE_COLOR) || (Boolean(process.env.TERM) && process.env.TERM !== 'dumb');

const codes = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
};

function paint(code, text) {
  if (!isTTY) return text; // no color codes when piped/redirected without force
  return `${code}${text}${codes.reset}`;
}

const color = {
  red: (t) => paint(codes.red, t),
  green: (t) => paint(codes.green, t),
  yellow: (t) => paint(codes.yellow, t),
  blue: (t) => paint(codes.blue, t),
  magenta: (t) => paint(codes.magenta, t),
  cyan: (t) => paint(codes.cyan, t),
  gray: (t) => paint(codes.gray, t),
  bold: (t) => paint(codes.bold, t),
  dim: (t) => paint(codes.dim, t),
};

function log(msg = '') {
  console.log(msg);
}

function info(msg) {
  console.log(`${color.cyan('[info]')} ${msg}`);
}

function success(msg) {
  console.log(`${color.green('[ok]')} ${msg}`);
}

function warn(msg) {
  console.log(`${color.yellow('[warn]')} ${msg}`);
}

function error(msg) {
  console.error(`${color.red('[error]')} ${msg}`);
}

/**
 * Simple spinner using process.stdout writes. Works over plain ASCII so it
 * behaves fine inside Termux terminals.
 */
class Spinner {
  constructor(text = 'Working...') {
    this.text = text;
    this.frames = ['|', '/', '-', '\\'];
    this.frameIdx = 0;
    this.timer = null;
  }

  start() {
    if (!isTTY) {
      console.log(this.text);
      return this;
    }
    this.timer = setInterval(() => {
      const frame = this.frames[this.frameIdx = (this.frameIdx + 1) % this.frames.length];
      process.stdout.write(`\r${color.cyan(frame)} ${this.text}   `);
    }, 100);
    return this;
  }

  update(text) {
    this.text = text;
    return this;
  }

  stop(finalMsg) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (isTTY) {
      process.stdout.write('\r' + ' '.repeat(this.text.length + 10) + '\r');
    }
    if (finalMsg) console.log(finalMsg);
  }
}

module.exports = { color, log, info, success, warn, error, Spinner };
