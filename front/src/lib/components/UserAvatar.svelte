<script>
  import { getAvatarUrl } from '$lib/api/avatar.js';

  export let userUuid = null;
  export let avatarKey = null;
  export let name = '';
  export let size = '32px';
  export let radius = '8px';

  let avatarUrl = null;
  let loadedKey = null;

  function avatarColor(value = '') {
    const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#4f8ef7', '#9B59B6'];
    let hash = 0;
    for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  $: {
    const cacheKey = userUuid && avatarKey ? `${userUuid}:${avatarKey}` : null;
    if (!cacheKey) {
      avatarUrl = null;
      loadedKey = cacheKey;
    } else if (loadedKey !== cacheKey) {
      loadedKey = cacheKey;
      avatarUrl = null;
      getAvatarUrl(userUuid, avatarKey).then((url) => {
        if (loadedKey === cacheKey) avatarUrl = url;
      }).catch(() => {});
    }
  }
</script>

<div
  class="user-avatar"
  style="width: {size}; height: {size}; border-radius: {radius}; background: {avatarUrl ? 'var(--color-surface)' : avatarColor(name)}"
  aria-label={name ? `Avatar of ${name}` : 'User avatar'}
  role="img"
>
  {#if avatarUrl}
    <img src={avatarUrl} alt="" />
  {:else}
    {name?.[0]?.toUpperCase() ?? '?'}
  {/if}
</div>

<style>
  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
