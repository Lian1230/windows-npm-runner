<script>
  import TopBar from './components/topbar/TopBar.svelte';
  import Sidebar from './components/sidebar/Sidebar.svelte';
  import ContextMenu from './components/overlays/ContextMenu.svelte';
  import SettingsModal from './components/overlays/SettingsModal.svelte';
  import SavedProjectsDropdown from './components/overlays/SavedProjectsDropdown.svelte';
  import PaneLayout from './components/panes/PaneLayout.svelte';
  import { panesState } from './stores/panes.svelte.js';
  import { tabsState } from './stores/tabs.svelte.js';

  // initialSidebarWidth is passed from renderer.js via window after settings load.
  let initialSidebarWidth = $state(220);
  window.setInitialSidebarWidth = (w) => { initialSidebarWidth = w; };

  const hasAnyTabs = $derived(Object.keys(tabsState.tabs).length > 0);
</script>

<TopBar />

<div id="app" class="flex h-[calc(100vh-41px)]">
  <Sidebar initialWidth={initialSidebarWidth} />

  <main id="main-area" class="flex-1 flex flex-col min-w-0">
    <div id="terminal-container" class="flex-1 relative bg-base min-h-0">
      <div
        id="empty-state"
        class="absolute inset-0 flex items-center justify-center text-muted text-sm pointer-events-none z-[3]"
        class:hidden={hasAnyTabs}
      >
        Open a package.json and click a script to run it.
      </div>
      <div id="pane-root" class="absolute inset-0 min-w-0 min-h-0">
        <PaneLayout node={panesState.root} />
      </div>
    </div>
  </main>
</div>

<!-- Overlay components -->
<ContextMenu />
<SettingsModal />
<SavedProjectsDropdown />
