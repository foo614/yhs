# YS Heng Deployment Runbook

This runbook is the operator checklist for proving and deploying the Docker VPS stack.

## Shinjiru Ubuntu CI/CD (Production)

The production path deploys a verified `main` commit to an Ubuntu VPS through GitHub Actions. It keeps PostgreSQL, API, front office, and back office host ports on `127.0.0.1`; only Caddy exposes ports 80 and 443. Caddy obtains and renews the TLS certificates after the DNS records resolve to the VPS.

Before the first deployment:

1. Create an Ubuntu 22.04 or 24.04 Shinjiru VPS and a dedicated Linux deployment user with SSH-key login. The user must be able to run `sudo -n` for the first bootstrap. Docker group access is effectively privileged access, so restrict this SSH key and protect the `main` branch.
2. Point the DNS A records for the front office and back office domains to the VPS public IPv4 address. The API shares the back office hostname under `/api/*` (and `/health*` for readiness), so it does not need a separate API DNS record. Add matching AAAA records only when IPv6 is configured and reachable. Ensure Shinjiru permits inbound TCP 80 and 443.
3. In GitHub, create the `production` environment. Configure required reviewers before adding secrets so production deployments are explicitly approved.
4. Add these `production` environment secrets:
   - `SHIJIRU_HOST`: the VPS hostname or IP address.
   - `SHIJIRU_SSH_PORT`: SSH port, normally `22`.
   - `SHIJIRU_DEPLOY_USER`: dedicated Linux deployment user.
   - `SHIJIRU_SSH_PRIVATE_KEY`: private key for that user.
   - `SHIJIRU_KNOWN_HOSTS`: the exact known-hosts line obtained out-of-band for the configured host and port. Do not use `StrictHostKeyChecking=no` or accept a host key during deployment.
   - `PRODUCTION_ENV_FILE`: the complete production environment file based on `infra/compose.env.example`, with real secrets and DNS names.

`PRODUCTION_ENV_FILE` must make the URL and hostname pairs identical. With shared API/back-office routing, for example, use `PUBLIC_API_BASE_URL=https://portal.company.my`, `API_DOMAIN=portal.company.my`, and `BACKOFFICE_DOMAIN=portal.company.my`; Caddy sends `/api/*` and `/health*` to the API and other paths to the back office. The PowerShell and Ubuntu production validators reject default passwords, example/localhost domains, mismatched hostnames, non-HTTPS URLs, and trailing slashes before the stack starts.

After the three CI jobs succeed on `main`, the `Deploy production (Shinjiru Ubuntu)` job uploads that verified commit, installs Docker Engine/Compose from Docker's signed Ubuntu repository if absent, enables UFW for the configured SSH port plus 80/443, configures the daily backup timer, builds the Compose stack, obtains TLS through Caddy, and runs read-only HTTPS smoke checks. `workflow_dispatch` supports an approved retry from `main`; pull requests never receive production secrets.

The bootstrap intentionally does not alter `sshd_config`, disable password login, or add offsite backup storage. Confirm a separate break-glass SSH session first, then apply SSH hardening under an approved server-access change. Copy `/var/lib/ysheng-backups` to encrypted offsite storage and test a restore before treating backups as recoverable.

## Prerequisites

- A VPS or local machine with Docker Compose and a responding Linux Docker engine.
- PowerShell for the checked-in `infra/*.ps1` scripts.
- Public URLs or IP-based URLs for:
  - `PUBLIC_API_BASE_URL`
  - `FRONTOFFICE_ORIGIN`
  - `BACKOFFICE_ORIGIN`
- Free host ports for PostgreSQL, API, front office, and back office, or explicit port overrides.

On Windows, run:

```powershell
.\infra\docker-preflight.ps1
```

If Windows reports `Docker Desktop service com.docker.service is Stopped`, the preflight continues and probes the Linux engine directly. Treat the Docker server version check as the readiness proof; if the server probe fails or times out, start Docker Desktop with the Linux engine enabled and rerun the preflight.

## Environment File

Create a production env file from the template:

```powershell
Copy-Item infra\compose.env.example .env
notepad .env
.\infra\validate-compose-env.ps1
```

Before production deploy, replace:

- `POSTGRES_PASSWORD`
- `SEED_ADMIN_PASSWORD`
- `PUBLIC_API_BASE_URL`
- `FRONTOFFICE_ORIGIN`
- `BACKOFFICE_ORIGIN`
- `API_DOMAIN` (the shared back-office/API hostname)
- `FRONTOFFICE_DOMAIN`
- `BACKOFFICE_DOMAIN`
- `TLS_EMAIL`

