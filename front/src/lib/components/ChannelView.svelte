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
        <span class="channel-header__prefix">
          {#if isPrivate}
            <svg class="icon-lock" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-380Zm80 220H260q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q106 0 184.5 68.5T757-560q-21 0-40.5 4.5T679-543q-8-75-65-126t-134-51q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h300v80Zm120 0q-17 0-28.5-11.5T640-200v-120q0-17 11.5-28.5T680-360v-40q0-33 23.5-56.5T760-480q33 0 56.5 23.5T840-400v40q17 0 28.5 11.5T880-320v120q0 17-11.5 28.5T840-160H680Zm40-200h80v-40q0-17-11.5-28.5T760-440q-17 0-28.5 11.5T720-400v40Z"/></svg>
          {/if}
          #
        </span>
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
    height: 44px;
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
    display: flex;
    align-items: center;
  }
  .icon-lock {
    width: 18px;
    height: 18px;
    fill: currentColor;
    margin-right: 4px;
  }
  .channel-header__name {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .members-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 4px 8px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 13px;
    transition: border-color 0.15s ease-out, color 0.15s ease-out, background 0.15s ease-out;
  }
  .members-button svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .members-button:hover {
    border-color: var(--color-accent);
    color: var(--color-text);
    background: rgba(79, 142, 247, 0.08);
  }
</style>
