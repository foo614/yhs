# Remaining operations completion

Date: 2026-09-07

## Outcome and authority

Complete the eight previously unaccepted requests, then run the combined Finance V2 and operations acceptance before releasing. The user has approved completion and deployment after successful acceptance. The previous validated operations release is already deployed; it is the baseline, not unfinished work.

Reuse the existing release checkout on a fresh branch from the deployed main tree. Preserve the original mixed checkout, private acceptance artifacts, original Docker services and all business records. Do not create another Documents worktree.

Planning model initialization is unavailable in the existing planning task. The main task records this bounded plan; separate implementation and reviewer roles remain required.

## Acceptance ledger

| Request | Smallest intended behavior | Required proof | Status |
| --- | --- | --- | --- |
| Seller settlement | Calculate purchase price minus bank debt on the server. Positive means pay seller; negative means collect from seller; zero means internal offset. Vehicle intake, Finance, reminders and the manual AutoCount workbook must agree. Preserve historical amounts and audit; do not infer payment completion or external accounting codes. | All three cases, invalid/stale amounts, legacy preservation, access, audit, reminders and workbook assertions; real API and form checks. | Implemented; API, concurrency, workbook and legacy-upgrade checks passed. |
| Repair supplier | A newly created valid supplier is immediately usable. Remove the new-supplier approval step without removing high-cost Repair approval or Finance payment approval. | Repair-role creation followed by use in a repair; validation, audit, unchanged finance permissions and legacy behavior. | Implemented; creation, immediate use and protected workflow checks passed. |
| Business text uppercase | Normalize newly entered business text, including Settings make/model. Preserve credentials, email, URLs, opaque keys, file names, existing historical records and Markdown link targets. | Typing/paste and saved-value tests, explicit exclusions, module field inventory. | Implemented for allowlisted named-form fields; mounted field and exclusion checks passed. |
| Markdown templates | Prepopulate the existing Markdown create/edit surfaces with neutral information prompts; retain authored content and offer an explicit template action. Do not add Markdown fields to unrelated forms. | Inventory of actual editor uses, empty/new versus existing content, rendered edit/preview and public-data checks. | Implemented at the actual Vehicle editor; prefill, preserve, confirmation and cancel checks passed. |
| VOC/OCR consistency | Use the shared upload, review and explicit-apply workflow at the authorized document entry points. Align existing-vehicle VOC PDF/image support with intake. Preserve category permissions and existing master-data ownership; no automatic save/approval from extraction. | Real English VOC image/PDF, invalid files, repeat requests, save failure, persisted review/evidence, denied roles and no unrelated changes. | Implemented; real-provider image/wrapped-PDF, review, retry and persistence checks passed. |
| Approval controls | Enumerate each module's actual required approvals, role and entry point; fix inaccessible or misleading controls without inventing extra approvals. | Role/action matrix, permitted and forbidden API checks and rendered controls for representative states. | Vehicle/voucher and manual Loan-create role checks passed. The reproduced normal Loan-save defect is fixed; fresh-read persistence, bank decision, audit and document gates passed. |
| Header statistics | Add useful Vehicle, Repair and Loan operational summaries from data already authorized for each role. Label scope honestly. | Deterministic counts, empty/filter states, role-safe payloads and 320/390/820/1280 px checks. | Implemented; count tests and four-width browser checks passed. |
| Action feedback | Every inventoried workflow action either completes visibly, reports the actual failure, or explains why it is unavailable. Preserve input after failures. | Mutation/async-handler inventory, network/validation/conflict failures and representative real browser retries. | Implemented for inventoried flows; failure, preserved-input and retry checks passed. |

Finance V2 end-to-end readiness is an aggregate acceptance decision, not a ninth standalone feature. Exercise invoice issue, price adjustments, collections, evidence, maker-checker reconciliation/reversal, Delivery gates, seller settlement and manual accounting export. Any pre-existing unsupported path, including physical-cash collection-to-custody linkage, must be stated explicitly and must not be labelled fully ready without a demonstrated supported workflow.

## Ownership and sequencing

