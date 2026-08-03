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
  import {
    isPreviewable,
    isPdf,
    isCsvOrSheet,
    isTextLike,
    isOfficeType,
    getPdfPreviewDataUrl,
    getCsvPreview,
    getTextPreview,
    getOfficeThumbnail,
  } from "$lib/utils/filePreview.js";
  import LinkPreview from "./LinkPreview.svelte";
  import { extractFirstUrl } from "$lib/utils/linkPreview.js";

  import pdfIcon from "$lib/assets/pdf.svg";
  import csvIcon from "$lib/assets/csv.svg";
  import wordIcon from "$lib/assets/word.svg";
  import excelIcon from "$lib/assets/excel.svg";
  import txtIcon from "$lib/assets/txt.svg";
  import xmlIcon from "$lib/assets/xml.svg";
  import pptIcon from "$lib/assets/ppt.svg";
  import exeIcon from "$lib/assets/exe.svg";
  import zipIcon from "$lib/assets/zip.png";

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

  let previewData = null;
  let previewLoading = false;
  let previewLoaded = false;
  let previewError = false;
  let loadedPreviewUuid = null;

  let thumbnailUrl = null;
  let thumbnailLoading = false;
  let thumbnailError = false;
  let loadedThumbUuid = null;

  $: isOwn = message.user_uuid === $authUser?.uuid;
  $: reactions = message.reactions ?? [];
  $: hasImage = message.file_key && isImage(message.file_type);
  $: hasPreviewableFile =
    message.file_key && !hasImage && isPreviewable(message.file_type);
  $: hasOfficeFile =
    message.file_key && !hasImage && isOfficeType(message.file_type);
  $: previewUrl = message.content ? extractFirstUrl(message.content) : null;

  function getFileIcon(fileType) {
    if (!fileType) return txtIcon;
    if (fileType.includes("pdf")) return pdfIcon;
    if (
      fileType.includes("csv") ||
      fileType.includes("sheet") ||
      fileType.includes("excel")
    )
      return excelIcon;
    if (fileType.includes("word") || fileType.includes("doc")) return wordIcon;
    if (fileType.includes("powerpoint") || fileType.includes("ppt"))
      return pptIcon;
    if (fileType.includes("zip") || fileType.includes("archive"))
      return zipIcon;
    if (fileType.includes("xml")) return xmlIcon;
    if (
      fileType.includes("json") ||
      fileType.includes("javascript") ||
      fileType.includes("typescript") ||
      fileType.includes("html") ||
      fileType.includes("css") ||
      fileType.includes("text")
    )
      return txtIcon;
    return txtIcon;
  }

  function loadImage(uuid) {
    if (!uuid || uuid.startsWith("temp-") || loadedUuid === uuid) return;
    loadedUuid = uuid;
    imageUrl = null;
    getFileUrl(uuid)
      .then((url) => {
        if (loadedUuid === uuid) imageUrl = url;
      })
      .catch(() => {});
  }

  $: if (hasImage) loadImage(message.uuid);

  async function loadPreview() {
    if (!hasPreviewableFile) return;
    if (isOfficeType(message.file_type)) return;
    if (!message.uuid || message.uuid.startsWith("temp-")) return;
    if (loadedPreviewUuid === message.uuid) return;

    if (loadedPreviewUuid !== message.uuid) {
      previewData = null;
      previewLoaded = false;
      previewError = false;
      loadedPreviewUuid = message.uuid;
    }

    if (previewLoading) return;

    previewLoading = true;

    try {
      if (isPdf(message.file_type)) {
        const dataUrl = await getPdfPreviewDataUrl(message.uuid);
        previewData = { type: "pdf", dataUrl };
      } else if (isCsvOrSheet(message.file_type)) {
        const csv = await getCsvPreview(message.uuid);
        previewData = { type: "csv", ...csv };
      } else if (isTextLike(message.file_type)) {
        const text = await getTextPreview(message.uuid);
        previewData = { type: "text", content: text };
      }
      previewLoaded = true;
    } catch (err) {
      console.error("[MessageItem] Preview load failed:", err);
      previewError = true;
    } finally {
      previewLoading = false;
    }
  }

  $: if (
    hasPreviewableFile &&
    !isOfficeType(message.file_type) &&
    message.uuid &&
    message.uuid !== loadedPreviewUuid
  ) {
    loadPreview();
  }

  async function loadThumbnail() {
    if (!hasOfficeFile) return;
    if (!message.uuid || message.uuid.startsWith("temp-")) return;
    if (loadedThumbUuid === message.uuid) return;

    if (loadedThumbUuid !== message.uuid) {
      thumbnailUrl = null;
      thumbnailError = false;
      loadedThumbUuid = message.uuid;
    }

    if (thumbnailLoading) return;
    thumbnailLoading = true;

    try {
      const url = await getOfficeThumbnail(message.uuid);
      if (loadedThumbUuid === message.uuid) thumbnailUrl = url;
    } catch (err) {
      console.error("[MessageItem] Thumbnail load failed:", err);
      if (loadedThumbUuid === message.uuid) thumbnailError = true;
    } finally {
      thumbnailLoading = false;
    }
  }

  $: if (hasOfficeFile && message.uuid && message.uuid !== loadedThumbUuid) {
    loadThumbnail();
  }

  function loadAvatar(userUuid, avatarKey) {
    const cacheKey = `${userUuid}:${avatarKey ?? ""}`;
    if (!userUuid || !avatarKey || loadedAvatarKey === cacheKey) return;
    loadedAvatarKey = cacheKey;
    avatarUrl = null;
    getAvatarUrl(userUuid, avatarKey)
      .then((url) => {
        if (loadedAvatarKey === cacheKey) avatarUrl = url;
      })
      .catch(() => {});
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

  function getFileTypeLabel(fileType) {
    if (!fileType) return "File";
    if (fileType.includes("pdf")) return "PDF";
    if (fileType.includes("csv")) return "CSV";
    if (fileType.includes("sheet") || fileType.includes("excel"))
      return "Spreadsheet";
    if (fileType.includes("word") || fileType.includes("doc"))
      return "Document";
    if (fileType.includes("zip") || fileType.includes("archive"))
      return "Archive";
    if (fileType.includes("json")) return "JSON";
    if (fileType.includes("javascript")) return "JavaScript";
    if (fileType.includes("typescript")) return "TypeScript";
    if (fileType.includes("html")) return "HTML";
    if (fileType.includes("css")) return "CSS";
    if (fileType.includes("xml")) return "XML";
    if (fileType.includes("markdown")) return "Markdown";
    if (fileType.includes("text")) return "Text";
    return "File";
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

  function isSvg(fileType) {
    return fileType?.toLowerCase() === "image/svg+xml";
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
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><circle cx="8" cy="8" r="6.5" /><path
              d="M5.5 6.5v.5M10.5 6.5v.5M5.5 10c.5.8 1.5 1.5 2.5 1.5s2-.7 2.5-1.5"
            /></svg
          >
        </button>
        {#if isOwn}
          <button
            class="action-btn"
            aria-label="Edit message"
            title="Edit message"
            on:click={startEdit}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" /></svg
            >
          </button>
          <button
            class="action-btn"
            class:action-btn--danger={deleteConfirm}
            aria-label={deleteConfirm ? "Confirm delete" : "Delete message"}
            title={deleteConfirm
              ? "Click again to confirm delete"
              : "Delete message"}
            on:click={handleDeleteClick}
          >
            {#if deleteConfirm}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path d="M8 3v10M3 8h10" /><circle
                  cx="8"
                  cy="8"
                  r="6.5"
                /></svg
              >
            {:else}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path
                  d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5v8.5a1 1 0 001 1h4a1 1 0 001-1V4.5"
                /></svg
              >
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
        {#if message.edited_at}<span class="message__edited">(edited)</span
          >{/if}
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
        {#if previewUrl}
          <LinkPreview url={previewUrl} />
        {/if}
        {#if message.file_key}
          <div class="attachment">
            {#if isImage(message.file_type)}
              {#if imageUrl}
                <div
                  class="attachment__image-wrapper"
                  class:attachment__image-wrapper--svg={isSvg(message.file_type)}
                >
                  <img
                    src={imageUrl}
                    alt={message.file_name}
                    class="attachment__image"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    class="attachment__download"
                    on:click={handleAttachmentDownload}
                    aria-label="Download image"
                    title="Download"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg
                    >
                  </button>
                </div>
              {/if}
            {:else}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <div
                class="doc-card"
                on:click={handleAttachmentDownload}
                on:keydown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  handleAttachmentDownload()}
                role="button"
                tabindex="0"
                aria-label="Download {message.file_name}"
              >
                <div class="doc-card__head">
                  <div class="doc-card__icon">
                    <img
                      src={getFileIcon(message.file_type)}
                      alt=""
                      class="doc-card__type-icon"
                    />
                  </div>
                  <div class="doc-card__info">
                    <span class="doc-card__name">{message.file_name}</span>
                    <span class="doc-card__type-label">
                      {getFileTypeLabel(
                        message.file_type,
                      )}{#if message.file_size}
                        · {formatFileSize(message.file_size)}{/if}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="doc-card__download"
                    on:click|stopPropagation={handleAttachmentDownload}
                    aria-label="Download {message.file_name}"
                    title="Download"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg
                    >
                  </button>
                </div>
                {#if previewData}
                  <div class="doc-card__preview">
                    {#if previewData.type === "pdf"}
                      <img
                        src={previewData.dataUrl}
                        alt="PDF preview of {message.file_name}"
                        class="attachment__preview-img"
                      />
                    {:else if previewData.type === "csv"}
                      <div class="attachment__preview-table-wrap">
                        <table class="attachment__preview-table">
                          <thead>
                            <tr>
                              {#each previewData.headers as header}
                                <th>{header}</th>
                              {/each}
                            </tr>
                          </thead>
                          <tbody>
                            {#each previewData.rows as row}
                              <tr>
                                {#each row as cell}
                                  <td>{cell}</td>
                                {/each}
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {:else if previewData.type === "text"}
                      <pre class="attachment__preview-code"><code
                          >{previewData.content}</code
                        ></pre>
                    {/if}
                  </div>
                {:else if thumbnailUrl || message._thumbnailUrl}
                  <div class="doc-card__preview">
                    <img
                      src={thumbnailUrl ?? message._thumbnailUrl}
                      alt="Preview of {message.file_name}"
                      class="attachment__preview-img"
                    />
                  </div>
                {:else if hasOfficeFile && !thumbnailError}
                  <div
                    class="doc-card__preview doc-card__preview--loading"
                    aria-hidden="true"
                  >
                    <span class="doc-card__preview-spinner"></span>
                    <span class="doc-card__preview-label">
                      {thumbnailLoading
                        ? "Generating preview…"
                        : "Preview on the way…"}
                    </span>
                  </div>
                {/if}
              </div>
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
        {#if previewUrl}
          <LinkPreview url={previewUrl} />
        {/if}
        {#if message.file_key}
          <div class="attachment">
            {#if isImage(message.file_type)}
              {#if imageUrl}
                <div
                  class="attachment__image-wrapper"
                  class:attachment__image-wrapper--svg={isSvg(message.file_type)}
                >
                  <img
                    src={imageUrl}
                    alt={message.file_name}
                    class="attachment__image"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    class="attachment__download"
                    on:click={handleAttachmentDownload}
                    aria-label="Download image"
                    title="Download"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg
                    >
                  </button>
                </div>
              {/if}
            {:else}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <div
                class="doc-card"
                on:click={handleAttachmentDownload}
                on:keydown={(e) =>
                  (e.key === "Enter" || e.key === " ") &&
                  handleAttachmentDownload()}
                role="button"
                tabindex="0"
                aria-label="Download {message.file_name}"
              >
                <div class="doc-card__head">
                  <div class="doc-card__icon">
                    <img
                      src={getFileIcon(message.file_type)}
                      alt=""
                      class="doc-card__type-icon"
                    />
                  </div>
                  <div class="doc-card__info">
                    <span class="doc-card__name">{message.file_name}</span>
                    <span class="doc-card__type-label">
                      {getFileTypeLabel(
                        message.file_type,
                      )}{#if message.file_size}
                        · {formatFileSize(message.file_size)}{/if}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="doc-card__download"
                    on:click|stopPropagation={handleAttachmentDownload}
                    aria-label="Download {message.file_name}"
                    title="Download"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg
                    >
                  </button>
                </div>
                {#if previewData}
                  <div class="doc-card__preview">
                    {#if previewData.type === "pdf"}
                      <img
                        src={previewData.dataUrl}
                        alt="PDF preview of {message.file_name}"
                        class="attachment__preview-img"
                      />
                    {:else if previewData.type === "csv"}
                      <div class="attachment__preview-table-wrap">
                        <table class="attachment__preview-table">
                          <thead>
                            <tr>
                              {#each previewData.headers as header}
                                <th>{header}</th>
                              {/each}
                            </tr>
                          </thead>
                          <tbody>
                            {#each previewData.rows as row}
                              <tr>
                                {#each row as cell}
                                  <td>{cell}</td>
                                {/each}
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {:else if previewData.type === "text"}
                      <pre class="attachment__preview-code"><code
                          >{previewData.content}</code
                        ></pre>
                    {/if}
                  </div>
                {:else if thumbnailUrl || message._thumbnailUrl}
                  <div class="doc-card__preview">
                    <img
                      src={thumbnailUrl ?? message._thumbnailUrl}
                      alt="Preview of {message.file_name}"
                      class="attachment__preview-img"
                    />
                  </div>
                {:else if hasOfficeFile && !thumbnailError}
                  <div
                    class="doc-card__preview doc-card__preview--loading"
                    aria-hidden="true"
                  >
                    <span class="doc-card__preview-spinner"></span>
                    <span class="doc-card__preview-label">
                      {thumbnailLoading
                        ? "Generating preview…"
                        : "Preview on the way…"}
                    </span>
                  </div>
                {/if}
              </div>
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
    transition:
      background 0.1s ease-out,
      color 0.1s ease-out;
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
    transition:
      background 0.15s ease-out,
      border-color 0.15s ease-out;
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
    margin-bottom: 6px;
  }
  .attachment__image-wrapper {
    position: relative;
    display: inline-block;
    max-width: 360px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .attachment__image {
    display: block;
    max-width: 100%;
    max-height: 280px;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .attachment__image-wrapper--svg {
    border-color: transparent;
  }
  .attachment__image-wrapper .attachment__download {
    position: absolute;
    top: 8px;
    right: 8px;
    opacity: 0;
    background: transparent;
    border: none;
    outline: none;
    box-shadow: none;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition:
      opacity 0.15s ease-out,
      background 0.15s ease-out,
      color 0.15s ease-out;
  }
  .attachment__image-wrapper:hover .attachment__download {
    opacity: 1;
  }
  .attachment__image-wrapper .attachment__download:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
  .attachment__download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    border-radius: 6px;
    transition:
      background 0.15s ease-out,
      color 0.15s ease-out;
  }
  .attachment__download:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text);
  }
  .attachment__download svg {
    width: 14px;
    height: 14px;
  }

  /* ── Preview shared styles ── */
  .attachment__preview-img {
    width: 100%;
    height: auto;
    max-height: 220px;
    object-fit: contain;
    display: block;
  }
  .attachment__preview-table-wrap {
    width: 100%;
    overflow: auto;
    max-height: 200px;
    padding: 8px;
  }
  .attachment__preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    line-height: 1.4;
  }
  .attachment__preview-table th,
  .attachment__preview-table td {
    padding: 3px 8px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .attachment__preview-table th {
    font-weight: 600;
    color: var(--color-text);
    background: rgba(255, 255, 255, 0.04);
    position: sticky;
    top: 0;
  }
  .attachment__preview-table td {
    color: var(--color-text-muted);
  }
  .attachment__preview-code {
    width: 100%;
    margin: 0;
    padding: 10px 12px;
    font-family: "SF Mono", "Fira Code", "Consolas", monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--color-text-muted);
    background: transparent;
    overflow: auto;
    max-height: 200px;
    white-space: pre;
    tab-size: 2;
  }
  .attachment__preview-code code {
    font-family: inherit;
  }

  /* ── Doc card (Slack-style) ── */
  .doc-card {
    display: inline-flex;
    flex-direction: column;
    max-width: 360px;
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    color: var(--color-text);
    text-align: left;
    font: inherit;
    transition: border-color 0.15s ease-out;
    outline: none;
  }
  .doc-card:hover {
    border-color: rgba(255, 255, 255, 0.22);
  }
  .doc-card:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }
  .doc-card__head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    justify-content: space-between;
  }
  .doc-card__icon {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .doc-card__type-icon {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    object-fit: contain;
  }
  .doc-card__info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .doc-card__name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text);
  }
  .doc-card__type-label {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .doc-card__download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 6px;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    transition:
      background 0.15s ease-out,
      color 0.15s ease-out;
  }
  .doc-card__download:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text);
  }
  .doc-card__download svg {
    width: 16px;
    height: 16px;
  }
  .doc-card__preview {
    position: relative;
    border-top: 1px solid var(--color-border);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.02);
    max-height: 220px;
  }
  .doc-card__preview .attachment__preview-img {
    width: 100%;
    height: auto;
    max-height: 220px;
    object-fit: contain;
    display: block;
  }
  .doc-card__preview .attachment__preview-table-wrap {
    width: 100%;
    max-height: 200px;
    align-self: flex-start;
  }
  .doc-card__preview .attachment__preview-code {
    width: 100%;
    max-height: 200px;
    align-self: flex-start;
  }
  .doc-card__preview--loading {
    flex-direction: column;
    gap: 8px;
    padding: 28px 0;
    background: rgba(255, 255, 255, 0.02);
  }
  .doc-card__preview-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: thumbnail-spin 0.8s linear infinite;
  }
  @keyframes thumbnail-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .doc-card__preview-label {
    font-size: 11px;
    color: var(--color-text-muted);
  }
</style>
