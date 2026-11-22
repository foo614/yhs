# Back-office backdrop dismissal audit

Audit date: 22 November 2026. Task: FOO-283 local follow-up after the Insurance release.

Audited **110 dialog entry points across 22 source files**: 51 Ant Design Modals, 2 Pro ModalForms, 28 Drawers, and 29 static/hook confirmations. Two contact modals under a literal false condition are inactive. No separate native/custom dialog implementations or shared data-entry Modal wrapper were found. Shared OCR, calendar, document preview and module-guide shells were included.

Protected **53 editable entry points across 13 source files** using only explicit `mask={{ closable: false }}` props. Existing close/cancel handlers, discard guards, keyboard settings, busy-state close controls and form persistence are unchanged. No global ConfigProvider default was added.

## Installed API and scope

Ant Design 6.7.0 accepts `mask.closable` on Modal and Drawer. Its installed `useMergedMask` defaults ordinary dialogs to closable; legacy `maskClosable` still works but is deprecated. Pro ModalForm forwards its existing `modalProps.maskClosable: false`. Static `ConfirmDialog` defaults mask closing to false, including the Bank rejection and Mark voucher paid dialogs that contain input.

Data-entry includes create/edit forms, editable review/reason fields and draft-bearing drawers. Read-only views, navigation, export selectors, pure confirmations, inline forms and inactive JSX remain unchanged. Mixed detail drawers are protected when they contain an editable draft. Existing safe forms are not rewritten. Future data-entry dialogs should explicitly prevent backdrop dismissal without disabling intentional close/cancel or Escape behavior.

## Exact changed entry points

Names below come from the title expressions, with shared title variables expanded where needed. One payment form has receipt and insurer-payment variants. Delivery secondary actions and payroll review share a dialog entry point across actions.

