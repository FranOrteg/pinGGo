<script>
  import { channels, activeChannelId, setActiveChannel, currentChannel } from '$lib/stores/channels.js';
  import { authUser, logout } from '$lib/stores/auth.js';
  import { presence } from '$lib/stores/presence.js';
  import { unread } from '$lib/stores/unread.js';
  import PresenceDot from './PresenceDot.svelte';
  import CreateChannelModal from './CreateChannelModal.svelte';
  import UserSearchModal from './UserSearchModal.svelte';

  let showCreateChannel = false;
  let showUserSearch = false;

  $: publicChannels = $channels.filter((c) => c.type === 'channel');
  $: dms = $channels.filter((c) => c.type === 'direct' || c.type === 'group');

  function avatarColor(name = '') {
    const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#4f8ef7','#9B59B6'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }
</script>

<aside class="sidebar">
  <!-- Workspace Header -->
  <div class="sidebar__header">
    <span class="workspace-name">PinGGo</span>
  </div>

  <div class="sidebar__body">
    <!-- Channels section -->
    <section class="nav-section">
      <div class="nav-section__title">
        <span>Channels</span>
        <button
          class="nav-section__add"
          on:click={() => (showCreateChannel = true)}
          title="Create channel"
          aria-label="Create channel"
        >+</button>
      </div>
      <ul class="nav-list" role="list">
        {#each publicChannels as ch (ch.uuid)}
          <li>
            <button
              class="nav-item"
              class:nav-item--active={$activeChannelId === ch.uuid}
              on:click={() => setActiveChannel(ch.uuid)}
            >
              <span class="nav-item__hash">#</span>
              <span class="nav-item__name">{ch.name}</span>
              {#if ($unread[ch.uuid] ?? 0) > 0}
                <span class="unread-badge">{$unread[ch.uuid] > 99 ? '99+' : $unread[ch.uuid]}</span>
              {/if}
            </button>
          </li>
        {:else}
          <li class="nav-empty">No channels yet</li>
        {/each}
      </ul>
    </section>

    <!-- Direct Messages section -->
    <section class="nav-section">
      <div class="nav-section__title">
        <span>Direct Messages</span>
        <button
          class="nav-section__add"
          on:click={() => (showUserSearch = true)}
          title="New direct message"
          aria-label="New direct message"
        >+</button>
      </div>
      <ul class="nav-list" role="list">
        {#each dms as dm (dm.uuid)}
          <li>
            <button
              class="nav-item"
              class:nav-item--active={$activeChannelId === dm.uuid}
              on:click={() => setActiveChannel(dm.uuid)}
            >
              <span class="nav-item__dm-dot">
                <PresenceDot status={$presence[dm.uuid] ?? 'offline'} />
              </span>
              <span class="nav-item__name">{dm.name ?? 'Unknown'}</span>
              {#if ($unread[dm.uuid] ?? 0) > 0}
                <span class="unread-badge">{$unread[dm.uuid] > 99 ? '99+' : $unread[dm.uuid]}</span>
              {/if}
            </button>
          </li>
        {:else}
          <li class="nav-empty">No conversations yet</li>
        {/each}
      </ul>
    </section>
  </div>

  <!-- User Footer -->
  {#if $authUser}
    <div class="sidebar__footer">
      <div class="user-chip">
        <div
          class="user-avatar"
          style="background: {avatarColor($authUser.username)}"
          aria-hidden="true"
        >
          {$authUser.username[0].toUpperCase()}
        </div>
        <div class="user-info">
          <span class="user-name">{$authUser.username}</span>
          <span class="user-status">
            <PresenceDot status={$authUser.status ?? 'online'} size="8" />
            {$authUser.status ?? 'online'}
          </span>
        </div>
      </div>
      <button class="logout-btn" on:click={logout} title="Sign out" aria-label="Sign out">
        ↪
      </button>
    </div>
  {/if}
</aside>

<!-- Modals -->
{#if showCreateChannel}
  <CreateChannelModal
    on:close={() => (showCreateChannel = false)}
    on:created={(e) => { setActiveChannel(e.detail.uuid); showCreateChannel = false; }}
  />
{/if}
{#if showUserSearch}
  <UserSearchModal
    on:close={() => (showUserSearch = false)}
    on:created={(e) => { setActiveChannel(e.detail.uuid); showUserSearch = false; }}
  />
{/if}

<style>
  .sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar__header {
    height: 48px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .workspace-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.3px;
  }

  .sidebar__body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
  }

  .nav-section { margin-bottom: 20px; }
  .nav-section__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    margin-bottom: 2px;
  }
  .nav-section__add {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 2px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .nav-section__add:hover { color: var(--color-text); background: var(--color-border); }

  .nav-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .nav-empty {
    padding: 4px 16px;
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 16px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    font-size: 14px;
    cursor: pointer;
    border-radius: 6px;
    text-align: left;
    transition: background 0.1s, color 0.1s;
    margin: 0 4px;
    width: calc(100% - 8px);
  }
  .nav-item:hover { background: var(--color-border); color: var(--color-text); }
  .nav-item--active { background: rgba(79,142,247,0.15); color: var(--color-text); font-weight: 500; }

  .nav-item__hash { font-size: 16px; opacity: 0.6; flex-shrink: 0; }
  .nav-item__dm-dot { display: flex; align-items: center; flex-shrink: 0; }
  .nav-item__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

  .unread-badge {
    flex-shrink: 0;
    background: var(--color-accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }

  .sidebar__footer {
    padding: 0px 16px 124px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .user-chip {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }
  .user-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .user-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-status {
    font-size: 11px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 4px;
    text-transform: capitalize;
  }

  .logout-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 18px;
    padding: 4px 6px;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .logout-btn:hover { color: var(--color-text); background: var(--color-border); }
</style>
