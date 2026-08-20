# PROMPT DE MIGRACIÓN: PinGGo → Skylab

## CONTEXTO CRÍTICO

Vamos a implementar dentro de **Skylab** un módulo de mensajería basado en la arquitectura y comportamiento de **PinGGo**.

### ⚠️ IMPORTANTE: NO EXPLORAR PIN GGO

El agente **NO tiene que buscar, analizar, clonar ni explorar ningún repositorio de PinGGo**.

PinGGo ya ha sido analizado previamente mediante **Graphify** y se ha realizado una extracción completa de su arquitectura, componentes, stores, API, WebSocket, flujo de datos y orden de migración.

Este documento contiene toda la especificación necesaria extraída del análisis real de PinGGo.

Por tanto:

> **No intentes descubrir cómo funciona PinGGo. Ya está descubierto. Implementa en Skylab lo especificado en este documento.**

El objetivo es reproducir dentro de Skylab la funcionalidad de mensajería que ya funciona en PinGGo, **sin volver a diseñarla desde cero y sin introducir una arquitectura alternativa innecesaria**.

---

## 1. OBJETIVO REAL

Skylab ya tiene su propio sistema de usuarios y autenticación.

PinGGo **NO tendrá login propio dentro de Skylab**.

El usuario que está autenticado en Skylab será automáticamente el usuario del sistema de mensajería.

**Ejemplo conceptual:**

```javascript
SkylabUser: {
  id: 69,
  email: "xxx@mail.es",
  username: "Nombre X"
}
```

Ese usuario debe poder utilizar directamente el sistema de mensajería.

### ❌ NO debe existir:

- Login de PinGGo
- Register de PinGGo
- Logout de PinGGo
- Pantalla `/login`
- Segundo sistema de usuarios
- Segunda sesión
- Segunda autenticación visible para el usuario

### ✅ La identidad del usuario procede de Skylab.

---

## 2. ARQUITECTURA OBJETIVO

```
                    SKYLAB
                       │
                       │ usuario autenticado
                       │
                       ▼
              ┌─────────────────┐
              │ Skylab Auth     │
              │                 │
              │ user.id = 69    │
              │ email           │
              │ username        │
              │ avatar          │
              │ access token    │
              └────────┬────────┘
                       │
                       │
                       ▼
              ┌─────────────────┐
              │ PinGGo Module   │
              │                 │
              │ Channels        │
              │ Messages        │
              │ Presence        │
              │ Reactions       │
              │ Uploads         │
              │ Previews        │
              └────────┬────────┘
                       │
              REST + Socket.IO
                       │
                       ▼
              ┌─────────────────┐
              │ AWS PinGGo API  │
              │                 │
              │ MySQL           │
              │ S3              │
              │ Socket.IO       │
              └─────────────────┘
```

**La interfaz de usuario vive dentro de Skylab.**

El backend de mensajería existente continúa en AWS.

---

## 3. ARQUITECTURA DE PINGGO (EXTRAÍDA VÍA GRAPHIFY)

### God Nodes (Abstracciones Core)

Según el análisis de Graphify, estos son los nodos más conectados del sistema:

1. **`queryOne()`** - 31 edges - Función de DB para queries únicas
2. **`query()`** - 28 edges - Función de DB para queries múltiples
3. **`PinGGo Project`** - 14 edges - Proyecto raíz
4. **`getLinkPreview()`** - 12 edges - Servicio de previews
5. **`authenticate()`** - 10 edges - Middleware de autenticación
6. **`generateAndStoreThumbnail()`** - 8 edges - Servicio de thumbnails
7. **`bindSocketListeners()`** - 8 edges - Socket listeners frontend
8. **`getRedis()`** - 7 edges - Cliente Redis
9. **`fetchPageSafely()`** - 7 edges - Fetch seguro para previews

### Comunidades Detectadas (26 principales)

El sistema se organiza en estas comunidades funcionales:

#### 0. Messaging UI (Cohesión: 0.05)
- `handleCardKeydown()`
- `openUrl()`
- `cancelEdit()`
- `handleEditKeydown()`
- `saveEdit()`

#### 1. Backend Services (Cohesión: 0.13)
- `router`
- `getPool()`
- `query()`, `queryOne()`
- `login()`, `logout()`, `me()`, `refresh()`
- Servicios de autenticación y base de datos

#### 3. Backend Dependencies
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `bcryptjs`
- `cookie-parser`
- `cors`
- `express`
- `jsonwebtoken`
- `socket.io`

#### 4. Link Preview Service (Cohesión: 0.14)
- `assertSafeHost()`
- `assertSafeUrl()`
- `buildFullPreview()`
- `buildMinimalPreview()`
- `extractOgMetadata()`
- `fetchPageSafely()`

#### 6. Frontend Dependencies
- `pdfjs-dist`
- `socket.io-client`
- `svelte`
- `@sveltejs/kit`
- `@sveltejs/adapter-node`

#### 7. File Preview (Cohesión: 0.10)
- `getThumbnailUrl()`
- `getViewUrl()`
- `fetchTextContent()`
- `getCsvPreview()`
- `getOfficeThumbnail()`

#### 8. API Routers (Cohesión: 0.16)
- `auth/router.js`
- `channels/router.js`
- `messages/router.js`
- `users/router.js`
- `upload/router.js`
- `download/router.js`
- `previews/router.js`
- `thumbnails/router.js`

#### 11. Thumbnail Service (Cohesión: 0.20)
- `convertOfficeToPng()`
- `downloadSourceToTemp()`
- `fileExistsInS3()`
- `generateAndStoreThumbnail()`
- `getThumbnailKey()`
- `getThumbnailUrl()`

#### 12. Messages Store (Cohesión: 0.12)
- `bindSocketListeners()`
- `messagesByChannel`
- `typingByChannel`

#### 14. Auth & Presence Stores (Cohesión: 0.18)
- `accessToken`
- `_applySession()`
- `authReady`
- `authUser`
- `isAuthenticated`
- `login()`
- `register()`
- `bindPresenceListeners()`

#### 16. Channels Store (Cohesión: 0.22)
- `activeChannelId`
- `channels`
- `currentChannel`

#### 19. Theme Store (Cohesión: 0.48)
- `applyTheme()`
- `currentTheme`
- `getStoredTheme()`
- `getSystemPreference()`
- `initTheme()`
- `toggleTheme()`

---

## 4. MODELO DE DATOS (BASE DE DATOS)

### Tablas Principales

```sql
-- Usuarios (gestionado por auth)
users (
  uuid PRIMARY KEY,
  email UNIQUE,
  username,
  avatar_url,
  created_at,
  password_hash -- NO se usará en Skylab
)

-- Canales
channels (
  uuid PRIMARY KEY,
  name,
  is_direct_message BOOLEAN,
  created_at,
  created_by_uuid
)

-- Membresía de canales (CRÍTICO)
channel_members (
  channel_id,
  user_id,
  role ENUM('member', 'admin'),
  joined_at,
  last_read_at,
  PRIMARY KEY (channel_id, user_id)  -- PK compuesta
)

-- Mensajes
messages (
  uuid PRIMARY KEY,
  channel_id,
  user_uuid,
  content TEXT,
  file_key VARCHAR(500),  -- S3 key para adjuntos
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size BIGINT,
  edited_at,
  created_at,
  deleted_at
)

-- Reacciones
reactions (
  message_uuid,
  user_uuid,
  emoji VARCHAR(50),
  created_at,
  PRIMARY KEY (message_uuid, user_uuid, emoji)
)
```

