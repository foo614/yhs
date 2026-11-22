# FOO-260: Inspection AutoCount export

## Approved scope

Add a read-only, BossAdmin-only Excel review export for inspection bookings
for either YSHeng Auto or YSHeng Automotive. The user selects one company;
the workbook contains only that company's non-cancelled inspection records,
with one vehicle per native AutoCount Purchase Invoice sheet. This does not
add AutoCount import, posting, WhatsApp, or other inspection workflow changes.

## Approved mapping

| Company | Creditor | Item | Account | UOM |
| --- | --- | --- | --- | --- |
| YSHeng Automotive | `4T00-P004` / PUSPAKOM SDN BHD | `INSPECTION (PUSPAKOM)` | `6I00-0000` | `UNIT` |
| YSHeng Auto | `4001-P002` / PUSPAKOM SDN BHD | `INSPECTION (PUSPAKOM)` | `6020-O01` | `JOB` |

The 21 November clarification replaces booking company selection with an
independent Special inspection checkbox: checked routes to Auto, unchecked to
Automotive. The 22 November clarification requires a supported type only for
checked Special inspection; unchecked bookings store no type. Account codes above retain the literal
letters I and O supplied in that clarification. Historical company assignments
remain unchanged. Auto header descriptions use the selected type in title case,
with `9011 - Pertukaran Hak`. INTERNAL SYSTEM 5 slide 21 (Automotive) has no
header Description field, unlike slide 22 (Auto); Automotive's native header
description value stays blank, and the plate description belongs only on its detail line.
The letters I and O in the account codes were explicitly reconfirmed on 22 November.

The inspection type code, when present, is retained in the review listing (`9001`, `9002`,
`9003`, `9004`, `9011`); regular bookings have blank type code/name cells. Auto's
native header Description uses `<type code> - <type name>`; Automotive's header
description stays blank, even on historical typed records. Each native PI has
one quantity-1 line described as `INSPECTION FEE - <plate>` and priced from
that vehicle's `AllocatedAmount`.
The original `SourceReceiptNumber` is retained, including when reused across
vehicles. The manually entered `SupplierInvoiceReference` is retained exactly,
including confirmed `(1)`, `(2)` or `(3)` values; the export never generates a
suffix or an AutoCount invoice number. The native document number remains
`<<New>>`, and the matching supplier invoice and D/O numbers are copied
separately from the guide.

## Implementation and acceptance

- Reuse the existing native AutoCount clipboard worksheet writer with a small
  partial extension; keep the existing invoice duplicate-check logic unchanged.
- Filter by the selected company server-side and enforce `BossAdmin`; do not
  mutate inspections or source receipts. Invalid rows remain visible as
  `BlockedForPaste` and do not receive an empty PI sheet.
- Add focused tests for exact mappings, company isolation, receipt/invoice
  references and allocated amounts, deterministic repeated output, and blocked
  invalid rows.
- Add the Inspection page company selector and download action, visible only to
  BossAdmin, plus the API contract and this plan.

