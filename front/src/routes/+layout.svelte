<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { refreshToken } from '$lib/stores/auth.js';

  onMount(() => {
    refreshToken();
  });
</script>

<slot />
