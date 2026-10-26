# FOO-226: WhatsApp reminder templates v2

## Scope and decision

Separate initiative from the deployed FOO-224, FOO-225 and Customer 360 changes.
Code-only integration preserves their current behavior and keeps v1 configured.
Template submission, production configuration, real recipient sends and deployment
remain outside this integration scope.

Use four category-specific designs with eight distinct provider template names,
one English name ending in `_en` and one Malay name ending in `_ms` per design.
The user's Meta flow requires separate names per language. Language codes remain
`ms` and `en_US`, proposed category
`UTILITY`. Meta must confirm the category and approve each exact language variant.
Do not silently accept recategorization, change language codes or rewrite approved
bodies at activation. A generic variable-heavy template makes the three categories
harder to scan and cannot enforce each category's privacy and amount semantics.

The fourth template is a delivery-only version of OutstandingDigest for Sales.
BossAdmin's existing digest contains commissions, expenses, bank/debt follow-ups
and deliveries as well as seller payments. Replacing it with only seller payments
would silently drop work. Keep one digest and summarize other due work as a count.
The authenticated Portal contains the complete list. Sales sees only deliveries
assigned through the durable vehicle sales assignment, with no finance totals.

## Exact template pack

`docs/whatsapp/reminder-v2-submission.json` contains eight draft creation request
bodies with exact names, positional variables, example values and static buttons.
It is a review artifact, not an execution script. No automatic submission exists.

The user confirmed the production Portal origin as `https://yshenghub.com.my`
from the production screenshot and current release context. It also matches
`BACKOFFICE_ORIGIN`, `PUBLIC_API_BASE_URL`, `BACKOFFICE_DOMAIN` and `API_DOMAIN`
in `infra/test-aspire-production-compose.ps1:43`. This is source/configuration-fixture
corroboration, not a read of production secrets or a live authenticated Portal check.
Paths are exact existing routes: `/dashboard`, `/leads`, `/hr-salary`.
Sales recipients open `/leads` and choose **Cars I'm Handling** to review their
assigned work. `/delivery` requires the Delivery role and is not a valid Sales
template destination. Delivery v2 variants approved with that older URL must stay
inactive until Meta approves the exact `/leads` button and activation is authorized.

All templates have no header or footer. Each has one static URL button, labeled
`Open Portal` for English and `Buka Portal` for Bahasa Malaysia. The URL contains
no variables, record identifiers, credentials, query string or fragment. Portal
sign-in and existing API permissions remain required. Buttons have no send-time
parameters. Body line breaks are literal static template text. Every runtime body
variable is a nonempty single line, at most 64 characters, without control characters,
braces or repeated spaces. No empty record slots or per-record paid templates.

Provider names are language-specific. Internal category keys in the following
mapping table remain stable across languages and are not Meta submission names.
The manifest validates the exact provider name for its logical language; an old
unsuffixed name or the other language's name uses v1 fallback.

| Internal category key | Recipient scope | Variables in order | Example values (`en_US`) |
| --- | --- | --- | --- |
| `ysheng_due_summary_v2` | BossAdmin, existing due-work window | As-of date; inclusive through date; all due items; overdue items; seller payment count; seller payment total; seller collection count; seller collection total; other item count | `24 Oct 2026`, `27 Oct 2026`, `14`, `11`, `12`, `RM600,000`, `1`, `RM1,234.50`, `1` |
| `ysheng_delivery_summary_v2` | Sales, own assigned deliveries | As-of date; inclusive through date; own due deliveries; overdue deliveries | `24 Oct 2026`, `27 Oct 2026`, `4`, `1` |
| `ysheng_leave_summary_v2` | BossAdmin or HrSalary, excluding own requests | As-of date; actionable pending request count; earliest start date | `24 Oct 2026`, `12`, `25 Oct 2026` |
| `ysheng_attendance_summary_v2` | BossAdmin | As-of date; known scheduled; scheduled checked-in; full-day leave; outstation; partial/unclear leave; scheduled without check-in; unscheduled check-ins | `24 Oct 2026`, `20`, `15`, `1`, `1`, `1`, `2`, `1` |

Dates use `dd MMM yyyy`, with `ms-MY` month names in Malay (`24 Okt 2026`).
Amounts group thousands, omit decimals for whole ringgit (`RM50,000`) and show two
decimal places when sen are present (`RM1,234.50`). Payment and collection totals
are separate gross amounts, never a misleading net amount. Zero is a real `0` or
`RM0`, never an empty variable. The total covers the entire eligible source set,
including items omitted by v1's seven-record preview. No v2 list is truncated.

