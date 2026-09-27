# WhatsApp notification event contract

Historical capture-only plan, superseded by [the dispatch continuation and activation boundary](2026-09-27-foo-40-dispatch.md). The implementation and verification statements below describe the earlier capture release, not the current release candidate. The current API registers a production sender and worker when all dispatch approval, callback and budget gates are satisfied. Keep capture, sending and callbacks disabled until the separate activation review is complete.

This is the remaining production design for FOO-40, not enabled automation. The isolated stock probe is separate. Meta Cloud API is selected. All template names and wording below are drafts, not approved Meta templates.

## Event matrix

## Current implementation slice

Capture website enquiry and issued receipt events in the caller's database transaction. Capture is off by default (`WhatsApp:CaptureEnabled`); there is no production dispatcher. Draft business messages remain `HeldForApproval`, separate from test text messages. Existing recorded opt-in is required; public form submission never grants consent. Admin-only controls show masked recipients, language/template/reference/state and support consent recording, suppression and narrowly guarded test-message retry with the authenticated actor. Approval or release of held business templates is not exposed. Additive PostgreSQL schema setup runs only when capture is explicitly enabled. Verify rollback, duplicate-event behavior, opt-out, permissions and retry refusal; run backend and back-office checks. No production database or finance decision rules are changed during validation.

| Event | Recipient and eligibility | Idempotency inputs | Minimum content |
| --- | --- | --- | --- |
| Website enquiry recorded | Customer with explicit WhatsApp opt-in; assigned staff only after verified staff binding | enquiry ID, event kind, recipient, template version | Enquiry reference and acknowledgement; no copied free-text enquiry |
| Loan status changed | Canonical customer, consent present, committed status transition | loan ID, transition version, recipient, template version | Reference and request to contact staff; no rejection reason or financial terms |
| Collection or debt follow-up due | Responsible verified staff with current finance permission; customer contact requires separately approved customer template | case ID, due date, recipient, template version | Reference and due date; no debt amount in lock-screen text |
| Settlement due | Responsible verified finance staff, current assignment and permission | settlement ID, due date, recipient, template version | Reference and due date |
| Assigned task due | Active verified assignee with current access | task ID, due date, recipient, template version | Reference and due date; no task body |
| Leave or business-trip reminder | Active verified staff owner/approver with current HR access | request ID, event kind, reminder date, recipient, template version | Generic reminder; no reason, medical information, or trip details |
| Official receipt issued | Canonical receipt customer, explicit consent, finalized non-void receipt | receipt ID, issue version, recipient, template version | Receipt reference and contact instructions; no public document URL |

Existing `ReminderWorker` scans due conditions and logs counts only. Those scans are not notification enqueue hooks. Website enquiry and receipt flows must share one outbox service after the domain mutation succeeds in the same database transaction. No send may occur inside that transaction.

## Draft templates

Default customer language is Bahasa Malaysia. English is permitted only when that exact fallback version is approved. The user's English stock-test preference does not change customer notification defaults.

| Draft key | Bahasa Malaysia | English fallback |
| --- | --- | --- |
| enquiry_ack_v1 | Terima kasih kerana menghubungi YS Heng. Pertanyaan anda {{1}} telah diterima. Pasukan kami akan menghubungi anda. Balas STOP untuk berhenti menerima pemberitahuan. | Thank you for contacting YS Heng. We have received your enquiry {{1}}. Our team will contact you. Reply STOP to stop notifications. |
| business_update_v1 | YS Heng: Terdapat kemas kini untuk rujukan {{1}}. Sila hubungi pasukan kami untuk maklumat lanjut. Balas STOP untuk berhenti menerima pemberitahuan. | YS Heng: There is an update for reference {{1}}. Please contact our team for details. Reply STOP to stop notifications. |
| receipt_ready_v1 | YS Heng: Resit rasmi {{1}} telah tersedia. Sila hubungi pasukan kami untuk mendapatkannya. Balas STOP untuk berhenti menerima pemberitahuan. | YS Heng: Official receipt {{1}} is ready. Please contact our team to obtain it. Reply STOP to stop notifications. |

Provider classification, final wording, language code, approved name/version and sender identity must be verified before these drafts can be registered for sending. Receipt document delivery needs a separately reviewed authenticated delivery mechanism; the draft notification is not document delivery.

## Durable engine contract still to implement

- Persist normalized recipient consent with evidence, purpose, language, opt-out timestamp and actor. Entering a phone number is not consent. Re-check consent and recipient eligibility immediately before provider submission.
- Unique database key over event identity/version, recipient and template version. Enqueue and business mutation commit together. Duplicate events return the original outbox row.
- Claim work with a database lease and exclusive attempt ownership. Reserve the daily allowance transactionally across all workers. Zero or missing daily cap, budget owner, sender approval or approved template disables automated sends.
- Record `Queued`, `Sending`, `Accepted`, `Sent`, `Delivered`, `Read`, `RetryScheduled`, `Failed`, `DeadLetter`, `Suppressed` and `UnknownOutcome` distinctly. HTTP acceptance is never delivery proof.
- Only known non-acceptance that is explicitly retryable may retry with bounded backoff and maximum attempts. Timeout/connection failure after submission requires reconciliation; do not automatically retry ambiguous sends. Manual retry cannot bypass consent, caps, permissions, deduplication or unknown-outcome review.
- Signed callbacks must match configured sender and known provider message ID. Deduplicate and merge states without regressing read/delivered evidence. Preserve minimum audited metadata; never persist raw payloads, tokens or provider error bodies.
- Role-scoped operational list and audited retry/suppression controls are required. Staff account disablement, role removal and reassignment must apply to the next send.
- Delivery metadata retention is 90 days; consent evidence and business audit retention require independent treatment. No destructive retention job is enabled by this plan.

