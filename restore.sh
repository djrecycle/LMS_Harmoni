#!/usr/bin/env bash
# Restore LMS Harmoni onto a NEW, empty server from the backups on this laptop.
# Full walkthrough (server prep, DNS, secrets, Harmoni Gitar): docs/pemulihan-server.md
#
#   ./restore.sh                                  # newest backup in ~/harmoni-backups/harian/harmoni-lms
#   ./restore.sh <db.sql.gz> <uploads.tar.gz>     # a specific backup
#
# Steps: check the backup files -> send the code -> create .env.docker if the server has none
# -> start only the database and restore the dump (refused if the database already has tables)
# -> build and start the app via ./deploy.sh -> put the uploaded files back -> install the daily backup cron.
#
# The server comes from VPS_HOST in .deploy.env: point it at the new server first.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

[ -f .deploy.env ] && source .deploy.env
VPS_HOST="${VPS_HOST:?Set VPS_HOST in .deploy.env to the NEW server (e.g. root@203.0.113.10)}"
REMOTE_DIR="${REMOTE_DIR:-/opt/harmoni}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
DOMAIN="${DOMAIN:-musicclass.tech}"
BACKUP_SRC="${BACKUP_SRC:-$HOME/harmoni-backups/harian/harmoni-lms}"

SSH_OPTS=(-i "$SSH_KEY" -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}")
COMPOSE="docker compose --env-file .env.docker --profile proxy"

DB_FILE="${1:-$(ls -1t "$BACKUP_SRC"/harmoni-lms-db-*.sql.gz 2>/dev/null | head -1)}"
UP_FILE="${2:-$(ls -1t "$BACKUP_SRC"/harmoni-lms-uploads-*.tar.gz 2>/dev/null | head -1)}"

echo "==> 1/7 Checking the backup files"
[ -f "$DB_FILE" ] || { echo "!! Database backup not found: ${DB_FILE:-(none in $BACKUP_SRC)}" >&2; exit 1; }
gzip -t "$DB_FILE" || { echo "!! $DB_FILE is damaged" >&2; exit 1; }
echo "    database: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"
if [ -n "$UP_FILE" ] && [ -f "$UP_FILE" ]; then
  gzip -t "$UP_FILE" || { echo "!! $UP_FILE is damaged" >&2; exit 1; }
  echo "    uploads:  $UP_FILE ($(tar tzf "$UP_FILE" | wc -l) entries)"
else
  UP_FILE=""
  echo "    uploads:  (none — uploaded files will not be restored)"
fi
echo "    server:   $VPS_HOST:$REMOTE_DIR (domain $DOMAIN)"
read -r -p "Restore these onto $VPS_HOST? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled."; exit 1; }

"${SSH[@]}" "$VPS_HOST" 'command -v docker >/dev/null && docker compose version >/dev/null' || {
  echo "!! Docker (with the compose plugin) is not installed on the server. See step 2 in docs/pemulihan-server.md." >&2
  exit 1
}

echo "==> 2/7 Sending the code to $REMOTE_DIR"
"${SSH[@]}" "$VPS_HOST" "mkdir -p $REMOTE_DIR /root/restore"
rsync -az --timeout=60 \
  --exclude 'node_modules' --exclude '.next' --exclude 'data' --exclude 'uploads' \
  --exclude 'tsconfig.tsbuildinfo' --exclude '.env.local' --exclude '.env.docker' \
  --exclude '.deploy.env' --exclude '.git' \
  -e "ssh ${SSH_OPTS[*]}" ./ "$VPS_HOST:$REMOTE_DIR/"
scp "${SSH_OPTS[@]}" -q "$DB_FILE" "$VPS_HOST:/root/restore/db.sql.gz"
[ -n "$UP_FILE" ] && scp "${SSH_OPTS[@]}" -q "$UP_FILE" "$VPS_HOST:/root/restore/uploads.tar.gz"

