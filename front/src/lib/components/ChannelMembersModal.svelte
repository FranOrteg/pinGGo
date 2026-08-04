<script>
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/index.js';
  import { authUser } from '$lib/stores/auth.js';
  import UserAvatar from './UserAvatar.svelte';

  export let channel;
  export let members = [];

  const dispatch = createEventDispatcher();
  let search = '';
  let results = [];
  let searchError = '';
  let addingUuid = null;
  let managers = [];

  $: myMembership = members.find((member) => member.uuid === $authUser?.uuid);
  $: canManageMembers = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  async function searchUsers() {
    const query = search.trim();
    results = [];
    searchError = '';
    if (query.length < 2) return;

    try {
      const data = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      const memberUuids = new Set(members.map((member) => member.uuid));
      results = (data.users ?? []).filter((user) => !memberUuids.has(user.uuid));
    } catch (error) {
      searchError = error.message || 'Could not search users';
    }
  }

  async function addMember(user) {
    addingUuid = user.uuid;
    searchError = '';
    try {
      await api.post(`/channels/${channel.uuid}/members`, { userUuid: user.uuid });
      const data = await api.get(`/channels/${channel.uuid}`);
      members = data.channel.members ?? [];
      results = results.filter((result) => result.uuid !== user.uuid);
      dispatch('updated', members);
    } catch (error) {
      searchError = error.message || 'Could not add user';
    } finally {
      addingUuid = null;
    }
  }

  function close() {
    dispatch('close');
  }

  function roleLabel(role) {
    return ({ owner: 'Owner', admin: 'Admin', member: 'Member' })[role] ?? 'Member';
  }

  $: managers = members.filter((member) => member.role === 'owner' || member.role === 'admin');
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && close()} />

<div class="modal-backdrop">
  <button class="backdrop-dismiss" type="button" aria-label="Close members" on:click={close}></button>
  <div class="members-modal" role="dialog" aria-modal="true" aria-labelledby="members-title">
    <header class="modal-header">
      <div>
        <h2 id="members-title">{channel.type === 'direct' ? 'Conversation members' : `# ${channel.name}`}</h2>
        <p>{members.length} {members.length === 1 ? 'member' : 'members'}</p>
      </div>
      <button class="close-button" type="button" aria-label="Close members" on:click={close}>×</button>
    </header>

    {#if canManageMembers}
      <div class="add-members">
        <label for="member-search">Add people</label>
        <input
          id="member-search"
          bind:value={search}
          on:input={searchUsers}
          placeholder="Search users by name"
          autocomplete="off"
        />
        {#if results.length > 0}
          <div class="search-results">
            {#each results as user (user.uuid)}
              <div class="search-result">
                <UserAvatar userUuid={user.uuid} avatarKey={user.avatar_url} name={user.username} size="30px" radius="7px" />
                <span>{user.username}</span>
                <button type="button" on:click={() => addMember(user)} disabled={addingUuid === user.uuid}>
                  {addingUuid === user.uuid ? 'Adding…' : 'Add'}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if channel.type === 'private'}
      <div class="permission-note">
        <strong>Only owners and admins can add people.</strong>
        {#if managers.length}
          <span>Contact {managers.map((member) => member.username).join(', ')} to request access.</span>
        {/if}
      </div>
    {/if}

    {#if searchError}<p class="error" role="alert">{searchError}</p>{/if}

    <div class="member-list" aria-label="Channel members">
      {#each members as member (member.uuid)}
        <div class="member-row">
          <UserAvatar userUuid={member.uuid} avatarKey={member.avatar_url} name={member.username} size="36px" radius="8px" />
          <div class="member-details">
            <span class="member-name">{member.username}{member.uuid === $authUser?.uuid ? ' (you)' : ''}</span>
            <span class="member-status">{member.status ?? 'offline'}</span>
          </div>
          <span
            class="role-badge"
            class:role-badge--owner={member.role === 'owner'}
            class:role-badge--admin={member.role === 'admin'}
          >{roleLabel(member.role)}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: var(--color-overlay); }
  .backdrop-dismiss { position: absolute; inset: 0; border: 0; background: transparent; cursor: default; }
  .members-modal { position: relative; z-index: 1; width: min(560px, 100%); max-height: min(680px, calc(100dvh - 48px)); overflow: auto; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,.4); }
  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px; border-bottom: 1px solid var(--color-border); }
  h2 { margin: 0; color: var(--color-text); font-size: 19px; } p { margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px; }
  .close-button { border: 0; background: none; color: var(--color-text-muted); font-size: 28px; line-height: 1; cursor: pointer; }
  .add-members { padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
  label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 600; color: var(--color-text); }
  input { width: 100%; padding: 9px 11px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); color: var(--color-text); outline: none; }
  input:focus { border-color: var(--color-accent); }
  .search-results { margin-top: 8px; border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; }
  .search-result, .member-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; }
  .member-row { justify-content: space-between; }
  .search-result + .search-result, .member-row + .member-row { border-top: 1px solid var(--color-border); }
  .search-result span { flex: 1; color: var(--color-text); font-size: 14px; }
  .search-result button { border: 0; border-radius: 5px; padding: 5px 9px; color: #fff; background: var(--color-accent); cursor: pointer; font-size: 12px; }
  .search-result button:disabled { opacity: .65; cursor: wait; }
  .permission-note { display: flex; flex-direction: column; gap: 3px; padding: 14px 20px; border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 13px; }
  .permission-note strong { color: var(--color-text); font-size: 13px; }
  .error { margin: 10px 20px 0; color: #f87171; }
  .member-list { padding: 8px 0; }
  .member-details { display: flex; flex: 1; flex-direction: column; min-width: 0; }
  .member-name { color: var(--color-text); font-size: 14px; font-weight: 600; }
  .role-badge { display: inline-flex; align-items: center; border: 1px solid var(--color-border); border-radius: 999px; padding: 2px 6px; color: var(--color-text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
  .role-badge--owner { color: #fbbf24; border-color: rgba(251, 191, 36, .55); background: rgba(251, 191, 36, .1); }
  .role-badge--admin { color: #60a5fa; border-color: rgba(96, 165, 250, .55); background: rgba(96, 165, 250, .1); }
  .member-status { margin-top: 2px; color: var(--color-text-muted); font-size: 12px; text-transform: capitalize; }
</style>
