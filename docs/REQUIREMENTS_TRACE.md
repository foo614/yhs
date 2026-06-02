# YS Heng MVP Requirements Trace

This trace maps the requested YS Heng front-office/back-office/API MVP to current workspace evidence. The original Word documents are cross-checked in `docs/SOURCE_REQUIREMENTS_CROSSCHECK.md`, and the Google Stitch visual reference status is tracked in `docs/STITCH_VISUAL_REFERENCE.md`. This file is a handoff aid, not a replacement for running verification.

## Status Legend

- Implemented: code and documentation exist in the workspace.
- Verified: covered by tests, production build, browser check, or smoke script.
- Extension point: intentionally scoped outside MVP but represented in data model, UI, or docs.
- Blocked externally: code exists, but final proof depends on unavailable local infrastructure.

## Platform Shape

| Requirement | Status | Evidence |
| --- | --- | --- |
| React public front office | Implemented, verified | `apps/frontoffice`; Next.js app routes for home, inventory, vehicle detail, contact; `npm --workspace apps/frontoffice run build`; browser-verified standalone production server. |
| React back office with Ant Design Pro style | Implemented, verified | `apps/backoffice`; ProLayout/ProCard Ant Design operations portal; Vite build with chunk splitting; browser-verified production preview. |
| Google Stitch visual reference | Handoff documented, exact matching pending exported assets | `docs/STITCH_VISUAL_REFERENCE.md`; current browser inspection reaches `Stitch - Projects` but exposes only an empty `APPCOMPANION-ROOT` shell, so pixel-level Stitch fidelity cannot be verified until screenshots or export assets are provided. |
| .NET 10 API | Implemented, verified | `services/api/src/YSHeng.Api`; `global.json` pins .NET `10.0.100`; `dotnet test services\api\YSHeng.sln` passes. |
| PostgreSQL persistence | Implemented, verified locally | EF Core/Npgsql `AppDbContext`; PostgreSQL 17 clean local smoke runner; `local-clean-smoke.ps1` verifies DB-backed API readiness and workflows. |
| Docker/VPS deployment shape | Implemented, externally blocked for final local proof | `infra/docker-compose.yml`, service Dockerfiles, production and local `.env` examples, deploy/backup/restore scripts, healthchecks, static Dockerfile and Compose contract tests, compose env validation tests, deployment script contract tests. Local Docker preflight currently reports `com.docker.service` stopped, so Docker Desktop/Linux engine is not responding. |
| GitHub CI verification | Implemented, pending remote run after push | `.github/workflows/ci.yml` runs web type-checks/tests/builds, .NET 10 API tests, and Docker-independent deployment contract checks on pushes and pull requests. |
| Background worker/reminders | Implemented, verified locally | Worker container/service path in Compose; `ReminderWorker`; smoke checks reminder behavior across loan, delivery, payment, spend, debt recovery, and voucher flows. |

## Public Front Office

| Requirement | Status | Evidence |
| --- | --- | --- |
| Available vehicle inventory | Implemented, verified | `GET /api/public/vehicles`; front-office inventory page; smoke checks public inventory and filtered inventory. |
| Vehicle detail pages | Implemented, verified | `GET /api/public/vehicles/{id}`; `/vehicles/[id]`; smoke and browser checks for seeded vehicle detail. |
| Public lead/enquiry capture | Implemented, verified | `POST /api/public/leads`; lead form validation and i18n errors; smoke checks valid and invalid public lead creation. |
| Hide sold/non-public/internal data | Implemented, verified | Public DTO and front-office filtering strip internal purchase/refurbishment/commission fields; smoke checks public DTO does not expose internal values. |
| Vehicle photos/thumbnails | Implemented, verified | Public photo endpoint returns latest thumbnail/photo; upload/download smoke checks; UI fallback for missing photos. |
| English/Chinese public UI | Implemented, verified | `apps/frontoffice/app/i18n.ts`; language switch; smoke checks Chinese home, inventory, detail; browser check for Chinese detail lead form. |

## Back Office Modules

| Module | Status | Evidence |
| --- | --- | --- |
| Dashboard | Implemented, verified | Summary metrics including Total Profit, aging buckets, reminder inbox filters; backend tests and smoke checks. |
| Vehicles/intake | Implemented, verified | Vehicle CRUD, customer/owner links, purchase invoice tracking, duplicate plate validation, upload metadata. |
| Repairs/refurbishment | Implemented, verified | Repair jobs, repair parts, supplier invoices, duplicate/wrong-plate validation, repair document uploads. |
| Loan workflow | Implemented, verified | Loan CRUD, LOU status rules, document completeness check, 3-day reminders, loan-owned uploads. |
| Delivery workflow | Implemented, verified | Scheduling, PIC, inspection booking/report, handover refs, preparation checklist, release readiness, 2-day notice. |
| Finance/payment tracking | Implemented, verified | Payments, reconciliation prerequisites, settlements, daily spend, broker commissions/CP58 state, debt recovery, payment vouchers, finance document uploads. |
| Leads triage | Implemented, verified | Public enquiries appear in back office, lead/customer linking, status/customer-link filters, duplicate phone reuse. |
| Audit log | Implemented, verified | Authenticated mutations write staff actor; Boss/Admin audit log filters by actor/action/entity. |
| Admin users/roles | Implemented, verified | Staff creation, role update, display-name update, password reset, enable/disable, validation, role enforcement. |
| HR/Salary | Extension point, role-scoped | HR route and role restrictions exist; salary, leave, attendance, MC, pay slip remain planned extension scope. |

