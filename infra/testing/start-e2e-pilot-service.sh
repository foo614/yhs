#!/usr/bin/env bash
set -euo pipefail

service="${1:-}"
output_dir="${E2E_OUTPUT_DIR:-artifacts/e2e-pilot}"
mkdir -p "$output_dir"

case "$service" in
  api)
    log_file="$output_dir/api.log"
    pid_file="$output_dir/api.pid"
    api_port="${E2E_API_PORT:-5000}"
    service_port="$api_port"
    health_url="${E2E_API_BASE_URL:-http://127.0.0.1:${api_port}}/health/ready"
    command=(dotnet run --no-build --no-restore --no-launch-profile --project services/api/src/YSHeng.Api/YSHeng.Api.csproj --urls "http://127.0.0.1:${api_port}")
    connection_string="${ConnectionStrings__Default:-}"
    if [[ -z "$connection_string" ]]; then
      echo "ConnectionStrings__Default is required for the isolated E2E API." >&2
      exit 65
    fi
    if [[ "${ASPNETCORE_ENVIRONMENT:-}" != "Development" || "${SeedData__Enabled:-}" != "true" ]]; then
      echo "Refusing the pilot API unless ASPNETCORE_ENVIRONMENT=Development and SeedData__Enabled=true." >&2
      exit 65
    fi
    if [[ "${E2E_PILOT_DB_SENTINEL:-}" != "YSHENG_E2E_PILOT" ]]; then
      echo "Refusing the pilot API without E2E_PILOT_DB_SENTINEL=YSHENG_E2E_PILOT." >&2
      exit 65
    fi
    connection_values="$(python3 - "$connection_string" <<'PY'
import sys

raw = sys.argv[1]
values = {}
for part in raw.split(';'):
    part = part.strip()
    if not part:
        continue
    if '=' not in part:
        raise SystemExit('connection string contains a malformed segment')
    key, value = (item.strip() for item in part.split('=', 1))
    key = key.lower()
    if key not in ('host', 'port', 'database', 'username', 'password'):
        raise SystemExit('connection string contains an unsupported key')
    if key in values:
        raise SystemExit(f'connection string contains duplicate key: {key}')
    values[key] = value

required = ('host', 'port', 'database', 'username')
missing = [key for key in required if not values.get(key)]
if missing:
    raise SystemExit(f'connection string is missing: {", ".join(missing)}')
print('\t'.join(values[key] for key in required))
PY
)" || {
      echo "Refusing an ambiguous or malformed E2E database connection string." >&2
      exit 65
    }
    IFS=$'\t' read -r db_host db_port db_name db_user <<< "$connection_values"
    if [[ "$db_host" != "localhost" && "$db_host" != "127.0.0.1" || "$db_port" != "5432" && "$db_port" != "58143" ]]; then
      echo "Refusing a non-loopback or non-pilot E2E database endpoint: ${db_host:-missing}:${db_port:-missing}" >&2
      exit 65
    fi
    case "${db_name}:${db_user}" in
      e2e_pilot:e2e_pilot|ysheng_e2e_pilot:ysheng_e2e) ;;
      *) echo "Refusing a database/user outside the E2E pilot allowlist: ${db_name:-missing}/${db_user:-missing}" >&2; exit 65 ;;
    esac
    export Worker__Enabled=false
    export WhatsApp__CaptureEnabled=false WhatsApp__SendingEnabled=false
    export WhatsApp__StaffCaptureEnabled=false WhatsApp__StaffSendingEnabled=false
    export WhatsApp__InvitationEnabled=false WhatsApp__WebhookEnabled=false
    export WhatsAppAssistant__Enabled=false WhatsAppAssistant__WebhookEnabled=false
    ;;
  backoffice)
    log_file="$output_dir/backoffice.log"
    pid_file="$output_dir/backoffice.pid"
    backoffice_port="${E2E_BACKOFFICE_PORT:-4176}"
    service_port="$backoffice_port"
    health_url="${E2E_BASE_URL:-http://127.0.0.1:${backoffice_port}}"
    command=(npm --workspace apps/backoffice run preview -- --host 127.0.0.1 --port "${backoffice_port}" --strictPort)
    ;;
  *)
    echo "Usage: $0 api|backoffice" >&2
    exit 64
    ;;
esac

if [[ ! "$service_port" =~ ^[0-9]+$ ]] || (( service_port < 1024 || service_port > 65535 )); then
  echo "Invalid pilot service port." >&2
  exit 65
fi
python3 - "$health_url" "$service_port" <<'PY'
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
if (url.scheme != 'http' or url.hostname not in ('localhost', '127.0.0.1')
        or url.port != int(sys.argv[2]) or url.username or url.password
        or url.query or url.fragment):
    raise SystemExit('Pilot readiness URL must match the local HTTP service port')
PY
# A pre-existing listener must never masquerade as the service this run started.
python3 - "$service_port" <<'PY'
import socket, sys
with socket.socket() as listener:
    listener.bind(('127.0.0.1', int(sys.argv[1])))
PY

nohup setsid "${command[@]}" > "$log_file" 2>&1 &
pid=$!
printf '%s\n' "$pid" > "$pid_file"

deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  remaining=$((deadline - SECONDS))
  request_timeout=$((remaining < 3 ? remaining : 3))
  if kill -0 "$pid" 2>/dev/null && curl --connect-timeout 1 --max-time "$request_timeout" --fail --silent --show-error "$health_url" > /dev/null 2>&1; then
    echo "$service is ready on $health_url"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$service exited before becoming ready; log follows:" >&2
    tail -n 120 "$log_file" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "$service did not become ready within 90 seconds; log follows:" >&2
tail -n 120 "$log_file" >&2 || true
exit 1
