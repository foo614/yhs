# FOO-184: AutoCount review export corrections

## Outcome and authority

The user approved planning and implementation after reviewing SALES INVOICE.mp4,
CAR PURCHASE.mp4 and INVOICE CAR REPAIR.mp4 on 2026-09-27.
The videos show manual AutoCount Accounting 2.2 entry. They establish visible
business mappings, not an Excel import-wizard contract.

The sales video at 3:30 shows vehicle account `5S00-0000` (letter S),
insurance `4001-I001`, road tax `4001-R001`, classifications `025` and
`006`, and quantity 1. The purchase video shows plate-based stock items,
`6P00-0000`, UOM UNIT and quantity 1. The repair video at 0:55 shows
`REFURBISHMENT`, `6R00-0000`, supplier invoice and delivery-order references,
invoice date, plate, UOM, quantity and unit price.

Earlier AR Invoice.xlsx and AP Invoice.xlsx files contain header rows only.
FOO-36 stays open for approved line/range mappings, tax codes and a successful
AutoCount test import. This change must not claim direct-import compatibility.

## Implementation

1. Correct the vehicle sales account and document the video mapping version.
2. Append fields to existing sheets, preserving their order and original columns.
   Include sales invoice snapshots, creditor references, item codes, quantity,
   UOM, unit price, discount and explicit invoice-total reconciliation.
3. Append purchase headers, stock-item review and confirmed repair-receipt review
   sheets. Fields not persisted, including debtor/owner creditor codes and
   structured tax-entity address details, remain blank for Finance review.
4. Load existing repair receipts/items in the protected export endpoint.
   Associate a receipt and supplier invoice only when vehicle, normalized supplier
   name and invoice reference identify exactly one invoice and one receipt.
   No match based on price, plate alone or fuzzy names is permitted.
5. Put supplier repair invoices in Purchases with REFURBISHMENT mapping. Exclude
   uniquely linked operational repair costs from Expenses only when the sum of
   linked supplier invoices equals the repair cost. Keep unmatched or partially
   invoiced costs explicitly marked review-only, with their difference. Use invoice dates
   for invoices and repair start/creation dates for unmatched operational review.
6. Explain review-only status in the export UI and workbook. Do not infer tax
   codes, approve transactions, post externally or modify persistence.

## Files and risks

- API: AutoCountExport.cs and the export endpoint in Program.cs.
- Tests: extend AutoCountExportTests.cs for mappings, values, XML cell types,
  linkage ambiguity, invoice periods, receipts and totals.
- UI: FinancePage.tsx export guidance only.
- Docs: API.md, IMPLEMENTATION.md and this plan.

Finance source data is private. Existing Finance/Admin access and export auditing
remain intact. Fixture data is synthetic. Unknown mappings and inconsistent
totals must remain visible, with no fabricated balancing entry.

## Verification

Run regression tests before implementation to demonstrate the failures, then
repeat focused export and purchase-invoice tests. Run the full backend suite and
back-office type check for the copy change. Review a generated fixture workbook
for sheet order, equal row widths, identifiers/classifications stored as text,
numeric amounts/quantities, and reconciliation. A separate read-only reviewer
checks correctness and financial-data boundaries.

Local implementation and verification are the FOO-184 deliverable. Commits,
pushes, pull requests and production deployment require the user's requested
publication scope. Direct AutoCount import validation remains in FOO-36.

## Review corrections

The separate reviewer identified partial-invoice cost loss and mutable supplier
contact facts. The export now preserves a review-only repair row when linked
invoice totals differ from its cost, and labels current supplier master fields
separately from historical invoice facts. Receipt matching follows the existing
whitespace/case normalization while still rejecting ambiguous associations.

## Verification results

- Before implementation, the focused suite reproduced five export failures.
- Full backend suite: 563 passed, 1 skipped (564 total).
- Back-office type check: passed. Existing FinancePage tests: 29 passed.
- A saved synthetic workbook passed openpyxl checks for 15 worksheets,
  numeric quantities/prices, exact text codes, zero reconciliation differences
  and no duplicate fully represented repair expense.
- Separate follow-up review confirmed all three findings resolved with no
  remaining blocker. `git diff --check` passed.

These results verify the local review export. No AutoCount import was run.
Changes remain uncommitted on `codex/foo-184-autocount-export` and have not
been merged or deployed.

## Follow-up import verification

Read-only inspection of the supplied files confirmed one nonempty header row
per file, no detail rows, no Excel tables and no defined ranges:

| File | Header columns | Data rows |
| --- | --- | --- |
| AR Invoice.xlsx | 17 | 0 |
| AP Invoice.xlsx | 19 | 0 |
| GL CashBook.xlsx | 16 | 0 |
| GL Journal Entry.xlsx | 15 | 0 |

The saved synthetic review export uses different header names and separates
invoice headers from lines. It is not a file matching these four layouts.
For example, the supplied AR header uses `Doc No`, `Doc Date` and `Total Amount`,
whereas SalesInvoices uses `InvoiceNumber`, `InvoiceDate` and `Amount`.
Debtor/owner creditor codes and approved tax mappings still need Finance input.
Currency-rate and document-number policies also need the target import rules.

