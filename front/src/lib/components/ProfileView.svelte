<script>
  import { authUser } from '$lib/stores/auth.js';
  import { getAvatarUrl, uploadAvatar } from '$lib/api/avatar.js';
  import { api } from '$lib/api/index.js';
  import { getSocket } from '$lib/socket/client.js';
  import { showChannel, getPreviousChannelId } from '$lib/stores/view.js';
  import { setActiveChannel } from '$lib/stores/channels.js';
  import PresenceDot from './PresenceDot.svelte';

  let avatarUrl = null;
  let loadedAvatarKey = null;
  let avatarUploading = false;
  let avatarError = '';

  let editingName = false;
  let nameValue = '';
  let nameSaving = false;
  let nameError = '';

  let statusSaving = false;

  $: user = $authUser;

  $: {
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

  function avatarColor(name = '') {
    const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#4f8ef7','#9B59B6'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  function goBack() {
    showChannel();
    const prev = getPreviousChannelId();
    if (prev) setActiveChannel(prev);
  }

  function startEditName() {
    nameValue = user.username;
    editingName = true;
    nameError = '';
  }

  function cancelEditName() {
    editingName = false;
    nameValue = '';
    nameError = '';
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user.username) {
      editingName = false;
      return;
    }
    nameSaving = true;
    nameError = '';
    try {
      const { user: updated } = await api.patch('/users/me', { username: trimmed });
      authUser.set({ ...user, ...updated });
      editingName = false;
    } catch (err) {
      nameError = err.message || 'Could not update name';
    } finally {
      nameSaving = false;
    }
  }

  function handleNameKeydown(e) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') cancelEditName();
  }

  async function handleAvatarUpload(event) {
    const input = event.currentTarget;
    const [file] = input.files;
    if (!file) return;
    avatarUploading = true;
    avatarError = '';
    try {
      const updated = await uploadAvatar(file);
      authUser.set({ ...user, ...updated });
    } catch (err) {
      avatarError = err.message || 'Could not upload profile photo';
    } finally {
      avatarUploading = false;
      input.value = '';
    }
  }

  async function setStatus(status) {
    if (statusSaving || status === user.status) return;
    statusSaving = true;
    try {
      const { user: updated } = await api.patch('/users/me', { status });
      authUser.set({ ...user, ...updated });
      const socket = getSocket();
      if (socket?.connected) socket.emit('presence:set', { status });
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      statusSaving = false;
    }
  }

  const statusOptions = [
    { value: 'online', label: 'Disponible' },
    { value: 'away', label: 'Ausente' },
    { value: 'dnd', label: 'No molestar' },
  ];
</script>

