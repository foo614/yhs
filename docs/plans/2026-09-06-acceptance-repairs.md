# Unreleased acceptance repairs

## Approved scope

The user approved fixing the six failures from the unreleased acceptance report and delegated sequencing. This is implementation and local acceptance, not approval to publish, change role policies, or alter existing business data.

1. Reject collection-linked receipt/invoice evidence unless the collection is Pending, including concurrent reconcile/reverse requests.
2. Restore a reachable structured Purchase Invoice creation action for the selected vehicle, without restoring manual document upload. Reuse the existing numbered-invoice contract; this scope does not introduce a PDF generator or an automatic numbering scheme.
3. Show selected-day details in a bottom drawer on mobile, retain the desktop agenda, display delivery status, and allow authorized users to open the exact delivery.
4. Make Loan decision step circles white with legible state glyphs.
5. Keep the Delivery drawer title and actions readable at 320 pixels.
6. Synchronize API and workflow documentation.

Settlement, expanded OCR, supplier approval changes, uppercase fields, Markdown templates, header statistics, and blanket module audits remain outside this repair.

## Safety and implementation

- Work only in the existing operations-followups candidate. Preserve all prior dirty changes and already-released photo deletion work.
- Collection uploads acquire the vehicle advisory transaction, collection row lock, then payment row lock. Revalidate identifiers and Pending state under those locks before document/audit insertion and commit. Preserve existing evidence categories, permissions, ownership, MIME and size validation.
- Calendar adds nullable delivery status only. Its existing event ID identifies the delivery; no additional vehicle identity is necessary. Navigation is offered only through a role-authorized parent callback and opens that exact delivery ID. Delivery endpoints retain their existing authorization.
- Purchase Invoice creation reuses existing Vehicles permissions and approved-supplier validation. Finance review stays separate. Existing documents remain readable.
- No migrations, production dependencies, deployment changes, original database mutations, staging, commits, or publication.

## Ownership

- Backend maker: Program.cs, FinanceV2.cs, and corresponding backend rule tests; both upload locking and calendar status response.
- Calendar/responsive maker: OperationsCalendar and tests, API client calendar type/tests, App and HR navigation wiring, delivery deep-link handling, and only calendar/Loan/Delivery-header CSS hunks.
- Purchase Invoice maker: VehiclePage and its tests only.
- Main task: documentation, disposable acceptance harness, integration verification, and result reporting.
- Separate reviewer: final finance/security and correctness review; no implementation ownership.

## Completion evidence

Preserve the previous failing report. Run targeted regressions, then full back-office tests, type checking and build, backend tests, and disposable Docker/API/browser acceptance after makers finish. Verify Pending versus terminal collection states, upload/reconcile/reverse serialization, structured Purchase Invoice creation, authorized exact-delivery navigation, empty-day mobile drawer, white legible Loan steps, and the Delivery header at 1280/820/390/320 pixels. Record remaining limitations without counting them as passes. Existing Docker business services and databases stay untouched.
