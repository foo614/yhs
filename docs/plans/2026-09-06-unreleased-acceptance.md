# Unreleased operations acceptance

Date: 2026-09-06

## Decision

Not accepted for release. This pass checks the existing unpublished operations changes. It does not implement the remaining feature requests or authorize a production release.

Candidate: `codex/operations-followups-20260906`, based on `7d2a64bbd30946d181abeb5fcf613d268833332c` with the current uncommitted operations changes. The previously deployed saved-photo deletion is a separate release. This candidate still includes overlapping photo-deletion changes and is not a clean release package.

The old root checkout's calendar acceptance cannot establish that the newer shared calendar works. This pass runs the actual candidate frontend and backend together.

## Findings

| Priority | Requirement | Result and evidence |
| --- | --- | --- |
| P1 | Collection receipt state enforcement | Failed. The UI offers Pending collections, but the backend accepts a new receipt for both Reconciled and Reversed collections. Real API requests returned HTTP 201 and each increased the persisted document count by one in the disposable database. `Program.cs:731-752` checks linkage and category without enforcing Pending state; persistence follows at `Program.cs:794-829`. |
| P1 | Reachable system-generated Purchase Invoice workflow | Failed. A vehicle with no purchase invoice shows the missing-invoice checklist, but the only call opening the creation modal is inside a disabled `false &&` block in `VehiclePage.tsx:3019-3023`. Finance's purchase-invoice table at `FinancePage.tsx:2282-2297` confirms existing records; it does not create the missing invoice. Removing manual upload has not provided a complete replacement workflow. |
| P2 | Calendar day-details interaction | Failed in part. Dashboard and HR share a working event calendar, but `OperationsCalendar.tsx` renders only an inline selected-day list on mobile. It has no requested bottom panel, delivery-detail link, or delivery status display. The desktop two-column layout is present. |
| P2 | Loan step-circle white background | Failed in the real browser. The source adds a white-background rule, but the four rendered step icons remain grey, green, and translucent grey. The completed check circle is not white. See the runtime check and screenshot. |
| P2 | Delivery narrow-screen drawer header | Failed at 320 px. The Customer and More controls squeeze and clip the drawer title. Uploaded-document cards themselves wrap correctly. |
| P2 | Delivery API documentation | Failed. `docs/API.md:236-237` still lists windscreen expiry and `WindscreenPolicy` as required release checks. Runtime behavior and the new rules no longer require them. The new operations-calendar endpoint is also missing from the API document. |

The two receipt-state failures are one backend defect, not two independent feature requests.

## Accepted behavior within this pass

| Area | Demonstrated behavior | Boundaries |
| --- | --- | --- |
| Calendar access and data | BossAdmin, Sales, Finance, and HrSalary authenticated API reads succeed. Anonymous reads return 401; an inverted date range returns 400. A new scheduled delivery appears. A narrow payload-shape check confirms that all returned events have only the six allowed keys. Sales still cannot read the management dashboard. | Other BackOffice roles were reviewed in the shared policy, not individually exercised with browser accounts. Approved leave/trip privacy was reviewed in source, not exercised with leave/trip fixtures or real employee records. |
| Calendar placement and refresh | The candidate renders the shared component in Dashboard and HR. Month navigation shows the empty state; Today restores the matching delivery. Rescheduling changes the event date visible to Sales. | Requested mobile detail panel and delivery navigation remain failed above. |
| HR attendance presentation | Reminder section absent; new grouped attendance dashboard renders at desktop, tablet, and mobile widths. | The browser fixture has zero attendance. This is presentation acceptance, not new payroll, attendance-punch, QR, or leave-policy acceptance. |
| Vehicle details | Owner record appears in Overview; the tab is named Leads; the removed Linked People card is absent. | Purchase Invoice replacement workflow remains failed. Existing saved-photo deletion was not re-released or re-tested by deleting any business photo. |
| Vehicle price-change warning layout | The reapproval notice spans the full form at 1280, 390, and 320 px, confirmed by rendered measurements and screenshots. | No price was changed or saved. This checks the warning layout, not a new price-approval workflow. |
| Customer receipt entry | Create customer receipt appears beside Prepare sales invoice. The old Finance Documents section is absent. Browser selection, preview cancellation, and upload confirmation work. Cancel persists no file; confirmation creates exactly one PaymentReceipt linked to the selected payment and collection without changing amount or reconciling it. | State enforcement after reconciliation or reversal remains failed. The image is a labelled synthetic test fixture, not a customer receipt. |
| Mark resolved | Confirmation opens; cancellation preserves the request. Finance-role API resolution records delivery activity. Non-Finance resolution is forbidden. | A simulated conflict tests the UI error path separately from real API success. Detailed runtime results are in the canonical JSON report. |
| Delivery previous-step editing | The browser edits and saves an already completed Plan step. Unchecking completed car wash and saving moves the computed stage back to Prepare car and leaves release blocked. | Released/cancelled immutability was reviewed and covered by backend rules/tests; this pass did not release a vehicle. |
| Delivery evidence and rescheduling | The Clear documents stage contains three upload cards. Long file names wrap at 1280, 820, 390, and 320 px without card overflow. Windscreen is absent from required categories. Saved rescheduling resets both notice flags, updates the shared calendar, and records its reason in activity. | Header layout still fails at 320 px. No original evidence or business records were modified. |
| Route layout smoke | Dashboard, HR, Vehicles, Leads, Loans, Delivery, and Finance rendered at four widths with no document-level horizontal overflow. Leads uses the available desktop content width. | This is not a blanket claim that every modal, filter, workflow, and data state is responsive. The visual failures above remain open. |
| Admin My Cars | The synthetic Admin session opens My Cars without the reported email/password error; the authenticated API session remains active. | This does not establish the cause of the user's original-account failure or validate production sessions. |

