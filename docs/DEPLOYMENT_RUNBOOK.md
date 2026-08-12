# YS Heng Deployment Runbook

This runbook is the operator checklist for proving and deploying the Docker VPS stack.

## Shinjiru Ubuntu CI/CD (Production)

The production path publishes the Aspire AppHost into a Docker Compose artifact during CI, then deploys that verified artifact and the matching source commit to an Ubuntu VPS through GitHub Actions. It preserves the `postgres`, `api`, `worker`, `frontoffice`, and `backoffice` service names, PostgreSQL 17, and the `postgres_data` volume. The Aspire dashboard is reachable only through Caddy at `https://<BACKOFFICE_DOMAIN>/ops`; application, database, OTLP, and dashboard services have no public host ports. Caddy obtains and renews TLS certificates after DNS records resolve to the VPS.

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

`PRODUCTION_ENV_FILE` must make the URL and hostname pairs identical. With shared API/back-office routing, for example, use `PUBLIC_API_BASE_URL=https://portal.company.my`, `API_DOMAIN=portal.company.my`, and `BACKOFFICE_DOMAIN=portal.company.my`; Caddy sends `/api/*` and `/health*` to the API, `/ops/*` to the internal Aspire dashboard adapter, and other paths to the back office. The adapter keeps the dashboard's redirects, HTML base URL, and authentication cookie scoped to `/ops/`. The PowerShell and Ubuntu production validators reject default passwords, example/localhost domains, mismatched hostnames, non-HTTPS URLs, trailing slashes, placeholder dashboard credentials, and short dashboard credentials before the stack starts.

After the CI checks succeed on `main`, production remains paused. To deploy, open **Actions → CI → Run workflow**, select `main`, set `deploy_production` to true, and complete the `production`-environment approval. The job uploads the verified source commit plus its Aspire Compose artifact, installs Docker Engine/Compose from Docker's signed Ubuntu repository if absent, enables UFW for the configured SSH port plus 80/443, builds the images locally on the VPS, obtains TLS through Caddy, and runs read-only HTTPS smoke checks. Pull requests never receive production secrets.

The server never needs the Aspire CLI. CI runs the pinned CLI, writes `infra/aspire-output/docker-compose.yaml`, verifies that artifact, and transfers it with the release. The server combines it with `infra/docker-compose.aspire.production.yml`, which restores the production health checks, Caddy, restart policies, and Dockerfile builds. Direct `aspire deploy` is not part of this production path while that deployment command remains preview. Do not edit the generated output; rerun `./infra/publish-aspire-compose.ps1` after removing its existing output directory explicitly.

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
- `ASPIRE_DASHBOARD_BROWSER_TOKEN`
- `ASPIRE_DASHBOARD_OTLP_API_KEY`
- `PUBLIC_API_BASE_URL`
- `FRONTOFFICE_ORIGIN`
- `BACKOFFICE_ORIGIN`
- `API_DOMAIN` (the shared back-office/API hostname)
- `FRONTOFFICE_DOMAIN`
- `BACKOFFICE_DOMAIN`
- `TLS_EMAIL`
- `GOOGLE_DOCUMENT_AI_PROJECT_ID`
- `GOOGLE_DOCUMENT_AI_DEFAULT_PROCESSOR_ID`
- `GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH`

Generate the two dashboard values independently on a secure workstation with `openssl rand -hex 32`. The browser token protects the `/ops` user interface; the OTLP key authenticates only telemetry from the API and worker. Do not reuse either value, put it in a URL, or paste it into tickets, chat, source control, or CI logs.

Validation rejects placeholder passwords, placeholder dashboard credentials, `example.com`, localhost public URLs, loopback public URLs, and trailing slashes on public URLs.

## Google Document AI OCR

Create an Enterprise Document OCR processor in the configured `GOOGLE_DOCUMENT_AI_LOCATION` (the template uses `asia-southeast1`). Optional Invoice Parser and Expense Parser processor IDs improve structured extraction for invoices and receipts. Use a dedicated service account with only the Document AI API User role needed to process these processors.

Place its Application Default Credentials file at `GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH` on the VPS, outside the release directory, owned by root and readable only by the deployment/runtime account. Do not place the JSON in `PRODUCTION_ENV_FILE`, GitHub logs, tickets, or source control. The production Compose override mounts it read-only at `/run/secrets/google-document-ai.json`.

IC and finance uploads contain personal or financial data and are sent to Google Cloud for processing. Confirm the selected region, retention configuration, customer notice/consent, and organizational privacy requirements before enabling production OCR. Keep the existing staff review step enabled; OCR output is advisory draft data rather than an automatic record update.

## Aspire Operations Dashboard

After a successful production deployment, open `https://<BACKOFFICE_DOMAIN>/ops/`. The dashboard displays sensitive runtime telemetry, so it is separate from the back-office login. At `/ops/login`, enter `ASPIRE_DASHBOARD_BROWSER_TOKEN` from the protected production secret. Do not use the optional `?t=` login URL because it can leak into browser history, logs, and support messages.

The dashboard image is pinned to the x86_64 digest used by the Ubuntu VPS. It has no direct host port, accepts OTLP only with the separate API key, and disables its Telemetry HTTP API. An internal Nginx adapter is necessary because the dashboard is otherwise root-path-only; it has no host port and only rewrites dashboard paths and cookies to `/ops/`. Automatic production smoke checks intentionally do not authenticate to `/ops`, so they never read or echo either dashboard secret. The dashboard prints a tokenized login URL in its container startup log, so do not paste `docker logs production-dashboard` into tickets or chat. Put the future VPN or identity-aware proxy in front of `/ops` as an additional internal-access control; retain the dashboard token after that change.

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
