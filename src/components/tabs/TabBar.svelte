<script>
  import { tabsState } from '../../stores/tabs.svelte.js';
  import Tab from './Tab.svelte';

  let { paneId } = $props();

  const tabIds = $derived(tabsState.orderByPane[paneId] ?? []);
  const isEmpty = $derived(tabIds.length === 0);
  const showActions = $derived(!!tabsState.paneHasParent[paneId]);

  let barDragOver = $state(false);

  function handleBarDragOver(e) {
    if (!tabsState.drag.tabId) return;
    if (e.target.closest('[data-tab-id]')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    window.hidePaneDropOverlay?.(paneId);
    barDragOver = true;
  }

  function handleBarDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      barDragOver = false;
    }
  }

  function handleBarDrop(e) {
    barDragOver = false;
    if (!tabsState.drag.tabId) return;
    if (e.target.closest('[data-tab-id]')) return;
    e.preventDefault();
    const { tabId, sourcePaneId } = tabsState.drag;
    if (sourcePaneId !== paneId) {
      window.moveTabToPane?.(tabId, paneId, null);
    }
  }
</script>

<div class="flex items-stretch min-h-9 bg-overlay border-b border-border">
  <!-- Tab strip -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pane-tab-bar flex-1 flex overflow-x-auto min-w-0 pl-2"
    class:drag-over-bar={barDragOver}
    ondragover={handleBarDragOver}
    ondragleave={handleBarDragLeave}
    ondrop={handleBarDrop}
  >
    {#each tabIds as tabId (tabId)}
      <Tab {tabId} {paneId} />
    {/each}
    {#if isEmpty}
      <span class="flex items-center px-3 text-muted text-xs">No tabs</span>
    {/if}
  </div>

  <!-- Close pane action — only shown when the pane has a parent (is in a split) -->
  {#if showActions}
    <div class="flex items-center gap-0.5 p-1 border-l border-border">
      <button
        type="button"
        class="inline-flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-colors duration-[0.12s] hover:bg-red/15 hover:text-red"
        title="Close pane"
        onclick={() => window.closePane?.(paneId)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 4l8 8"/><path d="M12 4l-8 8"/>
        </svg>
      </button>
    </div>
  {/if}
</div>
