# YS Heng MVP Platform

![CI](https://github.com/foo614/yhs/actions/workflows/ci.yml/badge.svg)

YS Heng MVP is a used-car digital platform monorepo with a public vehicle website, an internal operations portal, a .NET 10 API, PostgreSQL persistence, and Docker/VPS deployment scripts.

## Applications

- `apps/frontoffice`: Next.js public site for available vehicle inventory, bilingual English/Chinese browsing, vehicle details, and enquiry capture.
- `apps/backoffice`: React/Vite Ant Design Pro-style portal for dashboard, vehicles, repairs, loans, delivery, finance, leads, audit logs, HR extension scope, and admin users/roles.
- `services/api`: .NET 10 minimal API with EF Core, PostgreSQL, ASP.NET Identity cookie auth, role policies, upload blobs, dashboard metrics, workflow rules, reminders, and audit logging.
- `infra`: Dockerfiles, Docker Compose, smoke tests, VPS deploy helper, Dockerfile/Compose/deployment script contract checks, environment validation, and PostgreSQL backup/restore scripts.

Detailed implementation notes live in `docs/IMPLEMENTATION.md`; endpoint and role-policy details live in `docs/API.md`; source-document workflow mapping lives in `docs/SOURCE_REQUIREMENTS_CROSSCHECK.md`; Stitch visual-reference status lives in `docs/STITCH_VISUAL_REFERENCE.md`; requirement coverage and verification status live in `docs/REQUIREMENTS_TRACE.md`.

## Requirements

- Node.js compatible with the checked-in package lock.
- .NET SDK `10.0.100` or compatible latest feature roll-forward, as configured in `global.json`.
- PostgreSQL 17 tooling for the clean local smoke runner, or Docker Desktop/Linux engine for Compose.
- Windows PowerShell for the included `infra/*.ps1` scripts.

## Local URLs

- Front office: `http://localhost:3000`
- Back office: `http://localhost:3001`
- API: `http://localhost:5000`

Default seeded admin for local/demo use:

- Email: `admin@ysheng.local`
- Password: `ChangeMe123!`

Change seeded credentials before production.

## Common Commands

Install JavaScript dependencies:

```powershell
npm install
```

Build both web apps:

```powershell
npm run build
```

Type-check both web apps:

```powershell
npm run lint
```

Run frontend tests:

```powershell
npm --workspace apps/frontoffice run test
npm --workspace apps/backoffice run test
```

Run backend tests:

```powershell
dotnet test services\api\YSHeng.sln
```

Run local development servers:

```powershell
npm run dev:frontoffice
npm run dev:backoffice
dotnet run --project services\api\src\YSHeng.Api\YSHeng.Api.csproj
```

## Verification

Run the full local verification gate:

```powershell
.\infra\verify-local.ps1
```

This includes web type-checking, front/back tests, backend tests, static Dockerfile and Docker Compose contract checks, `.env` validation regression checks, deployment script contract checks, source requirements crosscheck tests, Stitch visual-reference handoff tests, production web builds, and the clean local smoke stack. Use `-SkipSmoke` for a faster code-only check, or `-SkipBuild` when a fresh production build is already available.

GitHub Actions CI runs the Docker-independent portions of that gate on every push and pull request: web type-checks/tests/builds, API tests, Dockerfile/Compose contract checks, env validation checks, deployment script checks, source-document crosscheck, and Stitch handoff checks. Docker Compose runtime smoke remains a deployment-machine proof because it needs a running Docker engine and PostgreSQL-backed containers.

When Docker is unavailable but local PostgreSQL tooling is installed, run the current code against a clean temporary stack:

```powershell
npm run build
.\infra\local-clean-smoke.ps1
```

This starts temporary PostgreSQL, API, front-office, and back-office processes on alternate ports, runs the stack smoke test, and stops the temporary services afterward.
Logs and temporary PostgreSQL data are written under the OS temp folder at `ysheng-local-clean-smoke`, keeping the repository root clean.

When Docker Desktop/Linux engine is available, run the deployment-shaped stack:

```powershell
.\infra\docker-preflight.ps1
docker compose -f infra\docker-compose.yml build
docker compose -f infra\docker-compose.yml up -d
.\infra\smoke-test.ps1
```

The preflight runs Dockerfile and Compose contract checks before probing Docker, so code-side deployment drift is reported even if Docker Desktop is not responding. On Windows, it fails fast when `com.docker.service` is stopped; when the Docker server probe times out, it also prints Docker Desktop, service, context, and WSL diagnostics to make the remaining environment issue easier to fix.

You can run the Docker-independent deployment checks separately:

```powershell
.\infra\test-compose-contract.ps1
.\infra\test-compose-env.ps1
.\infra\test-deployment-scripts.ps1
```

For a local Docker Desktop smoke run, you can create `.env` from the local example:

```powershell
Copy-Item infra\compose.env.local.example .env
.\infra\docker-preflight.ps1 -AllowExampleEnvValues
docker compose -f infra\docker-compose.yml --env-file .env up -d --build
.\infra\smoke-test.ps1
```

## VPS Deployment

Create a root `.env` from the example and change production secrets:

```powershell
Copy-Item infra\compose.env.example .env
notepad .env
.\infra\validate-compose-env.ps1
```

Normal validation rejects placeholder secrets, sample `example.com` domains, `localhost`/loopback public URLs, and trailing slashes on public URL values. Use real VPS domains or public IP URLs for `PUBLIC_API_BASE_URL`, `FRONTOFFICE_ORIGIN`, and `BACKOFFICE_ORIGIN`.

Deploy with:

```powershell
.\infra\deploy-vps.ps1
```

The deploy helper validates `.env`, checks the Compose contract, runs Docker preflight, starts the Compose stack, waits for API/front/back URLs to become reachable, and then runs the smoke test unless `-SkipSmoke` is provided. If you pass a custom `-EnvPath`, the same file is used for preflight, optional backup, Compose startup, and smoke URLs.

For an existing live database, use:

```powershell
.\infra\deploy-vps.ps1 -BackupBeforeDeploy
```

Because the MVP stores uploaded photos and documents as PostgreSQL blobs, keep database backups in the operating routine:

```powershell
.\infra\backup-postgres.ps1
.\infra\restore-postgres.ps1 -BackupPath backups\ysheng-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

Pass `-EnvPath` to backup or restore when operating against a non-default VPS env file; the helpers read `POSTGRES_DB` and `POSTGRES_USER` from that file unless explicitly overridden.

## Environment Notes

- Public API endpoints remain under `/api/public/*`.
- Back-office endpoints are protected by ASP.NET Identity roles and policies.
- Finance endpoints require the Finance policy.
- Vehicle photos are limited to 5 MB; document uploads are limited to 10 MB.
- Docker verification requires Docker Desktop with the Linux engine responding. If `docker-preflight.ps1` reports `com.docker.service` is stopped or times out while checking the Docker server version, start or repair Docker Desktop before running Compose.
