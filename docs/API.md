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
| `GET` | `/api/customers/{id}/profile` | `CustomerProfile` | Read-only Customer 360 aggregate over linked source records. Identity, loan, delivery, finance, enquiries, and document metadata are returned only for sections the caller's role is already allowed to access. Delivery-only users receive a `404` unless the customer has a linked delivery schedule. Delivery evidence must match both a delivery shown in the profile and that customer. Document and receipt content remains on its existing protected download URL. |
| `POST` | `/api/customers` | `Vehicles` | Create customer. |
| `PUT` | `/api/customers/{id}` | `Vehicles` | Update customer. |
| `GET` | `/api/owners` | `OwnerRead` | Previous-owner lookup/list. |
| `POST` | `/api/owners` | `Vehicles` | Create previous owner. |
| `PUT` | `/api/owners/{id}` | `Vehicles` | Update previous owner. |
| `GET` | `/api/purchase-invoices` | `Vehicles` | List purchase invoices. |
| `POST` | `/api/purchase-invoices` | `Vehicles` | Create purchase invoice. |
| `PUT` | `/api/purchase-invoices/{id}` | `Vehicles` | Update purchase invoice. |

## Uploads

Vehicle photos and documents are stored in PostgreSQL blobs with metadata, checksum, uploader, MIME type, and linked vehicle. Repair invoices, payment evidence, and delivery evidence may also be linked to their exact workflow record. Vehicle photos generate cached thumbnails. ASP.NET multipart parsing has a small overhead allowance above the 10 MB document payload ceiling, then endpoint-specific validation enforces the 10 MB document and stricter 5 MB photo limits.

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/vehicles/{id}/photos` | `Vehicles` | Upload vehicle photo, max 5 MB. |
| `GET` | `/api/vehicles/{id}/photos` | `BackOffice` | List photo metadata. |
| `GET` | `/api/vehicles/{id}/photos/{photoId}/content` | `BackOffice` | Download original photo content. |
| `POST` | `/api/vehicles/{id}/documents?category={FileCategory}&repairJobId={id}&paymentRecordId={id}&deliveryScheduleId={id}` | Category-specific role | Upload document, max 10 MB; workflow-record IDs are mutually exclusive. Delivery categories require `deliveryScheduleId`; the server verifies the schedule, route vehicle, and schedule-locked customer before storing the evidence. |
| `GET` | `/api/vehicles/{id}/documents` | Category-specific role | List document metadata visible to the signed-in department. |
| `GET` | `/api/vehicles/{id}/documents/{documentId}/content` | Category-specific role | Download document content visible to the signed-in department. |
| `POST` | `/api/documents/{documentId}/ocr-jobs` | Category-specific role | Start Google Document AI analysis for the authorized uploaded document category, including IC, VOC, invoice, and receipt review. |
| `GET` | `/api/ocr-jobs/{jobId}` | Category-specific role | Read OCR job status, progress, warnings, extracted draft fields, and review decision. |
| `PUT` | `/api/ocr-jobs/{jobId}/review` | Category-specific role | Accept or reject OCR-extracted draft fields with reviewer identity, timestamp, and review notes before applying them to operational records. |
| `GET` | `/api/vehicles/{id}/ocr-jobs` | Category-specific role | List captured OCR data for uploaded vehicle documents visible to the signed-in department. |

OCR runtime:

- IC extraction returns customer name, IC number, and address. VOC extraction returns registration, chassis, engine, make, model, year, and registered-owner suggestions. Invoice and receipt extraction retains the existing finance and supplier fields. Repair-invoice extraction also proposes repair-part and repair-detail values from recognized line items so the reviewer can populate the Repair task form.
- The back-office review drawer shows field confidence. When a suggestion differs from the current customer or vehicle master value, `Keep current value` is the default and the reviewer must explicitly select `Use reviewed OCR value` before the accepted values are applied.

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
| `DeliveryDocument`, `HandoverPhoto`, `SignedHandover`, `Policy`, `RoadTaxReceipt`, `InspectionReport`, `WindscreenPolicy` | `BossAdmin`, `Delivery` |
| `RepairInvoice` | `BossAdmin`, `Repair` |
| `PaymentReceipt`, `PaymentInvoice` | `BossAdmin`, `Finance` |
| `MedicalCertificate` | `BossAdmin`, `HrSalary` |

`VehiclePhoto` is rejected on the document endpoint and must use the photo endpoint.

When supplied, `repairJobId` must reference a repair for the route vehicle and the category must be `RepairInvoice`. `paymentRecordId` must reference a payment record for the route vehicle and the category must be `PaymentReceipt` or `PaymentInvoice`. Every delivery evidence upload must supply `deliveryScheduleId`; it must reference the same route vehicle and the delivery's locked customer. Delivery evidence accepts detected PDF, JPEG, or PNG content, while `HandoverPhoto` also accepts WebP. The server stores the detected MIME type instead of trusting the multipart declaration.

## Workflow Modules

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/loans` | `Loans` | List loan applications. |
| `POST` | `/api/loans` | `Loans` | Create loan workflow record. An active loan establishes or verifies the vehicle's canonical customer. |
| `PUT` | `/api/loans/{id}` | `Loans` | Update loan workflow record. An active loan establishes or verifies the vehicle's canonical customer; `Done` requires the current buyer's full vehicle-scoped document set. |
| `GET` | `/api/loans/{id}/document-check` | `Loans` | Check VOC/AP/status receipt/loan document completeness. |
| `GET` | `/api/deliveries` | `Deliveries` | List delivery schedules. |
| `GET` | `/api/deliveries/workboard` | `Deliveries` | Return delivery rows with their server-derived stage, next action, blocker, Finance clearance, locked customer/PIC, and delivery-owned evidence. |
| `GET` | `/api/deliveries/pic-options` | `Deliveries` | Return active Delivery or Boss/Admin staff choices for PIC assignment. |
| `POST` | `/api/deliveries` | `Deliveries` | Create one active delivery plan for a vehicle with an existing canonical buyer and a valid staff PIC. The server locks the buyer and starts the internal status at `BookingInspection`. |
| `PUT` | `/api/deliveries/{id}` | `Deliveries` | Update an active delivery plan. Vehicle, buyer, and internal status are server-owned; schedule changes require a reschedule reason. |
| `POST` | `/api/deliveries/{id}/correct-buyer` | `BossAdmin` | Lock the vehicle's current canonical buyer onto an active legacy delivery with a required reason. The server rejects another customer or evidence already owned by someone else. |
| `GET` | `/api/deliveries/{id}/activity` | `Deliveries` | List append-only delivery activity with the staff actor and server timestamp. |
| `GET` | `/api/deliveries/{id}/release-readiness` | `Deliveries` | Check the exact delivery checklist, required delivery-owned documents, and release evidence metadata. |
| `POST` | `/api/deliveries/{id}/request-invoice-update` | `Deliveries` | Record a reasoned request for Finance; it does not edit invoice or payment data. |
| `GET` | `/api/deliveries/invoice-update-requests` | `Finance` | List open Delivery invoice-update requests with the vehicle, locked customer, reason, and request time for Finance follow-up. |
| `POST` | `/api/deliveries/{id}/release` | `Deliveries` | Release a ready vehicle after exact evidence and reconciled Finance clearance pass server validation. |
| `POST` | `/api/deliveries/{id}/cancel` | `Deliveries` | Cancel an active delivery plan with a required reason. |
| `GET` | `/api/repairs` | `Repairs` | List repair jobs. |
| `POST` | `/api/repairs` | `Repairs` | Create repair job. |
| `POST` | `/api/repairs/from-receipt` | `Repairs` | After OCR review, atomically create a repair job, supplier invoice, linked repair receipt, and its confirmed receipt items from an unlinked vehicle repair-invoice upload. |
| `PUT` | `/api/repairs/{id}` | `Repairs` | Update repair job. |
| `POST` | `/api/repairs/{id}/approval` | `BossAdmin` | Approve a repair with the authenticated Boss/Admin actor and server timestamp. Repair CRUD cannot supply an approval; material repair changes reset it. |
| `GET` | `/api/repairs/{id}/receipts` | `Repairs` | List confirmed repair receipts and their child items. |
| `POST` | `/api/repairs/{id}/receipts/confirm` | `Repairs` | Confirm one uploaded repair receipt and its reviewed child items for an existing repair job. |
| `GET` | `/api/suppliers` | `Repairs` | Derived supplier master summary from supplier invoices. |
| `GET` | `/api/supplier-invoices` | `Repairs` | List supplier invoices. |
| `GET` | `/api/supplier-invoices/aging` | `Repairs` | Supplier invoice aging view for unmatched, due-soon, overdue, and paid states. |
| `POST` | `/api/supplier-invoices` | `Repairs` | Create supplier invoice. |
| `PUT` | `/api/supplier-invoices/{id}` | `Repairs` | Update supplier invoice. |
| `GET` | `/api/leads` | `Sales` | List public and back-office leads. |
| `PUT` | `/api/leads/{id}` | `Sales` | Update lead/customer link/status. |
| `GET` | `/api/sales/workboard?agentUserId={id}` | `Sales` | Return `Sold this month` and assigned cars with the current process, responsible department, and next action. Sales is server-scoped to the signed-in agent; Boss/Admin may select an agent. |

