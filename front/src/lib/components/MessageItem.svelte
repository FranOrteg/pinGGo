<script>
  export let message;
  export let showHeader = true;

  function avatarColor(name = '') {
    const colors = ['#5865F2','#57F287','#FEE75C','#EB459E','#ED4245','#4f8ef7','#9B59B6'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  }
</script>

<div class="message" class:message--compact={!showHeader}>
  {#if showHeader}
    <div
      class="message__avatar"
      style="background: {avatarColor(message.username)}"
      aria-hidden="true"
    >
      {message.username?.[0]?.toUpperCase() ?? '?'}
    </div>
    <div class="message__body">
      <div class="message__header">
        <span class="message__username">{message.username}</span>
        <span class="message__time">{formatTime(message.created_at)}</span>
      </div>
      <p class="message__content">{message.content}</p>
    </div>
  {:else}
    <span class="message__time-hover">{formatTime(message.created_at)}</span>
    <p class="message__content message__content--compact">{message.content}</p>
  {/if}
</div>

<style>
  .message {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 3px 16px;
    border-radius: 4px;
    transition: background 0.1s;
    position: relative;
  }
  .message:hover { background: rgba(255,255,255,0.03); }

  .message__avatar {
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
    margin-top: 2px;
  }
  .message__body { flex: 1; min-width: 0; }
  .message__header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }
  .message__username {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }
  .message__time {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .message__content {
    font-size: 14px;
    color: var(--color-text);
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
  }

  /* Compact (grouped) messages */
  .message--compact { padding-left: 62px; }
  .message__content--compact { margin: 0; }

  .message__time-hover {
    position: absolute;
    left: 16px;
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity 0.1s;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    width: 36px;
    text-align: center;
  }
  .message:hover .message__time-hover { opacity: 1; }
</style>
