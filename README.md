# pocu — Pocket Unix CLI

A lightweight AI-powered developer CLI and interactive agent terminal designed for Termux (Android) and Unix systems.

Point `pocu` at any project directory to start an interactive terminal session where you can chat across the codebase, reference files inline with `@relative/path`, view colorized diffs (`+` green, `-` red), and run code directly on your mobile device.

---

## Quick Start

### 1. Install Prerequisites

On Termux (Android):
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git python -y
node -v      # requires v18 or higher
python3 -v   # requires Python 3 for network bridge
```

On Ubuntu / Debian:
```bash
sudo apt update
sudo apt install -y nodejs npm git python3
```

### 2. Clone and Setup

```bash
git clone https://github.com/Rohinthan/pocu.git
cd pocu
npm install
chmod +x pocu.js ai.js lib/bridge.py
```

### 3. Register Global Command

Register `pocu` in your `$PATH` so you can launch it from any directory without typing `node pocu.js`:

**On Termux:**
```bash
mkdir -p $PREFIX/bin
ln -sf "$(pwd)/pocu.js" $PREFIX/bin/pocu
ln -sf "$(pwd)/ai.js" $PREFIX/bin/ai
```

**On Standard Linux:**
```bash
mkdir -p ~/.local/bin
ln -sf "$(pwd)/pocu.js" ~/.local/bin/pocu
ln -sf "$(pwd)/ai.js" ~/.local/bin/ai
```

Verify the installation:
```bash
pocu --help
```

### 4. Configure Your API Key

Use the `/api` command to configure your preferred AI provider:

```bash
# Interactive setup:
pocu /api

# Or direct configuration:
pocu /api gemini <your-gemini-api-key>
pocu /api openai <your-openai-api-key>
pocu /api anthropic <your-anthropic-api-key>
```

Settings are stored at `~/.ai-cli/config.json`. You can also configure keys using a `.env` file (`cp .env.example .env`).

---

## How to Use

### 1. Interactive Agent Mode (Default)

Navigate to any project directory and run `pocu` without arguments:

```bash
cd ~/my-project
pocu
```

This scans your directory tree and starts the interactive terminal:

```text
[info] Opened project: /home/user/my-project
[info] Chat mode. Provider: gemini, model: gemini-flash-lite-latest
[info] Type your message and press Enter. Mention files with @path/to/file. Type "exit" to leave.

pocu> 
```

Inside this session:
- **Chat directly**: Type your prompt normally (no quotes or `node pocu.js` needed).
- **Reference files**: Include `@path/to/file` in your message to attach file contents into context.
- **Run slash commands**: Execute commands directly at the `pocu> ` prompt.

Example interactive workflow:
```text
pocu> @main.py what does this script do?
pocu> /run main.py foo bar
pocu> /fix main.py
pocu> /create utils.py "helper functions for string manipulation"
pocu> /api
pocu> /exit
```

---

### 2. Single Command Mode

Run direct one-off commands from your shell without opening an interactive session:

```bash
# General query:
pocu "Explain the differences between processes and threads"

# Query with file context:
pocu "What edge cases might fail in this function?" app.py

# File operations with diff preview:
pocu /fix app.py
pocu /refactor app.py
pocu /explain app.py
pocu /test app.py
pocu /create hello.py "prints hello world"

# Code execution:
pocu /run app.py arg1 arg2

# Staging changes:
pocu /diff app.py
pocu /apply app.py

