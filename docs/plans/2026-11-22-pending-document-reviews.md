# Pending document review queue

Approved scope: Boss/Admin Current Work shortcut, permission-scoped stored OCR queue, and resume through the existing linked Repair receipt and Loan LOU workflows. No production release is requested.

- Derive the shortcut count and drawer rows from one protected queue response. Omit unsupported or no-longer-actionable jobs entirely from this shortcut, drawer and count, including on phones. Preserve their original documents and history in the source module.
- List original filename, linked vehicle/record, source and capture time. Do not return raw OCR values in the queue projection.
- Revalidate a row before opening and before its first application. Load the original saved extraction and document; never upload or call the OCR provider to resume.
- Preserve module authorization, record validation, manual correction, application order, audit and existing partial-save retries. Conflicting replay must not overwrite an applied target.
- Remove duplicate global pending labels from the lower monitoring panel; retain its analytics and capacity data.
- Do not change unrelated Dashboard, navigation, upload validation, schema or seed data.

Verification: persisted endpoint authorization and exclusions/count agreement; existing Repair/Loan application and stale/replay tests; shared OCR partial-save tests; browser queue, original-document preview, editable resume/save, no upload/OCR calls, and unauthorized role at phone/tablet/desktop widths.

## Verified local result

- Frontend: 569 tests and production build passed. Responsive checks passed at 390, 820 and 1440 pixels.
- Backend: 37 targeted tests passed against real isolated PostgreSQL with no skips; the final malformed-history eligibility regression also passed.
- Browser against the real local API/PostgreSQL: Repair and Loan flows each completed at 390 and 1440 pixels after manual edits. Original document links and saved values were verified independently; no duplicate targets, uploads or OCR calls occurred. Processed jobs returned stale-resume 409 and left the actionable queue.
- Finance role: both queue endpoints returned 403; the shortcut was hidden and no queue request was made at phone and desktop widths. Loading, unavailable, retry and empty states were checked separately.
- UI and security review findings were corrected. Unsupported historical documents remained stored and absent from the queue/count.
- Local implementation only: no staging, commit, push, merge or deployment. Temporary test services were stopped with their isolated data preserved.

Changed files:

- `apps/backoffice/src/App.tsx`
- `apps/backoffice/src/api.ts`
- `apps/backoffice/src/modules/dashboard/PendingDocumentReviews.tsx`
- `apps/backoffice/src/modules/dashboard/pendingDocumentReviews.css`
- `apps/backoffice/src/modules/shared/OcrUploadReview.tsx`
- `apps/backoffice/src/modules/shared/OcrUploadReview.test.ts`
- `apps/backoffice/src/contract.test.ts`
- `apps/backoffice/scripts/responsive-check.mjs`
- `services/api/src/YSHeng.Api/Features/PendingDocumentReviews.cs`
- `services/api/src/YSHeng.Api/Features/LoanBankWorkflow.cs`
- `services/api/src/YSHeng.Api/Program.cs`
- `services/api/tests/YSHeng.Api.Tests/PendingDocumentReviewPostgresTests.cs`
- `services/api/tests/YSHeng.Api.Tests/ApiDocumentationTests.cs`
- `docs/API.md`
- This plan and verification record.
