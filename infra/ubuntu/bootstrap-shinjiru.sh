#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/ysheng"
DEPLOY_USER=""
RELEASE_DIR=""
SSH_PORT="22"

usage() {
  cat <<'EOF'
Usage: bootstrap-shinjiru.sh --deploy-user USER --release-dir PATH [--ssh-port PORT]

Installs Docker Engine and Docker Compose on a new Ubuntu Shinjiru VPS, configures
the deployment directories, enables the scheduled PostgreSQL backup timer, and
opens only SSH, HTTP, and HTTPS in UFW.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy-user)
      DEPLOY_USER="$2"
      shift 2
      ;;
    --release-dir)
      RELEASE_DIR="$2"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="$2"
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

[[ "$(id -u)" -eq 0 ]] || fail "Run this bootstrap through sudo."
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "--deploy-user must be a valid Linux user name."
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] && (( SSH_PORT >= 1 && SSH_PORT <= 65535 )) || fail "--ssh-port must be between 1 and 65535."
[[ -n "$RELEASE_DIR" && -d "$RELEASE_DIR" ]] || fail "--release-dir must be an existing uploaded release directory."
[[ -f "$RELEASE_DIR/infra/ubuntu/deploy-production.sh" ]] || fail "Release directory is missing deployment scripts."
[[ -f "$RELEASE_DIR/infra/aspire-output/docker-compose.yaml" ]] || fail "Release directory is missing the Aspire Compose artifact."

source /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || fail "This bootstrap supports Ubuntu only. Detected: ${ID:-unknown}."
getent passwd "$DEPLOY_USER" >/dev/null || fail "Deployment user does not exist: $DEPLOY_USER"

if ! command -v ufw >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ufw
fi

if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required; install docker-compose-plugin before continuing."
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

RELEASE_NAME="$(basename "$RELEASE_DIR")"
[[ "$RELEASE_NAME" =~ ^[0-9a-f]{40}$ ]] || fail "Release directory name must be the 40-character commit SHA."
DEPLOY_GROUP="$(id -gn "$DEPLOY_USER")"
TARGET_RELEASE="$APP_ROOT/releases/$RELEASE_NAME"

install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_ROOT/releases" "$APP_ROOT/shared"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" /var/lib/ysheng-backups
install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$TARGET_RELEASE"
cp -a "$RELEASE_DIR/." "$TARGET_RELEASE/"
chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$TARGET_RELEASE"

sed "s/__DEPLOY_USER__/$DEPLOY_USER/g" "$TARGET_RELEASE/infra/ubuntu/ysheng-backup.service" > /etc/systemd/system/ysheng-backup.service
install -m 0644 "$TARGET_RELEASE/infra/ubuntu/ysheng-backup.timer" /etc/systemd/system/ysheng-backup.timer
systemctl daemon-reload
systemctl enable --now ysheng-backup.timer

ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Shinjiru bootstrap complete. Open a new SSH session before using Docker without sudo."
