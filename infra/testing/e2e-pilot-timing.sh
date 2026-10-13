#!/usr/bin/env bash
set -u

if [[ $# -lt 4 || "$3" != "--" ]]; then
  echo "Usage: $0 <timing-jsonl> <step-name> -- <command> [args...]" >&2
  exit 64
fi

timing_file="$1"
step_name="$2"
shift 3
mkdir -p "$(dirname "$timing_file")"
start_ms="$(date +%s%3N)"
start_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$@"
status=$?
end_ms="$(date +%s%3N)"
end_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
duration_ms=$((end_ms - start_ms))
printf '{"step":"%s","startedAt":"%s","finishedAt":"%s","durationMs":%s,"exitCode":%s}\n' \
  "$step_name" "$start_iso" "$end_iso" "$duration_ms" "$status" >> "$timing_file"
exit "$status"
