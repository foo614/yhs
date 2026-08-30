import type { AppRoutePath } from "./access";

export type ModuleGuideStep = Readonly<{
  title: string;
  description: string;
}>;

export type ModuleGuideSection = Readonly<{
  key: string;
  label: string;
  kind: "tab" | "section" | "detail-tab";
  audience: string;
  purpose: string;
  actions: readonly string[];
  requiredItems: readonly string[];
  completeWhen: string;
  handoff?: string;
  warnings: readonly string[];
}>;

export type ModuleGuideDefinition = Readonly<{
  path: AppRoutePath;
  title: string;
  roleLabel: string;
  summary: string;
  quickSteps: readonly ModuleGuideStep[];
  sections: readonly ModuleGuideSection[];
  completionReminder: string;
}>;

export type ModuleGuideStorage = Pick<Storage, "getItem" | "setItem">;

export const MODULE_GUIDE_TOUR_VERSION = "v2";

const dashboardGuide: ModuleGuideDefinition = {
  path: "/dashboard",
  title: "Dashboard / 管理层分析",
  roleLabel: "Boss/Admin overview / 管理层总览",
  summary: "See operational workload, overdue items, trends, and AI document accuracy across the business.",
  quickSteps: [
    {
      title: "Choose the reporting period / 选择日期范围",
      description: "Start with All time or choose a shorter period when you need to investigate a recent change."
    },
    {
      title: "Open urgent work / 处理待办",
      description: "Use priority actions and warning counts to open the responsible module and source record."
    },
    {
      title: "Read trends with the source / 对照来源记录",
      description: "Use charts to identify a pattern, then verify the vehicle, customer, payment, or workflow record before acting."
    }
  ],
  sections: [
    {
      key: "overview",
      label: "Operations dashboard / 运营看板",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Review current stock, loans, collection, settlement, purchase cost, repair cost, profit, and aging from one management view.",
      actions: ["Start with All time for the complete picture.", "Use a shorter range only to investigate sales, profit, lead, or refurbishment activity.", "Open the relevant metric and verify its source record."],
      requiredItems: ["All time, This month, Last month, Year to date, or a valid custom date range"],
      completeWhen: "The underlying operational record has been checked and the responsible follow-up is clear.",
      handoff: "Open Vehicles, Loans, Repairs, Leads, or the relevant Finance tab.",
      warnings: ["Stock, loan, collection, settlement, and aging are live totals; the date range scopes only sales, profit, lead, and refurbishment analytics."]
    },
    {
      key: "ai-document-processing",
      label: "AI document processing / AI 文件处理",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Monitor OCR usage, corrected-versus-unchanged accuracy, low-confidence scans, failures, staff-check backlog, and quota.",
      actions: ["Review Pending staff check, Need checking, and Failed scans.", "Ask the owning department to open the original OCR-assisted workflow.", "Have staff compare the suggested values with the document, correct differences, and save.", "Use corrected and unchanged totals to assess extraction accuracy."],
      requiredItems: ["Owning module and source document"],
      completeWhen: "The source workflow has been checked and saved, allowing the aggregate reviewed/corrected metrics to update.",
      handoff: "Return the document to the staff member responsible for its Vehicle, Repair, Delivery, or Finance workflow.",
      warnings: ["There is no accept or reject step here.", "The dashboard does not expose document images, filenames, identity data, or extracted text."]
    },
    {
      key: "priority-actions",
      label: "Priority actions / 老板待办",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Work through overdue, due-today, and due-soon operational reminders.",
      actions: ["Process overdue items first.", "Process due-today items next.", "Review Daily Spend items due soon.", "Use Open follow-up to enter the owning workflow.", "Review HR leave approvals and cash collection/payment follow-up separately."],
      requiredItems: ["Responsible source record and accountable owner"],
      completeWhen: "The source record is updated and no longer meets the reminder rule.",
      handoff: "Loans, Delivery, Finance Payments, Settlements, Daily Spend, Debt, Vouchers, or HR.",
      warnings: ["Opening a reminder does not complete it; these are derived indicators."]
    },
    {
      key: "executive-intelligence",
      label: "Executive intelligence / 决策图表",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Review refurbishment cost, confirmed sales, lead volume, monthly profit, and lead follow-up trends.",
      actions: ["Identify an outlier or trend.", "Open Repairs, Vehicles, or Leads from the related action.", "Verify the source records before changing price, spend, or staff follow-up."],
      requiredItems: ["A source-backed trend or exception"],
      completeWhen: "A decision or follow-up owner is recorded against verified source data.",
      handoff: "Repairs, Vehicles, or Leads.",
      warnings: ["Lead volume and a lead outcome of Sold are not confirmed vehicle sales."]
    },
    {
      key: "vehicle-aging",
      label: "Vehicle aging / 库存车龄",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Find aging stock that needs price, publication, or clearance review.",
      actions: ["Open the aging bucket.", "Inspect the vehicle record, readiness, and economics.", "Record the chosen stock action in Vehicles."],
      requiredItems: ["Vehicle record and cost/price context"],
      completeWhen: "An accountable stock action is recorded in Vehicles.",
      handoff: "Vehicles / 收车库存",
      warnings: ["The aging chart itself does not change vehicle status or publication."]
    }
  ],
  completionReminder: "Dashboard totals are indicators. Confirm important decisions against the underlying operational record."
};

