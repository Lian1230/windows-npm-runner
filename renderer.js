// --- State ---
let projectDir = null;
let scripts = {};
let packageManager = 'npm';
let detectedManagers = { npm: null, pnpm: null, bun: null };
let bookmarks = new Set();
let savedProjects = []; // [{ name, filePath }]
const tabs = new Map(); // id -> { script, term, fitAddon, wrapper, running, busy, paneId, tabEl }
const panes = new Map();
let rootNode = null;
let focusedPaneId = null;
let paneCounter = 0;
let splitCounter = 0;
let tabCounter = 0;
let fitScheduled = false;
let draggedTabId = null;
let draggedSourcePaneId = null;

// --- DOM refs ---
const btnOpen = document.getElementById('btn-open');
const projectNameEl = document.getElementById('project-name');
const scriptListEl = document.getElementById('script-list');
const terminalContainer = document.getElementById('terminal-container');
const emptyState = document.getElementById('empty-state');
const btnSaveProject = document.getElementById('btn-save-project');
const btnSavedProjects = document.getElementById('btn-saved-projects');
const btnStopAll = document.getElementById('btn-stop-all');

const sidebarEl = document.getElementById('sidebar');
const sidebarResizeHandle = document.getElementById('sidebar-resize-handle');

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX_PERCENT = 0.5;

function initSidebarResize() {
  let startX = 0;
  let startWidth = 0;

  function onMove(e) {
    const appRect = document.getElementById('app').getBoundingClientRect();
    const maxPx = Math.floor(appRect.width * SIDEBAR_MAX_PERCENT);
    let w = startWidth + (e.clientX - startX);
    w = Math.max(SIDEBAR_MIN, Math.min(maxPx, w));
    sidebarEl.style.width = `${w}px`;
  }
  function onUp() {
    sidebarResizeHandle.classList.remove('bg-accent/20');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveAllSettings();
  }
  sidebarResizeHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidebarEl.getBoundingClientRect().width;
    sidebarResizeHandle.classList.add('bg-accent/20');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
initSidebarResize();

const paneRoot = document.createElement('div');
paneRoot.id = 'pane-root';
paneRoot.className = 'absolute inset-0 min-w-0 min-h-0';
terminalContainer.appendChild(paneRoot);

const contextMenu = document.createElement('div');
contextMenu.id = 'context-menu';
contextMenu.className = 'fixed min-w-[160px] p-1.5 bg-overlay border border-border rounded-lg shadow-xl z-20';
contextMenu.hidden = true;
document.body.appendChild(contextMenu);

// --- Settings modal ---
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.createElement('div');
settingsOverlay.id = 'settings-overlay';
settingsOverlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
settingsOverlay.hidden = true;
document.body.appendChild(settingsOverlay);

function buildSettingsModal() {
  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.className = 'bg-surface border border-border rounded-xl p-6 w-[360px] shadow-2xl';

  const title = document.createElement('div');
  title.className = 'text-[15px] font-semibold mb-5 text-[#cdd6f4]';
  title.textContent = 'Settings';
  modal.appendChild(title);

  // Package Manager row
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between gap-3 mb-3.5';

  const label = document.createElement('span');
  label.className = 'text-[13px] text-[#cdd6f4]';
  label.textContent = 'Package Manager';

  const select = document.createElement('select');
  select.className = 'py-1.5 pl-2.5 pr-7 bg-overlay text-[#cdd6f4] border border-border rounded-md text-[13px] font-mono cursor-pointer transition-[border-color] duration-[0.12s] hover:border-muted focus:outline-none focus:border-accent appearance-none bg-[url("data:image/svg+xml,%3Csvg_width=\'10\'_height=\'6\'_viewBox=\'0_0_10_6\'_fill=\'none\'_xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath_d=\'M1_1l4_4_4-4\'_stroke=\'%236c7086\'_stroke-width=\'1.5\'_stroke-linecap=\'round\'_stroke-linejoin=\'round\'/%3E%3C/svg%3E")] bg-no-repeat bg-[position:right_8px_center] [&>option]:bg-overlay [&>option]:text-[#cdd6f4] [&>option:disabled]:text-muted';

  for (const name of ['npm', 'pnpm', 'bun']) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    opt.selected = name === packageManager;
    if (!detectedManagers[name]) {
      opt.disabled = true;
      opt.textContent = `${name} (not found)`;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', async () => {
    packageManager = select.value;
    saveAllSettings();
  });

  row.append(label, select);
  modal.appendChild(row);

  return modal;
}