## Automated verification

- Back-office Vitest: 346 passed across 34 files.
- Back-office lint/type check: `tsc --noEmit` passed.
- Back-office production build: passed. Vite reported a large-chunk advisory; it was not established as introduced by this scope.
- Back-office diff whitespace check: passed, with line-ending notices only.
- Backend solution: 283 passed, 0 failed, 0 skipped, using the .NET 10 SDK container against a copied, read-only candidate source mount.
- Candidate API Docker image: built successfully.
- Runtime/visual ledger: 38 checks passed and 5 failed, with no setup blocker or cleanup error. Three failures are executed assertions (both invalid receipt states and Loan circle styling); two record manually inspected calendar/header failures. The five failed checks cover four issues because the two receipt states share one defect. Purchase Invoice reachability and API documentation add two independent source-review findings.
- Browser uncaught JavaScript errors: none in the captured route and interaction scope.
- Candidate frontend/backend source fingerprint matched before and after: `27dfd51900ef76473a9292141e36e0324ece64d51810ce545152bdf73174e4b1`.

Runtime failures remain failures; automated unit-test success does not override them. The Mark resolved error test injects one HTTP 409 response, verifies the visible generic conflict explanation and preserved open request, then succeeds on a real browser/API retry. It does not prove that all specific backend conflict details survive the shared error formatter.

## Runtime environment and artifacts

The browser is headless Chromium against the candidate's Vite app and freshly built API image. The regular browser integration could not initialize its local kernel; CLI Playwright provided actual browser execution, not mocked page screenshots.

The temporary API listens on loopback port 5296; Vite listens on loopback port 5396. PostgreSQL uses a task-owned tmpfs container with no business volume and no database host port. Temporary credentials are generated in memory and not written to the report. No OCR provider call is made. The final harness uses a task-owned bridge network because the internal-only network did not expose the ready API to the host browser in this Docker environment.

Canonical artifacts, relative to the candidate root:

- `.codex-tmp/operations-acceptance-20260906/acceptance.cjs`
- `.codex-tmp/operations-acceptance-20260906/results/report.json`
- `.codex-tmp/operations-acceptance-20260906/results/hr-shared-calendar-390.png`
- `.codex-tmp/operations-acceptance-20260906/results/vehicle-details-owner-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/vehicle-reapproval-notice-320.png`
- `.codex-tmp/operations-acceptance-20260906/results/finance-receipt-dialog-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/finance-receipt-preview-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/finance-mark-resolved-error-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/leads-my-cars-admin-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/failure-19.png` (the final Loan circle failure)
- `.codex-tmp/operations-acceptance-20260906/results/delivery-edit-completed-plan-1280.png`
- `.codex-tmp/operations-acceptance-20260906/results/delivery-evidence-320.png`
- `.codex-tmp/operations-acceptance-20260906/results/delivery-evidence-390.png`

Earlier harness iterations hit temporary-network, fixture-image, and locator issues. Those are test setup issues, not application defects. The final JSON is the canonical runtime result; old failure screenshots without a corresponding final failed check are not acceptance findings.

## Remaining requests not signed off

These are not completed by accepting the existing changes:

- Settlement's three amount-direction scenarios across Vehicle, Finance, reminders, and AutoCount export.
- Direct creation of an immediately usable Repair supplier without the supplier-approval step. Current supplier records still use Draft/approval.
- Consistent business-text uppercase behavior, including Settings make/model, while preserving case-sensitive credentials and technical values.
- Predefined Markdown create/edit templates. The existing editor's placeholder is not a populated template.
- Shared upload-VOC/OCR/review/apply workflow across every requested module.
- A complete module-by-module approval-button and role matrix.
- The requested Vehicle/Repair/Loan header-statistics coverage.
- Every-button error-notification coverage. A tested Finance dialog cannot establish all modules' behavior.
- A complete Finance V2 end-to-end release verdict, including the missing flows and invariants above.

## Change boundary and next step

No application source was changed during this acceptance pass. Only the local QA harness, generated artifacts, and this report were added. The harness fingerprints the candidate frontend and backend source before and after execution; the values must match in the final report.

No commit, push, PR update, deployment, production-account change, or original Docker database migration was performed. Cleanup is limited to the exact task-labelled containers and network created by the harness. The disposable fixtures can be recreated by rerunning the harness; business data is untouched.

After execution, Docker inspection confirmed that the task containers and network were gone. The original local stack and the existing Finance demo stack remained running and healthy. Independent final review confirmed the release-blocking classification and the distinction between runtime, simulated-error, visual, and source-only evidence.

The next implementation scope should fix the two P1 workflow defects first, then the calendar and visual failures, align the API document, and rerun the affected acceptance cases on a clean release candidate. Missing larger features require their own completed implementation and acceptance before anyone reports that all requests are finished.
