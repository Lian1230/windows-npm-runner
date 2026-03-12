<script>
  import { contextMenuState } from '../../stores/app.svelte.js';

  let menuEl = $state(null);
  let finalX = $state(0);
  let finalY = $state(0);

  $effect(() => {
    if (!contextMenuState.visible || !menuEl) return;
    // Clamp to viewport after render
    const rect = menuEl.getBoundingClientRect();
    finalX = Math.max(8, Math.min(contextMenuState.x, window.innerWidth - rect.width - 8));
    finalY = Math.max(8, Math.min(contextMenuState.y, window.innerHeight - rect.height - 8));
  });

  function close() {
    contextMenuState.visible = false;
  }

  function handleItemClick(item) {
    close();
    item.action();
  }
</script>

<svelte:window
  onmousedown={(e) => {
    if (contextMenuState.visible && menuEl && !menuEl.contains(e.target)) close();
  }}
  onblur={close}
  onkeydown={(e) => { if (e.key === 'Escape') close(); }}
/>

{#if contextMenuState.visible}
  <div
    bind:this={menuEl}
    id="context-menu"
    class="fixed min-w-[160px] p-1.5 bg-overlay border border-border rounded-lg shadow-xl z-20"
    style="left: {finalX}px; top: {finalY}px;"
    role="menu"
  >
    {#each contextMenuState.items as item}
      <button
        type="button"
        class="context-menu-item block w-full py-2 px-2.5 border-0 rounded-md bg-transparent text-[#cdd6f4] text-xs text-left cursor-pointer hover:bg-accent/10"
        role="menuitem"
        onclick={() => handleItemClick(item)}
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}
