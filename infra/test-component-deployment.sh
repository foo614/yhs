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
assert_scope backoffice,frontoffice apps/backoffice/src/App.tsx apps/frontoffice/app/page.tsx
assert_scope backoffice,api-worker apps/backoffice/src/App.tsx services/api/src/YSHeng.Api/Program.cs
assert_scope frontoffice,api-worker apps/frontoffice/app/page.tsx services/api/src/YSHeng.Api/Program.cs
assert_scope backoffice,frontoffice,api-worker apps/frontoffice/app/page.tsx services/api/src/YSHeng.Api/Program.cs apps/backoffice/src/App.tsx
assert_scope backoffice apps/backoffice/src/App.tsx docs/API.md codex-agent.md
assert_scope backoffice,frontoffice apps/frontoffice/app/vehicles/MarketingDescription.tsx
assert_scope backoffice,frontoffice apps/frontoffice/app/vehicles/marketing-markdown.ts
assert_scope full services/api/src/YSHeng.AppHost/Program.cs
assert_scope full infra/caddy/Caddyfile
assert_scope backoffice,frontoffice package-lock.json
assert_scope backoffice,frontoffice package.json
assert_scope none docs/API.md .codex/skills/ysheng-project/SKILL.md AGENTS.md
assert_scope full .github/workflows/ci.yml
assert_scope full unknown/file
assert_scope none

# Consume the complete diff even when an early path requires full deployment;
# otherwise pipefail can treat git diff's broken pipe as a deployment failure.
large_scope="$( { printf 'infra/caddy/Caddyfile\n'; for ((i=0; i<2000; i++)); do printf 'apps/backoffice/src/file%s.ts\n' "$i"; done; } | bash "$classifier")"
[[ "$large_scope" == full ]]

echo "Component deployment classification tests passed."

# Exercise the real rollout script without Docker, SSH, sudo, or production data.
test_root="$(mktemp -d)"
release="$test_root/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
mkdir -p "$test_root/bin" "$release/infra/ubuntu" "$release/infra/aspire-output" "$test_root/current/infra/ubuntu"
cleanup() {
  rm -f "$test_root/bin/docker" "$test_root/bin/sudo" "$test_root/log" "$test_root/env" "$test_root/deploy.sh"
  rm -f "$release/infra/ubuntu/validate-production-env.sh" "$release/infra/ubuntu/production-smoke.sh" "$release/infra/ubuntu/backup-postgres.sh"
  rm -f "$release/infra/aspire-output/docker-compose.yaml" "$release/infra/docker-compose.aspire.production.yml" "$test_root/current/infra/ubuntu/backup-postgres.sh"
  rmdir "$test_root/bin" "$release/infra/ubuntu" "$release/infra/aspire-output" "$release/infra" "$release" "$test_root/current/infra/ubuntu" "$test_root/current/infra" "$test_root/current" "$test_root"
}
trap cleanup EXIT
touch "$test_root/env" "$release/infra/aspire-output/docker-compose.yaml" "$release/infra/docker-compose.aspire.production.yml"
printf 'exit 0\n' > "$release/infra/ubuntu/validate-production-env.sh"
printf 'echo backup >> "$TEST_LOG"\n' > "$release/infra/ubuntu/backup-postgres.sh"
cat > "$release/infra/ubuntu/production-smoke.sh" <<'EOF'
echo "smoke $*" >> "$TEST_LOG"
[[ "${FAIL_SMOKE:-false}" != true ]]
EOF
cat > "$test_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$TEST_LOG"
case "$*" in
  *'ps -q postgres'|*'ps -q worker') echo container ;;
  'inspect '*) echo true ;;
esac
EOF
cat > "$test_root/bin/sudo" <<'EOF'
#!/usr/bin/env bash
echo "promote $*" >> "$TEST_LOG"
EOF
chmod +x "$test_root/bin/docker" "$test_root/bin/sudo"
export PATH="$test_root/bin:$PATH" TEST_LOG="$test_root/log"
# Relocate the production root and use a directory for current so this harness
# also runs under Git Bash on Windows without symlink privileges.
sed -e "s|APP_ROOT=\"/opt/ysheng\"|APP_ROOT=\"$test_root\"|" -e 's/\[\[ -L "\$APP_ROOT\/current" \]\]/[[ -d "$APP_ROOT\/current" ]]/' infra/ubuntu/deploy-production.sh > "$test_root/deploy.sh"
cp "$release/infra/ubuntu/backup-postgres.sh" "$test_root/current/infra/ubuntu/backup-postgres.sh"

run_deploy() {
  : > "$TEST_LOG"
  bash "$test_root/deploy.sh" --release-dir "$release" --env-file "$test_root/env" --components "$1" >/dev/null
}
for scope in backoffice frontoffice api-worker backoffice,frontoffice backoffice,api-worker frontoffice,api-worker backoffice,frontoffice,api-worker full none; do
  run_deploy "$scope"
  if [[ "$scope" == none ]]; then
    [[ ! -s "$TEST_LOG" ]]
    continue
  fi
  if [[ "$scope" == full ]]; then
    grep -q 'up -d --build --remove-orphans$' "$TEST_LOG"
  else
    expected_services="${scope//api-worker/api worker}"
    expected_services="${expected_services//,/ }"
    grep -q "up -d --build --no-deps $expected_services\$" "$TEST_LOG"
  fi
  if [[ "$scope" == full || ",$scope," == *,api-worker,* ]]; then
    grep -qx backup "$TEST_LOG"
  else
    ! grep -qx backup "$TEST_LOG"
  fi
  IFS=, read -r -a scopes <<< "$scope"
  for selected in "${scopes[@]}"; do
    grep -q -- "--components $selected\$" "$TEST_LOG"
  done
  tail -n 1 "$TEST_LOG" | grep -q '^promote '
done
if FAIL_SMOKE=true run_deploy backoffice,api-worker; then
  echo "Smoke failure must fail the release." >&2
  exit 1
fi
! grep -q '^promote ' "$TEST_LOG"
if run_deploy 'backoffice,invalid' 2>/dev/null; then
  echo "Invalid component must fail before rollout." >&2
  exit 1
fi
[[ ! -s "$TEST_LOG" ]]
echo "Component rollout and failed-smoke promotion tests passed."
