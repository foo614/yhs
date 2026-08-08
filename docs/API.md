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
| `GET` | `/api/public/vehicles/{id}` | Fetch one public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photo` | Return the latest public thumbnail/photo for a public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photos` | List public gallery photo metadata for a public available vehicle. |
| `GET` | `/api/public/vehicles/{id}/photos/{photoId}` | Return one full public gallery photo for a public available vehicle. |
| `POST` | `/api/public/leads` | Create a public lead for a visible available vehicle. |
| `POST` | `/api/public/contact-enquiries` | Create a general website contact enquiry for Sales triage. |

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
| `GET` | `/api/vehicles` | `Vehicles` | Full vehicle records for Boss/Admin and Sales. |
| `POST` | `/api/vehicles` | `Vehicles` | Create vehicle intake, including optional chassis and engine identifiers. |
| `PUT` | `/api/vehicles/{id}` | `Vehicles` | Update vehicle intake, chassis/engine identifiers, and public status. |
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
| `GET` | `/api/purchase-invoices` | `Vehicles` | List purchase invoices. |
| `POST` | `/api/purchase-invoices` | `Vehicles` | Create purchase invoice. |
| `PUT` | `/api/purchase-invoices/{id}` | `Vehicles` | Update purchase invoice. |

## Uploads

Vehicle photos and documents are stored in PostgreSQL blobs with metadata, checksum, uploader, MIME type, and linked vehicle. Repair invoices and payment evidence may also be linked to their exact workflow record. Vehicle photos generate cached thumbnails. ASP.NET multipart parsing has a small overhead allowance above the 10 MB document payload ceiling, then endpoint-specific validation enforces the 10 MB document and stricter 5 MB photo limits.

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/vehicles/{id}/photos` | `Vehicles` | Upload vehicle photo, max 5 MB. |
| `GET` | `/api/vehicles/{id}/photos` | `BackOffice` | List photo metadata. |
| `GET` | `/api/vehicles/{id}/photos/{photoId}/content` | `BackOffice` | Download original photo content. |
| `POST` | `/api/vehicles/{id}/documents?category={FileCategory}&repairJobId={id}&paymentRecordId={id}` | Category-specific role | Upload document, max 10 MB; workflow-record IDs are optional and mutually exclusive. |
| `GET` | `/api/vehicles/{id}/documents` | Category-specific role | List document metadata visible to the signed-in department. |
| `GET` | `/api/vehicles/{id}/documents/{documentId}/content` | Category-specific role | Download document content visible to the signed-in department. |
| `POST` | `/api/documents/{documentId}/ocr-jobs` | Category-specific role | Start Baidu Unlimited-OCR analysis for the authorized uploaded document category, including IC, VOC, invoice, and receipt review. |
| `GET` | `/api/ocr-jobs/{jobId}` | Category-specific role | Read OCR job status, progress, warnings, extracted draft fields, and review decision. |
| `PUT` | `/api/ocr-jobs/{jobId}/review` | Category-specific role | Accept or reject OCR-extracted draft fields with reviewer identity, timestamp, and review notes before applying them to operational records. |
| `GET` | `/api/vehicles/{id}/ocr-jobs` | Category-specific role | List captured OCR data for uploaded vehicle documents visible to the signed-in department. |

OCR runtime:

- IC extraction returns customer name, IC number, and address. VOC extraction returns registration, chassis, engine, make, model, year, and registered-owner suggestions. Invoice and receipt extraction retains the existing finance and supplier fields.
- The back-office review drawer shows field confidence. When a suggestion differs from the current customer or vehicle master value, `Keep current value` is the default and the reviewer must explicitly select `Use reviewed OCR value` before the accepted values are applied.

- The default OCR provider is `BaiduUnlimited`, configured through `Ocr__BaiduUnlimited__Endpoint` with an OpenAI-compatible Baidu Unlimited-OCR/SGLang server, usually `http://127.0.0.1:10000`.
- `Ocr__BaiduUnlimited__Model` defaults to `Unlimited-OCR`; `Ocr__BaiduUnlimited__ImageMode` defaults to `gundam`.
- The current backend adapter sends uploaded image files to the OCR service; PDF conversion must happen before upload or inside a separate OCR gateway.
- `Ocr__Provider=LocalMock` is only for local deterministic fallback or tests.

