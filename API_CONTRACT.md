# PinGGo API Contract

Fuente de verdad estática del contrato que implementa el backend presente en este checkout, auditado el 2026-09-04. Este documento describe el código ejecutable; `README.md`, `MIGRATION_PROMPT.md` y `BACKEND_PROMPT.md` se consideran documentación histórica cuando contradicen el código.

> Alcance: `back/src/**`. No se modificó ningún archivo del backend. No se hizo una llamada contra un despliegue remoto, por lo que cualquier servidor que no provenga de este commit puede diferir.

## 1. Source of Truth

Orden aplicado durante la auditoría:

1. rutas y middleware ejecutados (`back/src/api/**`, `back/src/index.js`);
2. handlers de servicio, destructuring y validaciones (`back/src/services/**`);
3. consultas SQL y schema (`back/src/db/**`);
4. emisiones Socket.IO (`back/src/socket/**`);
5. consumidores reales en `front/src/**` y en el módulo migrado `skylab/src/modules/pinggo/**`;
6. documentación únicamente para detectar drift.

No existen validadores, DTOs, serializers ni response builders independientes en el backend. Los contratos se definen directamente en los handlers y en los alias/proyecciones SQL.

Archivos principales auditados:

- HTTP: `back/src/index.js`, `back/src/api/index.js`, `back/src/api/*/router.js`.
- Auth y errores: `back/src/middleware/auth.js`, `back/src/middleware/errorHandler.js`, `back/src/services/authService.js`.
- Dominio: `channelService.js`, `messageService.js`, `userService.js`.
- S3/media: `uploadService.js`, `downloadService.js`, `avatarService.js`, `thumbnailService.js`, `linkPreviewService.js`.
- Tiempo real: `socket/index.js`, `socket/middleware/authSocket.js`, `socket/handlers/*.js`.
- Persistencia: `db/schema.sql`, `db/pool.js`, `db/migrations/001_add_skylab_integration.sql`.

No se encontraron tests o specs del backend en este repositorio.

## 2. Base URL, transporte y headers

- El proceso escucha `PORT` o `4000` por defecto.
- Todas las rutas REST están bajo `/api`.
- Por tanto, el health check es `GET /api/health` y, por ejemplo, los canales son `/api/channels`.
- `express.json({ limit: '10mb' })` procesa cuerpos JSON. No hay multipart upload: los archivos se suben directamente a S3 mediante una URL firmada.
- CORS usa `CORS_ORIGIN` como lista separada por comas; por defecto, en el checkout actual, `http://localhost:5173`, `http://localhost:4000` y `http://localhost:5000`, con `credentials: true`.
- Todas las peticiones REST salvo `/api/health` y las rutas de auth públicas pasan por JWT cuando la ruta lo indica abajo.
- Cabecera de auth: `Authorization: Bearer <accessToken>`.
- El middleware también acepta una cookie `access_token`, aunque el backend de auth no la establece; la cookie que sí establece es `refresh_token`.
- El rate limit se aplica a todo `/api`: 300 solicitudes por ventana de 15 minutos. Devuelve `429` desde `express-rate-limit`, con su handler por defecto, no desde el `errorHandler` de la aplicación.
- Socket.IO comparte el mismo `httpServer` y puerto, namespace raíz (`/`), no `/api`.

## 3. Authentication

### JWT de acceso

El backend firma un payload mínimo `{ sub: user.uuid, username: user.username }` con `JWT_ACCESS_SECRET`. Expira en `15m`. `sub` es el UUID público del usuario, no el `id` numérico de MySQL.

