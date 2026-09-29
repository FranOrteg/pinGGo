#!/bin/bash
# Prueba semanal: restaura el último dump en una BD temporal, comprueba que tiene las mismas
# tablas que producción, muestra el número de filas y la borra. Si falla, el backup no sirve.
set -euo pipefail

CONF=${PINGGO_BACKUP_CONF:-/etc/pinggo-backup.conf}
[ -f "$CONF" ] && . "$CONF"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pinggo}
DB=${DB:-pinggo}
CHECK_DB="${DB}_restore_check"
HERE=$(dirname "$(readlink -f "$0")")

LATEST=$(ls -1t "$BACKUP_DIR"/"$DB"-*.sql.gz 2>/dev/null | head -n 1 || true)
[ -n "$LATEST" ] || { echo "ERROR: no hay dumps en $BACKUP_DIR" >&2; exit 1; }

trap 'mysql -e "DROP DATABASE IF EXISTS \`$CHECK_DB\`"' EXIT
mysql -e "DROP DATABASE IF EXISTS \`$CHECK_DB\`"
"$HERE/pinggo-restore.sh" "$LATEST" "$CHECK_DB" >/dev/null

tables() { mysql -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$1' ORDER BY table_name"; }
if ! diff <(tables "$DB") <(tables "$CHECK_DB") >/dev/null; then
  echo "ERROR: el dump no tiene las mismas tablas que '$DB'" >&2
  diff <(tables "$DB") <(tables "$CHECK_DB") >&2 || true
  exit 1
fi

echo "Dump: $(basename "$LATEST")"
printf "%-18s %10s %10s\n" "tabla" "en dump" "ahora"
for t in $(tables "$DB"); do
  printf "%-18s %10s %10s\n" "$t" \
    "$(mysql -N -e "SELECT COUNT(*) FROM \`$CHECK_DB\`.\`$t\`")" \
    "$(mysql -N -e "SELECT COUNT(*) FROM \`$DB\`.\`$t\`")"
done
echo "OK: el último dump se restaura correctamente"
