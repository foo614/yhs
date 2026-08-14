# Post-MVP Enhancement Review

Linear parent ticket: `FOO-9`

Covered review tickets: `FOO-10`, `FOO-11`, `FOO-12`, `FOO-13`, `FOO-14`, `FOO-15`, `FOO-16`

Date: 2026-06-28

## Purpose

This review turns the post-MVP module ideas into an implementation backlog with business value, affected users, risk, acceptance criteria, and estimated effort.

The current MVP baseline is documented in `docs/REQUIREMENTS_TRACE.md`, `docs/SOURCE_REQUIREMENTS_CROSSCHECK.md`, `docs/API.md`, and `docs/IMPLEMENTATION.md`. This file focuses on what should come after that baseline, not on re-scoring completed MVP work.

## Current MVP Baseline

- Public Website already supports public available inventory, vehicle detail pages, vehicle photos, lead capture, and public-safe DTOs.
- Vehicles already support intake, edit flow, owner/customer links, purchase invoices, public listing controls, OCR job storage, stock location, and stock movement history.
- Finance already supports payment tracking, receipt and invoice references, manual reconciliation gates, daily spend, broker commission, debt recovery, payment vouchers, document uploads, and role-gated access.
- Delivery already supports scheduling, inspection references, preparation checklist, document upload checks, release readiness, release evidence display, and 2-day notices.
- Repair/Supplier already supports repair jobs, repair parts, supplier invoices, duplicate invoice checks, wrong-plate checks, repair-owned uploads, and dashboard cost impact.
- Dashboard already supports summary metrics, reminders, stock aging, top supplier, sales performance, and profit metrics.
- Security/Admin already supports Identity cookie auth, role policies, staff management, disabled-user handling, audit log filters, and role enforcement.

## Prioritized Backlog

| Priority | Ticket | Slice | Reason |
| --- | --- | --- | --- |
| 1 | `FOO-17` | Public website SEO, enquiry attribution, and gallery polish | High user value, clear scope, and can preserve public data boundaries. |
| 2 | `FOO-22` | Dashboard drill-downs and risk widgets | Helps managers act on existing metrics before adding deeper workflow complexity. |
| 3 | `FOO-21` | Supplier master, repair approval, and invoice aging | Improves margin control but touches cost and finance-sensitive data. |
| 4 | `FOO-19` | Finance receipt/payment export and reconciliation hardening | Important, but should follow or coordinate with the manual accounting-export workflow. |
| 5 | `FOO-23` | Permission audit, role review, and export controls | High value and high risk; needs explicit security review. |
| 6 | `FOO-18` | Vehicle master profile, OCR review, and stock movement history | Broad cross-module surface; useful after the active vehicle workflow work settles. |
| 7 | `FOO-20` | Delivery document expiry and release evidence completeness | First release evidence slice is implemented; expiry and override work should stay separate. |

## Public Website

Review ticket: `FOO-10`

Implementation ticket: `FOO-17`

Business value:

- Improves search discovery for vehicle inventory and detail pages.
- Helps Sales understand which page, vehicle, or campaign produced an enquiry.
- Makes vehicle photos easier for customers to inspect before contacting the business.

Affected users:

- Prospective customers.
- Sales staff who follow up on public leads.
- Admin users who monitor lead quality and public inventory presentation.

Risk:

- Medium. The public site must not expose purchase price, finance, repair, audit, or internal workflow data through metadata, lead attribution, or vehicle DTOs.

Acceptance criteria:

- Public inventory and vehicle detail pages expose useful title, description, canonical, and social metadata.
- Lead submissions persist safe source context such as source page path, vehicle id, and optional UTM values without breaking the existing form.
- Vehicle gallery supports predictable thumbnail selection, mobile inspection, and the current empty-photo fallback.
- Public API responses remain limited to public-safe fields.
- Front-office tests and build pass.

Estimated effort:

- 3 points.

## Vehicles

Review ticket: `FOO-11`

Implementation ticket: `FOO-18`

Business value:

- Gives operations one reliable place to understand vehicle identity, ownership, document status, listing status, and movement history.
- Reduces manual checking before finance, repair, delivery, or public listing actions.
- Makes OCR output reviewable instead of treating extracted data as informal notes.

Affected users:

- Vehicle staff.
- Sales, Finance, Delivery, and Repair users who depend on vehicle state.
- Admin users who audit stock movement and document handling.

Risk:

- High. Vehicle data feeds public inventory, finance, delivery, repairs, dashboard metrics, and audit history.

Acceptance criteria:

- Vehicle profile shows identity, ownership, public listing, document, finance, repair, and delivery signals without exposing internal data publicly.
- OCR-extracted fields can be accepted or rejected with reviewer, timestamp, and audit context.
- Stock movement events record actor, timestamp, previous value, new value, and reason.
- Public vehicle APIs remain public-safe.
- Backend and back-office tests cover the new workflow states and contract changes.

Estimated effort:

- 5 points.

## Finance

Review ticket: `FOO-12`

Implementation ticket: `FOO-19`

Business value:

- Reduces manual follow-up after invoice generation by making payment evidence, receipt state, sync state, and reconciliation blockers visible.
- Gives Finance and Admin users a clearer recovery path when reconciliation is blocked.
- Creates room for future statutory or external-accounting phases without overloading the MVP manual checklist fields.

