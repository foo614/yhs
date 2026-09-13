#!/usr/bin/env bash
set -euo pipefail

# Reads repository-relative changed paths from stdin and emits one deployment
# scope. Any shared, infrastructure, unknown, or multi-component change falls
# back to the complete production stack.
scope=""

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  case "$path" in
    apps/backoffice/*)
      candidate="backoffice"
      ;;
    apps/frontoffice/*)
      candidate="frontoffice"
      ;;
    services/api/*)
      candidate="api-worker"
      ;;
    *)
      echo "full"
      exit 0
      ;;
  esac

  if [[ -n "$scope" && "$scope" != "$candidate" ]]; then
    echo "full"
    exit 0
  fi
  scope="$candidate"
done

# A repeated or otherwise empty comparison is safe but intentionally
# conservative: run the established full deployment path.
echo "${scope:-full}"
