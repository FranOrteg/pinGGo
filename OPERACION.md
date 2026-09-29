# Guía de operación — PinGGo en producción

## 1. Mapa: qué hay y dónde

```
 Navegador (front de Skylab, Svelte)
   │
   ├──► https://skylab.labit.es ──────────► SRV1-PROD (Lightsail Frankfurt, 18.184.153.223, Debian 9)
   │      login, datos de Skylab             Apache + PHP de Labit (rest/*.php) + MariaDB de Labit
   │                                          └─ rest/WhoAmI.php  ← único fichero añadido para PinGGo
   │
   └──► https://pinggo-api.labit.es ──────► pinggo-prod (Lightsail Frankfurt, 3.69.56.232, Ubuntu 24.04)
          mensajería (REST + WebSocket)      Nginx (HTTPS) → Node/Express (pm2, puerto 4000)
                                             MySQL 8 (BD `pinggo`) · Redis · LibreOffice/poppler
                                                   │
                                                   └──► S3 `pinggo-files` (us-east-1): ficheros y avatares
```

Son **dos servidores independientes** con **dos bases de datos distintas**:
- **Labit/Skylab (SRV1-PROD)**: usuarios reales, proyectos, etc. PinGGo **no** escribe ahí; solo pregunta "¿de quién es este token?".
- **PinGGo (pinggo-prod)**: usuarios de mensajería, canales, mensajes, reacciones.

## 2. Qué pasa cuando alguien abre PinGGo en Skylab

1. El usuario ya hizo login en Skylab (`rest/Login.php`) y tiene su **token de Labit** (columna `people.token`).
2. El módulo PinGGo llama a `POST https://pinggo-api.labit.es/api/auth/exchange-token` con su `contact_id`, email, nombre y ese token.
3. El back de PinGGo pregunta a Labit, servidor a servidor: `POST https://skylab.labit.es/rest/WhoAmI.php {token}` → Labit responde `{"contact_id": 599}`.
4. Si coincide con el `contact_id` que mandó el front, PinGGo crea/actualiza el usuario en **su** BD y devuelve un **token de PinGGo** (JWT, 8 h).
5. A partir de ahí el front habla solo con PinGGo: REST con `Authorization: Bearer …` y WebSocket (Socket.IO). Si el token caduca, `/api/auth/refresh` lo renueva (hasta 7 días caducado, máx. 30 días de sesión).

### Por qué hubo que tocar el PHP
El token de Labit es un valor opaco guardado en la BD de Labit. Ningún endpoint de Labit decía "este token es del contacto X" (los que existían solo decían sí/no, lo que permitiría a cualquiera con un token válido hacerse pasar por otro). `WhoAmI.php` hace solo eso: recibe un token y devuelve su `contact_id`. Solo responde a la IP de pinggo-prod (y a localhost); a cualquier otra le da 403. No se ha modificado ningún otro fichero de Labit. Copia en el repo: `pinGGo/deploy/labit/WhoAmI.php`.

## 3. Cómo entrar en cada servidor

| Servidor | Cómo | Usuario |
|---|---|---|
| **pinggo-prod** | `ssh -i ~/Escritorio/Certificados/LightsailDefaultKey-eu-central-1.pem ubuntu@3.69.56.232` | `ubuntu` |
| **SRV1-PROD** | `ssh admin@18.184.153.223 -i ~/Escritorio/Certificados/LightsailDefaultKey-eu-central-1.pem` | `admin` |

## 4. Bases de datos

### 4.1 BD de PinGGo (en pinggo-prod)

Dentro del servidor, como administrador (no pide contraseña):
```bash
sudo mysql pinggo
```
Consultas útiles:
```sql
SHOW TABLES;                                                   -- users, channels, channel_members, messages, attachments, reactions
SELECT id, uuid, username, email, skylab_id, created_at FROM users ORDER BY id DESC LIMIT 20;
SELECT c.name, c.type, COUNT(m.id) AS mensajes FROM channels c LEFT JOIN messages m ON m.channel_id = c.id GROUP BY c.id;
SELECT m.created_at, u.username, LEFT(m.content, 80) FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 20;
```
Salir: `exit`.

Como usuario de la aplicación (el que usa el back): `mysql -u pinggo -p pinggo`. La contraseña está en `sudo cat /root/pinggo-secrets.env` (`DB_PASSWORD`).