### Cookie de refresh

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` y `POST /api/auth/exchange-token` establecen `refresh_token`:

- `HttpOnly: true`;
- `maxAge: 7 días`;
- `path: /api/auth`;
- `secure: true` y `sameSite: strict` en producción;
- `secure: false` y `sameSite: lax` fuera de producción.

`POST /api/auth/logout` limpia esa cookie. El refresh token no se recibe en el body: se lee de la cookie.

### Errores de auth

La ausencia o invalidez del access token produce `401` con `{ "error": "Unauthorized" }` o `{ "error": "Invalid or expired token" }`. La autenticación de Socket.IO es independiente del middleware Express y usa `socket.handshake.auth.token`.

## 4. Error Contract

La forma de error de aplicación es, salvo excepciones de infraestructura de Express/S3:

```json
{
  "error": "mensaje"
}
```

El `errorHandler` global usa el status de `err.status` o `err.statusCode`, o `500`; devuelve `{ error }` y añade `stack` únicamente si `NODE_ENV=development`. Las rutas de download, thumbnails y previews capturan sus propios errores y no pasan por el handler global.

Statuses realmente usados por el código:

| Status | Cuándo | Forma |
| --- | --- | --- |
| 200 | Éxito normal, incluidos `ok` y respuestas idempotentes | JSON del endpoint |
| 201 | Registro y creación de canal nuevo | JSON del endpoint |
| 400 | Campos obligatorios ausentes, estado/URL inválidos o errores capturados sin status específico | `{error: string}` |
| 401 | Access token ausente/inválido; credenciales inválidas; refresh ausente/inválido | `{error: string}` |
| 403 | Falta de membership/permisos o avatar key inválida | `{error: string}` |
| 404 | Usuario, canal, mensaje, archivo o avatar no encontrado; thumbnail no disponible | `{error: string}` |
| 409 | Email o username ya ocupado al registrar | `{error: string}` |
| 413 | Archivo >25 MB o avatar >5 MB | `{error: string}` |
| 415 | MIME no permitido | `{error: string}` |
| 422 | No se genera en ningún handler | — |
| 429 | Rate limit global de Express | `response.send("Too many requests, please try again later.")` del handler por defecto; no `{error}` |
| 500 | DB, Redis, S3, conversión o cualquier excepción no controlada; thumbnails usa explícitamente este fallback | `{error: string}`, con `stack` solo en development si llega al handler global |
| 503 | S3 no configurado en presign de uploads/avatars | `{error: string}` |

No hay un handler JSON propio para rutas inexistentes; un path no registrado puede recibir la respuesta 404 por defecto de Express, fuera del contrato JSON de aplicación.

## 5. Complete REST Endpoint Inventory

Todos los paths siguientes incluyen el prefijo `/api`. `auth` indica si se exige el access JWT.

| Método y path | Finalidad | Auth | Body/query/path | Éxito |
| --- | --- | --- | --- | --- |
| `GET /api/health` | Health check | No | — | `200 {status, ts}` |
| `POST /api/auth/register` | Registro nativo | No | Body de registro | `201 {user, accessToken}` + refresh cookie |
| `POST /api/auth/login` | Login nativo | No | Body de login | `200 {user, accessToken}` + refresh cookie |
| `POST /api/auth/refresh` | Rotar access/refresh token | No, pero cookie refresh requerida | Cookie `refresh_token` | `200 {accessToken}` + refresh cookie |
| `POST /api/auth/logout` | Limpiar refresh cookie | No | — | `200 {ok:true}` |
| `POST /api/auth/exchange-token` | Crear/sincronizar usuario desde Skylab | No | Body Skylab | `200 {accessToken,user}` + refresh cookie |
| `GET /api/auth/me` | Perfil del usuario autenticado | Sí | — | `200 {user}` |
| `GET /api/users/search?q=...` | Buscar por username | Sí | Query `q` | `200 {users}` |
| `POST /api/users/me/avatar/presign` | Presign PUT de avatar | Sí | Body de archivo | `200 {uploadUrl,avatarKey}` |
| `PATCH /api/users/me` | Cambiar username/avatar/status | Sí | Body parcial | `200 {user}` |
| `GET /api/users/:userId/avatar/presign` | Presign GET de avatar | Sí | `userId` | `200 {avatarUrl}` |
| `GET /api/users/:userId` | Perfil público | Sí | `userId` | `200 {user}` |
| `GET /api/channels` | Listar canales visibles | Sí | — | `200 {channels}` |
| `POST /api/channels` | Crear canal/direct/group | Sí | Body de canal | `201 {channel}` o `200 {channel}` si DM direct existente |
| `GET /api/channels/:channelId` | Canal y sus miembros | Sí | `channelId` | `200 {channel}` |
| `POST /api/channels/:channelId/read` | Actualizar `last_read_at` | Sí | `channelId` | `200 {ok:true}` |
| `DELETE /api/channels/:channelId/members/me` | Salir del canal | Sí | `channelId` | `200 {ok:true}` |
| `POST /api/channels/:channelId/members` | Añadir miembro | Sí | `channelId` + body | `200 {ok:true}` |
| `GET /api/channels/:channelId/messages` | Listar mensajes | Sí | `channelId` + `limit,before` | `200 {messages,hasMore}` |
| `PATCH /api/messages/:messageId` | Editar propio mensaje | Sí | `messageId` + body | `200 {message}` |
| `DELETE /api/messages/:messageId` | Soft-delete de propio mensaje | Sí | `messageId` | `200 {ok:true}` |
| `POST /api/messages/:messageId/reactions` | Añadir reacción idempotente | Sí | `messageId` + body | `200 {ok,reactions}` |
| `DELETE /api/messages/:messageId/reactions/:emoji` | Eliminar reacción propia | Sí | `messageId,emoji` | `200 {ok,reactions}` |
| `POST /api/upload/presign` | Presign PUT de attachment | Sí | Body de archivo + canal | `200 {uploadUrl,fileKey}` |
| `GET /api/download/presign?uuid=...&view=true` | Presign GET de archivo de mensaje | Sí | Query `uuid,view` | `200 {downloadUrl,fileName}` |
| `GET /api/thumbnails/presign?uuid=...` | Presign/generar thumbnail PDF/Office | Sí | Query `uuid` | `200 {url}` |
| `GET /api/previews/resolve?url=...` | Resolver metadata Open Graph | Sí | Query `url` | `200` objeto preview plano |

No existen actualmente endpoints HTTP para modificar/eliminar canal, eliminar a otro miembro, listar DMs, listar reacciones, subir multipart, crear mensajes por REST ni endpoint independiente de presence.

## 6. Auth Endpoints

### `POST /api/auth/register`

Request body, sin validación de tipos/formato más allá de truthiness:

| Campo | Tipo efectivo | Obligatorio | Nullable | Default | Descripción |
| --- | --- | --- | --- | --- | --- |
| `username` | valor compatible con columna `VARCHAR(50)` | Sí | No | — | Username único |
| `email` | valor compatible con `VARCHAR(255)` | Sí | No | — | Email único |
| `password` | string esperado | Sí | No | — | Se hashea con bcrypt cost 12 |

Respuestas:

- `201`: `{ user: { id, uuid, username, email }, accessToken }`; `id` es el id numérico de DB y se expone aquí.
- `400`: `username, email and password are required`.
- `409`: `Email or username already taken`.
- `500`: error de DB/hash no previsto.

### `POST /api/auth/login`

Body: `email` y `password`, ambos obligatorios y no nulos en la práctica. `400` si falta alguno; `401 {error:"Invalid credentials"}` si el usuario no existe o la contraseña no coincide; `500` en errores no previstos.

`200` devuelve `{ user, accessToken }`, donde `user` contiene exactamente `id, uuid, username, email, avatar_url, status`; `password_hash` se elimina. Se establece `refresh_token`.

### `POST /api/auth/refresh`

No acepta body. Requiere cookie `refresh_token`. Verifica firma y expiración con el refresh secret y busca el usuario por `payload.sub`.

- `200`: `{accessToken}` y nueva cookie `refresh_token`.
- `401`: `No refresh token`, `Invalid or expired refresh token` o `User not found`.
- `500`: fallo no previsto.

### `POST /api/auth/logout`

No requiere JWT ni body. `200 {ok:true}` y `Set-Cookie` para limpiar `refresh_token`. Un logout sin sesión también responde 200.

### `POST /api/auth/exchange-token`

Body:

| Campo | Tipo efectivo | Obligatorio | Nullable | Default | Descripción |
| --- | --- | --- | --- | --- | --- |
| `skylabId` | valor truthy; se inserta en `INT UNSIGNED` | Sí | No | — | Id de Skylab |
| `email` | string esperado | Sí | No | — | Se usa para UUID v5 determinista |
| `username` | string esperado | Sí | No | — | Nombre sincronizado |
| `skylabToken` | valor truthy | Sí | No | — | Se exige su presencia, pero **no se valida** |

UUID de PinGGo: UUID v5 de `email` con namespace `6ba7b810-9dad-11d1-80b4-00c04fd430c8`. Busca y crea por UUID, no por email. `200` devuelve `{accessToken,user}`, con `user: {id,uuid,username,email,avatar_url}`. Si ya existe, actualiza solo username. `400` si falta un campo; `500` si hay conflicto/DB.

> ⚠️ `skylabToken` es actualmente una credencial no autenticada: el backend no verifica firma, expiración ni lo contrasta con Skylab.

### `GET /api/auth/me`

Requiere JWT. `200` devuelve:

`{ user: { id, uuid, username, email, avatar_url, status, last_seen, created_at } }`.

`404 {error:"User not found"}` si el `sub` no corresponde a un usuario; `500` en DB.

## 7. Users

### `GET /api/users/search`

Query `q`: obligatorio, longitud mínima 2. Busca únicamente `username LIKE %q%`, excluye el propio UUID y limita a 20. No busca por email aunque la documentación histórica lo afirma.

- `200`: `{ users: [{ uuid, username, avatar_url, status }] }`.
- `400`: `{error:"Query must be at least 2 chars"}`.
- `500`: DB.

### `GET /api/users/:userId`

`userId` es un UUID. `200`: `{user:{uuid,username,avatar_url,status,last_seen}}`. No incluye `id` ni `email`. `404`: `User not found`.

No existe `/api/users/:uuid/profile`; el path real es el anterior.

### `PATCH /api/users/me`

Body parcial:

| Campo | Tipo efectivo | Obligatorio | Nullable | Default | Descripción |
| --- | --- | --- | --- | --- | --- |
| `username` | valor truthy | No | No en update efectivo | — | Actualiza username |
| `avatarUrl` | valor truthy | No | No en update efectivo | — | Guarda una key S3 o URL externa |
| `status` | string | No | No en update efectivo | — | Solo `online`, `away`, `dnd` |

`avatarUrl` que empieza por `avatars/` debe empezar además por `avatars/<JWT sub>/`; otras strings pasan esa comprobación. No se permite REST `status: "offline"`. Si no hay ningún campo truthy: `400 Nothing to update`; status inválido: `400 Invalid status`; avatar key inválida: `403 Invalid avatar key`.

`200` devuelve `{user:{uuid,username,email,avatar_url,status}}`. El backend no comprueba explícitamente que el usuario exista antes de responder. `500` en DB/username duplicado.

### `POST /api/users/me/avatar/presign`

Body: `fileName`, `fileType`, `fileSize`, todos obligatorios y truthy. MIME permitido: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Tamaño máximo 5 MiB. `fileSize` se convierte a Number para S3, pero no se valida que sea numérico.

- `200`: `{uploadUrl, avatarKey}`; URL PUT válida 300 segundos, key `avatars/<userUuid>/<uuid><extension>`.
- `400`: campos requeridos.
- `415`: `Avatar must be a JPEG, PNG, GIF or WebP image`.
- `413`: `Avatar is too large (max 5 MB)`.
- `503`: `S3 not configured`.
- `500`: firma/S3/DB no previsto.

El cliente debe enviar en el PUT a S3 el mismo `Content-Type` firmado.

### `GET /api/users/:userId/avatar/presign`

Requiere auth, pero no restringe el perfil al propio usuario. `200 {avatarUrl}`: si `avatar_url` ya es una URL HTTP(S), se devuelve sin firmar; si es key S3, se devuelve GET firmado durante 3600 segundos. `404` para usuario o avatar inexistente; `503` si se necesita S3 y no está configurado; `500` en otros errores.

## 8. Channels

### Modelo y semántica efectiva

`channels.type` es un enum DB: `channel`, `direct`, `group`, `private`. `channels.is_private` es `BOOLEAN` de MySQL, y se serializa sin normalizador global; las respuestas construidas por create envían explícitamente `0` o `1`.

- `channel`: canal público. Al crearlo se añaden todos los usuarios existentes como members; `GET /channels` hace backfill para nuevos usuarios. `is_private=0`.
- `private`: canal privado. Requiere nombre; solo creator y `memberUuids` existentes entran inicialmente. `is_private=1`.
- `direct`: DM de dos personas por convención. Si `memberUuids.length===1`, se busca un direct existente entre el creador y ese UUID y se reutiliza. `is_private=0`.
- `group`: conversación multiusuario admitida por `createChannel`, pero **no está implementada coherentemente al leerla**: no se enriquece como DM en list/detail y normalmente tiene `name=null`. `is_private=0`.

No hay una flag API `isDirectMessage` ni `is_direct_message` en el backend actual. La forma efectiva de crear un DM es `type: "direct"` con `memberUuids`.

`created_by` se guarda en DB, pero no se devuelve. El creator se representa en `channel_members.role = "owner"`; no se devuelve un campo `owner`/`creator`.

### `GET /api/channels`

No body/query. Requiere membership. Hace backfill de todos los canales `type='channel'` para el usuario actual y devuelve `200`:

`{channels: ChannelList[]}`.

Cada elemento contiene la proyección:

| Campo | Tipo/nullable | Siempre presente | Origen |
| --- | --- | --- | --- |
| `uuid` | string UUID | Sí | `c.uuid` |
| `name` | string o null | Sí como propiedad | `c.name`; para `direct`, username del otro miembro; para `group`, no se aplica el CASE |
| `dm_user_uuid` | string o null | Sí como propiedad | Solo `direct` |
| `dm_avatar_url` | string o null | Sí como propiedad | Solo `direct` |
| `dm_status` | enum o null | Sí como propiedad | Solo `direct` |
| `type` | `channel|direct|group|private` | Sí | `c.type` |
| `description` | string o null | Sí | `c.description` |
| `is_private` | normalmente `0/1` | Sí | `c.is_private` |
| `created_at` | fecha serializada por mysql2/JSON | Sí | `c.created_at` |
| `unread_count` | count numérico o representación numérica de mysql2 | Sí | `COUNT(*)` |

No incluye `members`, `memberUuids`, `owner`, `creator`, `isPrivate` ni `isDirectMessage`.

### `GET /api/channels/:channelId`

`channelId` es el UUID. El backend hace backfill de miembros para ese canal si `type='channel'`; después exige que el solicitante esté en `channel_members`.

- `200`: `{ channel: { uuid, name, type, is_private, created_at, members } }`.
- `members` es un array de `{uuid,username,avatar_url,status,role}`; `role` es `owner|admin|member`.
- **No incluye `description`**, a diferencia de list/create.
- `404 {error:"Channel not found"}` si no existe o el usuario no tiene membership.
- `500`: DB.

### `POST /api/channels`

Body:

| Campo | Tipo efectivo | Obligatorio | Nullable | Default | Descripción |
| --- | --- | --- | --- | --- | --- |
| `name` | string/valor truthy | Sí para no direct/group | Sí para direct/group | — | Nombre; se guarda null para direct/group |
| `description` | cualquier valor compatible con DB | No | Sí | `''` | Descripción |
| `type` | string; DB final debe ser enum | No | No | `'channel'` | `channel`, `private`, `direct`, `group` |
| `isPrivate` | boolean esperado | No | No | `false` | Solo se considera cuando `=== true` y no es direct/group |
| `memberUuids` | array iterable esperado | No | No | `[]` | UUIDs de usuarios; inexistentes se ignoran silenciosamente |

Reglas:

- `type='direct'` o `type='group'` evita exigir `name`.
- Para no direct/group, `isPrivate === true` o `type='private'` produce `finalType='private'` e `is_private=1`; si no, `finalType='channel'`.
- Creator siempre se inserta como `owner`, aunque no esté en `memberUuids`.
- `isPrivate` se ignora para direct/group.
- Solo `type='direct'` con exactamente un UUID busca duplicado; el path de reutilización responde `200`, no `201`.
- Crear `direct` con cero o más de un UUID no tiene validación adicional.
- Un `type` desconocido puede acabar en `channel/private` por la lógica, pero un valor que no pueda persistirse en el enum genera error DB.

Respuesta de creación nueva (`201`):

`{ channel: { uuid, name, description, type, is_private, dm_user_uuid, dm_avatar_url } }`.

`dm_user_uuid`/`dm_avatar_url` solo se rellenan si el **type recibido originalmente** fue exactamente `direct`; en otro caso son `null`. No se incluye `members`, `memberUuids`, `isDirectMessage`, `isPrivate`, `owner` ni `creator`.

Respuesta de DM `direct` ya existente (`200`): `{channel:{uuid,type,is_private,description,name,dm_user_uuid,dm_avatar_url}}`. No incluye `dm_status` ni members.

Statuses adicionales: `400 name is required`; `404 User not found` si no existe el creator; `500` por payload mal formado, DB o carrera de duplicados.

### `POST /api/channels/:channelId/members`

Body obligatorio `{userUuid}`. Exige que el usuario actual sea `owner` o `admin` del canal.

- `200 {ok:true}`; insert idempotente (`INSERT IGNORE`).
- `400 {error:"userUuid is required"}`.
- `403 {error:"Forbidden"}` si no es manager o canal inaccesible.
- `404 {error:"User not found"}` para el nuevo usuario.

No valida que el canal sea privado, ni devuelve el miembro. No existe DELETE de un miembro ajeno.

### `POST /api/channels/:channelId/read`

Sin body. Actualiza `channel_members.last_read_at = NOW()` para la combinación canal/usuario. Responde siempre `200 {ok:true}` aunque no se haya actualizado ninguna fila; DB error produce `500`.

### `DELETE /api/channels/:channelId/members/me`

Sin body. Borra la membership del usuario actual. Solo valida que el usuario y canal existan, no que hubiera membership previa.

- `200 {ok:true}` si se borra cero o una fila.
- `404 {error:"Not found"}` si usuario o canal no existen.

Los canales públicos pueden reaparecer al siguiente list/get por el backfill automático.

## 9. Messages

### DTO real de Message

La proyección REST (`MESSAGE_PROJECTION`) y el message enviado por Socket.IO tienen estos campos:

| Campo | Tipo/nullable | Siempre presente en REST | Descripción |
| --- | --- | --- | --- |
| `uuid` | string UUID | Sí | Id público |
| `content` | string o null | Sí | Texto; el socket guarda null si queda vacío |
| `type` | `text|file|system|reply` en DB | Sí | Si hay archivo, socket fuerza `file` |
| `created_at` | fecha serializada | Sí | `messages.created_at` |
| `edited_at` | fecha o null | Sí en list/edit | `messages.edited_at` |
| `file_key` | string o null | Sí | Key S3, no URL |
| `file_name` | string o null | Sí | Nombre original |
| `file_size` | número o null | Sí | Tamaño de archivo |
| `file_type` | string MIME o null | Sí | MIME |
| `user_uuid` | string UUID | Sí | UUID del autor |
| `username` | string | Sí | Username proyectado |
| `avatar_url` | string o null | Sí | Key/URL guardada del avatar |
| `parent_uuid` | string UUID o null | Sí | Parent de reply si existe |
| `reactions` | array | Sí | Agregado por servicio; vacío si no hay |

No se devuelve `channel_id`, `channel_uuid`, `author`, `user` anidado, `attachments`, `deleted_at`, `updated_at` ni `file_url`. `deleted_at` se usa para filtrar/soft-delete, pero no forma parte del DTO.

Cada reacción es `{emoji:string, count:number, userUuids:string[]}`. `count` se convierte explícitamente a Number; `userUuids` sale de `JSON_ARRAYAGG` y se parsea si mysql2 lo entrega como string.

### `GET /api/channels/:channelId/messages`

No hay POST REST correspondiente en el router actual.

Query:

| Query | Tipo | Default/límite | Efecto |
| --- | --- | --- | --- |
| `limit` | string convertible a Number | `50`, máximo efectivo `100` | `Math.min(Number(limit) || 50, 100)`; no hay validación de negativos/fracciones |
| `before` | UUID string | ausente | Busca id DB del mensaje y filtra `m.id < cursor.id`; UUID inexistente equivale a no aplicar cursor |

Exige membership; `403 {error:"Access denied"}` si no. Selecciona mensajes no borrados, ordena DB por id DESC, invierte el array antes de responder: orden cronológico ascendente (oldest → newest). `hasMore` es `messages.length === limit`.

`200`: `{messages: Message[], hasMore:boolean}`. `500` en DB/JSON de reacciones. No devuelve `total` ni cursor siguiente.

### `PATCH /api/messages/:messageId`

Body `{content}`; `content` debe ser truthy. No se valida tipo ni longitud y se guarda sin trim.

- Solo el autor y un mensaje no borrado pueden editar.
- `200 {message: Message}` con `edited_at` actualizado y reactions completas.
- `400 {error:"content is required"}`.
- `404 {error:"Message not found or not yours"}`.
- Emite `message:updated` al room del canal.

### `DELETE /api/messages/:messageId`

Sin body. Solo el autor y un mensaje no borrado. Hace soft-delete (`deleted_at=NOW()`), no devuelve el mensaje borrado.

- `200 {ok:true}`.
- `404 {error:"Message not found or not yours"}`.
- Emite `message:deleted`.

### Reacciones

`POST /api/messages/:messageId/reactions` recibe `{emoji}` obligatorio/truthy. `DELETE /api/messages/:messageId/reactions/:emoji` no recibe body; `emoji` es path param URL-encoded por el cliente. Ambos buscan solo que existan mensaje y usuario; **no verifican membership del usuario en el canal ni `deleted_at`**.

- Add usa `INSERT IGNORE`: repetir la misma reacción no incrementa count.
- Ambos devuelven `200 {ok:true,reactions:Reaction[]}` y emiten `message:reaction` con el array completo.
- `400 {error:"emoji is required"}` solo en add.
- `404 {error:"Not found"}` si mensaje o usuario no existe.

No hay endpoint GET de reacciones ni operación de toggle en backend; el toggle del frontend se compone de POST/DELETE.

### Creación por Socket.IO

La única creación implementada es el evento `message:send`, documentado en la sección Socket.IO. El endpoint histórico `POST /api/channels/:channelId/messages` no existe y devuelve ruta no registrada.

## 10. Attachments / Files / S3

El schema tiene una tabla `attachments`, pero ningún handler la inserta ni la lee. El contrato vigente guarda attachments directamente en las columnas `messages.file_key`, `file_name`, `file_size`, `file_type`.

### `POST /api/upload/presign`

Body exacto:

| Campo | Tipo efectivo | Obligatorio | Nullable | Default | Descripción |
| --- | --- | --- | --- | --- | --- |
| `fileName` | string/valor truthy | Sí | No | — | Nombre; su extensión se añade a la key |
| `fileType` | string MIME | Sí | No | — | Debe estar en allowlist |
| `fileSize` | número o string numérico esperado | Sí | No | — | Se convierte a Number; máximo 25 MiB |
| `channelId` | UUID string | Sí | No | — | Canal de destino y autorización |

MIME permitidos: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/zip`, `application/x-zip-compressed`, `application/x-rar-compressed`, `application/vnd.rar`, `application/x-7z-compressed`, `text/plain`, `text/csv`, `application/json`, `application/xml`, `text/xml`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/mp4`.

La respuesta `200` es `{uploadUrl,fileKey}`. La URL firma `PUT` por 300 segundos con `ContentType=fileType` y `ContentLength=Number(fileSize)`. La key es `attachments/<requestingUserUuid>/<randomUuid><lowercaseExtension>`.

Statuses: `400` campos requeridos; `415 File type not allowed`; `413 File too large (max 25 MB)`; `503 S3 not configured`; `403 Not a member of this channel`. La función se registra como async sin `try/catch` ni `next` (`upload/router.js` → `createPresignedUpload`); con Express 4, una excepción de DB/S3 no queda normalizada por el `errorHandler` global como `{error}` y puede terminar como rechazo no manejado. No debe asumirse un `500` JSON estable para ese caso.

El backend calcula `fileUrl`, pero no lo devuelve ni persiste metadata. La subida S3 posterior no es observada ni confirmada por el backend.

### `GET /api/download/presign`

Query exacta:

- `uuid`: UUID del **message**, obligatorio para funcionar.
- `view`: solo el valor exacto `"true"` activa modo view; cualquier otro valor es download.

La consulta obtiene la key del mensaje y exige membership del canal. `200 {downloadUrl,fileName}`; URL GET firmada 300 segundos. En modo download se añade `Content-Disposition: attachment`; en modo view no.

`400 {error:"UUID is required"}` o `{error:"File not found"}` por excepciones del service, porque el router convierte un error sin status a 400; `403 Access denied`; `500` no es el fallback de este router para errores no tipados (los convierte también a 400). La inexistencia se lanza desde `getFileFromDatabase`, por lo que el `if (!file)` posterior es inalcanzable.

### `GET /api/thumbnails/presign`

Query `uuid`: UUID del message, obligatorio. Requiere que exista archivo, membership y que MIME sea PDF o Office. Soporta PDF y Word/Excel/PowerPoint MIME listados en `isOfficeType`.

- `200 {url}`; URL GET firmada normalmente 3600 segundos.
- `400 {error:"uuid required"}`.
- Por archivo ausente, el service lanza antes del `if (!file)`: respuesta efectiva `500 {error:"File not found"}`.
- `403 Access denied`.
- `404 Thumbnail not available for this file type` o `Could not generate thumbnail`.
- `500` descarga S3, `pdftoppm`, LibreOffice u otro error.

Genera thumbnail bajo `thumbnails/<original-key-without-extension>_thumb.png`, limita la fuente a 25 MiB, y deduplica generaciones concurrentes. Si acaba de generarse, emite `thumbnail:ready` al room del canal.

## 11. Link previews

### `GET /api/previews/resolve`

Query `url`, obligatorio. Requiere JWT.

Respuesta `200` plana:

`{url, canonicalUrl, provider, domain, title, description, image, favicon, type, videoId, embedUrl}`.

Los campos derivados pueden ser `null` (`description`, `image`, `type`, `videoId`, `embedUrl` según caso). El servicio devuelve metadata completa si puede obtenerla; para fallos de proveedor devuelve preview mínima, y para YouTube puede devolver fallback derivado con `videoId` y `embedUrl`.

Protecciones: solo HTTP/HTTPS, longitud máxima 2048, bloqueo de localhost/metadata hosts/sufijos privados, DNS privado, máximo 5 redirects, timeout de fetch 6 s y cuerpo HTML máximo 2 MiB. `400` para URL/protocolo/host bloqueado. Los fallos de fetch no bloqueados se degradan a `200` minimal preview. Un error capturado con status no expone el campo interno `code` (`BLOCKED`, `FETCH_FAILED`, `TIMEOUT`); la respuesta solo contiene `error`.

## 12. Presence / Status

No hay REST endpoint dedicado de presence.

Estados DB: `online`, `away`, `dnd`, `offline`. `PATCH /users/me` acepta solo los tres primeros. Socket `presence:set` también acepta solo `online`, `away`, `dnd`; `offline` se produce al disconnect.

Al conectar, el socket pone Redis `presence:<userUuid>` a TTL 35 s y actualiza `users.status='online', last_seen=NOW()`. `presence:heartbeat` renueva el TTL, sin respuesta. Al desconectar, borra la key, guarda `offline`, actualiza `last_seen` y emite el cambio.

El evento global es `{userUuid,username,status}`. `last_seen` solo aparece en DTOs de user, no en el evento presence ni en channel list. Hay una posible condición de carrera multi-tab: desconectar una conexión puede marcar offline aunque otra siga viva.

## 13. Socket.IO

### Connection

- Servidor: mismo host/puerto del HTTP server, por defecto `http://localhost:4000`.
- Namespace: raíz `/`.
- CORS: misma configuración `config.corsOrigin`, credentials true.
- Auth: `io({auth:{token}})`; el token es el access JWT. No se leen headers Authorization ni cookie en `authSocketMiddleware`.
- Middleware de conexión: falta token → `connect_error` con `Authentication required`; JWT inválido/expirado → `connect_error` con `Invalid or expired token`.
- Tras conectar, el socket entra en `user:<uuid>` y registra handlers. No entra automáticamente en ningún canal.
- Rooms de canal: `channel:<channelId>`.
- No hay acknowledgements definidos por el backend.

