# FOO-197 commission deadline

BrokerCommission now accepts an optional `dueDate` (`YYYY-MM-DD` or null).
The existing Finance-authorized create/update endpoints and audit trail remain
unchanged. The additive PostgreSQL column is nullable, with no data backfill.
Legacy records retain their amounts, paid status, CP58 flags and absent date.
Malformed JSON dates remain HTTP 400; the sentinel date 0001-01-01 is rejected
by commission validation. A past date is valid and represents overdue work.

Finance's existing create/edit forms use the shared calendar input pattern.
Unpaid undated records show `Date required` in desktop and mobile lists.
Clearing a date sends null. No date edit pays a commission or changes CP58.

The FOO-200 integration adds dated, unpaid commissions to the existing BossAdmin
OutstandingDigest at D-3 and refreshes paid/rescheduled state before submission.
Sales never receives commission details. Missing dates appear as an admin
diagnostic count, not an invented deadline. The isolated FOO-197 branch contains
the additive field/UI prerequisite; digest integration is in FOO-200.

Local verification: focused commission validation 3 passed; portal production
build passed. Integrated SQLite coverage additionally checks null roundtrip,
D-3, paid suppression, rescheduling and Sales isolation. PostgreSQL additive
schema execution and production delivery have not been exercised.
