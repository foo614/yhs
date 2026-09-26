# FOO-40 WhatsApp implementation

Ticket: [FOO-40](https://linear.app/foo-lim-dick/issue/FOO-40/implement-a-bahasa-first-whatsapp-notification-engine).

## Agreed direction

The user accepted the proposed defaults on 2026-09-26 and requested a simple function test first:

- Meta Cloud API, disabled by default while provider verification is pending.
- Explicit recipient opt-in and immediate opt-out.
- Delivery-log retention of 90 days.
- Configurable daily send cap; live automated sending stays disabled until a budget is set.
- Bahasa Malaysia customer templates, with an approved English fallback.

These are implementation defaults, not evidence of Meta approval, available credentials, template approval or completed cost review. FOO-41 remains dependent on this engine.

## First slice: test-message function

`WhatsAppTestSender.SendHelloWorldAsync` sends only the standard `hello_world` template in `en_US` to one configured test recipient. English is specific to this Meta test template and does not change the planned customer language default.

The helper is deliberately not registered in the API or reminder worker. It has no endpoint, database changes, automatic triggers or production configuration. It requires explicit enablement, test-recipient consent confirmation, an international number, a phone-number ID, an access token and an explicitly selected Graph API version. No new package is required.

Acceptance means the provider returned a message ID; it does not prove delivery. HTTP errors return only their status code. Malformed responses, network failures and timeouts return an unknown outcome without retry, since the provider might already have accepted the message. Caller cancellation propagates. The public constructor owns a dedicated HttpClient with redirects disabled, a 30-second timeout and no resilience handler; dispose the sender after use. Test-only internal injection avoids the application's shared factory, which adds automatic retries.

Tests use an in-memory HTTP handler, synthetic settings and no external network. They verify the Meta request contract, disabled/consent gates, invalid settings, acceptance, redacted failures and no automatic retry:

```powershell
dotnet test services/api/tests/YSHeng.Api.Tests/YSHeng.Api.Tests.csproj --filter FullyQualifiedName~WhatsAppTestSenderTests
```

The test suite's API version is a fixture, not a production version selection. For a later live smoke test, obtain the supported version, test sender phone-number ID and verified recipient from Meta's API Setup. Keep the token in an environment variable or .NET user secrets, never source control or chat. Construct the helper with `using var sender = new WhatsAppTestSender();`. Confirm the recipient before invoking the helper once. Verify receipt on the test phone separately. Do not wire this helper into customer workflows: its explicit consent flag is a manual test assertion, not a persisted consent system.

Provider contract: [Meta's Send Test Message example](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-accf558f-2cde-4c15-8921-8fcb11b375ac).

## Isolated two-way test probe

The first real `SendHelloWorldAsync` request returned HTTP 200 and a message ID; the user confirmed receipt. A read-only business profile request also returned HTTP 200. Token introspection confirmed that the token is valid, belongs to the user's selected Meta app and includes management permission. These checks do not prove Meta's dashboard test counters have updated.

`services/api/tools/YSHeng.WhatsAppProbe` is a standalone, loopback-only test host, separate from the production application and database. It now uses the shared EF model with an isolated local SQLite database. It reads the shared .NET user secrets: `WhatsApp:AccessToken`, `AppSecret`, `VerifyToken`, `PhoneNumberId`, `GraphApiVersion` and `TestRecipient`. It must not be deployed as the production notification engine.

```powershell
dotnet run --project services/api/tools/YSHeng.WhatsAppProbe
```

- The host binds port 5099 and exposes only `/webhooks/whatsapp` for GET verification and POST callbacks.
- Verify tokens and raw-body HMAC signatures are checked before processing. Payloads are limited to 256 KiB. Request logging is disabled to keep query credentials and content out of logs.
- Only fresh commands from the configured test recipient and sender phone-number ID can enqueue replies. `test`, `stock` and `stock <make/model/plate>` remain English test replies. `language ms` and `language en` persist the notification preference, defaulting to Bahasa Malaysia. `notify enquiry`, `notify receipt` and `notify update` render labeled draft previews in that preference using a synthetic reference. These are session text replies, not approved Meta templates or real business events. Chinese query aliases are removed; the legacy Chinese opt-out still revokes consent for safety. Raw incoming message text is not retained; generated outbound text is retained in the test queue.
- The user removed the three-reply test cap. The worker processes at most one queue item per second; there is no total or daily testing cap. A unique hashed event/recipient/template key prevents duplicate callback sends. Legacy SHA-256 markers are still honored. Unknown outcomes are quarantined, never automatically retried. Explicit HTTP 429 rejections retry at most three attempts with delays, within the five-minute test reply expiry.
- `STOP`, `berhenti` and `退订` persist local consent revocation and the legacy opt-out marker, suppress queued replies and block test commands in the same batch. A send already in flight can finish before STOP obtains the serialized dispatch lock. Consent is rechecked before each dispatch. Restart never re-enables an opted-out recipient; renewed authorization is required. This is not the production consent database.
- State is stored under the current user's local application data in `YSHeng/WhatsAppProbe`. `queue.db` contains the configured recipient number, consent state/evidence/time, generated outbound body, language/template version, attempts, provider message ID, delivery state and audit events. It contains no token, app secret or raw inbound payload. Legacy marker filenames contain hashes. The local database is not encrypted by this tool and must remain private to the local user, outside source control and shared artifacts. Runtime tools/logs are under `YSHeng/WhatsAppProbeTools` and contain only sanitized outcomes.
- Test data remains across restarts to preserve deduplication, consent and recovery evidence. No automated deletion/retention job is enabled. At test closure, review and explicitly authorize cleanup of the isolated test database and markers; do not clear opt-out or idempotency history while the callback is active. The 90-day production retention policy is still an implementation requirement, not an existing cleanup guarantee.
- A temporary Cloudflare quick tunnel exposes this isolated host. It is not a deployment and stops working when the tunnel or host stops. The app previously had no WhatsApp webhook subscription; its `messages` subscription was registered and re-read as active with the expected callback.
- Local GET verification and signed empty-event POST returned 200; wrong verification token and forged signature returned 401. The full backend suite passed 478 tests. A separate review found no actionable issues within this test scope.
- Real inbound delivery is confirmed: after the user sent `测试`, the host received a signed message from the configured recipient and Meta accepted the fixed reply with HTTP 200. This demonstrates inbound routing for this test sender even though the token could not enumerate the business portfolio's accounts. No additional business permissions were requested or changed. Receipt of the automatic reply on the user's phone remains to be confirmed.

After testing, remove or replace this temporary app callback before stopping the tunnel; do not leave the temporary URL as the production webhook. Stop only the recorded probe and tunnel processes when they are no longer needed. Do not clear opt-out state to resume sending without renewed recipient consent.

## Production slices remaining

1. Persist consent, opt-out, approved template versions and outbox records. Enqueue alongside eligible business changes in the same transaction, with a unique event/recipient/template idempotency key.
2. Implement worker claiming, send caps, bounded retries and dead letters. Re-check consent and template eligibility immediately before sending; ambiguous provider acceptance needs reconciliation rather than blind resend.
3. Verify webhook signatures against the raw request body, deduplicate callbacks, and reconcile delivery states without regressing terminal outcomes. Process opt-out before further sending.
4. Connect website enquiries and official receipt notifications first. Preserve finance/document permissions; do not expose protected receipts through public URLs. Then add loan, collection, settlement, task and HR reminders with minimal message content.
5. Add role-scoped back-office status and audited safe retry controls. Retain only necessary delivery metadata and apply the 90-day retention policy without silently deleting required consent evidence or business audit records.
6. Verify queue concurrency, webhook forgery, opt-out races, authorization and integration behavior; run `infra/verify-local.ps1` before declaring the ticket complete.

Production enablement still requires verified sender identity, approved templates, securely configured credentials/webhook secret, a named cost owner and budget, and live delivery proof. This first slice does not complete FOO-40 or FOO-41.

## Historical public inventory API test extension
- Added exact `stock` (and 库存) command to the signed, allowlisted temporary probe.
- Fetches only the existing anonymous production public inventory endpoint; English response shows up to five available listings with year, make, model, plate and selling price.
- This is not a staff identity binding or FOO-41 private inventory assistant. No production account, role, database or application deployment was changed.
- Existing opt-out, durable duplicate markers, freshness window and maximum three replies per process remain enforced.
- Verification: build passed; 483 backend tests passed. A synthetic signed stock callback through the active tunnel returned HTTP 200 and its live Meta send returned Accepted/HTTP 200. Real user stock-message receipt and delivery confirmation remain pending.

## Historical stock search continuation
- Added `stock <make/model/plate>` with case-insensitive matching of all search terms against public plate, make and model only; search input is limited to 80 characters without controls.
- Formatter, parser and temporary host updated; existing webhook tests extended for matching, no-match, private-field exclusion, and oversized commands.
- Build and all 490 backend tests passed. Temporary probe restarted for three new test replies. Real user search-command verification remains pending. Work remains uncommitted, unmerged and not deployed to the production application.

## Follow-up: verified callback recovery and delivery tracking
- Re-read Meta subscription: active and matches current temporary callback. Public verification challenge returned the exact expected value.
- Added signed sender/recipient-scoped status parsing and hashed accepted-message correlation. Sent/delivered/read/failed updates are serialized and cannot regress delivery evidence. Status callbacks never trigger outbound messages; no raw identifiers, recipient numbers or provider errors are logged.
- All 507 backend tests passed, including status ordering, recipient isolation, stock input boundaries and outgoing inventory text contract. Independent scoped review found no actionable finding.
- Synthetic signed `stock Audi` invocation through the real tunnel returned HTTP 200; the live Meta reply was accepted and genuine provider callbacks progressed to sent and delivered. This proves provider-reported delivery, not user read confirmation or real user search-command origin.
- Production event matrix, template drafts and outstanding durable-engine contract are in `2026-09-27-foo-40-notification-events.md`. No staff binding, production queue or automated customer sending is enabled.
- Final verification: after installing locked workspace dependencies, `infra/verify-local.ps1 -SkipSmoke` passed: type checks, 87 front-office tests, 488 back-office tests, 507 backend tests, infrastructure/documentation contract checks and both web builds. Existing bundle-size warnings remain. Docker smoke was deliberately not run after the user moved testing away from local Docker; the full unskipped acceptance check remains outstanding.
- Meta status reference: https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object

## Test queue scope (2026-09-27 user clarification)
The user explicitly removed the per-run testing limit and clarified that production budgets must not block test implementation. Keep the single configured recipient, signed commands and existing sender credentials; no customer automation or production database changes are authorized by this clarification.

Implement shared EF consent/outbox records in the existing model, exercised by the isolated probe against a new local SQLite database. The probe uses the same SQLite dependency versions already present in backend tests; no new production package is added. Add transactional staging, unique event idempotency, atomic worker claims, consent/expiry/allowlist checks, bounded retries for explicit 429 rejections, unknown-outcome isolation, durable delivery status and audit events. Remove the three-reply cap, retain one dispatch per second, and preserve prior opt-out/deduplication markers. Verify duplicate events, transaction rollback, competing workers, opt-out, expiry, retries, unknown outcomes, status ordering, restart persistence and a live test send. Production schema rollout, template-based events and authorized monitoring UI remain separate work.

Local operator inspection: run the probe with `--queue-status` to show the latest 20 IDs, states and attempt counts, without recipient numbers or bodies. `--retry-dead-letter <id>` is an explicit local operator action: it requeues only an unexpired dead letter for the configured, still-consenting test recipient, writes an audit event, and refuses unknown outcomes, delivered messages, other recipients and persisted opt-out. It does not erase attempt history. The later application queue API/UI uses the application database, not this local probe store; see the notification event plan for current implementation status.

Production caps/cost ownership and template approval remain production enablement requirements only; they are not blockers for continuing local/test queue development. The user explicitly confirmed this on 2026-09-27.

### Historical test queue results (before the token refresh and business integration slice)
- Shared EF consent/outbox models, unique idempotency index, transactional staging/audit, atomic claim, five-minute expiry, consent/allowlist checks, 429 backoff/dead-letter handling, ambiguous-send quarantine, durable status and guarded local operator retry are implemented. The production API does not register dispatch; no production schema was changed.
- Build passed with zero warnings. All 523 backend tests passed, including 16 SQLite queue cases. Previous frontend/type/build/contract verification remains applicable; this slice changes no frontend code. PostgreSQL deployment/migration and Docker smoke have not been verified.
- Live signed duplicate callback test: two callbacks created one local outbox row and one send attempt. Meta returned HTTP 401, so the row became DeadLetter. The current access token must be refreshed for successful new live sends; production budget is not a test blocker.
- Restarted the actual process against the existing database and replayed the same callback: still one row, one attempt, and retained consent. No duplicate resend occurred. The updated host is running without a total reply cap.
- Earlier delivered proof belongs to the pre-queue test. This new queue path has verified failure/deduplication/restart proof; successful real delivery through the new queue awaits a valid provider token. Credentials were not printed or changed.
- Meta token introspection subsequently confirmed `is_valid=false` for the saved access token. No credential was printed or changed. Refresh the local token before another live outbound test.
- Independent review found a local operator concurrency gap; fixed `--retry-dead-letter` to acquire the same exclusive process lock. Stop the test host before requesting a local retry, then restart it to dispatch. Read-only status remains available while running. Actual retry invocation while the host held the lock was refused without mutation; final build passed with zero warnings.