## API And Security

| Requirement | Status | Evidence |
| --- | --- | --- |
| ASP.NET Identity auth | Implemented, verified | Cookie login/logout/me endpoints; staff login panel; smoke checks admin and department users. |
| Role/policy authorization | Implemented, verified | Policies in `Program.cs`; smoke checks Sales/Finance/HR restrictions and allowed access. |
| Public unauthenticated routes | Implemented, verified | Public routes under `/api/public/*`; smoke checks public inventory and lead creation without staff auth. |
| Finance policy | Implemented, verified | Finance endpoints require Finance; smoke checks Sales blocked from finance and Finance can access payments. |
| Structured validation errors | Implemented, verified | Business rules return validation codes/messages; UI surfaces backend validation; tests and smoke cover many invalid inputs. |
| Route/body id mismatch validation | Implemented, verified | PUT endpoints return structured mismatch messages; smoke/test coverage. |
| Credentialed CORS for back office | Implemented, verified | API `AllowedOrigins` configuration allows the front/back office origins with credentials; stack smoke checks the back-office preflight headers against `/api/auth/me`. |
| Defensive API response headers | Implemented, verified | `SecurityHeaders.Apply` adds content-type sniffing, framing, referrer, and permissions-policy headers; backend tests and stack smoke cover the configured values. |
| API reference | Implemented, guarded | `docs/API.md`; `ApiDocumentationTests` verifies documented paths match mapped minimal API routes. |

## File Handling

| Requirement | Status | Evidence |
| --- | --- | --- |
| PostgreSQL blob storage | Implemented, verified | `VehiclePhoto` and `DocumentBlob` bytea columns; smoke upload/download checks. |
| Metadata/checksum/uploader/category | Implemented, verified | API stores and returns file metadata; smoke checks checksum/uploader metadata. |
| Thumbnail generation | Implemented, verified | SkiaSharp thumbnail creation and public photo selection; public listing uses photo endpoint. |
| Upload size limits | Implemented, verified | 5 MB photos, 10 MB documents; invalid upload smoke checks. |
| Category-aware authorization | Implemented, verified | Upload policy maps categories to module roles; smoke checks finance/sales category restrictions. |

## Automation And Extension Boundaries

| Requirement | Status | Evidence |
| --- | --- | --- |
| Rules-based reminders | Implemented, verified | Reminder worker and dashboard reminder inbox; smoke checks loan, delivery, payment, spend, debt, voucher reminders. |
| Workflow validations/status changes | Implemented, verified | Loan moves vehicles to LoanProcessing/private; reconciled/corrected payments update sold/loan-processing state; smoke checks automation. |
| Audit trails | Implemented, verified | Mutation audit records with authenticated staff email; public lead audit actor. |
| OCR/AI/WhatsApp/AutoCount | Extension point | AutoCount key-in is tracked manually; WhatsApp/OCR/AI remain explicitly outside MVP and documented as extension points. |
| Salary/pay slip/CP58 generation | Extension point | HR/Salary and CP58 state are represented without generating full statutory forms. |

## Verification Evidence

Current primary verification command:

```powershell
.\infra\verify-local.ps1
```

This runs web type-checking, front-office tests, back-office tests, backend tests, Dockerfile contract tests, Docker Compose contract tests, Compose environment validation tests, deployment script contract tests, source requirements crosscheck tests, Stitch visual reference handoff tests, production web builds, and the clean local PostgreSQL/API/front/back smoke stack.

Recent verified counts:

- Front-office tests: 20 passed.
- Back-office tests: 101 passed.
- Backend tests: 97 passed.
- Dockerfile contract tests: passed.
- Docker Compose contract tests: passed.
- Compose environment validation tests: passed.
- Deployment script contract tests: passed.
- Source requirements crosscheck tests: passed.
- Stitch visual reference handoff tests: passed.
- Clean local stack smoke: passed end to end.
- Back-office production browser check: passed with no console errors.
- Front-office standalone production browser check: passed with no console errors.

## Remaining Completion Caveat

The codebase includes Dockerfiles, Compose services, healthchecks, preflight, smoke, deploy, backup, and restore scripts. However, final Docker Compose proof on this machine is blocked because `infra/docker-preflight.ps1` reports that the Windows Docker Desktop service is stopped:

```text
Docker Desktop service com.docker.service is Stopped.
```

Once Docker Desktop/Linux engine is running, use:

```powershell
.\infra\docker-preflight.ps1
docker compose -f infra\docker-compose.yml build
docker compose -f infra\docker-compose.yml up -d
.\infra\smoke-test.ps1
```