Validation rejects placeholder passwords, `example.com`, localhost public URLs, loopback public URLs, and trailing slashes on public URLs.

For local Docker Desktop smoke testing only:

```powershell
Copy-Item infra\compose.env.local.example .env
.\infra\docker-preflight.ps1 -AllowExampleEnvValues
```

## Preflight

Run preflight before every deploy:

```powershell
.\infra\docker-preflight.ps1
```

The preflight checks Dockerfiles, Compose service wiring, the Docker engine, env validation, Compose config, and host port conflicts. It fails before build/start when service wiring, env values, or Docker server readiness are unsafe.

## First Deploy

After `.env` is ready:

```powershell
.\infra\deploy-vps.ps1
```

The deploy helper:

- validates `.env`
- checks the Compose contract
- runs Docker preflight
- builds and starts the Compose stack
- waits for API readiness, front office, and back office URLs
- runs `infra/smoke-test.ps1`

Use a custom env file with:

```powershell
.\infra\deploy-vps.ps1 -EnvPath .env.production
```

## Smoke Proof

The deployment is not proven until this succeeds against the deployed stack:

```powershell
.\infra\smoke-test.ps1 `
  -ApiBaseUrl $env:PUBLIC_API_BASE_URL `
  -FrontOfficeUrl $env:FRONTOFFICE_ORIGIN `
  -BackOfficeUrl $env:BACKOFFICE_ORIGIN
```

The smoke suite verifies API health/readiness, defensive headers, credentialed CORS, public inventory and leads, back-office login, role enforcement, workflows, upload/download blobs, dashboard reminders, audit logs, and status automation.

For the Shinjiru CI/CD path, the deployment job uses the smaller read-only `infra/ubuntu/production-smoke.sh` because the full PowerShell smoke suite creates workflow data and is not suitable for automatic production runs.

## Existing Database Deploy

For an existing live database:

```powershell
.\infra\deploy-vps.ps1 -BackupBeforeDeploy
```

The backup helper uses the selected `-EnvPath`, reads `POSTGRES_DB` and `POSTGRES_USER` from that file unless explicitly overridden, creates a custom-format PostgreSQL dump, copies it out of the container, and verifies the dump is non-empty.

## Backup And Restore

Create a backup:

```powershell
.\infra\backup-postgres.ps1
```

Restore is destructive and requires explicit confirmation:

```powershell
.\infra\restore-postgres.ps1 -BackupPath backups\ysheng-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

Use `-EnvPath` for non-default env files:

```powershell
.\infra\backup-postgres.ps1 -EnvPath .env.production
.\infra\restore-postgres.ps1 -EnvPath .env.production -BackupPath backups\ysheng-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

## Post-Deploy Hardening

After the first successful smoke proof:

- Change the seeded admin password.
- Set `SEED_DATA_ENABLED=false` if future restarts should skip seed checks.
- Schedule regular `infra/backup-postgres.ps1` backups because MVP photos and documents are PostgreSQL blobs.
- On Shinjiru, verify `systemctl list-timers ysheng-backup.timer` and copy `/var/lib/ysheng-backups` to encrypted offsite storage with a defined retention policy.
- Keep `PUBLIC_API_BASE_URL`, `FRONTOFFICE_ORIGIN`, and `BACKOFFICE_ORIGIN` aligned so cookie-auth CORS remains valid.
- Keep the latest successful GitHub Actions CI run attached to the deployed commit.

## Current Local Proof

Docker Desktop was updated and the clean Compose proof now passes on this Windows machine. Because an older local Compose volume had a stale schema, the proof used a separate project name and alternate ports:

```powershell
$env:POSTGRES_PORT="55532"
$env:API_PORT="5200"
$env:FRONTOFFICE_PORT="3200"
$env:BACKOFFICE_PORT="3201"
$env:PUBLIC_API_BASE_URL="http://localhost:5200"
$env:FRONTOFFICE_ORIGIN="http://localhost:3200"
$env:BACKOFFICE_ORIGIN="http://localhost:3201"
docker compose -p yshengproof -f infra/docker-compose.yml build
docker compose -p yshengproof -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1 -ApiBaseUrl http://localhost:5200 -FrontOfficeUrl http://localhost:3200 -BackOfficeUrl http://localhost:3201
```

The smoke suite completed with `YS Heng stack smoke test passed.` Use a fresh Compose project or reset the local volume when validating schema changes against Docker; stale volumes can keep old tables around.

For the normal default-port path on a clean host, use:

```powershell
.\infra\docker-preflight.ps1
docker compose -f infra\docker-compose.yml build
docker compose -f infra\docker-compose.yml up -d
.\infra\smoke-test.ps1
```
