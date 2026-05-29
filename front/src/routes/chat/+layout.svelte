<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, authReady } from '$lib/stores/auth.js';
  import { loadChannels } from '$lib/stores/channels.js';
  import { bindSocketListeners } from '$lib/stores/messages.js';
  import { bindPresenceListeners } from '$lib/stores/presence.js';
  import { getSocket } from '$lib/socket/client.js';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let ready = false;

  onMount(() => {
    let cleanup;
    const unsub = authReady.subscribe(async (isReady) => {
      if (!isReady) return;
      unsub();

      if (!$isAuthenticated) {
        goto('/login', { replaceState: true });
        return;
      }

      await loadChannels();

      const socket = getSocket();
      if (socket) {
        const c1 = bindSocketListeners(socket);
        const c2 = bindPresenceListeners(socket);
        cleanup = () => { c1?.(); c2?.(); };
      }

      ready = true;
    });

    return () => { unsub(); cleanup?.(); };
  });
</script>

{#if ready}
  <div class="app-shell">
    <Sidebar />
    <main class="main-content">
      <slot />
    </main>
  </div>
{:else}
  <div class="loading-screen">
    <div class="spinner"></div>
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    height: 100dvh;
    overflow: hidden;
  }
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg);
  }
  .loading-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    background: var(--color-bg);
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