- Finance implementer: first review settlement and supplier data/rules/routes/tests; implementation ownership will be assigned after the contract is fixed.
- UI implementer: first inventory Markdown, uppercase fields, statistics, approvals and error handlers; exact shared-file ownership is assigned before edits.
- Main task: cross-module document/OCR inventory, source references, integration, documentation and isolated acceptance.
- Independent reviewer: request correctness, financial and upload trust boundaries, historical compatibility, test quality and final diff.

The shared `App.tsx`, `api.ts`, `VehiclePage.tsx`, `Program.cs` and `BusinessRules.cs` need explicit non-overlapping ownership. Workers must preserve concurrent changes. No dependency, deployment wiring, general role-policy or public API expansion is planned.

## Implemented corrections and remaining decisions

- Existing-vehicle VOC now uses the shared PDF/image picker. IC remains image-only. MIME, size, PDF-page and category-permission checks remain server-owned.
- Vehicle OCR apply callbacks await the target mutation. A partially completed operation retains the reviewed values, locks them against conflicting edits and retries only the unfinished step. Equivalent backend review/receipt retries do not create duplicate records or audits.
- OCR copy distinguishes the already saved original evidence and extraction job from master values that have not yet been applied. Empty extraction is not labelled ready, and IC/VOC do not show receipt line items.
- New business entries are uppercased by named Ant Design forms and an explicit field allowlist. Existing loaded records, credentials, emails, opaque keys, enums and authored public Markdown are not mass-rewritten.
- Real template interaction reproduced a static-confirmation rendering failure in the pinned Ant Design 5 / React 19 combination. A shared client-renderer compatibility registration now restores those dialogs without a dependency or permission change. Root reuse and deferred cleanup have focused tests and separate review.
- Finance V2 remains a supported non-cash workflow. Physical-cash V2 collection-to-custody linkage is a pre-existing unsupported path, not completed by this batch.
- The user approved continuing with Boss/Admin-only manual Loan creation after considering and excluding Finance from this exception-only entry. Change only the manual-create endpoint policy, its contract regression and API documentation. Finance permissions and the normal Loan staff read/update/bank-decision/document-check policies remain unchanged. Verify permitted and forbidden roles against the rebuilt API before publication.
- After seeing the failed persistence acceptance, the user explicitly approved fixing the normal Loan-save defect together with the Vehicle follow-up, then deploying all recent approved changes after passing tests. Scope is the tracked post-lock Loan load and its regression; preserve role policies, vehicle/buyer identity checks, advisory locking, audit and completion gates. No historical business records are edited for acceptance.

## Approval and action inventory

| Module / operation | Existing authorized actor | Visible entry and condition | Required guard |
| --- | --- | --- | --- |
| Vehicle management approval | Boss/Admin | Approve on an unconfirmed vehicle, followed by confirmation | Server owns management confirmation; price changes can require reapproval. |
| Repair high-cost approval | Boss/Admin | Repair Details approval for pending high-cost work | RM 1,000 threshold and server-owned approval fields remain unchanged. |
| New Repair supplier | Repair or Boss/Admin | Create supplier; immediately Active | No new-supplier approval or invented approver metadata. Inactive suppliers remain unavailable. |
| Historical supplier draft | Finance or Boss/Admin | Finance Approvals & Vouchers, historical Draft rows only | Finance cannot approve its own draft; the existing audited Boss/Admin override remains. |
| Loan bank decision | Loan or Boss/Admin | Loan Details, decision/completion controls | Rejection reason and document/completion gates remain; bank decision is not exclusively a Boss/Admin action. |
| Manual Loan create | Boss/Admin, both UI and API | Boss/Admin manual-create entry | Non-Boss roles and anonymous requests cannot create any of the five Loan states; denied requests leave records and creation audit unchanged. |
| Delivery release | Delivery or Boss/Admin | Next action / Continue and final release | Prior steps remain editable before terminal release; readiness, evidence and Finance gates are rechecked server-side. |
| Finance price variance | Different Boss/Admin actor | Sales invoice variance approval | Requester/checker separation and current financial state. |
| Finance collection reconciliation | Different Finance-authorized actor | Collection review and reconciliation | Receipt evidence, current state and maker/checker separation; terminal collections cannot accept new receipts. |
| Finance payment voucher | Finance or Boss/Admin | Dedicated Approve / Mark paid confirmation, desktop and mobile | Creator cannot approve their voucher; its approver cannot mark it paid. Mark-paid requires evidence. Do not use generic edit PUT to bypass the transition endpoints. |
| Owner Purchase Invoice | Vehicles-authorized issuer; Finance reviewer | Vehicle generation/revision, Finance current-version review | Number/PDF issuance remains separate from review. Corrections preserve versions and return the current version to review. |
| HR leave and business trip | HR manager or Boss/Admin | Pending request decision controls | Request-state checks, visible failure reason and duplicate-submit guard. |
| Leads, people and Settings make/model | Existing module write permissions | Create/update controls | No extra approval process is invented. |

