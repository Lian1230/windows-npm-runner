<script>
  import { projectState } from '../../stores/app.svelte.js';

  let { name, command, animate = false } = $props();

  const isBookmarked = $derived(projectState.bookmarks.has(name));

  function toggleBookmark(e) {
    e.stopPropagation();
    if (projectState.bookmarks.has(name)) {
      projectState.bookmarks.delete(name);
    } else {
      projectState.bookmarks.add(name);
    }
    window.saveAllSettings?.();
  }

  function run(e) {
    e?.stopPropagation();
    window.openScriptTab?.(name);
  }

  function onContextMenu(e) {
    e.preventDefault();
    window.showContextMenuForScript?.(e.clientX, e.clientY, name);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<li
  role="option"
  aria-selected="false"
  class="script-item group flex items-center gap-2 py-1.5 pr-1 pl-2.5 rounded-md cursor-pointer text-[13px] font-mono transition-colors duration-[0.12s] text-[#cdd6f4] mb-0.5 hover:bg-accent/10"
  class:bookmarked={isBookmarked}
  class:border-l-2={isBookmarked}
  class:border-l-yellow={isBookmarked}
  class:pl-2={isBookmarked}
  class:animate-bookmark-slide-in={animate}
  title={command}
  onclick={run}
  oncontextmenu={onContextMenu}
>
  <span class="script-icon flex items-center justify-center text-accent opacity-80">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>
  </span>

  <span class="script-name flex-1 min-w-0 truncate">{name}</span>

  <div class="script-actions flex items-center gap-0.5 max-w-0 overflow-hidden shrink-0 transition-[max-width] duration-200 ease-out -ml-1 group-hover:max-w-[56px]">
    <button
      type="button"
      class="script-bookmark-btn flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent cursor-pointer opacity-0 transition-all duration-[0.12s] text-muted hover:text-yellow hover:bg-yellow/10 group-hover:opacity-100"
      class:active={isBookmarked}
      class:text-yellow={isBookmarked}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
      onclick={toggleBookmark}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5">
        <path d="M3 2h10v12l-5-3.5L3 14V2z"/>
      </svg>
    </button>

    <button
      type="button"
      class="script-play-btn flex items-center justify-center w-6 h-6 border-0 rounded bg-transparent cursor-pointer opacity-0 transition-all duration-[0.12s] text-green hover:bg-green/15 group-hover:opacity-100"
      title="Run Script"
      onclick={run}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 2.5v11l9-5.5z"/>
      </svg>
    </button>
  </div>
</li>