### Client → Server events

#### `channel:join`

Payload `{channelId}`. Verifica membership en DB. Si falla, solo emite al socket solicitante `error` con `{message:"Not a member of this channel"}`. Si funciona, hace `socket.join`; no responde.

#### `channel:leave`

Payload `{channelId}`. Ejecuta `socket.leave('channel:<channelId>')`; no verifica membership ni responde.

#### `message:send`

Payload destructurado:

| Campo | Default | Uso |
| --- | --- | --- |
| `channelId` | — | UUID de canal, requerido para funcionar |
| `content` | — | Texto; se trimmea al persistir |
| `type` | `'text'` | Tipo DB; si hay archivo se fuerza `'file'` |
| `parentId` | `null` | UUID de parent; se busca globalmente |
| `fileKey` | `null` | Key S3 |
| `fileName` | `null` | Nombre |
| `fileSize` | `null` | Se convierte a Number si truthy |
| `fileType` | `null` | MIME |

Si no hay texto no vacío ni `fileKey+fileName`, retorna silenciosamente. Verifica usuario/canal, membership y luego inserta `messages`. Un parent de otro canal no se rechaza. No valida MIME, tamaño ni que `fileKey` provenga de `/upload/presign`.

Errores al emisor: `{message:"Invalid channel"}`, `{message:"Not a member"}` o `{message:"Failed to send message"}` mediante event `error`. Éxito: broadcast a `channel:<channelId>` de:

