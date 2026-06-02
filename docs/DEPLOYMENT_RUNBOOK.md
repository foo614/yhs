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

If it reports `Docker Desktop service com.docker.service is Stopped`, start Docker Desktop with the Linux engine enabled, or start the Docker Desktop Service from an elevated shell, then rerun the preflight.

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

The preflight checks Dockerfiles, Compose service wiring, the Docker engine, env validation, Compose config, and host port conflicts. It fails before build/start when service wiring or env values are unsafe.

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

## Current Local Blocker

On this Windows machine, Docker Compose runtime proof is still blocked by Docker Desktop service state:

```text
Docker Desktop service com.docker.service is Stopped.
```

Code-side Dockerfile and Compose contracts pass before this blocker. Once the Docker service/Linux engine is running, rerun:

```powershell
.\infra\docker-preflight.ps1
docker compose -f infra\docker-compose.yml build
docker compose -f infra\docker-compose.yml up -d
.\infra\smoke-test.ps1
```
