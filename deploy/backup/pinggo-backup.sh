#!/bin/bash
# Dump diario de la BD de PinGGo: copia local (KEEP_DAYS días) + copia a S3 (bucket aparte,
# el servidor solo puede subir). Configuración: /etc/pinggo-backup.conf
set -euo pipefail
umask 077

CONF=${PINGGO_BACKUP_CONF:-/etc/pinggo-backup.conf}
[ -f "$CONF" ] && . "$CONF"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pinggo}
KEEP_DAYS=${KEEP_DAYS:-7}
DB=${DB:-pinggo}
S3_URI=${S3_URI:-}
export AWS_PROFILE=${AWS_PROFILE:-pinggo-backup}

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="$DB-$TS.sql.gz"
FILE="$BACKUP_DIR/$NAME"
trap 'rm -f "$FILE.part"' EXIT

# --single-transaction: copia coherente sin bloquear tablas (InnoDB)
mysqldump --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 --no-tablespaces "$DB" | gzip -9 > "$FILE.part"

# Comprobaciones: gzip íntegro y dump terminado (mysqldump escribe "Dump completed" al final)
gzip -t "$FILE.part"
zcat "$FILE.part" | tail -n 1 | grep -q "Dump completed" || { echo "ERROR: dump incompleto" >&2; exit 1; }
mv "$FILE.part" "$FILE"
(cd "$BACKUP_DIR" && sha256sum "$NAME" > "$NAME.sha256")

if [ -n "$S3_URI" ]; then
  aws s3 cp "$FILE" "$S3_URI/$NAME" --only-show-errors
  aws s3 cp "$FILE.sha256" "$S3_URI/$NAME.sha256" --only-show-errors
  DEST="local + $S3_URI"
else
  echo "AVISO: S3_URI vacío en $CONF — copia solo local" >&2
  DEST="solo local"
fi

# Retención local (en S3 la retención la hace la lifecycle rule del bucket)
find "$BACKUP_DIR" -maxdepth 1 -name "$DB-*.sql.gz*" -mtime +"$KEEP_DAYS" -delete

echo "OK $NAME ($(du -h "$FILE" | cut -f1), $DEST)"