### Convenciones Importantes

1. **PKs compuestas** en `channel_members` y `reactions` — previenen duplicados.
2. **`channel_members.last_read_at`** — usado para unread counts.
3. **`messages.file_key`** — liga cada mensaje/adjunto a S3.
4. **Soft delete** — `messages.deleted_at` permite borrado lógico.

---

## 5. ESTRUCTURA DE STORES (FRONTEND)

### 5.1. Auth Store (`lib/stores/auth.js`)

```javascript
// Valores exportados
export const accessToken = writable(null);
export const authUser = writable(null);
export const authReady = writable(false);
export const isAuthenticated = derived(authUser, $u => !!$u);

// Funciones
export function _applySession(user, token) { ... }
export async function login(email, password) { ... }  // ❌ NO en Skylab
export async function register(email, username, password) { ... }  // ❌ NO en Skylab
export async function logout() { ... }  // ❌ NO en Skylab
export async function refreshToken() { ... }
```

**⚠️ Para Skylab:**
- Eliminar `login()`, `register()`, `logout()`
- Sustituir por función de inicialización desde Skylab auth
- Mantener `refreshToken()` si el backend AWS lo requiere

### 5.2. Channels Store (`lib/stores/channels.js`)

```javascript
export const channels = writable([]);
export const activeChannelId = writable(null);
export const currentChannel = derived(
  [channels, activeChannelId],
  ([$channels, $id]) => $channels.find(c => c.uuid === $id)
);

export async function loadChannels() { ... }
export async function createChannel(name, memberUuids) { ... }
export async function createDM(otherUserUuid) { ... }
export async function setActiveChannel(uuid) { ... }
export function bindChannelReconnect() { ... }
```

### 5.3. Messages Store (`lib/stores/messages.js`)

```javascript
export const messagesByChannel = writable({});  // { [channelId]: [...msgs] }
export const typingByChannel = writable({});    // { [channelId]: [...userIds] }

export function bindSocketListeners() { ... }
export async function loadMessages(channelId, before) { ... }
export async function sendMessage(channelId, content, file) { ... }
export async function editMessage(uuid, newContent) { ... }
export async function deleteMessage(uuid) { ... }
export async function toggleReaction(messageUuid, emoji) { ... }
export function notifyTyping(channelId) { ... }

// Listeners Socket.IO
function onNewMessage(msg) { ... }
function onMessageUpdated(msg) { ... }
function onMessageDeleted({ uuid }) { ... }
function onMessageReaction({ messageUuid, emoji, user, action }) { ... }
function onTypingStart({ channelId, user }) { ... }
function onTypingStop({ channelId, userId }) { ... }
function onThumbnailReady({ messageUuid, thumbnailUrl }) { ... }
```

### 5.4. Presence Store (`lib/stores/presence.js`)

```javascript
export const presence = writable({});  // { [userId]: 'online' | 'away' | 'offline' }

export function bindPresenceListeners() { ... }
function onPresenceChange({ userId, status }) { ... }
```

### 5.5. Unread Store (`lib/stores/unread.js`)

```javascript
export const unreadCounts = writable({});  // { [channelId]: count }

export function initUnread(channels) { ... }
export function clearUnread(channelId) { ... }
export function incrementUnread(channelId) { ... }
```

### 5.6. View Store (`lib/stores/view.js`)

```javascript
export const currentView = writable('channel');  // 'channel' | 'profile'
export const viewData = writable(null);

export function showChannel(channelId) { ... }
export function showProfile(userId) { ... }
export function getPreviousChannelId() { ... }
```

### 5.7. Theme Store ❌ ELIMINAR

```javascript
// NO implementar en Skylab
// Skylab gestiona su propio tema
```

---

## 6. API CLIENT (`lib/api/`)

### 6.1. `lib/api/index.js`

Cliente base con auto-refresh de tokens:

```javascript
const NO_REFRESH_PATHS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/register'];

export const api = {
  async request(method, path, options = {}) {
    // 1. Intenta request con accessToken actual
    // 2. Si 401 y no está en NO_REFRESH_PATHS, intenta refreshAccessToken()
    // 3. Reintenta request
    // 4. Retorna json o lanza error
  },
  
  get: (path, opts) => api.request('GET', path, opts),
  post: (path, opts) => api.request('POST', path, opts),
  patch: (path, opts) => api.request('PATCH', path, opts),
  delete: (path, opts) => api.request('DELETE', path, opts),
};

async function refreshAccessToken() {
  // POST /api/auth/refresh con cookie refresh_token
  // Actualiza accessToken store
}

export function setAccessToken(token) {
  accessToken.set(token);
}
```

**⚠️ Para Skylab:**
- Verificar si Skylab ya tiene un cliente API con refresh
- Reutilizar si existe
- Adaptar solo si necesario

### 6.2. `lib/api/avatar.js`

```javascript
const avatarUrlCache = new Map();

export async function getAvatarUrl(userUuid) {
  if (avatarUrlCache.has(userUuid)) return avatarUrlCache.get(userUuid);
  
  const { url } = await api.get(`/api/users/${userUuid}/avatar/presign`);
  avatarUrlCache.set(userUuid, url);
  return url;
}

export async function uploadAvatar(file) {
  const { uploadUrl, key } = await api.post('/api/users/me/avatar/presign', {
    body: { contentType: file.type }
  });
  
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  
  await api.patch('/api/users/me', {
    body: { avatar_url: key }
  });
  
  clearAvatarUrl();
}

export function clearAvatarUrl() {
  avatarUrlCache.clear();
}
```

### 6.3. `lib/api/upload.js`

```javascript
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

export function isImage(type) {
  return IMAGE_TYPES.includes(type);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export async function uploadFile(file, channelId) {
  // 1. POST /api/upload/presign con { contentType, channelId }
  // 2. PUT a uploadUrl de S3
  // 3. Retorna { key, fileName, fileType, fileSize }
}
```

### 6.4. `lib/api/download.js`

```javascript
export async function downloadFile(messageUuid, fileName) {
  const { url } = await api.get(`/api/download/presign?messageUuid=${messageUuid}`);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}
```

### 6.5. `lib/api/preview.js`

```javascript
const previewCache = new Map();

export async function getLinkPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  
  const preview = await api.get(`/api/previews/resolve?url=${encodeURIComponent(url)}`);
  previewCache.set(url, preview);
  return preview;
}

export function invalidatePreviewCache(url) {
  previewCache.delete(url);
}
```

---

## 7. SOCKET.IO CLIENT (`lib/socket/client.js`)

```javascript
import { io } from 'socket.io-client';
import { accessToken } from '$lib/stores/auth';

let socket = null;

export function createSocketClient(token) {
  if (socket?.connected) return socket;
  
  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    transports: ['websocket', 'polling']
  });
  
  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
```

### Eventos Emitidos por el Cliente

```javascript
// Canales
socket.emit('channel:join', { channelId });
socket.emit('channel:leave', { channelId });

// Mensajes
socket.emit('message:send', { channelId, content, fileKey, fileName, fileType, fileSize });

// Typing
socket.emit('typing:start', { channelId });
socket.emit('typing:stop', { channelId });

// Presence
socket.emit('presence:heartbeat');
socket.emit('presence:set', { status }); // 'online' | 'away' | 'offline'
```

### Eventos Recibidos por el Cliente