# Configuration:
pocu /api
pocu /model gemini:gemini-flash-lite-latest
pocu /history 10
```

---

## Command Reference

| Command | Syntax | Description |
| :--- | :--- | :--- |
| `/api` | `/api [provider] [key]` | View active provider, model, masked key, or configure keys |
| `/model` | `/model [provider:model]` | View current model or switch provider and model |
| `/run` | `/run <file> [args...]` | Execute a `.py` (python3), `.js` (node), or `.c` (gcc) file |
| `/fix` | `/fix <file>` | AI fixes bugs; displays `-` red / `+` green diff before writing |
| `/create` | `/create <file> "<desc>"` | Generate a file from description with `+` green diff preview |
| `/refactor` | `/refactor <file>` | Refactor code structure with diff confirmation |
| `/explain` | `/explain <file>` | Plain-text analysis of file purpose, functions, and risks |
| `/test` | `/test <file>` | Generate tests to a conventional test file with diff preview |
| `/diff` | `/diff <file>` | Stage AI-suggested changes to `~/.ai-cli/pending.json` |
| `/apply` | `/apply <file>` | Apply previously staged `/diff` changes to disk |
| `/ask` | `/ask "<question>" [file]` | General query (equivalent to passing a prompt directly) |
| `/chat` | `/chat` | Interactive chat session without scanning directory tree |
| `/open` | `/open [dir]` | Open target directory and launch interactive agent session |
| `/history` | `/history [n]` | Display the last `n` recorded commands (default: 20) |
| `/clear` | `/clear` | Clear current in-session conversation history (chat only) |
| `/help` | `/help` | Display command list |
| `/exit` | `/exit` or `exit` | Leave interactive session |

---

## Key Design Features

### 1. Python Communication Link (`lib/bridge.py`)
In mobile Termux environments, Node.js built-in `fetch` can encounter TLS certificate validation failures or DNS resolution errors on mobile cellular networks. `pocu` routes API calls through an integrated Python standard-library bridge (`urllib.request`, `ssl`, `json`), with seamless fallback to Node.js `fetch`. No external Python libraries are required.

### 2. Colorized Diff Safety Gate
Any command that modifies or creates files (`/fix`, `/refactor`, `/create`, `/test`, `/apply`) displays a diff preview:
- Additions are printed with `+ ` in green.
- Deletions are printed with `- ` in red.
- Files are only written after explicit `y` confirmation.

### 3. Supported Providers and Default Models

| Provider Name | Default Model | Config Environment Variable |
| :--- | :--- | :--- |
| `gemini` / `google` | `gemini-flash-lite-latest` | `GEMINI_API_KEY` |
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `anthropic` / `claude` | `claude-3-5-sonnet-20241022` | `ANTHROPIC_API_KEY` |
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| `openrouter` | `google/gemini-2.0-flash-lite-001` | `OPENROUTER_API_KEY` |
| `ollama` / `local` | `llama3` | `OLLAMA_BASE_URL` |

### 4. Heuristic Code Safety Net
Before executing code with `/run`, files are checked for destructive patterns (e.g. `rm -rf /`, fork bombs, raw block writes). Commands matching these patterns are blocked.

---

## Project Structure

```text
pocu/
  pocu.js              Main CLI entrypoint and argument parser
  ai.js                Compatibility alias forwarding to pocu.js
  config.js            Configuration loader (~/.ai-cli/config.json, .env)
  package.json         Package manifest and executable binary bindings
  commands/
    index.js           Command registry and plugin loader
    open.js            /open - scan directory and launch agent mode
    chat.js            Interactive REPL with slash command support
    connect.js         /api and /connect - API credentials configuration
    model.js           /model - provider and model switcher
    run.js             /run - file execution with argument forwarding
    fix.js             /fix - bug fixes with diff preview
    refactor.js        /refactor - structural improvements with diff
    create.js          /create - file generator with additions diff
    test.js            /test - test generator with diff preview
    diff.js            /diff - stage AI changes to pending storage
    apply.js           /apply - apply staged changes from storage
    explain.js         /explain - plain-text explanation
    ask.js             /ask - single-turn query handler
    history.js         /history - command history viewer
  lib/
    bridge.py          Python communication link for AI API networking
    api.js             Provider abstraction and bridge dispatch
    diff.js            LCS diff algorithm and colored printer
    exec.js            Language detection and guarded process execution
    fs.js              Filesystem read/write guards and previews
    project.js         Directory scanner and @file mention resolver
    store.js           JSON persistence for history and staged diffs
    ui.js              ANSI terminal colors and ASCII spinner
    util.js            Code fence parser and language helpers
  .env.example         Example environment variable template
  .gitignore           Git ignore patterns (.env, node_modules, etc.)
  README.md            Documentation
```

---

## Extensibility

### Adding a Plugin Command
Create a JavaScript file in `~/.ai-cli/plugins/<name>.js`:

```javascript
module.exports = {
  name: 'hello',
  async handler(args, ctx) {
    console.log('Plugin executed with args:', args);
  },
};
```

Run it immediately with `pocu /hello world` or inside the `pocu> ` chat terminal as `/hello world`.
