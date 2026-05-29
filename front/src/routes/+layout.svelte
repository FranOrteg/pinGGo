<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { refreshToken } from '$lib/stores/auth.js';

  export const data = undefined;

  onMount(() => {
    refreshToken();
  });
</script>

<slot />
