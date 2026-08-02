# pocu — Pocket Unix CLI


> Turn your phone into an AI-powered developer terminal.

A minimal, dependency-free AI-powered CLI assistant for Termux (Android),
inspired by Claude CLI / OpenCode / aider. Point it at a whole project
directory and it "opens" it agent-style — scan the tree, reference any
file with `@path`, chat across the codebase — or use single-file slash
commands for quick, targeted fixes.

---

## 🚀 Quick Start (copy-paste, start to finish)

Run these in order, in Termux. By the end you'll have a working `pocu`
command usable from anywhere.

```bash
# 1. Install Termux prerequisites
pkg update && pkg upgrade -y
pkg install nodejs-lts git -y
node -v                        # must print v18 or higher

# 2. Get the project
git clone <your-repo-url> pocu
cd pocu

# 3. Install (no external packages to fetch — this just wires up the CLI)
npm install

# 4. Add your API key (interactive, asks which provider + pastes the key)
node pocu.js /connect

# 5. Make the files runnable
chmod +x pocu.js ai.js

# 6. Register the "pocu" command globally
mkdir -p $PREFIX/bin
ln -sf "$(pwd)/pocu.js" $PREFIX/bin/pocu

# 7. Verify it's working
pocu --help
```

**That's the entire startup process.** From here on, in ANY directory:

```bash
cd ~/some/other/project
pocu                # opens that project, agent mode, ready to chat
```

If step 7 fails with `command not found: pocu`, close and reopen Termux
once (PATH refresh), then try `pocu --help` again. If it still fails, run
`echo $PATH` and confirm `$PREFIX/bin` is listed — if not, use Option B
below instead of the symlink in step 6:

```bash
npm link        # registers both `pocu` and `ai` via package.json
```

---

## Features

- **Agent mode**: run `pocu` with no args to open the current directory,
  see a project tree, and chat across it, referencing any file inline
  with `@relative/path` (like OpenCode/aider)
- Slash commands: `/open`, `/fix`, `/explain`, `/refactor`, `/test`, `/run`,
  `/chat`, `/diff`, `/apply`, `/create`, `/ask`, `/model`, `/history`, `/connect`
- Pluggable AI providers: OpenAI, Gemini (local model slot ready for later)
- Diff preview + `y/n` confirmation before any file is modified
- Safe code execution for `.c` (gcc), `.py` (python3), `.js` (node), with a
  heuristic guard against destructive commands (`rm -rf /`, fork bombs, etc.)
- Zero npm dependencies — uses Node's built-in `fetch`, `fs`, `readline`,
  `child_process`
- Local plugin system: drop a file in `~/.ai-cli/plugins/` to add commands

## Detailed Setup (same 7 steps above, explained one by one)

### 1. Termux setup

```bash
pkg update && pkg upgrade
pkg install nodejs-lts git
node -v   # confirm Node 18+ (built-in fetch requires it)
```

### 2. Get the project onto your device

Cloning from a repo link (works the same whether it's your own repo or a
downloaded/unzipped copy):

```bash
git clone <your-repo-url> pocu
cd pocu
```

Or if you downloaded a zip instead of cloning:

```bash
cd ~/storage/downloads    # or wherever the zip landed
unzip pocu.zip
cd pocu
```

### 3. Install (no dependencies to fetch, but this sets up the bin link)

```bash
npm install
```

### 4. Configure your API key

Option A — interactive, stored at `~/.ai-cli/config.json` (this is step 4
in the Quick Start above):

```bash
node pocu.js /connect
```

Option B — plain `.env` file instead:

```bash
cp .env.example .env
nano .env        # fill in OPENAI_API_KEY or GEMINI_API_KEY, set AI_PROVIDER
```

### 5. Make it executable

```bash
chmod +x pocu.js ai.js
```

### 6. Give it a real command name

Pick ONE of the following:

**A. Symlink into Termux's bin directory (recommended, used in Quick Start):**

```bash
mkdir -p $PREFIX/bin
ln -sf "$(pwd)/pocu.js" $PREFIX/bin/pocu
```

**B. npm global link (registers both `pocu` and `ai` from package.json):**

```bash
npm link
```

### 7. Verify

```bash
pocu --help
```

Now `pocu` is available from any directory:

```bash
cd ~/myproject
pocu                       # open this project, agent mode
pocu /fix app.py
pocu /run app.py
```

`ai` still works too (kept as a backward-compatible alias to `pocu`).

## Every time you want to use it (after setup is done once)

Setup (steps 1–7 above) only happens once. After that, starting the CLI
is always just:

```bash
cd ~/your-project     # go to whatever folder you want pocu to work in
pocu                  # starts it, opens that folder in agent mode
```

No `node`, no path, no rebuilding — `pocu` is now a normal Termux command,
same as `ls` or `git`.

## Usage examples

```bash
pocu                                    Open cwd, chat across the whole project
pocu /open ~/myproject                  Open a specific directory
# inside agent/chat mode:
#   @src/app.py what does this do?
#   @app.py @utils.py how do these interact?

pocu "write a haiku generator"
pocu "what is wrong with this file" app.py
pocu /fix app.py
pocu /explain app.py
pocu /refactor app.py
pocu /test app.py
pocu /run app.py
pocu /diff app.py
pocu /apply app.py
pocu /create hello.js "prints Hello World to the console"
pocu /model gemini:gemini-1.5-flash
pocu /history 10
```

## Project structure

```
pocu/
  pocu.js              main entry point, arg parsing, dispatch, agent-mode default
  ai.js                thin backward-compatible alias -> pocu.js
  config.js            .env + persisted config loader
  commands/
    index.js            command registry / router
    open.js              /open - scan a directory, drop into project-aware chat
    fix.js
    explain.js
    refactor.js
    test.js
    run.js
    chat.js              supports @path file mentions
    diff.js
    apply.js
    create.js
    ask.js
    model.js
    history.js
    connect.js
  lib/
    api.js              provider abstraction (OpenAI / Gemini / local)
    fs.js                safe file read/write + preview
    exec.js              language detection + safe execution
    diff.js              LCS diff + colorized render + confirm prompt
    project.js           directory scanner + @mention resolution
    store.js             history + pending-change persistence
    ui.js                colors + spinner
    util.js              small shared helpers
  .env.example
  package.json
  README.md
```

Runtime data (history, saved config, staged diffs, plugins) lives outside
the repo at `~/.ai-cli/`, so updating the tool doesn't wipe your settings.

## Safety notes

- Files are never overwritten without an explicit `y` confirmation.
- `/run` refuses to execute code matching known-destructive patterns
  (`rm -rf /`, fork bombs, raw disk writes, `curl | sh`, etc.). This is a
  heuristic safety net, not a sandbox — don't run untrusted code blindly.
- File reads/writes are capped by `AI_MAX_FILE_BYTES` (default 200000 bytes)
  to avoid memory issues on low-RAM devices.
- API keys saved via `/connect` are stored in plaintext at
  `~/.ai-cli/config.json` (same model as tools like `~/.npmrc`). Keep your
  device secured, and avoid committing that file anywhere.

## Extending: adding a command (plugin system)

Create `~/.ai-cli/plugins/mycommand.js`:

```js
module.exports = {
  name: 'hello',
  async handler(args, ctx) {
    console.log('Hello from a plugin! args:', args);
  },
};
```

Now `ai /hello world` works immediately — no need to touch the core repo.

## Extending: adding a provider

Edit `lib/api.js`: write an async function with the signature
`(messages, { model, apiKey, timeoutMs }) => Promise<string>` and add it to
the `PROVIDERS` map. That's the entire integration surface.
