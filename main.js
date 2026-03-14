const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, spawnSync } = require('child_process');

// Register a custom scheme so the Vite-built renderer can use ES module
// imports from a proper origin (file:// blocks dynamic import() due to CORS).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// --- Session persistence ---
function getSessionFile() {
  return path.join(app.getPath('userData'), 'last-session.json');
}

function getSettingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function saveLastPackagePath(filePath) {
  try {
    fs.writeFileSync(getSessionFile(), JSON.stringify({ filePath }), 'utf8');
  } catch { /* ignore */ }
}

function readLastPackagePath() {
  try {
    const raw = fs.readFileSync(getSessionFile(), 'utf8');
    return JSON.parse(raw).filePath || null;
  } catch {
    return null;
  }
}

function readSettings() {
  try {
    const raw = fs.readFileSync(getSettingsFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { packageManager: 'npm' };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(getSettingsFile(), JSON.stringify(settings), 'utf8');
  } catch { /* ignore */ }
}

function parsePackageJson(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const scripts = content.scripts || {};
  const projectName = content.name || path.basename(path.dirname(filePath));
  const projectDir = path.dirname(filePath);
  return { scripts, projectName, projectDir };
}

let mainWindow;
const processes = new Map(); // id -> { proc, script, cwd, detectedPorts }

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// --- Git Bash detection ---
function findGitBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];

  // Check PATH first
  try {
    const where = execSync('where bash.exe', { encoding: 'utf8', timeout: 3000 });
    const lines = where.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.toLowerCase().includes('git') && fs.existsSync(line.trim())) {
        return line.trim();
      }
    }
  } catch { /* ignore */ }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

const BASH_PATH = findGitBash();

// --- Windows: package manager detection ---
function detectManagersWin() {
  const managers = {};
  for (const name of ['npm', 'pnpm', 'bun']) {
    try {
      const out = execSync(`where ${name}`, { encoding: 'utf8', timeout: 3000, windowsHide: true });
      const firstLine = out.trim().split(/\r?\n/)[0].trim();
      managers[name] = firstLine || null;
    } catch {
      managers[name] = null;
    }
  }
  return managers;
}

// --- Windows: run script in Git Bash ---
function spawnScriptWin(cmd, spawnEnv) {
  return spawn(BASH_PATH, ['--login', '-c', cmd], {
    env: spawnEnv,
    windowsHide: true,
  });
}

// --- Window path to Unix path ---
function toUnixPath(winPath) {
  // F:\Git\Project -> /f/Git/Project
  const normalized = winPath.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (match) {
    return `/${match[1].toLowerCase()}/${match[2]}`;
  }
  return normalized;
}

// --- macOS helpers (used only when isMac) ---
function getMacShell() {
  const shell = process.env.SHELL || '/bin/bash';
  if (path.isAbsolute(shell) && fs.existsSync(shell)) return shell;
  try {
    const resolved = execSync('which ' + shell, { encoding: 'utf8', timeout: 1000 }).trim().split(/\r?\n/)[0];
    return resolved && fs.existsSync(resolved) ? resolved : '/bin/bash';
  } catch {
    return '/bin/bash';
  }
}

function toScriptPath(cwd) {
  if (isWin) return toUnixPath(cwd);
  return cwd;
}

function detectManagersMac() {
  const managers = {};
  const shell = getMacShell();
  // Use login shell so PATH includes ~/.zshrc, ~/.bash_profile, nvm, fnm, Homebrew, etc.
  for (const name of ['npm', 'pnpm', 'bun']) {
    try {
      const out = execSync(`${shell} -l -c 'which ${name}'`, {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, TERM: 'dumb' },
      });
      const firstLine = out.trim().split(/\r?\n/)[0].trim();
      managers[name] = firstLine && firstLine.length > 0 ? firstLine : null;
    } catch {
      managers[name] = null;
    }
  }
  return managers;
}

// --- macOS: run script in login shell ---
function spawnScriptMac(cmd, spawnEnv) {
  const shell = getMacShell();
  return spawn(shell, ['-l', '-c', cmd], {
    env: spawnEnv,
    detached: true,
  });
}

function getListeningPidsOnPortMac(port) {
  const safePort = String(parseInt(port, 10));
  if (safePort === 'NaN' || parseInt(safePort, 10) !== port) return [];
  try {
    const out = execSync('lsof -ti :' + safePort, { encoding: 'utf8', timeout: 3000 });
    return out.trim().split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
  } catch {
    return [];
  }
}

