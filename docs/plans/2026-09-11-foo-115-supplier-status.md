# FOO-115 supplier operational status

## Scope and contract

Replace supplier maker-checker approval with Active/Inactive operational status. New suppliers are Active. Existing Draft, Approved and Active suppliers migrate to Active; Inactive suppliers remain Inactive. Preserve supplier IDs, AutoCount creditor mapping, historical approval metadata and audit entries.

Remove supplier approval API, UI, Finance queue and guidance. Keep existing module authorization and all repair-cost, payment and accounting confirmation controls. Active suppliers may be newly selected in purchase invoices, repairs, supplier invoices and delivery accounting. Existing records retain their inactive supplier references and display names.

FOO-116 owns Repair manual amount/date fields and vehicle selector changes; those are outside this task.

## Implementation and risk

Update domain/client status contracts, persistence migration, supplier mutations and audit events, dependent selection validation, Supplier Master forms/filters, Finance queue, exports and module guides. Historical records must not lose their supplier identity when status changes. The data migration must preserve old approval evidence and avoid interpreting old numeric enum values as different states.

## Verification and delivery

Run focused backend and back-office regression tests, type checking and production build. Review the final diff for historical references, persistence, auth/finance boundaries and public output. Run a separate read-only local Codex CLI review before opening a ticket-linked PR from current main. Wait for CI and CodeQL; merging and deployment require separate authorization.

## Local migration evidence

Executed the supplier schema SQL extracted from `SeedData.cs` against an isolated PostgreSQL 17 container. Legacy Draft/Approved/Inactive/Active fixtures converted to Active/Active/Inactive/Active. Original approval values, approver metadata, creditor codes and referencing rows were unchanged. After deactivating one converted supplier and reactivating an inactive supplier, rerunning the upgrade preserved both edits. The fresh-schema path also passed and defaulted a new supplier to Active.

An isolated API/PostgreSQL fixture also passed HTTP checks for server-owned Active creation, activation/deactivation, stable ID/creditor code, inactive supplier rejection on new purchase/supplier invoices and delivery accounting, retained inactive supplier invoice edits, historical supplier listing, removed approval endpoint (404), and unauthenticated Supplier Master access (401). Relaunching the API in Production with `SeedData__Enabled=false` converted all four legacy states and preserved approval metadata and creditor codes; readiness returned 200.

Final local validation: 335 backend tests and 406 back-office tests passed; back-office type checking and both app production builds passed. The first front-office build encountered a transient Windows `lstat` error; its retry passed without source changes. Browser verification showed deactivation changing the supplier to Inactive and the existing invoice continuing to display `Inactive; retained record`. The purchase-invoice editor uses the same historical selection behavior.

Concurrent PostgreSQL migration invocations passed after adding a table lock around the one-time column check and conversion. The final backend rerun still passed 335 tests. The smoke script also passed PowerShell syntax validation; the shared full Docker smoke suite was not run.

A separate read-only local Codex CLI review (Terra XHigh) found one Finance-guide ownership issue. The guide now explicitly directs staff to Repair/BossAdmin for Supplier Master changes; its eight tests passed. A focused read-only Terra follow-up review found no actionable remaining issues and confirmed the migration locking/idempotence correction.
