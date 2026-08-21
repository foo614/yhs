# YS Heng Admin Process Review

Snapshot date: 2026-08-17

Scope: current working tree, including uncommitted files

Evidence level: static source, tests, and documentation review; no authenticated browser, database, or production verification

## Enhancement update - 2026-08-19

FOO-65 implements the first high-risk remediation pass. Post-change static rating: **8/10** (up from 6/10). The rating remains capped because the current build has not been exercised through the authenticated multi-role browser matrix or deployed.

| Reviewed gap | Source status |
| --- | --- |
| Direct vehicle status bypass | Resolved: general vehicle create/update cannot set workflow-owned status; loan/payment workflows derive it. |
| Loan completion without current buyer documents | Resolved: `Done` requires Status Receipt, VOC, AP Document, and Loan Document for the same buyer and vehicle. |
| Reconciliation without buyer / self-asserted management review | Resolved: reconciliation requires a canonical buyer, and Boss/Admin uses a dedicated audited review action. |
| Repair self-approval / forged approver | Resolved: general repair CRUD preserves or invalidates server-owned approval; Boss/Admin uses a dedicated actor-stamped action. |
| Delivery without confirmed buyer | Resolved: API validation and create-form eligibility require a canonical vehicle buyer. |

Automated evidence: API tests 159/159, back-office tests 160/160, and the back-office production build pass. Runtime role checks remain pending because the running local containers predate this working-tree implementation.

## Executive result

The admin portal has a reasonable module set for a second-hand-car dealership. The strongest implemented controls are public vehicle visibility, lead ownership, delivery release readiness, finance reconciliation prerequisites, cash-custody role separation, and audit recording.

The end-to-end flow is only partially correct because ordinary vehicle editing can set terminal sale status, several downstream records can be completed without preserving the same confirmed buyer-vehicle relationship, and some approval/evidence fields are client-asserted. Loan completion also treats its document check as information rather than a server-enforced, current-loan gate, and high-cost repair approval is not separated from the Repair role performing the work.

## Findings

### P1 - Sales can directly set a vehicle to Sold

- Module or handoff: Vehicle -> Sold
- Evidence: ordinary vehicle create/update accepts the client-supplied status at `services/api/src/YSHeng.Api/Program.cs:235` and `services/api/src/YSHeng.Api/Program.cs:261` under the `Vehicles` policy, whose writers include Sales at `services/api/src/YSHeng.Api/Features/BusinessRules.cs:70`. The create and edit forms expose `Available`, `LoanProcessing`, and `Sold` at `apps/backoffice/src/modules/vehicles/VehiclePage.tsx:1406` and `apps/backoffice/src/modules/vehicles/VehiclePage.tsx:1745`.
- Process impact: Sales can bypass confirmed-buyer, loan/cash-sale, delivery, reconciliation, and finance review and place inventory directly in its terminal sale state.
- Expected rule: `LoanProcessing` and `Sold` should be server-derived from dedicated workflow operations; intake should not be able to assert terminal status.
- Current enforcement: neither UI nor API blocks the direct transition.
- Recommendation: restrict general vehicle create/update to permitted intake fields and statuses, and reserve workflow-derived statuses for dedicated server operations.
- Owner skill: `ysheng-plan-change`, `ysheng-api`, and `ysheng-backoffice`.
- Smallest validation: an authenticated Sales update from `Available` to `Sold` must be rejected without changing the vehicle.

### P1 - Loan completion can bypass required documents

- Module or handoff: Loan
- Evidence: `apps/backoffice/src/App.tsx:2374` chooses Approve and Mark Done from LOU flags without checking `documentChecks`; `services/api/src/YSHeng.Api/Features/BusinessRules.cs:997` validates links, submitted date, and LOU flags, while the separate completeness rule at `services/api/src/YSHeng.Api/Features/BusinessRules.cs:1756` is not called by the create/update endpoints at `services/api/src/YSHeng.Api/Program.cs:677` and `services/api/src/YSHeng.Api/Program.cs:692`.
- Process impact: staff can mark a loan `Done` while Status Receipt, VOC, AP Document, or Loan Document is missing. The checker also selects documents only by vehicle, so an older applicant's or prior loan's documents can satisfy the current record.
- Expected rule: `Approved` or at minimum `Done` must be blocked until the required document check is complete.
- Current enforcement: checklist display only; no completion gate in the API.
- Recommendation: associate required documents with the current loan and buyer, pass that set into loan transition validation, reject the protected terminal transition with structured missing-category errors, and disable the matching UI action using the same result.
- Owner skill: `ysheng-plan-change`, then `ysheng-api` and `ysheng-backoffice`.
- Smallest validation: an API test that attempts `Draft/Pending -> Done` with valid LOU flags but one missing category and expects `400`.

