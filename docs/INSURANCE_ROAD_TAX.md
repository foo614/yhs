# Standalone Insurance and Road Tax (FOO-282)

## Approved outcome

Staff manage independent insurance and road-tax cases with their own plate, customer name, phone and identity number. There are no business links to Vehicle, Customer, Delivery or Finance records. Access uses existing staff policies and audit controls. Customer collections and actual insurer payments are separate ledgers. Cover may begin before collection; only verified receipts reduce outstanding.

## Implementation phases

1. Add standalone persistence, protected API, evidence uploads, internal quotations, customer receipts, insurer payments, renewals, overdue alerts and reviewed legacy import.
2. Add an Ant Design portal with explicit save/payment confirmations, document handling, JPJ work list and AutoCount previews/copy rows.
3. Extend verified WhatsApp staff commands and the existing consent/template/outbox pipeline for document sending and payment follow-up. A slip alone never settles a case. Require Boss/Admin preview and confirmation of a specific receipt and amount.
4. Run focused money, role, isolation, import and document regression coverage; backend suite, portal build and responsive checks. Independently review the diff. The initial implementation stops before staging or release; any release follows a separate user approval and the repository branching strategy.

## Source evidence

Source: `INTERNAL SYSTEM 5.pptx`, slides 47-59 and slide 36. Embedded images were inspected directly. Slide 60 is outside scope. Never include sample customers' personal data in fixtures or this document.

Preferred import order (latest user correction): `NAME`, `IC NO.`, `CUSTOMER PHONE NUMBER`, `VEHICLE NO.`, `EXP DATE`, `INSURANCE`, `COVERAGE`, `NCD`, `RENEWAL/NEW`, `REMARK`. The phone header is uppercase and follows IC NO. This supersedes the earlier phone-last addition to the slide 47 layout. Columns are mapped by trimmed, case-insensitive header names; existing phone-last and original no-phone templates remain supported. Duplicate, unknown or missing required headers and mismatched row widths are rejected; personal data is never shifted by positional guessing. A missing phone still permits internal reminders. Preserve explicit date formats and reject ambiguous/invalid rows during preview.

JPJ requires uploaded receipt evidence and a runner work list (plate, IC and half/year duration). Default runner fee is RM20. eAuto has no JPJ receipt requirement and no runner fee. Renewal preparation is due one month before expiry, including bank-arranged policies; declined renewals stop future renewal reminders. Payment reminders are separate and stop when settled.

Start next renewal explicitly creates a new annual draft and marks the original case with its successor. It carries customer and cover-type details only; policy effective date, policy, invoices, documents and payments are cleared. The proposed expiry is one year later and must be reviewed. Original receipts stay on the original case. Old renewal reminders stop, while any old outstanding debt remains payable.

Insurer payment entry means the final actual settlement to the insurer, rather than an installment. Its difference from policy amount is commission. A second different insurer payment is rejected; retrying the same request returns the original record. Customer payments support multiple partial receipts.

The form keeps Insurer invoice number and hides Customer invoice number and Auto intercompany invoice number. Existing references survive edits; missing references do not block ordinary receipts, confirmed A/R payment rows or normal intercompany Automotive A/P. Select the matching customer invoice and enter supplier invoice references directly in AutoCount. Bank-arranged creditor and bank-invoice checks remain required.

Insurer offers searchable Tune, Liberty, Etiqa and Kurnia suggestions plus saved names, while permitting manual names separately from accounting creditor codes. New coverage choices are Third Party, Fire & Theft; Comprehensive Plus; Comprehensive; Comprehensive Premier. Editing retains atypical saved/imported coverage. Policy effective date / 保单生效日期 keeps the existing `coverStartDate` contract.

## Verified AutoCount mapping

Output is reviewed copy/paste only, with the screenshot's detail-column order and empty placeholders. Staff review header values separately. Physical paste into AutoCount remains unverified.

