# Slides 1-22 implementation checkpoint

Source: INTERNAL SYSTEM 3.pptx, with the user's subsequent spoken corrections taking precedence. Tracking: FOO-244 and children FOO-245 through FOO-250.

This is an integration checkpoint, not a completion or release declaration. Changes are uncommitted, unmerged and undeployed. The original shared checkout is untouched.

## Confirmed decisions

- Boss/Admin is one business role. Broker edits actual deal price without approval; costs and dealer invoices remain Boss/Admin-only.
- Staff WhatsApp notifications go individually from the business account. Boss/Admin controls timing.
- Friday stock Excel goes to Boss over WhatsApp, then Boss forwards to KSA. Stock Excel never includes TIN, costs or customer data.
- TIN is manually entered and required. IC dashes are removed. Automatic IC-to-TIN retrieval is removed from scope.
- Settlement is bank debt paid to the bank, with To pay/Done and nearest deadline first. Completed legacy seller payments remain historical; reviewed replacements supersede pending legacy rows atomically.
- No debt covers originally cash purchases and already-settled vehicles, with supporting evidence.
- Inspection is independent. Preserve historical document enum values. Shared receipt allocations have stable suffixed supplier references.
- Bulk vehicle import is on hold until the client supplies its stock workbook.

## Integrated locally

- Role-filtered Fast Track, calendar task assignment, Broker deal-price entry.
- Vehicle source, TIN/IC handling, dealer IC optionality, spare key and restricted cost responses.
- Bank settlement lifecycle, linked payment evidence, legacy replacement guards and stale-confirmation checks.
- Inspection listing/forms/API/documents and report-before-completion; booked appointments appear in the Dashboard calendar.
- Purchase invoice Private/Company seller snapshots, SBI, KSA sold gate, AutoCount keyed tracking and dealer selection.
- Invoice generation uses Modified Purchase when present; legacy null falls back to Purchase Price. Explicit zero is rejected. Existing issued snapshots are unchanged.
- Slide 18 stock workbook download with source filter, no private fields, blank UCD Date, and Bank Loan column using the recorded bank name, CASH for explicit no-debt/settled bank loans, and blank when unknown.
- Individual new-stock notification queue, configurable event delay, assigned-calendar-task reminders with dispatch-time refresh.
- Boss WhatsApp asking-price preview/confirmation, expiry, identity validation, duplicate protection and stale-price rejection.
- Dealer-only Processing, Trailer, Parking, Late Charge and Discount inputs, nullable storage, Boss-only response fields and negative-value validation. Existing invoice and profit formulas are unchanged.
- Boss WhatsApp bank-settlement details: `settlement-update <plate> | <amount> | <yyyy-mm-dd> | <bank> | <account>`, followed by `settlement-update confirm <preview id>`. The preview expires after five minutes; confirmation validates the current binding and source record, masks account numbers in replies and records an audit. It does not mark a payment complete or convert legacy records.

## Still in progress or dependent

### Current attachment implementation slice

- Reuse the existing outbox, verified staff binding and template approval manifest for inspection appointment PDF delivery. Upload the owned PDF to Meta, then send its media ID in the approved document-header template; never expose a public document URL.
- Require the exact inspection/vehicle ownership and appointment category, a valid PDF within the existing 10 MB limit, and current recipient eligibility immediately before submission. Missing/invalid files must not silently become text-only success.
- Extend the existing sender/outbox tests for rejected attachments, template approval, provider failures and exactly one document submission. Use synthetic HTTP responses only.
- Direct Friday XLSX delivery remains required, with no reply-to-collect or PDF/link substitution authorized. Meta's current policy requires approved templates outside the 24-hour window; XLSX template support needs authoritative confirmation before claiming unattended delivery works.
- WhatsApp intake media capture and draft creation are implemented in the later checkpoint below; live end-to-end intake remains unverified.

- Inspection appointment PDF attachment transport is integrated locally and passed synthetic transport tests. Production needs an approved document-header template; no actual file was sent during development. Image appointment slips are not converted automatically and are suppressed by this PDF-only template path.
- Friday WhatsApp Excel transport is not implemented. Do not substitute an inspection PDF or a download link for the required stock workbook.
- WhatsApp intake creation is implemented with explicit VOC/IC draft captions, not general AI document classification. Settlement detail updates are integrated locally; actual WhatsApp transport and PostgreSQL concurrency for this new command remain unverified.
- All requested News/delivery triggers and template-content editing require completion review; only the listed notification slices are verified.
- Role-specific Broker/Admin/Worker Dashboard pages remain incomplete: the existing Dashboard route is still Boss/Admin-only. This release adds Boss task assignment and Broker workboard deal-price entry, not the complete staff Dashboard experience. Do not widen access to private management metrics to satisfy that follow-up.
- Inspection AutoCount export requires confirmed template/company/account mappings. No guessed accounting format is accepted.
- UCD Date meaning and purchase-invoice Excel TIN placement remain unresolved source details. The user confirmed that WhatsApp intake reuses the existing vehicle-intake fields; the minimum template is no longer pending clarification.
- Dealer charge inputs and all slide-specific details require final source-to-code audit before closing the parent ticket.
- Global adjustable page size remains incomplete: the App and HR list helpers still have fixed page sizes; vehicle sublists also need alignment. Vehicle main listing, Finance lists, bank settlements and collection ageing records default to 10 and support 10/20/50/100. Finance desktop and mobile use the same selected size for slicing and page counts.

