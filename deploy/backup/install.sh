#!/bin/bash
# Instala las copias de seguridad de PinGGo en el servidor. Ejecutar con sudo desde esta carpeta.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
[ "$(id -u)" = 0 ] || { echo "Ejecuta con sudo" >&2; exit 1; }

install -m 700 -t /usr/local/sbin pinggo-backup.sh pinggo-restore.sh pinggo-backup-verify.sh
install -m 644 -t /etc/systemd/system pinggo-backup.service pinggo-backup.timer \
  pinggo-backup-verify.service pinggo-backup-verify.timer
[ -f /etc/pinggo-backup.conf ] || install -m 600 pinggo-backup.conf.example /etc/pinggo-backup.conf
install -d -m 700 /var/backups/pinggo

command -v aws >/dev/null || [ -x /snap/bin/aws ] || snap install aws-cli --classic

systemctl daemon-reload
systemctl enable --now pinggo-backup.timer pinggo-backup-verify.timer
systemctl list-timers 'pinggo-*' --no-pager
echo "Instalado. Falta configurar la clave de AWS: sudo aws configure --profile pinggo-backup"