async function openSettings() {
  detectedManagers = await api.detectManagers();
  settingsOverlay.replaceChildren(buildSettingsModal());
  settingsOverlay.hidden = false;
}

function hideSettings() {
  settingsOverlay.hidden = true;
}

settingsOverlay.addEventListener('mousedown', (event) => {
  if (event.target === settingsOverlay) hideSettings();
});

btnSettings.addEventListener('click', openSettings);

// --- Stop All ---
function updateStopAllButton() {
  const hasRunning = [...tabs.values()].some((t) => t.running);
  btnStopAll.hidden = !hasRunning;
}

btnStopAll.addEventListener('click', async () => {
  btnStopAll.disabled = true;
  await api.stopAllScripts();

  for (const [id, tab] of tabs) {
    if (tab.running) {
      tab.running = false;
      tab.term.writeln('\r\n\x1b[33mProcess stopped.\x1b[0m');
      updateTabStatus(id, 'exited-ok');
      updateTabButtons(id);
    }
  }

  btnStopAll.disabled = false;
  updateStopAllButton();
});

// --- Saved projects dropdown ---
const savedProjectsDropdown = document.createElement('div');
savedProjectsDropdown.id = 'saved-projects-dropdown';
savedProjectsDropdown.className = 'fixed min-w-[220px] max-w-[340px] p-1.5 bg-overlay border border-border rounded-lg shadow-xl z-[25]';
savedProjectsDropdown.hidden = true;
document.body.appendChild(savedProjectsDropdown);

function saveAllSettings() {
  const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : null;
  api.saveSettings({
    packageManager,
    bookmarks: [...bookmarks],
    savedProjects,
    ...(sidebarWidth != null && sidebarWidth > 0 ? { sidebarWidth: Math.round(sidebarWidth) } : {}),
  });
}

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function isCurrentProjectSaved() {
  if (!projectDir) return false;
  const norm = normalizePath(projectDir);
  return savedProjects.some((p) => normalizePath(p.filePath) === norm);
}

function toggleSaveProject() {
  if (!projectDir) return;
  if (isCurrentProjectSaved()) {
    const norm = normalizePath(projectDir);
    savedProjects = savedProjects.filter((p) => normalizePath(p.filePath) !== norm);
  } else {
    savedProjects.push({ name: projectNameEl.textContent || projectDir, filePath: projectDir });
  }
  saveAllSettings();
  updateProjectButtons();
}

function removeSavedProject(filePath) {
  savedProjects = savedProjects.filter((p) => p.filePath !== filePath);
  saveAllSettings();
  updateProjectButtons();
}

async function openSavedProject(filePath) {
  hideSavedProjectsDropdown();
  const pkgPath = `${filePath.replace(/\\/g, '/').replace(/\/$/, '')}/package.json`;
  const result = await api.openPackagePath(pkgPath);
  if (!result) return;
  if (result.error) {
    alert(`Failed to open project:\n${result.error}`);
    return;
  }
  scripts = result.scripts;
  projectDir = result.projectDir;
  projectNameEl.textContent = result.projectName;
  updateProjectButtons();
  renderScriptList();
}

function updateProjectButtons() {
  const hasProject = !!projectDir;
  const isSaved = isCurrentProjectSaved();

  btnSaveProject.hidden = !hasProject;
  btnSaveProject.classList.toggle('text-yellow', isSaved);
  btnSaveProject.classList.toggle('hover:bg-yellow/10', isSaved);
  btnSaveProject.classList.toggle('text-muted', !isSaved);
  btnSaveProject.classList.toggle('hover:bg-white/10', !isSaved);
  btnSaveProject.title = isSaved ? 'Remove from saved' : 'Save project';
  btnSaveProject.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M3 2h10v12l-5-3.5L3 14V2z"/></svg>`;

  btnSavedProjects.hidden = savedProjects.length === 0;
  btnOpen.classList.toggle('rounded-md', savedProjects.length === 0);
  btnOpen.classList.toggle('rounded-l-md', savedProjects.length > 0);
}