const vehicleGuide: ModuleGuideDefinition = {
  path: "/vehicles",
  title: "Vehicles / 收车库存",
  roleLabel: "Sales vehicle intake / 销售收车",
  summary: "Create and maintain the vehicle, customer or owner, purchase details, photos, and readiness handoff.",
  quickSteps: [
    {
      title: "Search before creating / 新增前先搜索",
      description: "Search the registration plate, model, year, and status first so the intended stock record is selected."
    },
    {
      title: "Complete the intake record / 完成收车资料",
      description: "Enter vehicle details, link the correct customer or owner, record TIN and purchase invoice details, and upload supporting files."
    },
    {
      title: "Send the correct handoff / 正确交接",
      description: "Review readiness, then start the loan or next operational step from the linked vehicle record."
    }
  ],
  sections: [
    {
      key: "inventory-list",
      label: "Vehicle Inventory / 车辆库存",
      kind: "section",
      audience: "Sales; Boss/Admin also approves",
      purpose: "Find stock, read readiness, and choose the correct next action.",
      actions: ["Search plate, model, year, or status.", "Review approval, website, invoice, buyer, UCD, leads, and cost indicators.", "Open Details.", "Boss/Admin approves when the record is correct.", "Use Publish, Link Buyer, Start Loan, or Open Loan only when that action matches the sale."],
      requiredItems: ["Correct plate and vehicle record"],
      completeWhen: "Identity, owner, buyer, approval, and website visibility are correct for the current stage.",
      handoff: "Public listing, Repair, or Loan.",
      warnings: ["Chassis is not searchable and is not a uniqueness gate.", "Vehicle status is owned by server workflow rules.", "Public stock must be Approved, Visible, and Available.", "Sold is derived from reconciled payment, not typed here."]
    },
    {
      key: "create-vehicle-identity",
      label: "Create Vehicle: Vehicle / 新增车辆：车辆",
      kind: "section",
      audience: "Sales",
      purpose: "Capture the vehicle's core identity.",
      actions: ["Enter registration plate.", "Add chassis and engine number when available.", "Choose make and model.", "Enter year and review spelling."],
      requiredItems: ["Unique registration plate", "Make", "Model", "Year"],
      completeWhen: "The vehicle identity has been checked against its source evidence.",
      handoff: "Create Vehicle: Stock & pricing.",
      warnings: ["Chassis and engine number are currently optional."]
    },
    {
      key: "create-vehicle-stock",
      label: "Create Vehicle: Stock & pricing / 新增车辆：库存与价格",
      kind: "section",
      audience: "Sales",
      purpose: "Capture acquisition, selling, adjustment, and pickup information.",
      actions: ["Enter purchase and selling prices.", "Review contra, additional payment, refurbishment, commission, and outstation allowance.", "Add pickup date and reference when applicable."],
      requiredItems: ["Selling price greater than zero", "Non-negative monetary values"],
      completeWhen: "Prices, adjustments, and pickup details are reviewed.",
      handoff: "Create Vehicle: Buyer & publication.",
      warnings: ["These values affect operational margin; verify source figures before continuing."]
    },
    {
      key: "create-vehicle-publication",
      label: "Create Vehicle: Buyer & publication / 新增车辆：买家与发布",
      kind: "section",
      audience: "Sales",
      purpose: "Link the original owner, optionally confirm a buyer, and prepare public listing content.",
      actions: ["Select the confirmed buyer only when known.", "Select or register the original owner.", "Add website description and publication details."],
      requiredItems: ["Original owner"],
      completeWhen: "The owner is correct and buyer/public copy are either confirmed or intentionally left incomplete.",
      handoff: "Create Vehicle: Review.",
      warnings: ["A new vehicle starts Available but hidden.", "Sales cannot self-approve the vehicle."]
    },
    {
      key: "create-vehicle-review",
      label: "Create Vehicle: Review / 新增车辆：核对",
      kind: "section",
      audience: "Sales",
      purpose: "Confirm the intake before creating the stock record.",
      actions: ["Review identity and prices.", "Confirm the original owner.", "Confirm the intended buyer or deliberately leave the vehicle unassigned.", "Create the vehicle."],
      requiredItems: ["Reviewed vehicle, price, owner, and buyer decision"],
      completeWhen: "The intended stock record is created once with the correct ownership context.",
      handoff: "Vehicle Inventory.",
      warnings: ["Creation does not approve or publish the vehicle."]
    },
    {
      key: "details-overview",
      label: "Details: Overview / 详情：总览",
      kind: "detail-tab",
      audience: "Sales; Boss/Admin also approves",
      purpose: "Review the vehicle summary and intake checklist.",
      actions: ["Inspect Vehicle Summary.", "Review owner, invoice, documents, photos, OCR, approval, UCD, pickup, and lead checklist items.", "Open the relevant detail tab for every attention item."],
      requiredItems: ["Correct vehicle record"],
      completeWhen: "Every relevant attention item has been resolved or assigned.",
      handoff: "Vehicle details, Linked people & leads, or Documents & photos.",
      warnings: ["Most checklist items are operational guidance and are not hard server gates."]
    },
    {
      key: "details-vehicle",
      label: "Details: Vehicle details / 详情：车辆资料",
      kind: "detail-tab",
      audience: "Sales; Boss/Admin controls approval",
      purpose: "Correct vehicle, price, pickup, and public-listing data.",
      actions: ["Verify website visibility.", "Correct identity, prices, pickup, and public copy.", "Save the vehicle record."],
      requiredItems: ["Valid intake values"],
      completeWhen: "The saved record matches the source documents and intended publication state.",
      handoff: "Approval and website publication.",
      warnings: ["Non-Boss users cannot change approval.", "Unapproved vehicles are forced hidden.", "Buyer changes can be locked by an active loan or Finance V2 record."]
    },
    {
      key: "details-people",
      label: "Details: Linked people & leads / 详情：关联人员与询盘",
      kind: "detail-tab",
      audience: "Sales",
      purpose: "Verify the confirmed buyer, previous owner, and related enquiries.",
      actions: ["Verify the Buyer card and open Customer 360 or edit/create the customer when needed.", "Verify the Previous Owner and edit/create the owner when needed.", "Review linked leads and confirm the canonical buyer."],
      requiredItems: ["Canonical buyer matching any active loan", "Correct original owner"],
      completeWhen: "The correct people are linked and lead history is understood.",
      handoff: "Loan, Delivery, or Finance.",
      warnings: ["Multiple leads may exist, but there is only one confirmed buyer.", "Vehicle Record has no existing-customer selector; choose an existing buyer during intake/Start Loan or create and auto-link here."]
    },
    {
      key: "details-assets",
      label: "Details: Documents & photos / 详情：文件与照片",
      kind: "detail-tab",
      audience: "Sales; document access follows role policy",
      purpose: "Store documents under the correct owner/category and maintain website photos.",
      actions: ["Choose Documents or Website photos.", "For documents, choose Seller, Buyer, or Vehicle ownership and the correct category.", "Confirm the linked person, upload or scan, edit OCR differences, and apply only confirmed values.", "Recheck upload history and ownership."],
      requiredItems: ["Seller: Purchase Invoice, VOC, IC, AP Document", "Buyer: IC, Loan Document, Delivery Document, Policy", "Vehicle: Status Receipt, Road Tax Receipt, Repair Invoice"],
      completeWhen: "Files appear under the correct vehicle, ownership, category, and history.",
      handoff: "Loan, Delivery, or Repair evidence workflow.",
      warnings: ["A person must already be linked to the vehicle before a person-owned upload is accepted.", "OCR is an editable draft, not approval.", "Documents are limited to 10 MB and website photos to 5 MB."]
    },
    {
      key: "purchase-invoice",
      label: "Purchase Invoice / 收车发票",
      kind: "section",
      audience: "Sales enters; Finance confirms accounting",
      purpose: "Create a vehicle-linked, supplier-backed acquisition invoice with classified cost lines.",
      actions: ["Enter manually or scan and review OCR.", "Select vehicle and approved supplier.", "Enter invoice number, date, and optional purchase date/reference.", "Add each classification, description, amount, and capitalisation choice.", "Confirm line total equals invoice total, then save."],
      requiredItems: ["Approved supplier", "Unique invoice number", "Invoice date", "Amount greater than zero", "At least one classified line", "Line total equal to invoice total"],
      completeWhen: "A reviewed Draft purchase invoice is saved.",
      handoff: "Finance accounting confirmation.",
      warnings: ["Finance-confirmed purchase invoices are immutable.", "Tax code is mapped separately by Finance."]
    },
    {
      key: "vehicle-approval-publication",
      label: "Approval & website publication / 审批与网站发布",
      kind: "section",
      audience: "Boss/Admin approves; Sales prepares",
      purpose: "Separate operational approval from public website visibility.",
      actions: ["Boss/Admin reviews price and readiness.", "Approve the vehicle; it remains hidden.", "Publish only when the listing is ready."],
      requiredItems: ["Accurate vehicle and price data", "Approved status", "Available status for public listing"],
      completeWhen: "The vehicle is Approved, Visible, and Available when it should be public.",
      handoff: "Public vehicle website.",
      warnings: ["Approval and publication are separate actions."]
    },
    {
      key: "vehicle-loan-handoff",
      label: "Start Loan / 开始贷款",
      kind: "section",
      audience: "Sales",
      purpose: "Open the linked financing workflow for the confirmed buyer.",
      actions: ["Confirm the buyer.", "Review vehicle, status, and website state.", "Select Confirm & Start Loan."],
      requiredItems: ["Linked existing customer as confirmed buyer"],
      completeWhen: "A Pending loan is created or the existing active loan opens.",
      handoff: "Loan / 贷款",
      warnings: ["The vehicle becomes Loan Processing and private.", "An existing active loan opens instead of creating another."]
    }
  ],
  completionReminder: "Check identity, ownership, price, classification, and uploaded evidence before treating the intake as complete."
};

const repairGuide: ModuleGuideDefinition = {
  path: "/repairs",
  title: "Repair / 整备",
  roleLabel: "Repair operations / 整备作业",
  summary: "Control approved suppliers, repair work, supplier invoices, supporting evidence, cost, and completion.",
  quickSteps: [
    {
      title: "Choose vehicle and supplier / 选择车辆与供应商",
      description: "Use the correct car plate and approved supplier master; create a supplier draft when details are missing."
    },
    {
      title: "Record work and cost / 记录工作与费用",
      description: "Describe the repair part and work, enter the receipt or invoice reference and actual amount, and upload the final evidence."
    },
    {
      title: "Verify before completion / 完成前核对",
      description: "Check the invoice plate, checklist, actual repair result, total cost, and any required Boss/Admin approval."
    }
  ],
  sections: [
    {
      key: "supplier-master",
      label: "Supplier Master / 供应商资料",
      kind: "section",
      audience: "Repair creates; Finance/Boss approves",
      purpose: "Maintain a proper supplier identity before repair purchasing.",
      actions: ["Search before creating another supplier.", "Select New Supplier.", "Enter company, registration number, TIN, address, phone, contact, and optional AutoCount creditor code.", "Create the Draft and wait for Finance/Boss approval."],
      requiredItems: ["Company", "Address", "Phone"],
      completeWhen: "The supplier is Approved and available for purchasing.",
      handoff: "New Repair or purchase accounting.",
      warnings: ["The creator cannot approve their own supplier.", "Approved suppliers are immutable.", "Leave AutoCount creditor code blank when AutoCount should auto-create it."]
    },
    {
      key: "repair-list",
      label: "Supplier & Refurbishment / 供应商与整备",
      kind: "section",
      audience: "Repair; Boss/Admin also approves",
      purpose: "Review repair work, supplier invoices, checklist status, approval, and final cost.",
      actions: ["Review metrics and the repair list.", "Open Details for the correct task.", "Boss/Admin approves when the threshold requires it.", "Use Mark Done only after work, invoice, and final cost are verified."],
      requiredItems: ["Correct plate", "Repair task", "Actual cost"],
      completeWhen: "Checklist and evidence are complete and threshold approval is retained.",
      handoff: "Vehicle cost and Finance follow-up.",
      warnings: ["RM1,000 or more requires approval before checklist completion.", "Below RM1,000 is treated as final without Boss approval."]
    },
    {
      key: "create-repair-receipt",
      label: "New Repair: From receipt / 新增整备：从收据建立",
      kind: "section",
      audience: "Repair",
      purpose: "Create a repair and supporting supplier records from a reviewed receipt.",
      actions: ["Select vehicle and approved supplier.", "Scan the receipt.", "Review supplier, reference, printed plate, amount, and every extracted item.", "Fill missing item descriptions.", "Enter Repair Part and What To Do separately.", "Create the repair."],
      requiredItems: ["Reviewed receipt draft", "Approved supplier", "Repair Part", "What To Do"],
      completeWhen: "The repair, supplier invoice, linked receipt, and confirmed receipt items are created together.",
      handoff: "Repair Details.",
      warnings: ["OCR receipt items do not replace the operational repair instructions."]
    },
    {
      key: "create-repair-manual",
      label: "New Repair: Enter manually / 新增整备：手动建立",
      kind: "section",
      audience: "Repair",
      purpose: "Create a repair and supplier invoice without OCR.",
      actions: ["Select vehicle and approved supplier.", "Enter invoice reference, date, printed plate, amount, due date, and paid date.", "Enter Repair Part and What To Do.", "Save the repair."],
      requiredItems: ["Approved supplier", "Invoice number", "Amount greater than zero", "Repair task"],
      completeWhen: "The repair and supplier invoice are saved.",
      handoff: "Approval and Repair Details.",
      warnings: ["Supplier plus invoice number must be unique.", "A printed plate must match the selected vehicle.", "Required approval is a separate action."]
    },
    {
      key: "repair-details-summary",
      label: "Repair Details / 整备详情",
      kind: "section",
      audience: "Repair; Boss/Admin also approves",
      purpose: "Verify the source task, amount, checklist, approval evidence, and instructions.",
      actions: ["Confirm plate, repair part, work description, and cost.", "Review checklist and approval actor/time.", "Boss/Admin approves when applicable."],
      requiredItems: ["Correct scope and final cost"],
      completeWhen: "The repair scope and cost are correct.",
      handoff: "Repair Record or Repair Documents.",
      warnings: ["Approval should follow review of the actual scope and amount."]
    },
    {
      key: "repair-record",
      label: "Repair Record / 整备资料",
      kind: "detail-tab",
      audience: "Repair",
      purpose: "Maintain the work record and completion checklist.",
      actions: ["Maintain vehicle, repair part, What To Do, cost, responsible person/workshop, start date, expected completion, and checklist.", "Save changes or confirm Mark Done when ready."],
      requiredItems: ["What To Do", "Non-negative cost", "Expected date not before start date"],
      completeWhen: "Actual work, cost, and checklist are complete.",
      handoff: "Repair Documents and completion.",
      warnings: ["Changing vehicle, part, work description, or cost resets approval."]
    },
    {
      key: "repair-documents",
      label: "Repair Documents / 整备文件",
      kind: "detail-tab",
      audience: "Repair",
      purpose: "Attach final supplier evidence, review OCR, and confirm receipt items.",
      actions: ["Upload the Repair Invoice.", "Review OCR plate, supplier, invoice, and amount.", "Correct every item description and amount.", "Apply confirmed values.", "Check upload history and Confirmed receipt items."],
      requiredItems: ["Operationally final invoice", "Reviewed receipt-item descriptions and amounts"],
      completeWhen: "Final evidence and confirmed receipt items are retained against the repair.",
      handoff: "Vehicle final cost and Finance accounts-payable follow-up.",
      warnings: ["Missing Repair Invoice is not currently a server completion gate; staff must verify it manually before Mark Done."]
    },
    {
      key: "repair-approval-completion",
      label: "Approval & completion / 审批与完成",
      kind: "section",
      audience: "Boss/Admin approves; Repair completes",
      purpose: "Approve threshold repairs and close verified physical work.",
      actions: ["Boss/Admin reviews plate, scope, and cost.", "Approve the repair.", "Repair verifies physical work and final invoice.", "Select Mark Done and confirm."],
      requiredItems: ["Approval when cost is RM1,000 or more", "Completed work", "Final cost and invoice checked"],
      completeWhen: "The checklist is marked done with any required approval retained.",
      handoff: "Vehicle margin and Finance accounts payable.",
      warnings: ["Approver identity and time are server-derived.", "There is no visible Reject, Cancel, Reopen, or reversal workflow."]
    }
  ],
  completionReminder: "Do not complete a repair from an estimate alone; retain the final supplier evidence and actual amount."
};

