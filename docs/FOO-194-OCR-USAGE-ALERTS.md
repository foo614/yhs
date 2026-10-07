# FOO-194 OCR usage warning integration contract

`WhatsAppOcrUsageAlerts` is a callable, BossAdmin-only staging and current-facts
adapter built on the FOO-189 staff outbox. FOO-200 connects its quota hooks,
recovery scheduler and dispatch validation. Sending remains opt-in.

- The required warning is workspace OCR reservations in the current UTC month
  divided by a positive configured monthly limit. The optional extension is
  each staff member's OCR reservations in the current UTC day divided by the
  positive per-staff daily limit; these details still go only to BossAdmin.
  Failed and in-flight reservations remain counted because
  `AiUsageQuotaService` counts committed `AiUsageRecord` rows, not successes.
  No warning is generated for a disabled OCR service, disabled `OcrUsage`
  policy, zero limit, or usage below the policy threshold (default 90%).
- `EvaluateAsync` is both the immediate and recovery evaluator. Call it after
  `ReserveOcrAsync` has committed an allowed reservation, after an Admin OCR
  limit update has committed, and periodically for missed warnings. The caller
  must catch/log notification errors so OCR and settings writes never fail
  because WhatsApp is unavailable. A positive lowered limit is re-evaluated.
  Do not call it inside the quota reservation transaction.
- The outbox key is unique per OCR service/scope/UTC period/BossAdmin user.
  It excludes mutable threshold, limit, phone, and binding ID, so changing
  those values or reconnecting cannot generate another warning in that period.
  The database unique index arbitrates concurrent evaluators. Different
  BossAdmins each receive one row. Sending may remain globally disabled while
  staging a truthful `Queued` row.
- The body gives used/limit/percentage and the UTC reset instant rendered in
  Asia/Singapore time with `SGT`. `RefreshForDispatchAsync` must run under the
  FOO-189 binding/role lock immediately before provider submission. It returns
  null when the limit, threshold, policy, or period no longer supports the
  warning. Otherwise the dispatcher replaces `TemplateReference` and `Body`
  with the refreshed body before recording the exact submitted snapshot.
- FOO-200 connects both post-commit hooks, recovery scans and current-facts
  refresh for `OcrUsage`; its category is integrated. Policy and sender
  readiness remain independent gates. Preserve the customer/staff audience boundary. No artificial
  production OCR usage should be inserted to demonstrate this feature.

Local synthetic SQLite tests prove threshold boundaries, BossAdmin isolation,
rebind/limit-edit deduplication, UTC period reset, disabled-limit recovery, and
stale queued suppression. PostgreSQL concurrent-insert and real-provider
delivery remain unverified locally.
