# FOO-264: Delivery workflow alignment

## Approved scope

- Keep Delivery as the editable booking and handover workspace. Fields sourced from Loan, including final selling price and other sale amounts, remain read-only here.
- Remove the duplicate Inspection booking/report and Prepare car checklist steps from the active Delivery flow. Inspection records and files remain owned by the Inspection module; existing Delivery fields and files remain readable for history.
- Keep Delivery-owned document uploads visible in one Delivery file area. Preserve existing files and support manual Insurance fields plus Policy/endorsement/credit-note history. Insurance AI is out of scope. Road tax supports eAuto Yes/No; JPJ receipt evidence and OCR expiry review are required only when eAuto is No or not yet confirmed.
- Remove the two-day customer notice requirement and any corresponding active action. A new booking stages a CompanyNews/AllStaff workflow event; the existing queue expands it into one scheduled Business WhatsApp outbox row per connected staff member, without sending from this change.
- Sort the active workboard by nearest scheduled Delivery date. Released records remain available through history but are omitted from the default workboard after seven days.
- Keep generated Warranty, Hutang tepi, Selling price confirmation, and VDO documents on hold pending samples. Slides 43 and 45 remain on hold.
- Desktop and mobile Delivery pagination default to 10 and allow 10/20/30 without changing the filtered result set.

## Verification

- Focused API business-rule tests cover stage derivation, release gates, document completeness, and seven-day workboard visibility.
- API workflow tests cover booking-created all-staff eligibility, cancellation suppression, road-tax eAuto receipt gating, and PostgreSQL additive-column/idempotency behavior.
- Focused back-office tests cover Delivery stage rendering, nearest-date ordering, legacy Prepare car removal, and synchronized pagination size changes.
