---
name: ysheng-admin-process-review
description: Review every current YS Heng back-office module and end-to-end second-hand-car sales process for business fit, state-flow correctness, role separation, document and evidence gates, server enforcement, auditability, and cross-module handoffs. Use for admin portal module reviews, workflow audits, process-gap analysis, module rationalisation, or checks that implemented operations match a reasonable used-car sales journey. This workflow is read-only and does not implement fixes.
---

# YS Heng Admin Process Review

## Purpose

Determine whether each current admin module is necessary, understandable, correctly sequenced, and enforced by the real frontend and API. Review both the module in isolation and its handoffs across the sales journey.

## Required context

Read these files before reviewing:

- `AGENTS.md`
- `codex-agent.md`
- `.codex/skills/ysheng-project/SKILL.md`
- `.codex/skills/ysheng-backoffice/SKILL.md`
- `apps/backoffice/src/access.ts`
- The route and module composition in `apps/backoffice/src/App.tsx`
- The relevant API client types in `apps/backoffice/src/api.ts`
- The matching backend models, endpoints, rules, and tests
- `docs/API.md` and `docs/REQUIREMENTS_TRACE.md` when they cover the reviewed flow

Use `.codex/skills/ysheng-security-review/SKILL.md` when a finding involves auth, finance, uploads, public data, persistence, secrets, or role policy.

## Boundaries

- Remain read-only. Do not edit product code or documentation during the review.
- Do not stage, commit, push, deploy, run Docker, touch databases, or handle credentials, cookies, private records, or secrets.
- Do not bypass back-office authentication.
- Do not claim runtime, browser, test, or production proof unless it was obtained in the current run.
- Treat the current working tree as a source snapshot, not as proof of the deployed product.
- Recommend changes separately. Require human approval before implementation, especially for finance, auth, roles, uploads, persistence, or public-data behavior.

## Discover the current modules

Build the module inventory from source on every run. Reconcile:

1. Route declarations and visible navigation.
2. Role access and per-role data keys.
3. Rendered page components and tabs.
4. API methods and backend endpoint policies.
5. Domain records, state enums, business rules, and tests.

Do not assume a route is a standalone module merely because it exists. Record whether it is visible navigation, contextual access, an embedded tab, or a support surface.

## Model the real sales journey

Allow two valid entry paths:

- Stock path: vehicle intake -> management approval -> refurbishment -> public listing.
- Demand path: public vehicle enquiry, general contact enquiry, or walk-in lead -> qualification -> canonical customer.

Require the paths to converge on one confirmed customer-vehicle relationship before downstream fulfillment. Review both financed and cash-sale variants:

```text
Vehicle intake -> approval -> refurbishment -> available public stock
                                              |
Lead/enquiry -> qualification -> customer ----+
                                              v
                              confirmed buyer and vehicle
                                  |                 |
                                  v                 v
                             loan workflow      cash/payment path
                                  \                 /
                                   v               v
                                   delivery preparation
                                           |
                                           v
                                 finance reconciliation
                                           |
                                           v
                                  sold and audit-complete
```

Treat this as a review model, not an instruction to force every sale through a loan.

## Review every module

For each current module, record:

1. **Business fit**: core sales, operational support, governance support, optional extension, duplicated, or unclear.
2. **Owner and users**: responsible department, allowed roles, and whether access matches the responsibility.
3. **Entry criteria**: required prior records, approvals, buyer link, documents, money, or evidence.
4. **State flow**: valid states, intended order, allowed rejection/rework paths, terminal state, and reopening behavior.
5. **Enforcement**: distinguish UI guidance from API/server validation. A disabled button alone is not a business-rule gate.
6. **Record integrity**: canonical vehicle, customer, owner, repair, loan, delivery, payment, and document links.
7. **Maker/checker separation**: identify when the same role can create and approve a high-consequence record.
8. **Documents and evidence**: required categories, ownership, expiry, completeness, and replacement behavior.
9. **Handoffs**: exact output consumed by the next module, including status, linked IDs, dates, and responsibility.
10. **Exceptions**: cash sale, rejected loan, cancelled delivery, returned payment, repair rejection, duplicate customer, and correction/reopen paths.
11. **Oversight**: audit entries, reminders, dashboard visibility, and management checks.
12. **Verification**: source, tests, API behavior, and any browser state actually observed.

## Cross-module invariants

Check these explicitly:

- Only management-approved, public, `Available` vehicles appear in public inventory.
- A vehicle-specific public lead references a currently visible, available vehicle.
- Customer qualification creates or reuses one canonical customer without silently duplicating it.
- Loan, delivery, and payment records refer to the same confirmed buyer and vehicle.
- Terminal vehicle states are derived by dedicated workflow rules, not accepted through general vehicle create/update fields.
- Starting an active loan makes the vehicle private and unavailable to other buyers.
- Loan completion cannot bypass its required document and LOU gates, and documents belong to the current loan/buyer rather than only the vehicle.
- High-cost repair completion cannot bypass approval; approval authority and approver identity must be derived on the server.
- Delivery release cannot bypass preparation, delivery-owned documents, evidence, notification, and expiry gates.
- Payment reconciliation cannot mark an unassigned or contradictory sale as sold; management checks and evidence must not be client-asserted booleans.
- Cash custody keeps collector and receiver/approver responsibilities separate.
- High-consequence mutations are authorized on the server and auditable by actor.
- Dashboard and reminders derive from source records rather than separate manually maintained status.
- Database ownership and cardinality prevent old or duplicate workflow records from satisfying a current sale.
- Rejection, cancellation, reversal, correction, and reopen paths restore a coherent vehicle state.

## Rate implementation

Use one result per module or handoff:

- `Correct`: purpose, flow, server enforcement, and handoff are supported by evidence.
- `Partial`: the main path exists but a gate, exception, handoff, or proof is incomplete.
- `Incorrect`: the implementation allows a materially contradictory or unsafe process.
- `Unclear`: business intent or evidence is insufficient; state the decision needed.

Use severity:

- `P0`: data loss, auth bypass, secret exposure, public private-data leak, or destructive operational risk.
- `P1`: a core sale can be completed incorrectly, a financial/approval gate can be bypassed, or records can materially contradict each other.
- `P2`: an important process, exception, reminder, or handoff is incomplete or ambiguous.
- `P3`: clarity, discoverability, low-risk efficiency, or documentation improvement.

## Output

Return findings first, ordered by severity. For each finding include:

```text
Severity: P0/P1/P2/P3
Module or handoff: Name
Finding: Short title
Evidence: Exact file and line, test, endpoint, or observed route state
Process impact: Concrete staff, customer, vehicle, money, or compliance consequence
Expected rule: The business invariant that should hold
Current enforcement: UI, API, both, or neither
Recommendation: Smallest reasonable next change or decision
Owner skill: ysheng-backoffice, ysheng-api, ysheng-security-review, or ysheng-plan-change
Smallest validation: One focused test or manual scenario
```

Then provide a module matrix with business fit, owner, entry, exit/handoff, implementation rating, and evidence. End with:

- Correctly implemented strengths.
- Business decisions still needed.
- Routes and files reviewed.
- Runtime or authentication limitations.
- A smallest prioritized implementation sequence, without making edits.

If no actionable findings exist, say so explicitly and describe the residual unverified risk.