```text
message:new -> { channelId, message: MessageSocket }
```

`MessageSocket` incluye `uuid, content, type, created_at, file_name, file_size, file_type, file_key, user_uuid, username, avatar_url, parent_uuid, reactions:[]`. Esta proyección no selecciona `edited_at`.

#### `typing:start` / `typing:stop`

Payload cliente `{channelId}`. El servidor retransmite solo a otros sockets del room:

```text
typing:start -> { channelId, username }
typing:stop  -> { channelId, username }
```

No valida que el emisor pertenezca al canal ni que esté en el room.

#### `presence:heartbeat`

Sin payload ni respuesta. Renueva TTL Redis 35 s.

#### `presence:set`

Payload `{status}`. Solo procesa `online`, `away`, `dnd`; valores restantes se ignoran sin error/ack. Broadcast posterior `presence:change` si la actualización se completa.

### Server → Client events

| Evento | Payload real | Cuándo |
| --- | --- | --- |
| `error` | `{message:string}` | Join/message socket error; distinto del error REST |
| `message:new` | `{channelId, message}` | Nuevo mensaje persistido por `message:send` |
| `message:updated` | `{channelId, message}` | PATCH de mensaje |
| `message:deleted` | `{channelId, messageId}` | DELETE soft de mensaje |
| `message:reaction` | `{channelId,messageId,reactions}` | Add/delete reacción |
| `typing:start` | `{channelId,username}` | Indicador de otro usuario |
| `typing:stop` | `{channelId,username}` | Fin de indicador |
| `presence:change` | `{userUuid,username,status}` | Connect, set o disconnect |
| `thumbnail:ready` | `{messageUuid,url}` | Thumbnail recién generado |

