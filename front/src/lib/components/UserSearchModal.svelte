<script>
  import { createEventDispatcher } from 'svelte';
  import { api } from '$lib/api/index.js';
  import { createDM } from '$lib/stores/channels.js';
  import { authUser } from '$lib/stores/auth.js';

  const dispatch = createEventDispatcher();

  let query = '';
  let results = [];
  let searching = false;
  let error = '';
  let searchTimeout;

  $: if (query.length >= 2) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(search, 300);
  } else {
    results = [];
  }

  async function search() {
    searching = true;
    error = '';
    try {
      const data = await api(`/users/search?q=${encodeURIComponent(query)}`);
      results = (data.users ?? []).filter((u) => u.uuid !== $authUser?.uuid);
    } catch (e) {
      error = e.message;
    } finally {
      searching = false;
    }
  }

  async function openDM(user) {
    try {
      const ch = await createDM(user.uuid);
      dispatch('created', ch);
    } catch (e) {
      error = e.message;
    }
  }

  function keydown(e) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={keydown} />

<div
    class="modal-backdrop"
    on:click|self={() => dispatch('close')}
    on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title-dm"
    tabindex="-1"
  >
  <div class="modal">
    <div class="modal__header">
      <h2 id="modal-title-dm">New Direct Message</h2>
      <button class="modal__close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>

    <input
      class="search-input"
      bind:value={query}
      placeholder="Search by username or email…"
      autofocus
      aria-label="Search users"
    />

    {#if error}
      <div class="modal__error">{error}</div>
    {/if}

    <div class="results">
      {#if searching}
        <p class="results__status">Searching…</p>
      {:else if query.length >= 2 && results.length === 0}
        <p class="results__status">No users found</p>
      {:else}
        {#each results as user (user.uuid)}
          <button class="user-row" on:click={() => openDM(user)}>
            <div class="user-row__avatar" style="background: #5865F2">
              {user.username[0].toUpperCase()}
            </div>
            <div class="user-row__info">
              <span class="user-row__name">{user.username}</span>
              <span class="user-row__email">{user.email}</span>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }
  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 { font-size: 17px; font-weight: 700; color: var(--color-text); }
  .modal__close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 22px;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .modal__close:hover { color: var(--color-text); }
  .modal__error {
    background: rgba(224,90,78,0.12);
    border: 1px solid rgba(224,90,78,0.4);
    color: #e05a4e;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
  }

  .search-input {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .search-input:focus { border-color: var(--color-accent); }

  .results { display: flex; flex-direction: column; min-height: 60px; }
  .results__status {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 16px 0;
  }

  .user-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 8px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.1s;
    text-align: left;
    width: 100%;
  }
  .user-row:hover { background: var(--color-border); }
  .user-row__avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }
  .user-row__info { display: flex; flex-direction: column; min-width: 0; }
  .user-row__name { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .user-row__email { font-size: 12px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