Lead ownership: the first staff member who moves a lead out of `New` is recorded as the taker. After that, only the same staff member may mutate the lead; Boss/Admin retains the management override.

The delivery workboard presents four active stages: `Plan delivery`, `Prepare car`, `Clear documents`, and `Handover`. `Completed` and `Cancelled` are terminal views. The stage, one next action, and blocker are derived by the server from the saved checklist, exact delivery evidence, expiry dates, customer-notice state, and Finance clearance. Clients do not set the workboard stage directly.

Delivery release-readiness responses include:

- `isReady`: true only when the release checklist, exact delivery-owned documents, and reconciled Finance clearance are all complete.
- `financeCleared`: read-only Boolean showing whether a reconciled payment exists for the delivery vehicle; no Finance amounts or references are returned.
- `missingCategories`: required release document categories still missing.
- `missingEvidence`: required handover-photo or signed-handover uploads still missing.
- `expiredDocuments`: delivery-critical expiry blockers for insurance, road tax, or windscreen insurance.
- `evidence`: one item for each required release document category (`DeliveryDocument`, `InspectionReport`, `HandoverPhoto`, `SignedHandover`, `Policy`, `RoadTaxReceipt`, and `WindscreenPolicy`), with `category`, `isPresent`, and latest uploaded document metadata when present: `documentId`, `fileName`, `mimeType`, `checksum`, `uploadedBy`, and `uploadedAt`.