**Desde tu PC con un programa gráfico** (DBeaver, MySQL Workbench…): el puerto 3306 **no** está abierto a internet (a propósito). Abre un túnel SSH y déjalo abierto:
```bash
ssh -i ~/Escritorio/Certificados/LightsailDefaultKey-eu-central-1.pem -N -L 3307:127.0.0.1:3306 ubuntu@3.69.56.232
```
y en el programa conecta a `127.0.0.1`, puerto `3307`, usuario `pinggo`, BD `pinggo`, contraseña `DB_PASSWORD`. (DBeaver y Workbench también tienen la opción "SSH tunnel" integrada con los mismos datos.)

Copia de seguridad manual:
```bash
sudo mysqldump --single-transaction pinggo | gzip > ~/pinggo-$(date +%F).sql.gz
```
(Además, Lightsail hace un snapshot completo del servidor cada día a las 02:00 UTC.)

### 4.2 BD de Labit (en SRV1-PROD) — producción de Skylab, solo lectura
Entra por la consola web y:
```bash
sudo mysql            # si pide contraseña o falla, las credenciales están en rest/utils/ConexionDB.php
```
Para ver con qué credenciales se conecta el PHP: `sudo cat <carpeta de rest>/utils/ConexionDB.php`. Ejemplo de consulta: `SELECT contact_id, Name, Active FROM people WHERE contact_id = 599;`. **No modifiques nada ahí** sin coordinarlo: es la BD de Skylab.

### 4.3 Redis (pinggo-prod)
Solo guarda presencia/eventos en tiempo real; no hace falta tocarlo. Si quieres verlo:
```bash
sudo bash -c '. /root/pinggo-secrets.env; redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'
```

## 5. Operaciones habituales (en pinggo-prod)

| Qué | Comando |
|---|---|
| Estado del back | `pm2 status` |
| Ver logs en vivo | `pm2 logs pinggo-back` (Ctrl+C para salir) |
| Solo errores/avisos | `tail -50 ~/.pm2/logs/pinggo-back-error-0.log` |
| Reiniciar | `pm2 reload pinggo-back` |
| **Desplegar una versión nueva** | `cd /opt/pinggo && git pull && cd back && npm ci --omit=dev && pm2 reload pinggo-back` |
| Aplicar una migración de BD | `sudo mysql pinggo < /opt/pinggo/back/src/db/migrations/<fichero>.sql` |
| Cambiar configuración | `nano /opt/pinggo/back/.env` y luego `pm2 reload pinggo-back` |
| Estado de servicios | `systemctl is-active nginx mysql redis-server` |
| Comprobar la API | `curl -s https://pinggo-api.labit.es/api/health` |

Flujo de trabajo normal: cambias código en tu PC → `cd back && npm test` → commit + push → en el servidor, la línea de "desplegar".

## 6. Dónde están los secretos

| Secreto | Dónde |
|---|---|
| Contraseñas de BD y Redis, secretos JWT | `/root/pinggo-secrets.env` (pinggo-prod) — y copiados en `/opt/pinggo/back/.env` |
| Configuración del back (URL de Labit, CORS, S3…) | `/opt/pinggo/back/.env` (permisos 600) |
| Clave de AWS para S3 | usuario IAM `pinggo-prod` (solo acceso al bucket `pinggo-files`), en `back/.env` |
| Clave SSH de los servidores | `~/Escritorio/Certificados/LightsailDefaultKey-eu-central-1.pem` (tu PC) |

Nunca subas `.env` al repo (ya está en `.gitignore`) ni pegues tokens en chats.

## 7. Si algo falla

| Síntoma | Dónde mirar |
|---|---|
| PinGGo no entra: "Invalid Skylab token" | `grep -E "labit|auth" ~/.pm2/logs/pinggo-back-*.log \| tail` |
| "Skylab authentication service unavailable" (502) | Labit caído o `WhoAmI.php` no accesible: desde pinggo-prod `curl -s -X POST https://skylab.labit.es/rest/WhoAmI.php -d '{"token":"x"}'` → debe dar `{"error":"Invalid token"}` |
| La API no responde | `pm2 status`, `pm2 logs`, `systemctl status nginx` |
| Web caída tras reiniciar el servidor | `pm2 status` (debería arrancar solo con el servicio `pm2-ubuntu`) |

## 8. Pendientes conocidos
1. Actualizar `multer` 1.x → 2.x (vulnerabilidades en subidas).
2. Probar a fondo: WebSocket, subida/descarga de ficheros, miniaturas.
3. Decidir si borrar el snapshot `SRV1-PROD-pre-pinggo-2026-09-24`.
4. Seguridad de Labit (fuera de PinGGo, prioritario): `GetPassword.php` devuelve contraseñas en claro a cualquiera con token; contraseñas cifradas con clave fija en código; tokens que no caducan; SRV1 en Debian 9 sin soporte.