function renderSavedProjectsDropdown() {
  savedProjectsDropdown.replaceChildren();

  if (savedProjects.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'py-2.5 text-muted text-xs text-center';
    hint.textContent = 'No saved projects';
    savedProjectsDropdown.appendChild(hint);
    return;
  }

  for (const proj of savedProjects) {
    const item = document.createElement('div');
    item.className = 'flex items-center w-full border-0 rounded-md bg-transparent text-xs text-left cursor-pointer text-[#cdd6f4]';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'flex-1 py-2 px-2.5 border-0 rounded-md bg-transparent text-[13px] font-mono text-left cursor-pointer truncate text-[#cdd6f4] hover:bg-accent/10';
    nameBtn.textContent = proj.name;
    nameBtn.title = proj.filePath;
    nameBtn.addEventListener('click', () => openSavedProject(proj.filePath));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'flex items-center justify-center w-[22px] h-[22px] border-0 rounded bg-transparent text-muted text-sm cursor-pointer shrink-0 transition-colors duration-[0.12s] hover:bg-red/20 hover:text-red';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSavedProject(proj.filePath);
      renderSavedProjectsDropdown();
      if (savedProjects.length === 0) hideSavedProjectsDropdown();
    });

    item.append(nameBtn, removeBtn);
    savedProjectsDropdown.appendChild(item);
  }
}

function showSavedProjectsDropdown() {
  renderSavedProjectsDropdown();
  savedProjectsDropdown.hidden = false;

  const rect = btnOpen.getBoundingClientRect();
  savedProjectsDropdown.style.top = `${rect.bottom + 4}px`;
  savedProjectsDropdown.style.left = `${rect.left}px`;
}

function hideSavedProjectsDropdown() {
  savedProjectsDropdown.hidden = true;
}

btnSaveProject.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSaveProject();
});

btnSavedProjects.addEventListener('click', (e) => {
  e.stopPropagation();
  if (savedProjectsDropdown.hidden) {
    showSavedProjectsDropdown();
  } else {
    hideSavedProjectsDropdown();
  }
});

document.addEventListener('mousedown', (e) => {
  if (!savedProjectsDropdown.hidden && !savedProjectsDropdown.contains(e.target) && e.target !== btnSavedProjects) {
    hideSavedProjectsDropdown();
  }
});

