<script>
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import ChannelMembersModal from './ChannelMembersModal.svelte';
  import { api } from '$lib/api/index.js';

  export let channel;

  let members = [];
  let loadedChannelUuid = null;
  let showMembers = false;

  $: isDM = channel.type === 'direct' || channel.type === 'group';
  $: isPrivate = channel.type === 'private';

  async function loadMembers(channelUuid) {
    if (!channelUuid || loadedChannelUuid === channelUuid) return;
    loadedChannelUuid = channelUuid;
    members = [];
    try {
      const data = await api.get(`/channels/${channelUuid}`);
      if (loadedChannelUuid === channelUuid) members = data.channel.members ?? [];
    } catch {
      if (loadedChannelUuid === channelUuid) members = [];
    }
  }

  $: loadMembers(channel.uuid);
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
    {#if channel.type !== 'direct'}
      <button class="members-button" type="button" on:click={() => (showMembers = true)} title="View channel members">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <span>{members.length}</span>
      </button>
    {/if}
  </header>

  <MessageList {channel} />
  <MessageInput channelId={channel.uuid} />
</div>

{#if showMembers && channel.type !== 'direct'}
  <ChannelMembersModal
    {channel}
    {members}
    on:close={() => (showMembers = false)}
    on:updated={(event) => (members = event.detail)}
  />
{/if}

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
  .members-button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 9px; background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 13px; }
  .members-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .members-button:hover { border-color: var(--color-accent); color: var(--color-text); }
</style>
