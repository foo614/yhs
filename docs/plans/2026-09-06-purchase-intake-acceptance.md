# Purchase Invoice and intake acceptance

## Result

Local code and workflow verification passed for Owner-based Purchase Invoices, optional intake VOC upload/review, and IC/address separation. The existing Google configuration was recovered from prior conversations, and real recognition of the supplied IC sample now passes. Representative English VOC PDF recognition remains unverified, so the user's conditional instruction to commit and push after full acceptance has not been executed. Nothing from this slice has been staged, committed, pushed or deployed.

This report covers the three scopes in `2026-09-06-owner-purchase-invoice.md` and `2026-09-06-intake-voc-ic-ocr.md`. It does not declare Finance V2, the earlier operations backlog, or production acceptance complete.

## Verified behavior

| Area | Result | Evidence |
| --- | --- | --- |
| Formal Purchase Invoice | Passed locally | Approved canonical Owner intake issues a server-numbered PDF without Supplier selection or manual numbering. Retry and concurrent issue retain one invoice. |
| Corrections and audit | Passed locally | Required correction reason, immutable previous PDFs, actor/time and changed values, stale-version rejection, and one winning concurrent revision. Vehicle and Owner masters remain unchanged. |
| Finance review | Passed locally | Finance confirms the displayed version only. Corrections reset current review while preserving prior reviewer/time. Sales cannot confirm; Finance cannot issue or correct. |
| Failure feedback | Passed locally | Generation and correction retain input after an error. Stale Finance confirmation displays the exact reason beside the failed invoice's buttons, within the current viewport. |
| PDF output | Passed in tested renderer | English invoice and a two-page long-field fixture rendered and were visually inspected. Number, revision, amounts, text and page footers remain legible. |
| Optional VOC intake | Passed locally | Scan is available in Step 1. Applying reviewed values fills the draft; final browser submission stores the original VOC and IC with the vehicle in one transaction. |
| Upload validation | Passed locally | Invalid PDF rejects before writes. Supported image/PDF previews respect permissions. Two valid 10 MiB files are accepted together without changing existing limits. |
| IC/address mapping | Passed with real sample and controlled fixtures | The supplied multiline name, IC and rural address match their intended fields. Bare or labelled IC-only continuation lines do not enter numbered or locality addresses. Preview/cancel creates no business records. |
| Responsive interaction | Passed at tested widths | Purchase Invoice details, correction form and submit controls were checked at 320, 390, 820 and 1280 pixels. Official/Finance tags wrap without clipping. VOC review was inspected at the same widths. |
| Real IC recognition | Passed for supplied sample | Recovered Google settings returned actual text with confidence 0.8974. Seven checks pass, including exact normalized name/address, exact IC number, no IC in address and unchanged Owner/Vehicle/Document counts. |
| Real VOC recognition | Not yet verified | File validation, provider request shape, review/apply and final storage pass. A representative English VOC PDF has not yet been evaluated against the real provider. |

## Verification runs

- Fresh .NET 10 Docker test run: 315 passed, zero failed or skipped. The final backend image contains the PDF descriptor, strict currency precision, rural-address and identity-heading fixes.
- Final back-office Vitest run: 376 passed across 36 files.
- Back-office TypeScript check and production Vite build: passed. The existing large-chunk warning remains.
- Final isolated PostgreSQL/API/Chromium run: 32 grouped checks passed, zero failed, zero uncaught browser page errors. Finished on 6 September 2026 at 20:23 Singapore time.
- Source fingerprint was unchanged throughout that final runtime run: `57ad8a664a5a6b4f1903e33736b7bbc2b83e94e23432dc878f6d41c0bcd451b3`. It covers back-office and API source files; it is not a Git commit identifier.
- Separate real Google IC run: seven checks passed on the final image at 20:20 Singapore time. Credentials were mounted read-only from their existing external location; personal text is not retained in the report.
- Independent source review covered permissions, concurrent writes, audit retention, upload ownership, stale responses, the final Finance feedback and narrow-screen changes, and identity-only lines inside numbered and locality addresses. No actionable finding remains in the bounded final parser delta.
- `git diff --check` passed. Existing CRLF normalization warnings do not indicate whitespace errors.

The 32-check API/browser harness uses actual authenticated requests, UI controls and temporary PostgreSQL persistence. OCR response content and deliberate failure/retry cases in that harness are injected; they are not evidence of provider accuracy. The separate seven-check IC run sends the user-authorized sample to Google and compares the real extraction without substituting OCR responses.

The frontend tests, real browser checks and PDF visual inspection are separate evidence. No passing test count is used as a substitute for a blocked provider check.

## Acceptance fixes