class PaneGroup {
  constructor() {
    this.id = `pane-${++paneCounter}`;
    this.parent = null;
    this.tabs = new Map();
    this.activeTabId = null;

    this.el = document.createElement('section');
    this.el.className = 'pane-group flex flex-col w-full h-full min-w-0 min-h-0 bg-base border border-transparent';
    this.el.dataset.paneId = this.id;

    this.header = document.createElement('div');
    this.header.className = 'flex items-stretch min-h-9 bg-overlay border-b border-border';

    this.tabBar = document.createElement('div');
    this.tabBar.className = 'pane-tab-bar flex-1 flex overflow-x-auto min-w-0 empty:after:content-["No_tabs"] empty:after:flex empty:after:items-center empty:after:px-3 empty:after:text-muted empty:after:text-xs';

    this.actions = document.createElement('div');
    this.actions.className = 'flex items-center gap-0.5 p-1 border-l border-border';

    this.closePaneBtn = createPaneActionButton('Close pane', `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M4 4l8 8"/><path d="M12 4l-8 8"/>
      </svg>
    `);
    this.closePaneBtn.classList.add('btn-close-pane', 'hover:bg-red/15', 'hover:text-red');

    this.actions.append(this.closePaneBtn);
    this.header.append(this.tabBar, this.actions);

    // Tab bar as drop target (for dropping on empty area)
    this.tabBar.addEventListener('dragover', (event) => {
      if (!draggedTabId) return;
      if (event.target.closest('.tab')) return; // Let tab handle it
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.dropOverlay.classList.remove('grid');
      this.dropOverlay.classList.add('hidden');
      this._activeDropZone = null;
      this.tabBar.classList.add('drag-over-bar');
    });

    this.tabBar.addEventListener('dragleave', (event) => {
      if (!this.tabBar.contains(event.relatedTarget)) {
        this.tabBar.classList.remove('drag-over-bar');
      }
    });

    this.tabBar.addEventListener('drop', (event) => {
      this.tabBar.classList.remove('drag-over-bar');
      if (!draggedTabId) return;
      if (event.target.closest('.tab')) return; // Let tab handle it
      event.preventDefault();

      const srcTab = tabs.get(draggedTabId);
      if (srcTab && srcTab.paneId !== this.id) {
        moveTabToPane(draggedTabId, this);
      }
      // If same pane, dropping on empty area does nothing
    });

    this.body = document.createElement('div');
    this.body.className = 'relative flex-1 min-w-0 min-h-0 bg-base';

    this.emptyHint = document.createElement('div');
    this.emptyHint.className = 'absolute inset-0 flex items-center justify-center text-muted text-[13px]';
    this.emptyHint.textContent = 'This pane is empty.';
    this.body.appendChild(this.emptyHint);

    // Drop zone overlay for drag-and-drop splitting
    this.dropOverlay = document.createElement('div');
    this.dropOverlay.className = 'drop-zone-overlay absolute inset-0 hidden z-10 grid-cols-2 grid-rows-2 gap-1 p-1';
    this.dropOverlay.innerHTML = `
      <div class="drop-zone drop-left rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-start-1 row-[1/-1] [&.active]:bg-accent/10 [&.active]:border-accent/40" data-zone="left"></div>
      <div class="drop-zone drop-right rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-start-2 row-[1/-1] [&.active]:bg-accent/10 [&.active]:border-accent/40" data-zone="right"></div>
      <div class="drop-zone drop-top rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-[1/-1] row-start-1 [&.active]:bg-accent/10 [&.active]:border-accent/40" data-zone="top"></div>
      <div class="drop-zone drop-bottom rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-[1/-1] row-start-2 [&.active]:bg-accent/10 [&.active]:border-accent/40" data-zone="bottom"></div>
    `;
    this.body.appendChild(this.dropOverlay);

    this._activeDropZone = null;

    this.el.addEventListener('dragover', (event) => {
      if (!draggedTabId) return;
      // Don't show drop zones if dragging the only tab in this pane onto itself
      if (draggedSourcePaneId === this.id && this.tabs.size <= 1) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      this.dropOverlay.classList.remove('hidden');
      this.dropOverlay.classList.add('grid');
      const rect = this.body.getBoundingClientRect();
      const zone = getDropZone(event, rect);

      if (zone !== this._activeDropZone) {
        for (const el of this.dropOverlay.querySelectorAll('.drop-zone')) {
          el.classList.toggle('active', el.dataset.zone === zone);
        }
        this._activeDropZone = zone;
      }
    });

    this.el.addEventListener('dragleave', (event) => {
      if (!this.el.contains(event.relatedTarget)) {
        this.dropOverlay.classList.remove('grid');
      this.dropOverlay.classList.add('hidden');
        this._activeDropZone = null;
        for (const el of this.dropOverlay.querySelectorAll('.drop-zone')) {
          el.classList.remove('active');
        }
      }
    });

    this.el.addEventListener('drop', (event) => {
      this.dropOverlay.classList.remove('grid');
      this.dropOverlay.classList.add('hidden');
      const zone = this._activeDropZone;
      this._activeDropZone = null;
      for (const el of this.dropOverlay.querySelectorAll('.drop-zone')) {
        el.classList.remove('active');
      }

      if (!draggedTabId || !zone) return;
      // Already handled by tab element or tab bar drop handlers
      if (event.defaultPrevented) return;
      event.preventDefault();

      const tabId = draggedTabId;
      const sourcePaneId = draggedSourcePaneId;

      const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
      const putFirst = (zone === 'left' || zone === 'top');

      // Split this pane and move the tab into the new pane
      const tab = tabs.get(tabId);
      const sourcePane = tab ? panes.get(tab.paneId) : null;

      // Preserve status dot before removing old tab element
      const statusClass = getTabStatusClass(tab);

      // If dragging within same pane, we need to handle it specially
      if (sourcePaneId === this.id) {
        // Remove tab from this pane first (without collapsing)
        if (sourcePane) {
          sourcePane.tabs.delete(tabId);
          if (tab.tabEl) tab.tabEl.remove();
          tab.wrapper.remove();
          if (sourcePane.activeTabId === tabId) {
            const nextActive = [...sourcePane.tabs.keys()].pop() || null;
            sourcePane.activeTabId = null;
            if (nextActive) sourcePane.switchToTab(nextActive);
          }
          sourcePane.render();
        }
      }

      const newPane = splitPane(this, direction);

      if (putFirst) {
        // Swap children so newPane is first
        const parent = this.parent;
        if (parent instanceof SplitContainer) {
          parent.children = [parent.children[1], parent.children[0]];
          renderLayout();
        }
      }

      if (sourcePaneId === this.id) {
        // Tab was already removed from source, add directly
        tab.paneId = newPane.id;
        tab.wrapper.dataset.paneId = newPane.id;
        tab.tabEl = newPane.createTabElement(tabId, tab.script);
        newPane.tabs.set(tabId, tab);
        updateTabStatus(tabId, statusClass);
        newPane.tabBar.appendChild(tab.tabEl);
        newPane.body.appendChild(tab.wrapper);
        newPane.switchToTab(tabId);
        updateEmptyState();
        scheduleFitVisibleTerminals();
      } else {
        moveTabToPane(tabId, newPane);
      }

      setFocusedPane(newPane.id);
    });

    this.el.append(this.header, this.body);

    const focusPane = () => setFocusedPane(this.id);

    this.el.addEventListener('mousedown', focusPane);
    this.body.addEventListener('mousedown', focusPane);

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
    const showFocus = panes.size > 1 && focusedPaneId === this.id;
    this.el.classList.toggle('border-accent/35', showFocus);
    this.el.classList.toggle('border-transparent', !showFocus);
    this.tabBar.classList.toggle('empty', this.tabs.size === 0);
    this.emptyHint.style.display = this.tabs.size === 0 ? '' : 'none';
    this.closePaneBtn.style.display = this.parent ? '' : 'none';
    this.actions.style.display = this.parent ? '' : 'none';
    return this.el;
  }

