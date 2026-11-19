# FOO-274: Official Johor public holidays

## Outcome

Persist the verified Johor (JHR) public-holiday calendar, including official
Sunday replacement days and later BossAdmin supplemental notices, then use the
same records in the Dashboard operations calendar and new HR leave-day
calculation. Existing approved leave records remain unchanged.

## Sources and data rules

- Seed only dates verified against the Johor government 2026 list:
  https://www.johor.gov.my/rakyat/cuti-umum-2
- Store a source title, URL, notes, year, and whether a row is a replacement.
- BossAdmin may add or edit a row for an additional official notice, including
  notices published by the Cabinet/JPM source:
  https://www.kabinet.gov.my/hari-kelepasan-am/
- Do not invent future holiday dates. A source URL is required for every row.

## Implementation slices

1. Add an additive, idempotent `HrPublicHolidays` schema and seed the verified
   2026 Johor rows plus official Sunday replacement rows.
2. Add authenticated read access and BossAdmin-only create/update endpoints with
   validation and audit records.
3. Add the records to the shared operations calendar and expose an HR manager
   view/editor with source links.
4. Calculate only new leave requests from the worker's persisted dated
   schedules, excluding public holidays. If no schedule rows exist in the
   requested range, retain the existing weekday fallback. Never recalculate
   historical approved requests.
5. On the existing worker switch, run a persisted importer for verified 2026
   only: fetch the official Johor page at startup/Jan 1, retry failures daily,
   and recheck successful imports weekly. Parse only a complete, named table
   whose title and every date match the requested year. A failed, empty,
   partial, stale, or wrong-year response changes only import status and never
   changes holiday rows. 2027 and later imports remain deferred until their
   official notices are reviewed.
6. Importer-managed rows are idempotently updated; rows edited by BossAdmin
   are detected from audit ownership and preserved. If the official notice
   moves or removes an importer-managed row, the importer records a Conflict
   status and changes no holiday rows for that run; this avoids silently
   accumulating stale leave exclusions. A database advisory lock and persisted
   attempt token prevent duplicate concurrent imports and allow a restarted
   worker to resume safely.

## Boundary

This does not implement a new rota generator, payroll/payslip rules, or social
media APIs. Sunday rotation and replacement rest-day behavior use existing
persisted work schedules; future rota generation remains unsupported until a
separate scheduling decision is approved.

## Acceptance checks

- A repeat schema startup is safe and preserves existing leave data.
- Holiday validation rejects non-Johor rows, year/date mismatches, and missing
  source metadata; unauthorized writes are rejected.
- New leave calculation handles personal scheduled days, half-days, and
  holidays while leaving stored historical values untouched.
- Dashboard and HR views show the same persisted holiday rows.
- BossAdmin can inspect the last import status, retry timing, source, and last
  error without triggering an external notification.
- API tests, backoffice tests, and the backoffice production build pass.