| Document | Item | Account | Description |
| --- | --- | --- | --- |
| Auto purchase insurance (51) | INS-MV | 4001-I002 | INSURANCE FOR M/V - {plate} |
| Auto purchase commission (51) | COMM | 5C00-0000 | COMMISSION (INSURANCE) - {plate}, negative policy minus actual insurer payment |
| Auto purchase road tax (52) | ROAD TAX | 4001-R002 | ROAD TAX - {plate} |
| Auto purchase other (49/53) | LICENSE, INTERCHANGE NUMBER, STMS/E-SERAHAN, SAMAN, TENDER | 4001-M002 | DRIVER LICENSE, INTERCHANGE NUMBER, TUNTUTAN HAK MILIK, SAMAN, TENDER NUMBER, with plate |
| Auto customer sales (54) | INS-MV | 4001-I001 | INSURANCE FOR M/V - {plate} |
| Auto customer sales (54) | ROAD TAX | 4001-R001 | ROAD TAX - {plate} |
| Auto JPJ runner (54) | PROCESSING FEE | 5020-001 | RUNNER FEE - {plate} |
| Auto special JPJ sales (49/55) | Same source item | 4001-M001 | Source description with plate |
| Automotive customer sales (36) | INSURANCE (MV) | 4001-I001 | INSURANCE FOR MOTOR VEHICLE - {plate}, classification 006 |
| Automotive customer sales (36) | ROAD TAX | 4001-R001 | ROAD TAX - {plate}, classification 006 |
| Automotive A/P (56) | Purchase A/C only | 4001-I002 | INSURANCE (PAID) ON BEHALF - {plate} |
| Automotive A/P (56) | Purchase A/C only | 4001-R002 | ROAD TAX (PAID) ON BEHALF - {plate} |
| Automotive A/P (56) | Purchase A/C only | 6000-0000 | OWNERSHIP PROCESSING FEE - {plate} |
| Automotive A/P (56) | Purchase A/C only | 4001-M002 | INTERCHANGE - {plate} |

Auto purchase insurance is blocked until actual insurer payment exists. Monthly Auto intercompany sales retain every vehicle's individual lines (55). Automotive A/P is one case/plate per invoice; Supplier IV No. uses a legacy saved Auto intercompany sales invoice number when present, otherwise remains blank for manual entry in AutoCount; Ref No. 2 is the plate, and AutoCount generates its own Invoice No.

Bank-arranged A/P requires the actual bank creditor name and bank invoice number. Copy is blocked for mixed bank/road-tax/other charges until supplier allocation is reviewed, avoiding an invented bank or Auto supplier.

Slide 59 A/R detail order: Payment Method, Cheque No., Payment Amount, Bank Charge, To Bank Rate, Payment By, Is RCHQ, RCHQ Date. Only confirmed receipts can be copied. PBB represents confirmed deposits into the company PBB account; Cash represents cash. Original payment type (Cash, TNG, Transfer, Card) is retained separately. Staff manually select the lower Knock-off invoice in AutoCount.

## Deliberate holds

- WhatsApp quotation text, PDF quotation and automatic quotation sending await the client sample.
- Automotive's JPJ sales runner fee account is unconfirmed. Formal copy must be blocked when that line is present; never silently use Auto's account.
- No claim of successful physical paste into AutoCount without a real test.

## Verification

Critical tests must prevent unauthorized money updates, duplicated or unconfirmed receipts reducing balances, evidence crossing cases, unsafe uploads, incorrect account/column mappings and partial or invented legacy imports. Tests must use synthetic data and injected messaging transports, with no real customer messages.

## Messaging configuration and operations

The existing sender, consent and dispatch-budget gates remain mandatory. Configure approved templates for the customer's language: `insurance_document_v1` with DOCUMENT header (PDF), `insurance_image_v1` with IMAGE header (JPEG/PNG up to 5 MB), and `insurance_payment_due_v1` for payment follow-up. Each body takes the plate as its single reference parameter. This implementation does not assert Meta approval. Media uses the existing upload-and-send pattern, following [Meta media documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media) and [Meta's template example](https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media).

