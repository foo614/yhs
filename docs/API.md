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
| `POST` | `/api/public/leads` | Create a public lead for a visible available vehicle. |

Public lead payload:

```json
{
  "vehicleId": "guid",
  "customerName": "Buyer name",
  "phone": "012-3456789",
  "message": "Optional enquiry"
}
```

## Back-Office Role Policies

All `/api/*` back-office routes require the broad `BackOffice` role policy first. Module policies then narrow access:

| Policy | Roles |
| --- | --- |
| `BossAdmin` | `BossAdmin` |
| `Dashboard` | `BossAdmin` |
| `Vehicles` | `BossAdmin`, `Sales` |
| `VehicleRead` | `BossAdmin`, `Sales`, `Loan`, `Delivery`, `Finance`, `Repair` |
| `CustomerRead` | `BossAdmin`, `Sales`, `Loan`, `Finance` |
| `OwnerRead` | `BossAdmin`, `Sales`, `Finance` |
| `Sales` | `BossAdmin`, `Sales` |
| `Repairs` | `BossAdmin`, `Repair` |
| `Loans` | `BossAdmin`, `Loan` |
| `Deliveries` | `BossAdmin`, `Delivery` |
| `Finance` | `BossAdmin`, `Finance` |
| `HrSalary` | `BossAdmin`, `HrSalary` |

## Vehicle Intake And Contacts

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/vehicles` | `Vehicles` | Full vehicle records for Boss/Admin and Sales. |
| `POST` | `/api/vehicles` | `Vehicles` | Create vehicle intake. |
| `PUT` | `/api/vehicles/{id}` | `Vehicles` | Update vehicle intake and public status. |
| `GET` | `/api/vehicle-lookup` | `VehicleRead` | Plate/make/model/status lookup for workflow selectors. |
| `GET` | `/api/customers` | `CustomerRead` | Customer lookup/list. |
| `POST` | `/api/customers` | `Vehicles` | Create customer. |
| `PUT` | `/api/customers/{id}` | `Vehicles` | Update customer. |
| `GET` | `/api/owners` | `OwnerRead` | Previous-owner lookup/list. |
| `POST` | `/api/owners` | `Vehicles` | Create previous owner. |
| `PUT` | `/api/owners/{id}` | `Vehicles` | Update previous owner. |
| `GET` | `/api/purchase-invoices` | `Vehicles` | List purchase invoices. |
| `POST` | `/api/purchase-invoices` | `Vehicles` | Create purchase invoice. |
| `PUT` | `/api/purchase-invoices/{id}` | `Vehicles` | Update purchase invoice. |

## Uploads

Vehicle photos and documents are stored in PostgreSQL blobs with metadata, checksum, uploader, MIME type, and linked vehicle. Vehicle photos generate cached thumbnails. ASP.NET multipart parsing has a small overhead allowance above the 10 MB document payload ceiling, then endpoint-specific validation enforces the 10 MB document and stricter 5 MB photo limits.

| Method | Path | Policy | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/vehicles/{id}/photos` | `Vehicles` | Upload vehicle photo, max 5 MB. |
| `GET` | `/api/vehicles/{id}/photos` | `BackOffice` | List photo metadata. |
| `GET` | `/api/vehicles/{id}/photos/{photoId}/content` | `BackOffice` | Download original photo content. |
| `POST` | `/api/vehicles/{id}/documents?category={FileCategory}` | Category-specific role | Upload document, max 10 MB. |
| `GET` | `/api/vehicles/{id}/documents` | `BackOffice` | List document metadata. |
| `GET` | `/api/vehicles/{id}/documents/{documentId}/content` | `BackOffice` | Download document content. |
| `POST` | `/api/documents/{documentId}/ocr-jobs` | Category-specific role | Start local OCR analysis for receipt or invoice review. |
| `GET` | `/api/ocr-jobs/{jobId}` | Category-specific role | Read OCR job status, progress, warnings, and extracted draft fields. |

Document upload ownership:

| Category | Uploader roles |
| --- | --- |
| `PurchaseInvoice`, `Voc`, `ApDocument`, `StatusReceipt` | `BossAdmin`, `Sales` |
| `LoanDocument` | `BossAdmin`, `Loan` |
| `DeliveryDocument`, `Policy`, `RoadTaxReceipt` | `BossAdmin`, `Delivery` |
| `RepairInvoice` | `BossAdmin`, `Repair` |
| `PaymentReceipt`, `PaymentInvoice` | `BossAdmin`, `Finance` |
| `MedicalCertificate` | `BossAdmin`, `HrSalary` |

`VehiclePhoto` is rejected on the document endpoint and must use the photo endpoint.

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
| `GET` | `/api/deliveries/{id}/release-readiness` | `Deliveries` | Check delivery checklist and required documents. |
| `GET` | `/api/repairs` | `Repairs` | List repair jobs. |
| `POST` | `/api/repairs` | `Repairs` | Create repair job. |
| `PUT` | `/api/repairs/{id}` | `Repairs` | Update repair job. |
| `GET` | `/api/supplier-invoices` | `Repairs` | List supplier invoices. |
| `POST` | `/api/supplier-invoices` | `Repairs` | Create supplier invoice. |
| `PUT` | `/api/supplier-invoices/{id}` | `Repairs` | Update supplier invoice. |
| `GET` | `/api/leads` | `Sales` | List public and back-office leads. |
| `PUT` | `/api/leads/{id}` | `Sales` | Update lead/customer link/status. |

Lead status ownership: the first staff member who moves a lead out of `New` is recorded as the taker. After that, only that same staff member can change the lead status.

## Finance

All finance endpoints require the `Finance` policy.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/api/payments` | List/create payment records. |
| `PUT` | `/api/payments/{id}` | Update payment workflow/reconciliation. |
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
- `PaymentVoucherStatus`: `Pending`, `Approved`, `Paid`
- `DebtRecoveryStatus`: `Open`, `FollowedUp`, `Closed`
- `HrAttendanceStatus`: `Present`, `Late`, `HalfDay`, `Absent`
- `HrLeaveType`: `AnnualLeave`, `MedicalLeave`, `EmergencyLeave`, `UnpaidLeave`
- `HrLeaveStatus`: `Pending`, `Approved`, `Rejected`, `Cancelled`
- `HrPayslipStatus`: `Draft`, `Generated`
- `FileCategory`: `VehiclePhoto`, `PurchaseInvoice`, `Voc`, `ApDocument`, `StatusReceipt`, `LoanDocument`, `DeliveryDocument`, `Policy`, `RoadTaxReceipt`, `RepairInvoice`, `PaymentReceipt`, `PaymentInvoice`, `MedicalCertificate`
- `OcrJobStatus`: `Queued`, `Analyzing`, `NeedsReview`, `Failed`

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
