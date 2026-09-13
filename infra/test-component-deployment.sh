#!/usr/bin/env bash
set -euo pipefail

classifier="infra/ubuntu/classify-production-components.sh"

assert_scope() {
  local expected="$1"
  shift
  local actual
  actual="$(printf '%s\n' "$@" | bash "$classifier")"
  [[ "$actual" == "$expected" ]] || {
    echo "Expected deployment scope '$expected' but got '$actual' for: $*" >&2
    exit 1
  }
}

assert_scope backoffice apps/backoffice/src/App.tsx apps/backoffice/src/styles.css
assert_scope frontoffice apps/frontoffice/app/page.tsx
assert_scope api-worker services/api/src/YSHeng.Api/Program.cs services/api/tests/YSHeng.Api.Tests/BusinessRulesTests.cs
assert_scope full apps/backoffice/src/App.tsx apps/frontoffice/app/page.tsx
assert_scope full apps/backoffice/src/App.tsx services/api/src/YSHeng.Api/Program.cs
assert_scope full infra/caddy/Caddyfile
assert_scope full package-lock.json
assert_scope full docs/API.md
assert_scope full

echo "Component deployment classification tests passed."
