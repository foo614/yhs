#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/ysheng"
ENV_FILE="$APP_ROOT/shared/.env"
BACKUP_DIR="/var/lib/ysheng-backups"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -f "$ENV_FILE" ]] || { echo "ERROR: Production environment file not found: $ENV_FILE" >&2; exit 1; }
[[ -d "$APP_ROOT/current" ]] || { echo "ERROR: No deployed release is available at $APP_ROOT/current" >&2; exit 1; }

CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current")"
RELEASE_NAME="$(basename "$CURRENT_RELEASE")"
[[ "$RELEASE_NAME" =~ ^[0-9a-f]{40}$ ]] || { echo "ERROR: Current release name must be the 40-character commit SHA." >&2; exit 1; }
export API_IMAGE="ysheng-api:$RELEASE_NAME"
export WORKER_IMAGE="ysheng-worker:$RELEASE_NAME"
export FRONTOFFICE_IMAGE="ysheng-frontoffice:$RELEASE_NAME"
export BACKOFFICE_IMAGE="ysheng-backoffice:$RELEASE_NAME"

read_env() {
  local key="$1"
  local value
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  [[ -n "$value" ]] || { echo "ERROR: $key is required in $ENV_FILE" >&2; exit 1; }
  printf '%s' "$value"
}

database="$(read_env POSTGRES_DB)"
user="$(read_env POSTGRES_USER)"
umask 077
install -d -m 0700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial_backup="$BACKUP_DIR/.ysheng-$timestamp.dump.partial"
final_backup="$BACKUP_DIR/ysheng-$timestamp.dump"

COMPOSE=(
  docker compose
  --project-name ysheng
  --project-directory "$APP_ROOT/current/infra"
  --env-file "$ENV_FILE"
  -f "$APP_ROOT/current/infra/aspire-output/docker-compose.yaml"
  -f "$APP_ROOT/current/infra/docker-compose.aspire.production.yml"
)

"${COMPOSE[@]}" exec -T postgres pg_dump -U "$user" -d "$database" -Fc > "$partial_backup"
test -s "$partial_backup" || { rm -f "$partial_backup"; echo "ERROR: PostgreSQL backup is empty." >&2; exit 1; }
mv "$partial_backup" "$final_backup"
echo "PostgreSQL backup completed: $final_backup"
