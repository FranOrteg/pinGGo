<script>
  import { channels, activeChannelId, setActiveChannel } from '$lib/stores/channels.js';
  import { authUser, logout } from '$lib/stores/auth.js';
  import { presence } from '$lib/stores/presence.js';
  import { unread } from '$lib/stores/unread.js';
  import PresenceDot from './PresenceDot.svelte';
  import CreateChannelModal from './CreateChannelModal.svelte';
  import UserSearchModal from './UserSearchModal.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import { getAvatarUrl } from '$lib/api/avatar.js';
  import { currentTheme, toggleTheme } from '$lib/stores/theme.js';
  import { showProfile, showChannel } from '$lib/stores/view.js';

  let showCreateChannel = false;
  let showUserSearch = false;
  let avatarUrl = null;
  let loadedAvatarKey = null;

  // Both public ('channel') and private channels the user belongs to are listed here.
  // Visibility/access itself is enforced backend-side via channel_members.
  $: channelsList = $channels.filter((c) => c.type === 'channel' || c.type === 'private');
  $: dms = $channels.filter((c) => c.type === 'direct' || c.type === 'group');

  function avatarColor(name = '') {
    const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#4f8ef7','#9B59B6'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  $: {
    const user = $authUser;
    const cacheKey = user ? `${user.uuid}:${user.avatar_url ?? ''}` : null;
    if (!cacheKey || !user.avatar_url) {
      avatarUrl = null;
      loadedAvatarKey = cacheKey;
    } else if (loadedAvatarKey !== cacheKey) {
      loadedAvatarKey = cacheKey;
      avatarUrl = null;
      getAvatarUrl(user.uuid, user.avatar_url).then((url) => {
        if (loadedAvatarKey === cacheKey) avatarUrl = url;
      }).catch(() => {});
    }
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
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
        </button>
      </div>
      <ul class="nav-list" role="list">
        {#each channelsList as ch (ch.uuid)}
          <li>
            <button
              class="nav-item"
              class:nav-item--active={$activeChannelId === ch.uuid}
              on:click={() => { showChannel(); setActiveChannel(ch.uuid); }}
            >
              <span class="nav-item__hash">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 3l2 10M9.5 3l2 10M3 6.5h10M3 9.5h10"/></svg>
              </span>
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
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
        </button>
      </div>
      <ul class="nav-list" role="list">
        {#each dms as dm (dm.uuid)}
          <li>
            <button
              class="nav-item"
              class:nav-item--active={$activeChannelId === dm.uuid}
              on:click={() => { showChannel(); setActiveChannel(dm.uuid); }}
            >
              <span class="nav-item__dm-dot">
                <PresenceDot status={$presence[dm.dm_user_uuid] ?? dm.dm_status ?? 'offline'} />
              </span>
              <UserAvatar
                userUuid={dm.dm_user_uuid}
                avatarKey={dm.dm_avatar_url}
                name={dm.name ?? ''}
                size="22px"
                radius="6px"
              />
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
        <button
          class="user-avatar"
          style="background: {avatarUrl ? 'var(--color-surface)' : avatarColor($authUser.username)}"
          title="View profile"
          on:click={() => showProfile($activeChannelId)}
        >
          {#if avatarUrl}
            <img src={avatarUrl} alt="Profile photo of {$authUser.username}" />
          {:else}
            {$authUser.username[0].toUpperCase()}
          {/if}
        </button>
        <div class="user-info">
          <span class="user-name">{$authUser.username}</span>
          <span class="user-status">
            <PresenceDot status={$authUser.status ?? 'online'} size="8" />
            {$authUser.status ?? 'online'}
          </span>
        </div>
      </div>
      <button class="theme-toggle" on:click={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
        {#if $currentTheme === 'dark'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        {/if}
      </button>
      <button class="logout-btn" on:click={logout} title="Sign out" aria-label="Sign out">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H4a1 1 0 00-1 1v10a1 1 0 001 1h2M11 11l3-3-3-3M14 8H6"/></svg>
      </button>
    </div>
  {/if}
</aside>

<!-- Modals -->
{#if showCreateChannel}
  <CreateChannelModal
    on:close={() => (showCreateChannel = false)}
    on:created={(e) => { showChannel(); setActiveChannel(e.detail.uuid); showCreateChannel = false; }}
  />
{/if}
{#if showUserSearch}
  <UserSearchModal
    on:close={() => (showUserSearch = false)}
    on:created={(e) => { showChannel(); setActiveChannel(e.detail.uuid); showUserSearch = false; }}
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

  .nav-section { margin-bottom: 16px; }
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s ease-out, background 0.15s ease-out;
  }
  .nav-section__add svg {
    width: 14px;
    height: 14px;
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
    width: calc(100% - 8px);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 16px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    font-size: 14px;
    cursor: pointer;
    border-radius: 8px;
    text-align: left;
    transition: background 0.15s ease-out, color 0.15s ease-out;
    margin: 0 4px;
  }
  .nav-item:hover { background: var(--color-border); color: var(--color-text); }
  .nav-item--active { background: rgba(79,142,247,0.15); color: var(--color-text); font-weight: 500; }

  .nav-item__hash {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--color-text-muted);
    opacity: 0.6;
  }
  .nav-item__hash svg {
    width: 16px;
    height: 16px;
  }
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
    padding: 0px 16px 16px;
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
    overflow: hidden;
    cursor: pointer;
    position: relative;
    border: none;
    padding: 0;
    transition: opacity 0.15s ease-out;
  }
  .user-avatar:hover { opacity: 0.85; }
  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s ease-out, background 0.15s ease-out;
    flex-shrink: 0;
  }
  .logout-btn svg {
    width: 16px;
    height: 16px;
  }
  .logout-btn:hover { color: var(--color-text); background: var(--color-border); }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s ease-out, background 0.15s ease-out;
    flex-shrink: 0;
  }
  .theme-toggle svg {
    width: 16px;
    height: 16px;
  }
  .theme-toggle:hover { color: var(--color-text); background: var(--color-border); }
</style>
