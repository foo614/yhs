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

Legacy import order from slide 47: `NAME`, `IC NO.`, `VEHICLE NO.`, `EXP DATE`, `INSURANCE`, `COVERAGE`, `NCD`, `RENEWAL/NEW`, `REMARK`, followed by the approved `Customer Phone Number`. A missing phone still permits internal reminders. Preserve explicit date formats and reject ambiguous/invalid rows during preview.

JPJ requires uploaded receipt evidence and a runner work list (plate, IC and half/year duration). Default runner fee is RM20. eAuto has no JPJ receipt requirement and no runner fee. Renewal preparation is due one month before expiry, including bank-arranged policies; declined renewals stop future renewal reminders. Payment reminders are separate and stop when settled.

Start next renewal explicitly creates a new annual draft and marks the original case with its successor. It carries customer and cover-type details only; cover start, policy, invoices, documents and payments are cleared. The proposed expiry is one year later and must be reviewed. Original receipts stay on the original case. Old renewal reminders stop, while any old outstanding debt remains payable.

Insurer payment entry means the final actual settlement to the insurer, rather than an installment. Its difference from policy amount is commission. A second different insurer payment is rejected; retrying the same request returns the original record. Customer payments support multiple partial receipts.

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

Auto purchase insurance is blocked until actual insurer payment exists. Monthly Auto intercompany sales retain every vehicle's individual lines (55). Automotive A/P is one case/plate per invoice; Supplier IV No. is the Auto intercompany sales invoice number, Ref No. 2 is the plate, and AutoCount generates its own Invoice No.

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

An enabled InsuranceReminder staff policy queues one renewal preparation reminder per policy expiry for verified Boss/Admin bindings. Internal renewal flags work without a customer phone. Customer payment follow-ups are separate weekly events starting seven days after cover starts; actual confirmed receipts stop follow-up once settled. Sending still requires capture, approved templates, consent, and the existing dispatch limits.

Boss/Admin can forward a slip with caption `INSURANCE <case-id> | <amount> | Cash/TNG/Transfer/Card | Cash/PBB | yyyy-mm-dd | <invoice-no>`. A valid slip creates linked pending evidence only. The returned preview identifies the case, invoice, amount and destination. Verify actual funds, then send `insurance-pay confirm <preview-request-id>` within five minutes using the same verified staff connection. For existing pending receipts, use `insurance-pay <receipt-id> <amount>` first. Replayed confirmation does not apply the receipt twice.

## Local implementation evidence

Implemented from `origin/main` revision `da5792f` on `codex/foo-282-standalone-insurance`. The user subsequently authorized a merge and production-release attempt. No real customer test messages were sent. Release status is tracked in FOO-282.

- Final backend suite: 955 passed, 7 optional PostgreSQL tests skipped, 0 failed. A subsequent disposable PostgreSQL 17 run verified schema idempotence and concurrent receipt protection (2 passed, 0 skipped). The actual API started against PostgreSQL with readiness 200 and anonymous Insurance access 401. A synthetic authenticated smoke passed 23 workflow checks. Production schema rollout still requires the release gate.
- Back-office build passed. Final full portal suite passed 546 tests across 44 files; the later insurance-policy settings wiring also passed the back-office build.
- Populated responsive checks passed at 360, 820 and 1440 pixels, including record details, receipt forms, sections, case editing, import and validation. These use synthetic API fixtures.
- Independent review identified renewal-cycle, legacy annotation and final-send locking issues; all were addressed. `git diff --check` passed.
- Existing PKCS dependency advisories and npm audit warnings remain outside this change. No dependency versions were changed.

Release review: the independent source/security review found no remaining merge blockers. The Codex CLI review was attempted but the configured gpt-6.1-sol model is unavailable for this ChatGPT account; no model was silently substituted. The existing API documentation route scanner was extended to follow the new endpoint files.

Release startup gate: concurrent API/worker first-time schema setup reproduced PostgreSQL23505 (duplicate catalog entry), so production workflow44925012328 was cancelled before rollout. Insurance schema creation now holds a transaction-scoped advisory lock across its complete DDL batch. The PostgreSQL regression aligns both startup contexts before lock acquisition and checks five fresh schemas; together with schema preservation and concurrent payment confirmation, all three checks pass locally. The follow-up PR must pass fresh CI before another production dispatch.
