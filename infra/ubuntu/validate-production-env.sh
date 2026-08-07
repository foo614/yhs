#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/ysheng/shared/.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -f "$ENV_FILE" ]] || { echo "ERROR: Production environment file not found: $ENV_FILE" >&2; exit 1; }

read_env() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

failures=()
require_value() {
  local key="$1"
  local value
  value="$(read_env "$key")"
  [[ -n "$value" ]] || failures+=("$key is required.")
}

for key in \
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD \
  SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SEED_DATA_ENABLED ASPNETCORE_ENVIRONMENT \
  PUBLIC_API_BASE_URL FRONTOFFICE_ORIGIN BACKOFFICE_ORIGIN \
  API_DOMAIN FRONTOFFICE_DOMAIN BACKOFFICE_DOMAIN TLS_EMAIL; do
  require_value "$key"
done

for key in POSTGRES_PASSWORD SEED_ADMIN_PASSWORD; do
  value="$(read_env "$key")"
  case "$value" in
    change-this-database-password|change-this-admin-password|ChangeMe123\!|ysheng_dev)
      failures+=("$key still uses an example/default value.")
      ;;
  esac
done

[[ "$(read_env ASPNETCORE_ENVIRONMENT)" == "Production" ]] || failures+=("ASPNETCORE_ENVIRONMENT must be Production.")
[[ "$(read_env SEED_DATA_ENABLED)" =~ ^(true|false)$ ]] || failures+=("SEED_DATA_ENABLED must be true or false.")

for key in API_DOMAIN FRONTOFFICE_DOMAIN BACKOFFICE_DOMAIN; do
  value="$(read_env "$key")"
  [[ "$value" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || failures+=("$key must be a hostname without a scheme, path, or port.")
  [[ ! "$value" =~ ^(localhost|127\.0\.0\.1|::1)$ && ! "$value" =~ (^|\.)example\.(com|org|net)$ ]] || failures+=("$key still uses a local-only or example domain.")
done

[[ "$(read_env TLS_EMAIL)" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || failures+=("TLS_EMAIL must be a valid email address.")
[[ ! "$(read_env TLS_EMAIL)" =~ @example\.(com|org|net)$ ]] || failures+=("TLS_EMAIL still uses an example domain.")

for pair in "PUBLIC_API_BASE_URL API_DOMAIN" "FRONTOFFICE_ORIGIN FRONTOFFICE_DOMAIN" "BACKOFFICE_ORIGIN BACKOFFICE_DOMAIN"; do
  read -r url_key domain_key <<< "$pair"
  expected="https://$(read_env "$domain_key")"
  [[ "$(read_env "$url_key")" == "$expected" ]] || failures+=("$url_key must equal $expected for Caddy TLS.")
done

if (( ${#failures[@]} > 0 )); then
  printf 'Production environment validation failed:\n' >&2
  printf -- '- %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "Production environment validation OK: $ENV_FILE"
