<script>
  import { sendMessage, notifyTyping } from '$lib/stores/messages.js';
  import { uploadFile, formatFileSize } from '$lib/api/upload.js';

  export let channelId;

  let value = '';
  let error = '';
  let textarea;
  let fileInput;

  // File attachment state
  let pendingFile = null;   // File object
  let uploadProgress = 0;   // 0–100
  let uploading = false;

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput() {
    error = '';
    notifyTyping(channelId);
    autoResize();
  }

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFile = file;
    error = '';
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function removeFile() {
    pendingFile = null;
    uploadProgress = 0;
  }

  async function send() {
    const content = value.trim();
    if (!content && !pendingFile) return;

    try {
      uploading = !!pendingFile;
      let attachment = null;

      if (pendingFile) {
        attachment = await uploadFile(pendingFile, channelId, (p) => (uploadProgress = p));
        console.log('Attachment:', attachment);
      }

      sendMessage(channelId, content, attachment);
      value = '';
      pendingFile = null;
      uploadProgress = 0;
      if (textarea) { textarea.style.height = 'auto'; textarea.focus(); }
    } catch (e) {
      error = e.message;
    } finally {
      uploading = false;
    }
  }
</script>

<div class="input-area">
  {#if error}
    <p class="input-error">{error}</p>
  {/if}

  {#if pendingFile}
    <div class="file-preview">
      <span class="file-preview__icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4.5a1 1 0 00-1 1v11a1 1 0 001 1h7a1 1 0 001-1V6L9 1.5z"/><path d="M9 1.5v4.5H13"/></svg>
      </span>
      <span class="file-preview__name">{pendingFile.name}</span>
      <span class="file-preview__size">({formatFileSize(pendingFile.size)})</span>
      {#if uploading}
        <div class="file-preview__bar">
          <div class="file-preview__fill" style="width:{uploadProgress}%"></div>
        </div>
        <span class="file-preview__pct">{uploadProgress}%</span>
      {:else}
        <button class="file-preview__remove" on:click={removeFile} aria-label="Remove file">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      {/if}
    </div>
  {/if}

  <div class="input-box">
    <button
      class="attach-btn"
      on:click={() => fileInput.click()}
      disabled={uploading}
      aria-label="Attach file"
      title="Attach file"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 7.5l-6 6a3.5 3.5 0 01-5-5l6-6a2 2 0 013 3l-6 6a.5.5 0 01-.7-.7l5.5-5.5"/></svg>
    </button>

    <input
      bind:this={fileInput}
      type="file"
      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv,.mp4,.webm,.mp3,.ogg,.wav"
      class="file-input-hidden"
      on:change={onFileSelected}
    />

    <textarea
      bind:this={textarea}
      bind:value
      on:keydown={handleKeydown}
      on:input={handleInput}
      placeholder="Message…"
      rows="1"
      aria-label="Message input"
      disabled={uploading}
    ></textarea>

    <button
      class="send-btn"
      on:click={send}
      disabled={uploading || (!value.trim() && !pendingFile)}
      aria-label="Send message"
    >
      {#if uploading}
        <svg class="send-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1"/></svg>
      {:else}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M4 7l4-4 4 4"/></svg>
      {/if}
    </button>
  </div>
  <p class="input-hint">Enter to send · Shift + Enter for new line</p>
</div>

<style>
  .input-area {
    padding: 8px 16px;
    flex-shrink: 0;
  }

  .file-preview {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 6px 10px;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--color-text);
  }
  .file-preview__icon {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
  .file-preview__icon svg {
    width: 14px;
    height: 14px;
  }
  .file-preview__name {
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-preview__size {
    color: var(--color-text-muted);
  }
  .file-preview__remove {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    padding: 2px 4px;
    margin-left: auto;
    transition: color 0.15s ease-out;
  }
  .file-preview__remove svg {
    width: 12px;
    height: 12px;
  }
  .file-preview__remove:hover {
    color: var(--color-dnd);
  }
  .file-preview__bar {
    flex: 1;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .file-preview__fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 2px;
    transition: width 0.15s ease-out;
  }
  .file-preview__pct {
    font-size: 11px;
    color: var(--color-text-muted);
    min-width: 32px;
    text-align: right;
  }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 8px 8px 8px 8px;
    transition: border-color 0.15s ease-out, box-shadow 0.15s ease-out;
  }
  .input-box:focus-within {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px rgba(79, 142, 247, 0.15);
  }

  .attach-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: color 0.15s ease-out, background 0.15s ease-out;
  }
  .attach-btn svg {
    width: 18px;
    height: 18px;
  }
  .attach-btn:hover:not(:disabled) {
    color: var(--color-text);
    background: var(--color-border);
  }
  .attach-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .file-input-hidden { display: none; }

  textarea {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--color-text);
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    min-height: 22px;
    max-height: 180px;
    font-family: inherit;
    padding-left: 6px;
  }
  textarea::placeholder { color: var(--color-text-muted); }
  textarea:disabled { opacity: 0.6; }

  .send-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: var(--color-accent);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s ease-out;
  }
  .send-btn svg {
    width: 16px;
    height: 16px;
  }
  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .send-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .send-spinner {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .input-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 5px;
    padding-left: 2px;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  }
  .input-box:focus-within ~ .input-hint {
    opacity: 1;
  }

  .input-error {
    font-size: 12px;
    color: var(--color-dnd);
    margin-bottom: 6px;
  }
</style>
