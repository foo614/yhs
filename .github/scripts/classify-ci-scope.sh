#!/usr/bin/env bash
set -euo pipefail

# Emit GitHub Actions boolean outputs for the smallest safe CI scope. Unknown
# non-documentation paths stay conservative and exercise every stack.
frontoffice=false
backoffice=false
api=false
deployment=false

while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -n "$path" ]] || continue
  case "$path" in
    .github/workflows/ci.yml|.github/scripts/classify-ci-scope.sh)
      frontoffice=true
      backoffice=true
      api=true
      deployment=true
      ;;
    apps/frontoffice/app/vehicles/MarketingDescription.*|apps/frontoffice/app/vehicles/marketing-markdown.*)
      # These modules are imported by both web apps.
      frontoffice=true
      backoffice=true
      ;;
    apps/frontoffice/Dockerfile)
      frontoffice=true
      deployment=true
      ;;
    apps/frontoffice/*)
      frontoffice=true
      ;;
    apps/backoffice/Dockerfile)
      backoffice=true
      deployment=true
      ;;
    apps/backoffice/*)
      backoffice=true
      ;;
    services/api/src/YSHeng.AppHost/*|services/api/**/Dockerfile)
      api=true
      deployment=true
      ;;
    services/api/*)
      api=true
      ;;
    infra/*|global.json|docs/DEPLOYMENT_RUNBOOK.md|docs/OBSERVABILITY_RUNBOOK.md|docs/REQUIREMENTS_TRACE.md|docs/SOURCE_REQUIREMENTS_CROSSCHECK.md|docs/STITCH_VISUAL_REFERENCE.md)
      deployment=true
      ;;
    package.json|package-lock.json)
      frontoffice=true
      backoffice=true
      ;;
    docs/*|.codex/*|.agents/*|AGENTS.md|codex-agent.md|README.md|CONTRIBUTING.md|LICENSE)
      ;;
    *)
      frontoffice=true
      backoffice=true
      api=true
      deployment=true
      ;;
  esac
done

printf 'frontoffice=%s\n' "$frontoffice"
printf 'backoffice=%s\n' "$backoffice"
printf 'api=%s\n' "$api"
printf 'deployment=%s\n' "$deployment"