## Acceptance evidence notes

- Backend full suite: 333 tests passed on the compiled candidate after the receipt-lock, canonical OCR-key and non-seeding schema corrections.
- After the separately approved manual Loan-create policy correction, the rebuilt backend passed 334 tests, including the new policy-boundary regression. An independent reviewer found no P1/P2 issue in that narrow authorization delta.
- Back-office full suite: 400 tests passed after the business-field coverage and static-dialog compatibility corrections.
- Existing-database upgrade: 17 isolated checks passed. Non-seeding startup creates the new settlement columns and receipt tables/indexes, retains legacy settlement fields with null new snapshots, preserves accounts and historical invoices, and remains idempotent on restart. Original local and production data were not used or changed.
- Purchase Invoice and intake regression: 32 real API/browser checks passed on the recovered backend publish and current source. Formal issuance, revisions, audit, PDF, Finance review and final attachment persistence are covered. The suite's OCR responses are synthetic and are not counted as real-provider proof.
- The first extended real-operation run passed 74 checks and failed eight. Incorrect test request shape, an OCR creation status expectation and drawer locators were corrected. Those earlier failures are superseded by the completed full rerun, not counted as passes from that earlier run.
- Final combined real API/browser acceptance: 84 checks passed, zero failed, no setup blocker and no cleanup error. This covers the previous batch regressions plus the remaining operations. A focused 42-check run also passed; it overlaps the combined suite and is not added to the total.
- The final combined run and Purchase Invoice/intake run both began and ended with source fingerprint `85d258bb519549a7066aacd8adaabecc00ed35e0032d7ddcf9135cb35d92b5f9`. The accepted product source did not change during either run.
- Back-office type checking and production build passed. The requirements-trace validator passed. The original seven Docker containers remain healthy, and the disposable acceptance services were cleaned up.
- Real role checks preserve calendar privacy and deny restricted Delivery detail access. Repair and Loan metric labels and document bounds have passed at 320, 390, 820 and 1280 pixels.
- The supplied VOC JPEG and a PDF wrapping that same image are used with the configured Google provider. A wrapped screenshot is not evidence that an original native VOC PDF was tested. Private OCR contents and screenshots remain outside Git.
- Independent final backend review found no high-severity issue in the corrected paths. One non-blocking API retry edge remains: a caller supplying a valid Supplier ID with a non-canonical supplier name can receive a conflict on repeat; the current UI sends the canonical master name. This fails closed without a duplicate write or audit.
- Deliberately rejected voucher confirmations can emit browser promise-rejection events while preserving the dialog and displaying the rejection reason. The acceptance result is not a clean-console claim.
- Focused Loan authorization API/browser run: 34 checks passed and three checks failed (one reproduced save defect and two dependent workflow failures); source remained stable and disposable-resource cleanup succeeded. Every denied manual-create role/state check passed, as did Boss/Admin creation/audit and actual button visibility. Normal Draft-to-Pending update returned Pending, but a fresh GET still returned Draft, and the bank-decision endpoint then rejected the unchanged stored state.
- The Loan-save defect predates this policy change. The update endpoint read the post-lock Loan with `AsNoTracking()` and changed a detached entry. The user-approved correction tracks only that post-lock reload, preserving the earlier read-only lookup, advisory lock, identity checks, transition validation, audit and transaction. Independent review found no P1/P2 issue.
- Final backend suite: 335 tests passed. Final back-office suite: 405 tests passed across 43 files; type checking and production build also passed after the final mobile CSS correction. These supersede the earlier unit-suite counts above.
- The rebuilt candidate passed all 37 focused Loan API/browser checks, with no setup or cleanup error. Fresh GET confirms Pending after update, the subsequent bank decision is persisted with one matching audit, the vehicle becomes LoanProcessing and private, and missing-document completion is denied. The source fingerprint remained `c6e8b91efe5d39a9277fc25b57d32c8dbcc08707864ca8fa333f755127166fc9` throughout that run. A test-only actor assertion was corrected to match the actual auth contract; no product behavior was changed for that assertion.
- The earlier combined 84-check and Purchase Invoice/intake 32-check runs cover the broader candidate before the final Loan and Vehicle corrections. The focused Loan run and mounted Vehicle checks below cover those deltas; overlapping checks are not added into a single total.
- Independent recent-change inventory found no confirmed approved product change missing from this candidate or the already deployed baseline. Public Contact and calculator fixes are already in the baseline. Mixed-checkout experiments and private acceptance artifacts are excluded from staging.
- Local acceptance is complete for this batch. CI, CodeQL, deployment and read-only live-smoke evidence remain separate release gates and must not be claimed before they run.

