<script>
  import { currentChannel } from '$lib/stores/channels.js';
  import ChannelView from '$lib/components/ChannelView.svelte';
</script>

{#if $currentChannel}
  <ChannelView channel={$currentChannel} />
{:else}
  <div class="empty-state">
    <div class="empty-state__icon">💬</div>
    <h2>Welcome to PinGGo</h2>
    <p>Select a channel or start a conversation</p>
  </div>
{/if}

<style>
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
  }
  .empty-state__icon { font-size: 48px; }
  h2 { color: var(--color-text); font-size: 18px; font-weight: 600; }
  p { font-size: 14px; }
</style>