  createTabElement(id, name) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab flex items-center gap-2 px-3.5 h-9 text-xs font-mono cursor-pointer border-r border-border whitespace-nowrap transition-colors duration-[0.12s] select-none hover:bg-white/5';
    tabEl.dataset.id = id;
    tabEl.draggable = true;
    tabEl.innerHTML = `
      <span class="status-dot bg-border w-2 h-2 rounded-full shrink-0"></span>
      <span class="tab-name">${name}</span>
      <span class="tab-close flex items-center justify-center w-4.5 h-4.5 rounded text-sm text-muted transition-colors duration-[0.12s] hover:bg-red/20 hover:text-red" title="Close">&times;</span>
    `;

    tabEl.addEventListener('click', (event) => {
      if (event.target.classList.contains('tab-close')) {
        closeTab(id);
        return;
      }

      this.switchToTab(id);
    });

    tabEl.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      tabEl.classList.add('opacity-40');
      this._dragSourceId = id;
      draggedTabId = id;
      draggedSourcePaneId = this.id;
    });

    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('opacity-40');
      this._dragSourceId = null;
      draggedTabId = null;
      draggedSourcePaneId = null;
      for (const tab of this.tabBar.querySelectorAll('.tab')) {
        tab.classList.remove('shadow-[inset_2px_0_0_var(--color-accent)]', 'shadow-[inset_-2px_0_0_var(--color-accent)]');
      }
      // Clean up all drop overlays
      for (const pane of panes.values()) {
        pane.dropOverlay.classList.remove('grid');
        pane.dropOverlay.classList.add('hidden');
        pane._activeDropZone = null;
        for (const el of pane.dropOverlay.querySelectorAll('.drop-zone')) {
          el.classList.remove('active');
        }
      }
    });

    tabEl.addEventListener('dragover', (event) => {
      if (!draggedTabId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      // Hide body drop overlay since we're on the tab bar
      this.dropOverlay.classList.remove('grid');
      this.dropOverlay.classList.add('hidden');
      this._activeDropZone = null;

      // Show drop indicator on left or right half
      const rect = tabEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const isLeft = event.clientX < midX;

      for (const tab of this.tabBar.querySelectorAll('.tab')) {
        tab.classList.remove('shadow-[inset_2px_0_0_var(--color-accent)]', 'shadow-[inset_-2px_0_0_var(--color-accent)]');
      }

      if (tabEl.dataset.id !== draggedTabId) {
        tabEl.classList.add(isLeft ? 'shadow-[inset_2px_0_0_var(--color-accent)]' : 'shadow-[inset_-2px_0_0_var(--color-accent)]');
      }
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('shadow-[inset_2px_0_0_var(--color-accent)]', 'shadow-[inset_-2px_0_0_var(--color-accent)]');
    });

    tabEl.addEventListener('drop', (event) => {
      event.preventDefault();
      const srcId = draggedTabId || event.dataTransfer.getData('text/plain');
      if (!srcId || srcId === id) return;

      const rect = tabEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const insertBefore = event.clientX < midX;

      const srcTab = tabs.get(srcId);
      if (srcTab && srcTab.paneId !== this.id) {
        // Cross-pane: move tab to this pane at the drop position
        moveTabToPane(srcId, this, insertBefore ? id : null);
        if (!insertBefore) {
          // Insert after the target tab
          this.reorderTab(srcId, id, false);
        }
      } else {
        // Same pane: reorder
        this.reorderTab(srcId, id, insertBefore);
      }

      for (const tab of this.tabBar.querySelectorAll('.tab')) {
        tab.classList.remove('shadow-[inset_2px_0_0_var(--color-accent)]', 'shadow-[inset_-2px_0_0_var(--color-accent)]');
      }
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

  reorderTab(draggedId, targetId, insertBefore) {
    if (draggedId === targetId) return;

    const entries = [...this.tabs.entries()];
    const draggedIndex = entries.findIndex(([id]) => id === draggedId);
    const targetIndex = entries.findIndex(([id]) => id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedEntry] = entries.splice(draggedIndex, 1);
    const newTargetIndex = entries.findIndex(([id]) => id === targetId);
    const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;
    entries.splice(insertIndex, 0, draggedEntry);

    this.tabs = new Map(entries);

    // Rebuild tab bar DOM order
    const draggedTabEl = this.tabBar.querySelector(`.tab[data-id="${draggedId}"]`);
    const targetTabEl = this.tabBar.querySelector(`.tab[data-id="${targetId}"]`);
    if (draggedTabEl && targetTabEl) {
      if (insertBefore) {
        this.tabBar.insertBefore(draggedTabEl, targetTabEl);
      } else {
        this.tabBar.insertBefore(draggedTabEl, targetTabEl.nextSibling);
      }
    }
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
      paneTab.wrapper.classList.toggle('hidden', !isActive);
      paneTab.wrapper.classList.toggle('flex', isActive);
      if (paneTab.tabEl) {
        paneTab.tabEl.classList.toggle('bg-base', isActive);
        paneTab.tabEl.classList.toggle('text-[#cdd6f4]', isActive);
        paneTab.tabEl.classList.toggle('text-muted', !isActive);
      }
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
      tab.wrapper.classList.toggle('hidden', !isActive);
      tab.wrapper.classList.toggle('flex', isActive);
      if (tab.tabEl) {
        tab.tabEl.classList.toggle('bg-base', isActive);
        tab.tabEl.classList.toggle('text-[#cdd6f4]', isActive);
        tab.tabEl.classList.toggle('text-muted', !isActive);
      }
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
    this.el.className = `split-container flex w-full h-full min-w-0 min-h-0 ${direction === 'horizontal' ? 'flex-row' : 'flex-col'}`;
  }

  render() {
    this.el.className = `split-container flex w-full h-full min-w-0 min-h-0 ${this.direction === 'horizontal' ? 'flex-row' : 'flex-col'}`;

    const firstWrapper = document.createElement('div');
    firstWrapper.className = 'split-child flex-[0_1_50%] min-w-0 min-h-0 overflow-hidden';
    firstWrapper.appendChild(this.children[0].render());

    const secondWrapper = document.createElement('div');
    secondWrapper.className = 'split-child flex-[0_1_50%] min-w-0 min-h-0 overflow-hidden';
    secondWrapper.appendChild(this.children[1].render());

    this.childWrappers = [firstWrapper, secondWrapper];
    this.applySizes();

    const gutter = document.createElement('div');
    gutter.className = `split-gutter relative shrink-0 bg-[rgba(49,50,68,0.9)] z-[2] after:absolute after:inset-[1px] after:bg-accent/8 after:opacity-0 after:transition-opacity after:duration-[0.12s] hover:after:opacity-100 ${this.direction === 'horizontal' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}`;
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
  button.className = 'pane-action-btn inline-flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-colors duration-[0.12s] hover:bg-white/10 hover:text-[#cdd6f4]';
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

function getTabStatusClass(tab) {
  if (!tab?.tabEl) return 'idle';
  const dot = tab.tabEl.querySelector('.status-dot');
  if (!dot) return 'idle';
  if (dot.classList.contains('bg-green')) return 'running';
  if (dot.classList.contains('bg-muted')) return 'exited-ok';
  if (dot.classList.contains('bg-red')) return 'exited-fail';
  return 'idle';
}

function moveTabToPane(tabId, targetPane, insertBeforeTabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  const sourcePane = panes.get(tab.paneId);
  if (!sourcePane || sourcePane === targetPane) {
    // Same pane — just reorder if needed
    if (insertBeforeTabId && sourcePane) {
      sourcePane.reorderTab(tabId, insertBeforeTabId, true);
    }
    return;
  }

  // Preserve status dot state before removing old tab element
  const statusClass = getTabStatusClass(tab);

  // Remove from source pane without disposing the terminal
  sourcePane.tabs.delete(tabId);
  if (tab.tabEl) tab.tabEl.remove();
  tab.wrapper.remove();

  if (sourcePane.activeTabId === tabId) {
    const nextActive = [...sourcePane.tabs.keys()].pop() || null;
    sourcePane.activeTabId = null;
    if (nextActive) sourcePane.switchToTab(nextActive);
  }
  sourcePane.render();

  // Add to target pane
  tab.paneId = targetPane.id;
  tab.wrapper.dataset.paneId = targetPane.id;
  tab.tabEl = targetPane.createTabElement(tabId, tab.script);
  // Restore status dot state
  const dot = tab.tabEl.querySelector('.status-dot');
  if (dot) dot.className = `status-dot ${statusClass}`;

  if (insertBeforeTabId) {
    // Insert before a specific tab
    const entries = [...targetPane.tabs.entries()];
    const targetIndex = entries.findIndex(([id]) => id === insertBeforeTabId);
    if (targetIndex !== -1) {
      entries.splice(targetIndex, 0, [tabId, tab]);
      targetPane.tabs = new Map(entries);
      const targetTabEl = targetPane.tabBar.querySelector(`.tab[data-id="${insertBeforeTabId}"]`);
      if (targetTabEl) {
        targetPane.tabBar.insertBefore(tab.tabEl, targetTabEl);
      } else {
        targetPane.tabBar.appendChild(tab.tabEl);
      }
    } else {
      targetPane.tabs.set(tabId, tab);
      targetPane.tabBar.appendChild(tab.tabEl);
    }
  } else {
    targetPane.tabs.set(tabId, tab);
    targetPane.tabBar.appendChild(tab.tabEl);
  }

  targetPane.body.appendChild(tab.wrapper);
  targetPane.switchToTab(tabId);
  updateEmptyState();

  // Collapse source pane if empty
  collapsePaneIfPossible(sourcePane);
  scheduleFitVisibleTerminals();
}

function getDropZone(event, rect) {
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  // Determine closest edge if within the edge threshold
  const edges = [
    { zone: 'left', dist: x },
    { zone: 'right', dist: 1 - x },
    { zone: 'top', dist: y },
    { zone: 'bottom', dist: 1 - y },
  ];
  const closest = edges.reduce((a, b) => (a.dist < b.dist ? a : b));
  return closest.zone;
}

function showContextMenu(x, y, items) {
  contextMenu.replaceChildren();

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-item block w-full py-2 px-2.5 border-0 rounded-md bg-transparent text-[#cdd6f4] text-xs text-left cursor-pointer hover:bg-accent/10';
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

function toggleBookmark(name) {
  if (bookmarks.has(name)) {
    bookmarks.delete(name);
  } else {
    bookmarks.add(name);
  }
  saveAllSettings();
  renderScriptList(name);
}

function renderScriptList(animateScript) {
  const scriptNames = Object.keys(scripts);
  const sorted = [
    ...scriptNames.filter((n) => bookmarks.has(n)),
    ...scriptNames.filter((n) => !bookmarks.has(n)),
  ];

  scriptListEl.innerHTML = '';

  for (const name of sorted) {
    const li = document.createElement('li');
    li.className = 'script-item group flex items-center gap-2 py-1.5 pr-1 pl-2.5 rounded-md cursor-pointer text-[13px] font-mono transition-colors duration-[0.12s] text-[#cdd6f4] mb-0.5 hover:bg-accent/10';
    li.title = scripts[name];
    if (bookmarks.has(name)) li.classList.add('bookmarked', 'border-l-2', 'border-l-yellow', 'pl-2');
    if (animateScript === name) li.classList.add('animate-bookmark-slide-in');

    const icon = document.createElement('span');
    icon.className = 'script-icon flex items-center justify-center text-accent opacity-80';
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'script-name flex-1 min-w-0 truncate';
    nameSpan.textContent = name;

    const actions = document.createElement('div');
    actions.className = 'script-actions flex items-center gap-0.5 max-w-0 overflow-hidden shrink-0 transition-[max-width] duration-200 ease-out -ml-1 group-hover:max-w-[56px]';

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'script-bookmark-btn flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent cursor-pointer opacity-0 transition-all duration-[0.12s] text-muted hover:text-yellow hover:bg-yellow/10 group-hover:opacity-100';
    if (bookmarks.has(name)) bookmarkBtn.classList.add('active', 'text-yellow');
    bookmarkBtn.title = bookmarks.has(name) ? 'Remove bookmark' : 'Bookmark';
    bookmarkBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="${bookmarks.has(name) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M3 2h10v12l-5-3.5L3 14V2z"/></svg>`;

    bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(name);
    });

    const playBtn = document.createElement('button');
    playBtn.className = 'script-play-btn flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent cursor-pointer opacity-0 transition-all duration-[0.12s] text-green hover:bg-green/15 group-hover:opacity-100';
    playBtn.title = 'Run Script';
    playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>`;

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openScriptTab(name);
    });

    actions.append(bookmarkBtn, playBtn);
    li.append(icon, nameSpan, actions);

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
  wrapper.className = 'terminal-wrapper absolute inset-0 py-2 px-2 pb-2.5 flex-col min-w-0 min-h-0 hidden';
  wrapper.innerHTML = `
    <div class="terminal-controls flex gap-0.5 py-1 px-2 justify-end">
      <button class="ctrl-btn btn-start flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-green hover:bg-green/10" data-action="start" title="Start">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2.5v11l9-5.5z"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-rerun flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-accent hover:bg-accent/10" data-action="rerun" title="Re-run">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 2v5h5"/><path d="M3.5 10a5 5 0 1 0 1-6.5L1 7"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-stop flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-red hover:bg-red/10" data-action="stop" title="Stop">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="10" height="10" rx="1.5"/>
        </svg>
      </button>
      <button class="ctrl-btn btn-clear flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-yellow hover:bg-yellow/10" data-action="clear" title="Clear">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4h12"/><path d="M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4"/><path d="M12.5 4v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V4"/>
        </svg>
      </button>
    </div>
    <div class="term-box flex-1 min-h-0 border border-border rounded-lg overflow-hidden"></div>
  `;

  wrapper.addEventListener('mousedown', () => {
    const paneId = wrapper.dataset.paneId;
    if (paneId) setFocusedPane(paneId);
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && e.key === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    return true;
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
    if (!existingTab.running && !existingTab.busy) startScript(existingId);
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
  startScript(id);
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
  if (busyBtn) {
    busyBtn.classList.toggle('cursor-wait', isBusy);
    busyBtn.classList.toggle('pointer-events-none', isBusy);
    const svg = busyBtn.querySelector('svg');
    if (svg) svg.classList.toggle('animate-[spin_0.65s_linear_infinite]', isBusy);
  }
  updateTabButtons(id);
}

function updateTabStatus(id, statusClass) {
  const tab = tabs.get(id);
  if (!tab?.tabEl) return;
  const statusDot = tab.tabEl.querySelector('.status-dot');
  if (statusDot) {
    statusDot.className = 'status-dot w-2 h-2 rounded-full shrink-0';
    if (statusClass === 'idle') statusDot.classList.add('bg-border');
    if (statusClass === 'running') statusDot.classList.add('bg-green', 'shadow-[0_0_6px_rgba(166,227,161,0.4)]');
    if (statusClass === 'exited-ok') statusDot.classList.add('bg-muted');
    if (statusClass === 'exited-fail') statusDot.classList.add('bg-red');
  }
}

function startScript(id) {
  const tab = tabs.get(id);
  if (!tab || tab.running || tab.busy) return;

  tab.running = true;
  updateTabStatus(id, 'running');
  updateTabButtons(id);

  tab.term.writeln(`\x1b[90m$ ${packageManager} run ${tab.script}\x1b[0m\r\n`);
  api.runScript(id, tab.script, projectDir);
  updateStopAllButton();
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
  updateStopAllButton();
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
  tab.term.writeln(`\x1b[90m$ ${packageManager} run ${tab.script}\x1b[0m\r\n`);
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
  updateProjectButtons();
  renderScriptList();
});

document.addEventListener('mousedown', (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) {
    hideContextMenu();
  }
});

window.addEventListener('blur', hideContextMenu);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
    hideSettings();
  }
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
  updateStopAllButton();
});

api.onScriptError(({ id, data }) => {
  const tab = tabs.get(id);
  if (tab) tab.term.write(`\x1b[31m${data}\x1b[0m`);
});

// --- Auto-resume last session on startup ---
(async () => {
  ensureRootPane();

  const settings = await api.getSettings();
  if (settings?.packageManager) packageManager = settings.packageManager;
  if (settings?.bookmarks) bookmarks = new Set(settings.bookmarks);
  if (settings?.savedProjects) savedProjects = settings.savedProjects;
  if (settings?.sidebarWidth != null && settings.sidebarWidth >= SIDEBAR_MIN) {
    sidebarEl.style.width = `${settings.sidebarWidth}px`;
  }

  const result = await api.loadLastSession();
  if (!result || result.error) {
    updateProjectButtons();
    return;
  }
  scripts = result.scripts;
  projectDir = result.projectDir;
  projectNameEl.textContent = result.projectName;
  updateProjectButtons();
  renderScriptList();
})();

// --- Resize handling ---
window.addEventListener('resize', scheduleFitVisibleTerminals);