```javascript
socket.on('message:new', (msg) => { ... });
socket.on('message:updated', (msg) => { ... });
socket.on('message:deleted', ({ uuid }) => { ... });
socket.on('message:reaction', ({ messageUuid, emoji, user, action }) => { ... });
socket.on('typing:start', ({ channelId, user }) => { ... });
socket.on('typing:stop', ({ channelId, userId }) => { ... });
socket.on('presence:change', ({ userId, status }) => { ... });
socket.on('thumbnail:ready', ({ messageUuid, thumbnailUrl }) => { ... });
```

---

## 8. UTILS

### 8.1. `lib/utils/urlText.js`

```javascript
export function splitByUrl(text) {
  // Divide texto en partes: { type: 'text' | 'url', content: string }[]
}

export function extractFirstUrl(text) {
  // Retorna primera URL encontrada o null
}

export function stripTrailing(url) {
  // Elimina trailing slash
}
```

### 8.2. `lib/utils/filePreview.js`

```javascript
const fileUrlCache = new Map();
const thumbnailUrlCache = new Map();
const viewUrlCache = new Map();

export function isPreviewable(type) { ... }
export function isTextLike(type) { ... }
export function isPdf(type) { ... }
export function isOfficeType(type) { ... }
export function isCsvOrSheet(type) { ... }

export async function getThumbnailUrl(messageUuid) { ... }
export async function getViewUrl(messageUuid, fileType) { ... }
export async function fetchTextContent(url) { ... }
export async function getTextPreview(url) { ... }
export async function getCsvPreview(url) { ... }
export async function getPdfPreviewDataUrl(url) { ... }
export async function getOfficeThumbnail(messageUuid) { ... }

export function invalidateThumbnailCache(messageUuid) { ... }
export function invalidateOfficeThumbnailCache(messageUuid) { ... }

async function loadPdfjs() { ... }  // Dynamic import de pdfjs-dist
```

### 8.3. `lib/utils/linkPreview.js`

**⚠️ Este módulo NO es crítico para MVP.**

Si decides implementarlo:

```javascript
export async function loadPreview(url) {
  return await getLinkPreview(url);
}
```

---

## 9. COMPONENTES

### Orden de Implementación Recomendado

1. **Componentes base** (sin dependencias)
   - `PresenceDot.svelte`
   - `UserAvatar.svelte`
   - `EmojiPicker.svelte`

2. **Componentes de contenido**
   - `LinkPreview.svelte`
   - `MessageContent.svelte`

3. **Componentes de mensaje**
   - `MessageItem.svelte`
   - `MessageList.svelte`
   - `MessageInput.svelte`

4. **Vista principal**
   - `ChannelView.svelte`
   - `Sidebar.svelte`

5. **Modales**
   - `UserSearchModal.svelte`
   - `CreateChannelModal.svelte`
   - `ChannelMembersModal.svelte`
   - `ProfileView.svelte`

### 9.1. `PresenceDot.svelte`

```svelte
<script>
  export let status = 'offline'; // 'online' | 'away' | 'offline'
</script>

<span class="presence-dot {status}"></span>

<style>
  .presence-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .online { background: #43b581; }
  .away { background: #faa61a; }
  .offline { background: #747f8d; }
</style>
```

### 9.2. `UserAvatar.svelte`

```svelte
<script>
  import { getAvatarUrl } from '$lib/api/avatar';
  
  export let user;
  export let size = 32;
  
  let avatarUrl = null;
  
  async function loadAvatar() {
    if (user.avatar_url) {
      avatarUrl = await getAvatarUrl(user.uuid);
    }
  }
  
  $: if (user) loadAvatar();
  
  function avatarColor(uuid) {
    const colors = ['#5865f2', '#43b581', '#faa61a', '#f04747', '#747f8d'];
    const hash = uuid.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
</script>

{#if avatarUrl}
  <img src={avatarUrl} alt={user.username} width={size} height={size} />
{:else}
  <div class="avatar-fallback" style="width: {size}px; height: {size}px; background: {avatarColor(user.uuid)}">
    {user.username[0].toUpperCase()}
  </div>
{/if}
```

### 9.3. `EmojiPicker.svelte`

```svelte
<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🚀', '👀'];
  
  function select(emoji) {
    dispatch('select', emoji);
  }
</script>

<div class="emoji-picker">
  {#each emojis as emoji}
    <button on:click={() => select(emoji)}>{emoji}</button>
  {/each}
</div>

<style>
  .emoji-picker {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 8px;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  button {
    font-size: 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
  }
  button:hover {
    background: var(--hover);
  }
</style>
```

### 9.4. `MessageContent.svelte`

```svelte
<script>
  import { splitByUrl } from '$lib/utils/urlText';
  import LinkPreview from './LinkPreview.svelte';
  
  export let content;
  export let showPreviews = true;
  
  $: parts = splitByUrl(content);
  $: firstUrl = parts.find(p => p.type === 'url')?.content;
</script>

<div class="message-content">
  {#each parts as part}
    {#if part.type === 'text'}
      <span>{part.content}</span>
    {:else}
      <a href={part.content} target="_blank" rel="noopener">{part.content}</a>
    {/if}
  {/each}
</div>

{#if showPreviews && firstUrl}
  <LinkPreview url={firstUrl} />
{/if}
```

### 9.5. `MessageItem.svelte`

```svelte
<script>
  import { authUser } from '$lib/stores/auth';
  import { deleteMessage, editMessage, toggleReaction } from '$lib/stores/messages';
  import { downloadFile } from '$lib/api/download';
  import { getThumbnailUrl, isPreviewable } from '$lib/utils/filePreview';
  import UserAvatar from './UserAvatar.svelte';
  import MessageContent from './MessageContent.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  
  export let message;
  
  let editing = false;
  let editContent = '';
  let showReactionPicker = false;
  let thumbnailUrl = null;
  
  $: isOwn = $authUser?.uuid === message.user_uuid;
  $: hasAttachment = !!message.file_key;
  
  async function loadThumbnail() {
    if (hasAttachment && isPreviewable(message.file_type)) {
      thumbnailUrl = await getThumbnailUrl(message.uuid);
    }
  }
  
  $: if (message) loadThumbnail();
  
  function startEdit() {
    editing = true;
    editContent = message.content;
  }
  
  function cancelEdit() {
    editing = false;
  }
  
  async function saveEdit() {
    await editMessage(message.uuid, editContent);
    editing = false;
  }
  
  function handleEditKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }
  
  async function handleDeleteClick() {
    if (confirm('¿Eliminar mensaje?')) {
      await deleteMessage(message.uuid);
    }
  }
  
  async function handleReaction(emoji) {
    await toggleReaction(message.uuid, emoji);
    showReactionPicker = false;
  }
  
  async function handleAttachmentDownload() {
    await downloadFile(message.uuid, message.file_name);
  }
  
  function formatTime(date) {
    return new Date(date).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  function getFileIcon(type) {
    if (type?.startsWith('image/')) return '🖼️';
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('word') || type?.includes('document')) return '📝';
    if (type?.includes('excel') || type?.includes('sheet')) return '📊';
    if (type?.includes('powerpoint') || type?.includes('presentation')) return '📽️';
    if (type?.includes('zip') || type?.includes('rar')) return '📦';
    return '📎';
  }
</script>

<div class="message-item" class:own={isOwn}>
  <UserAvatar user={message.user} size={32} />
  
  <div class="message-main">
    <div class="message-header">
      <span class="username">{message.user.username}</span>
      <span class="time">{formatTime(message.created_at)}</span>
      {#if message.edited_at}
        <span class="edited">(editado)</span>
      {/if}
    </div>
    
    {#if editing}
      <textarea 
        bind:value={editContent}
        on:keydown={handleEditKeydown}
        autofocus
      />
      <div class="edit-actions">
        <button on:click={saveEdit}>Guardar</button>
        <button on:click={cancelEdit}>Cancelar</button>
      </div>
    {:else}
      <MessageContent content={message.content} />
      
      {#if hasAttachment}
        <div class="attachment">
          {#if thumbnailUrl}
            <img src={thumbnailUrl} alt={message.file_name} />
          {:else}
            <span class="file-icon">{getFileIcon(message.file_type)}</span>
          {/if}
          <div class="attachment-info">
            <span class="file-name">{message.file_name}</span>
            <button on:click={handleAttachmentDownload}>Descargar</button>
          </div>
        </div>
      {/if}
      
      {#if message.reactions?.length}
        <div class="reactions">
          {#each message.reactions as reaction}
            <button 
              class="reaction"
              class:active={reaction.users.some(u => u.uuid === $authUser?.uuid)}
              on:click={() => handleReaction(reaction.emoji)}
            >
              {reaction.emoji} {reaction.count}
            </button>
          {/each}
        </div>
      {/if}
      
      {#if isOwn}
        <div class="message-actions">
          <button on:click={startEdit}>Editar</button>
          <button on:click={handleDeleteClick}>Eliminar</button>
        </div>
      {/if}
      
      <button class="add-reaction" on:click={() => showReactionPicker = !showReactionPicker}>
        😊
      </button>
      
      {#if showReactionPicker}
        <EmojiPicker on:select={e => handleReaction(e.detail)} />
      {/if}
    {/if}
  </div>
</div>
```

