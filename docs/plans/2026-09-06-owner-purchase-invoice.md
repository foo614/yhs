# Owner-based Purchase Invoice generation

## Approved scope

The user approved generating a formal Purchase Invoice using the vehicle's previous Owner, not a Supplier. The user also approved editing issued invoices provided the system retains an audit trail. This follows the earlier locally accepted, unpublished operations repairs; those changes must remain intact.

- An explicit Generate action creates the numbered invoice and PDF together. It does not persist a draft first or automatically issue on vehicle creation.
- Use the selected vehicle's canonical Owner, intake date and purchase price for the first issue. Require an approved intake and valid source data; do not create or approve a Supplier.
- Keep one system-issued acquisition invoice per vehicle with a separate server-controlled number series and Singapore issue date.
- Permit corrections through a new numbered revision with a mandatory reason and expected-revision concurrency check. Retain all previous snapshots, PDFs, authors, timestamps and accounting-confirmation evidence.
- A correction creates a new current version and resets its Finance confirmation. Finance confirms the version it actually reviewed.
- Keep original vehicle/Owner master records, payment, settlement, reconciliation, Repair suppliers and legacy supplier-linked invoices unchanged.
- Do not claim tax-authority submission or verified AutoCount direct import. Owner creditor mapping remains manual.
- The user subsequently authorized committing and pushing this slice after acceptance is complete. Do not publish while required acceptance remains blocked. Production deployment and business-database changes are not part of the isolated acceptance run.

## Implementation ownership

- API maker: domain and EF mapping, additive startup schema, issuance/revision/content routes, PDF rendering, validation, focused backend tests, and minimal Owner-label compatibility in the AutoCount review workbook.
- Back-office maker: API types/client, Vehicle creation and revision UI, version history/PDF actions, Finance version-aware confirmation, related tests and narrow styles.
- Root: integration, durable documentation, isolated real API/browser/PDF acceptance and final review coordination.
- Separate reviewer: correctness, authorization, audit/version retention, concurrency and verification gaps.

## Contract

`PurchaseInvoice` preserves legacy fields. New owner-acquisition records have `sourceType: OwnerAcquisition`, `ownerId`, `currentRevisionNumber`, and hydrated `currentRevision` metadata. Legacy records default to `LegacySupplier` and revision zero. Official bytes are returned only through protected content endpoints, not list JSON.

- `POST /api/vehicles/{vehicleId}/purchase-invoice/generate`: Vehicles policy. Request includes expected Owner, purchase price and intake date for stale-review detection. Return the existing generated invoice on a retry; otherwise generate revision 1 from canonical source data in one transaction.
- `POST /api/purchase-invoices/{id}/revisions`: Vehicles policy. Require `expectedRevision`, `reason`, dates, optional payment reference, seller display corrections and classified lines. The total is derived from validated positive lines. These corrections affect the invoice snapshot, not the vehicle price or Owner master. Number, source vehicle/Owner identity, actor and time remain server-controlled.
- `GET /api/purchase-invoices/{id}/revisions`: PurchaseAccountingRead policy. Return ordered full version snapshots, lines, author/time/reason and review evidence for comparison.
- `GET /api/purchase-invoices/{id}/revisions/{revisionNumber}/content`: PurchaseAccountingRead policy. Return the retained PDF for that exact revision and audit the download.
- Existing Finance confirmation accepts an expected revision for generated invoices, locks the same aggregate as revisions, and rejects stale confirmation. Legacy confirmation behavior remains compatible.
- Existing generic create/update routes cannot forge owner-acquisition metadata or bypass the revision workflow.

Initial generation is serialized with existing vehicle-scoped workflow locks. Revisions and Finance confirmation share the invoice lock. Database constraints enforce one owner-acquisition invoice per vehicle and unique official number/revision identities. PDF failure rolls back the invoice, revision and audit writes. Sequence gaps are acceptable; duplicate numbers are not.

Number allocation skips normalized numbers already used by legacy records. New legacy writes cannot claim the system number format; unchanged historical legacy numbers remain valid. Stale but otherwise valid reviewed source data returns a conflict, while missing or invalid canonical data returns validation errors.

Revision inputs are bounded to 100 classified lines, a positive amount of at most RM10 million per line, 500 characters per description/reason, 200 per seller field/payment reference and 1,000 for the address. Canonical issue prices and revision line amounts must be exact to two decimal places; fractional cents are rejected, not silently rounded in an official PDF. Unknown numeric line classifications and oversized totals return structured validation instead of being recorded or throwing an unhandled overflow.

## PDF and audit requirements

The existing ASCII-only PDF helper cannot safely render Chinese Owner details. The acquisition renderer must preserve the supported text, wrap long fields and paginate; it must not silently replace or truncate characters. Verify the exact renderer in the current Docker runtime. Any missing font requirement is a visible blocker, not permission to ship corrupted PDFs or add undeclared runtime dependencies.

Version history shows what changed, who changed it, when and why. A version stores its seller/vehicle/line snapshots and original PDF bytes. Updating master data must not rewrite a previously issued version. Accounting review evidence belongs to the reviewed version and remains visible after a correction.

New version and Finance-review evidence stores a readable authenticated actor label separately from the staff user ID. Latin PDF runs use Helvetica with measured wrapping; supported non-Latin runs retain their fallback. Each page identifies the invoice, revision and page number. UI history is associated with its invoice ID and rejects late responses from a previously selected invoice.

## Acceptance

- Unit tests for canonical generation, required Owner/intake data, server numbering/date, invalid lines/dates, edit reasons, version concurrency, audit/review reset and PDF output.
- API-client/UI tests for generation without Supplier/manual number, controlled correction submission, history/download and version-aware Finance confirmation.
- Real isolated PostgreSQL/API checks for concurrent issuance, stale and competing revisions, stale confirmation, legacy compatibility, unauthorized roles and immutable historical PDF bytes.
- Browser checks for generation, corrections, failures retaining input, history and Finance review at mobile, tablet and desktop widths.
- Render and inspect representative PDF pages including long fields and multilingual Owner details. Do not treat text extraction alone as layout acceptance.
- Run relevant frontend tests/typecheck/build and fresh backend tests. Report environmental or pre-existing failures separately.

## Separate approved OCR scope

The user subsequently approved VOC/car-card intake OCR and IC/address correction as a separate parallel feature. Its scope and acceptance are recorded in `2026-09-06-intake-voc-ic-ocr.md`; it does not change Purchase Invoice issuance or accounting rules.
