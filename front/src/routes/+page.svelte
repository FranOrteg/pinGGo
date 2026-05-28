<script>
  import { isAuthenticated, authUser } from '$lib/stores/auth.js';
</script>

{#if $isAuthenticated}
  <p>Welcome, {$authUser.username} — Chat UI coming in Phase 1.</p>
{:else}
  <p>Not authenticated — Login UI coming in Phase 1.</p>
{/if}