### 9.6. `MessageList.svelte`

```svelte
<script>
  import { onMount, afterUpdate } from 'svelte';
  import { messagesByChannel } from '$lib/stores/messages';
  import { activeChannelId } from '$lib/stores/channels';
  import { loadMessages } from '$lib/stores/messages';
  import MessageItem from './MessageItem.svelte';
  
  let container;
  let loading = false;
  let hasMore = true;
  
  $: messages = $messagesByChannel[$activeChannelId] || [];
  $: oldestMessageUuid = messages[0]?.uuid;
  
  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    
    const newMessages = await loadMessages($activeChannelId, oldestMessageUuid);
    if (newMessages.length < 50) hasMore = false;
    
    loading = false;
  }
  
  function handleScroll() {
    if (container.scrollTop < 100) {
      loadMore();
    }
  }
  
  onMount(() => {
    loadMore();
  });
  
  afterUpdate(() => {
    // Auto-scroll al final si el usuario ya estaba al final
    if (container && container.scrollHeight - container.scrollTop - container.clientHeight < 100) {
      container.scrollTop = container.scrollHeight;
    }
  });
</script>

<div class="message-list" bind:this={container} on:scroll={handleScroll}>
  {#if loading}
    <div class="loading">Cargando...</div>
  {/if}
  
  {#each messages as message (message.uuid)}
    <MessageItem {message} />
  {/each}
</div>

<style>
  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }
</style>
```

### 9.7. `MessageInput.svelte`

```svelte
<script>
  import { activeChannelId } from '$lib/stores/channels';
  import { sendMessage, notifyTyping } from '$lib/stores/messages';
  import { uploadFile, isImage } from '$lib/api/upload';
  
  let content = '';
  let file = null;
  let uploading = false;
  let typingTimeout;
  
  async function handleSend() {
    if (!content.trim() && !file) return;
    
    let fileData = null;
    
    if (file) {
      uploading = true;
      fileData = await uploadFile(file, $activeChannelId);
      uploading = false;
    }
    
    await sendMessage($activeChannelId, content, fileData);
    
    content = '';
    file = null;
  }
  
  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
  
  function handleInput() {
    clearTimeout(typingTimeout);
    notifyTyping($activeChannelId);
    typingTimeout = setTimeout(() => {
      // typing:stop se envía automáticamente
    }, 3000);
  }
  
  function handleFileSelect(e) {
    file = e.target.files[0];
  }
</script>

<div class="message-input">
  {#if file}
    <div class="file-preview">
      {#if isImage(file.type)}
        <img src={URL.createObjectURL(file)} alt={file.name} />
      {:else}
        <span>{file.name}</span>
      {/if}
      <button on:click={() => file = null}>✕</button>
    </div>
  {/if}
  
  <div class="input-row">
    <label class="attach-button">
      📎
      <input type="file" on:change={handleFileSelect} hidden />
    </label>
    
    <textarea 
      bind:value={content}
      on:keydown={handleKeydown}
      on:input={handleInput}
      placeholder="Escribe un mensaje..."
      disabled={uploading}
    />
    
    <button on:click={handleSend} disabled={uploading}>
      {uploading ? '⏳' : '➤'}
    </button>
  </div>
</div>

<style>
  .message-input {
    border-top: 1px solid var(--border);
    padding: 16px;
  }
  .input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    resize: vertical;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
</style>
```

### 9.8. `ChannelView.svelte`

```svelte
<script>
  import { currentChannel } from '$lib/stores/channels';
  import { typingByChannel } from '$lib/stores/messages';
  import MessageList from './MessageList.svelte';
  import MessageInput from './MessageInput.svelte';
  
  $: typing = $typingByChannel[$currentChannel?.uuid] || [];
</script>

{#if $currentChannel}
  <div class="channel-view">
    <header>
      <h2>#{$currentChannel.name}</h2>
      {#if $currentChannel.is_direct_message}
        <span class="dm-indicator">Mensaje directo</span>
      {/if}
    </header>
    
    <MessageList />
    
    {#if typing.length}
      <div class="typing-indicator">
        {typing.map(u => u.username).join(', ')} está escribiendo...
      </div>
    {/if}
    
    <MessageInput />
  </div>
{:else}
  <div class="empty-state">
    Selecciona un canal
  </div>
{/if}

<style>
  .channel-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }
</style>
```

### 9.9. `Sidebar.svelte`

```svelte
<script>
  import { channels, activeChannelId, setActiveChannel } from '$lib/stores/channels';
  import { unreadCounts } from '$lib/stores/unread';
  import { presence } from '$lib/stores/presence';
  import PresenceDot from './PresenceDot.svelte';
  
  let showCreateChannelModal = false;
  let showUserSearchModal = false;
  
  $: directMessages = $channels.filter(c => c.is_direct_message);
  $: groupChannels = $channels.filter(c => !c.is_direct_message);
</script>

<aside class="sidebar">
  <header>
    <h1>PinGGo</h1>
  </header>
  
  <section>
    <div class="section-header">
      <h3>Canales</h3>
      <button on:click={() => showCreateChannelModal = true}>+</button>
    </div>
    {#each groupChannels as channel}
      <button 
        class="channel-item"
        class:active={channel.uuid === $activeChannelId}
        on:click={() => setActiveChannel(channel.uuid)}
      >
        <span class="channel-name"># {channel.name}</span>
        {#if $unreadCounts[channel.uuid]}
          <span class="unread-badge">{$unreadCounts[channel.uuid]}</span>
        {/if}
      </button>
    {/each}
  </section>
  
  <section>
    <div class="section-header">
      <h3>Mensajes directos</h3>
      <button on:click={() => showUserSearchModal = true}>+</button>
    </div>
    {#each directMessages as dm}
      <button 
        class="channel-item dm"
        class:active={dm.uuid === $activeChannelId}
        on:click={() => setActiveChannel(dm.uuid)}
      >
        <PresenceDot status={$presence[dm.other_user?.uuid] || 'offline'} />
        <span class="channel-name">{dm.other_user?.username || dm.name}</span>
        {#if $unreadCounts[dm.uuid]}
          <span class="unread-badge">{$unreadCounts[dm.uuid]}</span>
        {/if}
      </button>
    {/each}
  </section>
</aside>

{#if showCreateChannelModal}
  <CreateChannelModal on:close={() => showCreateChannelModal = false} />
{/if}

{#if showUserSearchModal}
  <UserSearchModal on:close={() => showUserSearchModal = false} />
{/if}
```

