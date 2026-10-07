# FOO-193 staff due digest integration contract

`WhatsAppDueDigest` is a callable projection and scheduler adapter built on the
FOO-189 staff outbox. FOO-200 connects it to the recovery worker and final
dispatch refresh. Sending still requires explicit policy and sender readiness.

- The enabled `OutstandingDigest` policy controls the local Asia/Singapore
  minute (default 09:00) and lead window (default three days). The scheduler
  calls `EnqueueForVerifiedBindingsAsync` after that minute, retrying on later
  ticks for the current local day only. The daily outbox key is durable across
  restarts and concurrent scheduler instances. Empty digests are not staged.
- Only authoritative dates participate: settlement deadline, daily expense due
  date, bank follow-up date when supplied, debt follow-up date, commission due
  date when supplied, and confirmed delivery scheduled date. The window includes D−3 through overdue. Internal
  settlement offsets, paid/reconciled/closed items, inspection bookings,
  released/cancelled deliveries, supplier invoices, and undated commissions are
  excluded. A missing optional bank follow-up is not an error.
- A BossAdmin projection includes the finance, debt, and delivery rows. A
  Sales projection includes only delivery rows for the vehicle's canonical
  `SalesAgentUserId`; neither delivery PIC nor a lead fallback is an
  authorization source. The verified binding language selects English or
  Bahasa Malaysia wording. The body is a bounded Meta template parameter;
  overflow directs eligible staff to the role-scoped `due page 1` command,
  including overdue items. The command uses current source records and the
  same canonical Sales assignment rules.
- `RefreshForDispatchAsync` must run under the FOO-189 binding/role lock
  immediately before submission. The dispatcher replaces the queued template
  parameter with its returned body and snapshots that exact submitted text,
  template name and language. A null refresh suppresses the row. This allows
  one settled or rescheduled item to disappear without dropping other still
  actionable rows. No replay after the local day expires.
- `DiagnosticsAsync` returns `MissingRequiredDate`, `MissingCommissionDate` and
  `UnassignedDelivery` counts for the BossAdmin settings
  display. It never guesses a date or recipient and does not reveal financial
  details. The integrated staff diagnostics API exposes these counts.

The integration preserves staff readiness gates and customer/staff outbox
isolation. Exact verification and production evidence belong in the FOO-200
release record; local tests do not establish real-provider delivery.