echo "==> 3/7 Checking .env.docker on the server"
"${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" "$DOMAIN" <<'REMOTE'
set -euo pipefail
cd "$1"; DOMAIN="$2"
if [ -f .env.docker ]; then
  echo "    .env.docker already exists — kept as is."
  exit 0
fi
# New secrets. The old BETTER_AUTH_SECRET is gone with the old server: everyone signs in again, and
# AI keys saved in the app must be entered again (they were encrypted with the old secret).
umask 077
cat > .env.docker <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://$DOMAIN
DOMAIN=$DOMAIN
APP_PORT=3000
DB_PORT=5432
TEACHER_SIGNUP_CODE=
ANTHROPIC_API_KEY=
AI_MODEL=claude-opus-5
GEMINI_API_KEY=
AI_PROVIDER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Harmoni Music Class <no-reply@$DOMAIN>"
EOF
echo "    Created .env.docker with NEW secrets (Google sign-in, SMTP and server AI keys are empty — fill them in later)."
REMOTE

echo "==> 4/7 Restoring the database"
"${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"
COMPOSE="docker compose --env-file .env.docker"
$COMPOSE up -d db < /dev/null
# A brand-new Postgres starts once to initialise, shuts down, then starts for real: wait until it has
# answered 3 times in a row, not just once.
ready=0
for _ in $(seq 1 90); do
  if $COMPOSE exec -T db psql -U harmoni -d harmoni -tAc 'select 1' < /dev/null >/dev/null 2>&1; then
    ready=$((ready + 1)); [ "$ready" -ge 3 ] && break
  else
    ready=0
  fi
  sleep 2
done
[ "$ready" -ge 3 ] || { echo "!! The database did not start — check: $COMPOSE logs db" >&2; exit 1; }
TABLES=$($COMPOSE exec -T db psql -U harmoni -d harmoni -tAc "select count(*) from information_schema.tables where table_schema='public'" < /dev/null | tr -d '[:space:]')
if [ "$TABLES" != "0" ]; then
  echo "!! The database on this server already has $TABLES tables — refusing to overwrite it." >&2
  echo "   This script is only for an empty, new server." >&2
  exit 1
fi
gunzip -c /root/restore/db.sql.gz | $COMPOSE exec -T db psql -q -U harmoni -d harmoni -v ON_ERROR_STOP=1 > /dev/null
$COMPOSE exec -T db psql -U harmoni -d harmoni -tAc \
  "select 'accounts: ' || count(*) from \"user\" union all select 'quiz attempts: ' || count(*) from attempt union all select 'lessons: ' || count(*) from material" < /dev/null \
  | sed 's/^/    /'
REMOTE

echo "==> 5/7 Building and starting the app (./deploy.sh)"
./deploy.sh

echo "==> 6/7 Putting the uploaded files back"
if [ -n "$UP_FILE" ]; then
  "${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"
docker compose --env-file .env.docker exec -T -u 0 app sh -c 'tar -xzf - -C /data && chown -R 1001:1001 /data/uploads' < /root/restore/uploads.tar.gz
echo "    $(docker compose --env-file .env.docker exec -T app sh -c 'find /data/uploads -type f | wc -l' < /dev/null) files in /data/uploads"
REMOTE
else
  echo "    skipped (no uploads backup)"
fi

echo "==> 7/7 Installing the daily backup (19:30 server time) and cleaning up"
"${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
mkdir -p /var/backups/harmoni-lms
echo "30 19 * * * root $1/scripts/backup-daily.sh >> /var/backups/harmoni-lms/backup.log 2>&1" > /etc/cron.d/harmoni-lms-backup
chmod 644 /etc/cron.d/harmoni-lms-backup
rm -rf /root/restore
REMOTE

echo "==> Restore done. Open https://$DOMAIN once its DNS points to this server."
echo "    Next: the checklist in docs/pemulihan-server.md (step 6)."
