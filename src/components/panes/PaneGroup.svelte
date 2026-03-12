<script>
  import { tabsState } from '../../stores/tabs.svelte.js';
  import { panesState, setFocusedPane, swapSplitOrderForPane } from '../../stores/panes.svelte.js';
  import TabBar from '../tabs/TabBar.svelte';
  import TerminalWrapper from '../tabs/TerminalWrapper.svelte';

  let { paneId } = $props();

  const tabIds = $derived(tabsState.orderByPane[paneId] ?? []);
  const isEmpty = $derived(tabIds.length === 0);
  const paneIds = $derived(
    (function getIds(node) {
      if (!node) return [];
      if (node.type === 'pane') return [node.id];
      return [...getIds(node.children[0]), ...getIds(node.children[1])];
    })(panesState.root)
  );
  const showFocus =
    $derived(paneIds.length > 1 && panesState.focusedPaneId === paneId);

  let bodyEl = $state(null);
  let activeDropZone = $state(null);
  let showDropOverlay = $state(false);

  function getDropZone(event) {
    if (!bodyEl) return null;
    const rect = bodyEl.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const edges = [
      { zone: 'left', dist: x },
      { zone: 'right', dist: 1 - x },
      { zone: 'top', dist: y },
      { zone: 'bottom', dist: 1 - y },
    ];
    return edges.reduce((a, b) => (a.dist < b.dist ? a : b)).zone;
  }

  function handleDragover(e) {
    if (!tabsState.drag.tabId) return;
    if (tabsState.drag.sourcePaneId === paneId && tabIds.length <= 1) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    showDropOverlay = true;
    activeDropZone = getDropZone(e);
  }

  function handleDragleave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      showDropOverlay = false;
      activeDropZone = null;
    }
  }

  function handleDrop(e) {
    showDropOverlay = false;
    const zone = activeDropZone;
    activeDropZone = null;
    if (!tabsState.drag.tabId || !zone) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    window.handleDropOnSplitZone?.(
      tabsState.drag.tabId,
      tabsState.drag.sourcePaneId,
      paneId,
      zone
    );
  }

  function handleMousedown() {
    setFocusedPane(paneId);
  }

  $effect(() => {
    if (!bodyEl) return;
    const ro = new ResizeObserver(() => window.scheduleFitVisibleTerminals?.());
    ro.observe(bodyEl);
    return () => ro.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="pane-group flex flex-col w-full h-full min-w-0 min-h-0 bg-base border {showFocus ? 'border-accent/35' : 'border-transparent'}"
  data-pane-id={paneId}
  onmousedown={handleMousedown}
>
  <TabBar {paneId} />

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={bodyEl}
    class="relative flex-1 min-w-0 min-h-0 bg-base"
    onmousedown={handleMousedown}
    ondragover={handleDragover}
    ondragleave={handleDragleave}
    ondrop={handleDrop}
  >
    {#if isEmpty}
      <div
        class="absolute inset-0 flex items-center justify-center text-muted text-[13px]"
      >
        This pane is empty.
      </div>
    {/if}

    <!-- Drop zone overlay for split -->
    <div
      class="drop-zone-overlay absolute inset-0 z-10 grid-cols-2 grid-rows-2 gap-1 p-1 {showDropOverlay ? 'grid' : 'hidden'}"
    >
      <div
        class="drop-zone drop-left rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-start-1 row-[1/-1] [&.active]:bg-accent/10 [&.active]:border-accent/40"
        class:active={activeDropZone === 'left'}
        data-zone="left"
      ></div>
      <div
        class="drop-zone drop-right rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-start-2 row-[1/-1] [&.active]:bg-accent/10 [&.active]:border-accent/40"
        class:active={activeDropZone === 'right'}
        data-zone="right"
      ></div>
      <div
        class="drop-zone drop-top rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-[1/-1] row-start-1 [&.active]:bg-accent/10 [&.active]:border-accent/40"
        class:active={activeDropZone === 'top'}
        data-zone="top"
      ></div>
      <div
        class="drop-zone drop-bottom rounded-md border-2 border-dashed border-transparent transition-colors duration-[0.12s] col-[1/-1] row-start-2 [&.active]:bg-accent/10 [&.active]:border-accent/40"
        class:active={activeDropZone === 'bottom'}
        data-zone="bottom"
      ></div>
    </div>

    <!-- Terminal wrappers for each tab in this pane -->
    {#each tabIds as tabId (tabId)}
      {@const tab = window.getTab?.(tabId)}
      {#if tab}
        <TerminalWrapper {tabId} tab={tab} />
      {/if}
    {/each}
  </div>
</section>