## Local Vehicle follow-up

The user reported uneven spacing below the Vehicle Details tabs and a final Create button with no visible response, then requested deployment of all recent approved changes after testing.

- Authenticated local inspection reproduced the spacing defect. Ant Design `Space` kept an empty wrapper for each hidden pane, adding another 16 pixels before each later tab. A plain content shell removes those wrappers while preserving mounted pane state and each pane's own spacing.
- The running local frontend differs from the candidate and still lacks its first-step VOC entry and React 19 static-message compatibility fix. Do not treat the older local page as the accepted candidate or pair it with an incompatible backend.
- Final intake validation relied on transient static warnings. The follow-up adds persistent form feedback and saving state, and exposes the existing positive selling-price requirement on the pricing step. API, role and attachment rules are unchanged.
- Vehicle creation now separates a successful save from a failed follow-up list refresh. Refresh failure resolves the saved intake and asks staff to reload rather than retry creation. Other modules' create handlers are unchanged. Three focused outcome tests passed.
- The tab-shell source regression passed. Mounted candidate checks in a separate synthetic fixture confirmed equal tab spacing at 320, 390, 820 and 1280 pixels. A scoped mobile rule also keeps the nested Leads search fields inside their card without changing filter behavior.
- Actual wizard interaction confirmed visible selling-price and missing-NRIC validation with no create call, retained form values and attachment after a failed create, one create call per deliberate attempt, disabled Back/Create while saving, and dialog closure after success. The fixture uses synthetic records and a public logo for mocked NRIC preview; it is not real OCR accuracy evidence. No real Vehicle/Owner records were created during local inspection.
- Independent UI review found no blocking issue in the final tab layout, mobile filter rule, stale-error clearing, pending guards or failure recovery.

## Template references

The user requested Malaysian-market references. The [Carlist listing guide](https://www.carlist.my/faq) groups specifications, condition and optional warranty/payment information. [CARSOME listings](https://www.carsome.my/buy-car?locationIds=kuala-lumpur) expose model/year, mileage and transmission. Use these only to select useful fields, not to copy sales text or adopt their commercial promises. Templates must not publish private acquisition, Owner or identity information, and must not assert unverified accident history, warranty or finance availability.

## Verification and release

Write focused behavioral regressions first when practical. Run changed-area tests, type checks and builds; then broad relevant suites once the integrated source is stable. Use disposable labelled databases for mutations and real browser checks. Reuse the already configured Google provider without printing credentials or sample personal data. Actual extraction and mocked failure coverage must be reported separately.

Release only after independent review and the acceptance ledger is satisfied: exact scoped staging, PR CI and CodeQL, current-main merge validation, production backup and deployment workflow, then read-only live smoke. Do not modify business data to make acceptance pass, and do not conflate a workflow build with deployment or a test count with workflow correctness.
