// --- State ---
let projectDir = null;
let scripts = {};
const tabs = new Map(); // id -> { script, term, fitAddon, wrapper, running, busy, paneId, tabEl }
const panes = new Map();
let rootNode = null;
let focusedPaneId = null;
let paneCounter = 0;
let splitCounter = 0;
let tabCounter = 0;
let fitScheduled = false;

// --- DOM refs ---
const btnOpen = document.getElementById('btn-open');
const projectNameEl = document.getElementById('project-name');
const scriptListEl = document.getElementById('script-list');
const terminalContainer = document.getElementById('terminal-container');
const emptyState = document.getElementById('empty-state');

const paneRoot = document.createElement('div');
paneRoot.id = 'pane-root';
terminalContainer.appendChild(paneRoot);

const contextMenu = document.createElement('div');
contextMenu.id = 'context-menu';
contextMenu.hidden = true;
document.body.appendChild(contextMenu);

class PaneGroup {
  constructor() {
    this.id = `pane-${++paneCounter}`;
    this.parent = null;
    this.tabs = new Map();
    this.activeTabId = null;

    this.el = document.createElement('section');
    this.el.className = 'pane-group';
    this.el.dataset.paneId = this.id;

    this.header = document.createElement('div');
    this.header.className = 'pane-header';

    this.tabBar = document.createElement('div');
    this.tabBar.className = 'pane-tab-bar';

    this.actions = document.createElement('div');
    this.actions.className = 'pane-actions';

    this.splitRightBtn = createPaneActionButton('Split right', `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5"></rect>
        <path d="M8 2.5v11"></path>
      </svg>
    `);
    this.splitDownBtn = createPaneActionButton('Split down', `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5"></rect>
        <path d="M2.5 8h11"></path>
      </svg>
    `);

    this.closePaneBtn = createPaneActionButton('Close pane', `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M4 4l8 8"/><path d="M12 4l-8 8"/>
      </svg>
    `);
    this.closePaneBtn.classList.add('btn-close-pane');

    this.actions.append(this.splitRightBtn, this.splitDownBtn, this.closePaneBtn);
    this.header.append(this.tabBar, this.actions);

    this.body = document.createElement('div');
    this.body.className = 'pane-body';

    this.emptyHint = document.createElement('div');
    this.emptyHint.className = 'pane-empty-state';
    this.emptyHint.textContent = 'This pane is empty.';
    this.body.appendChild(this.emptyHint);

    this.el.append(this.header, this.body);

    const focusPane = () => setFocusedPane(this.id);

    this.el.addEventListener('mousedown', focusPane);
    this.body.addEventListener('mousedown', focusPane);

    this.splitRightBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const newPane = splitPane(this, 'horizontal');
      setFocusedPane(newPane.id);
    });

    this.splitDownBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const newPane = splitPane(this, 'vertical');
      setFocusedPane(newPane.id);
    });

    this.closePaneBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closePane(this);
    });

    this.resizeObserver = new ResizeObserver(() => {
      scheduleFitVisibleTerminals();
    });
    this.resizeObserver.observe(this.body);

    panes.set(this.id, this);
  }

  render() {
    this.el.classList.toggle('focused', focusedPaneId === this.id);
    this.tabBar.classList.toggle('empty', this.tabs.size === 0);
    this.emptyHint.style.display = this.tabs.size === 0 ? '' : 'none';
    this.closePaneBtn.style.display = this.parent ? '' : 'none';
    return this.el;
  }

  createTabElement(id, name) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.id = id;
    tabEl.innerHTML = `
      <span class="status-dot idle"></span>
      <span class="tab-name">${name}</span>
      <span class="tab-close" title="Close">&times;</span>
    `;

    tabEl.addEventListener('click', (event) => {
      if (event.target.classList.contains('tab-close')) {
        closeTab(id);
        return;
      }

      this.switchToTab(id);
    });

    tabEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      setFocusedPane(this.id);
      showContextMenu(event.clientX, event.clientY, [
        {
          label: 'New split right',
          action: () => {
            const newPane = splitPane(this, 'horizontal');
            setFocusedPane(newPane.id);
          },
        },
        {
          label: 'New split down',
          action: () => {
            const newPane = splitPane(this, 'vertical');
            setFocusedPane(newPane.id);
          },
        },
      ]);
    });

    return tabEl;
  }

  addTab(id, tab) {
    this.tabs.set(id, tab);
    tab.paneId = this.id;
    tab.wrapper.dataset.paneId = this.id;
    tab.tabEl = this.createTabElement(id, tab.script);

    this.tabBar.appendChild(tab.tabEl);
    this.body.appendChild(tab.wrapper);

    this.switchToTab(id);
    updateEmptyState();
  }

  removeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    this.tabs.delete(id);
    if (tab.tabEl) tab.tabEl.remove();
    tab.wrapper.remove();

    if (this.activeTabId === id) {
      const nextActive = [...this.tabs.keys()].pop() || null;
      this.activeTabId = null;
      if (nextActive) {
        this.switchToTab(nextActive);
      }
    }

    for (const [tabId, paneTab] of this.tabs) {
      const isActive = tabId === this.activeTabId;
      paneTab.wrapper.classList.toggle('active', isActive);
      if (paneTab.tabEl) paneTab.tabEl.classList.toggle('active', isActive);
    }

    this.render();
    updateEmptyState();
  }

  switchToTab(id) {
    if (!this.tabs.has(id)) return;

    this.activeTabId = id;
    setFocusedPane(this.id);

    for (const [tabId, tab] of this.tabs) {
      const isActive = tabId === id;
      tab.wrapper.classList.toggle('active', isActive);
      if (tab.tabEl) tab.tabEl.classList.toggle('active', isActive);
    }

    this.render();
    scheduleFitVisibleTerminals();
  }

  destroy() {
    this.resizeObserver.disconnect();
    panes.delete(this.id);
    this.el.remove();
  }
}

