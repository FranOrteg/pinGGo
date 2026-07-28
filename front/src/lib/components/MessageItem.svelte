<script>
  import { authUser } from "$lib/stores/auth.js";
  import {
    editMessage,
    deleteMessage,
    toggleReaction,
  } from "$lib/stores/messages.js";
  import EmojiPicker from "./EmojiPicker.svelte";
  import { isImage, formatFileSize } from "$lib/api/upload.js";
  import { downloadFile } from "$lib/api/download.js";
  import { getFileUrl } from "$lib/api/download.js";
  import { getAvatarUrl } from "$lib/api/avatar.js";

  export let message;
  export let showHeader = true;

  let hovered = false;
  let showEmojiPicker = false;
  let editing = false;
  let editContent = "";
  let editLoading = false;
  let deleteConfirm = false;
  let deleteTimer = null;
  let imageUrl = null;
  let loadedUuid = null;
  let avatarUrl = null;
  let loadedAvatarKey = null;

  $: isOwn = message.user_uuid === $authUser?.uuid;
  $: reactions = message.reactions ?? [];
  $: hasImage = message.file_key && isImage(message.file_type);

  function loadImage(uuid) {
    if (!uuid || uuid.startsWith('temp-') || loadedUuid === uuid) return;
    loadedUuid = uuid;
    imageUrl = null;
    getFileUrl(uuid).then((url) => {
      if (loadedUuid === uuid) imageUrl = url;
    }).catch(() => {});
  }

  $: if (hasImage) loadImage(message.uuid);

  function loadAvatar(userUuid, avatarKey) {
    const cacheKey = `${userUuid}:${avatarKey ?? ''}`;
    if (!userUuid || !avatarKey || loadedAvatarKey === cacheKey) return;
    loadedAvatarKey = cacheKey;
    avatarUrl = null;
    getAvatarUrl(userUuid, avatarKey).then((url) => {
      if (loadedAvatarKey === cacheKey) avatarUrl = url;
    }).catch(() => {});
  }

  $: loadAvatar(message.user_uuid, message.avatar_url);

  async function handleAttachmentDownload() {
    try {
      await downloadFile(message.uuid, message.file_name);
    } catch (error) {
      console.error("[MessageItem] attachment download failed", error);
    }
  }

  function avatarColor(name = "") {
    const colors = [
      "#5865F2",
      "#57F287",
      "#FEE75C",
      "#EB459E",
      "#ED4245",
      "#4f8ef7",
      "#9B59B6",
    ];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function startEdit() {
    editContent = message.content;
    editing = true;
    showEmojiPicker = false;
  }

  function cancelEdit() {
    editing = false;
  }

  async function saveEdit() {
    if (!editContent.trim() || editContent.trim() === message.content) {
      editing = false;
      return;
    }
    editLoading = true;
    try {
      await editMessage(message.uuid, editContent.trim());
      editing = false;
    } catch (e) {
      console.error("[MessageItem] edit failed", e);
    } finally {
      editLoading = false;
    }
  }

  function handleEditKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") cancelEdit();
  }

  function handleDeleteClick() {
    if (!deleteConfirm) {
      deleteConfirm = true;
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        deleteConfirm = false;
      }, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    deleteConfirm = false;
    deleteMessage(message.uuid).catch((e) =>
      console.error("[MessageItem] delete failed", e),
    );
  }

  async function handleReaction(emoji) {
    showEmojiPicker = false;
    const existing = reactions.find((r) => r.emoji === emoji);
    const isMine = existing?.userUuids?.includes($authUser?.uuid) ?? false;
    try {
      await toggleReaction(message.uuid, emoji, isMine);
    } catch (e) {
      console.error("[MessageItem] reaction failed", e);
    }
  }

  function onMouseLeave() {
    hovered = false;
    showEmojiPicker = false;
    if (!deleteConfirm) return;
  }
</script>

<div
  class="message"
  class:message--compact={!showHeader}
  on:mouseenter={() => {
    hovered = true;
  }}
  on:mouseleave={onMouseLeave}
  role="listitem"
