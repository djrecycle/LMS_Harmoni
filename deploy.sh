#!/usr/bin/env bash
# Sync this project to the VPS and rebuild the running stack.
#
#   ./deploy.sh
#
# The rebuild runs detached on the VPS (log: /root/deploy.log), so a dropped SSH connection
# doesn't stop it: this script just reconnects and keeps following the log until it finishes.
#
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@203.0.113.10}"
REMOTE_DIR="${REMOTE_DIR:-/opt/harmoni}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

LOG=/root/deploy.log
PIDFILE=/root/deploy.pid
EXITFILE=/root/deploy.exit
COMPOSE="docker compose --env-file .env.docker --profile proxy"

SSH_OPTS=(-i "$SSH_KEY" -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ConnectTimeout=15)
SSH=(ssh "${SSH_OPTS[@]}")
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Syncing files to $VPS_HOST:$REMOTE_DIR"
for attempt in 1 2 3; do
  rsync -az --delete --timeout=60 \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'data' \
    --exclude 'uploads' \
    --exclude 'tsconfig.tsbuildinfo' \
    --exclude '.env.local' \
    --exclude '.env.docker' \
    --exclude '.git' \
    -e "ssh ${SSH_OPTS[*]}" \
    ./ "$VPS_HOST:$REMOTE_DIR/" && break
  [ "$attempt" -eq 3 ] && { echo "!! Sync failed 3 times — nothing was rebuilt." >&2; exit 1; }
  echo "!! Sync interrupted, retrying in 10s ($attempt/3)…"
  sleep 10
done

echo "==> Starting the rebuild on the VPS (detached)"
# Only single-word arguments here: ssh joins them into one command line, so anything with spaces would split.
"${SSH[@]}" "$VPS_HOST" bash -s -- "$REMOTE_DIR" "$LOG" "$PIDFILE" "$EXITFILE" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"; LOG="$2"; PIDFILE="$3"; EXITFILE="$4"
COMPOSE="docker compose --env-file .env.docker --profile proxy"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "!! Another deploy is still running (pid $(cat "$PIDFILE")). Follow it with: tail -f $LOG" >&2
  exit 1
fi
rm -f "$EXITFILE"
cd "$REMOTE_DIR"
nohup setsid sh -c "echo \$\$ > $PIDFILE; $COMPOSE up -d --build; echo \$? > $EXITFILE" > "$LOG" 2>&1 < /dev/null &
# Wait for the pid file so the follow step below has something to watch.
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$PIDFILE" ] && exit 0; sleep 0.5; done
echo "!! The rebuild didn't start — see $LOG" >&2
exit 1
REMOTE

echo "==> Following $LOG (safe to lose the connection — it reconnects)"
SHOWN="$(mktemp)"
trap 'rm -f "$SHOWN"' EXIT
for attempt in $(seq 1 60); do
  # tail --pid stops by itself once the rebuild process exits; resume after the lines already shown.
  seen=$(wc -l < "$SHOWN")
  if "${SSH[@]}" "$VPS_HOST" "tail -n +$((seen + 1)) -f --pid=\$(cat $PIDFILE) $LOG" | tee -a "$SHOWN"; then
    if "${SSH[@]}" "$VPS_HOST" "test -f $EXITFILE"; then break; fi
  fi
  echo "!! Connection lost — the rebuild keeps running on the VPS. Reconnecting in 10s ($attempt/60)…"
  sleep 10
done

code=$("${SSH[@]}" "$VPS_HOST" "cat $EXITFILE 2>/dev/null || echo unknown")
if [ "$code" != "0" ]; then
  echo "!! Rebuild did not finish cleanly (exit: $code). The old container keeps running. Full log: ssh $VPS_HOST tail -n 100 $LOG" >&2
  exit 1
fi

echo "==> Done. Status:"
"${SSH[@]}" "$VPS_HOST" "cd $REMOTE_DIR && $COMPOSE ps"
