#!/bin/bash
# Restaura un dump de PinGGo en una base de datos.
#   pinggo-restore.sh <fichero.sql.gz> <bd_destino>
# Ejemplos:
#   pinggo-restore.sh /var/backups/pinggo/pinggo-20260930T013000Z.sql.gz pinggo_copia   # para consultar
#   pm2 stop pinggo-back
#   FORCE=1 pinggo-restore.sh <fichero> pinggo                                          # SOBRESCRIBE producción
#   pm2 start pinggo-back
set -euo pipefail

FILE=${1:?Uso: pinggo-restore.sh <fichero.sql.gz> <bd_destino>}
TARGET=${2:?Uso: pinggo-restore.sh <fichero.sql.gz> <bd_destino>}

[[ "$TARGET" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nombre de BD no válido: $TARGET" >&2; exit 1; }
[ -f "$FILE" ] || { echo "No existe $FILE" >&2; exit 1; }

if [ -f "$FILE.sha256" ]; then
  (cd "$(dirname "$FILE")" && sha256sum -c --quiet "$(basename "$FILE").sha256") \
    || { echo "ERROR: el checksum no coincide, fichero dañado" >&2; exit 1; }
fi
gzip -t "$FILE"

if [ "$TARGET" = "pinggo" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "Vas a SOBRESCRIBIR la BD de producción 'pinggo'." >&2
  echo "Para el back (pm2 stop pinggo-back) y repite con FORCE=1." >&2
  exit 1
fi

mysql -e "CREATE DATABASE IF NOT EXISTS \`$TARGET\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gunzip -c "$FILE" | mysql --default-character-set=utf8mb4 "$TARGET"
echo "OK: $(basename "$FILE") restaurado en '$TARGET'"