Document upload ownership:

| Category | Uploader roles |
| --- | --- |
| `PurchaseInvoice`, `Voc`, `IdentityCard`, `ApDocument`, `StatusReceipt` | `BossAdmin`, `Sales` |
| `LoanDocument` | `BossAdmin`, `Loan` |
| `DeliveryDocument`, `Policy`, `RoadTaxReceipt` | `BossAdmin`, `Delivery` |
| `RepairInvoice` | `BossAdmin`, `Repair` |
| `PaymentReceipt`, `PaymentInvoice` | `BossAdmin`, `Finance` |
| `MedicalCertificate` | `BossAdmin`, `HrSalary` |

`VehiclePhoto` is rejected on the document endpoint and must use the photo endpoint.

When supplied, `repairJobId` must reference a repair for the route vehicle and the category must be `RepairInvoice`. `paymentRecordId` must reference a payment record for the route vehicle and the category must be `PaymentReceipt` or `PaymentInvoice`.

## Workflow Modules

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/loans` | `Loans` | List loan applications. |
| `POST` | `/api/loans` | `Loans` | Create loan workflow record. |
| `PUT` | `/api/loans/{id}` | `Loans` | Update loan workflow record. |
| `GET` | `/api/loans/{id}/document-check` | `Loans` | Check VOC/AP/status receipt/loan document completeness. |
| `GET` | `/api/deliveries` | `Deliveries` | List delivery schedules. |
| `POST` | `/api/deliveries` | `Deliveries` | Create delivery workflow record. |
| `PUT` | `/api/deliveries/{id}` | `Deliveries` | Update delivery workflow record. |
| `GET` | `/api/deliveries/{id}/release-readiness` | `Deliveries` | Check delivery checklist, required documents, and release evidence metadata. |
| `GET` | `/api/repairs` | `Repairs` | List repair jobs. |
| `POST` | `/api/repairs` | `Repairs` | Create repair job. |
| `PUT` | `/api/repairs/{id}` | `Repairs` | Update repair job. |
| `GET` | `/api/suppliers` | `Repairs` | Derived supplier master summary from supplier invoices. |
| `GET` | `/api/supplier-invoices` | `Repairs` | List supplier invoices. |
| `GET` | `/api/supplier-invoices/aging` | `Repairs` | Supplier invoice aging view for unmatched, due-soon, overdue, and paid states. |
| `POST` | `/api/supplier-invoices` | `Repairs` | Create supplier invoice. |
| `PUT` | `/api/supplier-invoices/{id}` | `Repairs` | Update supplier invoice. |
| `GET` | `/api/leads` | `Sales` | List public and back-office leads. |
| `PUT` | `/api/leads/{id}` | `Sales` | Update lead/customer link/status. |

Lead status ownership: the first staff member who moves a lead out of `New` is recorded as the taker. After that, only that same staff member can change the lead status.

Delivery release-readiness responses include:

- `isReady`: true only when the release checklist is complete and required release documents are uploaded.
- `missingCategories`: required release document categories still missing.
- `missingEvidence`: release evidence flags still incomplete, such as handover photo, signed handover, customer acknowledgement, or final checklist.
- `expiredDocuments`: delivery-critical expiry blockers for insurance, road tax, or windscreen insurance.
- `evidence`: one item for each required release document category, with `category`, `isPresent`, and latest uploaded document metadata when present: `documentId`, `fileName`, `mimeType`, `checksum`, `uploadedBy`, and `uploadedAt`.

## Finance

All finance endpoints require the `Finance` policy.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/payments` | List/create payment records. |
| `GET` | `/api/payments/export` | Export payment CSV after Finance/Admin authorization and audit logging. |
| `PUT` | `/api/payments/{id}` | Update payment workflow/reconciliation. |
| `GET` | `/api/finance-invoices` | List generated sales invoices with latest AutoCount sync state. |
| `GET` / `POST` | `/api/payments/{paymentId}/invoice` | Fetch or generate the sales invoice for a payment. |
| `GET` | `/api/finance-invoices/{invoiceId}/content` | Download the generated invoice PDF. |
| `GET` / `POST` | `/api/finance-invoices/{invoiceId}/autocount-sync` | List sync jobs or submit/retry AutoCount AOTG sales invoice sync. |
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

