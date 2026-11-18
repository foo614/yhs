# PPT4 changeset and user acceptance checklist

Release scope: slides 23-32 and 41-42, plus table page size. Production release evidence is recorded separately after deployment.

## Changeset

- Loan: create/select buyer, IC image/PDF upload, cash-buyer path without a loan, Take case, per-bank submission/result/LOU, Broker final LOU selection and deal details. Original documents are required; edited copies optional. Agreement date is optional. Rejected cases are retained and hidden from the default list after one month.
- Delivery: simplified stages, no Prepare Car checklist or two-day customer notice, buyer-matched final selling price is read-only, documents collected in Delivery, Inspection files remain in Inspection. Manual insurance/eAuto/JPJ fields and road-tax review remain available. Nearest delivery dates first; completed history remains searchable.
- Repair: receipt-based list and filters, approve/reject/payment protection, editable unapproved receipts where association is clear, and footer total for all filtered records.
- Tables: default 10 rows; user can select 10/20/30 on mobile and desktop.
- Public FAQ: gross monthly salary gives a rough vehicle-price browsing range and matching stock.

## User testing

Use designated test records and test staff. Do not enter a real payment just to test a button.

1. Broker: create a financed buyer with IC image/PDF; confirm buyer and Pending loan save correctly. Try cash buyer: customer saves without creating a loan. Cancel and reopen: previous IC must not be reused invisibly.
2. Broker uploads the original. Loan staff take the case, open details, and upload optional edited copies. Another processor must not access the taken case's private documents.
3. Banks: add two banks, record submission, upload the correct LOU and check amount/rate/tenure/terms. Broker selects the final approved LOU. Confirm selected terms agree with deal details; rejected bank option cannot be revived by editing.
4. Loan completion: enter required deal fields and original documents; leave agreement date blank and confirm it does not block completion. Check missing required fields are explained. Rejected historical cases can be found by search/filter.
5. Delivery: check selling price belongs to this buyer and is read-only. Edit permitted delivery fields, upload/view files and VOC, review road-tax expiry, and verify manual insurance/JPJ details. Confirm Inspection upload is not duplicated. Check old completed delivery can be searched.
6. Repair: filter by date/status, compare footer total before/after changing page size, inspect receipt, approve or reject a test record. Rejected/paid records must block disallowed changes. Pending correction preserves supplier and amount accurately.
7. Pagination: select 10, 20 and 30 on phone and desktop; actual row count and navigation must follow the selection.
8. Dashboard/notifications: check own assigned follow-ups and permitted News. Verify intended recipient and reminder timing. Real WhatsApp receipt and attachments require a separately controlled send; automated tests do not prove live delivery.
9. FAQ: enter gross salary, open matching vehicles; blank/zero/negative inputs must not produce a misleading price recommendation.

Report module, role, car plate/test record, steps, expected/actual result and screenshot. Do not include IC images or private customer documents in a public test report.

## Not included

Slides 43 and 45; insurance AI; automatic Warranty, Hutang tepi, Selling price confirmation and VDO generation; bulk stock import. These remain on hold.