## Evidence

- Combined backend checkpoint: 844 passed, 1 skipped because isolated PostgreSQL was not available. Subsequent changes require their focused checks and final integrated rerun.
- Invoice monetary regression: failure observed before fix, then 15 invoice tests passed.
- Stock/invoice/inspection/bank focused suite: 30 passed.
- Backoffice checkpoint after dealer invoice UI: 524 passed and production build passed.
- Calendar focused suite: 11 passed; API project build passed.
- WhatsApp asking-price preview/confirm/replay/expiry focused test passed against SQLite; PostgreSQL concurrency needs runtime verification.
- Full solution no-restore build was blocked by missing Aspire AppHost restore assets; this is separate from the successful API project build.
- Existing package vulnerability and chunk-size warnings remain. No real messages sent and no live database migration executed.

### Storage recovery and verification follow-up

- The isolated PostgreSQL check subsequently passed (1/1), including application startup with synthetic provider transport. Temporary diagnostic instrumentation was removed. This does not prove live WhatsApp delivery or every monetary concurrency path.
- Disk exhaustion interrupted dealer-charge and WhatsApp settlement work. Cleanup commands were rejected; no deletion succeeded. The user freed space and authorized continuation. Latest check found approximately 15.3 GiB free; implementation resumed with existing dependencies and serial builds.
- The stock export and staff assistant focused suite passed 97 checks after the bank-name/CASH and Boss-only settlement query corrections. The outbox suite passed 96 checks after unsent reminder retargeting. These are checkpoints, not final verification of subsequent changes.
- Finance pagination follow-up: existing finance list, shared table and table-contract suites passed 24 checks; TypeScript no-emit passed. Browser interaction for the new size selection remains to verify.
- Restoring existing .NET test dependencies resolved a build-only no-test run. BusinessRules then passed 397 checks including dealer-charge privacy/source/negative-value coverage. Staff assistant passed 96 checks after settlement command integration; the five settlement checks passed again after adding expiry, revoked-binding and completed-payment rejection cases. No live messages were sent.
- Final backend run for this checkpoint: 856 passed, 1 skipped (isolated PostgreSQL environment not enabled for this run). Earlier PostgreSQL evidence predates the new settlement-command schema and must not be treated as validation of it.
- Attachment follow-up: 99 outbox checks passed, then the complete backend passed 859 with 1 PostgreSQL-environment skip. Synthetic tests verify upload before message submission, media-ID document headers, invalid PDF rejection, eligibility recheck and mismatched vehicle-document rejection. No actual Meta upload or message occurred.

### Inspection document-template configuration

