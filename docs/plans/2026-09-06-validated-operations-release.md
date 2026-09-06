# Validated operations and public-mobile release

## Authorized scope

The user selected acceptance and release of the earlier implemented back-office batch together with the Contact mobile layout and loan-calculator spacing fixes. This release is assembled on current production `main` (`a28acad`) in a separate worktree. The original shared checkout and its unrelated changes are preserved.

Included work:

- Owner-based formal Purchase Invoices: server numbering, retained PDFs, reasoned revisions and version-bound Finance confirmation.
- Shared Dashboard/HR calendar, attendance dashboard, Delivery document layout and editable completed steps.
- Pending-only collection evidence, customer receipt entry and controlled invoice-request resolution.
- Owner information in Vehicle Overview, Leads tab, generated Purchase Invoice entry, reapproval notice layout and existing photo deletion compatibility.
- Optional review-first VOC intake, final file persistence and IC/address field separation.
- Contact mobile form layout and loan-calculator input spacing.

Not included: settlement direction/AutoCount redesign, supplier-approval removal, universal uppercase inputs, Markdown templates or a claim that every Finance V2 backlog item is complete.

## Acceptance approach

- Use one frozen release source and its rebuilt API image for the final API/browser regression runs.
- Use isolated, labelled PostgreSQL containers with disposable storage and synthetic records. Preserve the user's existing Docker services and databases.
- Test current-main database startup followed by the new API with `SeedData.Enabled=false`, including legacy invoice preservation and repeat startup.
- Reuse the previously authorized Google Document AI configuration outside the repository. Never commit credentials or private sample data.
- Test the supplied rotated JPJ VOC screenshot as JPEG and as the same image wrapped in a PDF. This is scanned-document coverage, not validation of an original electronic VOC PDF or every document layout.
- Keep OCR review and explicit application to draft fields. Preview tests must not create Owner, Vehicle or Document records.
- After acceptance, stage only the named release scope, obtain fresh CI/CodeQL results, merge, run the existing production workflow and perform read-only HTTPS smoke checks.

## Integration findings

Initial merged-source checks passed 315 API tests, 376 back-office tests, 85 front-office tests and both web builds/type checks. The formal purchase/intake harness passed all 32 grouped checks; its PDF layout was separately inspected.

The first operations browser run passed 60 of 62 checks. A reapproval alert still occupied one grid cell; the scoped full-width rule and a regression test were added. The second failure was an obsolete test expectation: the resolution dialog correctly retained the specific server conflict explanation, while the old harness expected a generic message. The harness now checks the actual server explanation, an unchanged request, and a successful retry.

The real Google VOC run returned all six expected vehicle values in recognized text but failed field mapping for both JPEG and wrapped PDF. This is a parser issue with JPJ labels and OCR column ordering, not missing credentials. The release remains gated on its regression fix and actual-provider retest.

An independent review found no critical blocker in invoice numbering/concurrency/audit, Pending-only evidence, calendar privacy, atomic intake persistence or non-seeding schema initialization. Revision-table foreign keys remain a separate hardening opportunity; route validation remains enforced.

## Final release evidence

Final source passes 319 API tests, 377 back-office tests and 85 front-office tests; both web builds/type checks passed. Contact EN/ZH was checked in Chromium at 320/390/768/980/1120/1121/1280 pixels, with intercepted submission checks. Calculator spacing and live repayment updates passed at 320/390/768/1280 pixels. WebKit/Safari was unavailable.

The final JPJ parser correction adds observed OCR punctuation variants: omitted heading slashes, leading colons, watermark text joined to a plate, and slashless make/model values matched against known catalog makes. Its fabricated regression failed before the fix and passed afterward. A separate reviewer checked the frozen parser and tests and found no critical blocker. Unknown or ambiguous layouts still require manual review.

### Environment recovery

On 6 September at approximately 23:08 Singapore time, C: reached about 0.04 GB free. Docker's Linux filesystem remounted read-only after I/O errors and its engine returned HTTP 500. Final runtime checks were interrupted before acceptance could complete.

User-approved old-worktree cleanup restored initial headroom. Docker recovered after a controlled stop and reversible renaming of stale, empty runtime-socket directories. The original seven containers returned healthy with their existing databases and volumes. User-approved unused build-cache pruning reclaimed 20.71 GB inside Docker; image, container and volume inventories were unchanged. Windows free space later reached approximately 3.5 GB, not the full logical cache amount.

The pre-failure API image contained an invalid runtime configuration despite its existing image identity. It was not used as release proof. The frozen source was copied read-only into an isolated SDK container, all 319 API tests passed again, and a fresh Release publish was packaged using the same runtime-stage instructions as the repository API Dockerfile. The packaged runtime configuration was valid and its API assembly hash matched the fresh publish.

### Completed final runtime checks

After recovery, the final API image and unchanged application source passed:

| Check group | Result | Scope |
| --- | --- | --- |
| Operations API and Chromium browser | 62/62 | Calendar roles/privacy and desktop/mobile navigation, HR attendance layout, Vehicle Overview/Leads, Loan icon states, Finance receipt state/concurrency and resolution feedback, Delivery uploads and completed-step edits. |
| Purchase Invoice and intake | 32/32 | Owner-based issuance, numbering/idempotency, revisions/audit/permissions, version-bound Finance review, retained PDFs, atomic IC/VOC persistence and actual browser submission. |
| Real Google Document AI | 22/22 | Supplied rotated VOC JPEG and the same image wrapped in PDF: all six vehicle fields matched. IC name, number and address remained separate. Preview left Owner, Vehicle and Document counts unchanged. |
| Existing-database startup | 7/7 | Current-main schema upgraded with seeding disabled; legacy records and users preserved, revision schema initialized, and repeat startup/issuance remained idempotent. |

One operations rerun initially failed two calendar assertions after local midnight: the synthetic fixture used the UTC date while the browser's Today action used Singapore time. The failure screenshot showed the correct local day and the fixture on the previous day. The isolated harness now uses an explicit Singapore fixture date and browser timezone, and asserts that Today selects that date. The subsequent full run passed without changing product code.

Source fingerprints before and after the runtime runs matched. Disposable test resources were cleaned successfully. No production business records were created or changed during acceptance. User samples, OCR credentials, runtime reports and generated test artifacts remain outside the staged release scope.

### Remaining release gates and limitations

Local acceptance is complete. Fresh GitHub CI/CodeQL, merge, production workflow completion and read-only production HTTPS checks remain separate required release gates; this document is not deployment proof. Earlier candidate acceptance records are historical, and this combined-release record supersedes their pending local-acceptance status.

OCR coverage is for the supplied scanned document, including its wrapped-PDF transport, not an original electronic VOC PDF or every possible layout. Public and back-office browser checks used Chromium; native Safari/WebKit was unavailable. PDF layout acceptance prioritizes the user-requested English content. The excluded backlog remains outside this release.