class SplitContainer {
  constructor(direction, firstChild, secondChild) {
    this.id = `split-${++splitCounter}`;
    this.parent = null;
    this.direction = direction;
    this.children = [firstChild, secondChild];
    this.sizes = [50, 50];
    this.childWrappers = [];

    firstChild.parent = this;
    secondChild.parent = this;

    this.el = document.createElement('div');
    this.el.className = `split-container ${direction}`;
  }

  render() {
    this.el.className = `split-container ${this.direction}`;

    const firstWrapper = document.createElement('div');
    firstWrapper.className = 'split-child';
    firstWrapper.appendChild(this.children[0].render());

    const secondWrapper = document.createElement('div');
    secondWrapper.className = 'split-child';
    secondWrapper.appendChild(this.children[1].render());

    this.childWrappers = [firstWrapper, secondWrapper];
    this.applySizes();

    const gutter = document.createElement('div');
    gutter.className = `split-gutter ${this.direction}`;
    gutter.addEventListener('mousedown', (event) => startResize(event, this));

    this.el.replaceChildren(firstWrapper, gutter, secondWrapper);
    return this.el;
  }

  applySizes() {
    if (this.childWrappers.length !== 2) return;
    this.childWrappers[0].style.flexBasis = `calc(${this.sizes[0]}% - 3px)`;
    this.childWrappers[1].style.flexBasis = `calc(${this.sizes[1]}% - 3px)`;
  }

  replaceChild(oldChild, newChild) {
    const index = this.children.indexOf(oldChild);
    if (index === -1) return;
    this.children[index] = newChild;
    newChild.parent = this;
  }

  otherChild(child) {
    return this.children[0] === child ? this.children[1] : this.children[0];
  }
}

function createPaneActionButton(title, iconMarkup) {
  const button = document.createElement('button');
  button.className = 'pane-action-btn';
  button.type = 'button';
  button.title = title;
  button.innerHTML = iconMarkup;
  return button;
}

function ensureRootPane() {
  if (rootNode) return;
  rootNode = new PaneGroup();
  renderLayout();
  setFocusedPane(rootNode.id);
}

