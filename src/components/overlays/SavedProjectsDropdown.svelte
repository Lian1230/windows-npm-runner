<script>
  import { projectState, savedProjectsDropdownState } from '../../stores/app.svelte.js';

  let dropdownEl = $state(null);

  function close() {
    savedProjectsDropdownState.visible = false;
  }

  function remove(filePath) {
    projectState.savedProjects = projectState.savedProjects.filter((p) => p.filePath !== filePath);
    window.saveAllSettings?.();
    if (projectState.savedProjects.length === 0) close();
  }

  async function openProject(filePath) {
    close();
    const pkgPath = `${filePath.replace(/\\/g, '/').replace(/\/$/, '')}/package.json`;
    const result = await window.api.openPackagePath(pkgPath);
    if (!result) return;
    if (result.error) { alert(`Failed to open project:\n${result.error}`); return; }
    projectState.scripts = result.scripts;
    projectState.dir = result.projectDir;
    projectState.name = result.projectName;
    window.syncBookmarksForCurrentProject?.();
    window.saveAllSettings?.();
  }

  let style = $derived(
    savedProjectsDropdownState.anchorRect
      ? `top: ${savedProjectsDropdownState.anchorRect.bottom + 4}px; left: ${savedProjectsDropdownState.anchorRect.left}px;`
      : ''
  );
</script>

<svelte:window
  onmousedown={(e) => {
    if (
      savedProjectsDropdownState.visible &&
      dropdownEl &&
      !dropdownEl.contains(e.target) &&
      !e.target.closest('#btn-saved-projects')
    ) close();
  }}
/>

{#if savedProjectsDropdownState.visible}
  <div
    bind:this={dropdownEl}
    id="saved-projects-dropdown"
    class="fixed min-w-[220px] max-w-[340px] p-1.5 bg-overlay border border-border rounded-lg shadow-xl z-[25]"
    {style}
    role="menu"
  >
    {#if projectState.savedProjects.length === 0}
      <div class="py-2.5 text-muted text-xs text-center">No saved projects</div>
    {:else}
      {#each projectState.savedProjects as proj (proj.filePath)}
        <div class="flex items-center w-full border-0 rounded-md bg-transparent text-xs text-left cursor-pointer text-[#cdd6f4]">
          <button
            type="button"
            class="flex-1 py-2 px-2.5 border-0 rounded-md bg-transparent text-[13px] font-mono text-left cursor-pointer truncate text-[#cdd6f4] hover:bg-accent/10"
            title={proj.filePath}
            onclick={() => openProject(proj.filePath)}
          >
            {proj.name}
          </button>
          <button
            type="button"
            class="flex items-center justify-center w-[22px] h-[22px] border-0 rounded bg-transparent text-muted text-sm cursor-pointer shrink-0 transition-colors duration-[0.12s] hover:bg-red/20 hover:text-red"
            title="Remove"
            onclick={(e) => { e.stopPropagation(); remove(proj.filePath); }}
          >
            &times;
          </button>
        </div>
      {/each}
    {/if}
  </div>
{/if}