### P1 - Finance can reconcile and sell a vehicle without a confirmed buyer

- Module or handoff: Vehicle -> Finance -> Sold
- Evidence: `services/api/src/YSHeng.Api/Program.cs:828` checks only that the payment vehicle exists before applying finance validation; `services/api/src/YSHeng.Api/Features/BusinessRules.cs:1275` validates amounts and client-supplied reconciliation fields but not the vehicle's customer link; `services/api/src/YSHeng.Api/Features/BusinessRules.cs:1065` changes the vehicle to `Sold` when any linked payment is `Reconciled`. `Vehicle.CustomerId` remains optional at `services/api/src/YSHeng.Api/Domain/Models.cs:46`, while Finance can set `bossChecked` in the create/edit forms at `apps/backoffice/src/modules/finance/FinancePage.tsx:727` and `apps/backoffice/src/modules/finance/FinancePage.tsx:792`.
- Process impact: a vehicle can become terminal `Sold` with no canonical purchaser, and the Finance maker can self-assert that management reviewed the payment. This breaks customer history, delivery context, cash custody lookup, and approval traceability.
- Expected rule: reconciliation must reference the same confirmed buyer and vehicle used by fulfillment, and management approval must be a separately authorized server-derived action.
- Current enforcement: amount and text/boolean prerequisites are server-checked, but buyer assignment, independent approval identity, and workflow-owned evidence are not.
- Recommendation: define the canonical sale/buyer invariant, add a separate management approval action with authenticated actor/time, and validate payment-owned evidence before reconciliation.
- Owner skill: `ysheng-plan-change`, `ysheng-api`, and `ysheng-security-review`.
- Smallest validation: an API test that reconciles an otherwise valid payment for a vehicle with `CustomerId = null` and expects rejection without changing vehicle status.

### P1 - Repair staff can approve their own high-cost repair

- Module or handoff: Repair approval
- Evidence: `/repairs` is available to `Repair` at `apps/backoffice/src/access.ts:47`; the repair forms expose all approval states at `apps/backoffice/src/App.tsx:1935`, `apps/backoffice/src/App.tsx:2218`, and `apps/backoffice/src/App.tsx:2269`; both repair endpoints use the same `Repairs` policy at `services/api/src/YSHeng.Api/Program.cs:745` and `services/api/src/YSHeng.Api/Program.cs:757`. `RepairAuditStamp.Apply` at `services/api/src/YSHeng.Api/Program.cs:1895` does not require a different role or person and preserves a non-empty client-supplied `ApprovedBy` value at line 1912.
- Process impact: the employee recording or completing a repair can self-approve a cost at or above RM1,000, and a direct API client can supply the displayed approver identity. This weakens expense control and approval traceability.
- Expected rule: a high-cost repair should require a management or separately authorized checker distinct from the maker/completer.
- Current enforcement: server validates that high-cost completion has status `Approved`, but does not authorize or separate the approver.
- Recommendation: decide the approving role and whether self-approval is prohibited, then add a dedicated server transition that derives the approver identity from the authenticated actor rather than accepting approval fields in general repair updates.
- Owner skill: `ysheng-plan-change`, `ysheng-api`, `ysheng-backoffice`, and `ysheng-security-review`.
- Smallest validation: a policy/API test proving a Repair-only user cannot approve their own high-cost repair.

### P1 - Delivery can be released without a confirmed sale or buyer