For delivery release, upload every required file against the exact delivery schedule. Evidence linked only to the vehicle, another buyer, or an older delivery does not satisfy readiness. The files retain checksum, uploader, detected MIME type, timestamp, and protected download behavior; vehicle inventory photos remain separate media.

Only one active delivery plan is allowed per vehicle. A delivery locks the vehicle's canonical buyer when it is created and uses an active staff account for its PIC; ordinary updates cannot reassign the vehicle, buyer, or internal status. Once a non-cancelled delivery exists, ordinary vehicle edits also cannot replace that canonical buyer. Historical rows without a locked buyer are not silently backfilled: Customer 360 may show a conservative read-only association, while the Delivery workboard shows `Buyer not locked` and ordinary update, evidence upload, and release remain blocked. Boss/Admin may lock the vehicle's current canonical buyer through the reasoned correction action while the record is active and no evidence belongs to another buyer. An outstation delivery additionally records its destination address and transport method. Released and cancelled plans reject further changes, and a Sold vehicle or a vehicle with released delivery history cannot start another plan. Invoice updates remain a Finance responsibility, so Delivery can request a change with a reason but cannot edit Finance records. Finance sees open requests in a dedicated queue and explicitly marks each request resolved; unrelated payment edits do not close it. An open invoice-update request keeps the delivery in `Clear documents` and blocks release until Finance resolves it.