function killProcessTreeMac(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}

function killPidsOnPortsMac(ports) {
  let killedAny = false;
  for (const port of ports) {
    for (const pid of getListeningPidsOnPortMac(port)) {
      try {
        process.kill(pid, 'SIGKILL');
        killedAny = true;
      } catch { /* ignore */ }
    }
  }
  return killedAny;
}

// --- App lifecycle ---
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 400,
    title: 'npm-runner',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    protocol.handle('app', (request) => {
      let { pathname } = new URL(request.url);
      pathname = decodeURIComponent(pathname);
      const filePath = path.join(__dirname, 'dist-renderer', pathname);
      try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    });
    mainWindow.loadURL('app://./index.html');
  }
  mainWindow.setMenuBarVisibility(false);
});

app.on('window-all-closed', () => {
  // Kill all running processes
  for (const [id] of processes) {
    killProcess(id);
  }
  app.quit();
});

// --- IPC Handlers ---

// Open file/folder dialog -> parse package.json
ipcMain.handle('open-package-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open package.json or project folder',
    filters: [{ name: 'package.json', extensions: ['json'] }],
    properties: ['openFile', 'openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  let filePath = result.filePaths[0];

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const candidate = path.join(filePath, 'package.json');
      if (fs.existsSync(candidate)) {
        filePath = candidate;
      } else {
        return { error: 'No package.json found in the selected folder.' };
      }
    }
  } catch (err) {
    return { error: err.message };
  }

  try {
    const result = parsePackageJson(filePath);
    saveLastPackagePath(filePath);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// Open a specific package.json by path (for saved projects)
ipcMain.handle('open-package-path', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { error: 'File not found.' };
  try {
    const result = parsePackageJson(filePath);
    saveLastPackagePath(filePath);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// Load the last session (called on app startup)
ipcMain.handle('load-last-session', () => {
  const filePath = readLastPackagePath();
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    return parsePackageJson(filePath);
  } catch {
    return null;
  }
});

// Detect available package managers
ipcMain.handle('detect-managers', async () => {
  if (isWin) return detectManagersWin();
  if (isMac) return detectManagersMac();
  return { npm: null, pnpm: null, bun: null };
});

// Settings
ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('save-settings', (_event, payload) => {
  const existing = readSettings();
  if (payload.projectDir != null && payload.projectDir !== '') {
    existing.bookmarksByProject = existing.bookmarksByProject || {};
    existing.bookmarksByProject[payload.projectDir] = payload.bookmarks || [];
  }
  if (payload.packageManager !== undefined) existing.packageManager = payload.packageManager;
  if (payload.savedProjects !== undefined) existing.savedProjects = payload.savedProjects;
  if (payload.sidebarWidth != null) existing.sidebarWidth = payload.sidebarWidth;
  saveSettings(existing);
});

// Run a script
ipcMain.on('run-script', (event, { id, script, cwd }) => {
  if (isWin) {
    if (!BASH_PATH) {
      event.sender.send('script-error', { id, data: 'Git Bash not found. Install Git for Windows.\r\n' });
      return;
    }
  } else if (!isMac) {
    event.sender.send('script-error', { id, data: 'Unsupported platform.\r\n' });
    return;
  }

  const { packageManager } = readSettings();
  const scriptCwd = toScriptPath(cwd);
  const cmd = `cd "${scriptCwd}" && ${packageManager} run ${script}`;

  const spawnEnv = { ...process.env, FORCE_COLOR: '3', COLORTERM: 'truecolor', TERM: 'xterm-256color' };
  delete spawnEnv.NO_COLOR;

  const proc = isWin ? spawnScriptWin(cmd, spawnEnv) : spawnScriptMac(cmd, spawnEnv);

  const entry = { proc, script, cwd, detectedPorts: new Set() };
  processes.set(id, entry);

  proc.stdout.on('data', (data) => {
    if (processes.get(id) === entry) {
      const str = data.toString();
      collectPorts(str, entry.detectedPorts);
      event.sender.send('script-output', { id, data: str });
    }
  });

  proc.stderr.on('data', (data) => {
    if (processes.get(id) === entry) {
      const str = data.toString();
      collectPorts(str, entry.detectedPorts);
      event.sender.send('script-output', { id, data: str });
    }
  });

  proc.on('close', (code) => {
    if (processes.get(id) === entry) {
      processes.delete(id);
      event.sender.send('script-exit', { id, code });
    }
  });

  proc.on('error', (err) => {
    if (processes.get(id) === entry) {
      processes.delete(id);
      event.sender.send('script-error', { id, data: `Error: ${err.message}\r\n` });
    }
  });
});

// Stop a script (returns a promise that resolves when the process is dead)
ipcMain.handle('stop-script', async (_event, { id }) => {
  await killProcess(id);
});

// Stop all running scripts
ipcMain.handle('stop-all-scripts', async () => {
  const ids = [...processes.keys()];
  await Promise.all(ids.map((id) => killProcess(id)));
});

// --- Kill port (user-requested) ---
ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

ipcMain.handle('kill-port', async (_event, { port }) => {
  const p = parseInt(port, 10);
  if (!p || p < 1 || p > 65535) return { error: 'Invalid port number.' };

  let killed = false;
  if (isWin) {
    const pids = getListeningPidsOnPort(p);
    for (const pid of pids) {
      if (taskkillPid(pid, { includeTree: true, timeout: 3000 })) killed = true;
    }
  } else if (isMac) {
    const pids = getListeningPidsOnPortMac(p);
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); killed = true; } catch { /* ignore */ }
    }
  }

  return killed ? { ok: true } : { error: `Nothing listening on port ${p}.` };
});