### 9.10. Modales (Simplificados)

```svelte
<!-- CreateChannelModal.svelte -->
<script>
  import { createChannel } from '$lib/stores/channels';
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let name = '';
  let memberUuids = [];
  
  async function create() {
    await createChannel(name, memberUuids);
    dispatch('close');
  }
</script>

<div class="modal">
  <div class="modal-content">
    <h2>Crear canal</h2>
    <input bind:value={name} placeholder="Nombre del canal" />
    <!-- TODO: selector de miembros -->
    <button on:click={create}>Crear</button>
    <button on:click={() => dispatch('close')}>Cancelar</button>
  </div>
</div>

<!-- UserSearchModal.svelte -->
<script>
  import { createDM } from '$lib/stores/channels';
  import { api } from '$lib/api';
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  let query = '';
  let results = [];
  
  async function search() {
    results = await api.get(`/api/users/search?q=${query}`);
  }
  
  async function selectUser(user) {
    await createDM(user.uuid);
    dispatch('close');
  }
</script>

<div class="modal">
  <div class="modal-content">
    <h2>Buscar usuario</h2>
    <input bind:value={query} on:input={search} placeholder="Buscar..." />
    <div class="results">
      {#each results as user}
        <button on:click={() => selectUser(user)}>
          {user.username}
        </button>
      {/each}
    </div>
  </div>
</div>
```

---

## 10. API ENDPOINTS (BACKEND AWS)

### 10.1. Auth Endpoints ❌ NO USAR EN SKYLAB

```
POST   /api/auth/register      // ❌ NO
POST   /api/auth/login         // ❌ NO
POST   /api/auth/refresh       // ⚠️ Verificar si es necesario
POST   /api/auth/logout        // ❌ NO
GET    /api/auth/me            // ⚠️ Puede ser útil para sync
```

### 10.2. Channels

```
GET    /api/channels
  → Retorna canales del usuario autenticado
  → Incluye last_read_at, unread_count

POST   /api/channels
  Body: { name, memberUuids?, is_direct_message? }
  → Crea canal y añade al creador + memberUuids

GET    /api/channels/:uuid
  → Retorna canal con miembros

POST   /api/channels/:uuid/members
  Body: { userUuid }
  → Añade miembro

DELETE /api/channels/:uuid/members/:userUuid
  → Elimina miembro (admin only)

POST   /api/channels/:uuid/read
  → Marca como leído (actualiza last_read_at)
```

### 10.3. Messages

```
GET    /api/channels/:uuid/messages
  Query: ?before=<messageUuid>&limit=50
  → Retorna mensajes del canal (paginados)
  → Incluye reacciones agregadas

POST   /api/channels/:uuid/messages
  Body: { content, fileKey?, fileName?, fileType?, fileSize? }
  → Crea mensaje
  → También se puede enviar vía Socket.IO

PATCH  /api/messages/:uuid
  Body: { content }
  → Edita mensaje (owner only)

DELETE /api/messages/:uuid
  → Elimina mensaje (owner only, soft delete)

POST   /api/messages/:uuid/reactions
  Body: { emoji }
  → Añade reacción

DELETE /api/messages/:uuid/reactions/:emoji
  → Elimina reacción
```

### 10.4. Users

```
GET    /api/users/search
  Query: ?q=<query>
  → Busca usuarios por username/email

GET    /api/users/:uuid/profile
  → Retorna perfil público

PATCH  /api/users/me
  Body: { username?, avatar_url? }
  → Actualiza perfil propio
```

### 10.5. Upload/Download

```
POST   /api/upload/presign
  Body: { contentType, channelId }  // ⚠️ channelId obligatorio
  → Retorna { uploadUrl, key }

GET    /api/download/presign
  Query: ?messageUuid=<uuid>
  → Valida membership y retorna { url }
```

### 10.6. Previews/Thumbnails

```
GET    /api/previews/resolve
  Query: ?url=<encodedUrl>
  → Retorna preview metadata

GET    /api/thumbnails/presign
  Query: ?messageUuid=<uuid>
  → Retorna thumbnail presigned URL
```

### 10.7. Avatar

```
GET    /api/users/:uuid/avatar/presign
  → Retorna avatar download URL

POST   /api/users/me/avatar/presign
  Body: { contentType }
  → Retorna avatar upload URL
```

---

## 11. SEGURIDAD Y MEMBRESÍA

### ⚠️ CRÍTICO: Validación de Membresía

Según la memoria del repositorio, **todos los endpoints que acceden a recursos de canales deben validar membership**.

#### Endpoints que YA validan membership:

- `GET /api/channels` - filtra por JOIN channel_members
- `GET /api/channels/:uuid` - valida membership
- `GET /api/channels/:uuid/messages` - valida membership (`assertMembership`)
- Socket `channel:join` - valida membership
- Socket `message:send` - valida membership

#### Endpoints que fueron arreglados (julio 2026):

- ✅ `POST /api/upload/presign` - ahora requiere `channelId` y valida membership
- ✅ `GET /api/download/presign` - ahora valida membership vía `channel_id` de `messages`

### Implementación de `assertMembership`:

```javascript
// back/src/services/messageService.js
async function assertMembership(channelId, userUuid) {
  const member = await queryOne(
    'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
    [channelId, userUuid]
  );
  
  if (!member) {
    throw new Error('Not a member of this channel');
  }
}
```

---

## 12. INTEGRACIÓN CON SKYLAB

### 12.1. FASE 0 — Skylab Integration Discovery ⚠️ OBLIGATORIO

Antes de implementar NADA, inspeccionar Skylab y documentar:

```markdown
### Auth
- ¿Dónde está el usuario autenticado?
- ¿Dónde está el access token?
- ¿Cómo se refresca?
- ¿Qué estructura tiene el usuario?
- ¿Qué store/context proporciona?

### Frontend
- Versión exacta de Svelte:
- Sistema de routing:
- Estructura de componentes:
- Stores existentes:
- Sistema de estilos:
- Variables CSS:

### Backend / API
- ¿Cómo hace peticiones autenticadas?
- Variables de entorno:
- URLs externas:
- CORS/proxy:
```

### 12.2. Adaptación de Identidad

**PROBLEMA:** Skylab puede usar `id: 69` mientras PinGGo espera `uuid`.

**SOLUCIÓN:** Crear adaptador de identidad.

```javascript
// lib/adapters/userAdapter.js

export function adaptSkylabUserToMessaging(skylabUser) {
  return {
    uuid: skylabUser.uuid || skylabUser.id.toString(),  // ⚠️ Determinar estrategia correcta
    username: skylabUser.username || skylabUser.name,
    email: skylabUser.email,
    avatar_url: skylabUser.avatar || skylabUser.avatar_url,
  };
}

export function getMessagingToken(skylabAuth) {
  // ⚠️ Verificar si el token de Skylab es compatible con el backend AWS
  // Si no lo es, implementar intercambio de token
  return skylabAuth.accessToken;
}
```

### 12.3. Inicialización del Módulo

