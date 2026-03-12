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
        class="flex items-center justify-center w-[26px] h-[26px] p-0 border-0 rounded-md bg-transparent cursor-pointer shrink-0 transition-colors duration-[0.12s] {isSaved ? 'text-yellow hover:bg-yellow/10' : 'text-muted hover:bg-white/10'}"
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
