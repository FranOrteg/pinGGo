<script>
  import { createEventDispatcher } from 'svelte';
  import { createChannel } from '$lib/stores/channels.js';

  const dispatch = createEventDispatcher();

  let name = '';
  let description = '';
  let isPrivate = false;
  let error = '';
  let loading = false;

  async function submit() {
    name = name.trim();
    if (!name) { error = 'Channel name is required'; return; }
    if (!/^[a-z0-9_-]+$/.test(name)) { error = 'Only lowercase letters, numbers, - and _ allowed'; return; }
    error = '';
    loading = true;
    try {
      const ch = await createChannel(name, description.trim(), isPrivate);
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
      <h2 id="modal-title">Create Channel</h2>
      <button class="modal__close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>

    {#if error}
      <div class="modal__error">{error}</div>
    {/if}

    <form on:submit|preventDefault={submit}>
      <div class="field">
        <label for="ch-name">Name <span class="required">*</span></label>
        <div class="input-prefix">
          <span>#</span>
          <input
            id="ch-name"
            bind:value={name}
            placeholder="e.g. general"
            pattern="[a-z0-9_\-]+"
            maxlength="80"
            required
            autofocus
          />
        </div>
      </div>

      <div class="field">
        <label for="ch-desc">Description <span class="optional">(optional)</span></label>
        <input
          id="ch-desc"
          bind:value={description}
          placeholder="What's this channel about?"
          maxlength="200"
        />
      </div>

      <label class="checkbox-field">
        <input type="checkbox" bind:checked={isPrivate} />
        <span>Make private</span>
      </label>

      <div class="modal__actions">
        <button type="button" class="btn-cancel" on:click={() => dispatch('close')}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? 'Creating…' : 'Create Channel'}
        </button>
      </div>
    </form>
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
    padding: 28px 28px 24px;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 20px;
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
    line-height: 1;
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

  form { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 13px; font-weight: 500; color: var(--color-text-muted); }
  .required { color: var(--color-dnd); }
  .optional { color: var(--color-text-muted); font-weight: 400; font-size: 11px; }

  input {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 9px 12px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus { border-color: var(--color-accent); }

  .input-prefix {
    display: flex;
    align-items: center;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .input-prefix:focus-within { border-color: var(--color-accent); }
  .input-prefix span {
    padding: 9px 10px 9px 12px;
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

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--color-text);
  }

  .modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
  .btn-cancel {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-cancel:hover { border-color: var(--color-text); color: var(--color-text); }
  .btn-primary {
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary:hover:not(:disabled) { opacity: 0.9; }
</style>
