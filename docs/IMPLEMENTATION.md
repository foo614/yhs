# YS Heng MVP Implementation

This workspace contains the first implementation slice for the YS Heng digital platform.

## Applications

- `apps/frontoffice`: public Next.js vehicle inventory and lead capture.
- `apps/backoffice`: Ant Design Pro-style operations portal for dashboard, vehicles, repair, loan, delivery, finance, leads, audit log, and admin roles.
- `services/api`: .NET 10 Web API with PostgreSQL, ASP.NET Identity, EF Core models, public endpoints, back-office endpoints, upload limits, and dashboard business rules.
- `infra/docker-compose.yml`: Docker VPS deployment shape for PostgreSQL, API, worker container, front office, and back office.
- `infra/test-dockerfiles.ps1`: static Dockerfile contract checks for .NET 10 images, React app build/runtime commands, ports, API health dependency tooling, and public API URL build arguments.
- `infra/test-compose-contract.ps1`: static Compose contract checks for required services, Dockerfile references, ports, healthchecks, API/worker environment wiring, and service dependencies when Docker Desktop is unavailable.
- `infra/test-compose-env.ps1`: regression checks for production `.env` validation, including required keys, placeholder secrets, public URL shape, local-only/example domains, trailing slashes, and local Docker example override behavior.
- `infra/test-deployment-scripts.ps1`: static deployment script checks for deploy ordering, smoke-test URL wiring, PostgreSQL backup custom-format dumps, restore confirmation, and temporary dump cleanup.
- `infra/test-deployment-runbook.ps1`: static deployment runbook check for VPS env setup, preflight, deploy, smoke proof, backup/restore, Docker Desktop service warning behavior, and clean local Compose proof instructions.
- `infra/test-requirements-trace.ps1`: static requirements trace check for the main MVP platform, workflow, API, file-handling, automation, verification, and Docker-blocker evidence.
- `.github/workflows/ci.yml`: GitHub Actions CI for web type-checks/tests/builds, .NET 10 API tests, and Docker-independent deployment contract checks on pushes and pull requests.
- `docs/SOURCE_REQUIREMENTS_CROSSCHECK.md`: source-document workflow mapping for the supplied YS Heng requirement Word documents, guarded by `infra/test-source-requirements-crosscheck.ps1`.
- `docs/STITCH_VISUAL_REFERENCE.md`: Google Stitch visual-reference access result and asset handoff, guarded by `infra/test-stitch-reference-handoff.ps1`.
- API endpoint, role-policy, upload-category, enum, and validation-shape reference is maintained in `docs/API.md`.
- Backend contract tests now verify that documented API paths, role-policy rows, document upload ownership, and enum values in `docs/API.md` match the minimal API route mappings, authorization setup, `DepartmentAccess` upload rules, and domain enums, so workflow/status/category/security contract drift is caught during `dotnet test`.
- Back-office contract tests also compare exported TypeScript workflow/status/upload-category unions in `apps/backoffice/src/api.ts` against the backend domain enums, with `VehiclePhoto` intentionally excluded from document-upload categories because photos use the separate thumbnailing endpoint.
- Back-office contract tests compare the `StaffRole` TypeScript union against `SeedData.Roles`, so Admin role assignment options stay aligned with the ASP.NET Identity roles seeded by the API.
- Front-office contract tests compare the public stock-owner and vehicle-status unions in `apps/frontoffice/app/vehicles/service.ts` against the backend domain enums, so public inventory filtering stays aligned when backend vehicle statuses evolve.
- Front-office and back-office contract tests also compare client API path literals against the backend minimal API route map, catching mistyped public or operations API URLs before browser smoke checks.
- The back-office Vite build splits React, Ant Design, Pro Components, and vendor dependencies into smaller chunks so the production portal build avoids oversized single-bundle warnings.
- Vehicle photo and document uploads are stored in PostgreSQL blobs with metadata for MIME type, category, checksum, linked entity, and authenticated uploader; vehicle photos also create cached JPEG thumbnails with SkiaSharp.
- ASP.NET multipart parsing allows a small request overhead above the 10 MB document payload limit, while endpoint validation still enforces 10 MB documents and the stricter 5 MB vehicle-photo limit before storing blobs.
- Document uploads reject the `VehiclePhoto` category so photos stay on the photo endpoint with thumbnail generation and the separate 5 MB image limit.
- Back-office vehicle intake shows uploaded website photo metadata, including uploader and checksum, next to document metadata and download/preview links.
- Public vehicle listings now request the latest uploaded vehicle thumbnail from `/api/public/vehicles/{id}/photo` and gracefully fall back to initials when no photo exists.
- Public vehicle detail pages now fetch `GET /api/public/vehicles/{id}` directly and return not-found for vehicles the public API rejects.
- Public vehicle detail pages now check the detail endpoint before loading inventory for related vehicles, avoiding list fetches for rejected/non-public vehicles.
- The API now applies defensive response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`) to reduce production browser exposure for the public and back-office API surface.
- The front-office standalone production server has been browser-verified for English home, Chinese inventory, and Chinese vehicle detail/lead form rendering.
- Public vehicle API responses now use a public DTO that excludes purchase price, charges, refurbishment, commission, and visibility internals.
- Front-office vehicle mapping now strips internal purchase/refurbishment/commission fields before data reaches listing/detail UI components.
- Front-office inventory now filters mapped and fallback vehicles to `Available` status before listing/detail UI receives public stock.
- Front-office search now carries homepage make, model, year, price, stock owner, and sort URL parameters into structured inventory filters, with make selection preserved separately from free-text model/plate search.
- The public front office now supports English and Chinese UI copy through a language switch on home, inventory, vehicle detail, contact, vehicle cards, footer, mobile navigation, and lead capture.
- Repair, loan, delivery, and finance screens now expose operational tables/forms instead of static workflow cards; repair jobs now load from the API, track Repair Part/Spare Part separately from What To Do, and can be marked checklist-done from the Repair screen.
- The back-office portal now shows a module command header with live workflow counters and current role tags above each operations module, improving scanability before staff enter dense tables and forms.
- Back-office row actions are standardized into one right-side action column; separate left-side Open/Details columns are avoided so tables scan consistently.
- Back-office create forms now submit vehicles, supplier invoices, repair jobs, loans, delivery schedules, and payment records to the .NET API when staff are logged in.
- Back-office API failures now surface the first structured backend validation error message from `errors[]`, including upload failures, instead of a generic HTTP status message.
- Finance payment records now track receipt number, invoice number, bank name, and bank follow-up date; reconciled payments require receipt and invoice references before saving.
- Finance payment records now track Boss Check, and final reconciliation is blocked until the boss verification step is marked checked.
- Finance payment records now track Prepare Document, Checklist Validation, Invoice Generated, and AutoCount Key In as manual Bank workflow checklist states; final reconciliation is blocked until all four are checked.
- Finance payment records now also capture customer invoice detail fields from the portal requirement docs: sales price, interest/additional charges, NCD amount, windscreen charges, and outstation delivery date.
- Finance payment validation rejects negative customer invoice detail amounts before they enter payment tracking.
- Finance payment records can now be edited from the Finance screen so staff can correct car plate, nett price, receipt/invoice references, bank follow-up metadata, customer invoice fields, and reconciliation checklist state without recreating the payment.
- Reconciled payment records reject duplicate receipt or payment invoice references with normalized spacing/case so finance cannot reuse final documents by accident.
- Unreconciled payment records with due bank follow-up dates appear in the dashboard reminder inbox.
- Unreconciled payment records in Pending, Approved, or Disbursed workflow states appear in the dashboard reminder inbox for Bank status follow-up.
- The background reminder worker now scans payment bank follow-up and payment status follow-up reminders alongside loan, settlement, delivery, daily spend, and debt recovery reminders.
- Finance now tracks Daily Spend items such as the monthly Electric Bill, validates amount/description/due date, and adds due unpaid items to the dashboard reminder inbox.
- Finance Daily Spend rows can now be edited from the Finance screen so staff can correct description, amount, due date, and paid/due state without recreating the expense.
- Finance now tracks broker commissions by car plate, validates broker name/amount/vehicle link, supports paid/reopen updates, tracks CP58 required/prepared follow-up state without generating CP58 forms, and dashboard profit uses detailed broker commission rows when present.
- Finance broker commission rows can now be edited from the Finance screen so staff can correct car plate, broker name, amount, paid state, and CP58 required/prepared flags without recreating the commission.
- Finance now tracks debt recovery balance cases by car plate and customer, validates balance/follow-up/customer links, and adds due open balances to the dashboard reminder inbox; WhatsApp balance reminders remain an extension point.
- Finance debt recovery cases can now be edited from the Finance screen so staff can correct car plate, customer, balance, follow-up date, status, and notes without recreating the case.
- Finance now tracks Payment Vouchers for outstation pickup allowances by car plate, including payee, purpose, issue date, approval, paid, and reopen states for salary/payment voucher follow-up.
- Finance Payment Voucher rows can now be edited from the Finance screen so staff can correct car plate, payee, amount, purpose, issue date, status, and notes without recreating the voucher.
- Open Pending or Approved Payment Vouchers now appear in the dashboard reminder inbox until marked Paid.
- Dashboard profit now subtracts outstation pickup allowance costs, using detailed Payment Voucher rows when present and falling back to the vehicle intake allowance amount for older records.
- Dashboard stock aging now includes 0-30, 31-60, and 61+ day buckets so Boss/Admin can see whether unsold inventory is becoming stale, while the existing over-60 count remains available as the headline aging metric.
- Dashboard reminder due dates are tagged as overdue, due today, or upcoming for faster Boss/Admin triage.
- Dashboard reminder inbox can be filtered by reminder type and due state so Boss/Admin can focus on overdue, due-today, or upcoming work.
- The dashboard reminder API also accepts `type` and `due` query filters; the back-office reminder controls call that filtered endpoint, and the smoke suite checks an overdue bank follow-up filter against the running stack.
- The Finance table disables one-click reconciliation until the payment has receipt and invoice references, matching the API validation rule.
- The Finance table also disables one-click reconciliation when the receipt or payment invoice reference is already used by another row.
- The Finance payment entry form warns before submitting a new reconciled payment with duplicate receipt or payment invoice references.
- The Finance payment entry form warns before submitting non-positive nett prices.
- The Finance settlement form warns before submitting non-positive settlement amounts or blank settlement deadlines.
- Finance settlement reminders can now link the settlement owner/previous owner alongside the car plate, amount, and deadline, and reject unknown owner links.
- The Finance settlement table exposes a Reopen action so staff can correct a settlement that was marked paid by accident.
- Finance settlement reminders can now be edited from the Finance screen so staff can correct car plate, previous owner, amount, deadline, and paid/due state without recreating the reminder.
- The Finance table exposes an Undo action for reconciled payments so staff can correct a final reconciliation back to Disbursed and trigger vehicle status recalculation.
- The Finance screen now exposes finance-owned receipt and payment invoice uploads linked to the payment vehicle for audit and reconciliation evidence.
- A staff login panel is included in the Ant Design Pro portal and uses ASP.NET Identity cookie login.
- The staff login panel no longer prefills the seeded demo password, so production bundles do not expose the default credential in the form state.
- Boss/Admin users can create staff accounts and update each staff member's department roles from the Admin screen.
- Boss/Admin users can edit staff display names from the Admin screen while preserving email and department roles.
- Boss/Admin users can reset staff passwords from the Admin screen without changing the staff member's email, display name, or department roles.
- Boss/Admin users can disable or enable staff accounts from the Admin screen; disabled staff cannot sign in, while their audit history and role assignments are preserved.
- HR/Salary now implements the next MVP slice: all authenticated staff can use self-service attendance, leave/MC requests, and own payslips, while HR/Admin can review attendance, approve leave, manage AL/MC balances, configure working-day pay periods, maintain payroll profiles, upload/review MC files, and generate payslips.
- HR payslips calculate daily salary from monthly base salary divided by configured working days, deduct approved unpaid leave, add overtime and allowances, subtract manual deductions, and intentionally exclude statutory EPF/SOCSO/EIS/PCB calculations for this MVP.
- Authenticated back-office reloads now request only the data sets needed by the staff member's department roles, reducing noisy forbidden calls and keeping role-limited sessions scoped to their modules.
- Workflow departments now use a narrow back-office vehicle lookup endpoint for car plate selectors instead of loading full vehicle financial/intake records.
- Full back-office vehicle records remain readable only by Boss/Admin and Sales; Loan, Delivery, Finance, and Repair use lookup DTOs.
- The API exposes read-only vehicle lookup access to workflow departments that need car plates, while vehicle intake, updates, photos, and documents remain limited to Boss/Admin and Sales.
- The API exposes customer read access to Boss/Admin, Sales, and Loan roles so the Loan workflow customer selector works without granting customer creation rights.
- Staff account creation, profile updates, password resets, status toggles, and role updates now return structured validation errors for missing email, display name, initial or reset password, empty role assignments, invalid department roles, or unsafe self-disable attempts.
- The Admin role editor keeps staff assigned to at least one known department role before sending role updates to the API.
- The Admin staff creation form warns before submitting blank staff details, invalid department roles, or duplicate staff emails.
- Vehicle intake captures purchase price, selling price, additional charges, refurbishment budget, and commission so dashboard profit fields are not silently zeroed.
- Vehicle intake records can now be edited from the Vehicles screen so staff can correct plate, model, pricing, Boss Confirm, UCD, contact links, visibility, and outstation pickup details after the initial entry.
- Vehicle intake now also tracks Boss Confirm, Contra Range Price, and UCD Status Tracking from the original intake workflow terms.
- Vehicle intake can link the stock record to existing customer and previous-owner records, and rejects unknown contact links before saving.
- Customer detail records now include address and notes alongside name, phone, IC, and email for invoice, loan, and delivery follow-up.
- Customer and previous-owner records can now be updated after creation so staff can correct contact, IC, address, notes, and owner details without creating duplicate records.
- Vehicle intake now tracks outstation pickup allowance, scheduled pickup date/time, and booking slip reference from the 收车 workflow.
- The Vehicle intake form warns before submitting blank identity fields, invalid years, invalid price totals, or duplicate car plates.
- Vehicle intake now includes structured purchase invoice tracking linked to the car plate, alongside purchase invoice document upload.
- Purchase invoices can now be edited from the Vehicles screen so staff can correct purchase amount, invoice number, or car-plate linkage without duplicate invoice records.
- Purchase invoices reject duplicate invoice numbers with normalized spacing/case before purchase costs are recorded twice.
- The Vehicles purchase invoice form warns before submitting duplicate invoice numbers, blank invoice numbers, or non-positive purchase amounts.
- Supplier invoices reject blank supplier names or invoice numbers, duplicate supplier/invoice pairs with normalized spacing/case, and unknown vehicle links before repair costs enter the workflow.
- Supplier invoices can capture the plate printed on the supplier invoice and reject wrong-plate mismatches against the selected car plate.
- Supplier invoices can now be edited from the Repair screen so staff can correct supplier, invoice, printed-plate, or amount mistakes while preserving duplicate and wrong-plate validation.
- The Repair task entry form warns before submitting duplicate supplier/invoice pairs, blank supplier invoice fields, wrong invoice plates, or non-positive repair amounts.
- The Repair task entry form also warns before creating a repair row with a blank task description or negative repair cost.
- The Repair task entry form captures Repair Part / Spare Part separately from the task action so refurbishment records match the original Repair Part, What To Do, and Checklist workflow.
- Repair task records can now be edited from the Repair screen so staff can correct car plate, repair part, work description, cost, and checklist state without recreating the task.
- The Repair screen now exposes repair-owned document uploads for Repair Invoice files linked to the repair car plate.
- Plate-linked repair cost validation, loan document completeness, and delivery release readiness are covered by backend rules.
- Delivery workflow records reject blank PIC values and missing schedule dates before they enter the schedule/release flow.
- Delivery workflow records now capture the inspection booking reference separately from the final inspection report reference.
- Delivery workflow records now capture insurance policy, road tax receipt, and windscreen policy references alongside the handover checklist.
- The Delivery scheduling form warns through the shared delivery guard before submitting blank PIC values or missing schedule dates.
- Delivery workflow records cannot be marked Ready for Release until inspection, documents, preparation checklist, and 2-day notice are complete.
- Delivery readiness now also requires insurance, road tax, and windscreen insurance handover checks before Ready for Release or Released status.
- Delivery inspection completion now requires an inspection report reference before Ready for Release or Released status, with back-office capture and smoke-test validation.
- Delivery Ready for Release and Released API updates now also require uploaded Policy and Road Tax Receipt document blobs for the vehicle.
- Document upload authorization is category-aware: Sales owns intake documents, Loan owns loan documents, Delivery owns delivery/policy/road-tax uploads, Repair owns repair invoices, and Boss/Admin can upload any document category.
- The Delivery screen now exposes delivery-owned document uploads so Delivery staff can attach Policy and Road Tax Receipt files without needing Sales vehicle-intake access.
- The Delivery scheduling form warns before submitting a manual Ready for Release or Released status with an incomplete checklist.
- Delivery preparation reminders stop after staff mark the 2-day notice as sent.
- Delivery records now track the general send-notification step separately from the final 2-day release notice.
- The Delivery table exposes a Notice action so staff can mark the 2-day notice sent without completing the full release checklist.
- The Delivery table only enables Ready after the release checklist is already complete; it no longer auto-completes checklist items.
- The Delivery table disables Release until the same readiness checklist required by the API is complete.
- Delivery records can now be edited from the Delivery screen so staff can correct PIC, schedule date, workflow status, checklist flags, inspection references, and handover policy/road-tax/windscreen references without recreating the delivery.
- Repair jobs reject blank task descriptions and negative costs before they affect dashboard repair cost or estimated profit.
- The Loan screen now calls the backend document-check rule and shows missing VOC, AP Document, Status Receipt, or Loan Document items directly in the loan workflow table.
- Loan quick actions now keep LOU Done consistent by marking LOU Approved before completing the loan workflow.
- Loan records can now be edited from the Loan screen so staff can correct linked customer, submitted date, workflow status, and LOU approval/done flags without recreating the loan.
- The Loan submission form warns before submitting manual Approved/Done status combinations that are missing the required LOU Approved or LOU Done flags.
- The Loan submission form warns before submitting active Pending/Approved/Done loans without a submitted date for 3-day follow-up tracking.
- The API rejects loan records where the loan is approved before LOU Approved is recorded, where LOU is marked done before approval, or where the loan is completed before LOU Done is recorded.
- The Loan submission form now uses a searchable customer selector with name, phone, and IC labels instead of requiring staff to paste a customer GUID.
- The Loan screen now exposes loan-owned document uploads for VOC, AP Document, Status Receipt, and Loan Document so Loan staff can resolve checklist gaps without Sales vehicle-intake access.
- Active loan workflow records require a submitted date so 3-day follow-up reminders can be calculated reliably.
- Dashboard repair cost and estimated profit now use detailed repair job costs when repair rows exist for a vehicle, falling back to the vehicle refurbishment total for older intake records.
- Dashboard summary now includes Top Supplier from supplier invoice totals and Sales Performance from closed public enquiries, matching the management dashboard suggestions.
- Dashboard summary now exposes Total Profit alongside the earlier estimated-profit field, so the Boss/Admin dashboard matches the original Total Profit wording while keeping the API backward-compatible.
- Public leads now require a visible available vehicle, and back-office workflow records reject unknown vehicle/customer links before saving.
- Front-office enquiry submission now trims public lead payloads and surfaces backend validation messages instead of a generic failure only.
- Front-office enquiry submission now blocks blank vehicle, name, or phone fields before calling the API and maps known validation codes to English/Chinese form messages.
- Back-office lead updates now keep customer name, phone, and vehicle links valid before sales follow-up status changes are saved.
- Back-office lead conversion can link a public enquiry to a created customer record, and lead updates reject unknown customer links.
- The Leads table shows whether each public enquiry is still new or already linked to a customer record.
- The Leads screen can filter public enquiries by follow-up status and whether a customer record is linked, so Sales can triage new website leads faster.
- Back-office lead records can now be edited from the Leads screen so Sales can correct car plate, linked customer, customer name, phone, message, and status without recreating the enquiry.
- Lead conversion reuses an existing customer with the same normalized phone number before creating a new customer record, ignoring common spaces and separators.
- Vehicle intake rejects blank identity fields, invalid model year, invalid price totals, and unknown customer/owner links before records enter inventory.
- Vehicle intake now rejects duplicate car plates with a structured validation error before the database unique index is hit.
- Customer and owner creation rejects blank or duplicate normalized phone records before contacts are used by loan and vehicle workflows.
- The Customer and Owner forms warn before submitting blank names, blank phones, or duplicate normalized phone records.
- Customer address and notes persistence is smoke-tested so detailed customer records survive the API round trip.
- Loan submissions automatically move the linked vehicle to Loan Processing and hide it from public inventory; reconciled payments mark the linked vehicle Sold and private, and correcting the final reconciled payment back to a non-reconciled status returns the vehicle to Loan Processing/private.
- Back-office update endpoints return 404 for missing workflow records before attempting detached EF updates, avoiding false success or server errors.
- Back-office route/body id mismatches now return a structured `message` response across update endpoints so the portal can display specific validation text.
- Authenticated back-office mutations write audit entries with the logged-in staff email instead of a generic system actor.
- Boss/Admin users now have a dedicated Audit Log module in the back office, in addition to the Admin tab, for reviewing authenticated workflow mutations.
- Boss/Admin users can filter the Audit Log by actor, action, and entity name when investigating staff or workflow changes.
- The reminder worker is enabled only when `Worker__Enabled=true`, and worker-mode startup skips development seed data so the API and worker do not race while creating Identity roles.
- The reminder worker retries when it starts before the API has created the PostgreSQL schema, so the worker container stays alive during fresh Docker deployments.

## Local URLs

- Front office: `http://localhost:3000`
- Back office: `http://localhost:3001`
- API: `http://localhost:5000`

