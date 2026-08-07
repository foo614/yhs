#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/ysheng"
RELEASE_DIR=""
ENV_FILE="$APP_ROOT/shared/.env"

usage() {
  cat <<'EOF'
Usage: deploy-production.sh --release-dir PATH [--env-file PATH]

Deploys a prepared release with the base Docker Compose file plus the production
Caddy override. Existing PostgreSQL data is backed up before each later deploy.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-dir)
      RELEASE_DIR="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$RELEASE_DIR" && -d "$RELEASE_DIR" ]] || fail "--release-dir must be an existing release directory."
[[ -f "$ENV_FILE" ]] || fail "Production environment file not found: $ENV_FILE"
[[ -f "$RELEASE_DIR/infra/docker-compose.production.yml" ]] || fail "Release is missing the production Compose override."
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Run bootstrap-shinjiru.sh first."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available."

bash "$RELEASE_DIR/infra/ubuntu/validate-production-env.sh" --env-file "$ENV_FILE"

COMPOSE=(
  docker compose
  --project-name ysheng
  --project-directory "$RELEASE_DIR/infra"
  --env-file "$ENV_FILE"
  -f "$RELEASE_DIR/infra/docker-compose.yml"
  -f "$RELEASE_DIR/infra/docker-compose.production.yml"
)

"${COMPOSE[@]}" config -q

if [[ -L "$APP_ROOT/current" ]] && "${COMPOSE[@]}" ps -q postgres | grep -q .; then
  "$APP_ROOT/current/infra/ubuntu/backup-postgres.sh" --env-file "$ENV_FILE"
fi

"${COMPOSE[@]}" up -d --build --remove-orphans
bash "$RELEASE_DIR/infra/ubuntu/production-smoke.sh" --env-file "$ENV_FILE"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

echo "Production deployment completed: $(basename "$RELEASE_DIR")"
