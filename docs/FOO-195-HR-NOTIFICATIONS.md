# FOO-195 HR WhatsApp adapter and activation boundary

`WhatsAppHrNotifications` uses the FOO-189 staff outbox. FOO-200 connects its
scheduler and dispatcher validation. HR policies and sending default off.

- `LeaveApproval` runs from the enabled daily policy at 09:00
  Asia/Singapore. The current leave-decision endpoint allows `BossAdmin` or
  `HrSalary`, rejects self-approval, and blocks payroll-locked ranges. The
  projection follows those rules, shows only other staff's still-pending,
  actionable requests, and omits leave type, reason, medical certificate,
  decision notes, and documents. A resolved/cancelled request disappears when
  `RefreshForDispatchAsync` re-reads current facts. No pending items means no
  message.
- `AttendanceSummary` runs from its enabled daily policy at 10:00
  Asia/Singapore for `BossAdmin` only. It counts the explicitly scheduled,
  active-account cohort with mutually exclusive precedence: checked in,
  full-day approved leave, fractional/unclear leave, approved outstation,
  then scheduled without check-in. Unscheduled active check-ins are a separate
  known count. A multi-day fractional leave has no trustworthy partial-day
  timing, so it is not called full-day leave. Account activity is not an
  employment-status source; roster completeness and non-working days remain
  unverified. The body explicitly says the schedule coverage is unverified
  and a missing check-in is not an absence or misconduct decision. It includes
  no raw IP, location, leave reason, or attachment.
- Both bodies support English and Bahasa Malaysia. The user/category/local-day
  idempotency key survives a phone rebind and concurrent scheduler instances;
  the database unique index is the arbiter. Recovery stages only the current
  local day. Policies default disabled in FOO-189. Sending also stays globally
  disabled until explicit approval.

FOO-200 integrates both categories: the server-owned `LeaveApproval` role map
includes `HrSalary`, the recovery worker schedules both daily messages, and
`RefreshForDispatchAsync` runs under the binding/role lock. Refreshed content
replaces the template parameter before snapshot/send. Sender readiness and
explicit category enablement remain required.
Also confirm shift/weekend/partial-day precedence with the business owner
before claiming an expected-headcount or absence feature. PostgreSQL
concurrent staging and provider delivery are not locally proven.