## Docker VPS Verification

Run the deployment stack from the workspace root:

```powershell
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
.\infra\smoke-test.ps1
```

The smoke test checks:

- `GET /health` on the .NET API and `GET /health/ready` for PostgreSQL-backed readiness.
- Defensive API response headers are smoke-tested on `/health`, including content-type sniffing, frame blocking, referrer, and permissions-policy headers.
- Back-office credentialed CORS preflight is smoke-tested against `/api/auth/me`, so the configured back-office origin is verified before browser cookie-auth workflows run.
- Public vehicle inventory returns the seeded `VPK1234` vehicle.
- Public vehicle inventory and detail API smoke checks return the seeded `VPK1234` vehicle without exposing internal purchase/refurbishment/commission fields.
- The front office renders YS Heng content.
- The front-office vehicle detail page renders a public seeded vehicle.
- The front-office filtered inventory URL is smoke-tested with make, model, year, price, stock owner, and sort parameters.
- Chinese public front-office smoke checks verify `?lang=zh` home, inventory, and vehicle detail pages render Chinese copy with the seeded public vehicle.
- The back office renders the portal shell.
- Seeded Boss/Admin login works through Identity cookie auth.
- Authenticated dashboard summary returns protected operational metrics, including `totalProfit` aligned with the backward-compatible `estimatedProfit` field.
- Dashboard vehicle aging bucket output is smoke-tested so the management summary includes both the headline over-60 count and the full aging breakdown.
- Department role enforcement is smoke-tested with a Sales user that can access vehicles but is blocked from Finance APIs.
- Finance role enforcement is smoke-tested with access to payments, customer lookup for balance/debt follow-up, and owner lookup for settlement follow-up.
- HR/Salary role enforcement is smoke-tested with HR users blocked from vehicle, finance, and dashboard APIs while HR records remain scoped so ordinary staff see only their own attendance, leave, MC, and payslip data.
- Staff user creation, password reset, active/disabled login control, and role-update validation are smoke-tested before role enforcement so bad admin input fails predictably.
- Authenticated mutation audit logging is smoke-tested by creating a vehicle and verifying the audit log actor is the logged-in admin email.
- Audit Log actor/action/entity filters are smoke-tested against the same authenticated vehicle mutation.
- Purchase invoice creation/listing and structured purchase invoice validation are smoke-tested through the authenticated Vehicles workflow.
- Duplicate purchase invoices are smoke-tested with alternate spacing/case before purchase costs enter the workflow twice.
- Public lead creation stores an enquiry that appears in the authenticated back-office Leads API.
- Invalid public lead submissions return structured validation errors for missing customer name or phone.
- Invalid back-office lead updates return structured validation errors for missing customer name or phone.
- Back-office lead customer linking is smoke-tested by creating a customer from a public enquiry and preserving the lead `customerId`.
- Duplicate customer and previous-owner phone numbers are smoke-tested with alternate spacing/separators so lead conversion and intake do not fragment contact records.
- Pending loan records without a submitted date return structured validation errors before reminder tracking is lost.
- Loan records with Approved/Done workflow status but missing LOU Approved, LOU Done but missing LOU Approved, or Done status without LOU Done, return structured validation errors.
- Duplicate vehicle plates return a structured validation error during authenticated vehicle intake.
- Authenticated vehicle intake preserves linked customer and previous-owner details.
- Supplier invoice submissions return structured validation errors for missing supplier names or invoice numbers.
- Repair part persistence is smoke-tested by creating a repair row and verifying the Repair Part and What To Do values return from the Repairs API.
- Duplicate supplier invoices are smoke-tested with alternate spacing/case before repair costs enter the workflow.
- Wrong-plate supplier invoices are smoke-tested before repair costs enter the workflow.
- Delivery release is blocked by the API until inspection, documents, preparation checklist, and 2-day notice are complete.
- Delivery Ready for Release status is blocked by the API until the same release checklist is complete.
- Delivery records with missing PIC or schedule date return structured validation errors.
- Delivery inspection booking reference persistence is smoke-tested separately from inspection report validation.
- Delivery 2-day notice reminders are smoke-tested before and after the notice is marked sent.
- Payment, broker commission, debt recovery, payment voucher, and settlement APIs reject invalid finance amounts and missing required references before they affect dashboard totals; settlement owner links and broker CP58 state are validated, and reconciled payment validation also checks receipt and invoice references, Boss Check, finance checklist completion, duplicate receipt/invoice reuse, and bank follow-up reminders.
- Payment Pending/Approved/Disbursed status reminders are smoke-tested through the dashboard reminder inbox.
- Dashboard reminder type/due filtering is smoke-tested through `/api/dashboard/reminders?type=PaymentBankFollowUp&due=Overdue`.
- Payment voucher and broker commission profit impacts are smoke-tested through the dashboard `totalProfit` field, with the backward-compatible `estimatedProfit` field checked for alignment.
- Payment voucher follow-up reminders are smoke-tested before and after the voucher is marked Paid.
- Customer invoice detail fields on payment records are smoke-tested for persistence and negative-amount validation.
- Missing payment updates return HTTP 404 instead of an unhandled server error.
- Authenticated photo and document uploads store PostgreSQL blobs and expose metadata/content download endpoints, including uploader and SHA-256 checksum metadata for back-office traceability; document upload categories are scoped by department workflow.
- Finance receipt and payment invoice uploads are smoke-tested with a Finance user, including forbidden checks for Sales uploading finance receipts and Finance uploading Loan documents.
- Unsupported vehicle photo uploads return a structured validation error instead of an unhandled server error.
- Document uploads using the photo category return a structured validation error instead of mixing photo records into document blobs.
- Authenticated workflow smoke creates a vehicle/customer/loan/payment and verifies loan, payment reconciliation, and payment correction status automation against public and back-office inventory.

