<script>
  import { projectState, settingsModalState, savedProjectsDropdownState } from '../../stores/app.svelte.js';
  import { tabsState } from '../../stores/tabs.svelte.js';

  let openBtnEl = $state(null);

  function normalizePath(p) {
    return p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  }

  function isCurrentProjectSaved() {
    if (!projectState.dir) return false;
    const norm = normalizePath(projectState.dir);
    return projectState.savedProjects.some((p) => normalizePath(p.filePath) === norm);
  }

  const isSaved = $derived(isCurrentProjectSaved());

  async function openProject() {
    const result = await window.api.openPackageJson();
    if (!result) return;
    if (result.error) { alert(`Failed to parse package.json:\n${result.error}`); return; }
    projectState.scripts = result.scripts;
    projectState.dir = result.projectDir;
    projectState.name = result.projectName;
    window.syncBookmarksForCurrentProject?.();
    window.saveAllSettings?.();
  }

  function toggleSaveProject() {
    if (!projectState.dir) return;
    if (isSaved) {
      const norm = normalizePath(projectState.dir);
      projectState.savedProjects = projectState.savedProjects.filter(
        (p) => normalizePath(p.filePath) !== norm
      );
    } else {
      projectState.savedProjects = [
        ...projectState.savedProjects,
        { name: projectState.name, filePath: projectState.dir },
      ];
    }
    window.saveAllSettings?.();
  }

  function toggleSavedDropdown(e) {
    e.stopPropagation();
    if (savedProjectsDropdownState.visible) {
      savedProjectsDropdownState.visible = false;
    } else {
      const rect = openBtnEl.getBoundingClientRect();
      savedProjectsDropdownState.anchorRect = { bottom: rect.bottom, left: rect.left };
      savedProjectsDropdownState.visible = true;
    }
  }

  let stopping = $state(false);

  async function stopAll() {
    stopping = true;
    await window.api.stopAllScripts();
    window.onStopAllComplete?.();
    stopping = false;
  }

  const hasAnyTabs = $derived(Object.keys(tabsState.tabs).length > 0);

  function clearAll() {
    window.clearAllTerminals?.();
  }

  let killPortOpen = $state(false);
  let killPortValue = $state('');
  let killPortBusy = $state(false);
  let killPortMsg = $state('');
  let killPortInputEl = $state(null);
  let killPortWrapperEl = $state(null);

  function toggleKillPort() {
    killPortOpen = !killPortOpen;
    killPortMsg = '';
    if (killPortOpen) {
      killPortValue = '';
      setTimeout(() => killPortInputEl?.focus(), 0);
      setTimeout(() => document.addEventListener('mousedown', onClickOutsideKillPort), 0);
    } else {
      document.removeEventListener('mousedown', onClickOutsideKillPort);
    }
  }

  function onClickOutsideKillPort(e) {
    if (killPortWrapperEl && !killPortWrapperEl.contains(e.target)) {
      killPortOpen = false;
      document.removeEventListener('mousedown', onClickOutsideKillPort);
    }
  }

  async function doKillPort() {
    const port = parseInt(killPortValue, 10);
    if (!port || port < 1 || port > 65535) {
      killPortMsg = 'Invalid port';
      return;
    }
    killPortBusy = true;
    killPortMsg = '';
    const result = await window.api.killPort(port);
    killPortBusy = false;
    if (result.ok) {
      killPortMsg = `Killed port ${port}`;
      setTimeout(() => { killPortOpen = false; killPortMsg = ''; }, 1200);
    } else {
      killPortMsg = result.error;
    }
  }
</script>

<header
  id="top-bar"
  class="flex items-center gap-3 px-4 py-2 bg-overlay border-b border-border [-webkit-app-region:drag]"