Only one handover may exist per payment and only one official receipt may exist per handover. Receipt creation does not reconcile the payment or bypass invoice, document, management-review, or AutoCount controls; Finance must complete those existing gates separately. Authorized staff download the protected receipt and attach it to a customer email; WhatsApp dispatch is intentionally deferred to the notification engine in FOO-40.

## HR And Salary

All HR endpoints require authenticated back-office access. Staff can access their own attendance, leave, MC, balance, payroll profile, pay-period, and payslip records. HR/Salary and Admin users can review and manage all staff HR records.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/hr/staff` | HR/Admin list of existing staff users for HR selectors. |
| `GET` | `/api/hr/attendance` | List attendance records scoped to the current staff user, or all staff for HR/Admin. |
| `POST` | `/api/hr/attendance/check-in` | Create or update today's check-in for the current staff user. |
| `POST` | `/api/hr/attendance/check-out` | Create or update today's check-out for the current staff user. |
| `PUT` | `/api/hr/attendance/{id}` | HR/Admin update attendance status or notes. |
| `GET` | `/api/hr/leave-requests` | List leave and MC requests scoped to the current staff user, or all staff for HR/Admin. |
| `POST` | `/api/hr/leave-requests` | Submit a leave request. |
| `PUT` | `/api/hr/leave-requests/{id}/decision` | HR/Admin approve or reject a leave request. |
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
| `PUT` | `/api/hr/payroll-profiles/{staffUserId}` | HR/Admin create or update base salary, overtime, allowances, and manual deductions. |
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
```

Statutory EPF, SOCSO, EIS, and PCB calculations are excluded from this MVP.

## Dashboard, Audit, And Admin

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard/summary` | `Dashboard` | Boss/Admin operational metrics, including `totalProfit` and backward-compatible `estimatedProfit`. |
| `GET` | `/api/dashboard/reminders?type={type}&due={All\|Overdue\|DueToday\|Upcoming}` | `Dashboard` | Reminder inbox, optionally filtered. |
| `GET` | `/api/audit-log?actor=&action=&entityName=` | `BossAdmin` | Filterable audit history. |
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
- `LoanStatus`: `Draft`, `Pending`, `Approved`, `Rejected`, `Done`
- `DeliveryStatus`: `BookingInspection`, `Scheduled`, `Inspection`, `PreparingDocuments`, `CarPreparation`, `ReadyForRelease`, `Released`
- `PaymentStatus`: `Pending`, `Approved`, `Disbursed`, `Reconciled`
- `PaymentExternalSyncStatus`: `NotSynced`, `Synced`, `Failed`
- `AutoCountSyncStatus`: `Draft`, `Ready`, `Submitted`, `Synced`, `Failed`
- `PaymentVoucherStatus`: `Pending`, `Approved`, `Paid`
- `CashHandoverStatus`: `ReceivedBySales`, `PendingHandover`, `HandedOver`, `Rejected`, `Receipted`
- `DebtRecoveryStatus`: `Open`, `FollowedUp`, `Closed`
- `RepairApprovalStatus`: `Pending`, `Approved`, `Rejected`
- `SupplierInvoiceAgingStatus`: `Unmatched`, `DueSoon`, `Overdue`, `Paid`
- `HrAttendanceStatus`: `Present`, `Late`, `HalfDay`, `Absent`
- `HrLeaveType`: `AnnualLeave`, `MedicalLeave`, `EmergencyLeave`, `UnpaidLeave`
- `HrLeaveStatus`: `Pending`, `Approved`, `Rejected`, `Cancelled`
- `HrPayslipStatus`: `Draft`, `Generated`
- `FileCategory`: `VehiclePhoto`, `PurchaseInvoice`, `Voc`, `IdentityCard`, `ApDocument`, `StatusReceipt`, `LoanDocument`, `DeliveryDocument`, `Policy`, `RoadTaxReceipt`, `RepairInvoice`, `PaymentReceipt`, `PaymentInvoice`, `MedicalCertificate`
- `OcrJobStatus`: `Queued`, `Analyzing`, `NeedsReview`, `Failed`
- `OcrReviewDecision`: `Pending`, `Accepted`, `Rejected`

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
