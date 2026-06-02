---
name: ysheng-project
description: Work in the YS Heng MVP monorepo. Use for repository orientation, local commands, repo layout, deployment shape, verification steps, Docker Compose, and cross-app changes.
---

# YS Heng Project

## Start here

- Treat the repository root as the workspace root.
- Read `AGENTS.md` and `codex-agent.md` before making project changes.
- Read `docs/IMPLEMENTATION.md` for the current implementation slice, local URLs, Docker notes, default admin, and deployment details.
- Ignore generated or installed directories unless the user asks otherwise: `node_modules`, `.next`, `dist`, `bin`, and `obj`.
- Do not rely on teammate-specific global `~/.codex` files for project behavior.

## Layout

- `apps/frontoffice`: public Next.js vehicle inventory and lead capture.
- `apps/backoffice`: Vite React operations portal using Ant Design and Pro Components.
- `services/api`: .NET 10 Minimal API, EF Core, PostgreSQL, ASP.NET Identity, uploads, audit log, worker, and business rules.
- `infra/docker-compose.yml`: local and VPS deployment shape for PostgreSQL, API, worker, front office, and back office.
- `docs`: API reference, implementation status, deployment runbook, requirements trace, and source requirement cross-checks.

## Local URLs

- Front office: `http://localhost:3000`
- Back office: `http://localhost:3001`
- API: `http://localhost:5000`

## Root commands

```powershell
npm install
npm run build
npm run lint
npm run dev:frontoffice
npm run dev:backoffice
```

## Docker verification

Use from the workspace root when Docker Desktop is available with the Linux engine:

```powershell
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1
```

If Docker fails because the Linux engine is unavailable, report that as an environment blocker rather than a code failure.

## Cross-cutting rules

- Preserve the API/frontend contract when changing domain models, DTOs, API paths, validation shapes, or enum names.
- Keep public endpoints unauthenticated under `/api/public/*`.
- Keep back-office endpoints under `/api` protected by the `BackOffice` policy unless intentionally public.
- Keep finance/payment operations behind the `Finance` policy.
- Update tests and docs when changing business rules, upload limits, dashboard metrics, auth behavior, API contracts, deployment behavior, or smoke-test expectations.