Affected users:

- Finance users.
- Admin users.
- Sales users who need payment and delivery readiness context.

Risk:

- High. Finance changes can affect settlement, profit reporting, audit history, and sensitive integration data.

Acceptance criteria:

- Finance can see whether payment evidence, receipt state, and internal reconciliation checks are complete.
- Reconciliation clearly shows blocked reason and allowed recovery action.
- Finance or Admin override requires a reason and audit trail.
- Sensitive payloads, credentials, and external API secrets are not logged.
- Backend and back-office tests cover success, blocked, failed, and override states.

Estimated effort:

- 5 points.

Dependency:

- Coordinate with the manual accounting-export workflow before finalizing receipt/payment tracking states.

## Delivery

Review ticket: `FOO-13`

Implementation ticket: `FOO-20`

Business value:

- Reduces release risk by making required handover evidence visible before the vehicle leaves the business.
- Helps Delivery and Admin users distinguish checklist readiness from uploaded evidence readiness.
- Gives the team a path to add expiry warnings later without changing the whole release workflow at once.

Affected users:

- Delivery staff.
- Sales and Finance users who depend on release timing.
- Admin users who review blocked handovers.

Risk:

- Medium. Readiness logic can block valid releases if expiry or evidence semantics are too broad.

Acceptance criteria:

- Delivery detail shows required evidence and latest upload metadata in one place.
- Release action is blocked when mandatory evidence is missing or expired, with clear reasons.
- Any override path requires Admin approval, a reason, and audit trail.
- Delivery table or detail view shows readiness and expiry warnings.
- Backend and back-office tests cover ready, missing, expired, and override states.

Estimated effort:

- 3 points for the first release evidence and warning slice.
- Larger if expiry migration or Admin override is included.

Status:

- The first release evidence slice is documented in `docs/DELIVERY_ENHANCEMENT_REVIEW.md` and implemented locally for the existing readiness response and Delivery detail view.

## Repair And Supplier

Review ticket: `FOO-14`

Implementation ticket: `FOO-21`

Business value:

- Improves margin control by making supplier identity, repair cost approval, and supplier invoice aging visible before profit is finalized.
- Reduces duplicate supplier names and duplicate invoice handling.
- Helps Finance and Admin users find overdue or unmatched supplier invoices.

Affected users:

- Repair staff who create repair jobs and supplier invoice records.
- Finance users who reconcile cost and payment readiness.
- Admin users who approve high-cost work and review margin.

Risk:

- High. Supplier and repair costs affect profit calculation, finance reporting, and audit history.

Acceptance criteria:

- Supplier records can be reused across supplier invoices and repair jobs without duplicate free-text entries.
- High-cost repair items require approval before being treated as final cost.
- Supplier invoice aging shows overdue, due soon, paid, and unmatched states.
- Profit and finance summaries use approved/current cost state consistently.
- Backend and back-office tests cover supplier reuse, approval gate, aging buckets, and permissions.

Estimated effort:

- 5 points.

## Dashboard

Review ticket: `FOO-15`

Implementation ticket: `FOO-22`

Business value:

- Turns dashboard numbers into operational actions.
- Helps managers move from summary cards to the exact vehicles, payments, deliveries, repairs, or leads needing attention.
- Makes stale or failed dashboard data obvious instead of quietly showing misleading fallback values.

Affected users:

- Admin users.
- Finance, Sales, Delivery, and Repair users who follow up on dashboard reminders.

Risk:

- Medium. Dashboard aggregates many modules, so links and counts must match backend definitions and permission rules.

Acceptance criteria:

- Each actionable dashboard metric links to the correct filtered back-office module view.
- Finance risk widgets match backend finance state definitions and respect Finance permissions.
- Users without Finance permission do not see sensitive finance detail.
- Empty, loading, and error states are explicit and do not show fallback data as live data.
- Back-office tests cover links, permission behavior, and error states.

Estimated effort:

- 3 points.

## Security And Admin

Review ticket: `FOO-16`

Implementation ticket: `FOO-23`

Business value:

- Reduces accidental privilege and export risk as more staff use the system.
- Gives Admin users evidence for role changes and sensitive data access.
- Makes permission boundaries easier to audit after new modules and finance workflows are added.

Affected users:

- Admin users.
- Department leads.
- All back-office staff whose access depends on role assignment.

Risk:

- High. Auth, role, audit, and export behavior are security-sensitive and need explicit review gates.

Acceptance criteria:

- Role permissions are documented and verified against backend policies and back-office navigation visibility.
- Sensitive exports require the correct role and write an audit record.
- Staff role changes are visible in audit history with actor, timestamp, previous roles, and new roles.
- Unauthorized users receive structured API errors and no sensitive payload.
- Security review plus backend and back-office tests cover role and export boundaries.

Estimated effort:

- 5 points.

## Review Completion Criteria

The review tickets are complete when:

- Each module has business value, affected users, risk, acceptance criteria, and estimated effort recorded.
- Each module has a follow-up implementation ticket or a clear reason to defer implementation.
- High-risk implementation tickets remain separate from this review document and keep their own approval, validation, and security gates.
- Linear review tickets are commented with this document path and moved to Done after the document is validated.
