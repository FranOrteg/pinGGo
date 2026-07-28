<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { messagesByChannel, typingByChannel, loadMessages } from '$lib/stores/messages.js';
  import MessageItem from './MessageItem.svelte';

  export let channel;

  let container;
  let loading = false;
  let hasMore = true;
  let wasAtBottom = true;
  let previousChannelId = null;

  $: messages = $messagesByChannel[channel?.uuid] ?? [];
  $: typing = $typingByChannel[channel?.uuid] ?? [];
  $: typingText = formatTyping(typing);

  $: if (channel?.uuid && channel.uuid !== previousChannelId) {
    previousChannelId = channel.uuid;
    hasMore = true;
    fetchInitial();
  }

  async function fetchInitial() {
    loading = true;
    try {
      const result = await loadMessages(channel.uuid);
      hasMore = result.hasMore;
    } finally {
      loading = false;
      setTimeout(scrollToBottom, 50);
    }
  }

  async function loadOlder() {
    if (!hasMore || loading || !messages.length) return;
    loading = true;

    const oldScrollHeight = container?.scrollHeight ?? 0;
    try {
      const result = await loadMessages(channel.uuid, messages[0]?.uuid);
      hasMore = result.hasMore;
      // Restore scroll position after prepending messages
      setTimeout(() => {
        if (container) container.scrollTop = container.scrollHeight - oldScrollHeight;
      }, 0);
    } finally {
      loading = false;
    }
  }

  function scrollToBottom() {
    if (container) container.scrollTop = container.scrollHeight;
  }

  function handleScroll() {
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    wasAtBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (scrollTop < 80 && !loading && hasMore) loadOlder();
  }

  afterUpdate(() => {
    if (wasAtBottom) scrollToBottom();
  });

  // Group consecutive messages from the same user (within 5 min)
  function shouldShowHeader(msg, prev) {
    if (!prev) return true;
    if (msg.user_uuid !== prev.user_uuid) return true;
    const diff = new Date(msg.created_at) - new Date(prev.created_at);
    return diff > 5 * 60 * 1000;
  }

  function formatTyping(names) {
    if (!names.length) return '';
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return 'Several people are typing…';
  }
</script>

<div class="message-list" bind:this={container} on:scroll={handleScroll}>
  {#if loading && messages.length === 0}
    <div class="list-status">Loading messages…</div>
  {:else if messages.length === 0}
    <div class="list-status">No messages yet. Say hello!</div>
  {:else}
    {#if hasMore}
      <div class="load-more-area">
        {#if loading}
          <span class="list-status">Loading…</span>
        {:else}
          <button class="load-more-btn" on:click={loadOlder}>Load older messages</button>
        {/if}
      </div>
    {/if}
    {#each messages as msg, i (msg.uuid)}
      <MessageItem
        message={msg}
        showHeader={shouldShowHeader(msg, messages[i - 1])}
      />
    {/each}
  {/if}
</div>

{#if typingText}
  <div class="typing-bar" aria-live="polite">
    <span class="typing-dots">
      <span></span><span></span><span></span>
    </span>
    {typingText}
  </div>
{/if}

<style>
  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0 4px;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
  }
  .list-status {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 24px 0;
  }
  .load-more-area {
    display: flex;
    justify-content: center;
    padding: 12px 0;
  }
  .load-more-btn {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    border-radius: 6px;
    padding: 5px 14px;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s ease-out, color 0.15s ease-out;
  }
  .load-more-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .typing-bar {
    height: 20px;
    padding: 0 16px;
    font-size: 12px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .typing-dots {
    display: flex;
    gap: 3px;
    align-items: center;
  }
  .typing-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-text-muted);
    animation: pulse 1.4s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse {
    0%, 60%, 100% { opacity: 0.4; transform: scale(1); }
    30% { opacity: 1; transform: scale(1.1); }
  }
</style>