Los eventos `connect`, `disconnect` y `connect_error` son lifecycle de Socket.IO, no payloads definidos por un handler de dominio. `message:updated`, `message:deleted` y `message:reaction` se emiten desde los handlers REST a los sockets conectados en el room.

## 14. Data Models y DB → API

### User

DB: `id`, `uuid`, `username`, `email`, `password_hash`, `skylab_id`, `avatar_url`, `status`, `last_seen`, `created_at`.

API: mantiene `avatar_url`, `last_seen`, `created_at`, `status` en snake_case; no hay serializer a camelCase. La exposición depende del endpoint: auth register/login/exchange, me, profile y search no comparten exactamente las mismas propiedades, descritas arriba.

### Channel

DB: `id`, `uuid`, `name`, `description`, `type`, `is_private`, `created_by`, `created_at`.

API: mantiene `is_private`, `created_at`, y añade aliases SQL `dm_user_uuid`, `dm_avatar_url`, `dm_status`, `unread_count`. `created_by` no se expone. `type` es la fuente de verdad para normal/direct/private/group.

### ChannelMember

DB: `channel_id`, `user_id`, `role`, `joined_at`, `last_read_at`.

API solo expone `{uuid,username,avatar_url,status,role}` dentro de GET detail. `joined_at` y `last_read_at` no se exponen.

