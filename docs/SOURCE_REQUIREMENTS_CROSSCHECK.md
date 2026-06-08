# YS Heng Source Requirements Crosscheck

This crosscheck maps the two supplied Word documents to the current MVP workspace:

- `C:\Users\User\Downloads\YS_Heng_Complete_Requirement_Analysis_CN.docx`
- `C:\Users\User\Downloads\YSHeng Portal.docx`

It is intended to keep the implementation aligned with the original business vocabulary while the formal API and verification details remain in `docs/API.md`, `docs/IMPLEMENTATION.md`, and `docs/REQUIREMENTS_TRACE.md`.

## Current MVP Coverage

| Source requirement area | MVP handling | Evidence |
| --- | --- | --- |
| Website plus internal portal | Implemented as public front office plus internal back office | `apps/frontoffice`, `apps/backoffice`; `infra/verify-local.ps1` builds and smokes both apps. |
| Upload to website / inventory sync | Implemented | Vehicle intake controls public visibility and `Available` status; public API and front office hide sold/private inventory. |
| Purchase invoice | Implemented | Purchase invoice CRUD, duplicate validation, document category ownership, smoke coverage. |
| Customer details, IC, status receipt | Implemented for MVP | Customer records, status receipt document category, document-check workflow; IC/OCR extraction remains extension scope. |
| Vehicle details, VOC, AP, photo, status | Implemented | Vehicle records include stock owner, status, public photo endpoint, VOC/AP/status receipt uploads, document completeness checks. |
| Available / Loan Processing / Sold | Implemented | Backend enum, public filtering, loan/payment automation, TypeScript contract tests. |
| Price / Purchase / Selling | Implemented | Vehicle purchase/selling values, finance invoice detail fields, dashboard profit metrics. |
| Boss Confirm / Contra range price | Implemented | Vehicle intake fields, edit flow, smoke round trip. |
| Receipt / Invoice | Implemented | Payment receipt/invoice fields, duplicate validation, finance document upload categories. |
| Stock YS Heng / KS | Implemented | Backend enum and public/back-office contract tests. |
| UCD status tracking | Implemented | Vehicle intake/edit field with smoke coverage. |
| Repair part, what to do, checklist, spare part | Implemented | Repair module stores repair part, action text, checklist state, supplier invoices, and costs by car plate. |
| Payment key in, Boss Check, payment status | Implemented | Finance checklist fields, Boss Check, status workflow, payment reminders, reconciliation validation. |
| Outstation pickup allowance, schedule, booking slip | Implemented | Vehicle intake tracks allowance/schedule/booking slip; payment voucher workflow covers allowance follow-up. |
| Loan edit, submit, follow-up, 3-day reminder, LOU, upload document | Implemented | Loan CRUD/status rules, LOU validation, 3-day reminders, loan-owned uploads. |
| Delivery booking inspection, schedule, PIC, notification, inspection, prepare document, report | Implemented | Delivery workflow statuses, PIC/schedule, inspection booking/report references, document readiness, 2-day notice. |
| Polish, tinted, wash, final checklist | Implemented | Delivery preparation checklist and release blocking rules. |
| Insurance, road tax, windscreen insurance | Implemented | Delivery handover references, document categories, readiness validation. |
| Customer invoice detail: sales price, interest/additional charges, NCD, windscreen charges, outstation delivery date | Implemented | Finance payment fields, validation, smoke round trip. |
| Bank prepare document, checklist, invoice generation, payment follow-up, Pending/Approve/Disbursed, AutoCount key-in, nett price | Implemented as MVP manual workflow | Finance module tracks manual checklist and AutoCount key-in state; direct AutoCount integration remains extension scope. |
| Car settlement owner, deadline, amount reminder | Implemented | Owner records, settlement reminders, dashboard reminder inbox. |
| Supplier/refurbishment duplicate invoice, wrong plate, supplier multi-invoice checks, costs by plate, profit deduction | Implemented | Supplier invoice validation, repair costs linked to vehicle, dashboard profit calculation. |
| Broker commission, car plate profit, CP58 | Implemented as MVP tracking | Broker commission records and CP58 required/prepared flags; full CP58 form generation remains extension scope. |
| Daily spend, electric bill, monthly 15th reminder | Implemented | Daily spend records and reminder rules. |
| Salary: working day, leave, MC, attendance, AL/MC control, pay slip | Implemented as next MVP slice | HR/Salary supports working-day pay periods, leave/MC requests and uploads, attendance check-in/out, AL/MC balance control, and payslip generation with daily salary and unpaid-leave deduction. |
| Profit calculation: nett selling price, refurbishment, commission, real-time dashboard | Implemented | Dashboard `totalProfit`/`estimatedProfit`, repair/payment/commission cost impacts. |
| Debt recovery status, balance reminder, follow-up | Implemented with manual reminder workflow | Debt recovery records and dashboard reminders; WhatsApp automation remains extension scope. |
| Dashboard: total stock, total profit, pending loan, outstanding payment, settlement due, top supplier, sales performance, vehicle aging | Implemented | Dashboard summary and smoke/test coverage. |
| AI OCR, loan eligibility prediction, photo optimization, profit prediction, WhatsApp, AutoCount integration | Extension point | Data boundaries and manual states are present; automation integrations are documented outside MVP scope. |

## Verification

The current primary verification command remains:

```powershell
.\infra\verify-local.ps1
```

This crosscheck should be updated whenever the source requirement documents are reinterpreted, the MVP boundary changes, or a source workflow term is promoted from extension point to implemented scope.