// --- Port detection from script output ---
// Matches "localhost:3000", "0.0.0.0:5173", "192.168.1.2:8080", "[::]:3000",
// "port 3000", "Port 3000", etc.
const PORT_PATTERNS = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]|::1|\d+\.\d+\.\d+\.\d+):(\d{4,5})/g,
  /\bport\s+(\d{4,5})\b/gi,
];

function collectPorts(text, portSet) {
  for (const re of PORT_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const port = parseInt(m[1], 10);
      if (port >= 1024 && port <= 65535) portSet.add(port);
    }
  }
}

// --- Kill processes still listening on specific ports (netstat fallback) ---
function getListeningPidsOnPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr ":${port} " | findstr LISTENING`,
      { encoding: 'utf8', timeout: 3000, windowsHide: true, shell: true }
    );

    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      const pid = parseInt(cols[cols.length - 1], 10);
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killProcessesOnPorts(ports) {
  let killedAny = false;
  for (const port of ports) {
    for (const pid of getListeningPidsOnPort(port)) {
      if (taskkillPid(pid, { includeTree: false, timeout: 1200 })) {
        killedAny = true;
      }
    }
  }
  return killedAny;
}

function taskkillPid(pid, options = {}) {
  const includeTree = options.includeTree ?? false;
  const timeout = options.timeout ?? 2000;
  const args = ['/F'];
  if (includeTree) args.push('/T');
  args.push('/PID', String(pid));

  const result = spawnSync('taskkill', args, {
    timeout,
    windowsHide: true,
    stdio: 'ignore',
  });

  return !result.error;
}

// --- Kill a tracked process and all its descendants ---
async function killProcess(id) {
  const entry = processes.get(id);
  if (!entry) return;

  const proc = entry.proc;
  processes.delete(id);

  proc.removeAllListeners('close');
  proc.removeAllListeners('error');
  proc.stdout.removeAllListeners('data');
  proc.stderr.removeAllListeners('data');

  if (proc.exitCode !== null || proc.killed) {
    return;
  }

  const pid = proc.pid;
  if (pid) {
    if (isWin) {
      // Fast path first: kill the bash tree. This is the normal stop/rerun path.
      taskkillPid(pid, { includeTree: true, timeout: 1200 });

      // Only pay for the slower port fallback if something is still listening.
      const portsStillListening = [...entry.detectedPorts].some((port) => getListeningPidsOnPort(port).length > 0);
      if (portsStillListening) {
        killProcessesOnPorts(entry.detectedPorts);
      }
    } else if (isMac) {
      killProcessTreeMac(-pid);

      const portsStillListening = [...entry.detectedPorts].some((port) => getListeningPidsOnPortMac(port).length > 0);
      if (portsStillListening) {
        killPidsOnPortsMac(entry.detectedPorts);
      }
    } else {
      try {
        process.kill(pid, 'SIGKILL');
      } catch { /* ignore */ }
    }
  }
}

