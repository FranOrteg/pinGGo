<script>
  import { currentChannel } from '$lib/stores/channels.js';
  import { activeView } from '$lib/stores/view.js';
  import ChannelView from '$lib/components/ChannelView.svelte';
  import ProfileView from '$lib/components/ProfileView.svelte';
  import pinggoLogo from '$lib/assets/pinggoLogo.png'
</script>

{#if $activeView === 'profile'}
  <ProfileView />
{:else if $currentChannel}
  <ChannelView channel={$currentChannel} />
{:else}
  <div class="empty-state">
    <img src="{pinggoLogo}" alt="pinGGo" class="empty-state__logo">
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
  .empty-state__logo {
    height: 48px;
    width: auto;
    object-fit: cover;
    opacity: 0.8;
  }
  h2 { color: var(--color-text); font-size: 18px; font-weight: 600; }
  p { font-size: 14px; }
</style>