const loanGuide: ModuleGuideDefinition = {
  path: "/loans",
  title: "Loan / 贷款",
  roleLabel: "Loan processing / 贷款处理",
  summary: "Follow each linked customer and vehicle through the supported status, required documents, LOU, and completion workflow.",
  quickSteps: [
    {
      title: "Open the linked application / 打开关联申请",
      description: "Start from the vehicle handoff where possible and confirm the selected customer and car plate."
    },
    {
      title: "Maintain status and documents / 更新状态与文件",
      description: "Maintain the supported loan status and LOU fields, follow the 3-day reminder, and upload every required document."
    },
    {
      title: "Complete the LOU handoff / 完成 LOU 交接",
      description: "Update LOU approval and completion only when the supported status, LOU fields, and required document evidence support it."
    }
  ],
  sections: [
    {
      key: "loan-list",
      label: "Loan Workflow / 贷款流程",
      kind: "section",
      audience: "Loan and Boss/Admin",
      purpose: "Find an application and review status, LOU, documents, and follow-up reminders.",
      actions: ["Filter by plate, customer, phone, status, or document completeness.", "Review Submitted date and the 3-day follow-up indicator.", "Open Details.", "Use the displayed next action only after checking evidence."],
      requiredItems: ["Correct vehicle", "Correct confirmed customer"],
      completeWhen: "The current status and document state are understood and the next action is owned.",
      handoff: "Loan Details.",
      warnings: ["The current loan record has no bank, loan amount, application reference, bank outcome, rejection reason, cancellation, or reopen fields."]
    },
    {
      key: "loan-status-flow",
      label: "Status & LOU workflow / 状态与 LOU 流程",
      kind: "section",
      audience: "Loan and Boss/Admin",
      purpose: "Move the loan through supported states without bypassing LOU or document checks.",
      actions: ["Submit Draft to Pending.", "Approve Pending to set Approved and LOU Approved.", "From Approved, use Mark Done only after every required document is complete.", "Treat Rejected and Done as review-only terminal states in the current UI."],
      requiredItems: ["Submitted date for active states", "LOU Approved for Approved or Done", "LOU Done and all documents for Done"],
      completeWhen: "Status is valid and Done only after the LOU and document requirements are satisfied.",
      handoff: "Delivery and Finance.",
      warnings: ["The same Loan user can currently approve and complete; there is no independent checker.", "There is no reopen or cancel action in the UI."]
    },
    {
      key: "loan-details",
      label: "Loan Details / 贷款详情",
      kind: "section",
      audience: "Loan and Boss/Admin",
      purpose: "Verify the canonical customer/vehicle, status, Submitted date, LOU state, and missing documents.",
      actions: ["Confirm car plate and customer.", "Confirm status and Submitted date.", "Review LOU Approved and LOU Done.", "Inspect every missing-document tag.", "Perform the offered workflow action."],
      requiredItems: ["Existing vehicle and customer", "Loan customer matching the vehicle's confirmed buyer"],
      completeWhen: "The record contains no customer, vehicle, status, date, or LOU contradiction.",
      handoff: "Loan Documents.",
      warnings: ["A different customer cannot replace the confirmed buyer while active workflow locks apply."]
    },
    {
      key: "loan-documents",
      label: "Loan Documents / 贷款文件",
      kind: "section",
      audience: "Loan uploads Loan Document; Sales supplies shared vehicle files; Boss/Admin may upload all",
      purpose: "Complete the four-document checklist for the current vehicle and buyer.",
      actions: ["Review missing items.", "Upload the Loan Document.", "Request Sales-owned VOC, AP Document, and Status Receipt through Vehicles.", "Recheck completeness.", "Mark Done only when the checklist is Complete."],
      requiredItems: ["VOC", "AP Document", "Status Receipt", "Loan Document", "Every file linked to the same vehicle and current buyer"],
      completeWhen: "The API reports the loan document checklist Complete.",
      handoff: "Status Done, then Delivery and Finance.",
      warnings: ["Loan role can upload Loan Document only; Boss/Admin can upload all four.", "A file for another buyer or vehicle never satisfies this loan."]
    },
    {
      key: "manual-loan",
      label: "Manual Loan Record / 手动贷款记录",
      kind: "section",
      audience: "Boss/Admin exception only",
      purpose: "Capture or correct an exceptional legacy loan record.",
      actions: ["Select the exact vehicle and confirmed customer.", "Choose Draft, Pending, Approved, or Rejected.", "Enter Submitted date for active states.", "Set LOU fields consistently.", "Create the record."],
      requiredItems: ["Consistent customer, vehicle, state, date, and LOU values"],
      completeWhen: "The exception record appears in the list with a valid state.",
      handoff: "Loan Workflow list.",
      warnings: ["Normal sales start from Vehicle Details.", "The API does not enforce one active loan for the same vehicle/customer.", "Manual creation cannot bypass Done document validation."]
    },
    {
      key: "loan-completion-handoff",
      label: "Completion & handoff / 完成与交接",
      kind: "section",
      audience: "Loan and Boss/Admin",
      purpose: "Confirm a financed sale is ready for downstream delivery and finance work.",
      actions: ["Confirm canonical buyer.", "Confirm Submitted date.", "Confirm LOU Approved and LOU Done.", "Confirm all four documents.", "Set Done and notify Delivery/Finance."],
      requiredItems: ["Canonical buyer", "Submitted date", "LOU Approved", "LOU Done", "Complete four-document checklist"],
      completeWhen: "The loan is Done with every gate satisfied.",
      handoff: "Financed sale to Delivery and Finance; cash sale may skip Loan.",
      warnings: ["Done remains an active loan state and the vehicle stays Loan Processing/private until payment reconciliation derives Sold.", "Rejected and Done have no reopen action."]
    }
  ],
  completionReminder: "A loan is not Done while a required document or LOU step is still missing."
};