| Source file | Line | Kind | Dialog title / expression |
| --- | ---: | --- | --- |
| apps/backoffice/src/App.tsx | 1330 | Drawer | My WhatsApp |
| apps/backoffice/src/App.tsx | 3947 | Modal | {creatingSupplierFromReceipt ? "Create supplier from receipt / 从收据建立供应商" : "New Supplier / 新增供应商"} |
| apps/backoffice/src/App.tsx | 4006 | Modal | New Repair / 新增整备 |
| apps/backoffice/src/App.tsx | 4615 | Modal | Record loan rejection / 记录贷款拒绝 |
| apps/backoffice/src/App.tsx | 5276 | Modal | Buyer & loan application / 买家与贷款申请 |
| apps/backoffice/src/App.tsx | 5786 | Modal | Link vehicle / 关联车辆 |
| apps/backoffice/src/App.tsx | 5821 | Modal | Close lead / 结束询问 |
| apps/backoffice/src/App.tsx | 6321 | Drawer | Staff Details / 员工详情 |
| apps/backoffice/src/App.tsx | 6386 | Drawer | Reset Password / 重设密码 |
| apps/backoffice/src/App.tsx | 6439 | Modal | Create Staff / 新增员工 |
| apps/backoffice/src/modules/delivery/DeliveryWorkboardPage.tsx | 844 | Drawer | {selected ? `${selected.plateNumber} · ${stageMeta[selected.stage].label}` : "Delivery"} |
| apps/backoffice/src/modules/delivery/DeliveryWorkboardPage.tsx | 870 | Modal | {secondaryAction === "cancel" ? "Cancel delivery?" : secondaryAction === "invoice" ? "Request Sales Invoice Update" : seconda |
| apps/backoffice/src/modules/delivery/DeliveryWorkboardPage.tsx | 919 | Modal | New delivery / 新交车 |
| apps/backoffice/src/modules/finance/CashCustodyPage.tsx | 358 | Modal | Record Cash Received / 记录现金收款 |
| apps/backoffice/src/modules/finance/CashCustodyPage.tsx | 459 | Modal | Reject Cash Handover |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 1911 | Modal | Prepare sales invoice / 准备销售发票 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2006 | Drawer | Add payment / 新增收款 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2055 | Modal | Reverse reconciled payment |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2065 | Modal | New Bank Collection / 新增收款 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2167 | Drawer | Payment Details / 收款详情 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2261 | Modal | New Broker Commission / 新增经纪人佣金 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2301 | Drawer | Broker Commission Details / 经纪人佣金详情 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2382 | Modal | New Debt Recovery Case / 新增欠款追讨 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2420 | Drawer | Debt Case Details / 欠款追讨详情 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2570 | Modal | New Payment Voucher / 新增付款凭证 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2622 | Drawer | Payment Voucher Details / 付款凭证详情 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2712 | Modal | New Daily Spend / 新增日常支出 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 2744 | Drawer | Daily Spend Details / 日常支出详情 |
| apps/backoffice/src/modules/hr/HrAttendanceWorkflow.tsx | 59 | Modal | Request attendance correction / 申请打卡更正 |
| apps/backoffice/src/modules/hr/HrAttendanceWorkflow.tsx | 72 | Modal | {decision?.approve ? "Approve corrected times? / 批准更正时间？" : "Reject correction / 拒绝更正"} |
| apps/backoffice/src/modules/hr/HrPayrollReview.tsx | 97 | Modal | Monthly statutory amounts / 每月法定扣款 |
| apps/backoffice/src/modules/hr/HrPayrollReview.tsx | 106 | Modal | {review ? actionLabels[review] : "Review payroll"} |
| apps/backoffice/src/modules/hr/HrSalaryPage.tsx | 1467 | Modal | Clock out early? / 提早放工？ |
| apps/backoffice/src/modules/hr/HrSalaryPage.tsx | 1472 | Modal | {previewReviewing ? "Review selected payslips / 核对所选薪资单" : "Select staff / 选择员工"} |
| apps/backoffice/src/modules/hr/HrSalaryPage.tsx | 1537 | Modal | {editingHolidayId ? "Edit Johor holiday / 编辑柔佛假期" : "Add Johor holiday / 新增柔佛假期"} |
| apps/backoffice/src/modules/insurance/InsuranceForms.tsx | 121 | Drawer | Edit insurance case / 编辑保险个案 |
| apps/backoffice/src/modules/insurance/InsuranceForms.tsx | 122 | Modal | New insurance case / 新增保险个案 |
| apps/backoffice/src/modules/insurance/InsuranceForms.tsx | 138 | Modal | Customer receipt / Final actual insurer payment |
| apps/backoffice/src/modules/insurance/InsuranceForms.tsx | 162 | Modal | Import existing listing / 导入旧名单 |
| apps/backoffice/src/modules/repairs/RepairReviewPanel.tsx | 78 | Modal | Record completed payment / 记录已付款 |
| apps/backoffice/src/modules/settings/StaffWhatsAppSettings.tsx | 298 | Drawer | {editing ? `Edit ${descriptions[editing.category].title}` : "Edit message category"} |
| apps/backoffice/src/modules/shared/OcrUploadReview.tsx | 125 | Drawer | Shared editable OCR review |
| apps/backoffice/src/modules/shared/OperationsCalendar.tsx | 210 | Modal | Add calendar task / 新增日历任务 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 2581 | Modal | {loanHandoffVehicle ? `Start Loan / 开始贷款 - ${loanHandoffVehicle.plateNumber}` : "Start Loan / 开始贷款"} |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 2661 | Drawer | {selectedVehicle ? `Vehicle Details / 车辆详情 - ${selectedVehicle.plateNumber}` : "Vehicle Details / 车辆详情"} |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 3239 | Modal | Create Vehicle / 新增车辆 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 3537 | Modal | Check Previous Owner NRIC / 核对原车主身份证 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 3656 | Modal | Generate Purchase Invoice / 生成收车发票 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 3749 | Drawer | Purchase Invoice Details / 收车发票详情 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 3968 | Modal | New Customer / 新增客户 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 4033 | Modal | New Owner / 新增原车主 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 4077 | Drawer | Customer Details / 客户详情 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 4125 | Drawer | Owner Details / 原车主详情 |

## Full source inventory

| Source file | Entry points | Changed | Already protected declarative forms | Static confirmations | Unchanged read-only / action / inactive sites |
| --- | ---: | ---: | ---: | ---: | ---: |
| apps/backoffice/src/App.tsx | 18 | 10 | 0 | 5 | 3 |
| apps/backoffice/src/modules/delivery/DeliveryWorkboardPage.tsx | 4 | 3 | 0 | 1 | 0 |
| apps/backoffice/src/modules/finance/BankSettlementPanel.tsx | 2 | 0 | 2 | 0 | 0 |
| apps/backoffice/src/modules/finance/CashCustodyPage.tsx | 5 | 2 | 0 | 0 | 3 |
| apps/backoffice/src/modules/finance/FinancePage.tsx | 25 | 13 | 0 | 8 | 4 |
| apps/backoffice/src/modules/hr/HrAttendanceWorkflow.tsx | 2 | 2 | 0 | 0 | 0 |
| apps/backoffice/src/modules/hr/HrPayrollReview.tsx | 3 | 2 | 0 | 0 | 1 |
| apps/backoffice/src/modules/hr/HrSalaryPage.tsx | 3 | 3 | 0 | 0 | 0 |
| apps/backoffice/src/modules/inspection/InspectionPage.tsx | 2 | 0 | 1 | 0 | 1 |
| apps/backoffice/src/modules/insurance/InsuranceForms.tsx | 6 | 4 | 0 | 2 | 0 |
| apps/backoffice/src/modules/insurance/InsurancePage.tsx | 5 | 0 | 0 | 1 | 4 |
| apps/backoffice/src/modules/repairs/RepairReviewPanel.tsx | 2 | 1 | 0 | 1 | 0 |
| apps/backoffice/src/modules/settings/StaffWhatsAppConnection.tsx | 3 | 0 | 0 | 3 | 0 |
| apps/backoffice/src/modules/settings/StaffWhatsAppLimitSettings.tsx | 1 | 0 | 0 | 1 | 0 |
| apps/backoffice/src/modules/settings/StaffWhatsAppSettings.tsx | 3 | 1 | 0 | 1 | 1 |
| apps/backoffice/src/modules/settings/VehicleCatalogSettings.tsx | 1 | 0 | 1 | 0 | 0 |
| apps/backoffice/src/modules/settings/WhatsAppSettings.tsx | 2 | 0 | 0 | 2 | 0 |
| apps/backoffice/src/modules/shared/DocumentPreviewDrawer.tsx | 1 | 0 | 0 | 0 | 1 |
| apps/backoffice/src/modules/shared/ModuleGuideExperience.tsx | 1 | 0 | 0 | 0 | 1 |
| apps/backoffice/src/modules/shared/OcrUploadReview.tsx | 1 | 1 | 0 | 0 | 0 |
| apps/backoffice/src/modules/shared/OperationsCalendar.tsx | 2 | 1 | 0 | 0 | 1 |
| apps/backoffice/src/modules/vehicles/VehiclePage.tsx | 18 | 10 | 0 | 4 | 4 |

Already safe declarative forms: new/update bank settlement, full settlement with payment inputs, inspection booking, and vehicle make/model settings. The 29 static/hook calls keep their default backdrop protection. The 24 other unchanged declarative sites are read-only, navigation, pure confirmation, export selection or the two inactive contact modals.

## Reproduction and verification

Before the fix, a real backdrop click on New Insurance Case invoked its existing discard flow. The existing dirty guard prevented immediate loss in that reproduction. A receipt with typed amount RM42 closed immediately on backdrop click and reopened with the default RM1,340.23, demonstrating draft loss.

The responsive Insurance checks now click the actual modal wrapper and assert the typed value and visible-dialog count stay unchanged, so an accidental discard prompt also fails the regression. Explicit cancel still opens the original discard dialog; Keep/Cancel preserves values and Discard closes it. Receipt and listing-import drafts receive the same real-click check. Tests use synthetic local fixtures and do not save real records.

An existing Ant Design static-confirm theme warning from the discard flow remains in diagnostics; only that exact warning is accepted in this scenario. No product warning behavior is changed.

### Results

- Back-office build passed, including TypeScript checking.
- All 564 existing unit tests across 45 files passed.
- Insurance responsive/browser checks passed at 360, 820 and 1440 pixels. Actual backdrop clicks retained case plate, receipt amount and pasted import text; no discard dialog appeared. Explicit Cancel, Escape, discard cancellation and confirmed discard retained their original behavior.
- Desktop synthetic browser checks passed for calendar task creation, Create Vehicle, Payment Voucher creation and editing, Johor holiday creation, and delivery creation. Typed values survived real backdrop clicks; explicit Cancel/Close and existing discard guards worked. HR Escape dismissal remained unchanged. Delivery used an eligible synthetic approved-loan/PIC fixture; no availability gate was bypassed in product code.
- Independent review verified the 13 source files differ from the base only in mask attributes. No callbacks, keyboard properties, global settings, permissions or persistence changed. Final diff check passed.

The nine representative dialog entry points above were browser-tested; the other audited entry points were verified by source and installed-component API review, not individually exercised. Shared OCR review was included in the source audit. The fix remains unstaged, uncommitted and undeployed on `codex/foo-283-protect-form-drafts`.

## Release authorization

On 22 November 2026 the user approved committing, PR review/CI/CodeQL, merging and deploying this complete backdrop-protection fix. Earlier local-only statements record the implementation phase before that approval. The release scope is the 53 mask-property changes, the responsive regression checks and this audit document; no unrelated changes are included.
