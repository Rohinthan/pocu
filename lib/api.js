'use strict';

/**
 * lib/api.js
 * ----------
 * Thin abstraction over multiple AI providers so commands never talk to
 * a specific vendor API directly. Uses the global `fetch` built into
 * Node 18+, so no HTTP client dependency is needed.
 *
 * To add a new provider (e.g. a local model server):
 *   1. Write an async function `callX(messages, { model, apiKey, timeoutMs })`
 *      that returns a plain string (the assistant's reply).
 *   2. Register it in the PROVIDERS map at the bottom of this file.
 */

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callOpenAI(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No OpenAI API key configured. Run `ai /connect` or set OPENAI_API_KEY in .env'
    );
  }

  const req = fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: 0.3,
    }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI API returned an empty response.');
  return content;
}

async function callGemini(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No Gemini API key configured. Run `ai /connect` or set GEMINI_API_KEY in .env'
    );
  }

  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Gemini uses a different message shape: { role, parts: [{ text }] }.
  // We map our OpenAI-style {role, content} messages into that shape.
  // The Gemini API also does not support a "system" role directly in
  // `contents`, so we fold any system messages into the first user turn.
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const conversation = messages.filter((m) => m.role !== 'system');

  const contents = conversation.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  if (systemParts.length && contents.length) {
    contents[0].parts.unshift({ text: systemParts.join('\n') + '\n\n' });
  }

  const req = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
  if (!content) throw new Error('Gemini API returned an empty response.');
  return content;
}

/**
 * Placeholder for a future local-model backend (e.g. llama.cpp server,
 * ollama, etc.) so the provider list is future-ready without adding
 * a hard dependency today.
 */
async function callLocal(messages, { model }) {
  throw new Error(
    `Local model provider is not yet configured. ` +
      `Point PROVIDERS.local at your local inference server's HTTP endpoint in lib/api.js.`
  );
}

const PROVIDERS = {
  openai: callOpenAI,
  gemini: callGemini,
  local: callLocal,
};

/**
 * Sends a chat-style request to the configured provider.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {{provider: string, model: string, keys: object, timeoutMs: number}} config
 * @returns {Promise<string>} assistant reply text
 */
async function askAI(messages, config) {
  const providerName = (config.provider || 'openai').toLowerCase();
  const fn = PROVIDERS[providerName];
  if (!fn) {
    throw new Error(
      `Unknown provider "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  const apiKey = config.keys ? config.keys[providerName] : undefined;
  return fn(messages, {
    model: config.model,
    apiKey,
    timeoutMs: config.timeoutMs || 60000,
  });
}

module.exports = { askAI, PROVIDERS };
