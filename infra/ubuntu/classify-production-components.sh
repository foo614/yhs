#!/usr/bin/env bash
set -euo pipefail

# Emit a stable comma-separated component set, none, or full. Unknown paths
# remain conservative; documentation must not expand an application rollout.
backoffice=false
frontoffice=false
backend=false
full=false
while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -n "$path" ]] || continue
  case "$path" in
    docs/*|.codex/*|.agents/*|AGENTS.md|codex-agent.md|README.md|CONTRIBUTING.md|LICENSE)
      ;;
    services/api/src/YSHeng.AppHost/*)
      full=true
      ;;
    apps/frontoffice/app/vehicles/MarketingDescription.*|apps/frontoffice/app/vehicles/marketing-markdown.*)
      # Imported by the back-office vehicle page as well.
      backoffice=true
      frontoffice=true
      ;;
    apps/backoffice/*) backoffice=true ;;
    apps/frontoffice/*) frontoffice=true ;;
    services/api/*) backend=true ;;
    package.json|package-lock.json)
      backoffice=true
      frontoffice=true
      ;;
    *)
      full=true
      ;;
  esac
done
components=()
if $backoffice; then components+=(backoffice); fi
if $frontoffice; then components+=(frontoffice); fi
if $backend; then components+=(api-worker); fi
if $full; then
  echo "full"
elif (( ${#components[@]} == 0 )); then
  echo none
else
  (IFS=,; echo "${components[*]}")
fi
