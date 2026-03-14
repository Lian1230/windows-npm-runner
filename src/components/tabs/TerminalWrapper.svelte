<script>
  import { tabsState } from '../../stores/tabs.svelte.js';

  /**
   * tab — the full renderer.js tab object { term, fitAddon, script, ... }.
   * Only term and fitAddon are used here; tab is treated as opaque/stable.
   */
  let { tabId, tab } = $props();

  const tabMeta = $derived(tabsState.tabs[tabId]);
  const paneId = $derived(tabMeta?.paneId);
  const isActive = $derived(paneId ? tabsState.activeByPane[paneId] === tabId : false);

  const startDisabled  = $derived((tabMeta?.busy ?? false) || (tabMeta?.running ?? false));
  const rerunDisabled  = $derived(tabMeta?.busy ?? false);
  const stopDisabled   = $derived((tabMeta?.busy ?? false) || !(tabMeta?.running ?? false));

  let termBox = $state(null);

  $effect(() => {
    if (!termBox || !tab?.term) return;

    const xtermEl = tab.term.element;
    if (xtermEl) {
      // Terminal already opened — re-attach its DOM node into this container.
      if (xtermEl.parentElement) xtermEl.parentElement.removeChild(xtermEl);
      termBox.appendChild(xtermEl);
    } else {
      tab.term.open(termBox);
    }
    requestAnimationFrame(() => {
      try { tab.fitAddon.fit(); } catch { /* ignore during layout churn */ }
    });

    return () => {
      // Detach xterm element when this TerminalWrapper is destroyed (pane change, tab close).
      const el = tab.term?.element;
      if (el?.parentElement) el.parentElement.removeChild(el);
    };
  });

  function handleMousedown() {
    if (paneId) window.setFocusedPane?.(paneId);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="terminal-wrapper absolute inset-0 py-2 px-2 pb-2.5 flex-col min-w-0 min-h-0"
  class:hidden={!isActive}
  class:flex={isActive}
  data-tab-id={tabId}
  onmousedown={handleMousedown}
>
  <!-- Control buttons -->
  <div class="terminal-controls flex gap-0.5 py-1 px-2 justify-end">
    <!-- Start -->
    <button
      type="button"
      class="ctrl-btn flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-green hover:bg-green/10"
      title="Start"
      disabled={startDisabled}
      onclick={() => window.startScript?.(tabId)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2.5v11l9-5.5z"/>
      </svg>
    </button>

    <!-- Re-run -->
    <button
      type="button"
      class="ctrl-btn flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-accent hover:bg-accent/10"
      title="Re-run"
      disabled={rerunDisabled}
      onclick={() => window.rerunScript?.(tabId)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 2v5h5"/><path d="M3.5 10a5 5 0 1 0 1-6.5L1 7"/>
      </svg>
    </button>

    <!-- Stop -->
    <button
      type="button"
      class="ctrl-btn flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] disabled:opacity-[0.28] disabled:cursor-not-allowed disabled:pointer-events-none hover:text-red hover:bg-red/10"
      title="Stop"
      disabled={stopDisabled}
      onclick={() => window.stopScript?.(tabId)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="3" width="10" height="10" rx="1.5"/>
      </svg>
    </button>

    <!-- Clear -->
    <button
      type="button"
      class="ctrl-btn flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-muted cursor-pointer transition-all duration-[0.12s] hover:text-yellow hover:bg-yellow/15"
      title="Clear"
      onclick={() => tab?.term.clear()}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4h12"/><path d="M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4"/><path d="M12.5 4v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 13V4"/>
      </svg>
    </button>
  </div>

  <!-- Terminal viewport -->
  <div bind:this={termBox} class="term-box flex-1 min-h-0 border border-border rounded-lg overflow-hidden"></div>
</div>
