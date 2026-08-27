# YS Heng Architecture

## Runtime shape

YS Heng is a monorepo with two web applications, one .NET API, a reminder worker, and PostgreSQL persistence.

```text
Customer browser ──> Caddy ──> frontoffice ──> public API routes
Staff browser ─────> Caddy ──> backoffice ──> protected API routes
                                              │
                                              ├── PostgreSQL
                                              ├── reminder worker
                                              └── uploaded file blobs
```

## Repository layout

| Path | Responsibility |
| --- | --- |
| `apps/frontoffice` | Public Next.js website, vehicle catalogue, SEO, bilingual content, and lead capture |
| `apps/backoffice` | Internal React operations portal using Ant Design and role-aware workflows |
| `services/api` | .NET Minimal API, EF Core models, business rules, authentication, authorization, and background worker |
| `infra` | Dockerfiles, Compose files, Caddy, deployment scripts, backups, environment validation, and smoke tests |
| `docs` | API contracts, requirements trace, implementation notes, deployment runbook, and operational reviews |

## Request boundaries

- Public endpoints live under `/api/public/*`.
- Back-office endpoints live under `/api` and require the appropriate policy.
- Finance endpoints require the Finance policy.
- Public vehicle responses contain only vehicles that are approved, available, and intended for public display.
- Uploaded photos and documents are stored with metadata and protected by workflow-specific access rules.

## Production path

1. GitHub Actions runs web tests, API tests, and deployment contract checks.
2. The verified commit produces the Aspire Compose artifact used by deployment.
3. A manual workflow dispatch starts the production job.
4. GitHub environment approval gates the production deployment.
5. The deployment host runs Docker Compose behind Caddy and performs HTTPS smoke checks.

The authoritative operational procedure is [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).
