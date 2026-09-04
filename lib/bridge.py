#!/usr/bin/env python3
"""
lib/bridge.py
-------------
Python communication link for AI API providers in pocu.
Provides robust HTTPS connectivity for Termux and mobile environments
where Node.js fetch can encounter TLS certificate or DNS issues.
Dependency-free: uses Python standard library (urllib.request, json, ssl).
"""

import sys
import json
import ssl
import urllib.request
import urllib.error
import urllib.parse

def get_ssl_context():
    """Create SSL context with system CA bundle, fallback if needed."""
    try:
        return ssl.create_default_context()
    except Exception:
        ctx = ssl._create_unverified_context()
        return ctx

def http_post_json(url, payload, headers=None, timeout=60):
    """Executes an HTTP POST with JSON body and returns parsed JSON or raises."""
    data = json.dumps(payload).encode('utf-8')
    req_headers = {'Content-Type': 'application/json'}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method='POST')
    ctx = get_ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        try:
            err_json = json.loads(err_body)
            if 'error' in err_json:
                err_msg = err_json['error'].get('message', err_body)
                raise RuntimeError(f"HTTP {e.code}: {err_msg}")
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"HTTP {e.code}: {err_body[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e.reason}")

def call_gemini(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No Gemini API key configured. Run `pocu /connect` or set GEMINI_API_KEY in .env")

    model_name = model or 'gemini-flash-latest'
    if model_name.startswith('models/'):
        model_name = model_name[7:]
    
    # Map deprecated models
    if model_name in ('gemini-1.5-flash', 'gemini-2.5-flash'):
        model_name = 'gemini-flash-latest'

    system_messages = [m.get('content', '') for m in messages if m.get('role') == 'system']
    system_prompt = "\n\n".join(system_messages).strip()

    conv = [m for m in messages if m.get('role') != 'system']
    raw_contents = []
    for m in conv:
        role = 'model' if m.get('role') == 'assistant' else 'user'
        raw_contents.append({
            'role': role,
            'parts': [{'text': m.get('content', '')}]
        })

    # Merge consecutive identical roles
    contents = []
    for item in raw_contents:
        if contents and contents[-1]['role'] == item['role']:
            contents[-1]['parts'].extend(item['parts'])
        else:
            contents.append(item)

    if not contents:
        contents.append({'role': 'user', 'parts': [{'text': 'Hello'}]})

    body = {'contents': contents}
    if system_prompt:
        body['systemInstruction'] = {'parts': [{'text': system_prompt}]}

    import time
    data = None
    last_err = None
    fallback_pool = [model_name, 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.8-flash']
    unique_models = []
    seen = set()
    for m in fallback_pool:
        if m and m not in seen:
            seen.add(m)
            unique_models.append(m)

    for candidate_model in unique_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(candidate_model)}:generateContent?key={api_key}"
        try:
            data = http_post_json(url, body, timeout=timeout_sec)
            break
        except RuntimeError as err:
            last_err = err
            if "503" in str(err):
                time.sleep(1)
                continue
            raise

    if not data:
        if last_err:
            raise last_err
        raise RuntimeError("Gemini API request failed.")

    candidates = data.get('candidates', [])
    if not candidates:
        raise RuntimeError("Gemini API returned no candidates.")

    parts = candidates[0].get('content', {}).get('parts', [])
    content = "".join([p.get('text', '') for p in parts])
    if not content:
        raise RuntimeError("Gemini API returned empty response text.")
    return content

def call_openai(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No OpenAI API key configured. Run `pocu /connect` or set OPENAI_API_KEY in .env")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {'Authorization': f"Bearer {api_key}"}
    body = {
        'model': model or 'gpt-4o-mini',
        'messages': messages,
        'temperature': 0.3,
    }
    data = http_post_json(url, body, headers=headers, timeout=timeout_sec)
    choices = data.get('choices', [])
    if not choices:
        raise RuntimeError("OpenAI API returned no choices.")
    content = choices[0].get('message', {}).get('content', '')
    if not content:
        raise RuntimeError("OpenAI API returned empty content.")
    return content

def call_anthropic(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No Anthropic API key configured. Run `pocu /connect` or set ANTHROPIC_API_KEY in .env")

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    }
    system_messages = [m.get('content', '') for m in messages if m.get('role') == 'system']
    system_prompt = "\n\n".join(system_messages).strip()

    conv = [
        {'role': 'assistant' if m.get('role') == 'assistant' else 'user', 'content': m.get('content', '')}
        for m in messages if m.get('role') != 'system'
    ]

    body = {
        'model': model or 'claude-3-5-sonnet-20241022',
        'messages': conv,
        'max_tokens': 4096,
    }
    if system_prompt:
        body['system'] = system_prompt

    data = http_post_json(url, body, headers=headers, timeout=timeout_sec)
    content_list = data.get('content', [])
    if not content_list:
        raise RuntimeError("Anthropic API returned no content.")
    return content_list[0].get('text', '')

def call_deepseek(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No DeepSeek API key configured. Run `pocu /connect` or set DEEPSEEK_API_KEY in .env")
    url = "https://api.deepseek.com/chat/completions"
    headers = {'Authorization': f"Bearer {api_key}"}
    body = {
        'model': model or 'deepseek-chat',
        'messages': messages,
        'temperature': 0.3,
    }
    data = http_post_json(url, body, headers=headers, timeout=timeout_sec)
    choices = data.get('choices', [])
    if not choices:
        raise RuntimeError("DeepSeek API returned no choices.")
    return choices[0].get('message', {}).get('content', '')

def call_groq(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No Groq API key configured. Run `pocu /connect` or set GROQ_API_KEY in .env")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {'Authorization': f"Bearer {api_key}"}
    body = {
        'model': model or 'llama-3.3-70b-versatile',
        'messages': messages,
        'temperature': 0.3,
    }
    data = http_post_json(url, body, headers=headers, timeout=timeout_sec)
    choices = data.get('choices', [])
    if not choices:
        raise RuntimeError("Groq API returned no choices.")
    return choices[0].get('message', {}).get('content', '')

def call_openrouter(messages, model, api_key, timeout_sec):
    if not api_key:
        raise ValueError("No OpenRouter API key configured. Run `pocu /connect` or set OPENROUTER_API_KEY in .env")
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        'Authorization': f"Bearer {api_key}",
        'HTTP-Referer': 'https://github.com/pocu-cli',
        'X-Title': 'pocu CLI',
    }
    body = {
        'model': model or 'google/gemini-2.0-flash-lite-001',
        'messages': messages,
        'temperature': 0.3,
    }
    data = http_post_json(url, body, headers=headers, timeout=timeout_sec)
    choices = data.get('choices', [])
    if not choices:
        raise RuntimeError("OpenRouter API returned no choices.")
    return choices[0].get('message', {}).get('content', '')

def call_ollama(messages, model, api_key, timeout_sec):
    base_url = (api_key or 'http://localhost:11434').rstrip('/')
    url = f"{base_url}/v1/chat/completions"
    body = {
        'model': model or 'llama3',
        'messages': messages,
        'temperature': 0.3,
    }
    data = http_post_json(url, body, timeout=timeout_sec)
    choices = data.get('choices', [])
    if not choices:
        raise RuntimeError("Ollama API returned no choices.")
    return choices[0].get('message', {}).get('content', '')

PROVIDERS = {
    'gemini': call_gemini,
    'google': call_gemini,
    'openai': call_openai,
    'anthropic': call_anthropic,
    'claude': call_anthropic,
    'deepseek': call_deepseek,
    'groq': call_groq,
    'openrouter': call_openrouter,
    'ollama': call_ollama,
    'local': call_ollama,
}

def main():
    raw_input = sys.stdin.read()
    if not raw_input.strip():
        print(json.dumps({'ok': False, 'error': 'No input provided to Python bridge.'}))
        sys.exit(1)

    try:
        payload = json.loads(raw_input)
    except Exception as e:
        print(json.dumps({'ok': False, 'error': f"Invalid JSON payload: {e}"}))
        sys.exit(1)

    provider = str(payload.get('provider', 'openai')).lower()
    handler = PROVIDERS.get(provider)
    if not handler:
        print(json.dumps({
            'ok': False,
            'error': f"Unknown provider '{provider}'. Available: {', '.join(sorted(PROVIDERS.keys()))}"
        }))
        sys.exit(1)

    model = payload.get('model')
    api_key = payload.get('apiKey', '')
    messages = payload.get('messages', [])
    timeout_ms = int(payload.get('timeoutMs', 60000))
    timeout_sec = max(5, timeout_ms // 1000)

    try:
        content = handler(messages, model, api_key, timeout_sec)
        print(json.dumps({'ok': True, 'content': content}))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(0)

if __name__ == '__main__':
    main()
