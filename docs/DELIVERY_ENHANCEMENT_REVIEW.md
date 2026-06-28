# Delivery Enhancement Review

Linear ticket: `FOO-13`

Date: 2026-06-28

## Current State

The Delivery module already supports the MVP release workflow:

- Delivery records track vehicle, PIC, workflow status, schedule date, inspection references, preparation checklist flags, notification flags, and handover references.
- The API blocks Ready for Release and Released statuses until inspection, inspection report, preparation checklist, insurance, road tax, windscreen insurance, and the 2-day notice are complete.
- The API also requires uploaded Policy and Road Tax Receipt document blobs before a delivery can be marked Ready for Release or Released.
- The back office exposes delivery scheduling, editing, readiness display, delivery-owned document uploads, detail checklist updates, and quick actions for Notify, Notice, Ready, and Release.
- Dashboard reminders include delivery preparation follow-up before the scheduled date until the 2-day notice is sent.

## Enhancement Themes

### 1. Document Expiry Tracking

Business value:

- Reduces release-day surprises caused by expired policy, road tax, inspection, or windscreen evidence.
- Gives Delivery and Admin users an earlier warning before a completed checklist becomes stale.

Affected users:

- Delivery staff who prepare handover documents.
- Admin users who supervise blocked deliveries and audit exceptions.
- Finance or Sales staff when customer handover timing depends on valid release documents.

Risk:

- Medium. This adds date semantics to document evidence and can affect release eligibility.
- The implementation must avoid treating older existing documents as invalid without a clear backfill or migration decision.

Acceptance criteria:

- Delivery staff can record expiry dates for release-critical documents: Policy, Road Tax Receipt, and Windscreen policy or reference.
- The Delivery detail view shows valid, expiring soon, and expired states for each release-critical document.
- Ready for Release and Released are blocked when a required release document is expired.
- Dashboard reminders include upcoming expiry warnings for active, unreleased deliveries.
- Existing delivery records without expiry dates remain editable and show a clear "expiry missing" state instead of failing silently.

Estimated effort:

- Medium. Expected changes span API model/storage, validation rules, back-office forms, readiness display, reminders, docs, and tests.

### 2. Release Evidence Completeness

Business value:

- Makes the handover packet auditable before a vehicle leaves the business.
- Prevents a delivery from looking complete when only checklist booleans were ticked but supporting evidence is missing.

Affected users:

- Delivery staff who upload and verify handover documents.
- Admin users who review delivery readiness and audit history.
- Customers indirectly, because release blockers are found before handover day.

Risk:

- Medium. The current API already requires Policy and Road Tax Receipt uploads; expanding evidence rules can block releases that previously passed.
- The team must decide whether `DeliveryDocument` is a mandatory general evidence file or an optional supporting attachment.

Acceptance criteria:

- The release readiness endpoint returns a grouped evidence summary, not only missing document categories.
- Delivery detail shows required evidence, uploaded file metadata, uploader, upload time, and missing/invalid states.
- Release is blocked when mandatory evidence is missing.
- The checklist wording distinguishes between "document prepared" and "document uploaded/verified".
- Tests cover complete evidence, missing evidence, and stale or wrong-category uploads.

Estimated effort:

- Small to medium if the scope only improves readiness display around existing document blobs.
- Medium if new evidence categories, verification state, or audit review fields are added.

### 3. Delivery Exception Handling

Business value:

- Gives staff a controlled way to record delays, customer no-shows, failed inspection, missing documents, and management-approved overrides.
- Keeps operational blockers visible instead of hiding them in notes, status confusion, or repeated schedule edits.

Affected users:

- Delivery staff who handle day-to-day exceptions.
- Admin users who approve risk-sensitive releases or investigate delays.
- Sales, Loan, and Finance users who need to understand why a handover is blocked after their own workflow is complete.

Risk:

- Medium to high if overrides can bypass release gates.
- Any override path needs role limits, audit logging, and clear UI language so it does not become a shortcut around required documents.

Acceptance criteria:

- Delivery staff can mark an active delivery with a structured exception reason and follow-up date.
- Exception state appears in the Delivery table, detail view, and dashboard reminders.
- Admin users can resolve an exception with notes and audit trail.
- Any release override is limited to Admin users, records the reason, and still keeps the normal readiness result visible.
- Tests cover exception creation, resolution, reminders, and authorization for override behavior.

Estimated effort:

- Medium for exception tracking without release overrides.
- Large if the scope includes Admin release overrides, because it touches authorization, audit policy, UI workflow, and tests.

## Recommended Slice

Start with release evidence completeness before expiry tracking or override handling.

Reason:

- The current module already has document blobs, readiness checks, and Delivery-owned upload permissions.
- Improving evidence visibility adds operational value without introducing a new exception subsystem.
- It creates the right UI and API shape for later expiry tracking.

Suggested first implementation slice:

- Extend the release readiness response to return required evidence items with category, present/missing state, and latest upload metadata.
- Update the Delivery detail view to show that evidence list beside the existing checklist.
- Keep the existing release blocking behavior unchanged except for clearer messages.
- Add backend and back-office tests for the expanded readiness payload.

Done means:

- Delivery staff can open a delivery and see exactly which release documents are present or missing.
- The readiness endpoint and UI agree on the release evidence state.
- Existing release gates still block incomplete deliveries.
- Tests and API docs cover the expanded readiness contract.

## Local Implementation

Implemented after approval:

- The release-readiness endpoint now keeps `isReady` and `missingCategories` while adding an `evidence` list for required release documents.
- Evidence rows include category, present or missing state, and latest upload metadata when a document exists.
- The Delivery detail view shows required release evidence beside the existing uploaded document list.
- Backend and back-office tests cover the expanded readiness contract.