function renderLayout() {
  ensureRootPane();
  paneRoot.replaceChildren(rootNode.render());
  updateEmptyState();
  scheduleFitVisibleTerminals();
}

function updateEmptyState() {
  emptyState.style.display = tabs.size === 0 ? '' : 'none';
}

function getFocusedPane() {
  if (focusedPaneId && panes.has(focusedPaneId)) {
    return panes.get(focusedPaneId);
  }
  return findFirstPane(rootNode);
}

function findFirstPane(node) {
  if (!node) return null;
  if (node instanceof PaneGroup) return node;
  return findFirstPane(node.children[0]) || findFirstPane(node.children[1]);
}

function setFocusedPane(paneId) {
  if (paneId && panes.has(paneId)) {
    focusedPaneId = paneId;
  } else if (!panes.has(focusedPaneId)) {
    focusedPaneId = findFirstPane(rootNode)?.id || null;
  }

  for (const pane of panes.values()) {
    pane.render();
  }
}

function splitPane(targetPane, direction) {
  const parent = targetPane.parent;
  const newPane = new PaneGroup();
  const splitNode = new SplitContainer(direction, targetPane, newPane);

  if (parent) {
    parent.replaceChild(targetPane, splitNode);
    splitNode.parent = parent;
  } else {
    rootNode = splitNode;
  }

  targetPane.parent = splitNode;
  newPane.parent = splitNode;

  renderLayout();
  return newPane;
}

function closePane(pane) {
  if (!(pane instanceof PaneGroup) || !pane.parent) return;

  for (const [id, tab] of [...pane.tabs]) {
    if (tab.running) api.stopScript(id);
    tab.term.dispose();
    tabs.delete(id);
  }
  pane.tabs.clear();

  collapsePaneIfPossible(pane);
}

function collapsePaneIfPossible(pane) {
  if (!(pane instanceof PaneGroup) || pane.tabs.size > 0 || !pane.parent) return;

  const parent = pane.parent;
  const sibling = parent.otherChild(pane);
  const grandParent = parent.parent;

  pane.destroy();

  if (grandParent) {
    grandParent.replaceChild(parent, sibling);
    sibling.parent = grandParent;
  } else {
    rootNode = sibling;
    sibling.parent = null;
  }

  renderLayout();
  const nextPane = findFirstPane(sibling);
  if (nextPane) setFocusedPane(nextPane.id);
}

function showContextMenu(x, y, items) {
  contextMenu.replaceChildren();

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-item';
    button.textContent = item.label;
    button.addEventListener('click', () => {
      hideContextMenu();
      item.action();
    });
    contextMenu.appendChild(button);
  }

  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    const maxTop = window.innerHeight - rect.height - 8;
    contextMenu.style.left = `${Math.max(8, Math.min(x, maxLeft))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(y, maxTop))}px`;
  });
}

function hideContextMenu() {
  contextMenu.hidden = true;
}

