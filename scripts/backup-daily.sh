#!/usr/bin/env bash
# Daily backup that runs ON the VPS (cron): a database dump plus an archive of the uploads volume.
# Keeps the newest $KEEP of each in $BACKUP_DIR. Separate from ./backup.sh, which runs from the laptop
# before a deploy and keeps its own /root/harmoni-db-*.sql.gz files.
#
#   /opt/harmoni/scripts/backup-daily.sh
#
# Scheduled by /etc/cron.d/harmoni-lms-backup on the VPS:
#   30 19 * * * root /opt/harmoni/scripts/backup-daily.sh >> /var/backups/harmoni-lms/backup.log 2>&1
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Outside the code folder on purpose: deploy.sh syncs /opt/harmoni with --delete.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/harmoni-lms}"
KEEP="${KEEP:-14}"
TGL="$(date +%F-%H%M)"
DUMP="$BACKUP_DIR/harmoni-lms-db-$TGL.sql.gz"
COMPOSE=(docker compose --env-file .env.docker)

mkdir -p "$BACKUP_DIR"

echo "==> Database dump: $DUMP"
"${COMPOSE[@]}" exec -T db pg_dump -U harmoni harmoni | gzip > "$DUMP"
# An empty dump still gzips to ~20 bytes; anything under 1 KB means pg_dump produced nothing.
SIZE=$(stat -c %s "$DUMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "!! Dump is only $SIZE bytes — something went wrong. Removing it." >&2
  rm -f "$DUMP"
  exit 1
fi
ls -lh "$DUMP"

if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx app; then
  UP="$BACKUP_DIR/harmoni-lms-uploads-$TGL.tar.gz"
  echo "==> Uploads archive: $UP"
  "${COMPOSE[@]}" exec -T app tar -czf - -C /data uploads > "$UP"
fi

echo "==> Keeping the newest $KEEP of each"
for pattern in 'harmoni-lms-db-*.sql.gz' 'harmoni-lms-uploads-*.tar.gz'; do
  { ls -1t "$BACKUP_DIR"/$pattern 2>/dev/null || true; } | tail -n +$((KEEP + 1)) | xargs -r rm -f
done

echo "==> Backup done: $TGL"