const deliveryGuide: ModuleGuideDefinition = {
  path: "/delivery",
  title: "Delivery / 出车",
  roleLabel: "Vehicle delivery / 车辆交付",
  summary: "Prepare insurance and road-tax accounting, schedule the handover, finish evidence checks, notify the customer, and release safely.",
  quickSteps: [
    {
      title: "Add accounting details / 添加会计资料",
      description: "Record insurance or road-tax provider, amount, invoice date, and the correct classification before Finance reviews it."
    },
    {
      title: "Prepare the delivery / 准备出车",
      description: "Schedule the vehicle, assign the PIC, complete coverage and inspection details, and upload the required documents."
    },
    {
      title: "Notify, check, then release / 通知、核对、放车",
      description: "Notify the customer, finish the final checklist, and release only when the screen shows that all gates are ready."
    }
  ],
  sections: [
    {
      key: "delivery-accounting",
      label: "Insurance & Road-tax Accounting / 保险与路税资料",
      kind: "section",
      audience: "Delivery enters; Finance confirms",
      purpose: "Record insurance and road-tax details for Finance review and AutoCount classification 006.",
      actions: ["Select the delivery/plate.", "Choose Insurance or Road tax classification 006.", "Enter provider, invoice date, policy/receipt/invoice reference, amount, and paid-on-behalf flag.", "Save as Draft for Finance review."],
      requiredItems: ["Delivery", "Type", "Provider", "Invoice date", "Amount greater than zero"],
      completeWhen: "The correct Draft is saved and Finance later confirms it.",
      handoff: "Finance > Payment Voucher for accounting review.",
      warnings: ["Delivery records the source facts; Finance confirms the accounting treatment.", "Finance-confirmed charges are immutable."]
    },
    {
      key: "delivery-workflow",
      label: "Delivery Workflow / 出车流程",
      kind: "section",
      audience: "Delivery",
      purpose: "Schedule a confirmed-buyer vehicle and move it through inspection, preparation, release, or cancellation.",
      actions: ["Search or filter the correct delivery.", "Create only after the vehicle has a confirmed buyer.", "Assign PIC, schedule, delivery type/address/transport, and inspection references.", "Progress Booking Inspection, Scheduled, Inspection, Preparing Documents, Car Preparation, and Ready for Release in order.", "Use Release only after readiness is complete, or Cancel with a reason."],
      requiredItems: ["Confirmed buyer", "PIC", "Scheduled date", "Outstation address and transport when applicable", "Cancellation reason when cancelled"],
      completeWhen: "The record reaches Released with every gate satisfied, or Cancelled with a reason.",
      handoff: "Finance close after successful release.",
      warnings: ["Released and Cancelled are terminal in the current flow.", "Do not skip staged evidence and readiness checks."]
    },
    {
      key: "delivery-record",
      label: "Delivery Record / 出车记录",
      kind: "detail-tab",
      audience: "Delivery",
      purpose: "Maintain schedule, PIC, transport, inspection, coverage references, expiry dates, and preparation state.",
      actions: ["Open Details for the correct plate.", "Verify buyer, PIC, schedule, address, and transport.", "Maintain inspection booking/report, insurance, road tax, and windscreen references and expiry dates.", "Record reschedule or rework reason when relevant.", "Save the updated record."],
      requiredItems: ["PIC", "Schedule date", "Inspection report reference when inspection is done", "Coverage expiry dates current on delivery date"],
      completeWhen: "The saved record reflects the current physical and document-preparation state.",
      handoff: "Delivery Documents and Final Checklist.",
      warnings: ["A handled checkbox is not enough when the matching reference or current expiry is required."]
    },
    {
      key: "delivery-documents",
      label: "Delivery Documents / 出车文件",
      kind: "detail-tab",
      audience: "Delivery",
      purpose: "Attach all release evidence to the correct vehicle and buyer.",
      actions: ["Open Delivery Documents.", "Upload each document under the correct category.", "Review upload history and ownership.", "Replace or correct the source upload when evidence is wrong."],
      requiredItems: ["Delivery Document", "Handover Photo", "Signed Handover", "Policy", "Road Tax Receipt"],
      completeWhen: "All five categories are present for the current delivery vehicle and buyer.",
      handoff: "Final Checklist and release readiness.",
      warnings: ["Uploads may be added during preparation, but all five are required before release.", "Correct the source upload; Customer 360 is read-only."]
    },
    {
      key: "final-checklist",
      label: "Final Checklist / 最终检查",
      kind: "detail-tab",
      audience: "Delivery",
      purpose: "Confirm inspection, preparation, notification, coverage, expiry, and handover evidence before release.",
      actions: ["Complete inspection and its report reference.", "Confirm documents prepared, polish, tint, and wash.", "Confirm insurance, road tax, and windscreen coverage with current expiry dates.", "Send the 2-day notice and customer notification.", "Confirm handover photo, signed handover, customer acknowledgement, and final checklist.", "Mark Ready, then Release with confirmation."],
      requiredItems: ["Inspection and report", "Documents prepared", "Polish, tint, and wash", "Insurance, road tax, and windscreen handled with current expiry", "2-day notice", "All five release documents", "Handover/customer/final confirmations"],
      completeWhen: "The readiness panel shows no blocking reason and the delivery is Released.",
      handoff: "Finance final close and Customer 360 history.",
      warnings: ["Do not bypass a blocked release.", "Opening or saving the checklist is not completion until the readiness and document gates pass."]
    }
  ],
  completionReminder: "Do not bypass a blocked release. Fix missing, expired, or inconsistent evidence in the source record first."
};

const financeManagementGuide: ModuleGuideDefinition = {
  path: "/finance",
  title: "Finance & Collection / 财务收款",
  roleLabel: "Finance control / 财务管控",
  summary: "Prepare invoices, record and reconcile collections, manage vouchers and costs, review handovers, and export an AutoCount review workbook.",
  quickSteps: [
    {
      title: "Prepare and issue invoices / 准备与开具发票",
      description: "Confirm the vehicle, customer, sales agent, item lines, paid-on-behalf amounts, and any price adjustment approval."
    },
    {
      title: "Record then reconcile / 记录后再对账",
      description: "Add the payment method, date, amount, reference, and evidence; a different authorized staff member should reconcile it."
    },
    {
      title: "Control payments and exports / 管理付款与导出",
      description: "Complete vouchers and cash handovers with evidence, then export the selected date range and review every row before manual AutoCount import."
    }
  ],
  sections: [
    {
      key: "payments",
      label: "Invoices & Collections / 发票与收款",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Prepare the sale invoice, record non-cash collections, reconcile evidence, and export reviewed AutoCount workbooks.",
      actions: ["Confirm the vehicle's buyer and active sales agent.", "Prepare the invoice with vehicle, insurance, road tax, and other paid-on-behalf lines.", "When nett price differs from the calculated total, obtain approval from another Boss/Admin.", "Add each non-cash partial collection with method, amount, date, and reference.", "For bank financing, progress Pending to Approved to Disbursed.", "Attach evidence to the exact collection.", "Have a different Finance user reconcile it.", "Boss/Admin reverses only a genuine error.", "Choose a date range and export the AutoCount .xlsx.", "Before manual import, inspect every row's status and remarks, resolve review-only or draft rows, and keep TaxCode blank until Finance confirms the tax mapping."],
      requiredItems: ["Confirmed buyer", "Active sales agent", "Invoice line values", "Approval for price variance", "Collection method, amount, date, reference, and evidence", "Disbursed bank financing before reconciliation"],
      completeWhen: "The invoice is issued, all collections are independently reconciled, and the receivable balance is Paid.",
      handoff: "Reviewed AutoCount workbook for manual import; customer history appears in Customer 360.",
      warnings: ["Cash is handled through Cash Handover, not added as a normal collection.", "There is one receivable per buyer-linked vehicle.", "A requester cannot approve their own variance and a recorder cannot reconcile their own collection.", "The workbook may include draft, pending, unpaid, or unconfirmed review-only rows with warning remarks; export does not make them posting-ready.", "AutoCount export is a mapping/import aid, not a direct integration, and TaxCode remains blank until Finance confirms the tax mapping."]
    },
    {
      key: "settlements",
      label: "Settlement / 结算",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Track money owed to the previous owner and its payment deadline.",
      actions: ["Select the correct vehicle and owner settlement.", "Enter or verify amount and deadline.", "Follow up due and overdue items.", "Mark paid only after the actual settlement has occurred."],
      requiredItems: ["Vehicle", "Previous owner liability", "Amount", "Deadline"],
      completeWhen: "The settlement is marked paid with the amount and deadline correctly recorded.",
      handoff: "Vehicle economics and management dashboard.",
      warnings: ["The current settlement workflow does not enforce payment evidence; staff must verify it operationally."]
    },
    {
      key: "commissions",
      label: "Broker Commission / 经纪佣金",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Track vehicle-linked broker commission and CP58 reference information.",
      actions: ["Choose the correct vehicle.", "Enter broker, amount, paid state, and CP58 reference.", "Check the commission against the approved sale arrangement.", "Mark paid only after payment is verified."],
      requiredItems: ["Vehicle", "Broker", "Amount", "CP58 reference when applicable"],
      completeWhen: "The correct commission record reflects its actual paid state.",
      handoff: "HR/Finance tax reporting and vehicle margin review.",
      warnings: ["The current workflow has no enforced evidence upload or separate checker gate."]
    },
    {
      key: "debt",
      label: "Debt Recovery / 欠款追讨",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Track an outstanding customer debt through Open, Followed Up, and Closed.",
      actions: ["Verify the canonical customer manually.", "Link the correct vehicle when applicable.", "Record amount, owner, and follow-up notes.", "Move Open to Followed Up after contact.", "Close only after the debt outcome is resolved."],
      requiredItems: ["Verified customer identity", "Amount", "Responsible follow-up owner"],
      completeWhen: "The case is Closed with the actual outcome reflected in the record.",
      handoff: "Customer 360 and management priority follow-up.",
      warnings: ["Customer matching is not a substitute for staff identity verification."]
    },
    {
      key: "vouchers",
      label: "Payment Voucher / 付款凭证",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Use four nested workflows: approve supplier masters, confirm purchase-invoice accounting, confirm delivery accounting, and control outgoing payment vouchers.",
      actions: ["Supplier Master approval: review the Draft legal/contact/TIN and AutoCount creditor code, then a Finance/Boss user other than the creator approves it.", "Purchase Invoice accounting: review supplier, vehicle, invoice date/number, classified lines, capitalisation, and total before confirming; confirmation makes it immutable.", "Delivery accounting: review classification 006 insurance/road-tax provider, invoice date, reference, amount, and paid-on-behalf flag before confirming; confirmation makes it immutable.", "Outgoing voucher: maker enters payee, vehicle, purpose, amount, issued date, payment method, source account, reference, conditional cheque number, bank charge/account, and notes.", "A different approver approves the voucher.", "A different payer records Paid with payment evidence and paid date."],
      requiredItems: ["Supplier approval: complete supplier master", "Purchase accounting: approved supplier, reconciled classified lines, amount and invoice date", "Delivery accounting: classification 006, provider, invoice date, amount, and source reference", "Voucher: payee, purpose, amount, issued date, payment method and account", "Cheque number when payment method is cheque", "Bank-charge account when bank charge is entered", "Payment evidence for Paid"],
      completeWhen: "Each nested review is confirmed by the correct role and an outgoing voucher reaches Paid only after separate approval and payment evidence.",
      handoff: "Confirmed records are posting candidates and paid vouchers remain as disbursement evidence; the workbook may still include review-only rows that Finance must exclude or resolve.",
      warnings: ["Do not approve a supplier you created.", "Do not confirm accounting until source facts and totals match.", "Voucher maker, approver, and payer must be different users.", "Cheque and bank-charge fields are conditional and must match the payment method."]
    },
    {
      key: "daily",
      label: "Daily Spend / 日常支出",
      kind: "tab",
      audience: "Finance and Boss/Admin",
      purpose: "Track ordinary operational spending and due dates outside a vehicle-specific sale collection.",
      actions: ["Enter a clear description, amount, and due date.", "Review due-soon and overdue reminders.", "Mark paid only after confirming the actual payment."],
      requiredItems: ["Description", "Amount", "Due date"],
      completeWhen: "The spend record matches the actual payment state.",
      handoff: "Management dashboard due-spend follow-up.",
      warnings: ["The current Daily Spend workflow does not enforce supporting payment evidence."]
    },
    {
      key: "cash-custody",
      label: "Cash Handover / Official Receipts",
      kind: "tab",
      audience: "Sales records custody; Finance confirms",
      purpose: "Transfer physical customer cash from Sales custody to Finance and issue the official receipt.",
      actions: ["Sales records the cash received against the correct payment and requests handover.", "Finance counts the physical cash and records the handover.", "Finance accepts a match or rejects a mismatch with a useful reason.", "After acceptance, Finance issues the official receipt.", "Sales follows the register until Receipted or corrects a Rejected handover."],
      requiredItems: ["Correct payment", "Actual cash amount", "Custody note", "Physical cash confirmation"],
      completeWhen: "Finance accepts the physical handover and the official receipt is issued.",
      handoff: "Customer 360 official receipts and Finance collection record.",
      warnings: ["Cash custody is separate from accounting reconciliation.", "This flow is for supported legacy/cash records only and allows one handover per payment.", "The Sales recorder cannot issue their own official receipt."]
    }
  ],
  completionReminder: "Keep maker and checker separate. Never mark a collection, voucher, or cash handover complete without matching evidence."
};