>
  <!-- Open / Saved Projects button group -->
  <div class="open-button-group flex items-stretch [-webkit-app-region:no-drag]">
    <button
      bind:this={openBtnEl}
      id="btn-open"
      type="button"
      class="px-3.5 py-1.5 bg-accent text-overlay border-0 text-[13px] font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-[0.85] [-webkit-app-region:no-drag]"
      class:rounded-md={projectState.savedProjects.length === 0}
      class:rounded-l-md={projectState.savedProjects.length > 0}
      onclick={openProject}
    >
      Open
    </button>
    {#if projectState.savedProjects.length > 0}
      <button
        id="btn-saved-projects"
        type="button"
        title="Saved projects"
        class="flex items-center justify-center w-7 p-0 border-0 rounded-r-md bg-accent text-overlay cursor-pointer transition-opacity duration-150 hover:opacity-[0.85] border-l border-black/20 [-webkit-app-region:no-drag] shrink-0"
        onclick={toggleSavedDropdown}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 1l4 4 4-4"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Project info -->
  <div id="project-info" class="flex-1 flex items-center gap-1.5 min-w-0 [-webkit-app-region:no-drag]">
    <span id="project-name" class="text-[13px] text-muted truncate">{projectState.name}</span>
    {#if projectState.dir}
      <button
        id="btn-save-project"
        type="button"
        title={isSaved ? 'Remove from saved' : 'Save project'}
        class="flex items-center justify-center w-[26px] h-[26px] p-0 border-0 rounded-md bg-transparent cursor-pointer shrink-0 transition-colors duration-[0.12s] {isSaved ? 'text-orange-400 hover:bg-orange-400/10' : 'text-muted hover:bg-white/10'}"
        onclick={(e) => { e.stopPropagation(); toggleSaveProject(); }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5">
          <path d="M3 2h10v12l-5-3.5L3 14V2z"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Stop All -->
  {#if tabsState.hasAnyRunning}
    <button
      id="btn-stop-all"
      type="button"
      title="Stop all"
      disabled={stopping}
      class="flex items-center justify-center w-8 h-8 border-0 rounded-md bg-transparent text-red cursor-pointer transition-colors duration-[0.12s] hover:bg-red/15 disabled:opacity-40 disabled:cursor-wait [-webkit-app-region:no-drag]"
      onclick={stopAll}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2"/>
      </svg>
    </button>
  {/if}

  <!-- Clean All -->
  {#if hasAnyTabs}
    <button
      id="btn-clear-all"
      type="button"
      title="Clear all logs"
      class="flex items-center justify-center w-8 h-8 border-0 rounded-md bg-transparent text-yellow cursor-pointer transition-colors duration-[0.12s] hover:bg-yellow/15 [-webkit-app-region:no-drag]"
      onclick={clearAll}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4h12"/><path d="M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4"/><path d="M12.5 4v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V4"/>
      </svg>
    </button>
  {/if}

  <!-- Kill Port -->
  <div bind:this={killPortWrapperEl} class="relative [-webkit-app-region:no-drag]">
    <button
      id="btn-kill-port"
      type="button"
      title="Kill port"
      class="flex items-center justify-center w-8 h-8 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-colors duration-[0.12s] hover:text-sapphire hover:bg-sapphire/15"
      onclick={toggleKillPort}
    >
      <svg width="18" height="18" viewBox="0 0 1024 1024" fill="currentColor">
        <path d="M368 416a112 112 0 1 0 0 224 112 112 0 0 0 0-224z m0 160a48 48 0 1 1 0-96 48 48 0 0 1 0 96z m288-160a112 112 0 1 0 0 224 112 112 0 0 0 0-224z m0 160a48 48 0 1 1 0-96 48 48 0 0 1 0 96zM512 64C282.592 64 96 243.424 96 464c0 136.384 73.088 264 192 337.12V864a64 64 0 0 0 64 64h320a64 64 0 0 0 64-64v-62.88c118.912-73.12 192-200.736 192-337.12C928 243.424 741.408 64 512 64z m176.48 690.752a32 32 0 0 0-16.48 28V864h-64v-96a32 32 0 0 0-64 0v96h-64v-96a32 32 0 0 0-64 0v96h-64v-81.248a32 32 0 0 0-16.48-28C227.232 694.752 160 583.36 160 464 160 278.72 317.92 128 512 128s352 150.72 352 336c0 119.328-67.232 230.752-175.52 290.752z"/>
      </svg>
    </button>
    {#if killPortOpen}
      <div class="absolute right-0 top-full mt-2 bg-surface border border-border rounded-lg shadow-lg p-3 z-50 w-52">
        <label class="text-[11px] text-muted mb-1.5 block">Kill process on port</label>
        <form class="flex gap-1.5" onsubmit={(e) => { e.preventDefault(); doKillPort(); }}>
          <input
            bind:this={killPortInputEl}
            bind:value={killPortValue}
            type="number"
            min="1"
            max="65535"
            placeholder="3000"
            disabled={killPortBusy}
            class="flex-1 min-w-0 px-2 py-1 bg-base border border-border rounded-md text-[13px] text-[#cdd6f4] outline-none focus:border-accent placeholder:text-muted/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="submit"
            disabled={killPortBusy}
            class="px-2.5 py-1 bg-red text-overlay border-0 rounded-md text-[12px] font-semibold cursor-pointer hover:opacity-85 disabled:opacity-40 disabled:cursor-wait"
          >
            Kill
          </button>
        </form>
        {#if killPortMsg}
          <p class="text-[11px] mt-1.5 {killPortMsg.startsWith('Killed') ? 'text-green' : 'text-red'}">{killPortMsg}</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Settings -->
  <button
    id="btn-settings"
    type="button"
    title="Settings"
    class="flex items-center justify-center w-8 h-8 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-colors duration-[0.12s] hover:bg-white/10 hover:text-[#cdd6f4] [-webkit-app-region:no-drag]"
    onclick={() => { settingsModalState.visible = true; }}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  </button>
</header>