function startResize(event, splitNode) {
  event.preventDefault();
  hideContextMenu();

  const rect = splitNode.el.getBoundingClientRect();
  const startPoint = splitNode.direction === 'horizontal' ? event.clientX : event.clientY;
  const totalSize = splitNode.direction === 'horizontal' ? rect.width : rect.height;
  const startSize = splitNode.sizes[0];
  const minPaneSize = 180;

  const onMouseMove = (moveEvent) => {
    const currentPoint = splitNode.direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
    const delta = currentPoint - startPoint;
    const startPixels = (startSize / 100) * totalSize;
    const nextPixels = Math.min(Math.max(startPixels + delta, minPaneSize), totalSize - minPaneSize);
    const nextPercent = (nextPixels / totalSize) * 100;

    splitNode.sizes = [nextPercent, 100 - nextPercent];
    splitNode.applySizes();
    scheduleFitVisibleTerminals();
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function scheduleFitVisibleTerminals() {
  if (fitScheduled) return;
  fitScheduled = true;

  requestAnimationFrame(() => {
    fitScheduled = false;
    for (const pane of panes.values()) {
      if (!pane.activeTabId) continue;
      const tab = tabs.get(pane.activeTabId);
      if (!tab) continue;
      try {
        tab.fitAddon.fit();
      } catch {
        // Ignore xterm fit failures during layout churn.
      }
    }
  });
}

function renderScriptList() {
  scriptListEl.innerHTML = '';

  for (const name of Object.keys(scripts)) {
    const li = document.createElement('li');
    li.textContent = name;
    li.title = scripts[name];

    li.addEventListener('click', () => openScriptTab(name));
    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, [
        {
          label: 'Open in active pane',
          action: () => openScriptTab(name),
        },
        {
          label: 'Open in split right',
          action: () => openScriptTab(name, { splitDirection: 'horizontal' }),
        },
        {
          label: 'Open in split down',
          action: () => openScriptTab(name, { splitDirection: 'vertical' }),
        },
      ]);
    });

    scriptListEl.appendChild(li);
  }
}

function createTerminalTab(name) {
  const term = new Terminal({
    theme: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: 'rgba(137,180,250,0.3)',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#cba6f7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#cba6f7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    scrollback: 10000,
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.innerHTML = `
    <div class="terminal-controls">
      <button class="ctrl-btn btn-start" data-action="start" title="Start">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2.5v11l9-5.5z"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-rerun" data-action="rerun" title="Re-run">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 2v5h5"/><path d="M3.5 10a5 5 0 1 0 1-6.5L1 7"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-stop" data-action="stop" title="Stop">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="10" height="10" rx="1.5"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-clear" data-action="clear" title="Clear">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4h12"/><path d="M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4"/><path d="M12.5 4v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V4"/>
        </svg>
      </button>
    </div>
    <div class="term-box"></div>
  `;

  wrapper.addEventListener('mousedown', () => {
    const paneId = wrapper.dataset.paneId;
    if (paneId) setFocusedPane(paneId);
  });

  const termBox = wrapper.querySelector('.term-box');
  term.open(termBox);

  const tab = {
    script: name,
    term,
    fitAddon,
    wrapper,
    running: false,
    busy: false,
    paneId: null,
    tabEl: null,
  };

  wrapper.querySelector('.terminal-controls').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    const action = btn?.dataset.action;
    if (!action || btn.disabled) return;

    if (action === 'start') startScript(tab.id);
    else if (action === 'stop') stopScript(tab.id);
    else if (action === 'rerun') rerunScript(tab.id);
    else if (action === 'clear') term.clear();
  });

  return tab;
}

function openScriptTab(name, options = {}) {
  ensureRootPane();

  for (const [existingId, existingTab] of tabs) {
    if (existingTab.script !== name) continue;
    const pane = panes.get(existingTab.paneId);
    if (pane) pane.switchToTab(existingId);
    return;
  }

  let targetPane = panes.get(options.paneId) || getFocusedPane();
  if (!targetPane) {
    targetPane = findFirstPane(rootNode);
  }

  if (options.splitDirection) {
    targetPane = splitPane(targetPane, options.splitDirection);
  }

  const id = `tab-${++tabCounter}`;
  const tab = createTerminalTab(name);
  tab.id = id;

  tabs.set(id, tab);
  targetPane.addTab(id, tab);
  updateTabButtons(id);
}

function updateTabButtons(id) {
  const tab = tabs.get(id);
  if (!tab) return;

  const startBtn = tab.wrapper.querySelector('.btn-start');
  const rerunBtn = tab.wrapper.querySelector('.btn-rerun');
  const stopBtn = tab.wrapper.querySelector('.btn-stop');

  if (tab.busy) {
    startBtn.disabled = true;
    rerunBtn.disabled = true;
    stopBtn.disabled = true;
  } else {
    startBtn.disabled = tab.running;
    rerunBtn.disabled = false;
    stopBtn.disabled = !tab.running;
  }
}