<div class="profile">
  <header class="profile__header">
    <button class="back-btn" on:click={goBack} title="Volver" aria-label="Volver">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <h1 class="profile__title">Perfil</h1>
  </header>

  <div class="profile__body">
    <div class="profile__avatar-section">
      <div class="profile__avatar-wrap">
        <div class="profile__avatar" style="background: {avatarUrl ? 'var(--color-surface)' : avatarColor(user.username)}">
          {#if avatarUrl}
            <img src={avatarUrl} alt="Profile photo of {user.username}" />
          {:else}
            {user.username[0].toUpperCase()}
          {/if}
          {#if avatarUploading}
            <div class="profile__avatar-overlay">
              <div class="profile__avatar-spinner"></div>
            </div>
          {/if}
        </div>
        <label class="profile__avatar-camera" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" on:change={handleAvatarUpload} disabled={avatarUploading} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </label>
      </div>
      {#if avatarError}
        <p class="profile__error">{avatarError}</p>
      {/if}
    </div>

    <div class="profile__field">
      <span class="profile__label">Nombre</span>
      {#if editingName}
        <div class="profile__name-edit">
          <input
            class="profile__name-input"
            type="text"
            bind:value={nameValue}
            on:keydown={handleNameKeydown}
            disabled={nameSaving}
          />
          <div class="profile__name-actions">
            <button class="profile__btn profile__btn--secondary" on:click={cancelEditName} disabled={nameSaving}>Cancelar</button>
            <button class="profile__btn profile__btn--primary" on:click={saveName} disabled={nameSaving || !nameValue.trim()}>
              {nameSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {#if nameError}
            <p class="profile__error">{nameError}</p>
          {/if}
        </div>
      {:else}
        <div class="profile__name-display">
          <span class="profile__value">{user.username}</span>
          <button class="profile__edit-btn" on:click={startEditName} title="Editar nombre">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      {/if}
    </div>

    <div class="profile__field">
      <span class="profile__label">Estado</span>
      <div class="profile__status-list">
        {#each statusOptions as opt}
          <button
            class="profile__status-option"
            class:profile__status-option--active={user.status === opt.value}
            on:click={() => setStatus(opt.value)}
            disabled={statusSaving}
          >
            <PresenceDot status={opt.value} size="10" />
            <span>{opt.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="profile__field">
      <span class="profile__label">Correo electrónico</span>
      <span class="profile__value profile__value--muted">{user.email}</span>
    </div>
  </div>
</div>

<style>
  .profile {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .profile__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s ease-out, background 0.15s ease-out;
    flex-shrink: 0;
  }
  .back-btn svg { width: 18px; height: 18px; }
  .back-btn:hover { color: var(--color-text); background: var(--color-hover); }

  .profile__title {
    font-size: 17px;
    font-weight: 700;
    color: var(--color-text);
  }

  .profile__body {
    flex: 1;
    overflow-y: auto;
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .profile__avatar-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .profile__avatar-wrap {
    position: relative;
    width: 128px;
    height: 128px;
  }

  .profile__avatar {
    width: 128px;
    height: 128px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
  }
  .profile__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .profile__avatar-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .profile__avatar-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .profile__avatar-wrap:hover .profile__avatar-camera {
    opacity: 1;
  }
  .profile__avatar-camera {
    position: absolute;
    top: 8px;
    right: 8px;
    opacity: 0;
    background: transparent;
    border: none;
    outline: none;
    box-shadow: none;
    color: var(--color-btn-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    transition:
      opacity 0.15s ease-out,
      background 0.15s ease-out,
      color 0.15s ease-out;
  }
  .profile__avatar-camera:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
  .profile__avatar-camera:focus-visible {
    opacity: 1;
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .profile__avatar-camera svg {
    width: 14px;
    height: 14px;
  }
  .profile__avatar-camera input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .profile__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .profile__value {
    font-size: 15px;
    color: var(--color-text);
  }
  .profile__value--muted {
    color: var(--color-text-muted);
  }

  .profile__name-display {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .profile__edit-btn {
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
  .profile__edit-btn svg { width: 15px; height: 15px; }
  .profile__edit-btn:hover { color: var(--color-text); background: var(--color-hover); }

  .profile__name-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile__name-input {
    font-size: 15px;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    outline: none;
    transition: border-color 0.15s ease-out;
  }
  .profile__name-input:focus {
    border-color: var(--color-accent);
  }

  .profile__name-actions {
    display: flex;
    gap: 8px;
  }

  .profile__btn {
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease-out, opacity 0.15s ease-out;
  }
  .profile__btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .profile__btn--primary {
    background: var(--color-accent);
    color: #fff;
  }
  .profile__btn--primary:hover:not(:disabled) { opacity: 0.9; }
  .profile__btn--secondary {
    background: var(--color-hover);
    color: var(--color-text);
  }
  .profile__btn--secondary:hover:not(:disabled) { background: var(--color-hover-strong); }

  .profile__status-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .profile__status-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--color-text);
    text-align: left;
    transition: background 0.15s ease-out, border-color 0.15s ease-out;
  }
  .profile__status-option:hover {
    background: var(--color-hover);
  }
  .profile__status-option--active {
    background: var(--color-hover-strong);
    border-color: var(--color-border);
  }
  .profile__status-option:disabled { opacity: 0.6; cursor: not-allowed; }

  .profile__error {
    font-size: 12px;
    color: var(--color-dnd);
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
