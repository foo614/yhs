# WhatsApp delivery roadmap

Prepared with Astra on 2026-09-27. This plan covers the original notification and management-assistant requirements, plus the user's delivery-date query request. Recommendations below are not claims that every feature is available.

## Current evidence

- The isolated phone test connection is restored. Two new public-stock replies were accepted with HTTP 200, reached the durable queue's `Read` state, and the user confirmed receipt.
- Production capture, sending and webhook processing remain disabled. The notification admin page, event capture hooks, template dispatcher, configured budget gates and signed callback are already released; do not rebuild them.
- Enquiry, receipt and loan-status capture hooks exist. Real customer automation remains inactive. Receipt notification is not authenticated receipt-document delivery.
- FOO-40 remains In Progress. FOO-41 remains Todo; no staff binding or private conversational queries are available.
- The local test host and temporary tunnel depend on this computer and both processes remaining active. This is not permanent production hosting.
- Older event/test plans contain historical snapshots. The dispatch continuation and this roadmap describe the current scope; old token failures or statements that no dispatcher exists are not current blockers.

## Complete business scope

| Business need | Current capability | Next delivery |
| --- | --- | --- |
| Public vehicle availability | Live `stock` and bounded make/model/plate search | English help; later public listing links and bounded pagination |
| Website enquiries | Consent-gated event capture and draft notification | Approved acknowledgement template, isolated integration proof and controlled activation |
| Loan progress notifications | Loan-status event capture and shared dispatch infrastructure | Approved minimal update templates and real event-to-delivery proof |
| Official receipt | Receipt event capture and notification infrastructure | Receipt-ready notice first; authenticated document delivery separately |
| Collections/debt and settlement reminders | Existing business records; verified responsible staff recipients missing | Ownership mapping, consent/binding, minimal templates and deduplicated scheduling |
| Assigned work reminders | Repair assignment is free text | Explicit staff ownership before notification routing |
| Leave and business-trip reminders | Records have staff IDs but no WhatsApp binding | Verified recipient and minimal availability content, excluding private reasons |
| Staff vehicle/loan enquiries | Existing protected backend APIs | Verified staff binding and role-scoped read-only adapters |
| Delivery date lookup | Requested for the management assistant | Authorized lookup by plate with explicit scheduled/not-scheduled status |
| Collections, settlements, profit and dashboard enquiries | Protected backend data; no WhatsApp assistant | Current Finance/Dashboard policies enforced on every query |

## Available test commands and first change

| Command | Behavior |
| --- | --- |
| `help` | New fixed English menu; validate locally and by phone before claiming live availability |
| `stock` | Up to five public vehicles for sale |
| `stock toyota` | Public make, model or plate search, bounded to 80 characters |
| `test` | Connection acknowledgement |
| `stop` | Persistent opt-out; operator-assisted renewed authorization is required to resume |
| `language en` / `language ms` | Notification-preview preference only; stock/help stay English |
| `notify enquiry` / `notify receipt` / `notify update` | Synthetic demo previews; no real event creation or receipt-document delivery |

Unknown messages remain ignored in this slice. `more`, `details`, delivery and other private business commands must not be advertised as available. Help uses the existing signature, sender/recipient, freshness, consent, deduplication, expiry and dispatch controls; no schema or production callback change.

## Implementation order

### Proposed business query menu

Nine query families are planned. Only `stock` is currently live in the isolated phone test. Help, test, stop and demo previews are utilities, not additional business queries.

| Query | Result | Planned access |
| --- | --- | --- |
| `stock [search]` | Public available inventory | Public projection |
| `vehicle <plate>` | Minimal internal operational vehicle status | All verified active staff |
| `loan <plate>` | Minimal loan progress, excluding customer/document information | All verified active staff |
| `delivery <plate>` | Scheduled date/time and recorded release status/time | All verified active staff |
| `deliveries today` / `deliveries next 7` | Bounded upcoming scheduled handovers | All verified active staff |
| `collections <plate>` | Outstanding collections/debt | Finance, BossAdmin |
| `settlement <plate>` | Settlement outstanding and deadline | Finance, BossAdmin |
| `profit <period>` | Approved realised-profit aggregate | BossAdmin, current Dashboard boundary |
| `dashboard <period>` | Approved dashboard aggregates | BossAdmin, current Dashboard boundary |

The user's shared operational-summary preference supersedes narrower role suggestions for these limited queries. Separate summary policies preserve existing full-record and mutation permissions. Identity, account status, opt-out and output filtering apply to all private queries; no public endpoint becomes a staff query.

### Highest-value improvements within this scope

