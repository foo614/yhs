#!/usr/bin/env bash
set -euo pipefail

classifier=".github/scripts/classify-ci-scope.sh"

assert_scope() {
  local expected="$1"
  shift
  local actual
  actual="$(printf '%s\n' "$@" | bash "$classifier")"
  [[ "$actual" == "$expected" ]] || {
    echo "Unexpected CI scope for: $*" >&2
    printf 'Expected:\n%s\nActual:\n%s\n' "$expected" "$actual" >&2
    exit 1
  }
}

frontoffice_only=$'frontoffice=true\nbackoffice=false\napi=false\ndeployment=false'
backoffice_only=$'frontoffice=false\nbackoffice=true\napi=false\ndeployment=false'
api_only=$'frontoffice=false\nbackoffice=false\napi=true\ndeployment=false'
deployment_only=$'frontoffice=false\nbackoffice=false\napi=false\ndeployment=true'
both_web=$'frontoffice=true\nbackoffice=true\napi=false\ndeployment=false'
all=$'frontoffice=true\nbackoffice=true\napi=true\ndeployment=true'
none=$'frontoffice=false\nbackoffice=false\napi=false\ndeployment=false'

assert_scope "$frontoffice_only" apps/frontoffice/app/page.tsx
assert_scope "$backoffice_only" apps/backoffice/src/App.tsx
assert_scope "$api_only" services/api/src/YSHeng.Api/Program.cs
assert_scope "$deployment_only" infra/caddy/Caddyfile
assert_scope "$both_web" package-lock.json
assert_scope "$both_web" apps/frontoffice/app/vehicles/MarketingDescription.tsx
assert_scope "$all" .github/workflows/ci.yml
assert_scope "$all" unknown/shared-config.json
assert_scope "$deployment_only" docs/DEPLOYMENT_RUNBOOK.md
assert_scope "$none" docs/API.md AGENTS.md
assert_scope "$none"

apphost_scope=$'frontoffice=false\nbackoffice=false\napi=true\ndeployment=true'
assert_scope "$apphost_scope" services/api/src/YSHeng.AppHost/Program.cs

echo "CI scope classification tests passed."