```javascript
// lib/messaging/init.js

import { _applySession } from '$lib/stores/auth';
import { createSocketClient } from '$lib/socket/client';
import { loadChannels } from '$lib/stores/channels';
import { bindSocketListeners } from '$lib/stores/messages';
import { bindPresenceListeners } from '$lib/stores/presence';
import { initUnread } from '$lib/stores/unread';
import { adaptSkylabUserToMessaging, getMessagingToken } from '$lib/adapters/userAdapter';

export async function initMessaging(skylabUser, skylabAuth) {
  // 1. Adaptar usuario
  const messagingUser = adaptSkylabUserToMessaging(skylabUser);
  const token = getMessagingToken(skylabAuth);
  
  // 2. Inicializar auth store
  _applySession(messagingUser, token);
  
  // 3. Crear conexión Socket.IO
  createSocketClient(token);
  
  // 4. Bind listeners
  bindSocketListeners();
  bindPresenceListeners();
  
  // 5. Cargar canales iniciales
  const channels = await loadChannels();
  initUnread(channels);
}
```

### 12.4. Integración en Routing de Skylab

**Opción A:** Ruta dedicada

```svelte
<!-- routes/chat/+page.svelte (Skylab) -->
<script>
  import { onMount } from 'svelte';
  import { initMessaging } from '$lib/messaging/init';
  import Sidebar from '$lib/components/messaging/Sidebar.svelte';
  import ChannelView from '$lib/components/messaging/ChannelView.svelte';
  
  // Obtener auth de Skylab
  import { user, auth } from '$lib/stores/skylabAuth';  // ⚠️ Ajustar según Skylab
  
  onMount(() => {
    if ($user && $auth) {
      initMessaging($user, $auth);
    }
  });
</script>

<div class="messaging-layout">
  <Sidebar />
  <ChannelView />
</div>
```

**Opción B:** Componente integrado

Si Skylab tiene un layout general con navegación, integrar como módulo:

```svelte
<!-- Skylab layout -->
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/chat">Mensajería</a>  <!-- ← nuevo -->
  <a href="/settings">Settings</a>
</nav>
```

---

## 13. VARIABLES DE ENTORNO

```bash
# .env (Skylab)

# API del backend AWS de PinGGo
VITE_API_URL=https://api.pinggo.aws.com  # ⚠️ URL real

# S3 (si se accede desde frontend)
VITE_S3_BUCKET=pinggo-files

# ⚠️ NO incluir secretos JWT aquí
# El backend AWS ya tiene JWT_ACCESS_SECRET y JWT_REFRESH_SECRET
```

---

## 14. ORDEN DE IMPLEMENTACIÓN DETALLADO

### ✅ FASE 0 — Skylab Integration Discovery

1. Inspeccionar auth de Skylab
2. Inspeccionar routing
3. Inspeccionar API client
4. Inspeccionar estructura de componentes
5. Inspeccionar estilos/variables CSS
6. Documentar hallazgos

**Entregable:** Documento breve con la información recopilada.

### ✅ FASE 1 — Infraestructura

1. Crear `lib/adapters/userAdapter.js`
2. Crear `lib/stores/auth.js` (adaptado - SIN login/register/logout)
3. Crear `lib/api/index.js` (cliente base)
4. Crear `lib/socket/client.js`
5. Crear `lib/stores/channels.js`
6. Crear `lib/stores/messages.js`
7. Crear `lib/stores/presence.js`
8. Crear `lib/stores/unread.js`
9. Crear `lib/stores/view.js`
10. Crear `lib/messaging/init.js`

**Verificación:**
- Todos los imports se resuelven
- No hay errores de compilación
- Los stores se pueden importar

### ✅ FASE 2 — API Clients

1. Crear `lib/api/avatar.js`
2. Crear `lib/api/upload.js`
3. Crear `lib/api/download.js`
4. Crear `lib/api/preview.js`

**Verificación:**
- Todas las funciones exportan correctamente
- El cliente `api` de `lib/api/index.js` funciona

### ✅ FASE 3 — Utils

1. Crear `lib/utils/urlText.js`
2. Crear `lib/utils/filePreview.js`
3. (Opcional) Crear `lib/utils/linkPreview.js`

**Verificación:**
- Funciones utilitarias funcionan correctamente
- No hay dependencias circulares

### ✅ FASE 4 — Componentes Base

1. `PresenceDot.svelte`
2. `UserAvatar.svelte`
3. `EmojiPicker.svelte`
4. `LinkPreview.svelte`
5. `MessageContent.svelte`

**Verificación:**
- Componentes se renderizan sin errores
- Props funcionan correctamente

### ✅ FASE 5 — Componentes de Mensaje

1. `MessageItem.svelte`
2. `MessageList.svelte`
3. `MessageInput.svelte`

**Verificación:**
- MessageList renderiza mensajes
- MessageInput envía mensajes
- Edición/eliminación funciona

### ✅ FASE 6 — Vista Principal

1. `ChannelView.svelte`
2. `Sidebar.svelte`

**Verificación:**
- Sidebar muestra canales
- ChannelView muestra mensajes del canal activo
- Navegación entre canales funciona

### ✅ FASE 7 — Modales

1. `UserSearchModal.svelte`
2. `CreateChannelModal.svelte`
3. `ChannelMembersModal.svelte`
4. `ProfileView.svelte`

**Verificación:**
- Modales se abren/cierran
- Funcionalidad de cada modal opera correctamente

### ✅ FASE 8 — Integración Final

1. Crear ruta `/chat` en Skylab (o integrar en layout)
2. Implementar `initMessaging()` en el componente de ruta
3. Conectar auth de Skylab con auth de mensajería
4. Probar flujo completo

**Verificación:**
- Usuario de Skylab automáticamente autenticado en mensajería
- No aparece login adicional
- Todos los flujos funcionan end-to-end

### ✅ FASE 9 — Testing

1. Crear canal
2. Enviar mensaje
3. Editar mensaje
4. Eliminar mensaje
5. Añadir reacción
6. Subir archivo
7. Descargar archivo
8. Ver thumbnail
9. Crear DM
10. Buscar usuario
11. Gestionar miembros
12. Verificar presence
13. Verificar typing
14. Verificar unread counts
15. Verificar infinite scroll

---

## 15. REGLAS PROHIBIDAS (NO HACER)

### ❌ NO

- Buscar PinGGo en Internet
- Pedir acceso al repositorio
- Volver a analizar PinGGo
- Diseñar una nueva arquitectura
- Crear login propio de PinGGo
- Crear usuarios independientes
- Crear sistema de sesiones separado
- Crear sistema de temas separado
- Reconstruir el backend AWS
- Sustituir Socket.IO
- Sustituir stores sin necesidad
- Rehacer funcionalidad "porque sería más limpio"

### ✅ SÍ

- Usar este documento como especificación única
- Inspeccionar Skylab
- Adaptar PinGGo a Skylab
- Conservar lógica funcional
- Minimizar cambios
- Reutilizar patrones de Skylab cuando sean necesarios
- Solucionar incompatibilidades reales
- Probar cada fase

---

## 16. CRITERIO DE ÉXITO

La implementación será correcta cuando:

1. ✅ Un usuario entra en Skylab
2. ✅ No aparece login adicional de PinGGo
3. ✅ El usuario autenticado de Skylab queda automáticamente identificado en mensajería
4. ✅ Puede ver sus canales
5. ✅ Puede crear canales
6. ✅ Puede crear/utilizar DMs
7. ✅ Puede enviar mensajes
8. ✅ Los mensajes aparecen realtime vía Socket.IO
9. ✅ Puede editar/eliminar sus mensajes
10. ✅ Puede usar reacciones
11. ✅ Funciona typing indicator
12. ✅ Funciona presence
13. ✅ Funciona unread counts
14. ✅ Funciona infinite scroll
15. ✅ Funcionan uploads
16. ✅ Funcionan previews/thumbnails
17. ✅ Puede buscar usuarios de Skylab
18. ✅ Puede gestionar miembros de canales
19. ✅ Puede consultar perfiles
20. ✅ **No existe login/logout independiente de PinGGo**

---

## 17. RESOLUCIÓN DE IDENTIDAD (MUY IMPORTANTE)

### Problema

- **Skylab:** `user.id = 69` (ejemplo)
- **PinGGo:** `user.uuid = "550e8400-e29b-41d4-a716-446655440000"`

### Principio Fundamental

> **Un usuario de Skylab = un usuario de mensajería**

**NO:** Un usuario de Skylab + un usuario PinGGo independiente

### Estrategias Posibles

#### Opción A: UUID ya existe en Skylab

Si Skylab ya tiene un campo `uuid` en su modelo de usuario:

```javascript
export function adaptSkylabUserToMessaging(skylabUser) {
  return {
    uuid: skylabUser.uuid,  // ✅ Ya existe
    username: skylabUser.username,
    email: skylabUser.email,
    avatar_url: skylabUser.avatar,
  };
}
```

#### Opción B: Generar UUID determinista

Si Skylab solo tiene `id` numérico:

```javascript
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';  // UUID namespace

export function adaptSkylabUserToMessaging(skylabUser) {
  return {
    uuid: uuidv5(skylabUser.email, NAMESPACE),  // Determinista basado en email
    username: skylabUser.username,
    email: skylabUser.email,
    avatar_url: skylabUser.avatar,
  };
}
```

#### Opción C: Tabla de mapeo

Si el backend AWS debe mantener su propia tabla de usuarios:

```sql
-- En el backend AWS
CREATE TABLE skylab_user_mapping (
  skylab_id INT PRIMARY KEY,
  pinggo_uuid CHAR(36) UNIQUE,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Entonces, en Skylab frontend:

```javascript
export async function getOrCreateMessagingUser(skylabUser) {
  // 1. Llamar a endpoint de sincronización en backend AWS
  // 2. Backend verifica si existe mapping
  // 3. Si no existe, crea usuario en PinGGo DB y mapping
  // 4. Retorna uuid
  
  const { uuid } = await api.post('/api/sync-user', {
    body: {
      skylabId: skylabUser.id,
      email: skylabUser.email,
      username: skylabUser.username,
      avatar: skylabUser.avatar
    }
  });
  
  return {
    ...skylabUser,
    uuid
  };
}
```

### ⚠️ Decisión Crítica

**Antes de implementar, determinar cuál estrategia utilizar:**

1. Inspeccionar modelo de usuario de Skylab
2. Verificar si ya existe `uuid`
3. Verificar si el backend AWS puede modificarse
4. Elegir estrategia más simple y segura

**No asumir nada. No convertir `69 → "69"` y usarlo como UUID sin validar compatibilidad.**

---

## 18. COMPATIBILIDAD DE TOKENS JWT

### Problema Potencial

- **Skylab:** Genera JWT con `JWT_SECRET_SKYLAB`
- **PinGGo AWS:** Valida JWT con `JWT_ACCESS_SECRET`

Si los secrets son diferentes, **los tokens no serán válidos**.

### Solución A: Unificar Secrets

Si ambos sistemas pueden usar el mismo secret:

```bash
# Backend Skylab
JWT_SECRET=<mismo_secret>

# Backend PinGGo AWS
JWT_ACCESS_SECRET=<mismo_secret>
```

Además, verificar que el **payload del JWT sea compatible**:

```javascript
// Skylab debe incluir en el token:
{
  sub: "<uuid_del_usuario>",  // ⚠️ CRÍTICO: debe ser el uuid, no el id numérico
  email: "...",
  iat: ...,
  exp: ...
}
```

### Solución B: Token Exchange

Si los secrets no pueden unificarse, implementar endpoint de intercambio:

```javascript
// Backend AWS
POST /api/auth/exchange-token
Headers:
  X-Skylab-Token: <token_de_skylab>

Response:
  { accessToken: <token_pinggo>, refreshToken: <token_pinggo> }
