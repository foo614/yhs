# Staff WhatsApp integration and verification runbook

This worktree combines the opt-in staff foundation with due, OCR, HR, and
workflow notification adapters. It does not turn on production messaging. Staff
policies are disabled by default; the independent global sender readiness
requires explicitly approved sender/template, credentials, cost ceiling, and
staff sending flags. Enrollment invitations remain a separate audience and
gate. Customer consent and queue routes never operate on staff rows.

## Local behavior

- A one-minute worker recovers current-day due and HR reminders and current
  UTC-period OCR threshold warnings. It runs only when the staff assistant
  configuration is ready. Durable outbox keys prevent repeat staging across
  restarts or concurrent replicas. Daily keys use staff user/category/local
  day, not phone, binding, or role; a role change cannot create a second
  digest for the same day. The OCR key uses service/scope/UTC period/BossAdmin
  user. Past days are not backfilled.
- Committed workflow events cover intake, explicit listing approval requests,
  delivery release, invoice-update requests and receipt status. They expire
  after 24 hours; staging is deduplicated by source event and staff user.
  After expiry, staff may explicitly request listing approval again; the
  system does not resend expired requests automatically.
  Sales delivery requires both the original captured owner and the current
  canonical owner to match the recipient. Receipt messages contain plate and
  fixed status only, never amounts, buyer details or receipt references.
- An allowed OCR quota reservation commits first. A separate-context warning
  evaluation then has a two-second notification-only deadline; errors and
  timeout are logged without changing the OCR or Admin settings result. The
  one-minute recovery scan retries missed warnings. Failed OCR requests still
  count because reservations are the existing quota unit. No synthetic usage
  is inserted into a live database.
- Immediately before provider submission, the dispatcher locks the verified
  binding, rechecks exact role/policy/phone and current business facts, and
  re-renders the template parameter. If no item remains actionable, it
  suppresses without sending. Otherwise it saves the exact refreshed
  `TemplateReference`, `Body`, submitted parameter, template name and language
  used by the sender. A queued preview is not a submitted-body snapshot.
- `GET /api/whatsapp/staff/diagnostics` requires `BackOffice` and
  `BossAdmin`, sets `Cache-Control: no-store`, and returns only integer counts:
  `{ missingRequiredDate, unassignedDelivery, missingCommissionDate,
  eligibleStaff, connectedStaff, unroutableWorkflowEvents }`. The first three
  identify due-data gaps; the next two count active role-eligible accounts and those with a currently
  valid verified staff binding. No employee names, finance values or message
  contents appear in the response. The final count exposes pending, unexpired
  workflow events captured without an eligible Sales owner. Correct the source
  assignment for future events; historical receipt events are not forwarded to
  a newly assigned employee.
- `categoryReady` is true for integrated OutstandingDigest, OcrUsage,
  AttendanceSummary, LeaveApproval, VehicleEvent, DeliveryEvent and FinanceEvent.
  Sender/template readiness and enabled policies remain separate gates.

## Proof boundary

Synthetic SQLite tests cover final refresh/suppression and payload snapshots,
role changes, daily dedup, and quota failure isolation. The isolated PostgreSQL
test covers schema idempotence, concurrency and authenticated onboarding with
a synthetic provider. Real provider callbacks/phone delivery, production
configuration and live authenticated browser proof remain separate checks.
Never use a production or application database to simulate
OCR usage or send a test notification without explicit authorization.

## Local verification, 7 October 2026

The release candidate passed 714 backend tests with no skips using an isolated
PostgreSQL 17 UTF-8 cluster, 495 back-office unit tests and the back-office
production build. Synthetic route checks
passed 46 phone, 42 tablet and 39 desktop checks across Vehicles, Finance and
Admin. The corrected Sales listing confirmation additionally passed all three
widths (18/14/13 checks). The `due page N` utility exposes the full current due
list, including overdue items, with canonical Sales assignment and no finance
data for Sales. These checks are not real-provider delivery proof.

The user approved release on 7 October 2026, excluding FOO-199 FAQ work.
FOO-198 reporting rules remain deferred. Record the PR, merged SHA, CI/security
results, production workflow, smoke results and release tag separately; this
verification record alone does not establish that the candidate is deployed.