The document-send preview includes the case version, recipient and latest policy/applicable JPJ receipt IDs. Changes reject the preview. Dispatch rechecks consent, recipient, current source files and payment facts; the source case remains locked through final provider submission. WebP files remain available as internal evidence but cannot be sent by this template flow. No public file links are created.

An enabled InsuranceReminder staff policy queues one renewal preparation reminder per policy expiry for verified Boss/Admin bindings. Internal renewal flags work without a customer phone. Customer payment follow-ups are separate weekly events starting seven days after the policy effective date; actual confirmed receipts stop follow-up once settled. Sending still requires capture, approved templates, consent, and the existing dispatch limits.

Boss/Admin can forward a slip with caption `INSURANCE <case-id> | <amount> | Cash/TNG/Transfer/Card | Cash/PBB | yyyy-mm-dd [| <invoice-no>]`. The invoice reference is optional; omitted references use any legacy case reference, otherwise stay blank for manual AutoCount selection. A supplied reference must match a nonempty case reference. A valid slip creates linked pending evidence only. The returned preview identifies the case, invoice, amount and destination. Verify actual funds, then send `insurance-pay confirm <preview-request-id>` within five minutes using the same verified staff connection. For existing pending receipts, use `insurance-pay <receipt-id> <amount>` first. Replayed confirmation does not apply the receipt twice.

## Local implementation evidence

Implemented from `origin/main` revision `da5792f` on `codex/foo-282-standalone-insurance`. The user subsequently authorized a merge and production-release attempt. No real customer test messages were sent. Release status is tracked in FOO-282.

- Final backend suite: 955 passed, 7 optional PostgreSQL tests skipped, 0 failed. A subsequent disposable PostgreSQL 17 run verified schema idempotence and concurrent receipt protection (2 passed, 0 skipped). The actual API started against PostgreSQL with readiness 200 and anonymous Insurance access 401. A synthetic authenticated smoke passed 23 workflow checks. Production schema rollout still requires the release gate.
- Back-office build passed. Final full portal suite passed 546 tests across 44 files; the later insurance-policy settings wiring also passed the back-office build.
- Populated responsive checks passed at 360, 820 and 1440 pixels, including record details, receipt forms, sections, case editing, import and validation. These use synthetic API fixtures.
- Independent review identified renewal-cycle, legacy annotation and final-send locking issues; all were addressed. `git diff --check` passed.
- Existing PKCS dependency advisories and npm audit warnings remain outside this change. No dependency versions were changed.

Release review: the independent source/security review found no remaining merge blockers. The Codex CLI review was attempted but the configured gpt-6.1-sol model is unavailable for this ChatGPT account; no model was silently substituted. The existing API documentation route scanner was extended to follow the new endpoint files.

Release startup gate: concurrent API/worker first-time schema setup reproduced PostgreSQL23505 (duplicate catalog entry), so production workflow44925012328 was cancelled before rollout. Insurance schema creation now holds a transaction-scoped advisory lock across its complete DDL batch. The PostgreSQL regression aligns both startup contexts before lock acquisition and checks five fresh schemas; together with schema preservation and concurrent payment confirmation, all three checks pass locally. The follow-up PR must pass fresh CI before another production dispatch.

## Pending UI and monthly export follow-up (FOO-283)

The Customer phone helper moves to a keyboard/hover/click tooltip beside its label; the field stays optional. The Import picker label is Choose listing file / 选择名单文件; accepted formats remain .tsv and .txt.

Monthly Auto intercompany sales displays the selected month's authorized rows directly, with refresh, Copy Rows and Export Excel actions. Month changes discard old preview/download responses; loading, failed, empty or blocked previews cannot export. Excel uses the existing workbook writer and the same canonical server query as preview, preserving screenshot column order and blank cells. A fingerprint check rejects a download if the reviewed rows changed. No automatic posting is added.

