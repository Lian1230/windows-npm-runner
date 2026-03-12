// Shared reactive state — consumed by Svelte components and mutated by renderer.js during migration.
// Svelte 5 $state objects are ES-Proxy-backed: mutations from plain JS trigger component re-renders.

export const projectState = $state({
  dir: null,        // string | null
  name: 'No project loaded',
  scripts: {},      // { [name]: command }
  packageManager: 'npm',
  detectedManagers: { npm: null, pnpm: null, bun: null },
  bookmarks: new Set(),
  savedProjects: [], // [{ name, filePath }]
});

export const contextMenuState = $state({
  visible: false,
  x: 0,
  y: 0,
  items: [], // [{ label, action }]
});

export const settingsModalState = $state({
  visible: false,
});

export const savedProjectsDropdownState = $state({
  visible: false,
  anchorRect: null, // DOMRect of the anchor button
});
