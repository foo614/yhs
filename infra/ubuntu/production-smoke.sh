#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/ysheng/shared/.env"
TIMEOUT_SECONDS=240
COMPONENTS="full"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --components)
      COMPONENTS="$2"
      shift 2
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -f "$ENV_FILE" ]] || { echo "ERROR: Production environment file not found: $ENV_FILE" >&2; exit 1; }
[[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || { echo "ERROR: --timeout-seconds must be a positive integer." >&2; exit 1; }
[[ "$COMPONENTS" =~ ^(full|backoffice|frontoffice|api-worker)$ ]] || { echo "ERROR: --components must be full, backoffice, frontoffice, or api-worker." >&2; exit 1; }

read_env() {
  local key="$1"
  local value
  value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  [[ -n "$value" ]] || { echo "ERROR: $key is required in $ENV_FILE" >&2; exit 1; }
  printf '%s' "$value"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))

  until curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "ERROR: Timed out waiting for $name at $url" >&2
      exit 1
    fi
    sleep 5
  done
  echo "$name reachable: $url"
}

api_base_url="$(read_env PUBLIC_API_BASE_URL)"
frontoffice_url="$(read_env FRONTOFFICE_ORIGIN)"
backoffice_url="$(read_env BACKOFFICE_ORIGIN)"

case "$COMPONENTS" in
  full)
    wait_for_url "API readiness" "$api_base_url/health/ready"
    wait_for_url "Front office" "$frontoffice_url"
    wait_for_url "Back office" "$backoffice_url"
    hardening_url="$api_base_url/health"
    ;;
  api-worker)
    wait_for_url "API readiness" "$api_base_url/health/ready"
    hardening_url="$api_base_url/health"
    ;;
  frontoffice)
    wait_for_url "Front office" "$frontoffice_url"
    hardening_url="$frontoffice_url"
    ;;
  backoffice)
    wait_for_url "Back office" "$backoffice_url"
    hardening_url="$backoffice_url"
    ;;
esac

headers_file="$(mktemp)"
trap 'rm -f "$headers_file"' EXIT
curl --fail --silent --show-error --max-time 10 -D "$headers_file" -o /dev/null "$hardening_url"
grep -qi '^strict-transport-security:' "$headers_file" || { echo "ERROR: HTTPS hardening header is missing." >&2; exit 1; }
grep -qi '^x-content-type-options: nosniff' "$headers_file" || { echo "ERROR: Content-type hardening header is missing." >&2; exit 1; }

echo "Production smoke test passed ($COMPONENTS)."