const financeSalesGuide: ModuleGuideDefinition = {
  path: "/finance",
  title: "Cash Custody / 现金交接",
  roleLabel: "Sales cash custody / 销售现金保管",
  summary: "Record cash received from a customer and hand physical custody to Finance without performing accounting reconciliation.",
  quickSteps: [
    {
      title: "Record cash received / 记录现金收款",
      description: "Choose the correct payment, enter the actual cash amount, and add a useful note while the receipt is fresh."
    },
    {
      title: "Request handover / 请求交接",
      description: "Keep the cash secure and request handover so Finance can confirm the physical amount."
    },
    {
      title: "Track the custody result / 跟进交接结果",
      description: "Follow the register until Finance accepts the handover and issues the official receipt, or correct a rejected mismatch."
    }
  ],
  sections: [
    {
      key: "cash-custody",
      label: "Cash Handover / Official Receipts",
      kind: "tab",
      audience: "Sales cash custody",
      purpose: "Record physical cash received and request its handover to Finance without performing accounting reconciliation.",
      actions: ["Select the correct payment.", "Enter the actual cash amount and a useful note.", "Keep the cash secure and request handover.", "Track the register until Finance accepts and issues the official receipt, or correct a rejected mismatch."],
      requiredItems: ["Correct payment", "Actual cash amount", "Custody note", "Physical cash ready for Finance"],
      completeWhen: "Finance has accepted the physical handover and issued the official receipt.",
      handoff: "Finance confirms, receipts, and performs any separate accounting work.",
      warnings: ["Sales cannot access the other six Finance tabs.", "This is physical custody, not reconciliation.", "Only one handover is allowed per payment, and Sales cannot issue its own official receipt."]
    }
  ],
  completionReminder: "Sales records custody only. Finance must confirm the physical handover before an official receipt is issued."
};

const customerGuide: ModuleGuideDefinition = {
  path: "/customer-360",
  title: "Customer 360 / 客户全景",
  roleLabel: "Authorized customer view / 授权客户视图",
  summary: "Review one customer’s linked identity, vehicle, enquiry, loan, delivery, finance, and document history according to your access.",
  quickSteps: [
    {
      title: "Choose the customer / 选择客户",
      description: "Use the customer selector and stable ID to avoid opening another person with a similar name."
    },
    {
      title: "Review linked history / 查看关联记录",
      description: "Check only the sections visible to your role and note any missing document reminders."
    },
    {
      title: "Correct the source record / 返回来源修改",
      description: "Use the source link to update the responsible module; Customer 360 itself is a consolidated read-only view."
    }
  ],
  sections: [
    {
      key: "customer-selector",
      label: "Customer selector / 选择客户",
      kind: "section",
      audience: "Authorized staff according to role",
      purpose: "Open the correct live customer profile without copying or merging source records.",
      actions: ["Search by the available customer option label.", "Choose the intended customer.", "Confirm the stable Customer ID before reviewing private details."],
      requiredItems: ["Correct customer selection and Customer ID"],
      completeWhen: "The intended live profile is loaded.",
      handoff: "Review only the role-visible sections below.",
      warnings: ["Similar names can belong to different people.", "Customer 360 is contextual and read-only."]
    },
    {
      key: "contact-identity",
      label: "Contact and identity / 联系与身份",
      kind: "section",
      audience: "Authorized CustomerRead roles",
      purpose: "Review canonical contact, identity, TIN, address, and notes.",
      actions: ["Check Customer ID, name, and phone.", "Review IC, TIN, email, address, and notes only as required for the job.", "Open the responsible customer source flow to correct an error."],
      requiredItems: ["Correct customer identity"],
      completeWhen: "The identity needed for the current workflow has been verified.",
      handoff: "Vehicles/Customers source record for corrections.",
      warnings: ["Do not edit or copy private identity data from this consolidated view."]
    },
    {
      key: "vehicles-purchase",
      label: "Vehicles and purchase history / 车辆与购车历史",
      kind: "section",
      audience: "Authorized vehicle/customer roles",
      purpose: "Review vehicles linked to the customer and their purchase/sale context.",
      actions: ["Confirm the plate and relationship.", "Review the shown vehicle status and purchase history.", "Use the source link to open the vehicle record."],
      requiredItems: ["Correct customer-vehicle link"],
      completeWhen: "The intended vehicle relationship is confirmed.",
      handoff: "Vehicles / 收车库存",
      warnings: ["Correct ownership, buyer, or price in Vehicles, not here."]
    },
    {
      key: "loans",
      label: "Loans / 贷款",
      kind: "section",
      audience: "Visible only to roles with Loan access",
      purpose: "Review the customer's linked loan status, LOU, and document state.",
      actions: ["Confirm the linked plate and current loan status.", "Review LOU and document completeness.", "Open the Loan record for any action or correction."],
      requiredItems: ["Role permission and matching customer/vehicle loan"],
      completeWhen: "The current loan state and next owner are understood.",
      handoff: "Loan / 贷款",
      warnings: ["This section is hidden when the signed-in role cannot view loans."]
    },
    {
      key: "delivery-coverage",
      label: "Delivery and coverage / 交车与保障",
      kind: "section",
      audience: "Visible only to roles with Delivery access",
      purpose: "Review linked delivery schedule, release, and coverage information.",
      actions: ["Confirm the delivery and vehicle.", "Review status, schedule, insurance, road tax, and coverage references shown.", "Open Delivery to correct or progress the record."],
      requiredItems: ["Role permission and matching delivery"],
      completeWhen: "The delivery/coverage state has been verified against its source.",
      handoff: "Delivery / 出车",
      warnings: ["This section is role-redacted and cannot be edited here."]
    },
    {
      key: "payments-invoices-receipts",
      label: "Payments, invoices, and receipts / 收款、发票与收据",
      kind: "section",
      audience: "Visible only to Finance-authorized roles",
      purpose: "Review linked collection status, protected invoices, and official receipts.",
      actions: ["Review Payments and balance state.", "Review invoice number, date, amount, and protected PDF.", "Review official receipt number, amount, issue time, and protected PDF.", "Open Finance for any correction or workflow action."],
      requiredItems: ["Finance permission and matching customer receivable"],
      completeWhen: "The displayed finance history agrees with the source record and evidence.",
      handoff: "Finance & Collection / 财务收款",
      warnings: ["Downloads are protected.", "This section is hidden from roles without Finance access."]
    },
    {
      key: "authorized-uploads",
      label: "Authorized uploads / 已授权文件",
      kind: "section",
      audience: "Visible only when the role may view the linked documents",
      purpose: "Review role-authorized customer/vehicle documents and protected downloads.",
      actions: ["Confirm category, file, uploader, and upload time.", "Download only when needed for the current job.", "Return to the owning Vehicle, Loan, Delivery, or Repair workflow to correct an upload."],
      requiredItems: ["Role permission and correct linked document"],
      completeWhen: "The relevant evidence is verified against the source workflow.",
      handoff: "Owning document workflow.",
      warnings: ["Documents are role-redacted and private.", "Do not upload or relabel files from Customer 360."]
    },
    {
      key: "public-enquiries",
      label: "Public enquiries / 公开询问",
      kind: "section",
      audience: "Visible only to roles with Leads access",
      purpose: "Review public enquiry status, message, source, and received time linked to this customer.",
      actions: ["Review status and source.", "Confirm the enquiry belongs to this customer.", "Open the Lead record for ownership, contact, or closure."],
      requiredItems: ["Leads permission and matching enquiry"],
      completeWhen: "The enquiry has the correct owner and next/final outcome in Leads.",
      handoff: "Leads / 客户询问",
      warnings: ["A lead outcome of Sold is not proof that vehicle sale, payment, or delivery is complete."]
    },
    {
      key: "missing-documents",
      label: "Missing linked documents / 缺少关联文件",
      kind: "section",
      audience: "Authorized staff; contents follow role visibility",
      purpose: "Identify role-visible evidence still missing from linked workflows.",
      actions: ["Read each missing category and linked vehicle.", "Open the owning module.", "Upload the document under the correct vehicle, person, and category.", "Return and refresh the profile."],
      requiredItems: ["Correct source module, vehicle, owner, and document category"],
      completeWhen: "The reminder reports all role-visible document requirements present.",
      handoff: "Vehicle, Loan, Delivery, or Repair documents.",
      warnings: ["A hidden role-restricted section is not proof that no document exists or is missing."]
    }
  ],
  completionReminder: "Treat customer information as private and open only the record required for the current job."
};

