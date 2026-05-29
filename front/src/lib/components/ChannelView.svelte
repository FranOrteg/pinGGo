<script>
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';

  export let channel;
</script>

<div class="channel-view">
  <header class="channel-header">
    <div class="channel-header__left">
      <span class="channel-header__prefix">{channel.type === 'channel' ? '#' : '💬'}</span>
      <span class="channel-header__name">{channel.name ?? 'Direct Message'}</span>
    </div>
    {#if channel.description}
      <p class="channel-header__desc">{channel.description}</p>
    {/if}
  </header>

  <MessageList {channel} />
  <MessageInput channelId={channel.uuid} />
</div>

<style>
  .channel-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .channel-header {
    height: 48px;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-shrink: 0;
  }
  .channel-header__left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .channel-header__prefix {
    font-size: 16px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .channel-header__name {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .channel-header__desc {
    font-size: 12px;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }
</style>
