<script>
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';

  export let channel;

  function avatarColor(name = '') {
    const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#4f8ef7','#9B59B6'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  $: isDM = channel.type === 'direct' || channel.type === 'group';
  $: isPrivate = channel.type === 'private';
</script>

<div class="channel-view">
  <header class="channel-header">
    <div class="channel-header__left">
      {#if isDM}
        <div class="channel-header__avatar" style="background: {avatarColor(channel.name ?? '')}">
          {(channel.name ?? '?')[0].toUpperCase()}
        </div>
      {:else}
        <span class="channel-header__prefix">{isPrivate ? '🔒' : '#'}</span>
      {/if}
      <span class="channel-header__name">{channel.name ?? 'Direct Message'}</span>
    </div>
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
  .channel-header__avatar {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
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
</style>
