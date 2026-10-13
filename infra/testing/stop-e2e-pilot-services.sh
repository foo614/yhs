#!/usr/bin/env bash
set -u

output_dir="${E2E_OUTPUT_DIR:-artifacts/e2e-pilot}"
stop_group() {
  local pid="$1"
  local expected="$2"
  local command_line
  command_line="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  if [[ -n "$command_line" && "$command_line" != *"$expected"* ]]; then
    return 0
  fi
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 -- "-$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

stop_service() {
  local pid_file="$1"
  local expected="$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(< "$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && (( pid > 1 )); then
      stop_group "$pid" "$expected"
    fi
    rm -f "$pid_file"
  fi
}

stop_service "$output_dir/api.pid" "YSHeng.Api.csproj"
stop_service "$output_dir/backoffice.pid" "apps/backoffice"
exit 0