Docker Desktop must be running with the Linux engine enabled before these commands can work on Windows.
The Compose stack includes healthchecks for PostgreSQL, the .NET API `/health/ready` readiness endpoint, the front office, and the back office; front/back containers wait for the API to become healthy before starting. `/health/ready` verifies PostgreSQL connectivity, while `/health` remains a lightweight service identity check for smoke tests.
For VPS deployment, copy `infra/compose.env.example` to `.env` in the repository root and change the database/admin passwords before running Compose:

```powershell
Copy-Item infra\compose.env.example .env
notepad .env
.\infra\validate-compose-env.ps1
```

The API container defaults to `ASPNETCORE_ENVIRONMENT=Production` and uses `SEED_DATA_ENABLED=true` for first-run schema, role, admin, and demo inventory setup. After the database has been initialized and the admin password has been changed, set `SEED_DATA_ENABLED=false` if you want future container restarts to skip seed checks.

Run the bounded preflight first if Docker Desktop may be asleep or ports may already be occupied:

```powershell
.\infra\docker-preflight.ps1
```

The preflight checks Dockerfiles and the Compose contract first, then checks the Docker engine, validates the Compose file, reports default port conflicts, and times out Docker probes instead of leaving hanging CLI processes. On Windows, a stopped `com.docker.service` is reported as a warning while the script continues to probe the Linux engine directly; if the Docker server probe fails or times out, it prints read-only diagnostics for the Docker CLI path, active Docker context, Docker Desktop process/service state, and WSL distro state before stopping.
When `.env` exists, the preflight also runs `infra/validate-compose-env.ps1`; use `-SkipEnvValidation` only for local diagnostics before the VPS `.env` file has been created.
Normal `.env` validation rejects placeholder secrets, sample `example.com` domains, `localhost`/loopback public URLs, and trailing slashes on public URL values, so `PUBLIC_API_BASE_URL`, `FRONTOFFICE_ORIGIN`, and `BACKOFFICE_ORIGIN` must be changed to real VPS domains or public IP URLs before deployment.
For local Docker Desktop smoke testing only, copy `infra/compose.env.local.example` to `.env` and run `infra/docker-preflight.ps1 -AllowExampleEnvValues`; the local example intentionally uses localhost URLs and default demo credentials.
For a VPS deploy after `.env` is ready, use:

```powershell
.\infra\deploy-vps.ps1
```

Use `-BackupBeforeDeploy` for an existing live database, and `-SkipSmoke` only when smoke URLs are intentionally unreachable from the deploy host. The deploy helper passes the selected `-EnvPath` through to the backup helper, so custom VPS env files are used consistently for backup, Compose startup, and smoke URLs. Before running the full smoke suite, deploy waits for API readiness plus the front-office and back-office URLs using the configured timeout.
When Docker Desktop is unavailable but local PostgreSQL 17 tooling is installed, run the current code against a clean temporary PostgreSQL database and the same smoke checks:

```powershell
npm run build
.\infra\local-clean-smoke.ps1
```

This local runner starts temporary PostgreSQL/API/front-office/back-office processes on alternate ports, waits for DB-backed API readiness, runs `infra/smoke-test.ps1`, and stops those temporary processes afterward. It is useful for current-code verification, but it does not replace Docker Compose verification for deployment completion.
The local verification gate also runs `infra/test-dockerfiles.ps1`, `infra/test-compose-contract.ps1`, `infra/test-compose-env.ps1`, `infra/test-deployment-scripts.ps1`, `infra/test-deployment-runbook.ps1`, `infra/test-requirements-trace.ps1`, `infra/test-source-requirements-crosscheck.ps1`, and `infra/test-stitch-reference-handoff.ps1`, so the Dockerfiles, checked-in Compose shape, VPS `.env` guardrails, deploy/backup/restore script invariants, deployment runbook, requirements trace, source-document coverage map, and Stitch visual-reference handoff are tested even when Docker Desktop is unavailable. `infra/docker-preflight.ps1` now runs the Dockerfile and Compose contract checks before probing Docker, and `infra/deploy-vps.ps1` runs the same Compose contract check before Docker preflight, so broken service wiring fails before any build or deploy step.
GitHub Actions CI runs the Docker-independent verification path on every push and pull request; Docker Compose runtime smoke remains a deployment-host proof because it requires a responding Docker engine.
Local clean-smoke logs and temporary PostgreSQL data are written under the OS temp folder at `ysheng-local-clean-smoke`, so repeated verification does not leave generated files in the repository root.
Because vehicle photos and documents are stored as PostgreSQL blobs for the MVP, keep database backups as part of VPS operations:

```powershell
.\infra\backup-postgres.ps1
.\infra\restore-postgres.ps1 -BackupPath backups\ysheng-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

The backup and restore helpers read `POSTGRES_DB` and `POSTGRES_USER` from the selected env file unless those values are passed explicitly; use `-EnvPath` when operating against a non-default VPS env file. The restore command is destructive and requires `-ConfirmRestore` intentionally. Backup files are written under `backups/`, which is ignored by git.
If local ports are already occupied, override ports before running compose and pass matching URLs to the smoke test:

```powershell
$env:POSTGRES_PORT="55432"
$env:API_PORT="5100"
$env:FRONTOFFICE_PORT="3100"
$env:BACKOFFICE_PORT="3101"
$env:PUBLIC_API_BASE_URL="http://localhost:5100"
$env:FRONTOFFICE_ORIGIN="http://localhost:3100"
$env:BACKOFFICE_ORIGIN="http://localhost:3101"
docker compose -f infra/docker-compose.yml up -d --build
.\infra\smoke-test.ps1 -ApiBaseUrl http://localhost:5100 -FrontOfficeUrl http://localhost:3100 -BackOfficeUrl http://localhost:3101
```
When using alternate browser ports, keep `FRONTOFFICE_ORIGIN` and `BACKOFFICE_ORIGIN` aligned with the public app URLs so browser cookie-auth requests pass API CORS checks.

## Default Admin

- Email: `admin@ysheng.local`
- Password: `ChangeMe123!`

Change this before production.

## Current Tooling Note

The project targets `.NET 10` as requested. Backend tests have been verified with the .NET 10 SDK resolved by the local toolchain.
Docker Compose verification requires Docker Desktop with the Linux engine responding, plus free ports `3000`, `3001`, `5000`, and `5432` before `docker compose up -d` and `.\infra\smoke-test.ps1`.
