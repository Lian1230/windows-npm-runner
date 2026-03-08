# windows-npm-runner

A lightweight Windows desktop app for running multiple npm scripts simultaneously in a split-pane terminal layout — with working Stop and Re-run controls.

---

## The Problem

The [npm-scripts runner extension for VS Code](https://marketplace.visualstudio.com/items?itemName=emeraldwalk.RunOnSave) is the obvious tool for this — but on Windows the extension itself is unreliable — the split-terminal view crashes, Stop and Re-run don't work properly, and you end up back to managing everything manually.

**windows-npm-runner** is a standalone app that gets this right on Windows: a stable split-pane layout, and Stop/Re-run controls that actually do what they say.

---

## Prerequisites

- **Windows 10 or 11**
- **[Git for Windows](https://git-scm.com/download/win)** — the app runs scripts through Git Bash; without it, nothing will execute
- **[Node.js](https://nodejs.org/) v18+**

---

## Installation & Running

```bash
# Install dependencies
bun install

# Start the app
bun start
```

## Building a Distributable

A standalone `windows-npm-runner.exe` (no installer required) can be built with:

```bash
bun run build
```

Output is written to `dist/windows-npm-runner-win32-x64/`. Copy that folder anywhere and run `windows-npm-runner.exe` directly — no installation needed.

> **Icon regeneration** (if you change `assets/icon.png`): run the one-off conversion script to rebuild `assets/icon.ico` before building:
> ```bash
> bun -e "const {default:p}=require('png-to-ico');const fs=require('fs');p('assets/icon.png').then(b=>fs.writeFileSync('assets/icon.ico',b));"
> ```

---

## How to Use

### 1. Open a project

Click **Open package.json** in the top bar. You can select either:
- a `package.json` file directly, or
- a project folder (the app will look for `package.json` inside it).

The project name appears in the header and all scripts are listed in the left sidebar. The last opened project is remembered and reloaded automatically on next launch.

### 2. Run a script

Click any script name in the sidebar. A terminal tab opens in the active pane. The script **does not start automatically** — use the **▶ Start** button in the terminal toolbar to run it.

### 3. Control a script

Each terminal tab has four buttons in its toolbar:

| Button | Action |
|--------|--------|
| ▶ Start | Run the script |
| ↺ Re-run | Stop (if running), clear output, and start again |
| ■ Stop | Kill the script, its entire process tree, and any processes still holding its ports |
| 🗑 Clear | Clear the terminal output without stopping the script |

The tab label shows a colored status dot:
- **Blue pulse** — running
- **Green** — exited with code 0
- **Red** — exited with a non-zero code

### 4. Split panes

To run multiple scripts side-by-side:

- Click the **split right** or **split down** icon buttons in the top-right corner of any pane.
- Or right-click a script name in the sidebar and choose **Open in split right** / **Open in split down**.
- Drag the divider between panes to resize them.
- Closing all tabs in a pane automatically collapses that pane.

### 5. Switch projects

Click **Open package.json** again at any time to load a different project. Running scripts are not automatically stopped — close their tabs first if needed.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| App shell | [Electron](https://www.electronjs.org/) v33 |
| Terminal rendering | [xterm.js](https://xtermjs.org/) v5 + FitAddon |
| Script execution | Git Bash (`bash.exe --login -c`) via Node `child_process.spawn` |
| Process cleanup | Windows `taskkill /F /T` + `netstat` port detection |
| UI | Vanilla HTML/CSS/JS (no framework) |

---

## Known Limitations

- **Windows only.** Git Bash detection and `taskkill`-based process cleanup are Windows-specific.
- **Git Bash required.** If Git for Windows is not installed, scripts will not run.
- **Read-only terminals.** You cannot type into the terminal (e.g. to answer interactive prompts). Terminals are output-only.
- **One project at a time.** The app holds a single active project directory. Running scripts from multiple projects simultaneously is not supported.