Workflow integrity:

- Vehicle intake create/update cannot set `LoanProcessing` or `Sold`; loan and payment workflow updates derive those states on the server.
- A loan can become `Done` only when `StatusReceipt`, `Voc`, `ApDocument`, and `LoanDocument` all belong to its exact vehicle and canonical buyer. The validation response uses `loan_documents_incomplete` and names the missing categories.
- Legacy documents uploaded before buyer ownership was recorded remain available for reference but intentionally do not satisfy loan completion. Staff must re-upload the required documents from the loan checklist after the canonical buyer is linked; the system does not guess or backfill document ownership.
- Delivery creation/update and payment reconciliation require that the vehicle has a `CustomerId` pointing to an existing canonical customer. Cash sales remain supported and do not require a loan.
- Vehicle `Sold` state requires both a reconciled payment and a released delivery. Reconciliation alone leaves the car in its private in-progress state; a later Finance correction that removes reconciliation recalculates that state on the server. A physically released car remains assigned to Finance in Sales My Cars until clearance is restored.
- Loan and payment records keep their vehicle identity after creation. Their workflow changes, Delivery release, and vehicle buyer edits share the same vehicle-scoped serialization so one department cannot overwrite a newer cross-department state.
- Closing a vehicle lead as `Sold` records the responsible Sales agent on the vehicle. `GET /api/sales/workboard` uses that server-owned assignment for the agent's monthly sold count and current-process list.

## Finance