const customerDeliveryGuide: ModuleGuideDefinition = {
  ...customerGuide,
  roleLabel: "Delivery customer view / 出车客户查看",
  summary: "Review the customer name, phone, vehicle, delivery, and role-authorized evidence needed for handover; private identity fields remain redacted.",
  sections: customerGuide.sections.map((section) => section.key === "contact-identity"
    ? {
        ...section,
        audience: "Delivery: name and phone only",
        purpose: "Confirm the customer name and phone needed for the delivery handover.",
        actions: ["Check Customer ID, name, and phone.", "Use Delivery to correct delivery-specific contact or handover details.", "Ask an authorized CustomerRead role to verify any identity field required outside Delivery."],
        requiredItems: ["Correct customer name, phone, and Customer ID"],
        completeWhen: "The name and phone required for the delivery handover have been verified.",
        handoff: "Delivery / 出车, or an authorized CustomerRead role for private identity verification.",
        warnings: ["Delivery cannot see IC, TIN, email, address, or notes in Customer 360.", "Do not ask staff to copy private identity data into delivery notes."]
      }
    : section)
};

const leadsGuide: ModuleGuideDefinition = {
  path: "/leads",
  title: "Leads / 客户询问",
  roleLabel: "Sales follow-up / 销售跟进",
  summary: "Prioritize customer enquiries, take ownership, contact the customer, and close each case with a clear outcome.",
  quickSteps: [
    {
      title: "Find urgent demand / 找出优先询问",
      description: "Use status, customer-link, and Close ASAP sorting to identify new or competing leads for available cars."
    },
    {
      title: "Take and contact the lead / 接手并联系客户",
      description: "Take ownership, create or link the customer record when needed, and update the lead after first contact."
    },
    {
      title: "Close with an outcome / 记录结果并结案",
      description: "Choose Sold, Lost, or Invalid with a useful reason, or release the lead if another salesperson should continue."
    }
  ],
  sections: [
    {
      key: "close-asap",
      label: "Hot-car demand / 热门车辆需求",
      kind: "section",
      audience: "Sales and Boss/Admin",
      purpose: "Prioritize open demand for available public vehicles, especially cars with multiple active leads.",
      actions: ["Review Hot cars, Open leads, and Multi-lead cars.", "Keep Close ASAP first for daily triage.", "Switch to Newest first when reviewing recent arrivals."],
      requiredItems: ["Public vehicle enquiry: customer name, phone, and approved public Available vehicle", "General contact enquiry: customer name, phone, and message"],
      completeWhen: "Every urgent lead has an owner and next action.",
      handoff: "Lead ownership and contact workflow.",
      warnings: ["Demand indicators prioritize work; they do not reserve or sell a vehicle."]
    },
    {
      key: "filters-and-groups",
      label: "Filters and grouped vehicle demand / 筛选与车辆询问分组",
      kind: "section",
      audience: "Sales and Boss/Admin",
      purpose: "Find New, Contacted, Closed, linked, or unlinked leads and review demand by vehicle.",
      actions: ["Filter by Status.", "Use Needs Customer for unlinked enquiries.", "Expand a vehicle group to inspect customer, phone, message, source, owner, and status.", "Reset stale filters before a different investigation."],
      requiredItems: ["Intended status/link filter and vehicle group"],
      completeWhen: "No relevant lead is hidden by stale filters.",
      handoff: "Take, release, contact, or close the selected lead.",
      warnings: ["Several active leads may legitimately exist for one vehicle."]
    },
    {
      key: "ownership",
      label: "Take or release a lead / 接手或释放询问",
      kind: "section",
      audience: "Sales and Boss/Admin",
      purpose: "Give one salesperson ownership of status changes and link/create the customer.",
      actions: ["Select Take Lead.", "Review the customer matched by normalized phone or the new basic customer created from name, phone, and enquiry notes.", "Confirm the lead becomes Contacted and shows the current owner.", "Use Release Lead only when another salesperson should continue."],
      requiredItems: ["Authenticated staff", "Verified customer name and phone"],
      completeWhen: "The lead is Contacted and shows the correct Taken by owner, or has been deliberately released.",
      handoff: "Complete missing customer IC, TIN, and address before Loan, Delivery, or Finance.",
      warnings: ["Another salesperson cannot change an assigned lead's status.", "Phone matching is the current reuse rule; confirm the matched customer is truly the same person."]
    },
    {
      key: "close-case",
      label: "Close with real outcome / 按真实结果结案",
      kind: "section",
      audience: "Assigned Sales owner",
      purpose: "Close a contacted enquiry with an accurate outcome.",
      actions: ["Contact the customer first.", "Choose Sold, Lost, or Invalid.", "Save Close Case."],
      requiredItems: ["Assigned lead", "Actual closure outcome"],
      completeWhen: "Status is Closed and the closure outcome is saved.",
      handoff: "A genuine sale continues through confirmed buyer, Vehicle, Delivery, and Finance workflows.",
      warnings: ["Sold closes the enquiry only; it does not sell the vehicle or prove delivery/payment completion."]
    }
  ],
  completionReminder: "Do not leave contacted leads without an owner, follow-up, release, or final outcome."
};

const auditGuide: ModuleGuideDefinition = {
  path: "/audit-log",
  title: "Audit Log / 操作记录",
  roleLabel: "Boss/Admin trace / 管理层追踪",
  summary: "Trace who changed an operational record, what event occurred, and when it happened.",
  quickSteps: [
    {
      title: "Narrow the search / 缩小搜索范围",
      description: "Filter by Actor, Action, and Entity so unrelated activity does not hide the event you need."
    },
    {
      title: "Read the event context / 查看事件内容",
      description: "Confirm the time, actor, action, entity, and entity ID against the operational record."
    },
    {
      title: "Follow up in the source / 返回来源处理",
      description: "Use the log as evidence, then correct or investigate the responsible module rather than editing audit history."
    }
  ],
  sections: [
    {
      key: "search",
      label: "Narrow the event search / 缩小事件搜索",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Reduce the event list to the actor, action, or entity being investigated.",
      actions: ["Filter by Actor when investigating a person.", "Filter by Action for an event such as vehicle.updated.", "Filter by Entity for a record type such as Vehicle.", "Reset before beginning another investigation."],
      requiredItems: ["Known actor, action, or entity clue"],
      completeWhen: "The list is narrow enough to identify the relevant event.",
      handoff: "Read the event and open its source module.",
      warnings: ["There is currently no date filter."]
    },
    {
      key: "records",
      label: "Read the event / 查看事件",
      kind: "section",
      audience: "Boss/Admin",
      purpose: "Confirm event time, actor, action, entity, and entity ID.",
      actions: ["Match Entity ID to the source record.", "Verify the current record and supporting evidence.", "Escalate or correct the issue in the source module."],
      requiredItems: ["Matching entity ID and source record"],
      completeWhen: "The source record and responsible actor/action have been reconciled.",
      handoff: "The operational module that owns the record.",
      warnings: ["Audit history is read-only.", "It does not expose before/after values.", "The API returns only the newest 200 matching events."]
    }
  ],
  completionReminder: "Audit records explain activity; they do not replace checking the current source record and supporting evidence."
};

