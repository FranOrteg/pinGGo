<script>
  import { createEventDispatcher } from 'svelte';
  import { createChannel } from '$lib/stores/channels.js';
  import { api } from '$lib/api/index.js';
  import { authUser } from '$lib/stores/auth.js';

  const dispatch = createEventDispatcher();

  let name = '';
  let description = '';
  let isPrivate = false;
  let error = '';
  let loading = false;

  // Member picker state
  let memberQuery = '';
  let memberResults = [];
  let searchingMembers = false;
  let selectedMembers = []; // [{ uuid, username }]
  let memberSearchTimeout;

  $: if (memberQuery.length >= 2) {
    clearTimeout(memberSearchTimeout);
    memberSearchTimeout = setTimeout(searchMembers, 300);
  } else {
    memberResults = [];
  }

  async function searchMembers() {
    searchingMembers = true;
    try {
      const data = await api.get(`/users/search?q=${encodeURIComponent(memberQuery)}`);
      const selectedUuids = new Set(selectedMembers.map((m) => m.uuid));
      memberResults = (data.users ?? []).filter(
        (u) => u.uuid !== $authUser?.uuid && !selectedUuids.has(u.uuid)
      );
    } catch {
      memberResults = [];
    } finally {
      searchingMembers = false;
    }
  }

  function addMember(user) {
    selectedMembers = [...selectedMembers, user];
    memberResults = memberResults.filter((u) => u.uuid !== user.uuid);
    memberQuery = '';
  }

  function removeMember(uuid) {
    selectedMembers = selectedMembers.filter((u) => u.uuid !== uuid);
  }

  function setVisibility(privateChannel) {
    isPrivate = privateChannel;
    if (!privateChannel) {
      memberQuery = '';
      memberResults = [];
      selectedMembers = [];
    }
  }

  async function submit() {
    name = name.trim();
    if (!name) { error = 'Channel name is required'; return; }
    if (!/^[a-z0-9_-]+$/.test(name)) { error = 'Only lowercase letters, numbers, - and _ allowed'; return; }
    error = '';
    loading = true;
    try {
      const memberUuids = selectedMembers.map((u) => u.uuid);
      const ch = await createChannel(name, description.trim(), isPrivate, memberUuids);
      dispatch('created', ch);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function keydown(e) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={keydown} />

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
    class="modal-backdrop"
    on:click|self={() => dispatch('close')}
    on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
  <div class="modal">
    <div class="modal__header">
      <div>
        <h2 id="modal-title">Create a channel</h2>
        <p class="modal__subtitle">Bring the right people and conversations together.</p>
      </div>
      <button class="modal__close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>

    {#if error}
      <div class="modal__error">{error}</div>
    {/if}

    <form on:submit|preventDefault={submit}>
      <div class="field">
        <label for="ch-name">Channel name <span class="required">*</span></label>
        <div class="input-prefix">
          <span>#</span>
          <input
            id="ch-name"
            bind:value={name}
            placeholder="e.g. general"
            pattern="[a-z0-9_\-]+"
            maxlength="80"
            required
          />
        </div>
      </div>

      <div class="field">
        <label for="ch-desc">Description</label>
        <input
          id="ch-desc"
          bind:value={description}
          placeholder="What's this channel about?"
          maxlength="200"
        />
      </div>

      <div class="visibility-field">
        <span class="visibility-label">Channel visibility</span>
        <div class="visibility-options" role="group" aria-label="Channel visibility">
          <button
            type="button"
            class="visibility-option"
            class:visibility-option--selected={!isPrivate}
            aria-pressed={!isPrivate}
            on:click={() => setVisibility(false)}
          >
            <span class="visibility-option__icon" aria-hidden="true">#</span>
            <span><strong>Public</strong><small>Anyone can find and join</small></span>
          </button>
          <button
            type="button"
            class="visibility-option"
            class:visibility-option--selected={isPrivate}
            aria-pressed={isPrivate}
            on:click={() => setVisibility(true)}
          >
            <span class="visibility-option__icon" aria-hidden="true">
              <svg class="icon-lock" viewBox="0 -960 960 960"><path d="M480-380Zm80 220H260q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q106 0 184.5 68.5T757-560q-21 0-40.5 4.5T679-543q-8-75-65-126t-134-51q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h300v80Zm120 0q-17 0-28.5-11.5T640-200v-120q0-17 11.5-28.5T680-360v-40q0-33 23.5-56.5T760-480q33 0 56.5 23.5T840-400v40q17 0 28.5 11.5T880-320v120q0 17-11.5 28.5T840-160H680Zm40-200h80v-40q0-17-11.5-28.5T760-440q-17 0-28.5 11.5T720-400v40Z"/></svg>
            </span>
            <span><strong>Private</strong><small>Only invited people can access</small></span>
          </button>
        </div>
      </div>

      {#if isPrivate}
        <div class="field">
          <label for="ch-members">Members</label>
          <input
            id="ch-members"
            bind:value={memberQuery}
            placeholder="Search users to add…"
            autocomplete="off"
          />
          {#if searchingMembers}
            <p class="member-status">Searching…</p>
          {:else if memberQuery.length >= 2 && memberResults.length > 0}
            <div class="member-results">
              {#each memberResults as user (user.uuid)}
                <button type="button" class="member-result" on:click={() => addMember(user)}>
                  {user.username}
                </button>
              {/each}
            </div>
          {/if}
          {#if selectedMembers.length > 0}
            <div class="member-chips">
              {#each selectedMembers as user (user.uuid)}
                <span class="member-chip">
                  {user.username}
                  <button type="button" on:click={() => removeMember(user.uuid)} aria-label="Remove {user.username}">×</button>
                </span>
              {/each}
            </div>
          {/if}
          <p class="field-hint">Only selected users will be able to see and access this private channel.</p>
        </div>
      {:else}
        <p class="field-hint">Public channels are visible to everyone in your workspace.</p>
      {/if}

      <div class="modal__actions">
        <button type="button" class="btn-cancel" on:click={() => dispatch('close')}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? 'Creating…' : isPrivate ? 'Create private channel' : 'Create public channel'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-overlay);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }
  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    box-shadow: 0 24px 80px var(--color-card-shadow);
    overflow: hidden;
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 23px 24px 18px;
    border-bottom: 1px solid var(--color-border);
  }
  h2 { font-size: 19px; line-height: 1.3; font-weight: 700; color: var(--color-text); }
  .modal__subtitle { margin-top: 4px; color: var(--color-text-muted); font-size: 13px; line-height: 1.4; }
  .modal__close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 25px;
    cursor: pointer;
    line-height: 1;
    padding: 0 3px;
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
    margin: 16px 24px 0;
  }

  form { display: flex; flex-direction: column; gap: 18px; padding: 20px 24px 24px; }
  .field { display: flex; flex-direction: column; gap: 7px; }
  .field label, .visibility-label { font-size: 13px; font-weight: 600; color: var(--color-text); }
  .required { color: var(--color-dnd); }

  input {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 2px rgba(79, 142, 247, .16); }

  .input-prefix {
    display: flex;
    align-items: center;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .input-prefix:focus-within { border-color: var(--color-accent); }
  .input-prefix span {
    padding: 10px 10px 10px 13px;
    color: var(--color-text-muted);
    font-size: 16px;
  }
  .input-prefix input {
    border: none;
    border-radius: 0;
    padding-left: 4px;
    flex: 1;
  }
  .input-prefix input:focus { outline: none; }

  .visibility-field { display: flex; flex-direction: column; gap: 8px; }
  .visibility-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .visibility-option {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--color-border);
    border-radius: 9px;
    background: var(--color-bg);
    color: var(--color-text-muted);
    cursor: pointer;
    text-align: left;
    transition: border-color .15s, background .15s, box-shadow .15s;
  }
  .visibility-option:hover { border-color: var(--color-border); }
  .visibility-option--selected { border-color: var(--color-accent); background: rgba(79, 142, 247, .1); box-shadow: inset 0 0 0 1px rgba(79, 142, 247, .35); }
  .visibility-option__icon { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--color-hover); color: var(--color-text); font-size: 14px; flex-shrink: 0; }
  .icon-lock { width: 18px; height: 18px; fill: currentColor; }
  .visibility-option span:last-child { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .visibility-option strong { color: var(--color-text); font-size: 13px; }
  .visibility-option small { color: var(--color-text-muted); font-size: 11px; line-height: 1.25; }
  .visibility-option--selected small { color: #a9c8ff; }
  .visibility-option:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

  .member-status {
    font-size: 12px;
    color: var(--color-text-muted);
    margin: 2px 0 0;
  }
  .field-hint {
    font-size: 12px;
    color: var(--color-text-muted);
    margin: -4px 0 0;
    padding: 9px 11px;
    border-left: 2px solid var(--color-accent);
    border-radius: 4px;
    background: rgba(79, 142, 247, .07);
    margin-top: 2px;
  }
  .member-results {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 6px;
  }
  .member-result {
    background: none;
    border: none;
    text-align: left;
    padding: 7px 10px;
    font-size: 13px;
    color: var(--color-text);
    cursor: pointer;
  }
  .member-result:hover { background: var(--color-border); }
  .member-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .member-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    padding: 4px 6px 4px 10px;
    font-size: 12px;
    color: var(--color-text);
  }
  .member-chip button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }
  .member-chip button:hover { color: var(--color-dnd); }

  .modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; padding-top: 18px; border-top: 1px solid var(--color-border); }
  .btn-cancel {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    border-radius: 7px;
    padding: 9px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-cancel:hover { border-color: var(--color-text); color: var(--color-text); }
  .btn-primary {
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 9px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
</style>
