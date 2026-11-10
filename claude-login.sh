#!/usr/bin/env bash
# Log Claude Code in again inside the app container on the VPS.
# Run this when the app shows "Claude Code failed: ... sign-in may have ended".
#
#   ./claude-login.sh
#
# The login is stored in the claude_home volume, so no restart is needed afterwards.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

[ -f .deploy.env ] && source .deploy.env
VPS_HOST="${VPS_HOST:?Set VPS_HOST in .deploy.env (e.g. root@203.0.113.10)}"
REMOTE_DIR="${REMOTE_DIR:-/opt/harmoni}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

# -t: the login asks for a code, so it needs an interactive terminal.
exec ssh -t -i "$SSH_KEY" "$VPS_HOST" \
  "cd $REMOTE_DIR && docker compose --env-file .env.docker exec -it app claude auth login"