const hrSelfServiceSections: readonly ModuleGuideSection[] = [
  {
    key: "today-attendance",
    label: "Today Attendance / 今日打卡",
    kind: "section",
    audience: "All staff",
    purpose: "Record the current workday from an approved office network.",
    actions: ["Check In at shift start.", "Check Out at shift end.", "Report a missing or wrong entry to HR."],
    requiredItems: ["Authenticated staff identity", "Active approved office network"],
    completeWhen: "Today's row shows both timestamps and the office-network verification label.",
    handoff: "HR for a correction that staff cannot make.",
    warnings: ["Duplicate check-in, checkout without an open session, and off-network attendance are server-rejected."]
  },
  {
    key: "attendance",
    label: "Attendance / 打卡记录",
    kind: "tab",
    audience: "Staff self-service: own records only",
    purpose: "Review personal attendance history and identify differences.",
    actions: ["Filter your own records by date or status.", "Compare the shown times with your workday.", "Report a difference to HR with the exact date."],
    requiredItems: ["Your own attendance date and record"],
    completeWhen: "Your attendance history is understood or a precise correction request has been raised.",
    handoff: "HR/Payroll for manual correction.",
    warnings: ["Ordinary staff cannot edit attendance records directly."]
  },
  {
    key: "leave",
    label: "Leave / MC",
    kind: "tab",
    audience: "Staff self-service: own requests",
    purpose: "Submit leave and view the decision on personal requests.",
    actions: ["Choose leave type, dates, and AM/PM sessions.", "Verify the automatically calculated weekdays.", "Add a reason when useful.", "For Medical Leave, optionally upload a PDF/image MC now or later, maximum 10 MB.", "Submit and track Pending, Approved, or Rejected."],
    requiredItems: ["Leave type", "Start/end dates", "AM/PM sessions", "Positive calculated days"],
    completeWhen: "The request is submitted with a visible status and the MC is attached when operationally expected.",
    handoff: "HR/Boss decides; approved leave updates the balance.",
    warnings: ["Reason and MC are currently optional at submission.", "The current UI has no Cancel action.", "Johor public holidays are reference text, not persisted records."]
  },
  {
    key: "balances",
    label: "AL/MC Control",
    kind: "tab",
    audience: "Staff self-service: own balances and history",
    purpose: "Review personal annual-leave and medical-leave balances and adjustment history.",
    actions: ["Review current AL and MC totals.", "Check approved leave deductions and manual adjustments.", "Raise a difference with HR using the exact transaction."],
    requiredItems: ["Your own balance and adjustment history"],
    completeWhen: "The displayed balance is understood or a specific discrepancy has been reported.",
    handoff: "HR/Payroll for a reasoned adjustment.",
    warnings: ["Staff cannot change balances directly."]
  },
  {
    key: "payroll",
    label: "Pay Slip / 薪资单",
    kind: "tab",
    audience: "Staff self-service: own payslips",
    purpose: "Review personal generated payslips and pay components.",
    actions: ["Choose the relevant pay period.", "Review gross pay, allowances, deductions, overtime inputs, and net pay.", "Report a difference to HR before relying on the figure."],
    requiredItems: ["Correct staff identity and pay period"],
    completeWhen: "The generated payslip amounts have been reviewed.",
    handoff: "HR/Payroll for correction or regeneration.",
    warnings: ["There is no separate payslip approval or publish stage."]
  }
];

const hrManagementSections: readonly ModuleGuideSection[] = [
  {
    key: "today-attendance",
    label: "Today Attendance / 今日打卡",
    kind: "section",
    audience: "HR Payroll and Boss/Admin",
    purpose: "Monitor current-day attendance while staff record their own check-in/out.",
    actions: ["Review today's present/missing records.", "Confirm office-network verification.", "Investigate exceptions in Attendance."],
    requiredItems: ["Authenticated staff and approved network for each genuine check-in"],
    completeWhen: "Current exceptions are understood and assigned for correction.",
    handoff: "Attendance / 打卡记录.",
    warnings: ["Today Attendance is monitoring; corrections are made in Attendance with a note."]
  },
  {
    key: "attendance",
    label: "Attendance / 打卡记录",
    kind: "tab",
    audience: "HR Payroll and Boss/Admin",
    purpose: "Review all attendance and record auditable manual corrections.",
    actions: ["Find the exact staff/date record.", "Choose the corrected status.", "Enter the mandatory correction note.", "Save and verify Manual correction appears."],
    requiredItems: ["Exact staff/date record", "Corrected status", "Correction note"],
    completeWhen: "The row shows Manual correction and the intended status.",
    handoff: "Payroll period review.",
    warnings: ["Correction replaces office verification metadata and is audited."]
  },
  {
    key: "leave",
    label: "Leave / MC",
    kind: "tab",
    audience: "HR Payroll and Boss/Admin",
    purpose: "Submit for staff when needed, review evidence, and decide another staff member's request.",
    actions: ["Verify leave type, dates, sessions, and calculated weekdays.", "Review the reason and any optional MC.", "Approve or reject consistently.", "Confirm approved leave updates balance."],
    requiredItems: ["Leave type", "Start/end dates", "AM/PM sessions", "Positive calculated days", "A request belonging to another staff member when deciding"],
    completeWhen: "The request is Pending, Approved, or Rejected and the resulting balance is correct.",
    handoff: "AL/MC Control and Boss Staff Calendar where applicable.",
    warnings: ["A manager cannot approve their own request.", "MC is optional at creation and may be uploaded later.", "The current UI has no Cancel action."]
  },
  {
    key: "balances",
    label: "AL/MC Control",
    kind: "tab",
    audience: "HR Payroll and Boss/Admin",
    purpose: "Maintain role policies, apply default balances, and record transparent manual adjustments.",
    actions: ["Maintain role leave policies.", "Apply a default role balance to the correct staff member.", "Choose increase or decrease and enter at least 0.5 day.", "Record a mandatory reason.", "Verify the resulting AL/MC total and history."],
    requiredItems: ["Staff", "Leave type", "Increase/decrease", "At least 0.5 day", "Reason"],
    completeWhen: "The new balance and immutable adjustment history agree.",
    handoff: "Leave decision and payroll review.",
    warnings: ["Do not overwrite a balance to hide a prior error; use a reasoned adjustment."]
  },
  {
    key: "payroll",
    label: "Pay Slip / 薪资单",
    kind: "tab",
    audience: "HR Payroll and Boss/Admin",
    purpose: "Maintain payroll profiles and periods, generate payslips, and review amounts.",
    actions: ["Save the correct monthly/hourly payroll profile, salary/rate, allowances, deductions, and manually maintained overtime inputs.", "Create the pay period.", "Adjust working days for public holidays.", "Verify attendance and approved unpaid leave.", "Generate payslips for the selected period.", "Review net pay and components."],
    requiredItems: ["Payroll profile", "Pay period month/start/end", "Reviewed working days", "Attendance", "Approved unpaid leave"],
    completeWhen: "One Generated payslip per staff/profile exists for the correct period and amounts have been checked.",
    handoff: "Staff self-service payslip view.",
    warnings: ["There is no separate payroll approval or publish gate.", "Regenerating the same period updates the existing staff payslip.", "Break and overtime adjustments are not derived automatically from attendance."]
  }
];

const hrBossSections: readonly ModuleGuideSection[] = [
  hrManagementSections[0],
  {
    key: "staff-calendar",
    label: "Staff Calendar / 员工日历",
    kind: "tab",
    audience: "Boss/Admin only",
    purpose: "Plan staffing coverage using unavailable dates from approved leave.",
    actions: ["Change the month.", "Review staff unavailable dates.", "Plan operational coverage for affected dates."],
    requiredItems: ["Approved leave and selected calendar month"],
    completeWhen: "Operational coverage is planned for affected dates.",
    handoff: "Department staffing plan.",
    warnings: ["This is availability only; it does not expose leave reasons or medical details."]
  },
  {
    key: "office-network",
    label: "Office Network / 办公室网络",
    kind: "tab",
    audience: "Boss/Admin only",
    purpose: "Maintain the CIDR ranges allowed for attendance check-in/out.",
    actions: ["Enter a verified office label and CIDR.", "Activate the network.", "Verify staff can check in from that network.", "Disable obsolete ranges."],
    requiredItems: ["Verified office label", "Correct CIDR"],
    completeWhen: "Only current office networks remain active and attendance works from them.",
    handoff: "Today Attendance.",
    warnings: ["An incorrect CIDR can block legitimate attendance or permit an unintended network."]
  },
  ...hrManagementSections.slice(1)
];

const hrSelfServiceGuide: ModuleGuideDefinition = {
  path: "/hr-salary",
  title: "My Attendance / Leave / 我的考勤与请假",
  roleLabel: "Staff self-service / 员工自助",
  summary: "Record your attendance, submit leave and medical evidence, and view your own balance and payslips.",
  quickSteps: [
    {
      title: "Record attendance / 记录考勤",
      description: "Check in and out from the approved office network and report a missing or incorrect record promptly."
    },
    {
      title: "Submit leave correctly / 正确提交请假",
      description: "Choose the leave type, dates, and sessions; add a reason and optionally attach an MC now or later."
    },
    {
      title: "Check your records / 查看个人记录",
      description: "Review your leave balance, request status, and available payslips; raise differences with HR."
    }
  ],
  sections: hrSelfServiceSections,
  completionReminder: "This view is for your own employment records. Contact HR for corrections you cannot make yourself."
};