Leave counts use the existing actionable-request rules, exclude own requests,
invalid dates and payroll-locked requests, and include all pending requests rather
than only the first five names. No names, reasons, leave types, medical details,
customer data, plates or full identifiers appear in v2. Attendance retains all
seven metrics and the incomplete-schedule caveat. No check-in does not prove absence.

## Existing pipeline and approval evidence

- `WhatsAppDueDigest` and `WhatsAppHrNotifications` load and project authoritative
  facts; the daily scheduler stages existing `staff_notice_v1` queue rows.
- `WhatsAppStaffNotifications.RefreshAsync` rebuilds current content before send.
  Its control-character rejection establishes the existing single-line contract.
- `WhatsAppDispatchOptions.Templates` is an operator-reviewed manifest bound from
  the `WhatsApp` configuration section. There is no provider template registry sync
  or approval-refresh endpoint. Do not mistake the configuration flag for a live
  check of Meta's current approval state.
- Outbox persistence already holds queue identity, draft body/reference, submitted
  body/template/language, provider ID, attempts and outcomes. No schema migration
  or additional persisted message is needed.
- The dispatcher serializes claims, checks binding/role/consent/expiry and current
  business facts, then selects v2 immediately before the same bounded provider
  request. The sender emits multiple text parameters into a single BODY component.
- History records the rendered submitted v2 body and selected template name. It
  keeps the v1 draft/reference/version so retries and configuration rollback rebuild
  from authoritative sources. Existing Settings readiness continues to require v1;
  it describes fallback readiness, not v2 approval. No UI or DTO changes are made.

Authoritative provider references checked on 24 October 2026:

- [Meta's template creation example](https://www.postman.com/meta/whatsapp-business-platform/request/mr3xwmr/create-template-w-location-header-text-body-text-footer-and-a-website-buttons)
  establishes template creation and website-button support.
- [Meta template components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)
  and [category guidelines](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines/)
  returned HTTP 429 during this investigation. Full current limits/category
  eligibility remain a submission-time verification item; this branch does not
  claim independent confirmation of every Meta limit or approval for staff digests.
- The connected provider tool contract supports positional BODY examples and a
  static URL button. It was inspected without invoking any provider action.

The implementation conservatively limits the rendered body to 1,024 characters
and forbids newlines/tabs in variable values. It does not attempt invisible-character
workarounds. Verify static line breaks and every example in Meta's template preview.

## Activation, fallback and rollback

Production follow-up: FOO-236 activates the eight provider-approved mappings in
the production override. See `docs/whatsapp/reminder-v2-activation.md` and its
dated approval record. The steps below describe the original code-only handoff;
the separate draft overlay is no longer needed by the production release.

1. Review the names, exact bodies below, proposed category, example values and
   confirmed Portal URLs. After separate authorization, submit through Meta.
2. Wait for `APPROVED` for each name/language. Save the provider template ID,
   reviewed category, exact body, language, button label/URL and approval evidence
   in the change record. Check these again immediately before activation.
3. Keep both existing production v1 mappings active. Add only approved v2 entries
   to `WhatsApp:Templates` using unused indices, separately from this PR. Each entry
   needs `Key` (internal category key), `Name` (exact language-specific provider name
   in the checklist below), `Language`, `Approved=true`,
   `ApprovalEvidence`, `BodyText` (exact static body) and `PortalUrl` (exact approved
   button destination). Request `ms` or `en_US` as in the pack. If Meta instead
   approves English as `en`, explicitly set `ProviderLanguage=en` on that approved
   `Language=en_US` mapping after verifying its evidence. No code guesses or retries
   a language. V1's existing `en` mapping is preserved. Duplicate entries fail closed
   for that v2 language and fall back to v1.
4. Current production Compose passes fixed template indices 0-3 only. The reviewed
   artifact `docs/whatsapp/reminder-v2.compose.yml` supplies slots 4-11, exact static
   bodies and approved Portal URLs. `reminder-v2.env.example` lists all activation
   flags/evidence/provider-language inputs, disabled by default. Add the artifact
   explicitly after the generated Aspire file and production override only in a
   separately authorized activation release. A host `.env` entry alone is not
   sufficient. The existing deployment workflow does not include this overlay;
   this PR does not edit active deployment wiring or defaults. Render with
   `docker compose -f <aspire-artifact> -f infra/docker-compose.aspire.production.yml -f docs/whatsapp/reminder-v2.compose.yml config`
   using reviewed configuration before any authorized rollout.
5. Missing, unapproved, duplicate, wrong-language or mismatched-body/button v2
   mappings select the existing v1 mapping before any provider call. Draft v2
   entries do not invalidate the existing customer manifest. There is no cross-language
   fallback. Keep v1 configured even after all v2 variants are active.
6. Keep existing business event versions, date keys and daily recipient scopes.
   Do not bump event versions, rebuild queue identities, delete/requeue accepted
   messages or send separate records during activation. Scheduler restart and
   activation use the same queue rows and cannot add a second successful daily send.
7. Provider rejection, explicit 429, ambiguous acceptance and delivery callbacks
   retain existing outcomes. Never send v1 automatically after a v2 HTTP response;
   only the existing bounded explicit-429 retry can submit another attempt.
8. Rollback removes/disables v2 manifest entries, retaining v1. Queued work and
   eligible explicit-429 retries rebuild v1 facts; accepted/unknown submissions
   remain terminal under existing rules. No schema rollback is needed.

## Submission and activation checklist

Create eight separate templates with the exact names and language codes below.
All request category `UTILITY`, use the exact static body/examples in the JSON
pack, no header/footer and one static URL button. English button text is `Open
Portal`; Malay button text is `Buka Portal`. English `en` is permitted only when
that is the actual approved provider code; the internal language stays `en_US`.

| Exact Meta name | Requested language | Static button URL |
| --- | --- | --- |
| `ysheng_due_summary_v2_en` | `en_US` | `https://yshenghub.com.my/dashboard` |
| `ysheng_due_summary_v2_ms` | `ms` | `https://yshenghub.com.my/dashboard` |
| `ysheng_delivery_summary_v2_en` | `en_US` | `https://yshenghub.com.my/leads` |
| `ysheng_delivery_summary_v2_ms` | `ms` | `https://yshenghub.com.my/leads` |
| `ysheng_leave_summary_v2_en` | `en_US` | `https://yshenghub.com.my/hr-salary` |
| `ysheng_leave_summary_v2_ms` | `ms` | `https://yshenghub.com.my/hr-salary` |
| `ysheng_attendance_summary_v2_en` | `en_US` | `https://yshenghub.com.my/hr-salary` |
| `ysheng_attendance_summary_v2_ms` | `ms` | `https://yshenghub.com.my/hr-salary` |

- Reconfirm the approved HTTPS Portal origin is `https://yshenghub.com.my`.
- Confirm staff reminder eligibility under the current Meta category rules; the
  requested category is `UTILITY`, not an approval claim.
- Submit the eight names above separately; verify actual approved provider codes
  and explicitly configure `en` only if Meta approved that English variant.
  Include examples for every variable, no header/footer and one static button.
- Confirm real line breaks in the body, nonempty one-line values, zero values,
  date localization, full-set counts and separate payment/collection totals.
- Confirm no names, reasons, medical details, customer data, identifiers or tokens
  in body/examples/button URL. Use synthetic examples only.
- Preview on WhatsApp at phone width before approval; long totals remain readable.
- Review the exact provider result and store evidence before enabling a mapping.
- Prepare and review configuration wiring, maintain v1 mappings, and verify the
  fallback and exact selected language in a synthetic transport first.
- Obtain separate permission for any real consented-recipient pilot and production
  activation. Prove provider acceptance/delivery separately from a local sender test.

## Verification

Critical coverage extends existing sender/outbox suites to protect monetary totals,
full-set counts, single-line provider contracts, HR/Sales privacy, exact approval
selection/fallback and daily idempotency across configuration changes and restarts.
No new UI means no responsive UI acceptance run is needed.

Local checks on 24 October 2026:

- Full API suite: 801 passed; one PostgreSQL integration test skipped because
  `WHATSAPP_TEST_POSTGRES` was not configured. Synthetic SQLite outbox/dispatcher
  and HTTP sender coverage passed. This does not claim PostgreSQL runtime proof.
- API Release build passed. Existing `System.Security.Cryptography.Pkcs` NuGet
  vulnerability warnings remain outside this change.
- Back-office tests: 499 passed. Production build passed with the existing
  large-chunk warning. No frontend source or contracts changed.
- Compose artifact rendered against a synthetic API-only base: all eight exact
  bodies and URLs matched the pack, flags were off, evidence empty and existing
  slots untouched. No containers started and no application database was touched.
- JSON examples were rendered and checked for matching variables, nonempty
  single-line values and the conservative 1,024-character limit.
- `git diff --check` passed. Independent read-only CLI review identified the
  activation configuration path, explicit English alias and exact Portal-origin
  validation. These were addressed. The wrong-origin regression failed before
  the fix and passed after it; all 18 focused v2 cases pass, including unsuffixed
  and wrong-language provider-name fallback. The final focused
  re-review confirmed the exact destination check and fallback coverage with no
  remaining actionable findings. A further focused review of the language-specific
  names found no actionable defects in provider names, stable internal keys,
  explicit English alias, sender payloads or fallback/deduplication.
  No model reviewer ran mutations or tests.

No live provider send or current Meta approval is asserted by these tests.

## Exact static bodies

The following bodies are copied from the code contract and match the JSON pack.

### ysheng_due_summary_v2_en (en_US)

```text
YS Heng due work | {{1}}
Due through: {{2}}
Total items: {{3}} | Overdue: {{4}}
Pay seller: {{5}} payments | {{6}}
Collect from seller: {{7}} payments | {{8}}
Other due work: {{9}} items
Review all items in Portal before taking action.
```

Button: `https://yshenghub.com.my/dashboard`

### ysheng_due_summary_v2_ms (ms)

```text
Urusan perlu tindakan YS Heng | {{1}}
Tarikh akhir hingga: {{2}}
Jumlah urusan: {{3}} | Lewat: {{4}}
Bayar penjual: {{5}} bayaran | {{6}}
Kutip daripada penjual: {{7}} bayaran | {{8}}
Urusan lain: {{9}} urusan
Semak semua urusan di Portal sebelum mengambil tindakan.
```

Button: `https://yshenghub.com.my/dashboard`

### ysheng_delivery_summary_v2_en (en_US)

```text
YS Heng assigned deliveries | {{1}}
Due through: {{2}}
Your due deliveries: {{3}}
Overdue: {{4}}
Review preparation and handover steps in Portal.
```

Button: `https://yshenghub.com.my/leads`

### ysheng_delivery_summary_v2_ms (ms)

```text
Penghantaran tugasan YS Heng | {{1}}
Tarikh akhir hingga: {{2}}
Penghantaran anda: {{3}}
Lewat: {{4}}
Semak persediaan dan langkah serahan di Portal.
```

Button: `https://yshenghub.com.my/leads`

### ysheng_leave_summary_v2_en (en_US)

```text
YS Heng leave approvals | {{1}}
Pending requests you can review: {{2}}
Earliest leave starts: {{3}}
Open Portal to review all requests and decide.
```

Button: `https://yshenghub.com.my/hr-salary`

### ysheng_leave_summary_v2_ms (ms)

```text
Kelulusan cuti YS Heng | {{1}}
Permohonan menunggu semakan anda: {{2}}
Cuti terawal bermula: {{3}}
Buka Portal untuk menyemak semua permohonan dan membuat keputusan.
```

Button: `https://yshenghub.com.my/hr-salary`

### ysheng_attendance_summary_v2_en (en_US)

```text
YS Heng attendance | {{1}}
Known scheduled: {{2}}
Checked in (scheduled): {{3}}
Full-day leave: {{4}}
Outstation: {{5}}
Partial/unclear leave: {{6}}
Scheduled without check-in: {{7}}
Unscheduled check-ins: {{8}}
Schedule coverage unverified. No check-in is not an absence decision. Review in Portal.
```

Button: `https://yshenghub.com.my/hr-salary`

### ysheng_attendance_summary_v2_ms (ms)

```text
Kehadiran YS Heng | {{1}}
Jadual diketahui: {{2}}
Daftar masuk (berjadual): {{3}}
Cuti penuh: {{4}}
Luar kawasan: {{5}}
Cuti separa/tidak jelas: {{6}}
Berjadual belum daftar masuk: {{7}}
Daftar masuk tanpa jadual: {{8}}
Liputan jadual tidak disahkan. Belum daftar masuk bukan keputusan ponteng. Semak di Portal.
```

Button: `https://yshenghub.com.my/hr-salary`