- Add a template mapping under the existing `WhatsApp:Templates` list with key `inspection_appointment_document_v1`, the actual approved Meta name, language `ms` or `en_US`, `HeaderFormat: DOCUMENT`, and real approval evidence. Keep existing reminder templates for other reminder kinds.
- The approved template requires a document header and one text body parameter. The sender uploads the stored appointment PDF privately to Meta and supplies the returned media ID. It never makes the document publicly downloadable.
- The appointment file must be the latest appointment confirmation belonging to that inspection and vehicle, with no unrelated customer, repair, finance or loan links; PDF signature and the existing 10 MB limit are checked.
- Missing approval keeps messages queued; missing or invalid attachments suppress the send. Unknown delivery outcomes retain the existing no-blind-retry behavior.
- Reference: [Meta messaging policy](https://whatsappbusiness.com/policy/) requires approved templates outside the 24-hour service window. [Meta document-message reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/document/) lists XLSX for ordinary document messages, which does not establish XLSX template eligibility. Direct weekly stock delivery remains unresolved, without a reply-to-collect fallback.

## Review corrections and operational recovery

- Finance-only accounts intentionally cannot use bank settlement or its evidence. Boss/Admin-only access is the confirmed requirement.
- Bank payment evidence must belong to the vehicle and exact settlement, with no customer/owner/repair/delivery/loan/inspection or collection links.
- WhatsApp price confirmation locks its draft and vehicle, checks current identity again after waiting, and rejects expiry while waiting.
- A WhatsApp request with unknown delivery outcome is not replayed automatically. Check its recorded business result and provider history before any manual follow-up. For price updates, read the current vehicle price and draft status first; a fresh preview is required for a new change. Never reset an ambiguous row to Queued blindly.
- Slide 17 desktop and mobile inventory views are simplified. Vehicle page size defaults to 10 and can be adjusted. Synthetic browser inspection at 390, 820 and 1440 pixels showed no horizontal overflow.

### Confirmed WhatsApp intake template

- User confirmed: reuse existing intake details (plate, make/model, year, purchase source, selling price and seller name/phone/TIN/IC). VOC remains required; dealer IC is optional. Preserve existing catalog, owner and settlement validation rather than adding a second rule set.
- Boss uploads the supporting files, reviews the collected details and confirms before vehicle creation. Current binding/role checks and duplicate-confirm protection are required. Incoming media must remain private and belong to that draft.
- Extracted the existing HTTP handler into `Features/VehicleIntake.cs` without changing its validations, transaction, document ownership or audit behavior. The HTTP route now calls that shared handler. BusinessRules verification: 397 passed. This is preparation for WhatsApp intake, not evidence that incoming media or WhatsApp vehicle creation is complete.

### WhatsApp intake implementation checkpoint

- Implemented `create-vehicle` to return the existing intake field template. A valid filled template creates a Boss-bound 30-minute draft, not a vehicle. Active catalogue matching and existing-owner consistency are required.
- Boss uploads VOC/IC with `VOC <draft-id>` or `IC <draft-id>` captions, requests `create-vehicle preview <draft-id>`, then sends the returned `create-vehicle confirm <token>` within five minutes. Replacing a file invalidates the previous confirmation. Dealer IC is optional; private intake requires it.
- Signed webhooks route supported images/documents through the existing staff queue. The downloader retrieves media metadata from Meta with the business phone ID, pins the download destination, disables redirects, bounds the complete operation to 40 seconds, caps documents at 10 MB and checks SHA-256 before existing intake MIME/content validation.
- Vehicle, owner, VOC/IC, audit and draft confirmation save in the same transaction through `VehicleIntake.CreateCoreAsync`. Current Boss binding, expiry and draft ownership are enforced. Repeated confirmation does not create another vehicle. Existing owner details are never overwritten from the command.
- Confirmed draft payload/document copies are cleared; the worker clears expired private draft data and expired intake command arguments even for inactive/revoked bindings. Independent read-only review confirmed the retention corrections and transaction/cleanup ordering.
- Verification: full backend 869 passed, 1 isolated-PostgreSQL skip; subsequently expanded intake coverage passed 12 cases covering actual queue/media routing, ownership, private/dealer documents, duplicate confirmation, invalidated preview, revoked/expired confirmation, media host/size/checksum and expired private-data cleanup. Docker engine is unavailable in this run. No actual Meta upload/download/send occurred; no merge or deployment.
- Friday XLSX direct push remains unresolved. The implementation does not substitute PDF, a public link or reply-to-collect. The template capability must be verified with Meta before claiming unrestricted scheduled XLSX delivery.
- Media retrieval reference: https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url

### Live Excel attachment test and interim scope (14 November 2026)

- A synthetic XLSX was uploaded to Meta with the explicit spreadsheet MIME type and sent as an ordinary document message, without a template. Meta accepted the message and the user confirmed receipt. This proves this test's delivery, not unrestricted scheduled delivery.
- The first attempt used a stale sender ID from the local probe secrets and failed before message submission. Resolving the user-confirmed display number against the existing business account supplied the current sender ID. Production configuration was not changed; application code must continue using its configured sender, never a hardcoded test ID.
- The document template remains under appeal. User explicitly selected the ordinary-document method for now. Friday stock scheduling must check a verified recent inbound message before sending; outside the 24-hour window, report the blocked reason without silently substituting a template, PDF, public link or reply-to-collect flow.
- Boss/Admin retains control of the sending time. Preserve current binding/role checks, weekly deduplication and no blind retry after an ambiguous provider outcome. Implementation and focused verification of this interim scheduling path are in progress.

### Authorized release boundary

- User authorized releasing verified, ready functionality while deferring the template. Friday scheduling remains incomplete and is excluded from the release candidate; its work-in-progress patch is retained separately.
- No new template approval, production sender change or notification enablement is part of this release. Existing document-template paths remain gated on a valid approved manifest.
- Release candidate validation, independent review, CI, merge, deployment and HTTPS smoke must be recorded separately before declaring any feature live. Parent scope remains incomplete where source/accounting mappings and deferred automation are outstanding.

## Inspection supplier invoice entry clarification (FOO-253)

- Each booking contains one vehicle. The original supplier receipt number remains separate for shared receipt allocation checks.
- Staff manually enter Supplier Invoice No, including any confirmed bracket suffix. The system does not assign or rewrite the number.
- On field blur, check availability and suggest the next unused bracket suffix for duplicates. Submission checks again under a transaction lock; historical numbers remain reserved and unchanged.
- Comparison trims outer whitespace and ignores case across inspection records, consistent with the existing globally unique supplier reference. AutoCount's own purchase invoice number is a different number.
- Existing attachment ownership and company selection are unchanged. Inspection Excel export remains a separate unfinished item; this change does not claim an AutoCount import/export implementation.
