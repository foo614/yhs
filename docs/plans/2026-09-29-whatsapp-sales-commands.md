# FOO-41: WhatsApp commands for used-car sales

## Outcome and scope

Approved after the command review: make read-only WhatsApp answers useful when staff find a car, respond to a buyer, check loan progress and arrange handover. Keep English commands and English/Bahasa Malaysia replies, existing verified staff identity checks, quotas, finance restrictions and full-record/mutation permissions.

1. Improve help and provide bounded, rate-limited recovery for verified staff who mistype a command. Never store or echo unrecognised message text.
2. Match stock search words across make/model/plate; support an inclusive upper asking-price filter and explicit stateless pages. Return prices, counts and continuation commands. Unknown prices must not appear as bargains.
3. Add asking price and location to internal vehicle summaries. Add `share <plate>` containing only approved public available vehicle information and an optional validated public listing URL. This returns text to the staff member; it does not send to a customer.
4. Paginate upcoming handovers and support tomorrow. Add loan next actions and delivery preparation blockers using existing rules. Never call a car cleared for release based only on preparation or scheduled date.

Personal follow-up reminders are deferred until staff ownership and due-date rules are agreed. Finance adapters, natural-language AI, automatic customer sending and production activation are outside this change.

## Files and contracts

Changes belong in the staff query/parser, small formatting helpers, webhook recovery path, queue, existing assistant/business-rule tests and API documentation. No migration, new dependency, public API expansion or role-policy change. Optional `WhatsAppAssistant:PublicSiteUrl` enables share links; absent or invalid configuration must not produce guessed links.

## Privacy and correctness

- All new commands remain behind current staff binding and account/role revalidation before dispatch.
- Recovery stores only a fixed intent and allowlisted command name, uses the existing daily limits and at most one recovery per employee per minute.
- Share uses the public availability gate and excludes internal location/status, customer identity, costs and financial data.
- Loan selection uses the confirmed buyer, never an arbitrary newest historical application. Ambiguity remains explicit. Missing document categories are summaries, not document access.
- Delivery output distinguishes preparation checks from final release authorization. It omits finance clearance, customer information, free-text reasons and document references. Existing rules determine document ownership and expiry checks.

## Acceptance and validation

Use existing backend suites with synthetic SQLite records and fake transport. Cover mixed-word and budget searches, price-not-set handling, stable multi-page results, public sharing exclusions/URL validation, current-buyer loan selection, ambiguous records, stale preparation/expiry, no private output fields, verified-only recovery and throttling, both languages and retained stop/role-revocation behavior. Run focused checks followed by the backend suite and an independent review. Record deployment separately; local tests are not phone or production proof.

## Implementation result

Implemented items 1-4 above on `codex/foo-41-sales-commands`. The complete backend run on 2026-09-29 passed 642 tests with zero failures; one existing PostgreSQL integration test was skipped because the isolated `WHATSAPP_TEST_POSTGRES` service was not configured. The API compiled and `git diff --check` passed. Independent correctness/security review found no blocking findings. No production configuration, enable switch, role policy, migration or customer-notification behavior was changed. These are implementation-stage results. Merge and deployment evidence is recorded in the linked pull request and release workflow; a live phone test is separate.