Auto Count's [2009 Import from Excel Specification](https://presoft.com.my/wp-content/uploads/2022/04/AutoCount%20Accounting%20Import%20from%20Excel%20Specification.pdf),
pages 11 and 18, describes both master and detail fields, including account and
tax fields, as well as document-number behavior on re-import. It is historical
context, not approval of an Accounting 2.2 contract. The supplied header-only
files cannot establish these line rules or verify repeat-import behavior.

No AutoCount/Accounting process was running during this inspection. Native
application control is unavailable in this session, and no target test account
book or complete import configuration is available here. No import was attempted.
The next required input is a template exported from the actual target import
screen, including line fields and its guide or mapping configuration. Once
confirmed, test one synthetic sales, vehicle purchase and repair invoice in the
target test book, including a repeat import, and inspect totals and postings.


## Native clipboard fix - 2 October 2026

The original review export was rejected by Sales > Invoice > Edit > Paste
Whole Document in AutoCount Accounting 2.2 Rev 34. A/P import is not an
acceptance test for the Purchase Invoice shown in the videos. Native Purchase
and Invoice clipboard layouts were obtained with Copy as Spreadsheet.

Preserve the 15 review sheets and append PasteGuide plus one native sheet per
purchase, supplier repair or sales invoice. Reuse the exported invoice/line
data; never mix invoices. Block paste sheets with missing dates, inconsistent
quantity/price/amount or invoice totals. Keep unknown master/tax/location codes
editable and explicit. Verify generated workbook cells in the correct native
Purchase Invoice and Invoice drafts, without saving, and review independently.
This supersedes the earlier native-control limitation. Commit, merge and
deployment remain outside the approved scope.


## Native paste evidence and final limits - 2 October 2026

The local exporter now preserves 15 review sheets and adds PasteGuide plus one
native PI/RI/SI sheet per invoice. The guide carries exact copy ranges and
separate supplier invoice/D/O reference cells. The source reference is retained
in Remark1/Remark2; plate is in Remark3. Amount or quantity/price/discount
differences and missing invoice dates block native sheet generation.

| Sample | Correct AutoCount entry | Observed result | Copy method |
| --- | --- | --- | --- |
| Sale | Sales > Invoice | 3 lines, RM59,000; date, items, UNIT, accounts and source remarks round-tripped | Generated XLSX selected cells copied directly from Excel |
| Repair | Purchase Invoice | 2 x RM50 + 3 x RM30 = RM190; REFURBISHMENT, UNIT, 6R00-0000 and source remarks round-tripped | Generated XLSX selected cells copied directly from Excel |
| Car purchase | Purchase Invoice | RM27,000 vehicle + RM100 processing = RM27,100; date 23/09/2026, TEST100 / PROCESS (PURCHASE), UNIT, 6P00-0000 / 6P00-1000 and source remarks round-tripped | Final XLSX cells extracted unchanged and copied through a text editor in the native tab-delimited layout |

Direct Excel-to-AutoCount copy for the car-purchase sample remains unverified:
Excel was minimized and restoration repeatedly failed with user-input checks.
The text relay tested its generated data in the correct native entry; it is
not represented as a direct Excel copy. A rectangular padded text relay was
rejected; native signature/header layout and a fresh clipboard copy after
AnyDesk reconnection were used for the accepted relay. Sales and repair
direct Excel copy were verified separately.

Purchase Supplier Invoice No. was not populated by RefDocNo. Copy as Spreadsheet
also omitted a manually entered supplier reference, and dedicated candidate
SupplierInvoiceNo/SupplierDONo header rows were ignored. The false mapping was
removed. Separate field paste of TEST-REPAIR was accepted and retained the RM190
total; its clipboard value was copied from a text editor. Direct copy from the
new PasteGuide supplier-reference cell remains a verification gap. Supplier D/O
references are not stored in YS Heng and remain blank for source-document review.

Repeated Paste Whole Document appended detail and doubled a Sales draft total.
The guide requires an empty New draft, one paste, and discard/restart on retry.
Auto Price Rule prompts require No to retain exported prices. Changing creditor
can reset AccNo, so client master codes must be mapped before paste and amounts
and accounts checked afterward. Video codes are reference mappings; the DEMO
book lacks some of them. No client master was created or changed.

All test drafts were discarded without saving; Purchase and Sales listings
retained their three existing records. This validates clipboard draft data,
not final posting, client master/tax setup, payments or collections, or
File > Import From Excel.

Verification after the supplier-reference fix:

- Existing invoice-identity regression failed before the fix.
- Focused AutoCountExportTests: 33 passed.
- Full backend suite: 567 passed, 1 skipped (568 total).
- Back-office TypeScript check: passed; existing FinancePage tests passed 29
  earlier in this task before the final wording-only update.
- Final synthetic workbook: 19 sheets, three isolated native invoices, exact
  copy ranges/totals and separate supplier reference values confirmed.
- Independent checker found no remaining code correctness blocker.

