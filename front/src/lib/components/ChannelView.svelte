<script>
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';
  import UserAvatar from './UserAvatar.svelte';

  export let channel;

  $: isDM = channel.type === 'direct' || channel.type === 'group';
  $: isPrivate = channel.type === 'private';
</script>

<div class="channel-view">
  <header class="channel-header">
    <div class="channel-header__left">
      {#if isDM}
        <UserAvatar
          userUuid={channel.dm_user_uuid}
          avatarKey={channel.dm_avatar_url}
          name={channel.name ?? ''}
          size="24px"
          radius="6px"
        />
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
  .channel-header__name {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