const hrManagementGuide: ModuleGuideDefinition = {
  path: "/hr-salary",
  title: "HR Payroll / 人事薪资",
  roleLabel: "HR management / 人事管理",
  summary: "Manage attendance, leave, balances, policies, payroll profiles, pay periods, and staff payslips.",
  quickSteps: [
    {
      title: "Review attendance / 核对考勤",
      description: "Monitor today’s records and use reasoned manual corrections for the exact staff/date record."
    },
    {
      title: "Process leave and balances / 处理请假与余额",
      description: "Review evidence and dates, decide requests consistently, and use adjustments with a clear reason."
    },
    {
      title: "Prepare payroll / 准备薪资",
      description: "Verify payroll profiles, working days, attendance, and unpaid leave before generating the pay-period payslips."
    }
  ],
  sections: hrManagementSections,
  completionReminder: "Attendance and salary data are sensitive. Verify the staff member and pay period before saving or generating."
};

const hrBossGuide: ModuleGuideDefinition = {
  path: "/hr-salary",
  title: "HR Payroll / 人事薪资",
  roleLabel: "Boss/Admin HR management / 管理层人事管理",
  summary: "Manage attendance, leave, balances, payroll, staff availability, and approved office networks.",
  quickSteps: [
    {
      title: "Review staffing and attendance / 查看人员与考勤",
      description: "Use Today Attendance, Staff Calendar, and Attendance to find coverage needs and correct exact records."
    },
    {
      title: "Control leave and access / 管理请假与网络",
      description: "Decide other staff requests, maintain transparent balances, and keep only verified office networks active."
    },
    {
      title: "Generate checked payslips / 生成已核对薪资单",
      description: "Verify profiles, periods, working days, attendance, and unpaid leave before generating payslips."
    }
  ],
  sections: hrBossSections,
  completionReminder: "HR data and office-network rules are sensitive. Verify the staff member, period, and CIDR before saving."
};

const adminGuide: ModuleGuideDefinition = {
  path: "/admin",
  title: "Settings / 系统设置",
  roleLabel: "Boss/Admin configuration / 管理层设置",
  summary: "Use the system flow reference and maintain staff access, AI limits, showroom QR, vehicle catalogue, and role visibility.",
  quickSteps: [
    {
      title: "Review the system flow / 查看系统流程",
      description: "Use the standard department handoff map before changing users, roles, or operational ownership."
    },
    {
      title: "Maintain controlled access / 管理权限",
      description: "Create or disable staff accounts and assign only the department roles needed for their work."
    },
    {
      title: "Configure shared references / 设置共用资料",
      description: "Manage AI limits, QR enquiry, make and model values, and review role or audit information carefully."
    }
  ],
  sections: [
    {
      key: "flow",
      label: "System Flow / 系统流程",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Use the six-stage department map as a reference before assigning operational ownership.",
      actions: ["Review Lead, Vehicle Intake, Refurbishment, Loan, Delivery, and Finance Close.", "Compare the displayed ownership with the staff member's actual duties.", "Change roles in Staff Users when needed."],
      requiredItems: ["Known department responsibilities"],
      completeWhen: "Each staff role matches the work they are responsible for.",
      handoff: "Staff Users / 员工账号.",
      warnings: ["System Flow is a reference and does not itself enforce workflow gates."]
    },
    {
      key: "users",
      label: "Staff Users / 员工账号",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Create, correct, disable, and assign least-necessary access to staff accounts.",
      actions: ["Search and filter existing staff.", "Create a user with display name, unique email, initial password, and role.", "Open Details to correct display name or roles.", "Confirm role changes.", "Reset a password only for an authorized support case.", "Disable departed or inactive staff."],
      requiredItems: ["Display name", "Unique email", "Initial password of at least eight characters", "At least one valid department role"],
      completeWhen: "Account status and role tags match intended access.",
      handoff: "Staff signs in and verifies only their assigned modules/data are visible.",
      warnings: ["Role changes and password resets take effect immediately.", "At least one role is mandatory.", "The current admin cannot disable their own active session."]
    },
    {
      key: "ai-usage",
      label: "AI Usage / AI 使用量",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Enable or disable OCR and set monthly and per-staff daily quota.",
      actions: ["Review used, remaining, last updated, and updated by.", "Confirm the supported OCR use cases.", "Set enable state and both limits.", "Save and verify the refreshed snapshot."],
      requiredItems: ["Intended enable state", "Monthly quota", "Per-staff daily quota"],
      completeWhen: "Saved limits match the operational budget and staff volume.",
      handoff: "Staff OCR-assisted source workflows.",
      warnings: ["Zero limits effectively block OCR.", "Limits reset by UTC day/month.", "One unit is reserved before provider processing.", "OCR output remains an editable draft requiring staff review."]
    },
    {
      key: "showroom-enquiry",
      label: "QR Enquiry / 二维码询问",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Publish and verify the no-login showroom enquiry QR.",
      actions: ["Confirm the configured public front-office origin.", "Open and test the public enquiry page.", "Download or print the QR.", "Place it in the showroom.", "Confirm a test submission appears in Leads as In-store QR enquiry."],
      requiredItems: ["Correct production front-office origin", "Printed QR test"],
      completeWhen: "The printed QR opens the correct production page and its test enquiry reaches Leads.",
      handoff: "Leads / 客户询问.",
      warnings: ["The local default is http://localhost:3000/showroom-enquiry; production requires the configured front-office origin."]
    },
    {
      key: "vehicle-catalog",
      label: "Make & Model / 品牌车型",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Maintain public website make/model filter options without rewriting vehicle history.",
      actions: ["Search for the option first.", "Add or edit make and model.", "Set website-visible status.", "Hide an obsolete option instead of changing historical vehicle records."],
      requiredItems: ["Make", "Model", "Website-visible status"],
      completeWhen: "An active option appears in public filters and a hidden option does not.",
      handoff: "Public vehicle inventory filters.",
      warnings: ["Case-insensitive duplicate make/model pairs are rejected.", "Make and model are limited to 80 characters.", "Hiding an option does not change existing vehicles."]
    },
    {
      key: "roles",
      label: "RBAC Listing / 角色权限",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Review the explained module, data scope, and admin powers for each role before assignment.",
      actions: ["Find the intended role.", "Review module and data scope.", "Return to Staff Users to assign only required roles."],
      requiredItems: ["Actual staff responsibility and minimum required access"],
      completeWhen: "Assigned roles correspond to required work without unrelated access.",
      handoff: "Staff Users / 员工账号.",
      warnings: ["The listing is explanatory; server API policy remains authoritative."]
    },
    {
      key: "audit",
      label: "Audit Log / 操作记录",
      kind: "tab",
      audience: "Boss/Admin",
      purpose: "Trace settings, staff, catalog, and OCR-limit events using actor, action, entity, and entity ID.",
      actions: ["Filter by Actor, Action, or Entity.", "Match Entity ID to the changed source record.", "Verify the current settings or user record."],
      requiredItems: ["Actor/action/entity clue and matching source record"],
      completeWhen: "The settings change is reconciled with its source audit event.",
      handoff: "The relevant Settings tab or standalone Audit Log.",
      warnings: ["There is no date filter or before/after value view.", "Only the newest 200 matching events are returned."]
    }
  ],
  completionReminder: "Settings affect multiple staff. Confirm the intended user, role, and operational impact before saving."
};

const guidesByPath: Record<AppRoutePath, ModuleGuideDefinition> = {
  "/dashboard": dashboardGuide,
  "/vehicles": vehicleGuide,
  "/repairs": repairGuide,
  "/loans": loanGuide,
  "/delivery": deliveryGuide,
  "/finance": financeManagementGuide,
  "/customer-360": customerGuide,
  "/leads": leadsGuide,
  "/audit-log": auditGuide,
  "/hr-salary": hrSelfServiceGuide,
  "/admin": adminGuide
};

export function moduleGuideForPath(path: AppRoutePath, roles: readonly string[]): ModuleGuideDefinition {
  if (path === "/finance") {
    const canManageFinance = roles.includes("BossAdmin") || roles.includes("Finance");
    return canManageFinance ? financeManagementGuide : financeSalesGuide;
  }

  if (path === "/hr-salary") {
    if (roles.includes("BossAdmin")) return hrBossGuide;
    if (roles.includes("HrSalary")) return hrManagementGuide;
    return hrSelfServiceGuide;
  }

  if (path === "/customer-360") {
    const canViewIdentity = roles.some((role) => ["BossAdmin", "Sales", "Loan", "Finance"].includes(role));
    return roles.includes("Delivery") && !canViewIdentity ? customerDeliveryGuide : customerGuide;
  }

  return guidesByPath[path];
}

export function moduleGuideTourStorageKey(path: AppRoutePath, userId?: string): string {
  const viewer = userId?.trim() || "anonymous";
  return `ysheng:module-guide:${MODULE_GUIDE_TOUR_VERSION}:${encodeURIComponent(viewer)}:${encodeURIComponent(path)}`;
}

export function shouldShowModuleGuideTour(storage: ModuleGuideStorage | null | undefined, path: AppRoutePath, userId?: string): boolean {
  if (!storage) return true;

  try {
    return storage.getItem(moduleGuideTourStorageKey(path, userId)) !== "seen";
  } catch {
    return true;
  }
}

export function markModuleGuideTourSeen(storage: ModuleGuideStorage | null | undefined, path: AppRoutePath, userId?: string): void {
  if (!storage) return;

  try {
    storage.setItem(moduleGuideTourStorageKey(path, userId), "seen");
  } catch {
    // Help remains available from the module button when browser storage is unavailable.
  }
}