>
  <!-- Hover action bar -->
  {#if hovered && !editing}
    <div class="message__actions">
      <div class="action-group" role="toolbar" aria-label="Message actions">
        <button
          class="action-btn"
          aria-label="Add reaction"
          title="Add reaction"
          on:click|stopPropagation={() => (showEmojiPicker = !showEmojiPicker)}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 6.5v.5M10.5 6.5v.5M5.5 10c.5.8 1.5 1.5 2.5 1.5s2-.7 2.5-1.5"/></svg>
        </button>
        {#if isOwn}
          <button
            class="action-btn"
            aria-label="Edit message"
            title="Edit message"
            on:click={startEdit}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>
          </button>
          <button
            class="action-btn"
            class:action-btn--danger={deleteConfirm}
            aria-label={deleteConfirm ? 'Confirm delete' : 'Delete message'}
            title={deleteConfirm ? 'Click again to confirm delete' : 'Delete message'}
            on:click={handleDeleteClick}
          >
            {#if deleteConfirm}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/><circle cx="8" cy="8" r="6.5"/></svg>
            {:else}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5v8.5a1 1 0 001 1h4a1 1 0 001-1V4.5"/></svg>
            {/if}
          </button>
        {/if}
      </div>
      {#if showEmojiPicker}
        <div class="emoji-picker-wrapper">
          <EmojiPicker on:select={(e) => handleReaction(e.detail)} />
        </div>
      {/if}
    </div>
  {/if}

  {#if showHeader}
    <div
      class="message__avatar"
      style="background: {avatarColor(message.username)}"
      aria-hidden="true"
    >
      {#if avatarUrl}
        <img src={avatarUrl} alt="" />
      {:else}
        {message.username?.[0]?.toUpperCase() ?? "?"}
      {/if}
    </div>
    <div class="message__body">
      <div class="message__header">
        <span class="message__username">{message.username}</span>
        <span class="message__time">{formatTime(message.created_at)}</span>
        {#if message.edited_at}<span class="message__edited">(edited)</span>{/if}
      </div>

      {#if editing}
        <div class="edit-area">
          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <textarea
            class="edit-textarea"
            bind:value={editContent}
            on:keydown={handleEditKeydown}
            disabled={editLoading}
            rows={2}
          />
          <div class="edit-footer">
            <span class="edit-hint">Enter to save · Esc to cancel</span>
            <div class="edit-btns">
              <button
                class="btn-cancel"
                on:click={cancelEdit}
                disabled={editLoading}>Cancel</button
              >
              <button
                class="btn-save"
                on:click={saveEdit}
                disabled={editLoading}>Save</button
              >
            </div>
          </div>
        </div>
      {:else}
        {#if message.content}
          <p class="message__content">{message.content}</p>
        {/if}
        {#if message.file_key}
          <div class="attachment">
            {#if isImage(message.file_type)}
              {#if imageUrl}
                <img
                  src={imageUrl}
                  alt={message.file_name}
                  class="attachment__image"
                  loading="lazy"
                />
              {/if}
            {:else}
              <button
                type="button"
                class="attachment__file"
                on:click={handleAttachmentDownload}
              >
                <span class="attachment__file-icon">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4.5a1 1 0 00-1 1v11a1 1 0 001 1h7a1 1 0 001-1V6L9 1.5z"/><path d="M9 1.5v4.5H13"/></svg>
                </span>
                <span class="attachment__file-info">
                  <span class="attachment__file-name">{message.file_name}</span>
                  {#if message.file_size}<span class="attachment__file-size"
                      >{formatFileSize(message.file_size)}</span
                    >{/if}
                </span>
                <span class="attachment__download">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/></svg>
                </span>
              </button>
            {/if}
          </div>
        {/if}
      {/if}

      {#if reactions.length > 0}
        <div class="reactions">
          {#each reactions as r (r.emoji)}
            {@const mine = r.userUuids?.includes($authUser?.uuid) ?? false}
            <button
              class="reaction-chip"
              class:reaction-chip--mine={mine}
              on:click={() => handleReaction(r.emoji)}
              title="{r.count} reaction{r.count !== 1 ? 's' : ''}"
            >
              {r.emoji}<span class="reaction-count">{r.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Compact (grouped) mode -->
    <span class="message__time-hover">{formatTime(message.created_at)}</span>
    <div class="message__body-compact">
      {#if editing}
        <div class="edit-area">
          <!-- svelte-ignore element_invalid_self_closing_tag -->
          <textarea
            class="edit-textarea"
            bind:value={editContent}
            on:keydown={handleEditKeydown}
            disabled={editLoading}
            rows={2}
          />
          <div class="edit-footer">
            <span class="edit-hint">Enter to save · Esc to cancel</span>
            <div class="edit-btns">
              <button
                class="btn-cancel"
                on:click={cancelEdit}
                disabled={editLoading}>Cancel</button
              >
              <button
                class="btn-save"
                on:click={saveEdit}
                disabled={editLoading}>Save</button
              >
            </div>
          </div>
        </div>
      {:else}
        {#if message.content}
          <p class="message__content">
            {message.content}{#if message.edited_at}
              <span class="message__edited">(edited)</span>{/if}
          </p>
        {/if}
        {#if message.file_key}
          <div class="attachment">
            {#if isImage(message.file_type)}
              {#if imageUrl}
                <img
                  src={imageUrl}
                  alt={message.file_name}
                  class="attachment__image"
                  loading="lazy"
                />
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span
                  class="attachment__download"
                  style="cursor:pointer"
                  on:click={() => downloadFile(message.uuid, message.file_name)}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/></svg>
                </span>
              {/if}
            {:else}
              <button
                type="button"
                class="attachment__file"
                on:click={handleAttachmentDownload}
              >
                <span class="attachment__file-icon">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4.5a1 1 0 00-1 1v11a1 1 0 001 1h7a1 1 0 001-1V6L9 1.5z"/><path d="M9 1.5v4.5H13"/></svg>
                </span>
                <span class="attachment__file-info">
                  <span class="attachment__file-name">{message.file_name}</span>
                  {#if message.file_size}<span class="attachment__file-size"
                      >{formatFileSize(message.file_size)}</span
                    >{/if}
                </span>
                <span class="attachment__download">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/></svg>
                </span>
              </button>
            {/if}
          </div>
        {/if}
      {/if}

      {#if reactions.length > 0}
        <div class="reactions">
          {#each reactions as r (r.emoji)}
            {@const mine = r.userUuids?.includes($authUser?.uuid) ?? false}
            <button
              class="reaction-chip"
              class:reaction-chip--mine={mine}
              on:click={() => handleReaction(r.emoji)}
              title="{r.count} reaction{r.count !== 1 ? 's' : ''}"
            >
              {r.emoji}<span class="reaction-count">{r.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .message {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 16px 2px;
    border-radius: 4px;
    position: relative;
    transition: background 0.15s ease-out;
  }
  .message:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  /* ── Avatar ── */
  .message__avatar {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
    margin-top: 1px;
    overflow: hidden;
  }
  .message__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* ── Body ── */
  .message__body {
    flex: 1;
    min-width: 0;
  }
  .message__body-compact {
    flex: 1;
    min-width: 0;
  }

  .message__header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 1px;
  }
  .message__username {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }
  .message__time {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .message__edited {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .message__content {
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
    margin: 0;
  }

  /* ── Compact ── */
  .message--compact {
    padding-left: 58px;
  }
  .message__time-hover {
    position: absolute;
    left: 16px;
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity 0.15s ease-out;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    width: 32px;
    text-align: center;
  }
  .message:hover .message__time-hover {
    opacity: 1;
  }

  /* ── Hover action bar ── */
  .message__actions {
    position: absolute;
    top: -12px;
    right: 12px;
    z-index: 10;
    opacity: 0;
    transform: translateY(2px);
    animation: actions-in 0.15s ease-out forwards;
  }
  @keyframes actions-in {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .action-group {
    display: flex;
    align-items: center;
    gap: 1px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 2px 2px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s ease-out, color 0.1s ease-out;
  }
  .action-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }
  .action-btn:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }
  .action-btn svg {
    width: 14px;
    height: 14px;
  }
  .action-btn--danger {
    color: var(--color-dnd);
  }
  .action-btn--danger:hover {
    background: rgba(237, 66, 69, 0.15);
    color: var(--color-dnd);
  }

  /* ── Emoji picker anchor ── */
  .emoji-picker-wrapper {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
  }

  /* ── Edit area ── */
  .edit-area {
    margin-top: 2px;
  }
  .edit-textarea {
    width: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.5;
    padding: 6px 10px;
    resize: none;
    box-sizing: border-box;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease-out;
  }
  .edit-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .edit-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .edit-btns {
    display: flex;
    gap: 6px;
  }
  .btn-save,
  .btn-cancel {
    font-size: 12px;
    border: none;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.1s ease-out;
  }
  .btn-save {
    background: var(--color-accent);
    color: #fff;
  }
  .btn-save:hover {
    opacity: 0.9;
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn-cancel {
    background: var(--color-border);
    color: var(--color-text-muted);
  }
  .btn-cancel:hover {
    background: var(--color-text-muted);
    color: var(--color-text);
  }

  /* ── Reactions ── */
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .reaction-chip {
    display: flex;
    align-items: center;
    gap: 3px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 1px 7px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s ease-out, border-color 0.15s ease-out;
  }
  .reaction-chip:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .reaction-chip--mine {
    background: rgba(255, 255, 255, 0.1);
  }
  .reaction-count {
    font-size: 12px;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  /* ── Attachments ── */
  .attachment {
    margin-top: 6px;
  }
  .attachment__image {
    max-width: 360px;
    max-height: 280px;
    border-radius: 8px;
    display: block;
    object-fit: contain;
    border: 1px solid var(--color-border);
  }
  .attachment__file {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px 12px;
    text-decoration: none;
    color: var(--color-text);
    max-width: 320px;
    transition: border-color 0.15s ease-out;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .attachment__file:hover {
    border-color: var(--color-accent);
  }
  .attachment__file-icon {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
  .attachment__file-icon svg {
    width: 18px;
    height: 18px;
  }
  .attachment__file-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .attachment__file-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .attachment__file-size {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .attachment__download {
    margin-left: auto;
    color: var(--color-accent);
    flex-shrink: 0;
  }
  .attachment__download svg {
    width: 14px;
    height: 14px;
  }
</style>
