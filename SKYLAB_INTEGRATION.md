# Integración Skylab - Token Exchange

## Resumen de Cambios

Se ha implementado el endpoint de intercambio de tokens para permitir que usuarios autenticados en Skylab accedan al sistema de mensajería PinGGo sin necesidad de login adicional.

## Archivos Modificados

### 1. `back/src/api/auth/router.js`
- ✅ Añadida ruta `POST /api/auth/exchange-token`

### 2. `back/src/services/authService.js`
- ✅ Importado `v5 as uuidv5` de uuid
- ✅ Implementada función `exchangeToken()`
  - Recibe `skylabId`, `email`, `username`, `skylabToken`
  - Calcula UUID v5 determinista desde el email (mismo algoritmo que el frontend)
  - Busca o crea usuario en la base de datos
  - Genera `accessToken` y `refreshToken` de PinGGo
  - Actualiza username si ha cambiado en Skylab
  - Retorna `accessToken` y datos del usuario

### 3. `back/src/db/schema.sql`
- ✅ Añadida columna `skylab_id INT UNSIGNED` a tabla `users`
- ✅ Añadido índice `idx_skylab_id`
- ✅ Modificado `password_hash` para permitir valor por defecto vacío

### 4. `back/src/db/migrations/001_add_skylab_integration.sql` (NUEVO)
- ✅ Migración para bases de datos existentes
- ✅ Añade columna `skylab_id` si no existe
- ✅ Modifica `password_hash` para soportar valor vacío

## Flujo de Autenticación

```
1. Usuario se autentica en Skylab
   ↓
2. Skylab genera token JWT
   ↓
3. Frontend llama POST /api/auth/exchange-token
   Body: {
     skylabId: 69,
     email: "user@example.com",
     username: "Usuario",
     skylabToken: "skylab_jwt_token"
   }
   ↓
4. Backend PinGGo:
   - Calcula UUID v5 desde email
   - Busca usuario por UUID
   - Crea usuario si no existe
   - Genera tokens PinGGo
   ↓
5. Retorna:
   {
     accessToken: "pinggo_jwt_token",
     user: { uuid, username, email, ... }
   }
   ↓
6. Frontend usa accessToken de PinGGo para todas las peticiones
```

## Instalación

### Para nuevas instalaciones

El schema actualizado ya incluye la columna `skylab_id`:

```bash
docker-compose up -d db
# El schema.sql se ejecuta automáticamente
```

### Para bases de datos existentes

Ejecutar la migración:

```bash
# Opción 1: Directamente con mysql
mysql -u root -p pinggo < back/src/db/migrations/001_add_skylab_integration.sql

# Opción 2: Con Docker
docker cp back/src/db/migrations/001_add_skylab_integration.sql pinggo-db:/tmp/
docker-compose exec db mysql -u root -p pinggo < /tmp/001_add_skylab_integration.sql
```

## Testing

### 1. Test manual con cURL

```bash
curl -X POST http://localhost:4000/api/auth/exchange-token \
  -H "Content-Type: application/json" \
  -d '{
    "skylabId": 69,
    "email": "test@example.com",
    "username": "TestUser",
    "skylabToken": "dummy_token"
  }'
```

**Respuesta esperada:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "username": "TestUser",
    "email": "test@example.com",
    "avatar_url": null
  }
}
```

### 2. Verificar creación de usuario

```sql
SELECT uuid, username, email, skylab_id, password_hash 
FROM users 
WHERE email = 'test@example.com';
```

Debe mostrar:
- `uuid`: UUID v5 generado
- `skylab_id`: 69
- `password_hash`: vacío ('')

### 3. Verificar que el token funciona

```bash
# Usar el accessToken recibido
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

## Seguridad

### UUID Determinista
- Se usa UUID v5 con namespace fijo: `6ba7b810-9dad-11d1-80b4-00c04fd430c8`
- El UUID se genera desde el email del usuario
- **Mismo email = mismo UUID** (consistencia entre Skylab y PinGGo)

### Password Hash Vacío
- Usuarios de Skylab no tienen `password_hash`
- No pueden hacer login directo en PinGGo (endpoints `/login` bloqueados para ellos)
- Solo autenticación vía token exchange

### Token de Skylab
- Actualmente el endpoint **no valida** el `skylabToken`
- ⚠️ **TODO:** Implementar validación del token de Skylab si se requiere seguridad adicional
- Opciones:
  - Validar firma JWT del token de Skylab
  - Llamar a endpoint de Skylab para verificar token
  - Validar claim específico en el token

## Compatibilidad

### Con sistema de auth existente
- ✅ No afecta login/register/logout existentes
- ✅ Usuarios nativos de PinGGo siguen funcionando igual
- ✅ Usa las mismas funciones `signTokens()` y `setRefreshCookie()`
- ✅ Token generado es compatible con middleware `authenticate()`
- ✅ Socket.IO funciona sin cambios

### Con frontend de Skylab
- ✅ El namespace UUID coincide con `userAdapter.js` del frontend
- ✅ El payload del JWT es el esperado: `{ sub: uuid, username }`
- ✅ El accessToken se puede usar directamente en todas las peticiones

## Posibles Mejoras Futuras

1. **Validación del token de Skylab**
   ```javascript
   // Opción A: Validar JWT
   const skylabPayload = jwt.verify(skylabToken, SKYLAB_JWT_SECRET);
   
   // Opción B: Llamar a Skylab
   const response = await fetch('https://skylab.com/api/verify-token', {
     headers: { 'Authorization': `Bearer ${skylabToken}` }
   });
   ```

2. **Sincronización de avatar**
   - Actualizar `avatar_url` si ha cambiado en Skylab
   - Copiar avatar de Skylab a S3 de PinGGo

3. **Logging de intercambios**
   - Registrar cada exchange para auditoría
   - Detectar intentos de intercambio fallidos

4. **Rate limiting**
   - Limitar intentos de exchange por IP
   - Prevenir abuso del endpoint

## Troubleshooting

### Error: "Column 'skylab_id' doesn't exist"
**Causa:** La migración no se ha ejecutado  
**Solución:** Ejecutar `001_add_skylab_integration.sql`

### Error: "Field 'password_hash' doesn't have a default value"
**Causa:** La columna `password_hash` no acepta valores vacíos  
**Solución:** Ejecutar la migración que modifica `password_hash`

### Usuario creado pero no puede acceder
**Causa:** Token no válido o expirado  
**Solución:** 
- Verificar que el token no haya expirado (`exp` claim)
- Verificar que el `sub` en el token coincide con el UUID del usuario
- Verificar `JWT_ACCESS_SECRET` en `.env`

### UUID diferente entre frontend y backend
**Causa:** Namespace o email diferentes  
**Solución:**
- Verificar que el namespace es `6ba7b810-9dad-11d1-80b4-00c04fd430c8` en ambos lados
- Verificar que se usa el mismo email
- Usar `uuidv5(email, namespace)` en ambos lados

## Contacto

Para dudas o issues relacionados con la integración Skylab-PinGGo, documentar en:
- Issues del repositorio
- Canal #dev en PinGGo

---

_Implementado: 2026-08-20_  
_Versión: 1.0_
