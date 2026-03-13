<script>
  import { flip } from 'svelte/animate';
  import { projectState } from '../../stores/app.svelte.js';
  import ScriptItem from './ScriptItem.svelte';

  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX_PERCENT = 0.5;
  const FLIP_DURATION_MS = 260;

  let { initialWidth = 220 } = $props();
  // svelte-ignore state_referenced_locally
  let sidebarWidth = $state(initialWidth);

  // Sync when settings are loaded after mount (happens once on startup).
  $effect(() => { sidebarWidth = initialWidth; });

  // Expose sidebar width getter for saveAllSettings in renderer.js.
  window.getSidebarWidth = () => sidebarWidth;

  const sortedScripts = $derived(() => {
    const names = Object.keys(projectState.scripts);
    return [
      ...names.filter((n) => projectState.bookmarks.has(n)),
      ...names.filter((n) => !projectState.bookmarks.has(n)),
    ];
  });

  /** Svelte action: drag-to-resize the sidebar. */
  function resizable(node) {
    const handle = node.nextElementSibling; // the resize handle div
    if (!handle) return;

    let startX = 0;
    let startWidth = 0;

    function onMove(e) {
      const appEl = document.getElementById('app');
      const appRect = appEl ? appEl.getBoundingClientRect() : { width: window.innerWidth };
      const maxPx = Math.floor(appRect.width * SIDEBAR_MAX_PERCENT);
      let w = startWidth + (e.clientX - startX);
      w = Math.max(SIDEBAR_MIN, Math.min(maxPx, w));
      sidebarWidth = w;
    }

    function onUp() {
      handle.classList.remove('bg-accent/20');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.saveAllSettings?.();
    }

    function onDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startWidth = node.getBoundingClientRect().width;
      handle.classList.add('bg-accent/20');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    handle.addEventListener('mousedown', onDown);
    return { destroy() { handle.removeEventListener('mousedown', onDown); } };
  }
</script>

<aside
  id="sidebar"
  use:resizable
  style="width: {sidebarWidth}px;"
  class="min-w-[180px] max-w-[50%] shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden"
>
  <div id="sidebar-header" class="pt-3 px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
    Scripts
  </div>
  <div id="script-list" role="listbox" aria-label="Scripts" class="overflow-y-auto flex-1 py-1 px-2">
    {#each sortedScripts() as name (name)}
      <div animate:flip={{ duration: 260 }}>
        <ScriptItem
          {name}
          command={projectState.scripts[name]}
        />
      </div>
    {/each}
  </div>
</aside>

<!-- Resize handle -->
<div
  id="sidebar-resize-handle"
  class="w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors duration-[0.12s] hover:bg-accent/20 relative"
  title="Drag to resize sidebar"
>
  <div class="absolute left-0.5 top-0 bottom-0 w-0.5 bg-border pointer-events-none"></div>
</div>