## Completion and external gates

Still needed: approved sender/templates, daily cap/monthly RM budget/cost owner, production consent/outbox schema and migration review, worker and all event integrations, back-office monitoring/retry authorization, production webhook hosting, concurrency/opt-out-race/permission/integration tests, and complete `infra/verify-local.ps1` proof. Do not mark FOO-40 complete based on the probe.

## Implementation status, 2026-09-27

## Production verification assessment

Read-only live checks: readiness and public inventory returned 200; `/api/whatsapp/queue` returned 404. This feature is not deployed. Local Docker later recovered, but the normal execution tool twice rejected the specifically authorized isolated PostgreSQL/API startup with `blocked by policy` and no detailed reason. No isolated environment was created; PostgreSQL HTTP/schema verification remains open.

Release candidate is uncommitted. Latest origin/main was one commit ahead with no overlap in the changed API/domain/admin files at inspection. Before publication: update the task branch, complete local diff review, PR checks (web types/tests/build/responsive, .NET tests, deployment contracts and required security checks), merge verified main and use the normal release workflow. Do not deploy this dirty worktree. The responsive CI fixture now includes the disabled WhatsApp queue and the targeted admin browser check passed.

Minimal production option: release with `WhatsApp:CaptureEnabled=false`. This neither runs the new WhatsApp schema setup nor captures customer events and permits only readiness, authenticated authorization and disabled-state UI checks. It cannot validate real notification persistence. No production sender is registered in either mode.

Enabling capture adds the two consent/outbox tables, additive columns/indexes, and transactional business hooks. It changes persistence and therefore requires the release/migration decision; it is not merely a read-only test. Limit any allowed live notification testing to the original test number, never replay historical failures or manufacture customer/finance records. Use a separate online staging database for receipt/enquiry mutation and rollback tests. Do not apply unpublished schema to the existing local or production database as a workaround for tool rejection.

Rollback: disable capture, redeploy the previously verified main release if necessary, and retain the additive tables and audit history. Do not drop tables, reverse migrations or clear consent/queues during rollback. Full acceptance remains open until isolated PostgreSQL verification and the remaining template/worker/staff-recipient work are complete.

- Implemented (not deployed): all three public enquiry creation routes, both official-receipt issue paths, receipt-void suppression, and actual loan status transitions stage minimal BM/English draft messages in the business transaction. Existing recorded international-number opt-in is required; local-format contact numbers are not guessed or automatically converted. Consent row write locks serialize staging and revocation. Drafts remain held and cannot enter the test dispatcher or manual retry.
- Added BossAdmin-only `GET /api/whatsapp/queue` (state filter, page, 25 rows), `POST /api/whatsapp/consent`, and `POST /api/whatsapp/queue/{id}/retry|suppress`. Queue DTOs mask numbers and omit bodies/provider IDs. Mutations audit the authenticated actor. Retry only requeues unexpired, consented test-recipient dead letters without provider acceptance; it does not enable dispatch. Unknown outcomes require review.
- Settings > WhatsApp now shows the queue, safe confirmed actions and consent/language recording. It explicitly distinguishes the application database from the separate local probe database.
- `WhatsApp:CaptureEnabled` defaults false. When explicitly enabled, startup applies additive PostgreSQL tables/indexes; no schema has been applied to a live database. There is no production dispatcher or template-release control. Application capture does not use the probe's SQLite database.
- Financial follow-up/settlement staff reminders: current settlement/debt records do not contain a verified responsible staff recipient. Do not guess a finance employee or use a customer number instead. Assigned repair work uses a free-text `AssignedTo`; there is no generic assigned-task entity. Leave/trip records have a staff ID but no verified WhatsApp binding. These integrations depend on the FOO-41 binding contract and explicit ownership mapping; the existing reminder worker still logs counts only.
- Production remains incomplete: approved template registry/sending worker, verified staff reminder recipients, retention execution, production webhook deployment and full PostgreSQL HTTP/permission smoke. Production budget decisions do not block local testing.
- Verification: 539 backend tests including transactional rollback, held-draft isolation, duplicate events, canonical receipt customer, void suppression, loan transition, masked admin projection, safe retry, and concurrent revoke/stage using SQLite WAL; 490 back-office tests; back-office production build. Browser fixture checks covered desktop/tablet/mobile layouts; these do not claim authenticated live API proof. Docker's Linux engine was unavailable, so PostgreSQL startup/schema and full API smoke remain unverified.
