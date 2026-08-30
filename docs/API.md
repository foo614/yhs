# YS Heng API Reference

The backend is a .NET 10 minimal API served from `services/api/src/YSHeng.Api`. JSON enum values are serialized as strings.

Base local URL:

```text
http://localhost:5000
```

## Health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Lightweight service health. |
| `GET` | `/health/ready` | Public | Readiness check including PostgreSQL connectivity. |

## Authentication

ASP.NET Identity cookie authentication is mounted under `/api/auth`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login?useCookies=true` | Public | Staff login through Identity cookie auth. |
| `POST` | `/api/auth/logout` | Authenticated | Sign out current staff session. |
| `GET` | `/api/auth/me` | Authenticated | Return current staff identity and roles. |

## Public Website

Public endpoints are unauthenticated and must not expose purchase price, refurbishment, commission, audit, or internal workflow data.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/public/vehicles` | List public `Available` vehicles. |
| `GET` | `/api/public/vehicle-catalog/models` | List active, admin-maintained make/model options for public vehicle filters. |
| `GET` | `/api/public/vehicles/{id}` | Fetch one public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photo` | Return the latest public thumbnail/photo for a public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photos` | List public gallery photo metadata for a public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photos/{photoId}` | Return one full public gallery photo for a public available vehicle. |
| `POST` | `/api/public/leads` | Create a public lead for a visible available vehicle. |
| `POST` | `/api/public/contact-enquiries` | Create a general website contact enquiry for Sales triage. |
| `POST` | `/api/public/showroom-enquiries` | Create a no-login in-store QR showroom enquiry. The API records the server-owned `in-store-qr` source and stores vehicle preferences in the lead message for Sales triage. |

`GET /api/public/vehicles` returns the compact inventory DTO. `GET /api/public/vehicles/{id}` additionally returns optional `descriptionMarkdown`, the staff-authored public listing description. It is returned only after the existing visible-and-available vehicle filter; it must contain marketing copy only and never internal vehicle, customer, finance, repair, audit, or workflow information.

Public lead payload:

```json
{
  "vehicleId": "guid",
  "customerName": "Buyer name",
  "phone": "012-3456789",
  "message": "Optional enquiry",
  "sourcePage": "/vehicles/guid?utm_source=facebook",
  "sourceReferrer": "https://facebook.com/",
  "sourceCampaign": "utm_source=facebook&utm_campaign=vios"
}
```

`sourcePage`, `sourceReferrer`, and `sourceCampaign` are optional public enquiry attribution fields. The API trims them, stores at most 500 characters each, and keeps them on the lead record for Sales triage. They must not contain internal back-office URLs or private workflow data.

Public contact-enquiry payload:

```json
{
  "customerName": "Buyer name",
  "phone": "012-3456789",
  "message": "I would like help choosing a vehicle.",
  "sourcePage": "/contact?utm_source=facebook",
  "sourceReferrer": "https://facebook.com/",
  "sourceCampaign": "utm_source=facebook&utm_campaign=showroom"
}
```

`customerName`, `phone`, and `message` are required. `message` is limited to 2,000 characters. General contact enquiries use no vehicle link and appear in the Sales lead queue as `Website contact enquiry`; the public response returns only the new enquiry ID.

Showroom QR enquiry payload:

```json
{
  "vehicleType": "SUV",
  "preferredBrand": "Toyota",
  "preferredModel": "Harrier",
  "budgetRange": "RM50k–RM80k",
  "customerName": "Buyer name",
  "phone": "012-3456789",
  "email": "buyer@example.com"
}
```

`vehicleType`, `budgetRange`, `customerName`, and `phone` are required. The email is optional. This endpoint does not accept an arbitrary source value: it writes the stable `/showroom-enquiry` page and `in-store-qr` source for Sales triage, and its response returns only the new enquiry ID.

## Back-Office Role Policies

All `/api/*` back-office routes require the broad `BackOffice` role policy first. Module policies then narrow access:

| Policy | Roles |
| --- | --- |
| `BossAdmin` | `BossAdmin` |
| `Dashboard` | `BossAdmin` |
| `Vehicles` | `BossAdmin`, `Sales` |
| `VehicleRead` | `BossAdmin`, `Sales`, `Loan`, `Delivery`, `Finance`, `Repair` |
| `CustomerRead` | `BossAdmin`, `Sales`, `Loan`, `Finance` |
| `CustomerProfile` | `BossAdmin`, `Sales`, `Loan`, `Delivery`, `Finance` |
| `OwnerRead` | `BossAdmin`, `Sales`, `Finance` |
| `Sales` | `BossAdmin`, `Sales` |
| `Repairs` | `BossAdmin`, `Repair` |
| `Loans` | `BossAdmin`, `Loan` |
| `Deliveries` | `BossAdmin`, `Delivery` |
| `Finance` | `BossAdmin`, `Finance` |
| `CashCustody` | `BossAdmin`, `Sales`, `Finance` |
| `HrSalary` | `BossAdmin`, `HrSalary` |

## Vehicle Intake And Contacts

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/vehicles` | `Vehicles` | Full vehicle records for Boss/Admin and Sales, including read-only `repairCost`: final repair-job cost when present, otherwise the intake refurbishment total. |
| `GET` | `/api/vehicle-catalog/models` | `Vehicles` | List active and inactive make/model catalogue entries. |
| `POST` | `/api/vehicle-catalog/models` | `Vehicles` | Add a make/model option for public filters. |
| `PUT` | `/api/vehicle-catalog/models/{id}` | `Vehicles` | Edit or deactivate a make/model option without changing existing vehicle records. |
| `POST` | `/api/vehicles` | `Vehicles` | Create an available vehicle intake, including optional chassis and engine identifiers. Sales-created vehicles remain pending and private; only Boss/Admin can submit approval. |
| `PUT` | `/api/vehicles/{id}` | `Vehicles` | Update vehicle intake, chassis/engine identifiers, and public status without changing its workflow-owned status. Changing management approval requires Boss/Admin; unapproved vehicles are always private. |
| `GET` | `/api/vehicle-lookup` | `VehicleRead` | Plate/make/model/status and linked customer ID lookup for authorized workflow selectors and customer-profile hand-off. |
| `GET` | `/api/vehicles/{id}/stock-movements` | `VehicleRead` | List stock owner, status, and location movement history with actor, timestamp, previous value, new value, and reason. |
| `GET` | `/api/customers` | `CustomerRead` | Customer lookup/list. |
| `GET` | `/api/customers/profile-options` | `CustomerProfile` | Minimal canonical customer ID and name choices for the Customer 360 selector. Delivery-only users receive only customers with a linked delivery schedule. |
| `GET` | `/api/customers/{id}/profile` | `CustomerProfile` | Read-only Customer 360 aggregate over linked source records. Identity, loan, delivery, finance, enquiries, and document metadata are returned only for sections the caller's role is already allowed to access. Delivery-only users receive a `404` unless the customer has a linked delivery schedule. Document and receipt content remains on its existing protected download URL. |
| `POST` | `/api/customers` | `Vehicles` | Create customer. |
| `PUT` | `/api/customers/{id}` | `Vehicles` | Update customer. |
| `GET` | `/api/owners` | `OwnerRead` | Previous-owner lookup/list. |
| `POST` | `/api/owners` | `Vehicles` | Create previous owner. |
| `PUT` | `/api/owners/{id}` | `Vehicles` | Update previous owner. |
| `GET` | `/api/purchase-invoices` | `PurchaseAccountingRead` | List purchase invoices with invoice/purchase dates and classified fee lines. |
| `POST` | `/api/purchase-invoices` | `Vehicles` | Create a purchase invoice against an approved supplier. Classified lines must equal the invoice total. |
| `PUT` | `/api/purchase-invoices/{id}` | `Vehicles` | Update a draft purchase invoice and replace its classified lines. Finance-confirmed invoices are immutable. |
| `POST` | `/api/purchase-invoices/{id}/confirm-accounting` | `Finance` | Confirm the purchase invoice and classified lines for accounting export. |

## Uploads

Vehicle photos and documents are stored in PostgreSQL blobs with metadata, checksum, uploader, MIME type, and linked vehicle. Repair invoices and payment evidence may also be linked to their exact workflow record. Vehicle photos generate cached thumbnails. ASP.NET multipart parsing has a small overhead allowance above the 10 MB document payload ceiling, then endpoint-specific validation enforces the 10 MB document and stricter 5 MB photo limits.

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/vehicles/{id}/photos` | `Vehicles` | Upload vehicle photo, max 5 MB. |
| `GET` | `/api/vehicles/{id}/photos` | `BackOffice` | List photo metadata. |
| `GET` | `/api/vehicles/{id}/photos/{photoId}/content` | `BackOffice` | Download original photo content. |
| `POST` | `/api/vehicles/{id}/documents?category={FileCategory}&repairJobId={id}&paymentRecordId={id}&deliveryScheduleId={id}` | Category-specific role | Upload document, max 10 MB. Delivery evidence requires its exact active delivery ID, is bound to the vehicle's confirmed buyer, and is validated from file content rather than the claimed MIME type. Other workflow-record IDs remain optional and mutually exclusive. |
| `GET` | `/api/vehicles/{id}/documents` | Category-specific role | List document metadata visible to the signed-in department. |
| `GET` | `/api/vehicles/{id}/documents/{documentId}/content` | Category-specific role | Download document content visible to the signed-in department. |
| `POST` | `/api/documents/{documentId}/ocr-jobs` | Category-specific role | Start Google Document AI analysis for the authorized uploaded document category, including IC, VOC, invoice, and receipt review. |
| `GET` | `/api/ocr-jobs/{jobId}` | Category-specific role | Read OCR job status, progress, original extracted draft fields, saved reviewed values, field-level changes, and reviewer audit data. |
| `PUT` | `/api/ocr-jobs/{jobId}/review` | Category-specific role | Save staff-reviewed OCR fields and line items. The server preserves every original-versus-reviewed difference, reviewer identity, timestamp, and field-accuracy counts before values are applied to operational records. |
| `GET` | `/api/vehicles/{id}/ocr-jobs` | Category-specific role | List captured OCR data for uploaded vehicle documents visible to the signed-in department. |

OCR runtime:

- IC extraction returns customer name, IC number, and address. VOC extraction returns registration, chassis, engine, make, model, year, and registered-owner suggestions. Invoice and receipt extraction retains the existing finance and supplier fields. Repair-invoice extraction also proposes repair-part and repair-detail values from recognized line items so the reviewer can populate the Repair task form.
- The back-office review drawer shows field confidence and pre-fills a current master value when it conflicts with AI output. Staff edit the final value directly and save one review; there is no accept/reject choice. The server keeps the original output, reviewed result, and every field/line-item difference. OCR field accuracy is calculated from all non-empty extracted or reviewed values: unchanged values are correct; changed, added, and removed values are corrections.

- The default OCR provider is `GoogleDocumentAi`. Configure `Ocr__GoogleDocumentAi__ProjectId`, `Location`, and `DefaultProcessorId`; the deployment environment uses the equivalent `GOOGLE_DOCUMENT_AI_*` values.
- Configure `InvoiceProcessorId` for purchase, repair, and payment invoices and `ExpenseProcessorId` for payment receipts. When either specialized processor is absent, OCR falls back to `DefaultProcessorId` and adds a review warning.
- Authentication uses Google Application Default Credentials and the `cloud-platform` OAuth scope. The production container reads a least-privilege credential from `/run/secrets/google-document-ai.json`; never store credential JSON in source control or an environment-file value.
- The backend sends uploaded image bytes to Google Document AI. Keep the existing manual review step because schema-valid extraction can still be semantically wrong. PDF conversion remains outside this upload flow.
- `Ocr__Provider=LocalMock` is for deterministic local tests. `BaiduUnlimited` remains an explicit legacy provider during migration but is no longer the default.
- Before OCR calls an external provider, the API reserves one usage unit against the server-side OCR limits. Exhausted or disabled limits return `429` with a structured `message`; a provider-attempted request remains counted even if the provider later fails.

Document upload ownership:

| Category | Uploader roles |
| --- | --- |
| `PurchaseInvoice`, `Voc`, `IdentityCard`, `ApDocument`, `StatusReceipt` | `BossAdmin`, `Sales` |
| `LoanDocument` | `BossAdmin`, `Loan` |
| `DeliveryDocument`, `InspectionReport`, `HandoverPhoto`, `SignedHandover`, `Policy`, `RoadTaxReceipt`, `WindscreenPolicy` | `BossAdmin`, `Delivery` |
| `RepairInvoice` | `BossAdmin`, `Repair` |
| `PaymentReceipt`, `PaymentInvoice` | `BossAdmin`, `Finance` |
| `MedicalCertificate` | `BossAdmin`, `HrSalary` |

`VehiclePhoto` is rejected on the document endpoint and must use the photo endpoint.

When supplied, `repairJobId` must reference a repair for the route vehicle and the category must be `RepairInvoice`. `paymentRecordId` must reference a payment record for the route vehicle and the category must be `PaymentReceipt` or `PaymentInvoice`.

## Workflow Modules

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/loans` | `Loans` | List loan applications. |
| `POST` | `/api/loans` | `Loans` | Create loan workflow record. An active loan establishes or verifies the vehicle's canonical customer. |
| `PUT` | `/api/loans/{id}` | `Loans` | Update loan workflow record. An active loan establishes or verifies the vehicle's canonical customer; `Done` requires the current buyer's full vehicle-scoped document set. |
| `GET` | `/api/loans/{id}/document-check` | `Loans` | Check VOC/AP/status receipt/loan document completeness. |
| `GET` | `/api/deliveries` | `Deliveries` | List delivery schedules. |
| `POST` | `/api/deliveries` | `Deliveries` | Create delivery workflow record for a vehicle with an existing canonical buyer. The API stores that buyer on the delivery rather than trusting the request body. |
| `PUT` | `/api/deliveries/{id}` | `Deliveries` | Update a delivery without changing its locked vehicle or buyer. A transition to `Released` is accepted only after server-verified Finance reconciliation and exact delivery/buyer evidence; release actor and timestamp are server-owned, and terminal records reject later updates. |
| `GET` | `/api/deliveries/{id}/release-readiness` | `Deliveries` | Check Finance clearance, delivery checklist, exact delivery/buyer documents, and release evidence metadata. |
| `GET` / `POST` / `PUT` | `/api/delivery-accounting-charges` | `DeliveryAccountingRead` / `Deliveries` | Delivery records insurance or road-tax provider, amount, invoice date, reference, and paid-on-behalf status as a Finance-review draft. |
| `POST` | `/api/delivery-accounting-charges/{id}/confirm` | `Finance` | Finance confirms a delivery accounting draft. Confirmed rows are immutable. |
| `GET` | `/api/repairs` | `Repairs` | List repair jobs. |
| `POST` | `/api/repairs` | `Repairs` | Create repair job. |
| `POST` | `/api/repairs/from-receipt` | `Repairs` | After OCR review, atomically create a repair job, supplier invoice, linked repair receipt, and its confirmed receipt items from an unlinked vehicle repair-invoice upload. |
| `PUT` | `/api/repairs/{id}` | `Repairs` | Update repair job. |
| `POST` | `/api/repairs/{id}/approval` | `BossAdmin` | Approve a repair with the authenticated Boss/Admin actor and server timestamp. Repair CRUD cannot supply an approval; material repair changes reset it. |
| `GET` | `/api/repairs/{id}/receipts` | `Repairs` | List confirmed repair receipts and their child items. |
| `POST` | `/api/repairs/{id}/receipts/confirm` | `Repairs` | Confirm one uploaded repair receipt and its reviewed child items for an existing repair job. |
| `GET` | `/api/suppliers` | `Repairs` | Derived supplier master summary from supplier invoices. |
| `GET` | `/api/supplier-master` | `SupplierRead` | List supplier master records with address, phone, TIN, AutoCount creditor code, and approval status. |
| `POST` / `PUT` | `/api/supplier-master` | `Repairs` | Create or update a supplier draft. Approved suppliers are immutable. |
| `POST` | `/api/supplier-master/{id}/approve` | `Finance` | Approve a supplier draft. The creator cannot approve the same supplier. |
| `GET` | `/api/supplier-invoices` | `Repairs` | List supplier invoices. |
| `GET` | `/api/supplier-invoices/aging` | `Repairs` | Supplier invoice aging view for unmatched, due-soon, overdue, and paid states. |
| `POST` | `/api/supplier-invoices` | `Repairs` | Create supplier invoice. |
| `PUT` | `/api/supplier-invoices/{id}` | `Repairs` | Update supplier invoice. |
| `GET` | `/api/leads` | `Sales` | List public and back-office leads. |
| `PUT` | `/api/leads/{id}` | `Sales` | Update lead/customer link/status. |

Lead status ownership: the first staff member who moves a lead out of `New` is recorded as the taker. After that, only that same staff member can change the lead status.

Delivery release-readiness responses include:

- `isReady`: true only when Finance has reconciled payment, the release checklist is complete, and required evidence is linked to this delivery and confirmed buyer.
- `financeCleared`: true only when the vehicle has a reconciled payment record.
- `missingCategories`: required release document categories still missing.
- `missingEvidence`: required handover-photo or signed-handover uploads still missing.
- `expiredDocuments`: delivery-critical expiry blockers for insurance, road tax, or windscreen insurance.
- `evidence`: one item for each required release document category (`InspectionReport`, `DeliveryDocument`, `HandoverPhoto`, `SignedHandover`, `Policy`, `RoadTaxReceipt`, and `WindscreenPolicy`), with `category`, `isPresent`, and latest uploaded document metadata when present: `documentId`, `fileName`, `mimeType`, `checksum`, `uploadedBy`, and `uploadedAt`.

For delivery release, upload the handover photo and signed handover in their dedicated delivery categories. The files retain the existing checksum, uploader, MIME type, timestamp, and protected download behavior; vehicle inventory photos remain separate media.

Delivery schedules start at booking inspection or scheduled. Later status changes move one stage at a time; moving back requires a reschedule/rework reason, and released or cancelled schedules remain terminal. An outstation delivery additionally records its destination address and transport method. Invoice updates remain a Finance responsibility.

Workflow integrity:

- Vehicle intake create/update cannot set `LoanProcessing` or `Sold`; loan and payment workflow updates derive those states on the server.
- A loan can become `Done` only when `StatusReceipt`, `Voc`, `ApDocument`, and `LoanDocument` all belong to its exact vehicle and canonical buyer. The validation response uses `loan_documents_incomplete` and names the missing categories.
- Delivery creation/update and payment reconciliation require that the vehicle has a `CustomerId` pointing to an existing canonical customer. A sale does not require a loan, but Finance V2 physical-cash allocation is deferred until cash custody can link each partial collection safely.

## Finance

Finance V2 uses one receivable per vehicle, one immutable YS Heng invoice snapshot, and multiple partial collection rows. All finance endpoints require the `Finance` policy except the Boss/Admin-only legacy management review, nett-price variance approval, and collection reversal actions.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/payments` | List legacy and V2 payment records. Each row includes the linked invoice, collection history, collected amount, balance, amount still available to allocate, and plain-language receivable status. |
| `POST` | `/api/payments` | Create a legacy payment record. New sales should use `/api/payments/finance-sale`. |
| `POST` | `/api/payments/finance-sale` | Create a Finance V2 sale with the responsible sales agent, optional loan-bank reference, and paid-on-behalf insurance, road-tax, or advance lines. The server calculates nett price and issues the invoice immediately when no manual variance exists. |
| `GET` | `/api/payments/export` | Export payment CSV after Finance/Admin authorization and audit logging. |
| `GET` | `/api/payments/export-autocount?from=YYYY-MM-DD&to=YYYY-MM-DD` | Export the AutoCount Excel review workbook with customer/owner TIN, approved supplier details, classified purchase lines, sales-agent and paid-on-behalf lines, voucher evidence, and delivery accounting drafts. A collection keeps its invoice number even when that invoice was issued before the selected period. This remains a manual mapping aid, not a verified direct-import template. |
| `PUT` | `/api/payments/{id}` | Update a legacy payment workflow. V2 rows reject this general update route. |
| `POST` | `/api/payments/{id}/management-review` | Boss/Admin marks a legacy payment as management-reviewed. Payment CRUD cannot self-assert this review, and material legacy edits reset it. |
| `POST` | `/api/payments/{id}/nett-price-override/approve` | Boss/Admin approves a V2 manual nett-price variance and atomically issues the invoice. The requester cannot approve their own variance. |
| `POST` | `/api/payments/{id}/invoice` | Idempotently issue or recover an eligible V2 invoice. |
| `POST` | `/api/payments/{id}/collections` | Add one non-cash partial collection without exceeding the unallocated invoice balance. New clients supply an `idempotencyKey`; an exact retry returns the existing aggregate, while reuse with different details is rejected. Every allowed method requires a traceable reference. |
| `POST` | `/api/collection-transactions/{id}/financing-status` | Record the external bank progression from `Pending` to `Approved` to `Disbursed`. A bank-disbursement collection always starts at `Pending`. |
| `POST` | `/api/collection-transactions/{id}/reconcile` | Reconcile a collection after the funds are confirmed. The recorder cannot reconcile their own collection, evidence must be linked to that exact collection, and only reconciled collections reduce balance. |
| `POST` | `/api/collection-transactions/{id}/reverse` | Boss/Admin reverses a collection with a required reason; no collection row is deleted. |
| `GET` | `/api/finance-invoices/{invoiceId}/content` | Download the protected YS Heng sales-invoice PDF. |
| `GET` / `POST` | `/api/settlement-reminders` | List/create settlement reminders. |
| `PUT` | `/api/settlement-reminders/{id}` | Update settlement reminder. |
| `GET` / `POST` | `/api/daily-spends` | List/create daily spend rows. |
| `PUT` | `/api/daily-spends/{id}` | Update daily spend row. |
| `GET` / `POST` | `/api/broker-commissions` | List/create broker commission rows. |
| `PUT` | `/api/broker-commissions/{id}` | Update broker commission row. |
| `GET` / `POST` | `/api/debt-recoveries` | List/create debt recovery cases. |
| `PUT` | `/api/debt-recoveries/{id}` | Update debt recovery case. |
| `GET` / `POST` | `/api/payment-vouchers` | List or create pending payment vouchers with payment method, source account, cheque or transfer reference, bank charge, and accounting account. |
| `PUT` | `/api/payment-vouchers/{id}` | Update a pending payment voucher. Approved or paid vouchers are immutable. |
| `POST` | `/api/payment-vouchers/{id}/approve` | Approve a pending voucher. The creator cannot approve it. |
| `POST` | `/api/payment-vouchers/{id}/mark-paid` | Mark an approved voucher paid with an evidence reference. The approver cannot perform this action. |
| `GET` | `/api/payment-vouchers/{id}/pdf` | Download the finance-controlled standard Payment Voucher PDF. Pending vouchers are marked draft; every download is audited. |

Finance V2 nett price is calculated to two decimal places:

```text
calculatedNettPrice = salesPrice + interestAdditionalCharges + windscreenCharges
                    + insurancePaidOnBehalfAmount + roadTaxPaidOnBehalfAmount
                    + advancePaidOnBehalfAmount - ncdAmount
nettPriceVariance = agreedNettPrice - calculatedNettPrice
```

The agreed nett price may differ from the calculation only with a reason and approval from a different Boss/Admin user. After a V2 receivable exists, the confirmed buyer cannot be reassigned through ordinary vehicle or legacy-payment updates. Collection creation and reconciliation recheck that the vehicle, receivable, and immutable invoice snapshot still identify the same buyer. V2 rows become `Sold` only after an invoice exists and reconciled, non-reversed collections reduce the balance to zero. Pending allocations reserve available balance but do not count as collected. Legacy payment reconciliation retains its canonical buyer, receipt/invoice reference, checklist, and management-review gates.

Collection requests are serialized per receivable. Active collection references are normalized and unique per payment method across sales, and the database enforces this invariant for concurrent requests. Upload `PaymentReceipt` or `PaymentInvoice` evidence with both `paymentRecordId` and `collectionTransactionId`; the collection must belong to that payment and vehicle. Invoice PDF downloads and collection mutations are audit logged.

## Cash Custody And Official Receipts

Cash custody has its own `CashCustody` policy. Sales can see and act on only their own handovers; Finance and BossAdmin can monitor all handovers. Sales records cash received and requests the handover. Finance records physical receipt, then accepts or rejects it. The collector cannot receive, accept, or reject their own handover, and the server derives the payment, vehicle, customer, collector, timestamps, and amount checks rather than trusting client-supplied values.

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/cash-handovers` | `CashCustody` | List custody records; Sales receives only their own rows. |
| `GET` | `/api/cash-handovers/payment-lookup` | `CashCustody` | Minimal payment, customer, and vehicle lookup for recording a cash handover. |
| `POST` | `/api/cash-handovers` | `Sales` | Record cash received for one payment; amount must match the payment nett price. |
| `POST` | `/api/cash-handovers/{id}/request-handover` | `Sales` | Recorded collector marks cash as pending handover. |
| `POST` | `/api/cash-handovers/{id}/hand-over` | `Finance` | Finance records physical receipt from the salesperson. |
| `POST` | `/api/cash-handovers/{id}/accept` | `Finance` | Accept custody and generate one idempotent official receipt PDF. |
| `POST` | `/api/cash-handovers/{id}/reject` | `Finance` | Reject custody with a required reason. |
| `GET` | `/api/cash-handovers/{id}/official-receipt/content` | `CashCustody` | Download the official receipt for Finance/BossAdmin or the recorded salesperson. |

Only one handover may exist per legacy payment and only one official receipt may exist per handover. Finance V2 rows are excluded from this legacy custody flow because it cannot yet link a handover to one partial collection. Receipt creation does not reconcile a legacy payment or bypass receipt, invoice-reference, document, or management-review controls. Authorized staff download the protected receipt and attach it to a customer email; WhatsApp dispatch is intentionally deferred to the notification engine in FOO-40.

## HR And Salary

All HR endpoints require authenticated back-office access. Staff can access their own attendance, leave, MC, balance, payroll profile, pay-period, and payslip records. HR/Salary and Admin users can review and manage all staff HR records. Boss/Admin alone can view the privacy-limited leave calendar and manage office attendance-network ranges.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/hr/staff` | HR/Admin list of existing staff users for HR selectors. |
| `GET` | `/api/hr/attendance` | List attendance records scoped to the current staff user, or all staff for HR/Admin. |
| `GET` | `/api/hr/boss-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Boss/Admin only. Approved leave days as staff-name `Unavailable` entries; excludes leave reason, MC, and medical details. |
| `GET` | `/api/hr/attendance-networks` | Boss/Admin only. List the office CIDR allow-list. |
| `POST` | `/api/hr/attendance-networks` | Boss/Admin only. Add an office CIDR range with label and active status. |
| `PUT` | `/api/hr/attendance-networks/{id}` | Boss/Admin only. Update or disable an office CIDR range. |
| `POST` | `/api/hr/attendance/check-in` | Create or update today's check-in for the current staff user. |
| `POST` | `/api/hr/attendance/check-out` | Create or update today's check-out for the current staff user. |
| `PUT` | `/api/hr/attendance/{id}` | HR/Admin correction with a required note; records manual verification and audit history. |
| `GET` | `/api/hr/leave-requests` | List leave and MC requests scoped to the current staff user, or all staff for HR/Admin. |
| `POST` | `/api/hr/leave-requests` | Submit a leave request. |
| `PUT` | `/api/hr/leave-requests/{id}/decision` | HR/Admin approve or reject a leave request. A staff member cannot approve their own request. |
| `PUT` | `/api/hr/leave-requests/{id}/cancel` | Staff cancel their own pending leave request; HR/Admin can cancel any pending staff leave request. |
| `POST` | `/api/hr/leave-requests/{id}/mc` | Upload a medical certificate document for the leave request, max 10 MB. |
| `GET` | `/api/hr/leave-requests/{id}/mc/content` | Download the medical certificate for the owner or HR/Admin. |
| `GET` | `/api/hr/leave-balances` | List AL/MC balances scoped to self, or all staff for HR/Admin. |
| `PUT` | `/api/hr/leave-balances/{staffUserId}` | HR/Admin apply/reset a staff AL/MC balance, usually from a role policy. |
| `GET` | `/api/hr/leave-policies` | HR/Admin list default AL/MC entitlements by role. |
| `PUT` | `/api/hr/leave-policies/{role}` | HR/Admin create or update default AL/MC entitlement for a role. |
| `GET` | `/api/hr/leave-adjustments` | List leave adjustment history scoped to self, or all staff for HR/Admin. |
| `POST` | `/api/hr/leave-adjustments` | HR/Admin increase or decrease one staff member's AL/MC balance with a reason and audit log. |
| `GET` | `/api/hr/payroll-profiles` | List payroll profiles scoped to self, or all staff for HR/Admin. |
| `PUT` | `/api/hr/payroll-profiles/{staffUserId}` | HR/Admin create or update Monthly or Hourly employment profile, salary/rate, allowances, and manual deductions. |
| `GET` | `/api/hr/pay-periods` | List pay periods and configured working days. |
| `POST` | `/api/hr/pay-periods` | HR/Admin create a working-day pay period. |
| `GET` | `/api/hr/payslips` | List payslips scoped to self, or all staff for HR/Admin. |
| `POST` | `/api/hr/pay-periods/{id}/generate-payslips` | HR/Admin generate or update payslips for a pay period. |

Payslip formula:

```text
dailySalary = monthlyBaseSalary / workingDays
unpaidLeaveDeduction = dailySalary * approvedUnpaidLeaveDays
grossPay = monthlyBaseSalary + overtimePay + allowances
netPay = grossPay - unpaidLeaveDeduction - manualDeductions

hourlyWorkedHours = completed Present, Late, and HalfDay check-out minus check-in within the pay period
hourlyGrossPay = (hourlyWorkedHours * hourlyRate) + allowances
hourlyNetPay = hourlyGrossPay - manualDeductions
```

Attendance dates and payroll-period boundaries use `Asia/Kuala_Lumpur`. Check-in and check-out require the client address supplied by the trusted Caddy proxy to match an active office CIDR range; raw IP history is not stored. Remote and outstation exceptions are not available in this release.

Statutory EPF, SOCSO, EIS, and PCB calculations are excluded from this MVP.

## Dashboard, Audit, And Admin

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | `Dashboard` | Boss/Admin operational metrics. `from` and `to` are optional but must be supplied together as an inclusive analytics period. Live stock, loan, collection, settlement, purchase cost, repair cost, aging metrics, AI review backlog, and OCR monthly capacity remain current; the period scopes sales, actual profit, lead, refurbishment, and `aiDocumentProcessing` scan activity. `aiDocumentProcessing` provides aggregate IC, VOC, invoice/receipt, and supporting-document scan counts, reviewed documents, field accuracy, correction counts, low-confidence and failed counts only; it never includes document images, filenames, raw OCR text, extracted values, or identity data. |
| `GET` | `/api/dashboard/reminders?type={type}&due={All\|Overdue\|DueToday\|DueSoon\|Upcoming}` | `Dashboard` | Reminder inbox, optionally filtered. `DueSoon` applies only to unpaid Daily Spend due from tomorrow through the next 10 calendar days. |
| `GET` | `/api/priority-actions` | `BackOffice` | Role-scoped operational queue. Returns only items the signed-in user's roles may action: Sales leads, Repair work, Loan follow-up, Delivery preparation, Finance follow-up, and HR leave approvals. Boss/Admin receives the combined management queue. |
| `GET` | `/api/audit-log?q=&actor=&action=&entityName=` | `BossAdmin` | Filterable audit history. `q` searches actor, action, and entity name together; the other parameters narrow one field. |
| `GET` | `/api/admin/ai-limits/ocr` | `BossAdmin` | Read the OCR enabled state, monthly and per-staff daily limits, and current-month usage. |
| `PUT` | `/api/admin/ai-limits/ocr` | `BossAdmin` | Update the server-enforced OCR enabled state, monthly request limit, and per-staff daily request limit. |
| `GET` | `/api/admin/users` | `BossAdmin` | List staff users and roles. |
| `POST` | `/api/admin/users` | `BossAdmin` | Create staff user. |
| `PUT` | `/api/admin/users/{id}` | `BossAdmin` | Update staff display name. |
| `PUT` | `/api/admin/users/{id}/password` | `BossAdmin` | Reset staff password. |
| `PUT` | `/api/admin/users/{id}/status` | `BossAdmin` | Enable/disable staff user. |
| `PUT` | `/api/admin/users/{id}/roles` | `BossAdmin` | Replace staff role assignments. |

## Enum Values

- `StockOwner`: `YSHeng`, `KS`
- `VehicleStatus`: `Available`, `LoanProcessing`, `Sold`
- `LeadStatus`: `New`, `Contacted`, `Closed`
- `LeadClosureOutcome`: `Sold`, `Lost`, `Invalid`
- `LoanStatus`: `Draft`, `Pending`, `Approved`, `Rejected`, `Done`
- `DeliveryStatus`: `BookingInspection`, `Scheduled`, `Inspection`, `PreparingDocuments`, `CarPreparation`, `ReadyForRelease`, `Released`, `Cancelled`
- `DeliveryType`: `Standard`, `Outstation`
- `PaymentStatus`: `Pending`, `Approved`, `Disbursed`, `Reconciled`
- `CollectionMethod`: `BookingDeposit`, `DownPayment`, `BankTransfer`, `BankDisbursement`, `Cheque`, `Card`, `TradeInCredit`, `Other`, `Cash` (`Cash` is reserved and rejected by the generic V2 collection route)
- `CollectionStatus`: `Pending`, `Reconciled`, `Reversed`
- `FinancingStatus`: `NotApplicable`, `Pending`, `Approved`, `Disbursed`
- `ReceivableStatus`: `Draft`, `WaitingForApproval`, `ReadyToCollect`, `PartiallyPaid`, `Paid`, `AttentionNeeded`
- `PaymentVoucherStatus`: `Pending`, `Approved`, `Paid`
- `CashHandoverStatus`: `ReceivedBySales`, `PendingHandover`, `HandedOver`, `Rejected`, `Receipted`
- `DebtRecoveryStatus`: `Open`, `FollowedUp`, `Closed`
- `RepairApprovalStatus`: `Pending`, `Approved`, `Rejected`
- `SupplierInvoiceAgingStatus`: `Unmatched`, `DueSoon`, `Overdue`, `Paid`
- `HrAttendanceStatus`: `Present`, `Late`, `HalfDay`, `Absent`
- `HrLeaveType`: `AnnualLeave`, `MedicalLeave`, `EmergencyLeave`, `UnpaidLeave`
- `HrLeaveStatus`: `Pending`, `Approved`, `Rejected`, `Cancelled`
- `HrPayslipStatus`: `Draft`, `Generated`
- `HrEmploymentType`: `Monthly`, `Hourly`
- `HrAttendanceVerificationMethod`: `Manual`, `OfficeQr`, `Outstation`, `ManualException`, `OfficeIp`
- `FileCategory`: `VehiclePhoto`, `PurchaseInvoice`, `Voc`, `IdentityCard`, `ApDocument`, `StatusReceipt`, `LoanDocument`, `DeliveryDocument`, `HandoverPhoto`, `SignedHandover`, `Policy`, `RoadTaxReceipt`, `RepairInvoice`, `PaymentReceipt`, `PaymentInvoice`, `MedicalCertificate`, `InspectionReport`, `WindscreenPolicy`
- `OcrJobStatus`: `Queued`, `Analyzing`, `NeedsReview`, `Failed`, `Reviewed`
- `OcrReviewDecision`: `Pending`, `Accepted`, `Rejected`, `Reviewed` (the older Accepted and Rejected states are retained for historical OCR jobs only)
- `AiService`: `Ocr`
- `AiUsageStatus`: `Reserved`, `Succeeded`, `Failed`

## Error Shape

Validation failures usually return one of these shapes:

```json
{
  "errors": [
    { "code": "plate_required", "message": "Car plate is required." }
  ]
}
```

```json
{
  "message": "Route vehicle id does not match body id."
}
```

Back-office mutations write audit records with the authenticated staff email. Public lead creation writes a public actor audit record.