```

Luego en Skylab frontend:

```javascript
export async function getMessagingToken(skylabAuth) {
  const response = await fetch(`${PINGGO_API_URL}/api/auth/exchange-token`, {
    headers: {
      'X-Skylab-Token': skylabAuth.accessToken
    }
  });
  
  const { accessToken } = await response.json();
  return accessToken;
}
```

### ⚠️ Decisión Crítica

**Antes de implementar:**

1. Verificar cómo Skylab genera tokens
2. Verificar payload del token
3. Verificar si el backend AWS puede validarlo
4. Elegir estrategia más simple

**No asumir que los tokens son compatibles sin probar.**

---

## 19. ESTILOS Y DISEÑO

### Sistema de Diseño de PinGGo (según DESIGN.md)

```css
:root {
  /* Colores */
  --calm-blue: #4f8ef7;
  --carbon-bg: #1a1d21;
  --surface: #222529;
  --border: rgba(255, 255, 255, 0.1);
  --text-primary: #ffffff;
  --text-secondary: #b9bbbe;
  
  /* Presence */
  --online: #43b581;
  --away: #faa61a;
  --offline: #747f8d;
  
  /* Espaciado */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```

### Principios de Diseño

1. **Accent Scarcity** — Azul solo en elementos críticos
2. **Tonal Depth** — Capas de grises oscuros
3. **Readability Density** — Espaciado generoso
4. **Flat by Default** — Sin sombras salvo en modales/dropdowns

### Adaptación a Skylab

**Si Skylab tiene su propio sistema de diseño:**

1. **Mantener estructura funcional de PinGGo**
2. **Adaptar solo clases CSS**
3. **Reutilizar variables CSS de Skylab cuando sea posible**

Ejemplo:

```svelte
<!-- PinGGo original -->
<button class="pinggo-button primary">Enviar</button>

<!-- Adaptado a Skylab -->
<button class="skylab-btn skylab-btn-primary">Enviar</button>
```

**No cambiar la lógica, solo los estilos.**

---

## 20. ASSETS

PinGGo incluye iconos de tipos de archivo:

```
$lib/assets/
  csv.svg
  excel.svg
  exe.svg
  pdf.svg
  ppt.svg
  txt.svg
  word.svg
  xml.svg
  zip.png
  cloud_lock.svg  (logo)
  view1.png  (screenshots - NO copiar)
  view2.png
  view3.png
  view4.png
```

**Para Skylab:**

1. Copiar solo iconos necesarios (`csv.svg`, `pdf.svg`, etc.)
2. **NO copiar screenshots**
3. Si Skylab ya tiene iconos de archivo, reutilizarlos

---

## 21. DEPENDENCIAS NPM

### Frontend

```json
{
  "dependencies": {
    "socket.io-client": "^4.x",
    "uuid": "^9.x"  // Si se usa generación de UUIDs
  },
  "devDependencies": {
    "pdfjs-dist": "^3.x"  // Solo si se implementa preview de PDFs
  }
}
```

### ⚠️ No instalar dependencias innecesarias

- Si Skylab ya tiene `socket.io-client`, reutilizar
- `pdfjs-dist` solo si se implementan previews de PDF (opcional para MVP)

---

## 22. TESTING Y VERIFICACIÓN

Después de cada fase, ejecutar:

```bash
# Compilación
npm run build

# Linting (si existe)
npm run lint

# Type checking (si existe)
npm run check
```

### Tests Manuales (FASE 9)

Crear checklist interactiva:

```markdown
### Autenticación
- [ ] Usuario de Skylab aparece automáticamente en mensajería
- [ ] No aparece login de PinGGo
- [ ] Token se envía correctamente al backend

### Canales
- [ ] Crear canal grupal
- [ ] Ver lista de canales
- [ ] Unirse a canal
- [ ] Salir de canal
- [ ] Ver miembros de canal
- [ ] Añadir miembro a canal

### Mensajes Directos
- [ ] Buscar usuario
- [ ] Crear DM
- [ ] Ver lista de DMs
- [ ] Presence visible en DMs

### Mensajes
- [ ] Enviar mensaje de texto
- [ ] Ver mensajes en tiempo real (Socket.IO)
- [ ] Editar mensaje propio
- [ ] Eliminar mensaje propio
- [ ] Infinite scroll (cargar más mensajes)

### Reacciones
- [ ] Añadir reacción
- [ ] Ver reacciones de otros
- [ ] Eliminar reacción propia

### Archivos
- [ ] Subir imagen
- [ ] Ver imagen inline
- [ ] Subir archivo (PDF, Office, etc.)
- [ ] Ver thumbnail de archivo
- [ ] Descargar archivo

### Presence y Typing
- [ ] Ver usuario online
- [ ] Ver usuario away
- [ ] Ver usuario offline
- [ ] Ver "está escribiendo..."

### Unread
- [ ] Badge de no leídos aparece
- [ ] Badge desaparece al abrir canal
- [ ] Count correcto
```

---

## 23. PROBLEMAS COMUNES Y SOLUCIONES

### Problema: "401 Unauthorized" en todas las peticiones

**Causa:** Token no se envía o no es válido.

**Solución:**
1. Verificar que `setAccessToken()` se llama correctamente
2. Verificar que `api.request()` incluye `Authorization: Bearer <token>`
3. Verificar payload del JWT en https://jwt.io
4. Verificar que `req.user.sub` en backend coincide con `uuid`

### Problema: Socket.IO no conecta

**Causa:** URL incorrecta o token no válido.

**Solución:**
1. Verificar `VITE_API_URL` en `.env`
2. Verificar que `auth: { token }` se pasa correctamente
3. Revisar logs del backend AWS
4. Verificar CORS en backend

### Problema: Mensajes no aparecen en tiempo real

**Causa:** Listeners no están bindeados.

**Solución:**
1. Verificar que `bindSocketListeners()` se llama en `initMessaging()`
2. Verificar que el socket está conectado (`socket.connected === true`)
3. Revisar eventos emitidos por el servidor

### Problema: Usuario no puede subir archivos

**Causa:** `channelId` no se envía o membership no validada.

**Solución:**
1. Verificar que `uploadFile(file, channelId)` recibe `channelId`
2. Verificar que el backend valida membership en `/api/upload/presign`
3. Revisar logs del backend

### Problema: Unread counts incorrectos

**Causa:** `last_read_at` no se actualiza.

**Solución:**
1. Verificar que `POST /api/channels/:uuid/read` se llama al abrir canal
2. Verificar que `clearUnread(channelId)` se llama en el store
3. Verificar que el backend actualiza `channel_members.last_read_at`

---

## 24. ENTREGA FINAL

Al completar la implementación, proporcionar:

### 1. Archivos Creados

```
lib/
  adapters/
    userAdapter.js
  stores/
    auth.js
    channels.js
    messages.js
    presence.js
    unread.js
    view.js
  api/
    index.js
    avatar.js
    upload.js
    download.js
    preview.js
  socket/
    client.js
  utils/
    urlText.js
    filePreview.js
    linkPreview.js
  messaging/
    init.js
  components/
    messaging/
      PresenceDot.svelte
      UserAvatar.svelte
      EmojiPicker.svelte
      LinkPreview.svelte
      MessageContent.svelte
      MessageItem.svelte
      MessageList.svelte
      MessageInput.svelte
      ChannelView.svelte
      Sidebar.svelte
      UserSearchModal.svelte
      CreateChannelModal.svelte
      ChannelMembersModal.svelte
      ProfileView.svelte

routes/
  chat/
    +page.svelte
```

### 2. Archivos Modificados

```
.env  (+ VITE_API_URL)
package.json  (+ socket.io-client, uuid?)
```

### 3. Integraciones Realizadas

- **Auth:** Skylab → Adaptador → Auth Store
- **Routing:** `/chat` o equivalente
- **API:** Cliente base reutiliza infraestructura de Skylab (si aplica)
- **Socket.IO:** Conectado al backend AWS con token de Skylab
- **Estilos:** Variables CSS adaptadas a Skylab

### 4. Problemas Encontrados

Documentar cualquier incompatibilidad o problema no previsto:

- Resolución de identidad (UUID)
- Compatibilidad de tokens JWT
- Diferencias en estructura de usuario
- Necesidad de endpoints adicionales

### 5. Soluciones Aplicadas

Explicar cómo se resolvieron los problemas.

### 6. Tests/Verificaciones Ejecutados

Checklist de la sección 22 completada.

### 7. Pendientes (si los hay)

```
- Implementar previews de PDF (opcional)
- Mejorar UI de modales
- Añadir búsqueda avanzada de usuarios
- Implementar notificaciones de navegador
- etc.
```

---

## 25. RESUMEN EJECUTIVO

### Qué ES este proyecto

Una **migración fiel** del módulo de mensajería PinGGo a Skylab, conservando:

- ✅ Arquitectura de stores
- ✅ API clients
- ✅ Socket.IO
- ✅ Flujo de datos
- ✅ Componentes UI
- ✅ Funcionalidad completa

### Qué NO ES este proyecto

- ❌ Un rediseño de mensajería
- ❌ Una nueva arquitectura
- ❌ Un sistema de auth independiente
- ❌ Una reconstrucción del backend

### Principio Guía

> **Conservar la funcionalidad. Adaptar solo la integración.**

### Fuente de Verdad

Este documento es la **única especificación**.

No explorar PinGGo externamente.

---

## 26. GRAPHIFY METADATA

**Corpus:** 108 archivos · ~65,549 palabras  
**Nodos:** 494  
**Edges:** 749  
**Comunidades:** 41  
**Extracción:** 93% EXTRACTED · 7% INFERRED  
**Fecha de Análisis:** 2026-08-19  

**Commit Analizado:** `e23d8e6b0b6445bd353d3c1b4f9598204f896c79`

---

## 27. CONTACTO Y SOPORTE

Si durante la implementación surgen dudas críticas que no están cubiertas en este documento:

1. **Revisar el GRAPH_REPORT.md** para detalles adicionales de arquitectura
2. **Consultar graph.json** para relaciones específicas entre componentes
3. **Documentar la duda y proponer solución** antes de implementar

**No bloquear el progreso.** Si hay incertidumbre, implementar la solución más simple y documentarla para revisión posterior.

---

## FIN DEL PROMPT

Este documento contiene **toda la información necesaria** para implementar el módulo de mensajería PinGGo en Skylab.

**No se requiere exploración adicional de PinGGo.**

**Comienza con FASE 0: Skylab Integration Discovery.**

---

_Generado a partir del análisis Graphify de PinGGo (commit `e23d8e6`)_  
_Documento v1.0 - 2026-08-19_
