#!/usr/bin/env bash
# Back up the VPS before a deploy: a database dump and a copy of the code folder,
# plus a copy of the dump on this laptop. Keeps the newest $KEEP backups of each.
#
#   ./backup.sh
#
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@203.0.113.10}"
REMOTE_DIR="${REMOTE_DIR:-/opt/harmoni}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
LOCAL_DIR="${LOCAL_DIR:-$HOME/harmoni-backups}"
KEEP="${KEEP:-5}"

SSH=(ssh -i "$SSH_KEY")
TGL="$(date +%F-%H%M)"
DUMP="/root/harmoni-db-$TGL.sql.gz"

echo "==> Backing up on $VPS_HOST ($TGL)"
"${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" "$TGL" "$DUMP" "$KEEP" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"; TGL="$2"; DUMP="$3"; KEEP="$4"
cd "$REMOTE_DIR"

echo "--> Database dump: $DUMP"
docker compose --env-file .env.docker exec -T db pg_dump -U harmoni harmoni | gzip > "$DUMP"
# An empty dump still gzips to ~20 bytes; anything under 1 KB means pg_dump produced nothing.
SIZE=$(stat -c %s "$DUMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "!! Dump is only $SIZE bytes — something went wrong. Removing it." >&2
  rm -f "$DUMP"
  exit 1
fi
ls -lh "$DUMP"

echo "--> Code copy: $REMOTE_DIR.bak-$TGL"
cp -a "$REMOTE_DIR" "$REMOTE_DIR.bak-$TGL"

echo "--> Keeping the newest $KEEP of each"
ls -1t /root/harmoni-db-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1dt "$REMOTE_DIR".bak-* | tail -n +$((KEEP + 1)) | xargs -r rm -rf
REMOTE

echo "==> Downloading the dump to $LOCAL_DIR"
mkdir -p "$LOCAL_DIR"
scp -i "$SSH_KEY" -q "$VPS_HOST:$DUMP" "$LOCAL_DIR/"
ls -1t "$LOCAL_DIR"/harmoni-db-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -lh "$LOCAL_DIR/$(basename "$DUMP")"

echo "==> Backup done: $TGL"