### Message

DB: `id`, `uuid`, `channel_id`, `user_id`, `content`, `type`, `parent_id`, `edited_at`, `deleted_at`, `created_at`, `file_name`, `file_size`, `file_type`, `file_key`.

API sustituye relaciones numéricas por `user_uuid`, `username`, `avatar_url`, `parent_uuid`; mantiene el resto de nombres snake_case. `channel_id`, `channel_uuid`, `deleted_at` y `updated_at` no están en la proyección.

### Reaction

DB: `(message_id,user_id,emoji,created_at)` con PK compuesta. API agrupa por emoji y devuelve `{emoji,count,userUuids}`.

### Attachment

DB tiene `attachments(id,message_id,s3_key,filename,mimetype,size_bytes)`, pero este modelo no participa en ningún endpoint actual. El frontend debe tratar como attachment los campos `file_*` de Message.

## 15. Naming Conventions y normalización

No existe normalización global snake_case ↔ camelCase. La transformación es manual y parcial:

| Capa/propósito | Nombre real |
| --- | --- |
| Request channel | `isPrivate`, `memberUuids`, `type` |
| Response channel/DB | `is_private`, `dm_user_uuid`, `dm_avatar_url`, `dm_status`, `unread_count`, `created_at` |
| Request user/avatar | `userUuid`, `avatarUrl`, `fileName`, `fileType`, `fileSize` |
| Response auth/media | `accessToken`, `uploadUrl`, `fileKey`, `avatarKey`, `avatarUrl`, `downloadUrl`, `hasMore` |
| Request/socket message | `channelId`, `parentId`, `fileKey`, `fileName`, `fileSize`, `fileType` |
| Response message | `user_uuid`, `created_at`, `edited_at`, `file_key`, `file_name`, `file_size`, `file_type`, `avatar_url`, `parent_uuid` |
| Socket envelopes | `channelId`, `messageId`, `messageUuid`, `userUuid`, `username`, `url` |
| Reaction | camelCase `userUuids` dentro de un DTO Message snake_case |

