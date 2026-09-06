# Acceptance repair results

## Decision

Accepted locally for the six bounded repairs approved after the unreleased acceptance pass. The final runtime ledger has 63 passed checks, no failures, no setup/cleanup error and no uncaught browser errors. This is not a complete Finance V2 readiness verdict or production release approval.

## Repairs

| Area | Implemented behavior |
| --- | --- |
| Collection evidence | Collection-linked PaymentReceipt and PaymentInvoice uploads lock the vehicle, collection and payment, then require Pending state. Reconciled/Reversed uploads return a structured conflict before document or audit persistence. Historical evidence remains readable. |
| Purchase Invoice entry | Vehicle details now exposes New Purchase Invoice through Documents & photos, Previous owner, Purchase Invoice. It creates a structured draft with classified lines, the selected vehicle and an approved supplier. Cancellation does not save; a failed save preserves entered values. Manual document upload is not restored. |
| Calendar | Dashboard and HR share delivery status and a desktop day agenda. Mobile date selection opens a bottom drawer with empty, loading, error and retry states. Only Boss/Admin and Delivery have Open delivery. The exact record opens, and a consumed deep link does not reopen a closed drawer. |
| Loan circles | Scoped Ant Design overrides make finish/process/error/wait backgrounds white, with legible state glyphs. |
| Delivery header | The narrow drawer puts its complete title above Customer and More controls, preserving touch-sized actions and evidence-card wrapping. |
| Documentation | API reference now documents the shared calendar, collection evidence state/serialization, optional windscreen evidence and the limits of structured Purchase Invoice creation. The documentation test checks the actual Finance rule error code. |

Purchase Invoice scope is deliberately precise: staff still provide an invoice number. This repair does not implement automatic numbering or a printable Purchase Invoice PDF. The existing system-generated sales invoice is a separate Finance feature.

## Verification

- Fresh backend solution build/test in the .NET 10 SDK container: 285 passed, 0 failed, 0 skipped.
- Final back-office suite after the deep-link close correction: 356 passed across 34 files.
- Back-office type checking and production build passed. Vite's existing large-chunk advisory remains; no dependency was added or upgraded.
- API image rebuilt from the candidate source.
- Final disposable API/browser acceptance: 63 passed, 0 failed. It covers desktop, tablet and mobile widths of 1280, 820, 390 and 320 pixels. Source fingerprints match before/after: `18e95d40be13d1fd128f35ffd0925c7fa30a66d4db3586f58150e537cd1714e6`.
- Independent source review found two additional defects during this repair: a repeating delivery deep link and a documentation/error-code mismatch. Both were corrected and re-reviewed with no remaining source-level blocker.
- The earlier local 29-test result used a stale DLL and is excluded. Fresh Docker results above cover the changed backend.

The browser harness uses isolated Chromium and disposable PostgreSQL/API fixtures. It verifies all seven staff roles can read the calendar and non-Delivery staff cannot access protected Delivery records. An approved synthetic leave request proves that the calendar omits its private reason and decision notes. Business-trip privacy remains source-reviewed, not exercised through a trip fixture.

Harness corrections during the run were kept separate from product fixes: use the server-owned initial delivery status, click the visible Ant Design select/control surface, wait for closed drawer content rather than its retained portal root, dismiss onboarding tours without competing handlers, await the completed modal close, and measure the drawer after its opening animation. The original failed acceptance is preserved; the final repair ledger is the canonical result. An early aborted harness required label-verified cleanup of its own disposable containers; no business volume was attached.

Loan's real Pending row is checked in the browser. The five-state/four-width visual matrix uses injected display-only API responses, not persisted workflow transitions. Purchase Invoice and Mark resolved error cases use one injected validation/conflict response, followed by real successful API retries. These are explicitly UI error-path checks, not claims that every backend error path was forced.

Collection concurrency checks hold the disposable database's vehicle advisory lock, queue two real API requests in a measured order, then release the lock. Upload-first and reconcile/reverse-first cases verify response status, persisted document count and timestamps. No production or existing local record is used.

## Changed files in this repair

- Backend: Program.cs, Features/FinanceV2.cs, FinanceV2RulesTests.cs.
- Calendar/navigation: OperationsCalendar.tsx and tests, App.tsx/App.test.ts, api.ts/api.test.ts, HrSalaryPage.tsx, DeliveryWorkboardPage.tsx and tests.
- Invoice entry: VehiclePage.tsx and VehiclePage.test.ts.
- Styling: only calendar, Loan circle and Delivery header hunks in styles.css.
- Documentation: docs/API.md, ApiDocumentationTests.cs, this report and the repair plan.
- Local QA: .codex-tmp/operations-acceptance-20260906/acceptance.cjs and generated results-repairs artifacts.

This list is the repair scope, not every dirty file in the candidate. Earlier HR, Finance, Vehicle and photo edits remain preserved. Impeccable's product/adapt guidance kept the existing Ant Design visual language and made mobile layout structural rather than shrinking controls. GStack's browser-QA workflow supplied actual interaction and screenshot evidence in addition to unit tests.

## Artifacts and boundaries

- Original failed acceptance: docs/plans/2026-09-06-unreleased-acceptance.md and the harness's results/report.json.
- Repair plan: docs/plans/2026-09-06-acceptance-repairs.md.
- Final repair ledger: .codex-tmp/operations-acceptance-20260906/results-repairs/report.json.
- Screenshots include calendar-day-panel-320.png, calendar-empty-day-390.png, calendar-exact-delivery-1280.png, purchase-invoice-created-1280.png, loan-circles-rejected-320.png and delivery-header-320.png.

No staged files, commits, pushes, deployment, migrations, original database changes, or original Docker restarts were performed. Temporary fixtures are discarded after validation; retained reports/screenshots contain synthetic data. The mixed candidate still overlaps the already-released photo-deletion change and is not a prepared production release package.

Post-run inspection found no task containers, task network or temporary listeners. The original local stack and existing Finance demo stack remained running and healthy.

The wider backlog remains outside this acceptance: settlement amount-direction rules, automatic Purchase Invoice generation, full shared VOC/OCR coverage, supplier approval removal, uppercase business text, Markdown templates, module-wide approval/button audits, header statistics and a complete Finance V2 release verdict. Chromium viewport coverage does not substitute for real iOS/Android device testing.
