<script>
  import { sendMessage, notifyTyping } from '$lib/stores/messages.js';

  export let channelId;

  let value = '';
  let error = '';
  let textarea;

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

  function send() {
    const content = value.trim();
    if (!content) return;
    try {
      sendMessage(channelId, content);
      value = '';
      if (textarea) { textarea.style.height = 'auto'; textarea.focus(); }
    } catch (e) {
      error = e.message;
    }
  }
</script>

<div class="input-area">
  {#if error}
    <p class="input-error">{error}</p>
  {/if}
  <div class="input-box">
    <textarea
      bind:this={textarea}
      bind:value
      on:keydown={handleKeydown}
      on:input={handleInput}
      placeholder="Message…"
      rows="1"
      aria-label="Message input"
    ></textarea>
    <button
      class="send-btn"
      on:click={send}
      disabled={!value.trim()}
      aria-label="Send message"
    >
      ↑
    </button>
  </div>
  <p class="input-hint">Enter to send · Shift+Enter for new line</p>
</div>

<style>
  .input-area {
    padding: 8px 16px 12px;
    flex-shrink: 0;
  }
  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 8px 8px 8px 14px;
    transition: border-color 0.15s;
  }
  .input-box:focus-within { border-color: var(--color-accent); }

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
  }
  textarea::placeholder { color: var(--color-text-muted); }

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