1. A truthful help menu with examples and clear separation between available queries, demos and planned features.
2. Consistent query replies: vehicle reference first, clear result/date/status, explicit unset/ambiguous/no-result handling and an authenticated workboard link where useful. Never expose an internal record through a public link.
3. Delivery date and upcoming handover views before broad natural-language interpretation.
4. Public listing links and bounded pagination, avoiding unlimited or stale message dumps.
5. Existing admin queue improvements: actionable redacted failure/configuration status and safe reconciliation rather than blind resend.
6. Stable callback hosting, per-user limits and a kill switch before a larger test group or production assistant launch.

### Delivery sequence

1. Ship help in the existing isolated test. Extend the existing parser suite, build the probe, preserve queue/opt-out history and verify a real `help` round trip.
2. Improve public browsing with a public website link before adding richer message content. Consider stateless `stock toyota page 2` with fixed page size and bounded page count; avoid stateful `more` until session ownership and expiry are defined.
3. Complete isolated business HTTP/PostgreSQL proof using the released notification infrastructure. Verify sender and exact template approval, securely configure credentials, set daily/monthly limits and a named cost owner, and establish stable production callback hosting. Activate only with consented recipients and explicit activation authorization. Start with enquiry acknowledgement, receipt-ready and loan update notices.
4. Reuse Settings > WhatsApp for worker/configuration health and actionable, redacted failure summaries. Keep unknown outcomes for human reconciliation. Implement the 90-day delivery-metadata retention policy separately from consent evidence and business audits.
5. Implement staff linking plus phone challenge, audited revocation and current role checks under FOO-41. Begin with deterministic vehicle, loan and delivery adapters; add Finance and BossAdmin aggregates only through their existing policies. Add natural-language intent selection after these adapters and adversarial tests pass.
6. Connect staff reminders after responsible-user ownership and verified recipients exist. Never substitute a customer number or guess an employee for routing.

## Delivery-date lookup

Prioritize deterministic `delivery <plate>` alongside loan progress after staff binding. Existing `DeliverySchedule` is authoritative: `ScheduledDate`, optional `ScheduledTime`, `Status` and optional `ReleasedAt`. The current `Deliveries` policy permits BossAdmin and Delivery. At the user's request, add separate minimal operational-summary query policies allowing all active, verified staff, including Sales. Preserve the current full-record and mutation policy; do not broaden delivery edits, release or approval permissions. Current `GET /api/deliveries` returns full records, so the assistant needs a separate bounded projection rather than copying that response.

- Match an exact, safely normalized plate. Return only plate, year/make/model, readable status, planned/scheduled date, optional Malaysia time and actual release time when recorded.
- Preliminary `BookingInspection` dates are planned dates, not confirmed handovers. A scheduled date does not imply readiness checks passed. Never substitute a scheduled date for an absent `ReleasedAt`.
- Explicitly report unset dates/times. Cancelled-only history reports no active delivery; do not display its date as current. A single active schedule takes precedence over cancelled history. Multiple vehicles or non-cancelled schedules require clarification instead of guessing the newest.
- Optional subsequent commands `deliveries today` and `deliveries next 7` show at most five scheduled handovers, with count and authenticated workboard link. Exclude cancelled, released, preliminary and unset-date records; use `BusinessClock.Today()` and stable date/time ordering. Preserve current role-wide visibility; `my deliveries` would be a separate PIC filter.
- Exclude customer names/phones, addresses, reasons, insurance/document references, finance clearance details and staff personal data. Do not use the finance-only outstation payment date as the delivery schedule.

Acceptance includes unbound/unauthorized denial, all intended verified staff roles allowed the read-only schedule projection, unchanged mutation/full-record permissions, current account/role rechecks before reply, ambiguous plates/schedules, unset dates/times, preliminary/cancelled/released status, scheduled-versus-actual dates, bounded lists, Malaysia date rollover, forbidden fields, opt-out and callback deduplication. No private delivery lookup runs through the public probe.

## Access and language boundaries

The test phone allowlist is not staff identity. Public browsing uses only the approved public inventory projection. Internal costs, margins, finance records, customer details and documents never enter a public response. Local test consent/outbox and production application consent/outbox stay separate.

Customer notifications default to Bahasa Malaysia with approved English preference/fallback. The user's English test commands do not change that default. Management queries are read-only: no approvals, payments, edits, exports, deletion or document downloads in the first release. Every private lookup rechecks active staff status and current permissions before retrieval and reply.

## Verification and completion

Help changes are confined to `WhatsAppWebhookProbe.cs`, the standalone probe `Program.cs`, the existing `WhatsAppWebhookProbeTests.cs` and these plans. Check exact help/case/whitespace, wrong sender/recipient, stale/future commands and existing STOP/idempotency behavior. Do not test every help sentence as a substitute for behavior.

Keep merge, CI/security, deployment and phone-delivery evidence distinct. Published planning and public-stock tests do not complete FOO-40 or FOO-41. Production activation, verified staff identity, retained-data cleanup and full repository verification remain separate acceptance items.