Other charges use one server catalog. Staff select item code and amount; description metadata is derived and available from a read-only tooltip. Existing item/description pairs retain their stored text until the selection changes. Purchase export retains canonical description plus plate and account 4001-M002; special sales retains account 4001-M001. These follow-up changes have no commit, merge or deployment authorization.

FOO-283 local verification: back-office build and all548 portal tests passed; full backend960 passed with10 optional PostgreSQL tests skipped. Actual TestServer XLSX bytes were compared cell-by-cell with the same response preview and downloaded through the browser with matching filename/content. Browser checks covered360/820/1440, keyboard/hover tooltip access, unchanged listing formats, month races, empty/blocked/error/retry states, changed-row export rejection, late-download suppression, canonical new-charge saves and legacy-description preservation. Independent read-only review found no actionable issues. Temporary capture diagnostics were removed. No staging, commit, merge or deployment was performed.

Latest import-header correction verification: the new regression failed against the old positional parser and passed after header mapping. All11 focused backend/API-documentation checks passed, including HTTP preview/confirm/readback for preferred, phone-last and no-phone inputs with distinct leading-zero IC/phone values. Back-office build and360/820/1440 populated/modal-header checks passed. Prior local follow-ups remain intact; nothing staged, committed, merged or deployed.

Additional form-cleanup verification: focused backend53/53 and WhatsApp7/7 passed. Full backend966 passed with10 optional PostgreSQL checks skipped; portal548/548 and build passed. Populated360/820/1440 checks verified hidden invoice inputs, four new coverage options, searchable/manual insurers, policy-effective-date label and phone tooltip. Browser saves retained legacy references/insurer/coverage; a receipt with no invoice reference reached explicit funds confirmation with amount and invoice book. Mocked WhatsApp evidence covered no-reference, legacy fallback/explicit and mismatch cases, pending status, same-binding confirmation, partial balance and replay protection. Independent read-only review found no blockers. Changes remain unstaged, uncommitted, unmerged and undeployed.

## Road tax draft calculator and New Case modal

New Case uses the Create Vehicle modal pattern (`recordCreateModal`, 860px desktop width, existing controls and confirmation), centered with a scrollable body and reachable footer. Closing a dirty draft asks before discarding; failed/cancelled saves retain input. Edit and detail views remain drawers.

The new-case calculator fills the existing `roadTaxAmount` only for verified standard private registrations: AB/AC saloon (individual/company), AD/AE non-saloon (individual/company), declared Peninsular Malaysia, Sabah or Sarawak, petrol/diesel/green diesel engine capacity or battery-electric registered motor power. Select the actual registered class and fuel; do not infer them from a model name or accounting invoice book. Inputs are draft calculator controls; only the existing amount, period and date contract is saved. No schema, API, fee or permission changes are introduced. JPJ runner fee remains a separate amount.

ICE input is a positive whole cc value, up to 10,000cc. EV input is positive registered kW with up to three decimal places (whole Watts), up to 10,000kW. Invalid, incomplete or unsupported inputs clear an automatic amount and block saving it. The calculator is the default, with no manual-entry checkbox. A manual JPJ amount becomes editable automatically for explicitly unsupported selections or six-month terms; incomplete or invalid supported inputs still block saving. Islands (including Langkawi, Labuan and Pangkor), exemptions/concessions, motorcycles, commercial/e-hailing and unconfirmed classes/fuels need manual review. Sabah AD/AE diesel/green-diesel needs manual review because the official guidance preserves a separate four-wheel-drive exception.

Rate evidence checked 22 November 2026:

