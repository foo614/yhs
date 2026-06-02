# YS Heng Deployment Runbook

This runbook is the operator checklist for proving and deploying the Docker VPS stack.

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