Implementation and verification found and corrected stale source error classification, reserved-number collisions, fractional-cent totals, PDF font descriptor validity, the missing optional VOC callback argument, StrictMode/stale OCR guards, prefixed IC-only addresses, and stale Purchase Invoice history requests.

The first real IC result contained the complete name and correct IC but omitted its no-house-number rural address. The parser now accepts a recognized locality block only with a five-digit postcode and supported Malaysian state. Separate regressions exclude bare IDs and IC/NRIC/NO-labelled lines with MyKad or Kad Pengenalan headings while preserving real street numbers. The name parser was not changed. The conservative state allowlist can still leave unsupported locality forms empty for manual entry; broad OCR accuracy is not claimed.

One browser rerun exposed a timing defect in the local acceptance harness: it counted Version 1 before the history refresh completed. The check now waits for the actual successful history GET and visible Version 1 card. The final 32-check rerun passed without a product-code change for this timing issue.

The last browser pass also found that static Ant Design error messages were not rendered for Finance confirmation. This action now uses a persistent, invoice-specific accessible alert. Its exact stale-version reason was verified in the viewport. Other static-message warnings still occur and were not treated as a reason to migrate global notifications in this slice.

The PDF renderer passed strict parsing and Poppler visual checks. Poppler substituted SimSun for its non-Latin fallback; embedded-font portability across every external viewer is not claimed. English uploaded documents are the approved OCR scope. No new PDF or UI production dependency was introduced.

## Changed implementation surfaces

- API: `Features/OwnerPurchaseInvoices.cs`, `Features/OcrExtraction.cs`, `Features/AutoCountExport.cs`, `Domain/Models.cs`, `Data/AppDbContext.cs`, `Data/SeedData.cs` and the corresponding routes in `Program.cs` under `services/api/src/YSHeng.Api/`.
- Portal: `api.ts`, `App.tsx`, `modules/vehicles/VehiclePage.tsx`, `VehicleIntakeVocReview.tsx`, `OwnerPurchaseInvoiceDetails.tsx`, its scoped stylesheet, and `modules/finance/FinancePage.tsx` under `apps/backoffice/src/`.
- Focused tests accompany the API, client, integration callback, OCR review, version details and Finance changes. Contract and scope records are in `docs/API.md` and the two linked plans.

Some shared files also contain previous unpublished operations changes. These remain separate scope; the entire dirty worktree must not be staged wholesale.

## Local evidence

Artifacts remain local under `.codex-tmp/operations-acceptance-20260906/`; do not include this directory in a commit.

- Harness: `purchase-intake-acceptance.cjs`.
- Final machine report: `results-purchase-intake/report.json`.
- Initial no-configuration preview baseline: `results-ic-baseline/report.json`.
- Final real Google supplied-sample result: `results-intake-ocr-live/report.json`.
- Retained pre-correction harness timing result: `results-purchase-intake/report-history-wait-before-fix.json`.
- PDF fixtures and rendered pages: `results-purchase-intake/purchase-invoice-*.pdf` and `render-final-*.png`.
- Browser captures: `purchase-version-history-*.png`, `purchase-correction-form-*.png`, `purchase-finance-stale-reason-1280.png`, `purchase-finance-reviewed-1280.png`, `voc-reviewed-draft-*.png` and the IC mapping captures in that result directory.

The final harness used a dedicated loopback API and frontend with a labelled temporary database and network. Cleanup was verified: no resources with the acceptance label remain. The original local Docker stack and its data were not changed. The supplied IC image was not saved as an Owner, vehicle or document record, and its personal fields are omitted from this report.

## Recovered configuration and remaining gate

The missing-credentials conclusion was incorrect. The user had already supplied the local credential in the 31 August `Repair module` task, and the valid service-account file remains outside the repository. That conversation also records the local processor settings. An earlier `Fix OCR connection refusal` task records the separate production configuration; historic production success does not verify today's production state.

The original running API was started with only `infra/docker-compose.yml`, omitting the existing local `infra/docker-compose.google-ocr.local.yml` overlay and its Google environment and read-only credential mount. Recovery reused those authorized settings in an isolated container only. The registered provider remains Google; no provider switch or production-configuration copy occurred. Do not ask the user to supply these credentials again because a base-only or QA container omitted them.

The remaining OCR evidence is a representative English VOC PDF evaluated against the real provider, with extracted fields compared and preview-only persistence verified. No representative VOC sample was available in this acceptance slice; IC success does not prove VOC accuracy. This is a sample-coverage gap, not a missing-credentials blocker. Production changes and the user's conditional publication gate remain unexecuted.

Production database upgrade, production smoke checks and deployment remain separate from this local acceptance report. AutoCount still requires manual review and Owner creditor mapping; no tax-authority submission or automatic settlement/payment posting is claimed.
