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
        attachment = await uploadFile(pendingFile, (p) => (uploadProgress = p));
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
      <span class="file-preview__icon">📎</span>
      <span class="file-preview__name">{pendingFile.name}</span>
      <span class="file-preview__size">({formatFileSize(pendingFile.size)})</span>
      {#if uploading}
        <div class="file-preview__bar">
          <div class="file-preview__fill" style="width:{uploadProgress}%"></div>
        </div>
        <span class="file-preview__pct">{uploadProgress}%</span>
      {:else}
        <button class="file-preview__remove" on:click={removeFile} aria-label="Remove file">✕</button>
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
    >📎</button>

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
      {#if uploading}⏳{:else}↑{/if}
    </button>
  </div>
  <p class="input-hint">Enter to send · Shift+Enter for new line</p>
</div>

<style>
  .input-area {
    padding: 8px 16px 12px;
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
  .file-preview__name { font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-preview__size { color: var(--color-text-muted); }
  .file-preview__remove { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: 12px; padding: 2px 4px; margin-left: auto; }
  .file-preview__remove:hover { color: var(--color-dnd); }
  .file-preview__bar { flex: 1; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; }
  .file-preview__fill { height: 100%; background: var(--color-accent); border-radius: 2px; transition: width 0.2s; }
  .file-preview__pct { font-size: 11px; color: var(--color-text-muted); min-width: 32px; text-align: right; }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 8px 8px 8px 8px;
    transition: border-color 0.15s;
  }
  .input-box:focus-within { border-color: var(--color-accent); }

  .attach-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  .attach-btn:hover:not(:disabled) { opacity: 1; }
  .attach-btn:disabled { opacity: 0.3; cursor: not-allowed; }

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
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .send-btn:hover:not(:disabled) { opacity: 0.85; }

  .input-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 5px;
    padding-left: 2px;
  }
  .input-error {
    font-size: 12px;
    color: var(--color-dnd);
    margin-bottom: 6px;
  }
</style>
