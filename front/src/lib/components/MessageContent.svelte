<script>
  import { splitByUrl } from '$lib/utils/urlText.js';

  export let content;

  $: parts = splitByUrl(content);
</script>

{#each parts as part, i (i)}
  {#if part.type === 'url'}
    <a
      href={part.value}
      target="_blank"
      rel="noopener noreferrer"
      class="message__link"
      on:click|stopPropagation
    >{part.value}</a>
  {:else}
    {part.value}
  {/if}
{/each}

<style>
  .message__link {
    color: var(--color-accent);
    text-decoration: none;
  }
  .message__link:hover {
    text-decoration: underline;
  }
</style>
