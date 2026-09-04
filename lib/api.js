'use strict';

const { spawn } = require('child_process');
const path = require('path');

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
      'No OpenAI API key configured. Run `pocu /connect` or set OPENAI_API_KEY in .env'
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
      'No Gemini API key configured. Run `pocu /connect` or set GEMINI_API_KEY in .env'
    );
  }

  let modelName = model || 'gemini-3.8-flash';
  if (modelName.startsWith('models/')) {
    modelName = modelName.slice(7);
  }
  if (modelName === 'gemini-1.5-flash' || modelName === 'gemini-2.5-flash' || modelName === 'test') {
    modelName = 'gemini-3.8-flash';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`;

  // Extract system messages to map to Gemini's systemInstruction
  const systemMessages = messages.filter((m) => m.role === 'system');
  const systemPrompt = systemMessages.map((m) => m.content).join('\n\n').trim();

  // Extract non-system conversation messages
  const conversation = messages.filter((m) => m.role !== 'system');

  // Map roles: 'assistant' -> 'model', everything else -> 'user'
  const rawContents = conversation.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));

  // Gemini requires turns to alternate roles (user -> model -> user -> model).
  // Merge consecutive turns with the same role to avoid 400 validation errors.
  const contents = [];
  for (const item of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      contents[contents.length - 1].parts.push(...item.parts);
    } else {
      contents.push(item);
    }
  }

  // Ensure there is at least one contents turn for Gemini
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt ? 'Hello' : '' }],
    });
  }

  const body = { contents };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const req = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let errMsg = rawText.slice(0, 500);
    try {
      const errJson = JSON.parse(rawText);
      if (errJson.error && errJson.error.message) {
        errMsg = errJson.error.message;
      }
    } catch (_) {}
    throw new Error(`Gemini API error ${res.status}: ${errMsg}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];

  if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
    throw new Error(`Gemini request finished with reason: ${candidate.finishReason}`);
  }

  const parts = candidate?.content?.parts || [];
  const content = parts.map((p) => p.text || '').join('');

  if (!content) {
    throw new Error('Gemini API returned an empty response.');
  }

  return content;
}

async function callAnthropic(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key configured. Run `pocu /connect` or set ANTHROPIC_API_KEY in .env'
    );
  }

  const systemMessages = messages.filter((m) => m.role === 'system');
  const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');
  const conversation = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const body = {
    model: model || 'claude-3-5-sonnet-20241022',
    messages: conversation,
    max_tokens: 4096,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const req = fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error('Anthropic API returned an empty response.');
  return content;
}

async function callDeepSeek(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No DeepSeek API key configured. Run `pocu /connect` or set DEEPSEEK_API_KEY in .env'
    );
  }

  const req = fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages,
      temperature: 0.3,
    }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek API returned an empty response.');
  return content;
}

async function callGroq(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No Groq API key configured. Run `pocu /connect` or set GROQ_API_KEY in .env'
    );
  }

  const req = fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
    }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq API returned an empty response.');
  return content;
}

async function callOpenRouter(messages, { model, apiKey, timeoutMs }) {
  if (!apiKey) {
    throw new Error(
      'No OpenRouter API key configured. Run `pocu /connect` or set OPENROUTER_API_KEY in .env'
    );
  }

  const req = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/pocu-cli',
      'X-Title': 'pocu CLI',
    },
    body: JSON.stringify({
      model: model || 'google/gemini-2.0-flash-lite-001',
      messages,
      temperature: 0.3,
    }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter API returned an empty response.');
  return content;
}

async function callOllama(messages, { model, apiKey, timeoutMs }) {
  const baseUrl = (apiKey || 'http://localhost:11434').replace(/\/$/, '');
  const url = `${baseUrl}/v1/chat/completions`;

  const req = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3',
      messages,
      temperature: 0.3,
    }),
  });

  const res = await withTimeout(req, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama/Local API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Ollama/Local API returned an empty response.');
  return content;
}

const PROVIDERS = {
  openai: callOpenAI,
  gemini: callGemini,
  google: callGemini,
  anthropic: callAnthropic,
  claude: callAnthropic,
  deepseek: callDeepSeek,
  groq: callGroq,
  openrouter: callOpenRouter,
  ollama: callOllama,
  local: callOllama,
};

/**
 * Calls provider API via the Python communication link (lib/bridge.py).
 * Provides reliable networking in Termux mobile environments.
 */
function callViaPythonBridge(messages, config) {
  return new Promise((resolve, reject) => {
    const bridgePath = path.join(__dirname, 'bridge.py');
    const providerName = (config.provider || 'openai').toLowerCase();
    const apiKey = config.keys ? config.keys[providerName] : undefined;

    const payload = JSON.stringify({
      provider: providerName,
      model: config.model,
      apiKey,
      messages,
      timeoutMs: config.timeoutMs || 60000,
    });

    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    let child;
    try {
      child = spawn(pythonBin, [bridgePath]);
    } catch (err) {
      return reject(err);
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      const trimmed = stdout.trim();
      if (!trimmed) {
        return reject(new Error(stderr.trim() || `Python communication link failed with code ${code}`));
      }
      try {
        const result = JSON.parse(trimmed);
        if (result.ok) {
          resolve(result.content);
        } else {
          reject(new Error(result.error || 'Unknown error in Python communication link'));
        }
      } catch (parseErr) {
        reject(new Error(`Failed to parse bridge output: ${trimmed}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

/**
 * Sends a chat-style request to the configured provider.
 * Uses Python communication link for mobile/Termux networking,
 * falling back to Node fetch if Python is unavailable.
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {{provider: string, model: string, keys: object, timeoutMs: number}} config
 * @returns {Promise<string>} assistant reply text
 */
async function askAI(messages, config) {
  let bridgeError = null;

  // Primary: call via Python communication link
  try {
    return await callViaPythonBridge(messages, config);
  } catch (err) {
    bridgeError = err;
    if (process.env.AI_DEBUG) {
      console.error('[debug] Python communication link failed, attempting Node fallback:', err.message);
    }
  }

  // Fallback: Node built-in fetch
  const providerName = (config.provider || 'openai').toLowerCase();
  const fn = PROVIDERS[providerName];
  if (!fn) {
    throw bridgeError || new Error(
      `Unknown provider "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  const apiKey = config.keys ? config.keys[providerName] : undefined;

  try {
    return await fn(messages, {
      model: config.model,
      apiKey,
      timeoutMs: config.timeoutMs || 60000,
    });
  } catch (nodeErr) {
    // If both failed, prefer the bridge error if it was an API error, otherwise nodeErr
    throw bridgeError || nodeErr;
  }
}

module.exports = { askAI, PROVIDERS, callViaPythonBridge };
