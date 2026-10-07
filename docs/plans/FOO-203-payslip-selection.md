# FOO-203: Selected payslip preparation

## Scope

Use one payroll month and explicit staff selection. Prepare new drafts separately from recalculating an existing draft or eligible legacy slip. Show existing and proposed amounts and explain statutory resets. Retain current ownership, approval and historical lock rules.

## Contract and safeguards

- Preview returns one candidate per payroll profile with its existing slip, proposed draft, allowed action, blocking reason and source fingerprint.
- Preparation requires a nonempty, unique selection containing staff ID, action and preview fingerprint. Recheck all selections before saving any of them.
- An unselected staff member is never written. New preparation cannot replace a slip. Recalculation cannot bypass published or historical locks.
- No schema migration or statutory calculation engine is required. Recalculation still replaces the editable record and explicitly describes that consequence.

## UI

Month selector, staff list, explicit selection and review confirmation. Details and approval actions live with the selected payslip. Payroll profiles and period creation move into secondary setup. Incomplete amounts are labelled provisional pay, not final net salary.

## Verification

Extend existing payroll tests for selected-only preparation, stale previews, explicit recalculation and atomic rejection. Check API request contracts, run payroll/frontend tests and build, then inspect synthetic populated phone, tablet and desktop states. Obtain an independent review before handoff.
