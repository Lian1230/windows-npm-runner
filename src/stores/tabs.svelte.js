export const tabsState = $state({
  // Reactive tab metadata — keyed by tab id.
  // Does NOT hold xterm/FitAddon instances (those stay in runner.js).
  tabs: {},           // Record<id, { script, status, running, busy, paneId }>

  activeByPane: {},   // Record<paneId, id | null>
  orderByPane: {},    // Record<paneId, id[]>   insertion order per pane
  paneHasParent: {},  // Record<paneId, bool>   true when pane lives inside a split

  hasAnyRunning: false,

  drag: {
    tabId: null,
    sourcePaneId: null,
  },
});
