# FOO-222: Staff WhatsApp delivery and onboarding visibility

## Evidence and scope

Read-only production inspection on 23 October 2026 at 23:24-23:27 MYT confirmed
that the monthly reserved dispatch budget was exhausted: RM30 reserved against
the RM30 limit, with RM1 required for another attempt. The background dispatcher
was running. The due reminders had matching bindings, roles, a configured approved
template mapping and nonempty drafts, but remained Queued without a displayed
reason. Reserved budget is not a provider invoice; live Meta approval was not tested.

Keep the existing automatic scheduler, dispatcher, budget reservations, consent,
verification, role checks, idempotency and expiry rules. Do not increase limits,
change production configuration or submit a real message during this task.

## Implementation

- Compute actionable waiting reasons in the existing BossAdmin message-history
  API using current configuration and batched reads. Share the existing budget
  condition with dispatch; do not persist a guessed error or alter queue states.
- Show waiting reasons in desktop history, mobile cards and message details.
- Add a BossAdmin-only batch connection-summary endpoint and show its safe
  states in the existing Staff Users table and mobile cards. Return only staff
  ID, state, masked number and verified time; keep My WhatsApp enrollment intact.

## Acceptance and verification

- Real background services schedule and submit each of the three due daily
  reminder categories once to a synthetic provider without an admin page.
- Existing restart, retry, expiry, stale-fact, role and consent guards remain.
- Exhausted budgets and unavailable templates produce visible waiting reasons
  without consuming attempts or bypassing the block.
- Missing or failed status reads never imply that a staff member is connected.
- Run focused API and back-office tests, the back-office production build, local
  populated responsive checks, and an independent read-only diff review.

No schema change, budget-admin feature, commit or production release is included.

## Local verification results

- Full API suite: 776 passed, none skipped. `WHATSAPP_TEST_POSTGRES` pointed to a
  disposable PostgreSQL 17 cluster on `127.0.0.1:55432`, database `whatsapp_ci`.
  No existing application database was used. The focused PostgreSQL test also passed.
- The real `Program.cs` startup test verified anonymous 401, Sales 403 and masked,
  no-store BossAdmin connection summaries. After setup, all three daily categories
  reached the synthetic transport through registered hosted services without any
  admin HTTP requests. Ordinary submissions and restart deduplication are covered;
  this is not a network-level exactly-once guarantee.
- The history-query regression failed before batching (11 versus 57 SELECTs), then
  passed with the same query count across more recipients and pending requests.
  Payroll-locked leave is excluded before budget advice. Existing legacy-generated
  payroll boundary coverage also passed.
- Back-office tests: 498 passed. `npm --workspace apps/backoffice run build` passed.
- Populated browser checks: six widths passed (360, 767, 768, 1024, 1025, 1440),
  with `RESPONSIVE_TABS=1`. The test used the current worktree's isolated Vite
  server on port 4181. No overflow, unknown API requests or unexpected console
  errors were reported. Screenshots cover masked staff states, budget holds,
  in-progress submission and expired reminders under a neutral status heading.
- Independent read-only review found no remaining actionable backend findings.
  `git diff --check` passed. Existing dependency vulnerability and bundle-size
  warnings were not changed by this task.

The production budget remains unchanged. No real provider message, deployment,
commit, staging, push, pull request or merge was performed. FOO-221 is excluded.

## Coordinated release integration, 24 October 2026

The user subsequently authorized release of FOO-221, FOO-222 and FOO-223 together,
with one deployment and a monthly reserved-cost ceiling of RM300. The release
integrates history and dispatch against the same persisted effective limits.
History immediately reflects an admin limit change without spending another
attempt; business eligibility still takes precedence over budget advice.
Existing usage, the daily attempt cap and per-attempt reservation are retained.
Anonymous and Sales access to the budget read/update endpoints is rejected in the
real application startup test. Release, CI and production evidence is recorded in
the linked Linear issues and pull requests; the earlier results above describe
the original local-only implementation.
