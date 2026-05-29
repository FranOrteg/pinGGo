<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  const EMOJIS = [
    '👍','👎','❤️','😂','😮','😢','🎉','🚀',
    '👀','🔥','✅','💯','🙏','😊','😎','🤔',
    '😅','💪','🎯','💡','⚡','🌟','😍','🤯',
    '🤝','👏','🫡','💀','🥲','🫂','😤','🤌',
  ];

  function select(emoji) {
    dispatch('select', emoji);
  }
</script>

<div class="emoji-picker" role="listbox" aria-label="Pick a reaction">
  {#each EMOJIS as emoji}
    <button
      class="emoji-btn"
      role="option"
      aria-selected="false"
      on:click|stopPropagation={() => select(emoji)}
      title={emoji}
    >{emoji}</button>
  {/each}
</div>

<style>
  .emoji-picker {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    width: max-content;
  }

  .emoji-btn {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    line-height: 1;
    transition: background 0.1s, transform 0.1s;
  }
  .emoji-btn:hover {
    background: var(--color-border);
    transform: scale(1.2);
  }
</style>
