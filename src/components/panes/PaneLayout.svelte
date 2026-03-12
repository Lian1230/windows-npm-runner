<script>
  import PaneGroup from './PaneGroup.svelte';
  import SplitGutter from './SplitGutter.svelte';
  import PaneLayout from './PaneLayout.svelte';

  /** @type {{ type: 'pane', id: string } | { type: 'split', id: string, direction: 'horizontal'|'vertical', sizes: [number, number], children: [any, any] }} */
  let { node } = $props();
</script>

{#if !node}
  <!-- no layout yet -->
{:else if node.type === 'pane'}
  <PaneGroup paneId={node.id} />
{:else if node.type === 'split'}
  <div
    class="split-container flex w-full h-full min-w-0 min-h-0 {node.direction === 'horizontal' ? 'flex-row' : 'flex-col'}"
  >
    <div
      class="split-child flex-[0_1_50%] min-w-0 min-h-0 overflow-hidden"
      style="flex-basis: calc({node.sizes[0]}% - 3px);"
    >
      <PaneLayout node={node.children[0]} />
    </div>
    <SplitGutter
      direction={node.direction}
      sizeFirst={node.sizes[0]}
      onResize={(sizeFirst) => {
        node.sizes = [sizeFirst, 100 - sizeFirst];
        window.scheduleFitVisibleTerminals?.();
      }}
    />
    <div
      class="split-child flex-[0_1_50%] min-w-0 min-h-0 overflow-hidden"
      style="flex-basis: calc({node.sizes[1]}% - 3px);"
    >
      <PaneLayout node={node.children[1]} />
    </div>
  </div>
{/if}