- Module or handoff: Confirmed sale -> Delivery
- Evidence: the Delivery create/update endpoints validate only that the vehicle exists before delivery-specific fields at `services/api/src/YSHeng.Api/Program.cs:711` and `services/api/src/YSHeng.Api/Program.cs:726`; the create and edit forms offer the full vehicle lookup at `apps/backoffice/src/App.tsx:3480` and `apps/backoffice/src/App.tsx:3575`. `DeliverySchedule` has a vehicle link but no independent customer link in `services/api/src/YSHeng.Api/Domain/Models.cs:199`.
- Process impact: staff can prepare and release inventory that has no confirmed buyer or eligible loan/cash-sale path. Local release checks are strong, but old vehicle-wide documents can also satisfy a later delivery.
- Expected rule: delivery may skip a loan for a cash sale, but it must not skip a confirmed customer-vehicle relationship.
- Current enforcement: release evidence and documents are enforced; buyer assignment at entry is not.
- Recommendation: link delivery to the canonical sale/customer, make required evidence delivery-owned, filter eligible vehicles in the UI, and enforce the chosen financed/cash-sale prerequisite in the API.
- Owner skill: `ysheng-plan-change`, `ysheng-api`, and `ysheng-backoffice`.
- Smallest validation: a delivery create test for an existing vehicle with no customer link that expects rejection.

### P2 - Direct loan creation does not establish the canonical buyer link

- Module or handoff: Vehicle/Customer -> Loan
- Evidence: `WorkflowReferenceRules.ValidateLoan` permits a vehicle with no `CustomerId` at `services/api/src/YSHeng.Api/Features/BusinessRules.cs:997`; `WorkflowStatusRules.ApplyLoanStatus` changes only status and public visibility at `services/api/src/YSHeng.Api/Features/BusinessRules.cs:1050`. The Loan module can create a loan directly through `apps/backoffice/src/App.tsx:2666`, independently of the guided Vehicle-page handoff.
- Process impact: the loan can name a customer while the vehicle remains unassigned, so Customer 360, Delivery, Finance, and cash-custody flows may not agree on the buyer.
- Expected rule: activating the first valid loan should atomically establish or verify the vehicle's canonical customer link.
- Current enforcement: customer existence and mismatch are checked, but the missing vehicle link is not filled or rejected.
- Recommendation: centralize the buyer-link plus loan-start operation in the API and make both UI entry points use it.
- Owner skill: `ysheng-plan-change`, `ysheng-api`, and `ysheng-backoffice`.
- Smallest validation: an API integration test creating a pending loan for an unassigned vehicle and asserting the chosen invariant: atomic link or structured rejection.

### P2 - Workflow status order and reopen rules are not explicit

- Module or handoff: Loan, Delivery, Payment
- Evidence: edit/create forms expose the full status enum, such as Loan at `apps/backoffice/src/App.tsx:2519` and Delivery at `apps/backoffice/src/App.tsx:3485` and `apps/backoffice/src/App.tsx:3580`; backend rules validate terminal prerequisites but do not define a general transition graph.
- Process impact: staff may jump, reverse, or reopen states inconsistently. Some flexibility may be intentional for correcting legacy records, so the correct rule requires a product decision.
- Expected rule: define allowed forward, reject, cancel, correction, and reopen paths for each workflow and who can use them.
- Current enforcement: terminal conditions are partly enforced; sequence and recovery policy are unclear.
- Recommendation: document the intended transition graph before restricting it. Keep an explicit audited admin correction path if operationally required.
- Owner skill: `ysheng-plan-change`.
- Smallest validation: a table-driven business-rule test for the approved transition matrix.

### P2 - Publication and walk-in entry are not fully represented

- Module or handoff: Vehicle readiness and Leads
- Evidence: public inventory requires approval, visibility, and `Available` status at `services/api/src/YSHeng.Api/Features/BusinessRules.cs:136`, but not completed refurbishment or an explicit no-work-required decision. The in-portal system reference starts with Lead/Enquiry at `apps/backoffice/src/App.tsx:4467`, while the back-office lead endpoints provide list/update but no walk-in create path.
- Process impact: stock can be advertised before operational preparation is complete, and staff cannot record a walk-in through the same qualification/source history as public leads.
- Expected rule: management must explicitly define publication readiness, and every stated demand-entry path needs a supported record-creation flow.
- Current enforcement: public visibility is enforced; refurbishment readiness and back-office lead creation are not.
- Recommendation: decide whether management approval includes refurbishment acceptance, and either add a walk-in/general lead create path or document direct customer creation as the intentional exception.
- Owner skill: `ysheng-plan-change`.
- Smallest validation: source/API tests for the approved publication rule and a walk-in lead creation scenario.

