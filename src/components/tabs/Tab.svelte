<script>
  import { tabsState } from '../../stores/tabs.svelte.js';

  let { tabId, paneId } = $props();

  const tabData = $derived(tabsState.tabs[tabId]);
  const isActive = $derived(tabsState.activeByPane[paneId] === tabId);

  const tabLabel = $derived.by(() => {
    const name = tabData?.script ?? '';
    if (!tabData?.projectDir) return name;
    const hasDuplicate = Object.values(tabsState.tabs).some(
      t => t !== tabData && t.script === name && t.projectDir !== tabData.projectDir
    );
    if (!hasDuplicate) return name;
    const projectName = tabData.projectDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    return `${name} (${projectName})`;
  });

  const statusDotClass = $derived(
    tabData?.status === 'running'     ? 'bg-green shadow-[0_0_6px_rgba(166,227,161,0.4)]' :
    tabData?.status === 'exited-ok'   ? 'bg-muted' :
    tabData?.status === 'exited-fail' ? 'bg-red' : 'bg-border'
  );

  let dragSide = $state('right');
  let showDropIndicator = $state(false);

  function handleClick(e) {
    if (e.target.closest('.tab-close')) {
      window.closeTab?.(tabId);
      return;
    }
    window.switchTab?.(paneId, tabId);
  }

  function handleContextMenu(e) {
    e.preventDefault();
    window.showTabContextMenu?.(e.clientX, e.clientY, paneId);
  }

  function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    tabsState.drag.tabId = tabId;
    tabsState.drag.sourcePaneId = paneId;
  }

  function handleDragEnd() {
    tabsState.drag.tabId = null;
    tabsState.drag.sourcePaneId = null;
    showDropIndicator = false;
    window.cleanupAllPaneDropOverlays?.();
  }

  function handleDragOver(e) {
    if (!tabsState.drag.tabId) return;
    e.preventDefault();
    e.stopPropagation(); // prevent bubbling to PaneGroup.el which would show body overlay
    e.dataTransfer.dropEffect = 'move';
    window.hidePaneDropOverlay?.(paneId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragSide = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    showDropIndicator = tabsState.drag.tabId !== tabId;
  }

  function handleDragLeave() {
    showDropIndicator = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    showDropIndicator = false;
    const srcId = tabsState.drag.tabId || e.dataTransfer.getData('text/plain');
    if (!srcId || srcId === tabId) return;
    window.dropTabOnTab?.(srcId, tabId, paneId, dragSide === 'left');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div
  class="tab flex items-center gap-2 px-3.5 h-9 text-xs font-mono cursor-pointer border-r border-border whitespace-nowrap transition-colors duration-[0.12s] select-none hover:bg-white/5"
  class:bg-base={isActive}
  class:text-[#cdd6f4]={isActive}
  class:text-muted={!isActive}
  class:shadow-[inset_2px_0_0_var(--color-accent)]={showDropIndicator && dragSide === 'left'}
  class:shadow-[inset_-2px_0_0_var(--color-accent)]={showDropIndicator && dragSide === 'right'}
  role="tab"
  tabindex="0"
  draggable="true"
  data-tab-id={tabId}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <span class="status-dot w-2 h-2 rounded-full shrink-0 {statusDotClass}"></span>
  <span class="tab-name">{tabLabel}</span>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class="tab-close flex items-center justify-center w-4.5 h-4.5 rounded text-sm text-muted transition-colors duration-[0.12s] hover:bg-red/20 hover:text-red"
    title="Close"
  >&times;</span>
</div>