All finance endpoints require the `Finance` policy, except the separately authorized Boss/Admin management-review action.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/payments` | List/create payment records. |
| `GET` | `/api/payments/export` | Export payment CSV after Finance/Admin authorization and audit logging. |
| `PUT` | `/api/payments/{id}` | Update payment workflow/reconciliation. |
| `POST` | `/api/payments/{id}/management-review` | Boss/Admin marks the payment as management-reviewed with an audit record. Payment CRUD cannot self-assert this review, and material finance edits reset it. |
| `POST` | `/api/deliveries/{id}/resolve-invoice-update` | Finance closes an open Delivery invoice-update request after handling it; this records the Finance actor and server timestamp and removes that release blocker. |
| `GET` | `/api/finance-invoices/{invoiceId}/content` | Download a historical finance-invoice PDF; no new finance invoices are generated by this system. |
| `GET` / `POST` | `/api/settlement-reminders` | List/create settlement reminders. |
| `PUT` | `/api/settlement-reminders/{id}` | Update settlement reminder. |
| `GET` / `POST` | `/api/daily-spends` | List/create daily spend rows. |
| `PUT` | `/api/daily-spends/{id}` | Update daily spend row. |
| `GET` / `POST` | `/api/broker-commissions` | List/create broker commission rows. |
| `PUT` | `/api/broker-commissions/{id}` | Update broker commission row. |
| `GET` / `POST` | `/api/debt-recoveries` | List/create debt recovery cases. |
| `PUT` | `/api/debt-recoveries/{id}` | Update debt recovery case. |
| `GET` / `POST` | `/api/payment-vouchers` | List/create payment vouchers. |
| `PUT` | `/api/payment-vouchers/{id}` | Update payment voucher. |

`PaymentRecord.OutstationDeliveryDate` is a compatibility field derived from the active outstation delivery schedule during payment create/update. Client-supplied Finance values do not override the Delivery-owned schedule date.

Payment reconciliation also requires a canonical existing vehicle buyer, the existing receipt/invoice references, finance checklist, and a separate Boss/Admin management review. The review is set only by `POST /api/payments/{id}/management-review`; later material payment edits clear it.

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

Only one handover may exist per payment and only one official receipt may exist per handover. Receipt creation does not reconcile the payment or bypass receipt, invoice-reference, document, or management-review controls; Finance must complete those existing gates separately. Authorized staff download the protected receipt and attach it to a customer email; WhatsApp dispatch is intentionally deferred to the notification engine in FOO-40.

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
| `GET` | `/api/hr/dashboard` | Role-scoped attendance counts for today's QR, manual, open-session, and outstation activity plus pending/upcoming trip counts. |
| `GET` | `/api/hr/availability-calendar` | Role-scoped approved leave and outstation availability; other staff details are reduced to busy status. |
| `GET` | `/api/hr/reminder-policies` | Read attendance reminder switches and lead-hour settings. |
| `PUT` | `/api/hr/reminder-policies/{type}` | HR/Admin update an attendance reminder policy. |
| `GET` | `/api/hr/reminders` | Role-scoped active reminders for pending approvals, upcoming outstation duty, and missing check-out. |
| `POST` | `/api/hr/attendance/qr/challenges` | HR/Admin create a five-minute rotating office QR challenge; the raw token is returned only for display and only its hash is stored. |
| `POST` | `/api/hr/attendance/qr/redeem` | Authenticated staff redeem the office QR for one Check In or Check Out action; each staff member can use a challenge once per action. |
| `POST` | `/api/hr/attendance/outstation/start` | Reserved for the future outstation workflow; currently refuses attendance bypass. |
| `POST` | `/api/hr/attendance/outstation/end` | Reserved for the future outstation workflow; currently refuses attendance bypass. |
| `PUT` | `/api/hr/attendance/{id}` | HR/Admin correction with a required note; records manual verification and audit history. |
| `GET` | `/api/hr/business-trips` | List business trip and urgent outstation requests scoped to self, or all staff for HR/Admin. |
| `POST` | `/api/hr/business-trips` | Submit a business trip or urgent outstation exception request; it remains pending until HR/Admin approval. |
| `PUT` | `/api/hr/business-trips/{id}/decision` | HR/Admin approve or reject a pending business trip request. Approved trips do not consume leave balance. |
| `POST` | `/api/hr/business-trips/{id}/cancel` | Staff cancel their own pending/approved request, or HR/Admin cancel any request. |
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
| `GET` | `/api/dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | `Dashboard` | Boss/Admin operational metrics. `from` and `to` are optional but must be supplied together as an inclusive analytics period. Live stock, loan, collection, settlement, purchase cost, repair cost, and aging metrics remain current; the period scopes sales, actual profit, lead, refurbishment, and aggregate OCR activity analysis. The response preserves `totalProfit` and `estimatedProfit`, and adds `purchaseCost`, `totalSales`, `actualProfit`, `outstandingCollection`, `settlementDueAmount`, `refurbishment`, and `aiDocumentProcessing`. OCR reporting contains aggregate category counts, reviewed outcomes, low-confidence and failed counts, the live pending-review backlog, and current quota capacity only; it never returns document IDs, file names, images, identity data, raw OCR text, or extracted values. |
| `GET` | `/api/dashboard/reminders?type={type}&due={All\|Overdue\|DueToday\|DueSoon\|Upcoming}` | `Dashboard` | Reminder inbox, optionally filtered. `DueSoon` applies only to unpaid Daily Spend due from tomorrow through the next 10 calendar days. |
| `GET` | `/api/priority-actions` | `BackOffice` | Role-scoped operational queue. Returns only items the signed-in user's roles may action: Sales leads, Repair work, Loan follow-up, Delivery preparation, Finance follow-up, and HR leave approvals. Boss/Admin receives the combined management queue. |
| `GET` | `/api/audit-log?actor=&action=&entityName=` | `BossAdmin` | Filterable audit history. |
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
- `DeliveryStage`: `PlanDelivery`, `PrepareCar`, `ClearDocuments`, `Handover`, `Completed`, `Cancelled`
- `PaymentStatus`: `Pending`, `Approved`, `Disbursed`, `Reconciled`
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
- `OcrJobStatus`: `Queued`, `Analyzing`, `NeedsReview`, `Failed`
- `OcrReviewDecision`: `Pending`, `Accepted`, `Rejected`
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
