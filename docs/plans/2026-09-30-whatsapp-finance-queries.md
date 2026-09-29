# WhatsApp finance query plan

FOO-41. Planning and implementation approved 30 September 2026. This document records the agreed implementation contract. Release status is tracked in the issue; this document alone does not activate finance queries.

## Outcome and scope

Let verified staff obtain concise, read-only finance answers through the existing WhatsApp connection. Use authoritative application records and deterministic calculations. Preserve current database role checks before retrieval and immediately before sending. Self-onboarding does not grant additional access.

Deliver three small slices in order. Keep supplier invoice queries, transaction-history exports, payment actions, accounting net profit and historical balance snapshots outside this first scope.

## Commands and access

| Phase | Proposed command | Access | Result |
| --- | --- | --- | --- |
| 1 | `collections ABC1234` | Finance, BossAdmin | Current receivable, reconciled collections, pending collections and outstanding amount |
| 2 | `settlement ABC1234` | Finance, BossAdmin | Seller settlement direction, recorded amount, deadline and marked completion status |
| 3 | `profit` / `profit month` / `profit today` | BossAdmin | Sold-vehicle margin on the existing dashboard basis |
| 3 | `profit 2026-08` | BossAdmin | Sales and margin for a complete past month |
| 3 | `profit 2026-08-01 2026-08-31` | BossAdmin | Sales and margin for an inclusive date range |
| 3 | `dashboard` with the same periods | BossAdmin | Period sales/margin, clearly separated from current outstanding balances |

Bare profit/dashboard defaults to month-to-date. Use Malaysia UTC+08 dates through BusinessClock and echo the actual range. Reject invalid or reversed dates, future periods, and custom ranges longer than 366 days. A current named month resolves to month-to-date. Stock/help behaviour remains unchanged. Help should show only implemented commands available to the current role.

Plate queries are current snapshots; do not pretend a date filter reconstructs a historical receivable or settlement balance. Historical delivery commands remain a separate feature.

## Phase 1: collections

Use Finance V2 receivable/invoice authority and canonical-buyer validation. `FinanceV2Rules.CollectedAmount` counts Reconciled collections only; Pending is displayed separately and Reversed is excluded. Reuse the existing rounded balance rule, max(0, nett price minus reconciled collections).

Never add legacy and V2 amounts together. Receipts and cash handovers must not be counted again as separate money. A bank loan approval is not a collection. Reversal does not prove a cash refund; the inspected model has no standalone refund ledger.

Missing/mismatched invoice, conflicting authoritative records or buyer ambiguity returns guidance to review Finance in Back Office. For a legacy-only record, show its saved amount/status labelled as legacy; do not infer reconciled or outstanding amounts from its workflow status. Missing data is not zero.

Synthetic reply:

```text
ABC1234 — Customer collections
Receivable: RM 50,000.00
Reconciled: RM 45,000.00
Outstanding: RM 5,000.00
Pending collections: RM 2,000.00 (not deducted)
As at 30 Sep 2026, Malaysia time
```

## Phase 2: seller settlement

Call this seller settlement explicitly. SettlementReminder is previous-owner equity, not supplier invoices or buyer bank financing. Preserve PaySeller, CollectFromSeller and InternalOffset directions; internal offset does not imply a cash transfer.

Use saved settlement snapshots rather than recalculating from today's purchase price. Label IsPaid as marked completed, not independently reconciled payment evidence. A bank-debt snapshot does not prove the bank has been paid. Omit that snapshot from the default compact reply. Distinguish no settlement recorded, a zero internal offset, overdue outstanding and marked completed. Multiple records must not silently select the latest.

Synthetic reply:

```text
ABC1234 — Seller settlement
Direction: Pay seller
Recorded amount: RM 8,000.00
Deadline: 5 Oct 2026
Status: Outstanding
```

SupplierInvoice payables need a separately named command later. Current supplier read endpoints use the Repairs policy; adding Finance access would require a deliberate policy decision, not an implicit reuse of this settlement command.

## Phase 3: profit and dashboard

The current DashboardMetrics.RealisedProfit is all-time. Never return it for a monthly or dated request. Reuse period-filtered ActualProfit and TotalSales with SoldAt boundaries, but label the output **Sold-vehicle margin (dashboard basis)**, not accounting net profit or cash profit.

Current formula: selling price plus additional charges minus effective purchase cost, repairs, commission and pickup allowance. Recorded cost changes can change a historical margin. State that limitation; do not invent net income by subtracting supplier invoices or daily spending again.

For dashboard replies, separate the selected-period sales/margin section from a Current balances section. No claim of past-period stock, receivable or settlement balances without an actual historical snapshot model.

Synthetic reply:

```text
Sold-vehicle margin — 1–30 Sep 2026 (Malaysia)
Vehicles sold: 4
Margin: RM 18,500.00
Based on recorded prices and costs; not cash profit.
Historical margins can change when recorded costs change.
```

## Implementation and evidence

- Add a small WhatsAppStaffFinanceQueries adapter and period parser; wire WhatsAppStaffQueries and role-aware help. Reuse existing finance calculation functions instead of duplicating arithmetic.
- Return allowlisted summaries only: no customer identity, NRIC, bank account/reference, notes, private record IDs, document links or exports. Exact normalized plate lookup; stop on ambiguous vehicles or finance records.
- Keep verification, revocation, current account/security stamp/role checks, quotas, deduplication and no-retry handling. Database errors return temporarily unavailable, never a zero balance.
- No migrations, new dependencies, public endpoints, financial writes or customer notification enablement are required.
- Authoritative sources: Features/FinanceV2.cs (canonical buyer, collected amount, balance); Features/BusinessRules.cs (settlement snapshots, financial clearance authority, profit/dashboard date rules); Domain/Models.cs (receivables, invoices, settlements, collections); Program.cs (existing Finance, Repairs and Dashboard policies).
- Extend existing WhatsAppStaffAssistantTests, FinanceV2RulesTests, BusinessRulesTests and WhatsAppPostgresTests. Cover non-finance denial, role downgrade before send, pending/reconciled/reversed collections, void receipts, legacy/V2 precedence, canonical buyer mismatch, settlement directions, ambiguity/no-data/zero, Malaysia date boundaries, SoldAt missing, period versus all-time margin, bilingual output and private-field exclusion.
- Validate each slice through synthetic adapter/queue tests and real PostgreSQL joins, then the backend suite and independent finance/security review. Follow required CI/CodeQL and release gates before live financial-query testing.

## Recommended decisions

Proceed with phases 1 and 2 first. Accept the existing dashboard-basis margin with honest wording for phase 3; defer true accounting/realised cash profit until its accounting contract exists. Keep first-phase collections current and plate-based. Date-filtered transaction lists need a separate decision about received date versus reconciliation date.

Completion requires correct values against the Finance workboard for synthetic cases, existing role scope preserved, and an authorized bound test account receiving a real reply. A compiled command alone is not completion.