- [JPJ current rate-guidance index](https://www.jpj.gov.my/pusat-media-3/informasi-perkhidmatan-jpj/kenderaan/panduan-pengiraan-kadar-lkm/) links the following current documents. The English index still links older EV guidance, so the calculator does not use that superseded table or the exemption that ended in 2025.
- [Current ICE guide, revised after Budget 2009](https://www.jpj.gov.my/wp-content/uploads/2026/07/Lampiran-A-Garis_Panduan_Pengiraan_LKM_Bajet_20092-2.pdf): private tables pages 1-3, 18-20 and 29-30. The guide identifies its Budget 2009 revision but gives no standalone commencement date; it is the ICE guide currently linked by JPJ. Values are calculated in integer sen using the printed base/progressive bands.
- [JPJ EV circular 01/2026, dated 1 April 2026](https://www.jpj.gov.my/wp-content/uploads/2026/07/Lampiran-B-01.04.2026-Garis-Panduan-Kadar-LKM-Bagi-Kenderaan-Motor-Elektrik-ZEVs.pdf): private annual Watt bands, same standard rates for the three supported regions.
- [P.U. (A) 464/2025](https://lom.agc.gov.my/ilims/upload/portal/akta/outputp/3275488/PUA%20464_2025.pdf) commenced 1 January 2026; its annual EV table confirms the final band starts at 1,010,001W and costs RM20,000. Calculations use current rates, not retrospective historical rates.
- [JPJ renewal guidance](https://www.jpj.gov.my/panduan-pembaharuan-lesen-kenderaan-motor-lkm/) permits ordinary private six- or twelve-month renewals with insurance covering the period. This establishes eligibility, not six-month pricing.
- [MOT 29 January 2026 release](https://www.mot.gov.my/en/Kenyataan%20Media/Year%202026/29%20JAN%202026_KENYATAAN%20MEDIA%20PENETAPAN%20KADAR%20PENGIRAAN%20FI%20LESEN%20KENDERAAN%20MOTOR%20%28LKM%29%20DAN%20TEMPOH%20PEMBAHARUAN%20LKM.pdf), appendix page 3: e-hailing examples preserve existing six-/twelve-month fees and show RM42.50 annually becoming RM21.30 for six months. This disproves a universal exact half-to-two-decimals calculation, but does not establish a general rounding/minimum formula for all ordinary private vehicles and EVs. Six-month amounts therefore require manual JPJ entry until an applicable general rule is verified; they are never guessed from the annual figure.

For new drafts, a twelve-month road-tax expiry follows Insurance expiry; a six-month expiry subtracts six calendar months, clamping to the last valid day. For example 31 August 2027 becomes 28 February 2027, while 31 August 2028 becomes 29 February 2028. This is the user's agreed draft rule, not a claim about JPJ's actual issuance date. Changes to insurance expiry, period or method refresh the suggestion until staff edit/clear it manually. Use suggested expiry explicitly resumes syncing. Existing saved dates and amounts are preserved on edit and can still be manually corrected.

All optional Insurance form guidance is available through focus/hover/click tooltips: case context, calculator scope/source and failure reason, expiry rules, amount guidance, selected charge descriptions, completion/reminder explanations, receipt/insurer-payment guidance and listing-import instructions. Field values, available actions and blocking validation errors remain visible.

Road-tax/modal verification: all564 portal tests and the build passed; the final calculator decision-flag adjustment also passed all16 focused money/date tests. Browser checks at360/820/1440 verified Create Vehicle modal class, geometry and reachable actions, automatic ICE/EV amounts, no manual checkbox, automatic unsupported/six-month manual entry, stale-amount clearing, calendar clamping, manual expiry reset, exact saved amount/date payloads and existing saved-date/amount preservation. Desktop checks additionally verified explicit discard, incomplete-calculator save rejection, and failed-save retry retaining exact calculated values. Phone checks verified keyboard/touch guidance tooltips, no inline helper blocks and Other-only immediate manual entry. Independent read-only review found no blockers; final diff check passed. Synthetic API fixtures only; no real records, messages, staging, commits, merge or deployment.

Release authorization: on 22 November 2026 the user approved committing, PR review/CI/CodeQL, merging and deploying the full FOO-283 follow-up batch described above, including the default calculator and tooltip refinements. Earlier local-only statements record the implementation phase before this approval. Six-month pricing remains manual as documented.