Búsqueda explícita de pares solicitados:

- `is_direct_message`: no aparece en `back/src`.
- `isDirectMessage`: no aparece en `back/src`.
- `memberUuids`: solo request de `createChannel`; no response.
- `memberUuid`: no existe; el campo de add member es `userUuid`.
- `member_uuids`: no aparece en backend.
- `userUuid`: request de add member y variable/payload socket/presence; respuesta de presence.
- `user_uuid`: DB alias y Message response.
- `channelUuid`: no es campo de response; se usa `channelId` en envelopes y `channel_uuid` internamente/thumbnail lookup.
- `channel_uuid`: alias SQL interno y variable para broadcasts REST; no se incluye en Message DTO.
- `created_at`: se expone raw en User/Channel/Message; no `createdAt`.
- `createdAt`: no aparece en backend.
- `updated_at`/`updatedAt`: no aparecen; edición usa `edited_at`.

## 16. Date/Time y tipos de persistencia

- MySQL usa `DATETIME` sin timezone en `created_at`, `edited_at`, `deleted_at`, `last_seen`, `joined_at`, `last_read_at`.
- El pool configura `timezone: 'Z'`; mysql2 entrega valores que JSON serializa normalmente como ISO UTC, pero no existe conversión explícita ni contrato de string manual en backend.
- `GET /api/health` (`ts`) es Unix epoch en milisegundos mediante `Date.now()`.
- No se usan Unix seconds, `createdAt`, timezone local ni offsets escritos por el handler.
- `count` de reactions se fuerza a Number. Otros counts/flags de MySQL (`unread_count`, `is_private`) no se normalizan explícitamente; el consumidor debe tolerar la representación de mysql2 y el `0/1` de las respuestas construidas.

## 17. Pagination

Solo hay paginación en `GET /api/channels/:channelId/messages`:

- cursor: UUID de mensaje en `before`;
- orden físico: `id DESC`, respuesta invertida a ascendente;
- default: 50;
- cap: 100;
- response: `hasMore` booleano;
- no `page`, `offset`, `cursor` de salida, `nextCursor` ni `total`.

## 18. Documentation Drift

La documentación migrada contiene contratos que no son ejecutables contra este backend:

- `BACKEND_PROMPT.md` del módulo Skylab y `MIGRATION_PROMPT.md` describen `is_direct_message`; el backend actual ignora esa propiedad y, al omitir `type`, cae en `type='channel'`, que exige `name` y produce `400`.
- Describen `GET /api/channels/:channelId/members`; no existe. Los miembros están dentro de `GET /api/channels/:channelId`.
- Describen `POST /api/channels/:channelId/messages`; no existe.
- Describen `message.channel_id`, `sender`, `file_url`, `deleted_at` y reactions con `users`; ninguno forma parte del DTO actual.
- Describen upload `{contentType}` y respuesta `{key}`; el backend exige `fileName,fileType,fileSize,channelId` y devuelve `fileKey`.
- Describen download query `messageUuid` y respuesta `{url}`; el backend exige query `uuid` y devuelve `{downloadUrl,fileName}`.
- Describen avatar `{contentType}`/`key` y `avatar_url`; el backend exige metadatos completos, devuelve `avatarKey` y actualiza con `avatarUrl`.
- Describen búsqueda por email y perfil `/:uuid/profile`; el backend busca solo username y usa `GET /:userId`.
- Describen typing con `{user}`/`{userId}`, presence con `userId` y thumbnail con `thumbnailUrl`; los nombres reales son `username`, `userUuid` y `url`.

## 19. Known Backend Contract Inconsistencies

### ⚠️ `type` frente a `is_direct_message` / `isDirectMessage`

El contrato ejecutable de `createChannel` destructura `type` e `isPrivate` (`back/src/services/channelService.js:103-111`). La detección de DM requiere `type === 'direct'` (`:117-127`). No hay ninguna lectura de `is_direct_message` o `isDirectMessage` en `back/src`. Es una incompatibilidad documental/frontend, no una variante soportada por backend.

### ⚠️ `group` se crea pero no se lee como DM

La creación trata `group` como direct (`:105`), pero list/detail solo hacen el enriquecimiento DM cuando `c.type='direct'` (`:20-44`, `:131-149`). Un group puede retornar nombre/avatar del DM nulos.

### ⚠️ Formas distintas de Channel según endpoint

Create devuelve `description`, `dm_*` y `is_private`; list añade `dm_status` y `unread_count`; detail añade `members` pero omite `description`; ninguno ofrece un DTO estable común.

### ⚠️ snake_case en DTOs y camelCase en envelopes

Messages/User/Channel conservan nombres DB (`created_at`, `user_uuid`, `file_key`, `is_private`), mientras auth/media/socket usan camelCase (`accessToken`, `downloadUrl`, `channelId`, `userUuid`). No hay serializer que garantice consistencia.

### ⚠️ Socket typing/presence/thumbnail no coincide con consumidores migrados

El backend emite typing `{channelId,username}`, presence `{userUuid,...}` y thumbnail `{messageUuid,url}`. El módulo Skylab actual busca respectivamente `user`, `userId` y `thumbnailUrl`, y para thumbnail además espera `channel_id`, que el backend no emite.

### ⚠️ Seguridad incompleta en acciones de mensajes

Reactions no comprueban membership; typing no comprueba membership; `message:send` no valida parent en el mismo canal ni vincula `fileKey` a un presign; exchange-token no valida `skylabToken`.

### ⚠️ Semántica de errores no uniforme

REST usa `{error}`, mientras el módulo migrado intenta leer `{message}`. Download convierte errores no tipados a 400; thumbnails convierte archivo ausente a 500; Socket.IO usa `{message}`. No hay un envelope común.