Changed files: AutoCountExport.cs, Program.cs, AutoCountExportTests.cs,
FinancePage.tsx, API.md, IMPLEMENTATION.md and this plan. All changes remain
uncommitted, unmerged and undeployed in codex/foo-184-autocount-export.

## Direct Excel acceptance completed - 3 October 2026

Reopened the final synthetic autocount-paste-test.xlsx in Microsoft Excel and
copied PI_0001!A1:AG36 directly with Ctrl+C into a new AutoCount Purchase Invoice
using Edit > Paste Whole Document. No text-editor relay was used. The draft
showed 23/09/2026, TEST100 / Test Car at RM27,000 and PROCESS (PURCHASE) /
Processing at RM100, quantity 1 each, UNIT, accounts 6P00-0000 / 6P00-1000,
and total RM27,100. This closes the direct car-purchase copy gap above.
Evidence: car-purchase-direct-excel-2026-10-03.png in the task visualization folder.

Copied RI_0002!A1:AG36 directly from the same Excel workbook into a fresh
Purchase Invoice. The draft showed 21/09/2026, two REFURBISHMENT lines,
quantities 2 and 3, unit prices RM50 and RM30, account 6R00-0000 and total RM190.
Then copied PasteGuide!L4 directly from Excel and pasted it through the native
field context menu into Supplier Invoice No. The field showed TEST-REPAIR and
the total remained RM190. This closes the direct supplier-reference cell gap.
Evidence: repair-direct-excel-reference-2026-10-03.png in the task visualization folder.

Together with the prior direct Sales test, all three synthetic invoice types
now have direct Excel-to-correct-native-draft paste evidence. The separate
supplier-reference paste remains a required step. Client master/account/tax
mapping and Finance review remain required before real use. These checks do
not establish that synthetic codes are valid in the client book or that Save /
posting succeeds. Both new test drafts were cancelled and the save prompts
answered No; no test invoice was saved or posted.

No production code changed during this final UI verification. The previous
33 focused / 567 full-backend passing results and TypeScript check still apply.
Work remains uncommitted, unmerged and undeployed.

## DEMO Save attempt - 3 October 2026

The user subsequently authorized saving a synthetic invoice in DEMO and using
an appropriate existing code. Mapped the open Excel repair sheet creditor to
400-L001 (LK TINT & CAR ACCESSORIES), pasted the invoice directly, and separately
pasted TEST-REPAIR into Supplier Invoice No. Save showed an optional missing
supplier D/O warning; continuing was then blocked by non-existent Item Code
REFURBISHMENT. No invoice was created by that attempt.

The DEMO item chooser listed only two vehicle items. Its account chooser does
contain 6020-U01, COST PROCESSING - VEHICLE REFURBISHM..., which matches this
synthetic repair purpose. Both draft accounts were mapped to it. Clearing an
invalid Item Code then reset description/account/price on leaving the row,
reducing the total; that draft was cancelled with No at the save prompt.

Next step: in Excel map repair details to the existing refurbishment account
and blank non-stock Item Code, preserve descriptions/UOM/quantities/unit prices,
then paste into a fresh Purchase Invoice and verify RM190 before attempting
Save. This non-stock variant differs from the client's REFURBISHMENT Item setup
and must not be reported as successful client-template posting. Excel is
currently minimized and native restoration hit user-input protection; asked
the user to restore the workbook. No successful save or posting yet. The open
Excel has unsaved DEMO creditor mapping edits; the original on-disk test file
has not been overwritten. Production code is unchanged.

## DEMO repair Save verified - 3 October 2026

The user approved the existing refurbishment expense account, setting both
Supplier Invoice No. and Supplier D/O No. to TEST-REPAIR, and retaining Post
to G/L and Post to Stock. The source repair video contains both supplier
references (IN-BP26-09-1212); their equality is specific to that sample and
must not become a default rule for customer data.

Updated only the open test workbook's DEMO mapping: creditor 400-L001,
blank Item Code on both expense lines, and account 6020-U01. Direct Excel
copy/paste retained 2 x RM50 and 3 x RM30, total RM190. Both supplier
references were separately pasted into the native fields.

An agent Save click closed the first draft, but refreshed listing and
unfiltered searches still showed only three old records. Its save outcome
was not accepted as successful. At the user's request, recreated the draft
from Excel and left it visible. The USER then clicked Save. The listing
immediately contained a fourth record, PI-2026/09/001, dated 21/09/2026,
with both references TEST-REPAIR, total and outstanding RM190, Post to G/L
Yes. Reopened that exact record using View and verified both expense lines,
account, quantities/prices, date, supplier references and RM190 persisted.
The earlier agent-click discrepancy remains unexplained; do not attribute
it to the document number or export without evidence.

Evidence in the task visualization folder:
- repair-demo-saved-listing-2026-10-03.png
- repair-demo-saved-reopened-2026-10-03.png

This proves the mapped non-stock DEMO repair Purchase Invoice can be pasted
and saved by the user. It does not prove the client's REFURBISHMENT Item
configuration or saved purchase/sales examples. No additional invoice was
saved by the agent after the user's successful save; the record remains in
DEMO. No production code changed. Work is uncommitted, unmerged and undeployed.
