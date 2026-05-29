<script>
  export let status = 'offline';
  export let size = '10';

  const colors = {
    online: 'var(--color-online)',
    away: 'var(--color-away)',
    dnd: 'var(--color-dnd)',
    offline: 'var(--color-text-muted)',
  };
</script>

<span
  class="presence-dot"
  style="width:{size}px; height:{size}px; background:{colors[status] ?? colors.offline}"
  title={status}
></span>

<style>
  .presence-dot {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
