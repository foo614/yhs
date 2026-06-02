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

Document upload ownership:

| Category | Uploader roles |
| --- | --- |
| `PurchaseInvoice`, `Voc`, `ApDocument`, `StatusReceipt` | `BossAdmin`, `Sales` |
| `LoanDocument` | `BossAdmin`, `Loan` |
| `DeliveryDocument`, `Policy`, `RoadTaxReceipt` | `BossAdmin`, `Delivery` |
| `RepairInvoice` | `BossAdmin`, `Repair` |
| `PaymentReceipt`, `PaymentInvoice` | `BossAdmin`, `Finance` |

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
- `FileCategory`: `VehiclePhoto`, `PurchaseInvoice`, `Voc`, `ApDocument`, `StatusReceipt`, `LoanDocument`, `DeliveryDocument`, `Policy`, `RoadTaxReceipt`, `RepairInvoice`, `PaymentReceipt`, `PaymentInvoice`

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
