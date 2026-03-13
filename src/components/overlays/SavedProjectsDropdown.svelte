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

  let draggedFilePath = $state(null);
  /** @type {{ filePath: string, position: 'above' | 'below' } | null} */
  let dropIndicator = $state(null);

  function onDragStart(e, filePath) {
    draggedFilePath = filePath;
    e.dataTransfer.setData('text/plain', filePath);
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('.saved-proj-row')?.classList.add('opacity-50');
  }

  function onDragEnd(e) {
    draggedFilePath = null;
    dropIndicator = null;
    e.target.closest('.saved-proj-row')?.classList.remove('opacity-50');
  }

  function onDragOver(e, filePath) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedFilePath && draggedFilePath !== filePath) {
      const row = e.currentTarget;
      const position = e.offsetY < row.offsetHeight / 2 ? 'above' : 'below';
      dropIndicator = { filePath, position };
    }
  }

  function onDragLeave(e, filePath) {
    if (!e.currentTarget.contains(e.relatedTarget)) dropIndicator = null;
  }

  function onDrop(e, targetFilePath) {
    e.preventDefault();
    const sourceFilePath = e.dataTransfer.getData('text/plain');
    if (!sourceFilePath || sourceFilePath === targetFilePath) {
      dropIndicator = null;
      return;
    }
    const projects = projectState.savedProjects;
    const fromIndex = projects.findIndex((p) => p.filePath === sourceFilePath);
    const toIndex = projects.findIndex((p) => p.filePath === targetFilePath);
    if (fromIndex === -1 || toIndex === -1) {
      dropIndicator = null;
      return;
    }
    let insertIndex = dropIndicator?.filePath === targetFilePath && dropIndicator?.position === 'below'
      ? toIndex + 1
      : toIndex;
    dropIndicator = null;
    const next = [...projects];
    const [removed] = next.splice(fromIndex, 1);
    const adjustedIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    next.splice(adjustedIndex, 0, removed);
    projectState.savedProjects = next;
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

<style>
  .insertion-line {
    height: 0;
    border-top: 2px solid var(--color-accent);
    margin: -1px 0;
    flex-shrink: 0;
  }
</style>

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
        {#if dropIndicator?.filePath === proj.filePath && dropIndicator?.position === 'above'}
          <div class="insertion-line"></div>
        {/if}
        <div
          class="saved-proj-row flex items-center w-full border-0 rounded-md bg-transparent text-xs text-left text-[#cdd6f4] transition-[background-color,box-shadow] duration-150 cursor-pointer"
          role="group"
          aria-label="Saved project"
          title="Drag to reorder, click to open"
          draggable="true"
          ondragstart={(e) => onDragStart(e, proj.filePath)}
          ondragend={onDragEnd}
          ondragover={(e) => onDragOver(e, proj.filePath)}
          ondragleave={(e) => onDragLeave(e, proj.filePath)}
          ondrop={(e) => onDrop(e, proj.filePath)}
        >
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
            draggable="false"
            class="flex items-center justify-center w-[22px] h-[22px] border-0 rounded bg-transparent text-muted text-sm cursor-pointer shrink-0 transition-colors duration-[0.12s] hover:bg-red/20 hover:text-red"
            title="Remove"
            onclick={(e) => { e.stopPropagation(); remove(proj.filePath); }}
          >
            &times;
          </button>
        </div>
        {#if dropIndicator?.filePath === proj.filePath && dropIndicator?.position === 'below'}
          <div class="insertion-line"></div>
        {/if}
      {/each}
    {/if}
  </div>
{/if}
