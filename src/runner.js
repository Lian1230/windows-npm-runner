/**
 * Terminal/tab runner bridge. Runs after Svelte app is mounted.
 * Uses window.api (preload), panes + tabs stores; exposes window.* for components.
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  projectState,
  contextMenuState,
} from './stores/app.svelte.js';
import { tabsState } from './stores/tabs.svelte.js';
import {
  panesState,
  ensureRoot,
  getFirstPaneId,
  getPaneIds,
  splitPane as panesSplitPane,
  setFocusedPane,
  collapsePaneIfPossible,
  swapSplitOrderForPane,
} from './stores/panes.svelte.js';

// --- State ---
// tabs: id -> { script, term, fitAddon, running, busy, paneId }
const tabs = new Map();
let tabCounter = 0;
let fitScheduled = false;

// --- Settings / Stop All ---

function updateStopAllButton() {
  tabsState.hasAnyRunning = [...tabs.values()].some((t) => t.running);
}

window.onStopAllComplete = () => {
  for (const [id, tab] of tabs) {
    if (tab.running) {
      tab.running = false;
      if (tabsState.tabs[id]) tabsState.tabs[id].running = false;
      tab.term.writeln('\r\n\x1b[33mProcess stopped.\x1b[0m');
      updateTabStatus(id, 'exited-ok');
    }
  }
  updateStopAllButton();
};

function saveAllSettings() {
  const sidebarWidth = window.getSidebarWidth?.() ?? null;
  api.saveSettings({
    packageManager: projectState.packageManager,
    bookmarks: [...projectState.bookmarks],
    savedProjects: projectState.savedProjects,
    ...(sidebarWidth != null && sidebarWidth > 0 ? { sidebarWidth: Math.round(sidebarWidth) } : {}),
  });
}

window.saveAllSettings = saveAllSettings;

// ─────────────────────────────────────────────────────────
// Pane / tab helpers (use panes store; no DOM)
// ─────────────────────────────────────────────────────────

function addTabToPane(paneId, id, tab) {
  tab.paneId = paneId;
  tabs.set(id, tab);
  tabsState.tabs[id] = { script: tab.script, status: 'idle', running: false, busy: false, paneId };
  const order = tabsState.orderByPane[paneId] ?? [];
  order.push(id);
  tabsState.orderByPane[paneId] = order;
  tabsState.activeByPane[paneId] = id;
  setFocusedPane(paneId);
}

function moveTabToPane(tabId, targetPaneId, insertBeforeTabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  const sourcePaneId = tab.paneId;
  if (sourcePaneId === targetPaneId) {
    if (insertBeforeTabId) reorderTab(targetPaneId, tabId, insertBeforeTabId, true);
    return;
  }

  const statusClass = tabsState.tabs[tabId]?.status ?? 'idle';
  const srcOrder = tabsState.orderByPane[sourcePaneId] || [];
  const newSrcOrder = srcOrder.filter((id) => id !== tabId);
  tabsState.orderByPane[sourcePaneId] = newSrcOrder;
  if (tabsState.activeByPane[sourcePaneId] === tabId) {
    tabsState.activeByPane[sourcePaneId] = newSrcOrder.at(-1) ?? null;
  }

  tab.paneId = targetPaneId;
  const targetOrder = tabsState.orderByPane[targetPaneId] || [];
  const newTargetOrder =
    insertBeforeTabId
      ? (() => {
          const insertIdx = targetOrder.indexOf(insertBeforeTabId);
          if (insertIdx !== -1) {
            const next = [...targetOrder];
            next.splice(insertIdx, 0, tabId);
            return next;
          }
          return [...targetOrder, tabId];
        })()
      : [...targetOrder, tabId];
  tabsState.orderByPane[targetPaneId] = newTargetOrder;
  if (tabsState.tabs[tabId]) {
    tabsState.tabs[tabId].paneId = targetPaneId;
    tabsState.tabs[tabId].status = statusClass;
  } else {
    tabsState.tabs[tabId] = { script: tab.script, status: statusClass, running: tab.running, busy: tab.busy, paneId: targetPaneId };
  }
  tabsState.activeByPane[targetPaneId] = tabId;
  setFocusedPane(targetPaneId);
  collapsePaneIfPossible(sourcePaneId);
  scheduleFitVisibleTerminals();
}

function reorderTab(paneId, draggedId, targetId, insertBefore) {
  if (draggedId === targetId) return;
  const order = tabsState.orderByPane[paneId] || [];
  const draggedIdx = order.indexOf(draggedId);
  const targetIdx = order.indexOf(targetId);
  if (draggedIdx === -1 || targetIdx === -1) return;
  order.splice(draggedIdx, 1);
  const newTargetIdx = order.indexOf(targetId);
  const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
  order.splice(insertIdx, 0, draggedId);
}

function switchTab(paneId, tabId) {
  const order = tabsState.orderByPane[paneId] || [];
  if (!order.includes(tabId)) return;
  tabsState.activeByPane[paneId] = tabId;
  setFocusedPane(paneId);
  scheduleFitVisibleTerminals();
}

function closePane(paneId) {
  const order = tabsState.orderByPane[paneId] ?? [];
  if (order.length === 0) {
    collapsePaneIfPossible(paneId);
    return;
  }
  for (const id of [...order]) {
    const tab = tabs.get(id);
    if (tab?.running) api.stopScript(id);
    if (tab) {
      tab.term.dispose();
      tabs.delete(id);
      delete tabsState.tabs[id];
    }
  }
  tabsState.orderByPane[paneId] = [];
  tabsState.activeByPane[paneId] = null;
  collapsePaneIfPossible(paneId);
}

function handleDropOnSplitZone(tabId, sourcePaneId, targetPaneId, zone) {
  const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
  const putFirst = (zone === 'left' || zone === 'top');
  const tab = tabs.get(tabId);
  if (!tab) return;

  const statusClass = tabsState.tabs[tabId]?.status ?? 'idle';

  // Remove tab from source pane (same-pane split or cross-pane drop)
  const srcOrder = tabsState.orderByPane[sourcePaneId] || [];
  const newSrcOrder = srcOrder.filter((id) => id !== tabId);
  tabsState.orderByPane[sourcePaneId] = newSrcOrder;
  if (tabsState.activeByPane[sourcePaneId] === tabId) {
    tabsState.activeByPane[sourcePaneId] = newSrcOrder.at(-1) ?? null;
  }
  if (sourcePaneId === targetPaneId) {
    delete tabsState.tabs[tabId];
  }

  const newPaneId = panesSplitPane(targetPaneId, direction);
  if (putFirst) swapSplitOrderForPane(targetPaneId);

  tab.paneId = newPaneId;
  tabsState.tabs[tabId] = { script: tab.script, status: statusClass, running: tab.running, busy: tab.busy, paneId: newPaneId };
  const newOrder = [...(tabsState.orderByPane[newPaneId] || []), tabId];
  tabsState.orderByPane[newPaneId] = newOrder;
  tabsState.activeByPane[newPaneId] = tabId;
  setFocusedPane(newPaneId);
  collapsePaneIfPossible(sourcePaneId);
  scheduleFitVisibleTerminals();
}

// ─────────────────────────────────────────────────────────
// Context menu
// ─────────────────────────────────────────────────────────

function showContextMenu(x, y, items) {
  contextMenuState.items = items;
  contextMenuState.x = x;
  contextMenuState.y = y;
  contextMenuState.visible = true;
}

function hideContextMenu() {
  contextMenuState.visible = false;
}
window.hideContextMenu = hideContextMenu;

// ─────────────────────────────────────────────────────────
// Terminal fit
// ─────────────────────────────────────────────────────────

function scheduleFitVisibleTerminals() {
  if (fitScheduled) return;
  fitScheduled = true;

  requestAnimationFrame(() => {
    fitScheduled = false;
    const paneIds = getPaneIds(panesState.root);
    for (const paneId of paneIds) {
      const activeTabId = tabsState.activeByPane[paneId];
      if (!activeTabId) continue;
      const tab = tabs.get(activeTabId);
      if (!tab) continue;
      try {
        tab.fitAddon.fit();
      } catch {
        // Ignore xterm fit failures during layout churn.
      }
    }
  });
}

// ─────────────────────────────────────────────────────────
// Terminal creation
// ─────────────────────────────────────────────────────────

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
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Menlo', 'SF Mono', monospace",
    scrollback: 10000,
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  term.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    return true;
  });

  return {
    script: name,
    term,
    fitAddon,
    running: false,
    busy: false,
    paneId: null,
  };
}

function openScriptTab(name, options = {}) {
  ensureRoot();

  for (const [existingId, existingTab] of tabs) {
    if (existingTab.script !== name) continue;
    const paneId = existingTab.paneId;
    if (paneId) switchTab(paneId, existingId);
    if (!existingTab.running && !existingTab.busy) startScript(existingId);
    return;
  }

  let targetPaneId = options.paneId ?? panesState.focusedPaneId ?? getFirstPaneId();
  if (options.splitDirection) {
    targetPaneId = panesSplitPane(targetPaneId, options.splitDirection);
  }

  const id = `tab-${++tabCounter}`;
  const tab = createTerminalTab(name);
  tab.id = id;

  addTabToPane(targetPaneId, id, tab);
  startScript(id);
}

window.openScriptTab = openScriptTab;

window.showContextMenuForScript = (x, y, name) => {
  showContextMenu(x, y, [
    { label: 'Open in active pane', action: () => openScriptTab(name) },
    { label: 'Open in split right', action: () => openScriptTab(name, { splitDirection: 'horizontal' }) },
    { label: 'Open in split down',  action: () => openScriptTab(name, { splitDirection: 'vertical' }) },
  ]);
};

// ─────────────────────────────────────────────────────────
// Tab state management
// ─────────────────────────────────────────────────────────

function updateTabStatus(id, statusClass) {
  if (tabsState.tabs[id]) {
    tabsState.tabs[id].status = statusClass;
  }
}

function startScript(id) {
  const tab = tabs.get(id);
  if (!tab || tab.running || tab.busy) return;

  tab.running = true;
  if (tabsState.tabs[id]) tabsState.tabs[id].running = true;
  updateTabStatus(id, 'running');

  tab.term.writeln(`\x1b[90m$ ${projectState.packageManager} run ${tab.script}\x1b[0m\r\n`);
  api.runScript(id, tab.script, projectState.dir);
  updateStopAllButton();
}

async function stopScript(id) {
  const tab = tabs.get(id);
  if (!tab || !tab.running || tab.busy) return;

  tab.busy = true;
  if (tabsState.tabs[id]) tabsState.tabs[id].busy = true;

  await api.stopScript(id);

  const currentTab = tabs.get(id);
  if (!currentTab) return;

  currentTab.running = false;
  currentTab.busy = false;
  if (tabsState.tabs[id]) {
    tabsState.tabs[id].running = false;
    tabsState.tabs[id].busy = false;
  }

  currentTab.term.writeln('\r\n\x1b[33mProcess stopped.\x1b[0m');
  updateTabStatus(id, 'exited-ok');
  updateStopAllButton();
}

async function rerunScript(id) {
  const tab = tabs.get(id);
  if (!tab || tab.busy) return;

  tab.busy = true;
  if (tabsState.tabs[id]) tabsState.tabs[id].busy = true;

  if (tab.running) {
    await api.stopScript(id);
    if (!tabs.has(id)) return;
    tab.running = false;
    if (tabsState.tabs[id]) tabsState.tabs[id].running = false;
  }

  tab.term.clear();
  tab.term.writeln(`\x1b[90m$ ${projectState.packageManager} run ${tab.script}\x1b[0m\r\n`);
  tab.running = true;
  tab.busy = false;
  if (tabsState.tabs[id]) {
    tabsState.tabs[id].running = true;
    tabsState.tabs[id].busy = false;
  }
  updateTabStatus(id, 'running');
  api.runScript(id, tab.script, projectState.dir);
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const paneId = tab.paneId;
  if (!paneId) return;

  if (tab.running) api.stopScript(id);
  tab.term.dispose();
  tabs.delete(id);
  delete tabsState.tabs[id];
  const order = tabsState.orderByPane[paneId] || [];
  const idx = order.indexOf(id);
  if (idx !== -1) order.splice(idx, 1);
  if (tabsState.activeByPane[paneId] === id) {
    tabsState.activeByPane[paneId] = order.at(-1) ?? null;
  }
  collapsePaneIfPossible(paneId);
}

// ─────────────────────────────────────────────────────────
// Window bridges — called by Svelte components
// ─────────────────────────────────────────────────────────

window.switchTab = switchTab;
window.closeTab = closeTab;
window.closePane = closePane;
window.setFocusedPane = setFocusedPane;
window.startScript = startScript;
window.stopScript = stopScript;
window.rerunScript = rerunScript;

window.moveTabToPane = moveTabToPane;

window.dropTabOnTab = (srcId, targetId, targetPaneId, insertBefore) => {
  const srcTab = tabs.get(srcId);
  if (!srcTab) return;
  if (srcTab.paneId !== targetPaneId) {
    moveTabToPane(srcId, targetPaneId, insertBefore ? targetId : null);
    if (!insertBefore) reorderTab(targetPaneId, srcId, targetId, false);
  } else {
    reorderTab(targetPaneId, srcId, targetId, insertBefore);
  }
};

window.showTabContextMenu = (x, y, paneId) => {
  showContextMenu(x, y, [
    { label: 'New split right', action: () => { const newId = panesSplitPane(paneId, 'horizontal'); setFocusedPane(newId); } },
    { label: 'New split down',  action: () => { const newId = panesSplitPane(paneId, 'vertical');   setFocusedPane(newId); } },
  ]);
};

window.handleDropOnSplitZone = handleDropOnSplitZone;

window.hidePaneDropOverlay = () => {};
window.cleanupAllPaneDropOverlays = () => {};

window.getTab = (id) => tabs.get(id);
window.scheduleFitVisibleTerminals = scheduleFitVisibleTerminals;

// ─────────────────────────────────────────────────────────
// IPC listeners (api from preload)
// ─────────────────────────────────────────────────────────

api.onScriptOutput(({ id, data }) => {
  const tab = tabs.get(id);
  if (tab) tab.term.write(data);
});

api.onScriptExit(({ id, code }) => {
  const tab = tabs.get(id);
  if (!tab) return;

  tab.running = false;
  if (tabsState.tabs[id]) tabsState.tabs[id].running = false;

  const label = code === 0 ? '\x1b[32m' : '\x1b[31m';
  tab.term.writeln(`\r\n${label}Process exited with code ${code}\x1b[0m`);
  updateTabStatus(id, code === 0 ? 'exited-ok' : 'exited-fail');
  updateStopAllButton();
});

api.onScriptError(({ id, data }) => {
  const tab = tabs.get(id);
  if (tab) tab.term.write(`\x1b[31m${data}\x1b[0m`);
});

// ─────────────────────────────────────────────────────────
// Startup — auto-resume last session
// ─────────────────────────────────────────────────────────

(async () => {
  ensureRoot();

  const settings = await api.getSettings();
  if (settings?.packageManager) projectState.packageManager = settings.packageManager;
  if (settings?.bookmarks)      projectState.bookmarks = new Set(settings.bookmarks);
  if (settings?.savedProjects)  projectState.savedProjects = settings.savedProjects;
  if (settings?.sidebarWidth != null && settings.sidebarWidth >= 180) {
    window.setInitialSidebarWidth?.(settings.sidebarWidth);
  }

  const result = await api.loadLastSession();
  if (!result || result.error) return;

  projectState.scripts = result.scripts;
  projectState.name    = result.projectName;
  projectState.dir     = result.projectDir;
})();

window.addEventListener('resize', scheduleFitVisibleTerminals);
