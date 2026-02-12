#!/usr/bin/env bash
set -euo pipefail

# Default configuration (can be overridden by env vars)
SERVER_HOST="${SERVER_HOST:-161.97.75.41}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_DEST="${SERVER_DEST:-/opt/1panel/apps/openresty/openresty/www/sites/frenmap.fun}"

# Default exclude patterns for rsync (colon-separated)
# Applies only when rsync is used; scp fallback does not support excludes.
EXCLUDE_DEFAULTS="${EXCLUDE_DEFAULTS:-node_modules:.git:dist:build:coverage:.next:.turbo:.cache:.DS_Store}"
# Extra patterns to exclude (colon-separated)
EXCLUDE_EXTRA="${EXCLUDE_EXTRA:-}"
# Provide a file with patterns (same syntax as rsync --exclude-from)
EXCLUDE_FILE="${EXCLUDE_FILE:-}"
# Set to 1 to disable all excludes
DISABLE_EXCLUDES="${DISABLE_EXCLUDES:-0}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <local-path> [subdir]" >&2
  exit 1
fi

LOCAL_PATH="$1"
SUBDIR="${2:-}"

if [[ ! -e "$LOCAL_PATH" ]]; then
  echo "Error: Local path not found: $LOCAL_PATH" >&2
  exit 1
fi

REMOTE_BASE="$SERVER_USER@$SERVER_HOST:$SERVER_DEST"
if [[ -n "$SUBDIR" ]]; then
  REMOTE_BASE="$REMOTE_BASE/$SUBDIR"
fi

# Ensure remote directory exists
if [[ -n "${SERVER_PASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass not found. Install with: brew install hudochenkov/sshpass/sshpass" >&2
    exit 1
  fi
  sshpass -p "$SERVER_PASS" ssh -p "$SERVER_PORT" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "mkdir -p \"$SERVER_DEST/$SUBDIR\""
else
  ssh -p "$SERVER_PORT" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "mkdir -p \"$SERVER_DEST/$SUBDIR\""
fi

# Build rsync exclude args
RSYNC_EXCLUDE_ARGS=()
if [[ "$DISABLE_EXCLUDES" != "1" ]]; then
  IFS=':' read -r -a EX_PATTERNS <<< "$EXCLUDE_DEFAULTS"
  for pat in "${EX_PATTERNS[@]}"; do
    [[ -n "$pat" ]] && RSYNC_EXCLUDE_ARGS+=(--exclude "$pat")
  done
  if [[ -n "$EXCLUDE_EXTRA" ]]; then
    IFS=':' read -r -a EX_PATTERNS_EXTRA <<< "$EXCLUDE_EXTRA"
    for pat in "${EX_PATTERNS_EXTRA[@]}"; do
      [[ -n "$pat" ]] && RSYNC_EXCLUDE_ARGS+=(--exclude "$pat")
    done
  fi
  if [[ -n "$EXCLUDE_FILE" ]]; then
    RSYNC_EXCLUDE_ARGS+=(--exclude-from "$EXCLUDE_FILE")
  fi
fi

# Prefer rsync if available
if command -v rsync >/dev/null 2>&1; then
  RSYNC_SSH=("ssh" "-p" "$SERVER_PORT" "-o" "StrictHostKeyChecking=no")
  if [[ -n "${SERVER_PASS:-}" ]]; then
    RSYNC_CMD=("sshpass" "-p" "$SERVER_PASS" "rsync")
  else
    RSYNC_CMD=("rsync")
  fi

  if [[ -d "$LOCAL_PATH" ]]; then
    # Sync directory contents (trailing slash semantics)
    "${RSYNC_CMD[@]}" -avz --progress "${RSYNC_EXCLUDE_ARGS[@]}" -e "${RSYNC_SSH[*]}" "$LOCAL_PATH"/ "$REMOTE_BASE"/
  else
    "${RSYNC_CMD[@]}" -avz --progress "${RSYNC_EXCLUDE_ARGS[@]}" -e "${RSYNC_SSH[*]}" "$LOCAL_PATH" "$REMOTE_BASE"/
  fi
else
  echo "rsync not found, falling back to scp... (excludes will NOT apply)" >&2
  if [[ -n "${SERVER_PASS:-}" ]]; then
    sshpass -p "$SERVER_PASS" scp -P "$SERVER_PORT" -o StrictHostKeyChecking=no -r "$LOCAL_PATH" "$REMOTE_BASE"/
  else
    scp -P "$SERVER_PORT" -o StrictHostKeyChecking=no -r "$LOCAL_PATH" "$REMOTE_BASE"/
  fi
fi

echo "Upload complete: $LOCAL_PATH -> $REMOTE_BASE/"