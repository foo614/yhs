# FOO-236: production reminder v2 activation

The user authorized all eight variants on 26 October 2026 after reviewing the two
Malay Marketing categories. The provider was read again for account
`4487526794726717` under YS HENG AUTO (`139240008257165`). All eight were APPROVED.
Exact IDs, categories, provider languages, bodies and buttons are recorded in
`reminder-v2-approval-2026-10-26.json`. This is dated approval evidence, not a live
registry or a guarantee against later pauses or recategorization.

## Production configuration

`infra/docker-compose.aspire.production.yml` now supplies slots 4-11 directly,
so the normal verified-main deployment activates v2 without another overlay or
secret rewrite. English logical language remains `en_US`, with verified provider
language `en`; Malay remains `ms`. Both delivery buttons are `/leads`. Due work
uses `/dashboard`; leave and attendance use `/hr-salary`.

The Due and Leave Malay templates remain Marketing. The other six are Utility.
Meta's actual classification governs charging and delivery restrictions; attempts
are not presented as billed messages. The user's switch authorization includes
these two Marketing mappings.

Production inspection found English v1 configured and Malay v1 unconfigured.
Daily queue rows retain the v1 key, so candidate selection now also admits a daily
row when its exact category, role and language have an approved v2 mapping. The
existing eligibility checks and final v2 selection still run before submission.
This does not enable Malay v1 or unrelated workflow/OCR notification categories.

Existing slots 0-3, sender gates, daily attempt cap, employee eligibility and
consent, business event identities and retry rules are unchanged. Only the API
receives the mappings; the general worker cannot send a duplicate reminder.
No queue rows are replayed or rebuilt. Accepted/unknown submissions stay terminal.

The earlier `reminder-v2.compose.yml` and `reminder-v2.env.example` are disabled
submission/review artifacts. Do not append the draft overlay or copy its false
defaults when activating this release. Existing explicit environment overrides
take precedence over the reviewed production defaults.

## Validation and rollback

The existing `infra/test-aspire-production-compose.ps1` renders the actual Aspire
artifact plus production override and checks all eight mappings against both the
application pack and the provider evidence, preserves v1, and verifies rollback.
Existing sender/outbox tests cover exact parameters, fallback, privacy, totals,
daily idempotency and no v1 retry after ambiguous v2 submission.

To roll back all v2 variants, set `WHATSAPP_V2_<CATEGORY>_<LANG>_APPROVED=false`
for DUE, DELIVERY, LEAVE and ATTENDANCE with EN and MS in the production environment
source used by the release workflow. Redeploy verified main so the API receives
the settings. Keep the configured English v1 enabled; Malay reverts to its prior
unsent behavior because no Malay v1 fallback was configured. Never delete or
requeue accepted messages. Removing
the override restores the reviewed defaults, so rollback requires explicit false.

Activation readiness, provider acceptance and actual delivery are separate checks.
Inspect the next naturally scheduled eligible reminder's submitted template and
callback outcome. Do not send duplicate test reminders to prove activation.
