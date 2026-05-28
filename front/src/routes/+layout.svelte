<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { refreshToken } from '$lib/stores/auth.js';

  onMount(async () => {
    // Silently restore session on page load via refresh token cookie
    await refreshToken();
  });
</script>

<slot />
