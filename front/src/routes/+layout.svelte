<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { refreshToken } from '$lib/stores/auth.js';
  import { initTheme } from '$lib/stores/theme.js';

  export const data = undefined;

  onMount(() => {
    initTheme();
    refreshToken();
  });
</script>

<slot />