function setBusy(id, busyBtn, isBusy) {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.busy = isBusy;
  if (busyBtn) busyBtn.classList.toggle('loading', isBusy);
  updateTabButtons(id);
}

function updateTabStatus(id, statusClass) {
  const tab = tabs.get(id);
  if (!tab?.tabEl) return;
  const statusDot = tab.tabEl.querySelector('.status-dot');
  if (statusDot) statusDot.className = `status-dot ${statusClass}`;
}

function startScript(id) {
  const tab = tabs.get(id);
  if (!tab || tab.running || tab.busy) return;

  tab.running = true;
  updateTabStatus(id, 'running');
  updateTabButtons(id);

  tab.term.writeln(`\x1b[90m$ npm run ${tab.script}\x1b[0m\r\n`);
  api.runScript(id, tab.script, projectDir);
}

async function stopScript(id) {
  const tab = tabs.get(id);
  if (!tab || !tab.running || tab.busy) return;

  const stopBtn = tab.wrapper.querySelector('.btn-stop');
  setBusy(id, stopBtn, true);

  await api.stopScript(id);

  const currentTab = tabs.get(id);
  if (!currentTab) return;

  currentTab.running = false;
  currentTab.term.writeln('\r\n\x1b[33mProcess stopped.\x1b[0m');
  updateTabStatus(id, 'exited-ok');

  setBusy(id, stopBtn, false);
}

async function rerunScript(id) {
  const tab = tabs.get(id);
  if (!tab || tab.busy) return;

  const rerunBtn = tab.wrapper.querySelector('.btn-rerun');
  setBusy(id, rerunBtn, true);

  if (tab.running) {
    await api.stopScript(id);
    if (!tabs.has(id)) return;
    tab.running = false;
  }

  tab.term.clear();
  tab.term.writeln(`\x1b[90m$ npm run ${tab.script}\x1b[0m\r\n`);
  tab.running = true;
  updateTabStatus(id, 'running');
  setBusy(id, rerunBtn, false);

  api.runScript(id, tab.script, projectDir);
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;

  const pane = panes.get(tab.paneId);
  if (!pane) return;

  if (tab.running) {
    api.stopScript(id);
  }

  tab.term.dispose();
  pane.removeTab(id);
  tabs.delete(id);
  collapsePaneIfPossible(pane);
  renderLayout();
}

// --- Open package.json ---
btnOpen.addEventListener('click', async () => {
  const result = await api.openPackageJson();
  if (!result) return;
  if (result.error) {
    alert(`Failed to parse package.json:\n${result.error}`);
    return;
  }

  scripts = result.scripts;
  projectDir = result.projectDir;
  projectNameEl.textContent = result.projectName;
  renderScriptList();
});

document.addEventListener('mousedown', (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) {
    hideContextMenu();
  }
});

window.addEventListener('blur', hideContextMenu);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideContextMenu();
});

// --- IPC listeners ---
api.onScriptOutput(({ id, data }) => {
  const tab = tabs.get(id);
  if (tab) tab.term.write(data);
});

api.onScriptExit(({ id, code }) => {
  const tab = tabs.get(id);
  if (!tab) return;

  tab.running = false;
  const label = code === 0 ? '\x1b[32m' : '\x1b[31m';
  tab.term.writeln(`\r\n${label}Process exited with code ${code}\x1b[0m`);
  updateTabStatus(id, code === 0 ? 'exited-ok' : 'exited-fail');
  updateTabButtons(id);
});

api.onScriptError(({ id, data }) => {
  const tab = tabs.get(id);
  if (tab) tab.term.write(`\x1b[31m${data}\x1b[0m`);
});

// --- Auto-resume last session on startup ---
(async () => {
  ensureRootPane();
  const result = await api.loadLastSession();
  if (!result || result.error) return;
  scripts = result.scripts;
  projectDir = result.projectDir;
  projectNameEl.textContent = result.projectName;
  renderScriptList();
})();

// --- Resize handling ---
window.addEventListener('resize', scheduleFitVisibleTerminals);
