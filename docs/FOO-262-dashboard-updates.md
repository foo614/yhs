# Dashboard operational updates

Scope: slides 1 and 3–5, as authorized with items 2–4. Add recent stock, loan, confirmed-deal and delivery news plus personal loan, missing deal-price, delivery and assigned-task reminders. Reuse saved ownership and activity records. Keep management analytics and finance APIs Boss-only; staff receive a separate allowlisted operational response. Do not change WhatsApp delivery or task completion workflows.

Acceptance: employees can open Dashboard without receiving management metrics, costs, customer details or other employees' personal reminders. News links respect existing module/document permissions. Completed/cancelled records leave the pending list on refresh. Unknown loan handling staff remain labelled Pending assignment / 待分配 rather than inferred as an assignment. Existing department landing pages remain unchanged.

Implementation: a read-only API projector and endpoint, API client contract, shared operational panel, and role-aware Dashboard composition. No new tables, dependencies or document permissions. LOU links only use existing LoanDocument authorization; Broker cannot gain access through this feed.

Verification: extend existing business-rule tests for cross-user reminder isolation and sensitive-data exclusion; existing access tests for staff navigation without finance data. Build API/frontend and inspect populated mobile/tablet/desktop UI. Independent review before release.

Existing audit events identify the last recorded loan handler, not a formal assignment. News reflects saved current records, not a new immutable notification history. Cancelled/released deliveries leave the operational feed. Broker deal-price reminders open Cars I’m Handling with the plate filter.
