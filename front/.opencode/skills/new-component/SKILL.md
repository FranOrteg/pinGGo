---
name: new-component
description: Use when creating new Svelte components in the PinGGo messaging app. Covers component structure, imports, stores, CSS conventions, and event patterns. Trigger on requests like "create component", "new component", "add component".
---

# New Component — PinGGo

Create Svelte components following the project's established conventions.

## File location

All components live in `src/lib/components/`. Use PascalCase naming:

```
src/lib/components/MyNewComponent.svelte
```

## File structure

Every component follows this order: `<script>` → template → `<style>`.

```svelte
<script>
  // 1. Imports
  import { createEventDispatcher } from 'svelte';
  import { someStore } from '$lib/stores/someStore.js';
  import { api } from '$lib/api/index.js';
  import OtherComponent from './OtherComponent.svelte';

  // 2. Props
  export let title = '';
  export let data = null;

  // 3. Events
  const dispatch = createEventDispatcher();

  // 4. Local state
  let loading = false;
  let error = '';

  // 5. Reactive statements
  $: derivedValue = data?.name ?? 'fallback';

  // 6. Functions
  async function handleSubmit() { ... }
</script>

<!-- Template -->

<style>
  /* Scoped styles */
</style>
```

## Imports order

1. Svelte internals (`svelte`, `svelte/transition`)
2. SvelteKit (`$app/navigation`, `$app/stores`)
3. Project stores (`$lib/stores/*.js`)
4. Project API (`$lib/api/index.js`)
5. Project components (`./ComponentName.svelte`)
6. Third-party libraries

## Available stores

| Store | File | Purpose |
|-------|------|---------|
| `authUser` | `$lib/stores/auth.js` | Current logged-in user (`{ uuid, username, avatar_url, status }`) |
| `isAuthenticated` | `$lib/stores/auth.js` | Derived boolean from `authUser` |
| `channels` | `$lib/stores/channels.js` | Writable array of all user's channels |
| `activeChannelId` | `$lib/stores/channels.js` | Currently selected channel UUID |
| `currentChannel` | `$lib/stores/channels.js` | Derived: active channel object |
| `messagesByChannel` | `$lib/stores/messages.js` | `{ [channelId]: Message[] }` |
| `typingByChannel` | `$lib/stores/messages.js` | `{ [channelId]: string[] }` |
| `presence` | `$lib/stores/presence.js` | `{ [userUuid]: 'online' | 'away' | 'dnd' | 'offline' }` |
| `unread` | `$lib/stores/unread.js` | `{ [channelId]: count }` |

## API calls

Use the shared `api` wrapper from `$lib/api/index.js`. It handles auth headers and cookies automatically.

```js
import { api } from '$lib/api/index.js';

// GET
const data = await api.get('/channels');

// POST
const result = await api.post('/channels', { name, type: 'channel' });

// PATCH / DELETE
await api.patch(`/messages/${messageId}`, { content });
await api.delete(`/messages/${messageId}`);
```

## Event dispatching

Use `createEventDispatcher` for component communication:

```js
const dispatch = createEventDispatcher();

// Emit
dispatch('close');
dispatch('created', { uuid: newChannel.uuid });

// Parent listens
<MyComponent on:close={() => show = false} on:created={(e) => handleCreated(e.detail)} />
```

## CSS conventions

- **Scoped by default**: All `<style>` rules are scoped to the component
- **BEM-like naming**: `.component-name__element--modifier`
- **CSS variables**: Use project variables from `app.css`:
  - `--color-bg` — page background
  - `--color-surface` — card/modal background
  - `--color-border` — borders and dividers
  - `--color-text` — primary text
  - `--color-text-muted` — secondary/muted text
  - `--color-accent` — primary action color (blue)
  - `--color-online` — green (presence)
  - `--color-away` — yellow (presence)
  - `--color-dnd` — red (presence/error)
- **No hardcoded colors**: Always use CSS variables
- **Dark theme**: The app is dark-themed; all colors assume dark backgrounds

## Avatar pattern

For user avatars, use the existing `UserAvatar` component:

```svelte
import UserAvatar from './UserAvatar.svelte';

<UserAvatar userUuid={user.uuid} avatarKey={user.avatar_url} name={user.username} size="32px" radius="8px" />
```

For inline avatar colors (e.g., in lists), use this deterministic color function:

```js
function avatarColor(name = '') {
  const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#4f8ef7', '#9B59B6'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
```

## Modal pattern

Modals follow this pattern (see `CreateChannelModal.svelte`, `UserSearchModal.svelte`):

```svelte
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function close() { dispatch('close'); }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" on:click|self={close}>
  <div class="modal">
    <!-- content -->
    <button on:click={close}>Close</button>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 24px;
    width: 100%; max-width: 480px;
  }
</style>
```

## File attachment pattern

For file uploads, use the upload utility:

```js
import { uploadFile, formatFileSize } from '$lib/api/upload.js';

const attachment = await uploadFile(file, (progress) => {
  uploadProgress = progress;
});
// attachment = { fileKey, fileName, fileSize, fileType }
```

For file downloads and presigned URLs:

```js
import { downloadFile, getFileUrl } from '$lib/api/download.js';
```

## Presence indicators

Use the `PresenceDot` component:

```svelte
import PresenceDot from './PresenceDot.svelte';

<PresenceDot status={presence[userUuid] ?? 'offline'} size="10" />
```

## Key rules

- Never hardcode colors; always use CSS variables
- Use `$:` reactive statements for derived values
- Clean up timeouts/intervals in `onDestroy`
- Handle loading and error states for async operations
- Use `try/catch/finally` for async functions
- Prefer `createEventDispatcher` over callbacks for parent communication
- Use `{#key}` blocks when content needs to re-render on value change