### ⚠️ Sin endpoint de eliminación administrativa de miembros

La documentación anuncia `DELETE /api/channels/:uuid/members/:userUuid`, pero solo existe `DELETE /api/channels/:channelId/members/me`.

### ⚠️ Paginación tolera cursores ajenos al canal

`before` se resuelve por UUID global y luego solo se aplica `m.id < cursor.id`; no comprueba que el cursor pertenezca al `channelId` solicitado.

### ⚠️ Tablas/fields no contractuales

`attachments`, `created_by`, `joined_at`, `last_read_at`, `deleted_at` y varias columnas DB existen, pero no forman DTO salvo que `last_read_at` afecte internamente a `unread_count`.

## 20. FRONTEND INTEGRATION CONTRACT

Resumen operativo para el agente que adapte el módulo Skylab. Esto identifica los contratos que debe consumir; no implementa cambios frontend.

### Authentication

1. Llamar `POST /api/auth/exchange-token` con `{skylabId,email,username,skylabToken}`.
2. Usar el `accessToken` retornado como `Authorization: Bearer ...` para REST.
3. Usar el mismo access token en `io(BASE_URL, {auth:{token}})` para Socket.IO.
4. El refresh usa cookie HttpOnly `refresh_token` y `POST /api/auth/refresh`; el browser debe enviar credentials.
5. El JWT de PinGGo contiene `sub` como user UUID.

### Users

- Perfil persistido: `GET /api/users/:userId` → `{user:{uuid,username,avatar_url,status,last_seen}}`.
- Search: `GET /api/users/search?q=xx` (mínimo 2 caracteres) → `{users:[{uuid,username,avatar_url,status}]}`.
- Update: `PATCH /api/users/me` con `username`, `avatarUrl` o `status`.
- Avatar: presign con `fileName,fileType,fileSize`; respuesta `avatarKey`; después PATCH con `avatarUrl: avatarKey`.

### Channels

- Listar: `GET /api/channels` → `{channels}`.
- Crear público: `POST /api/channels` con `{name,description,isPrivate:false,memberUuids}`; `isPrivate:true` crea `type='private'` aunque no se envíe `type`.
- Crear DM: `POST /api/channels` con `{type:'direct',memberUuids:[otherUserUuid]}`. No usar `is_direct_message` ni `isDirectMessage`.
- Clasificar DM por `channel.type === 'direct'`; no por flag ausente.
- Miembros: `GET /api/channels/:channelId` y leer `data.channel.members`.
- Unirse al room tras seleccionar canal: `channel:join` `{channelId}`.
- Marcar leído: `POST /api/channels/:channelId/read`.

### Messages

- Cargar: `GET /api/channels/:channelId/messages?limit=50&before=<oldestUuid>`.
- Leer campos snake_case: `user_uuid`, `created_at`, `edited_at`, `file_key`, `file_name`, `file_size`, `file_type`, `avatar_url`, `parent_uuid`.
- Reacciones: `reactions[].emoji`, `reactions[].count`, `reactions[].userUuids`.
- Crear: Socket `message:send`, no POST REST. Payload usa camelCase en `channelId`, `parentId`, `fileKey`, `fileName`, `fileSize`, `fileType`.
- Editar/borrar: PATCH/DELETE `/api/messages/:messageId`.
- Eventos actualizados entregan `{channelId,message}`; delete entrega `{channelId,messageId}`.

### Attachments

1. `POST /api/upload/presign` con `fileName,fileType,fileSize,channelId`.
2. PUT directo a `uploadUrl` con el mismo `Content-Type`.
3. Enviar por Socket `message:send` los campos `fileKey,fileName,fileSize,fileType`.
4. Descargar con `GET /api/download/presign?uuid=<messageUuid>` y usar `downloadUrl`.
5. Vista inline: añadir `&view=true`.
6. Thumbnails PDF/Office: `GET /api/thumbnails/presign?uuid=<messageUuid>` y leer `url`.

### Reactions

POST `{emoji}` para añadir y DELETE `/reactions/:emoji` para retirar. El backend retorna/reemite el array completo; no aplicar un delta recibido.

### Presence

Escuchar `presence:change` y usar `userUuid` como clave. Payload real `{userUuid,username,status}`. Heartbeat recomendado antes de 35 s (el servidor usa TTL 35 s). `presence:set` solo acepta `online`, `away`, `dnd`.

### Socket events

Consumir exactamente:

```text
message:new      { channelId, message }
message:updated  { channelId, message }
message:deleted  { channelId, messageId }
message:reaction { channelId, messageId, reactions }
typing:start     { channelId, username }
typing:stop      { channelId, username }
presence:change  { userUuid, username, status }
thumbnail:ready  { messageUuid, url }
```

### Error format

REST: `{error:string}`. Socket domain error: `{message:string}`. El módulo migrado que solo lee `error.message` perderá el mensaje real de REST si no normaliza ambos nombres.

## 21. Evidence Map

| Área | Evidencia ejecutable |
| --- | --- |
| Mount/base/rate limit | `back/src/index.js:19-30`, `back/src/api/index.js:13-22` |
| Auth | `back/src/middleware/auth.js:4-19`, `back/src/services/authService.js:1-183` |
| Channels | `back/src/api/channels/router.js:1-25`, `back/src/services/channelService.js:4-275` |
| Messages/reactions | `back/src/api/messages/router.js:1-14`, `back/src/services/messageService.js:1-230` |
| Users | `back/src/api/users/router.js:1-16`, `back/src/services/userService.js:1-71` |
| Upload/download/avatar | `back/src/api/{upload,download,thumbnails}/router.js`, `back/src/services/{upload,download,avatar,thumbnail}Service.js` |
| Link preview | `back/src/api/previews/router.js:1-19`, `back/src/services/linkPreviewService.js:1-451` |
| Socket auth/lifecycle | `back/src/socket/index.js:1-36`, `back/src/socket/middleware/authSocket.js:1-14` |
| Socket messages/presence | `back/src/socket/handlers/messageHandlers.js:1-112`, `presenceHandlers.js:1-39` |
| DB types/columns | `back/src/db/schema.sql:7-95` |
| Frontend drift | `skylab/src/modules/pinggo/stores/channels.js`, `stores/messages.js`, `stores/presence.js`, `components/ChannelMembersModal.svelte`, `components/ChannelView.svelte`, `api/index.js` |
