import { tabsState } from './tabs.svelte.js';

/**
 * Pane layout tree. Reactive state for Phase 4.
 * - Pane node: { type: 'pane', id: string }
 * - Split node: { type: 'split', id: string, direction: 'horizontal'|'vertical', sizes: [number, number], children: [Node, Node] }
 */

let paneCounter = 0;
let splitCounter = 0;

function nextPaneId() {
  return `pane-${++paneCounter}`;
}
function nextSplitId() {
  return `split-${++splitCounter}`;
}

export const panesState = $state({
  root: null,
  focusedPaneId: null,
});

export function getPaneIds(node) {
  if (!node) return [];
  if (node.type === 'pane') return [node.id];
  return [...getPaneIds(node.children[0]), ...getPaneIds(node.children[1])];
}

export function getFirstPaneId() {
  const root = panesState.root;
  if (!root) return null;
  if (root.type === 'pane') return root.id;
  return getFirstPaneIdFromNode(root);
}
function getFirstPaneIdFromNode(node) {
  if (node.type === 'pane') return node.id;
  return getFirstPaneIdFromNode(node.children[0]) ?? getFirstPaneIdFromNode(node.children[1]);
}

export function ensureRoot() {
  if (panesState.root) return;
  const id = nextPaneId();
  panesState.root = { type: 'pane', id };
  panesState.focusedPaneId = id;
  tabsState.orderByPane[id] = [];
  tabsState.activeByPane[id] = null;
  tabsState.paneHasParent[id] = false;
}

function findParentOf(targetId, node, parent = null) {
  if (!node) return null;
  if (node.type === 'pane') return node.id === targetId ? parent : null;
  const left = findParentOf(targetId, node.children[0], node);
  if (left !== undefined && left !== null) return left;
  return findParentOf(targetId, node.children[1], node);
}

function replaceInParent(parent, oldChild, newChild) {
  if (!parent || parent.type !== 'split') return false;
  const idx = parent.children.findIndex((c) => c === oldChild);
  if (idx === -1) return false;
  parent.children[idx] = newChild;
  return true;
}

function setRoot(newRoot) {
  panesState.root = newRoot;
}

export function splitPane(paneId, direction) {
  const root = panesState.root;
  if (!root) return null;

  const newPaneId = nextPaneId();
  tabsState.orderByPane[newPaneId] = [];
  tabsState.activeByPane[newPaneId] = null;
  tabsState.paneHasParent[newPaneId] = true;
  tabsState.paneHasParent[paneId] = true;

  const newPane = { type: 'pane', id: newPaneId };
  const targetPane = { type: 'pane', id: paneId };

  function replace(node, parent, parentIndex) {
    if (!node) return false;
    if (node.type === 'pane' && node.id === paneId) {
      const split = {
        type: 'split',
        id: nextSplitId(),
        direction,
        sizes: [50, 50],
        children: [targetPane, newPane],
      };
      if (parent) parent.children[parentIndex] = split;
      else panesState.root = split;
      return true;
    }
    if (node.type === 'split') {
      if (replace(node.children[0], node, 0)) return true;
      if (replace(node.children[1], node, 1)) return true;
    }
    return false;
  }

  replace(root, null, -1);
  return newPaneId;
}

/**
 * Collapse an empty pane (remove it and its parent split, promote sibling).
 * Call after closing all tabs in that pane.
 */
export function collapsePaneIfPossible(paneId) {
  const root = panesState.root;
  if (!root) return;
  const order = tabsState.orderByPane[paneId] ?? [];
  if (order.length > 0) return;

  function findParentAndSibling(node, parent) {
    if (!node) return null;
    if (node.type === 'split') {
      if (node.children[0].type === 'pane' && node.children[0].id === paneId) {
        return { parent, split: node, sibling: node.children[1] };
      }
      if (node.children[1].type === 'pane' && node.children[1].id === paneId) {
        return { parent, split: node, sibling: node.children[0] };
      }
      const left = findParentAndSibling(node.children[0], node);
      if (left) return left;
      return findParentAndSibling(node.children[1], node);
    }
    return null;
  }

  const result = findParentAndSibling(root, null);
  if (!result) return;
  const { parent, split, sibling } = result;

  // Remove pane from tabsState
  delete tabsState.orderByPane[paneId];
  delete tabsState.activeByPane[paneId];
  delete tabsState.paneHasParent[paneId];

  if (parent) {
    const idx = parent.children.indexOf(split);
    parent.children[idx] = sibling;
  } else {
    panesState.root = sibling;
    if (sibling.type === 'pane') {
      tabsState.paneHasParent[sibling.id] = false;
    } else {
      // Recursively mark top-level panes as having no parent
      function markNoParent(n) {
        if (n.type === 'pane') tabsState.paneHasParent[n.id] = false;
        else n.children.forEach(markNoParent);
      }
      markNoParent(sibling);
    }
  }

  const firstId = getFirstPaneId();
  if (firstId) panesState.focusedPaneId = firstId;
}

export function setFocusedPane(paneId) {
  const ids = getPaneIds(panesState.root);
  if (paneId && ids.includes(paneId)) {
    panesState.focusedPaneId = paneId;
  } else if (!ids.includes(panesState.focusedPaneId)) {
    panesState.focusedPaneId = ids[0] ?? null;
  }
}

/** Swap order of two children in the split that contains this pane (for drop-left / drop-top). */
export function swapSplitOrderForPane(paneId) {
  function findParentSplit(node, parent) {
    if (!node) return null;
    if (node.type === 'pane' && node.id === paneId) return parent;
    if (node.type === 'split') {
      const left = findParentSplit(node.children[0], node);
      if (left) return left;
      return findParentSplit(node.children[1], node);
    }
    return null;
  }
  const split = findParentSplit(panesState.root, null);
  if (split?.type === 'split') {
    split.children = [split.children[1], split.children[0]];
  }
}
