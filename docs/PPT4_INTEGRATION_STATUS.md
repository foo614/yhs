# PPT4 integration status

Scope: confirmed slides 23-32 and 41-42, with operational table page-size controls. Slides 43 and 45, insurance AI, and the four automatic Delivery document generators remain on hold.

## Integrated locally

- Loan: existing/new buyer intake with IC image/PDF and cash-buyer path; case taker and document privacy; original documents required and edited copies optional; per-bank submission/result/LOU; reviewed LOU terms and Broker final selection; deal fields; optional agreement date; current-taker follow-up reminders and Dashboard News.
- Delivery: simplified workflow, read-only buyer-matched selling price, unified retained files, manual insurance/eAuto/JPJ fields, road-tax review, date sorting/history lookup, and queued booking notifications.
- Repair: receipt-linked review list, reject/approve/pay guards, safe Pending corrections, date/status filters and total over all filtered records.
- Operational pagination: default 10, selectable 10/20/30, including mobile row counts.
- Public FAQ: gross-salary browsing guide with explicit rough calculation; no loan-approval or repayment-affordability claim.

## Verification

- Integrated back-office 529 tests passed; production build passed.
- Loan, Delivery and Repair responsive checks passed at 390, 820 and 1440 pixels; final Loan layout rerun passed all three sizes.
- Synthetic Loan interactions passed at all three sizes: customer modes, cash selection, IC reset on cancel/change, bank creation/submission and LOU controls.
- First combined backend regression: 913 passed, no skipped tests, including isolated PostgreSQL.
- Independent integration review then reproduced and fixed two issues: optional agreement date blocking completion, and Delivery-owned VOC access being blocked by Loan privacy rules. Focused checks passed 3/3, including real PostgreSQL auth/upload/content and denial of private Loan VOC access.
- Final full backend rerun after both fixes: 913 passed, zero failures and zero skips, including isolated PostgreSQL.
- Earlier FAQ build/type/input checks and mobile browser check passed in the Loan worktree.

## Boundaries and remaining verification

All work remains unstaged, uncommitted, unmerged and undeployed. No real WhatsApp messages were sent; queued notification and binding tests are not live-delivery proof. Production Meta parameter/attachment delivery remains a separate operational check.

A whole-solution no-restore build encountered missing AppHost restore assets; API and test projects compiled and ran. Existing package security advisories and frontend chunk-size/deprecation warnings were reported without unrelated dependency changes.