## Module matrix

| Module | Business fit | Primary owner | Entry | Exit or handoff | Rating |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Governance support | Boss/Admin | Aggregated live workflow records | Prioritized reminders and module links | Correct by source; runtime unverified |
| Vehicles | Core stock and sales | Sales, Boss/Admin approval | Vehicle, owner, purchase data | Approved public stock or confirmed buyer handoff | Incorrect terminal-status control; publication rule partial |
| Repair | Core refurbishment | Repair, management checker needed | Existing vehicle and repair/supplier records | Final approved repair cost | Partial due to self-approval |
| Loan | Core financed-sale branch | Loan | Confirmed vehicle and customer | Approved/completed loan for delivery | Incorrect completion gate; buyer handoff partial |
| Delivery | Core fulfillment | Delivery | Confirmed sale and vehicle | Released vehicle with complete evidence | Strong local release gate; cross-module handoff incorrect |
| Finance & Collection | Core financial close | Finance; Sales for own cash custody | Confirmed sale/payment | Reconciled payment and sold vehicle | Buyer and independent-approval invariants incorrect |
| Customer 360 | Contextual support | Sales, Loan, Delivery, Finance | Canonical customer ID | Read-only cross-module context | Reasonable as contextual access; runtime unverified |
| Leads | Core demand intake | Sales | Public vehicle lead, general contact, or walk-in | Qualified lead linked to canonical customer | Correct by source |
| Audit Log | Governance support | Boss/Admin | Authenticated mutations | Searchable actor/action history | Correct by source; coverage should be regression-tested |
| HR Payroll / Self-service | Business support, not sales-critical | Staff and HR/Salary | Authenticated staff | Attendance, leave, payroll records | Reasonable separate support module |
| Settings / Admin | Governance support | Boss/Admin | Authorized administrator | Staff/RBAC, process reference, AI limits, catalogue, audit | Reasonable; high-risk controls need focused review |

## Correctly implemented strengths

- Public inventory requires management approval, public visibility, and `Available` status.
- Vehicle-specific public leads require a currently public, available vehicle; general enquiries have a separate path.
- Lead status ownership prevents unrelated sales staff from taking over an active lead.
- The guided Start Loan path links the buyer, makes the vehicle private, changes it to `LoanProcessing`, and opens the exact loan.
- Delivery release checks preparation, documents, evidence, notice, and expiry dates on the server.
- Payment reconciliation requires boss check, prepared documents, checklist validation, receipt number, invoice number, and duplicate checks.
- Cash custody separates collector and finance receiver/acceptor responsibilities and limits Sales visibility to their own handovers.
- Back-office mutations generally write actor-attributed audit records.

## Business decisions needed before fixes

1. Which role approves high-cost repairs, and must the checker be a different person from the repair maker/completer?
2. Is loan document completeness required at `Approved`, at `Done`, or both?
3. What is the canonical representation of a confirmed sale: `Vehicle.CustomerId`, a new sale/order record, or another existing record?
4. Which status reversals and administrative correction paths are legitimate for Loan, Delivery, and Payment?
5. Must delivery occur before finance reconciliation, or may fully paid vehicles be marked sold before physical handover?

## Recommended implementation sequence

1. Define the canonical buyer-vehicle sale invariant and status-transition decisions.
2. Prevent direct vehicle status bypass through general vehicle CRUD.
3. Close the server-side, workflow-owned loan document completion gap.
4. Prevent unassigned vehicle reconciliation/delivery and make management approval server-derived.
5. Add maker/checker authorization for high-cost repair approval.
6. Align UI actions with the final server transition rules and add focused API/back-office tests.

## Reviewer agent

Use custom agent `ysheng_admin_process_reviewer`, backed by `$ysheng-admin-process-review`.

Suggested request:

```text
Use the YS Heng admin process reviewer. Re-inventory every current back-office module, trace both financed and cash-sale paths from stock/lead entry to sold status, and report module reasonableness, incorrect or missing gates, role separation, documents, exceptions, and cross-module handoffs. Review only; do not edit files.
```
