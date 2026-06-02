---
name: ysheng-api
description: Work on the YS Heng .NET 10 backend API. Use for Minimal API endpoints, EF Core domain models, PostgreSQL persistence, ASP.NET Identity auth, BackOffice or Finance policies, uploads, audit logging, reminder worker behavior, dashboard metrics, business rules, and backend tests.
---

# YS Heng API

## Key files

- Solution: `services/api/YSHeng.sln`
- API project: `services/api/src/YSHeng.Api/YSHeng.Api.csproj`
- Entrypoint and endpoints: `services/api/src/YSHeng.Api/Program.cs`
- Domain records and enums: `services/api/src/YSHeng.Api/Domain/Models.cs`
- DbContext, users, and seed data: `services/api/src/YSHeng.Api/Data/`
- Business rules and DTOs: `services/api/src/YSHeng.Api/Features/BusinessRules.cs`
- Reminder worker: `services/api/src/YSHeng.Api/Features/ReminderWorker.cs`
- Tests: `services/api/tests/YSHeng.Api.Tests/BusinessRulesTests.cs`

## Architecture

- Use .NET 10 Minimal APIs.
- Put pure business logic in `Features/BusinessRules.cs`.
- Keep persisted types as records in `Domain/Models.cs`.
- Keep enum spellings aligned with TypeScript client unions.
- Use EF Core with PostgreSQL through `AppDbContext`.
- Use ASP.NET Identity cookie auth. `/api/auth/*` hosts Identity endpoints plus logout and `me`.

## Endpoint rules

- Public vehicle inventory and lead capture live under `/api/public/*` and must remain unauthenticated.
- Back-office endpoints are grouped under `/api` and protected by `BackOffice`.
- Payments and finance endpoints require `Finance`.
- Mutations must write audit records with the authenticated staff actor.
- Validate route IDs against body IDs on PUT endpoints.
- Prefer structured error objects with `message` or `errors[]`.

## Business rules to preserve

- Public inventory includes only `IsPublic` and `Available` vehicles.
- Vehicle photos are limited to 5 MB.
- Documents are limited to 10 MB.
- Public photos use the latest uploaded thumbnail, falling back to full content when appropriate.
- Supplier invoices must link to an existing vehicle and be unique by supplier plus invoice number.
- Loan completeness requires status receipt, VOC, and loan document.
- Delivery release requires readiness status plus all required checklist and document conditions.
- Dashboard metrics aggregate stock, pending loan, outstanding payment, settlement due, repair cost, estimated and total profit, reminders, and vehicle aging.

## Verification

Run from `services/api` when backend validation is requested:

```powershell
dotnet test YSHeng.sln
```

For endpoint, persistence, deployment, or cross-stack changes, also run Docker smoke verification from the workspace root when Docker is available:

```powershell
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1
```
