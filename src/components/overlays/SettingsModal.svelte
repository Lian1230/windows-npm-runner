<script>
  import { projectState, settingsModalState } from '../../stores/app.svelte.js';

  function close() {
    settingsModalState.visible = false;
  }

  async function onOpen() {
    projectState.detectedManagers = await window.api.detectManagers();
  }

  $effect(() => {
    if (settingsModalState.visible) onOpen();
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

{#if settingsModalState.visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    id="settings-overlay"
    role="presentation"
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onmousedown={(e) => { if (e.target === e.currentTarget) close(); }}
  >
    <div id="settings-modal" class="bg-surface border border-border rounded-xl p-6 w-[360px] shadow-2xl">
      <div class="text-[15px] font-semibold mb-5 text-[#cdd6f4]">Settings</div>

      <!-- Package Manager -->
      <div class="flex items-center justify-between gap-3 mb-3.5">
        <span class="text-[13px] text-[#cdd6f4]">Package Manager</span>
        <select
          class="settings-select py-1.5 pl-2.5 pr-7 bg-overlay text-[#cdd6f4] border border-border rounded-md text-[13px] font-mono cursor-pointer transition-[border-color] duration-[0.12s] hover:border-muted focus:outline-none focus:border-accent"
          value={projectState.packageManager}
          onchange={(e) => {
            projectState.packageManager = e.currentTarget.value;
            window.saveAllSettings?.();
          }}
        >
          {#each ['npm', 'pnpm', 'bun'] as name}
            <option
              value={name}
              disabled={!projectState.detectedManagers[name]}
            >
              {projectState.detectedManagers[name] ? name : `${name} (not found)`}
            </option>
          {/each}
        </select>
      </div>
    </div>
  </div>
{/if}
