<script>
  /**
   * direction: 'horizontal' | 'vertical'
   * sizeFirst: number — current first child's percentage (0–100), used so handle doesn't jump
   * onResize: (sizeFirst: number) => void
   */
  let { direction, sizeFirst = 50, onResize } = $props();

  function startResize(e) {
    e.preventDefault();
    window.hideContextMenu?.();

    const isHorz = direction === 'horizontal';
    const splitEl = e.currentTarget?.parentElement;
    if (!splitEl) return;

    const onMouseMove = (moveEvent) => {
      const rect = splitEl.getBoundingClientRect();
      const totalSize = isHorz ? rect.width : rect.height;
      const edge = isHorz ? rect.left : rect.top;
      const point = isHorz ? moveEvent.clientX : moveEvent.clientY;
      const minPaneSize = 180;
      const gutterSize = 6;
      const nextPixels = Math.min(
        Math.max(point - edge, minPaneSize),
        totalSize - gutterSize - minPaneSize
      );
      const nextPercent = (nextPixels / totalSize) * 100;
      onResize?.(nextPercent);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  class="split-gutter relative shrink-0 bg-[rgba(49,50,68,0.9)] z-[2] after:absolute after:inset-[1px] after:bg-accent/8 after:opacity-0 after:transition-opacity after:duration-[0.12s] hover:after:opacity-100 {direction === 'horizontal' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}"
  onmousedown={startResize}
></div>
