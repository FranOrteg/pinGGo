<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authReady, isAuthenticated } from '$lib/stores/auth.js';

  onMount(() => {
    const unsub = authReady.subscribe((ready) => {
      if (!ready) return;
      unsub();
      goto($isAuthenticated ? '/chat' : '/login', { replaceState: true });
    });
    return unsub;
  });
</script>

<div class="splash">
  <div class="spinner"></div>
</div>

<style>
  .splash {
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
  }
  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
