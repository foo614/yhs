export type StockOwner = "YSHeng" | "KS";
export type VehicleStatus = "Available" | "LoanProcessing" | "Sold";
export type LeadStatus = "New" | "Contacted" | "Closed";
export type LeadClosureOutcome = "Sold" | "Lost" | "Invalid";
export type LoanStatus = "Draft" | "Pending" | "Approved" | "Rejected" | "Done";
export type LoanDecisionStatus = "Approved" | "Rejected";
export type DeliveryStatus = "BookingInspection" | "Scheduled" | "Inspection" | "PreparingDocuments" | "CarPreparation" | "ReadyForRelease" | "Released" | "Cancelled";
export type DeliveryType = "Standard" | "Outstation";
export type PaymentStatus = "Pending" | "Approved" | "Disbursed" | "Reconciled";
export type CollectionMethod = "BookingDeposit" | "DownPayment" | "BankTransfer" | "BankDisbursement" | "Cheque" | "Card" | "TradeInCredit" | "Other" | "Cash";
export type CollectionStatus = "Pending" | "Reconciled" | "Reversed";
export type FinancingStatus = "NotApplicable" | "Pending" | "Approved" | "Disbursed";
export type ReceivableStatus = "Draft" | "WaitingForApproval" | "ReadyToCollect" | "PartiallyPaid" | "Paid" | "AttentionNeeded";
export type PaymentVoucherStatus = "Pending" | "Approved" | "Paid";
export type DisbursementMethod = "BankTransfer" | "Cheque" | "Cash" | "Other";
export type SupplierApprovalStatus = "Draft" | "Approved" | "Inactive";
export type PurchaseInvoiceLineType = "VehiclePurchase" | "PurchaseProcessing" | "LatePaymentCharge" | "Parking" | "Transport" | "Refurbishment" | "Other";
export type DeliveryAccountingChargeType = "Insurance" | "RoadTax";
export type AccountingConfirmationStatus = "Draft" | "FinanceConfirmed";
export type CashHandoverStatus = "ReceivedBySales" | "PendingHandover" | "HandedOver" | "Rejected" | "Receipted";
export type DebtRecoveryStatus = "Open" | "FollowedUp" | "Closed";
export type RepairApprovalStatus = "Pending" | "Approved" | "Rejected";
export type SupplierInvoiceAgingStatus = "Unmatched" | "DueSoon" | "Overdue" | "Paid";
export type HrAttendanceStatus = "Present" | "Late" | "HalfDay" | "Absent";
export type HrAttendanceVerificationMethod = "Manual" | "OfficeQr" | "Outstation" | "ManualException" | "OfficeIp";
export type HrAttendanceAction = "CheckIn" | "CheckOut";
export type HrBusinessTripStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type HrLeaveType = "AnnualLeave" | "MedicalLeave" | "EmergencyLeave" | "UnpaidLeave";
export type HrLeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type HrPayslipStatus = "Draft" | "Generated";
export type HrEmploymentType = "Monthly" | "Hourly";
export type DocumentCategory = "PurchaseInvoice" | "Voc" | "IdentityCard" | "ApDocument" | "StatusReceipt" | "LoanDocument" | "DeliveryDocument" | "HandoverPhoto" | "SignedHandover" | "Policy" | "RoadTaxReceipt" | "RepairInvoice" | "PaymentReceipt" | "PaymentInvoice" | "MedicalCertificate" | "InspectionReport" | "WindscreenPolicy";
export type DocumentOwnershipType = "Seller" | "Buyer" | "Vehicle";
export type OcrJobStatus = "Queued" | "Analyzing" | "NeedsReview" | "Failed" | "Reviewed";
export type OcrReviewDecision = "Pending" | "Accepted" | "Rejected" | "Reviewed";

export type OcrLineItem = {
  description: string;
  quantity?: string | null;
  unit?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
  confidence?: number;
  rawText?: string;
};

export type OcrExtractionResult = {
  documentCategory: DocumentCategory;
  confidence: number;
  fieldConfidence: Record<string, number>;
  fields: Record<string, string | null | undefined>;
  lineItems?: OcrLineItem[];
  rawText: string;
  warnings: string[];
};

export type OwnerIdentityCardPreview = {
  result: OcrExtractionResult;
  existingOwner?: Owner;
};

export type OcrReviewedResult = {
  fields: Record<string, string | null | undefined>;
  lineItems?: OcrLineItem[];
};

export type OcrReviewChange = {
  field: string;
  extractedValue?: string | null;
  reviewedValue?: string | null;
};

export type OcrJob = {
  id: string;
  documentId: string;
  category: DocumentCategory;
  status: OcrJobStatus;
  progress: number;
  result?: OcrExtractionResult | null;
  warnings: string[];
  createdAt: string;
  completedAt?: string;
  reviewDecision: OcrReviewDecision;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewedResult?: OcrReviewedResult | null;
  reviewChanges?: OcrReviewChange[];
  comparedFieldCount?: number;
  correctFieldCount?: number;
};

export type OcrDocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  category: DocumentCategory;
  ownershipType: DocumentOwnershipType;
  customerId?: string;
  ownerId?: string;
  checksum: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type VehicleOcrJob = OcrJob & {
  document: OcrDocumentSummary;
};

export type UploadProgressHandler = (percent: number) => void;
export type DocumentUploadOwner = {
  ownershipType?: DocumentOwnershipType;
  customerId?: string;
  ownerId?: string;
  repairJobId?: string;
  paymentRecordId?: string;
  collectionTransactionId?: string;
  deliveryScheduleId?: string;
};

export type Vehicle = {
  id: string;
  plateNumber: string;
  chassisNumber?: string;
  engineNumber?: string;
  make: string;
  model: string;
  year: number;
  stockOwner: StockOwner;
  stockLocation?: string;
  status: VehicleStatus;
  isPublic: boolean;
  publicDescriptionMarkdown?: string;
  purchasePrice: number;
  sellingPrice: number;
  additionalCharges: number;
  refurbishmentTotal: number;
  repairCost?: number;
  commissionTotal: number;
  bossConfirmed?: boolean;
  contraRangePrice?: number;
  ucdStatus?: string;
  customerId?: string;
  ownerId?: string;
  intakeDate?: string;
  soldAt?: string;
  outstationPickupAllowance?: number;
  outstationPickupScheduledAt?: string;
  outstationPickupBookingSlip?: string;
};

export type VehicleLookup = Pick<Vehicle, "id" | "plateNumber" | "make" | "model" | "stockOwner" | "status" | "customerId"> &
  Partial<Pick<Vehicle, "year" | "sellingPrice" | "additionalCharges">>;

export type FinanceVehicleOption = Pick<Vehicle, "id" | "plateNumber" | "make" | "model" | "status" | "customerId" | "sellingPrice" | "additionalCharges">;

export type StockMovement = {
  id: string;
  vehicleId: string;
  fieldName: "Status" | "StockOwner" | "StockLocation" | string;
  previousValue: string;
  newValue: string;
  reason: string;
  actor: string;
  createdAt: string;
};

export type VehicleIntakeValues = Omit<Vehicle, "id">;

export type DashboardSummary = {
  totalStock: number;
  purchaseCost?: number;
  pendingLoan: number;
  outstandingPayment: number;
  settlementDue: number;
  repairCost: number;
  estimatedProfit: number;
  totalProfit?: number;
  vehicleAging: number;
  agingBuckets: DashboardAgingBucket[];
  topSupplier: string;
  salesPerformance: number;
  stockStatusMix: DashboardCountSlice[];
  stockOwnerMix: DashboardCountSlice[];
  moneyRiskBreakdown: DashboardAmountSlice[];
  workflowBlockers: DashboardWorkflowBlockers;
  salesFunnel: DashboardSalesFunnel;
  topEnquiredVehicles: DashboardCountSlice[];
  repairCostByVehicle: DashboardAmountSlice[];
  topSellingModels: DashboardCountSlice[];
  leadTrend: DashboardCountSlice[];
  leadsAwaitingFirstResponse: number;
  repairWorkInProgress: DashboardCountSlice[];
  realisedProfit: number;
  monthlyProfitTrend: DashboardProfitTrendSlice[];
  profitBreakdown: DashboardAmountSlice[];
  supplierSpendTop: DashboardAmountSlice[];
  totalSales: number;
  actualProfit: number;
  outstandingCollection: number;
  settlementDueAmount: number;
  refurbishment: DashboardRefurbishmentSummary;
  aiDocumentProcessing?: DashboardAiDocumentProcessing;
};

export type DashboardAgingBucket = {
  label: "0-30" | "31-60" | "61+";
  count: number;
};

export type DashboardCountSlice = {
  label: string;
  count: number;
};

export type DashboardAmountSlice = {
  label: string;
  amount: number;
};

export type DashboardWorkflowBlockers = {
  byType: DashboardCountSlice[];
  dueBuckets: DashboardCountSlice[];
};

export type DashboardSalesFunnel = {
  stages: DashboardCountSlice[];
  conversionRate: number;
};

export type DashboardReminder = {
  type: "LoanFollowUp" | "DeliveryPreparation" | "SettlementDue" | "PaymentBankFollowUp" | "PaymentStatusFollowUp" | "DailySpendDue" | "DebtRecoveryFollowUp" | "PaymentVoucherFollowUp";
  title: string;
  vehiclePlate: string;
  vehicleId: string;
  dueDate: string;
  amount?: number | null;
};

export type DashboardReminderDueFilter = "All" | "Overdue" | "DueToday" | "DueSoon" | "Upcoming";

export type DashboardReminderFilters = {
  type?: DashboardReminder["type"] | "All";
  due?: DashboardReminderDueFilter;
};

export type PriorityActionItem = {
  type: "LoanFollowUp" | "DeliveryPreparation" | "SettlementDue" | "PaymentBankFollowUp" | "PaymentStatusFollowUp" | "DailySpendDue" | "DebtRecoveryFollowUp" | "PaymentVoucherFollowUp" | "LeadFollowUp" | "RepairWorkInProgress" | "LeaveApproval";
  title: string;
  target: "Loans" | "Delivery" | "Finance" | "Leads" | "Repairs" | "HrSalary";
  dueDate: string;
  subject?: string;
  amount?: number;
};

export type DashboardProfitTrendSlice = {
  label: string;
  estimatedProfit: number;
  soldProfit: number;
  soldCount: number;
};

export type DashboardRefurbishmentSummary = {
  finalRepairSpend: number;
  vehicleCount: number;
  averageSpendPerVehicle: number;
  workInProgressCount: number;
  overdueWorkCount: number;
  highestCostVehicles: DashboardAmountSlice[];
};

export type DashboardAiDocumentCategory = {
  category: "IdentityCard" | "Voc" | "InvoicesAndReceipts" | "SupportingDocuments";
  label: string;
  scanCount: number;
  reviewedCount: number;
  comparedFieldCount: number;
  correctFieldCount: number;
  correctedFieldCount: number;
  accuracyPercent?: number | null;
  lowConfidenceCount: number;
  failedCount: number;
};

export type DashboardAiDocumentProcessing = {
  scanCount: number;
  reviewedCount: number;
  comparedFieldCount: number;
  correctFieldCount: number;
  correctedFieldCount: number;
  accuracyPercent?: number | null;
  lowConfidenceCount: number;
  failedCount: number;
  pendingReviewCount: number;
  usedThisMonth: number;
  monthlyRequestLimit: number;
  remainingThisMonth: number;
  categories: DashboardAiDocumentCategory[];
};

export type DashboardAnalyticsPeriod = {
  from?: string;
  to?: string;
};
export type DashboardReminderLoadResult = {
  reminders: DashboardReminder[];
  error?: string;
};

export type PriorityActionLoadResult = {
  actions: PriorityActionItem[];
  error?: string;
};

export type DashboardLoadResult = {
  dashboard: DashboardSummary | null;
  error?: string;
};

export type SupplierInvoice = {
  id: string;
  createdAt?: string;
  vehicleId: string;
  supplierId?: string;
  supplierName: string;
  invoiceNumber: string;
  plateNumberOnInvoice?: string;
  invoiceDate?: string;
  amount: number;
  dueDate?: string;
  paidAt?: string;
};

export type SupplierSummary = {
  supplierName: string;
  invoiceCount: number;
  totalAmount: number;
};

export type SupplierInvoiceAgingView = {
  invoiceId: string;
  supplierName: string;
  invoiceNumber: string;
  vehicleId: string;
  status: SupplierInvoiceAgingStatus;
  dueDate?: string;
  paidAt?: string;
  amount: number;
};

export type PurchaseInvoice = {
  id: string;
  vehicleId: string;
  supplierId?: string;
  invoiceNumber: string;
  invoiceDate?: string;
  purchaseDate?: string;
  paymentReference?: string;
  amount: number;
  accountingStatus?: AccountingConfirmationStatus;
  accountingConfirmedBy?: string;
  accountingConfirmedAt?: string;
  lines?: PurchaseInvoiceLine[];
};

export type PurchaseInvoiceLine = {
  id: string;
  purchaseInvoiceId: string;
  lineType: PurchaseInvoiceLineType;
  description: string;
  amount: number;
  capitaliseIntoVehicleCost: boolean;
};

export type Supplier = {
  id: string;
  companyName: string;
  registrationNumber?: string;
  tinNumber?: string;
  address: string;
  phone: string;
  contactPerson?: string;
  autoCountCreditorCode?: string;
  approvalStatus: SupplierApprovalStatus;
  createdBy?: string;
  createdAt?: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type DeliveryAccountingCharge = {
  id: string;
  deliveryScheduleId: string;
  vehicleId: string;
  chargeType: DeliveryAccountingChargeType;
  supplierId?: string;
  providerName: string;
  referenceNumber?: string;
  invoiceDate: string;
  amount: number;
  paidOnBehalf: boolean;
  documentId?: string;
  accountingStatus: AccountingConfirmationStatus;
  updatedBy?: string;
  updatedAt?: string;
  accountingConfirmedBy?: string;
  accountingConfirmedAt?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  icNumber?: string;
  tinNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type Owner = {
  id: string;
  name: string;
  phone: string;
  icNumber?: string;
  tinNumber?: string;
  address?: string;
};

export type RepairJob = {
  id: string;
  createdAt?: string;
  vehicleId: string;
  repairPart: string;
  whatToDo: string;
  cost: number;
  checklistDone: boolean;
  assignedTo?: string;
  startedOn?: string;
  expectedCompletionDate?: string;
  approvalStatus?: RepairApprovalStatus;
  approvalNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type LoanApplication = {
  id: string;
  vehicleId: string;
  customerId: string;
  status: LoanStatus;
  louApproved: boolean;
  louDone: boolean;
  submittedAt?: string;
  decisionBy?: string;
  decisionAt?: string;
  rejectionReason?: string;
};

export type DeliverySchedule = {
  id: string;
  vehicleId: string;
  customerId?: string;
  picUserId?: string;
  pic: string;
  status: DeliveryStatus;
  deliveryType?: DeliveryType;
  scheduledDate: string;
  scheduledTime?: string;
  deliveryAddress?: string;
  transportMethod?: string;
  rescheduleReason?: string;
  cancellationReason?: string;
  polishDone: boolean;
  tintedDone: boolean;
  washDone: boolean;
  documentsPrepared: boolean;
  inspectionDone: boolean;
  inspectionBookingReference?: string;
  inspectionReportReference?: string;
  notificationSent: boolean;
  twoDayNoticeSent: boolean;
  insuranceHandled: boolean;
  insurancePolicyReference?: string;
  insuranceExpiryDate?: string;
  roadTaxHandled: boolean;
  roadTaxReceiptReference?: string;
  roadTaxExpiryDate?: string;
  windscreenInsuranceHandled: boolean;
  windscreenPolicyReference?: string;
  windscreenInsuranceExpiryDate?: string;
  handoverPhotoCaptured?: boolean;
  signedHandoverReceived?: boolean;
  customerAcknowledged?: boolean;
  finalChecklistConfirmed?: boolean;
};

export type DeliveryWorkboardStage = "PlanDelivery" | "PrepareCar" | "ClearDocuments" | "Handover" | "Completed" | "Cancelled";

export type DeliveryWorkboardItem = {
  id: string;
  vehicleId: string;
  plateNumber: string;
  vehicleLabel: string;
  customerId?: string;
  customerName: string;
  picUserId?: string;
  picName: string;
  deliveryType?: DeliveryType;
  scheduledDate: string;
  scheduledTime?: string;
  deliveryAddress?: string;
  transportMethod?: string;
  rescheduleReason?: string;
  cancellationReason?: string;
  status: DeliveryStatus;
  stage: DeliveryWorkboardStage;
  stageLabel: string;
  nextAction: string;
  blocker?: string | null;
  financeCleared: boolean;
  canRelease: boolean;
  terminal: boolean;
  invoiceUpdateRequested?: boolean;
  invoiceUpdateRequestReason?: string | null;
  polishDone: boolean;
  tintedDone: boolean;
  washDone: boolean;
  documentsPrepared: boolean;
  inspectionDone: boolean;
  inspectionBookingReference?: string;
  inspectionReportReference?: string;
  notificationSent: boolean;
  twoDayNoticeSent: boolean;
  insuranceHandled: boolean;
  insurancePolicyReference?: string;
  insuranceExpiryDate?: string;
  roadTaxHandled: boolean;
  roadTaxReceiptReference?: string;
  roadTaxExpiryDate?: string;
  windscreenInsuranceHandled: boolean;
  windscreenPolicyReference?: string;
  windscreenInsuranceExpiryDate?: string;
  handoverPhotoCaptured?: boolean;
  signedHandoverReceived?: boolean;
  customerAcknowledged?: boolean;
  finalChecklistConfirmed?: boolean;
  missingCategories: DocumentCategory[];
  evidence: DeliveryEvidenceItem[];
};

export type DeliveryInvoiceUpdateRequestItem = {
  id: string;
  vehicleId: string;
  plateNumber: string;
  vehicleLabel: string;
  customerName: string;
  requestReason: string;
  requestedAt: string;
};

export type DeliveryPicOption = {
  id: string;
  displayName: string;
};

export type DeliveryActivity = {
  id: string;
  deliveryScheduleId: string;
  action: string;
  actorUserId?: string | null;
  actorName: string;
  summary: string;
  createdAt: string;
};

export type SalesWorkboardItem = {
  vehicleId: string;
  plateNumber: string;
  vehicleLabel: string;
  salesAgentUserId?: string | null;
  salesAgentName?: string | null;
  process: string;
  responsibleDepartment: string;
  nextAction: string;
  soldAt?: string | null;
};

export type SalesWorkboard = {
  soldThisMonth: number;
  inProgressCount: number;
  availableAgents: DeliveryPicOption[];
  items: SalesWorkboardItem[];
};

export type PaymentRecord = {
  id: string;
  vehicleId: string;
  nettPrice: number;
  status: PaymentStatus;
  receiptNumber?: string;
  invoiceNumber?: string;
  bossChecked: boolean;
  documentsPrepared: boolean;
  checklistValidated: boolean;
  salesPrice?: number;
  interestAdditionalCharges?: number;
  ncdAmount?: number;
  windscreenCharges?: number;
  outstationDeliveryDate?: string;
  bankName?: string;
  bankFollowUpDate?: string;
  salesAgentUserId?: string;
  salesAgentName?: string;
  loanBankReference?: string;
  insurancePaidOnBehalfAmount?: number;
  roadTaxPaidOnBehalfAmount?: number;
  advancePaidOnBehalfAmount?: number;
  createdAt: string;
  customerId?: string;
  calculatedNettPrice?: number;
  nettPriceVariance?: number;
  nettPriceOverrideReason?: string;
  nettPriceOverrideRequestedBy?: string;
  nettPriceOverrideRequestedAt?: string;
  nettPriceOverrideApprovedBy?: string;
  nettPriceOverrideApprovedAt?: string;
  formulaVersion?: string;
  financeWorkflowVersion?: number;
  invoice?: FinanceInvoice;
  collections?: CollectionTransaction[];
  collectedAmount?: number;
  balanceAmount?: number;
  availableToAllocate?: number;
  receivableStatus?: ReceivableStatus;
};

export type FinanceInvoice = {
  id: string;
  paymentRecordId: string;
  vehicleId: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  vehiclePlateNumber?: string;
  vehicleDescription?: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  salesPrice: number;
  interestAdditionalCharges: number;
  ncdAmount: number;
  windscreenCharges: number;
  contentMimeType: string;
  createdBy: string;
  createdAt: string;
};

export type SettlementReminder = {
  id: string;
  vehicleId: string;
  ownerId?: string;
  amount: number;
  deadline: string;
  isPaid: boolean;
};

export type VehicleIntakeCreateInput = {
  vehicle: Vehicle;
  settlement?: SettlementReminder;
  newOwner?: Owner;
};

export type VehicleIntakeCreateResponse = {
  vehicle: Vehicle;
  settlement?: SettlementReminder;
  createdOwner?: Owner;
};

export type DailySpend = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
};

export type BrokerCommission = {
  id: string;
  vehicleId: string;
  brokerName: string;
  amount: number;
  isPaid: boolean;
  cp58Required: boolean;
  cp58Prepared: boolean;
};

export type DebtRecoveryCase = {
  id: string;
  vehicleId: string;
  customerId: string;
  balanceAmount: number;
  status: DebtRecoveryStatus;
  followUpDate: string;
  notes?: string;
};

export type PaymentVoucher = {
  id: string;
  vehicleId: string;
  payeeName: string;
  amount: number;
  purpose: string;
  status: PaymentVoucherStatus;
  issuedDate: string;
  paymentMethod?: DisbursementMethod;
  sourceAccountCode?: string;
  chequeNumber?: string;
  paymentReference?: string;
  bankChargeAmount?: number;
  bankChargeAccountCode?: string;
  accountingAccountCode?: string;
  createdBy?: string;
  createdAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  paidBy?: string;
  paidAt?: string;
  paymentEvidenceReference?: string;
  notes?: string;
};

export type SettlementDraft = {
  vehicleId: string;
  ownerId?: string;
  purchasePrice: number;
};

export type RepairReceiptItemInput = {
  description: string;
  /** Legacy field kept so existing confirmed receipts remain readable. */
  repairPart?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: number;
  amount: number;
  sortOrder: number;
};

export type ConfirmRepairReceiptRequest = {
  documentId: string;
  supplierName?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  items: RepairReceiptItemInput[];
};

export type CreateRepairWithReceiptRequest = {
  repair: RepairJob;
  invoice: SupplierInvoice;
  receipt: ConfirmRepairReceiptRequest;
};

export type RepairReceiptItem = RepairReceiptItemInput & {
  id: string;
  repairReceiptId: string;
};

export type RepairReceipt = {
  id: string;
  repairJobId: string;
  documentId: string;
  supplierName?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  createdAt: string;
};

export type CollectionTransaction = {
  id: string;
  paymentRecordId: string;
  amount: number;
  method: CollectionMethod;
  status: CollectionStatus;
  financingStatus: FinancingStatus;
  reference?: string;
  receivedDate: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  reconciledBy?: string;
  reconciledAt?: string;
  reversedBy?: string;
  reversedAt?: string;
  reversalReason?: string;
  officialReceiptId?: string;
  officialReceiptNumber?: string;
};

export type FinanceSaleInput = {
  vehicleId: string;
  salesAgentUserId?: string;
  loanBankReference?: string;
  salesPrice: number;
  interestAdditionalCharges: number;
  ncdAmount: number;
  windscreenCharges: number;
  insurancePaidOnBehalfAmount?: number;
  roadTaxPaidOnBehalfAmount?: number;
  advancePaidOnBehalfAmount?: number;
  nettPrice?: number;
  nettPriceOverrideReason?: string;
};

export type CollectionCreateInput = {
  idempotencyKey: string;
  amount: number;
  method: CollectionMethod;
  financingStatus: FinancingStatus;
  reference?: string;
  receivedDate: string;
  notes?: string;
};

export type RepairReceiptWithItems = {
  receipt: RepairReceipt;
  items: RepairReceiptItem[];
};

export type CreateRepairWithReceiptResponse = {
  repair: RepairJob;
  invoice: SupplierInvoice;
  receipt: RepairReceipt;
  items: RepairReceiptItem[];
};

export type VehicleCatalogModel = {
  id: string;
  make: string;
  model: string;
  isActive: boolean;
};

export type VehicleCatalogModelInput = Omit<VehicleCatalogModel, "id">;

export type CustomerProfileOption = Pick<Customer, "id" | "name">;

export type CustomerProfileContact = {
  id: string;
  name: string;
  phone?: string;
  icNumber?: string;
  tinNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type CustomerProfileVehicle = Pick<Vehicle, "id" | "plateNumber" | "make" | "model" | "year" | "status">;

export type CustomerProfileLoan = Pick<LoanApplication, "id" | "vehicleId" | "status" | "louApproved" | "louDone" | "submittedAt">;

export type CustomerProfileDelivery = Pick<DeliverySchedule,
  "id" | "vehicleId" | "status" | "scheduledDate" | "pic" |
  "insuranceHandled" | "insurancePolicyReference" | "insuranceExpiryDate" |
  "roadTaxHandled" | "roadTaxReceiptReference" | "roadTaxExpiryDate" |
  "windscreenInsuranceHandled" | "windscreenPolicyReference" | "windscreenInsuranceExpiryDate">;

export type CustomerProfilePayment = Pick<PaymentRecord, "id" | "vehicleId" | "nettPrice" | "status" | "receiptNumber" | "invoiceNumber" | "createdAt">;

export type CustomerProfileInvoice = Pick<FinanceInvoice, "id" | "paymentRecordId" | "vehicleId" | "invoiceNumber" | "invoiceDate" | "amount">;

export type CustomerProfileReceipt = {
  cashHandoverId: string;
  id: string;
  paymentRecordId: string;
  receiptNumber: string;
  amount: number;
  createdAt: string;
};

export type CustomerProfileDocument = {
  id: string;
  vehicleId: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  checksum: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type CustomerProfileEnquiry = Pick<Lead, "id" | "vehicleId" | "status" | "message" | "sourcePage" | "createdAt">;

export type CustomerProfileMissingDocument = {
  vehicleId?: string;
  category: DocumentCategory;
  message: string;
};

export type CustomerProfilePermissions = {
  canViewIdentity: boolean;
  canViewLoans: boolean;
  canViewDelivery: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canViewEnquiries: boolean;
};

export type CustomerProfile = {
  contact: CustomerProfileContact;
  vehicles: CustomerProfileVehicle[];
  loans: CustomerProfileLoan[];
  deliveries: CustomerProfileDelivery[];
  payments: CustomerProfilePayment[];
  invoices: CustomerProfileInvoice[];
  officialReceipts: CustomerProfileReceipt[];
  documents: CustomerProfileDocument[];
  enquiries: CustomerProfileEnquiry[];
  missingDocuments: CustomerProfileMissingDocument[];
  permissions: CustomerProfilePermissions;
};

export type CashHandover = {
  id: string;
  paymentRecordId: string;
  vehicleId: string;
  customerId: string;
  amount: number;
  status: CashHandoverStatus;
  collectedByUserId: string;
  collectedAt: string;
  handoverRequestedAt?: string;
  handedOverToUserId?: string;
  handedOverAt?: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  rejectedByUserId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  notes?: string;
  officialReceiptId?: string;
  officialReceiptNumber?: string;
};

export type CashHandoverPaymentLookup = {
  paymentRecordId: string;
  vehicleId: string;
  customerId: string;
  customerName: string;
  plateNumber: string;
  invoiceNumber?: string;
  nettPrice: number;
};

export type HrAttendanceRecord = {
  id: string;
  staffUserId: string;
  attendanceDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: HrAttendanceStatus;
  verificationMethod: HrAttendanceVerificationMethod;
  officeNetworkLabel?: string;
  notes?: string;
};

export type HrAttendanceQrChallenge = {
  id: string;
  token: string;
  expiresAt: string;
};

export type HrAttendanceQrRedemptionRequest = {
  token: string;
  action: HrAttendanceAction;
};

export type HrBusinessTrip = {
  id: string;
  staffUserId: string;
  status: HrBusinessTripStatus;
  startDate: string;
  endDate: string;
  location: string;
  purpose: string;
  isUrgentException: boolean;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  decisionNotes?: string;
};

export type HrOutstationAttendanceRequest = { businessTripId: string };

export type HrAttendanceDashboardSummary = {
  checkedInToday: number;
  checkedOutToday: number;
  openSessionsToday: number;
  officeQrSessionsToday: number;
  manualSessionsToday: number;
  outstationSessionsToday: number;
  pendingBusinessTripRequests: number;
  activeOutstationToday: number;
  upcomingApprovedTrips: number;
};

export type HrAvailabilityCalendarItem = {
  staffUserId: string;
  staffDisplayName: string;
  startDate: string;
  endDate: string;
  kind: "Leave" | "Outstation";
  status: "Busy";
  location?: string;
  purpose?: string;
};

export type HrAttendanceReminderType = "PendingApproval" | "UpcomingOutstation" | "MissingCheckOut";
export type HrAttendanceReminderPolicy = { id: string; type: HrAttendanceReminderType; isEnabled: boolean; leadHours: number; updatedBy: string; updatedAt: string };
export type HrAttendanceReminderItem = { type: HrAttendanceReminderType; staffUserId: string; message: string; dueDate: string };

export type HrAttendanceNetwork = {
  id: string;
  label: string;
  cidr: string;
  isActive: boolean;
  createdAt: string;
};

export type HrCalendarAvailability = {
  staffUserId: string;
  staffName: string;
  date: string;
  status: "Unavailable";
};

export type HrLeaveRequest = {
  id: string;
  staffUserId: string;
  type: HrLeaveType;
  status: HrLeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  medicalCertificateDocumentId?: string;
  approvedBy?: string;
  approvedAt?: string;
  decisionNotes?: string;
  createdAt: string;
};

export type HrLeaveBalance = {
  id: string;
  staffUserId: string;
  annualLeaveDays: number;
  medicalLeaveDays: number;
  notes?: string;
};

export type HrLeavePolicy = {
  id: string;
  role: StaffRole;
  annualLeaveDays: number;
  medicalLeaveDays: number;
  notes?: string;
};

export type HrLeaveAdjustmentType = "AnnualLeave" | "MedicalLeave";
export type HrLeaveAdjustmentDirection = "Increase" | "Decrease";

export type HrLeaveAdjustment = {
  id: string;
  staffUserId: string;
  type: HrLeaveAdjustmentType;
  direction: HrLeaveAdjustmentDirection;
  days: number;
  annualLeaveBefore: number;
  medicalLeaveBefore: number;
  annualLeaveAfter: number;
  medicalLeaveAfter: number;
  reason: string;
  adjustedBy: string;
  createdAt: string;
};

export type HrLeaveAdjustmentRequest = {
  staffUserId: string;
  type: HrLeaveAdjustmentType;
  direction: HrLeaveAdjustmentDirection;
  days: number;
  reason: string;
};

export type HrLeaveAdjustmentResult = {
  balance: HrLeaveBalance;
  adjustment: HrLeaveAdjustment;
};

export type HrPayrollProfile = {
  id: string;
  staffUserId: string;
  employmentType: HrEmploymentType;
  monthlyBaseSalary: number;
  hourlyRate: number;
  overtimeHours: number;
  overtimeRate: number;
  allowances: number;
  manualDeductions: number;
  notes?: string;
};

export type HrPayPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  createdAt: string;
};

export type HrPayslip = {
  id: string;
  staffUserId: string;
  payPeriodId: string;
  status: HrPayslipStatus;
  employmentType: HrEmploymentType;
  baseSalary: number;
  hourlyRate: number;
  workedHours: number;
  attendancePay: number;
  workingDays: number;
  dailySalary: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  overtimePay: number;
  allowances: number;
  manualDeductions: number;
  grossPay: number;
  netPay: number;
  generatedAt: string;
};

export type Lead = {
  id: string;
  vehicleId: string;
  customerId?: string;
  customerName: string;
  phone: string;
  message?: string;
  sourcePage?: string;
  sourceReferrer?: string;
  sourceCampaign?: string;
  status: LeadStatus;
  closureOutcome?: LeadClosureOutcome;
  createdAt: string;
  takenByUserId?: string;
  takenByName?: string;
  takenAt?: string;
};

export type AuditLog = {
  id: string;
  actor: string;
  action: string;
  entityName: string;
  entityId: string;
  createdAt: string;
};

export type AuditLogFilters = {
  keyword?: string;
  actor?: string;
  action?: string;
  entityName?: string;
};

export type AuditLogRequestOptions = {
  strict?: boolean;
};

export type VehicleDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  category: DocumentCategory;
  ownershipType: DocumentOwnershipType;
  customerId?: string;
  ownerId?: string;
  repairJobId?: string;
  paymentRecordId?: string;
  collectionTransactionId?: string;
  deliveryScheduleId?: string;
  uploadedBy: string;
  checksum: string;
  uploadedAt: string;
};

export type DeliveryEvidenceItem = {
  category: DocumentCategory;
  isPresent: boolean;
  documentId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  checksum?: string | null;
  uploadedBy?: string | null;
  uploadedAt?: string | null;
};

export type VehiclePhoto = {
  id: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  checksum: string;
  uploadedAt: string;
};

export type LoanDocumentCheck = {
  isComplete: boolean;
  missingCategories: DocumentCategory[];
};

export type DeliveryReleaseReadiness = {
  isReady: boolean;
  financeCleared: boolean;
  missingCategories: DocumentCategory[];
  missingEvidence: string[];
  expiredDocuments: string[];
  evidence: DeliveryEvidenceItem[];
};

export type CurrentUser = {
  isAuthenticated: boolean;
  id?: string;
  name?: string;
  roles: string[];
};

export type StaffRole = "BossAdmin" | "Sales" | "Loan" | "Delivery" | "Finance" | "Repair" | "HrSalary";
export const staffRoleValues: StaffRole[] = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance", "Repair", "HrSalary"];

export type StaffUser = {
  id: string;
  email: string;
  displayName: string;
  roles: StaffRole[];
  isActive: boolean;
};

export type AiServiceLimit = {
  id: string;
  service: "Ocr";
  isEnabled: boolean;
  monthlyRequestLimit: number;
  perStaffDailyRequestLimit: number;
  updatedAt: string;
  updatedBy: string;
};

export type AiUsageLimitSnapshot = {
  limit: AiServiceLimit;
  usedThisMonth: number;
  remainingThisMonth: number;
};

export type UpdateAiServiceLimitRequest = Pick<AiServiceLimit, "isEnabled" | "monthlyRequestLimit" | "perStaffDailyRequestLimit">;

export type CreateStaffUserRequest = {
  email: string;
  displayName: string;
  password: string;
  role: StaffRole;
};

export type UpdateStaffUserRolesRequest = {
  roles: StaffRole[];
};

export type UpdateStaffUserRequest = {
  displayName: string;
};

export type ResetStaffPasswordRequest = {
  password: string;
};

export type UpdateStaffUserStatusRequest = {
  isActive: boolean;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

export function humanizeApiError(error: unknown, fallback = "Please try again.") {
  const rawMessage = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  const normalized = rawMessage.toLowerCase();

  if (!rawMessage || normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "We could not connect to the server. Please check your connection and try again.";
  }
  if (normalized.includes("(401)") || normalized.includes("unauthorized")) {
    return "Your session has expired. Please sign in again.";
  }
  if (normalized.includes("(403)") || normalized.includes("forbidden")) {
    return "You do not have permission to perform this action.";
  }
  if (normalized.includes("(404)") || normalized.includes("not found")) {
    return "The requested record could not be found. It may have been removed or is no longer available.";
  }
  if (normalized.includes("(409)") || normalized.includes("conflict")) {
    return "This record conflicts with existing data. Please check for duplicates and try again.";
  }
  if (normalized.includes("(413)")) {
    return "The file is too large. Please choose a smaller file and try again.";
  }
  if (normalized.includes("(415)")) {
    return "This file type is not supported. Please choose an accepted file and try again.";
  }
  if (normalized.includes("(429)")) {
    return rawMessage || "The AI service limit has been reached. Ask an administrator to adjust the limit.";
  }
  if (normalized.includes("(400)") || normalized.includes("(422)")) {
    const cleanedMessage = rawMessage.replace(/\s*\((?:400|422)\)\.?$/i, ".");
    return /^\s*(?:request|upload) failed with status\.?$/i.test(cleanedMessage)
      ? "Some information is missing or invalid. Please review the form and try again."
      : cleanedMessage || "Some information is missing or invalid. Please review the form and try again.";
  }
  if (/\b(?:request|upload) failed with status \(?5\d{2}\)?/i.test(rawMessage) || /\b(?:internal server|server error)\b/i.test(normalized)) {
    return "The server could not complete this request. Please try again. If the problem continues, contact an administrator.";
  }

  return rawMessage || fallback;
}

const sampleVehicle: Vehicle = {
  id: "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737",
  plateNumber: "VPK1234",
  make: "Toyota",
  model: "Vios",
  year: 2021,
  stockOwner: "YSHeng",
    status: "Available",
    isPublic: true,
    publicDescriptionMarkdown: "## Ready to view\n\n- Full service history available\n- Viewing by appointment",
  purchasePrice: 42000,
    sellingPrice: 58000,
    additionalCharges: 600,
    refurbishmentTotal: 3500,
    commissionTotal: 1200,
    bossConfirmed: true,
    contraRangePrice: 56000,
    ucdStatus: "Ready",
    outstationPickupAllowance: 180,
    outstationPickupScheduledAt: "2026-06-03T10:30:00Z",
    outstationPickupBookingSlip: "BOOK-DEMO-1001",
    customerId: undefined,
    ownerId: undefined
};

export async function getDashboard(period: DashboardAnalyticsPeriod = {}): Promise<DashboardLoadResult> {
  const params = new URLSearchParams();
  if (period.from && period.to) {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  const query = params.toString();
  try {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/summary${query ? `?${query}` : ""}`, { credentials: "include" });
    if (response.ok) return { dashboard: await response.json() };
    return { dashboard: null, error: await responseErrorMessage(response, "Dashboard data could not be loaded. Please try again.") };
  } catch {
    return { dashboard: null, error: "Dashboard data could not be loaded. Check the connection and try again." };
  }
}

export async function getDashboardReminders(filters: DashboardReminderFilters = {}): Promise<DashboardReminderLoadResult> {
  const params = new URLSearchParams();
  if (filters.type && filters.type !== "All") params.set("type", filters.type);
  if (filters.due && filters.due !== "All") params.set("due", filters.due);
  const query = params.toString();
  try {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/reminders${query ? `?${query}` : ""}`, { credentials: "include" });
    if (response.ok) return { reminders: await response.json() };
    return { reminders: [], error: await responseErrorMessage(response, "Reminder inbox could not be loaded. Please try again.") };
  } catch {
    return { reminders: [], error: "Reminder inbox could not be loaded. Check the connection and try again." };
  }
}

export async function getPriorityActions(): Promise<PriorityActionLoadResult> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/priority-actions`, { credentials: "include" });
    if (response.ok) return { actions: await response.json() };
    return { actions: [], error: await responseErrorMessage(response, "Priority action queue could not be loaded. Please try again.") };
  } catch {
    return { actions: [], error: "Priority action queue could not be loaded. Check the connection and try again." };
  }
}

export async function getLoanDocumentCheck(loanId: string): Promise<LoanDocumentCheck> {
  return getWithNetworkFallback(`/api/loans/${loanId}/document-check`, { isComplete: false, missingCategories: [] });
}

export async function getDeliveryReleaseReadiness(deliveryId: string): Promise<DeliveryReleaseReadiness> {
  return getWithNetworkFallback(`/api/deliveries/${deliveryId}/release-readiness`, { isReady: false, financeCleared: false, missingCategories: [], missingEvidence: [], expiredDocuments: [], evidence: [] });
}

export async function login(email: string, password: string) {
  return request("/api/auth/login?useCookies=true", {
    method: "POST",
    body: JSON.stringify({ email, password })
  }, "Login failed. Please check email and password");
}

export async function logout() {
  return request("/api/auth/logout", { method: "POST" });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>("/api/auth/me");
}

export async function getVehicles(): Promise<Vehicle[]> {
  return getWithNetworkFallback("/api/vehicles", [sampleVehicle]);
}

export async function getVehicleCatalogModels(): Promise<VehicleCatalogModel[]> {
  return getWithNetworkFallback("/api/vehicle-catalog/models", []);
}

export async function getVehicleLookup(): Promise<VehicleLookup[]> {
  return getWithNetworkFallback("/api/vehicle-lookup", [vehicleLookupFromVehicle(sampleVehicle)]);
}

export async function getFinanceVehicleOptions(): Promise<FinanceVehicleOption[]> {
  return request<FinanceVehicleOption[]>("/api/finance/vehicle-options");
}

export function mergeFinanceVehicleOptions(vehicles: VehicleLookup[], financeOptions: FinanceVehicleOption[]): VehicleLookup[] {
  const financeOptionById = new Map(financeOptions.map((option) => [option.id, option]));
  return vehicles.map((vehicle) => {
    const financeOption = financeOptionById.get(vehicle.id);
    return financeOption
      ? {
          ...vehicle,
          plateNumber: financeOption.plateNumber,
          make: financeOption.make,
          model: financeOption.model,
          status: financeOption.status,
          customerId: financeOption.customerId,
          sellingPrice: financeOption.sellingPrice,
          additionalCharges: financeOption.additionalCharges
        }
      : {
          ...vehicle,
          sellingPrice: undefined,
          additionalCharges: undefined
        };
  });
}

export async function getCustomers(): Promise<Customer[]> {
  return getWithNetworkFallback("/api/customers", []);
}

export async function getCustomerProfileOptions(): Promise<CustomerProfileOption[]> {
  return request<CustomerProfileOption[]>("/api/customers/profile-options");
}

export async function getCustomerProfile(customerId: string): Promise<CustomerProfile> {
  return request<CustomerProfile>(`/api/customers/${customerId}/profile`);
}

export async function getOwners(): Promise<Owner[]> {
  return getWithNetworkFallback("/api/owners", []);
}

export async function getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
  return getWithNetworkFallback("/api/purchase-invoices", fallbackPurchaseInvoices());
}

export async function getSuppliers(): Promise<SupplierSummary[]> {
  return getWithNetworkFallback("/api/suppliers", []);
}

export async function getSupplierMaster(): Promise<Supplier[]> {
  return getWithNetworkFallback("/api/supplier-master", []);
}

export async function getSupplierInvoices(): Promise<SupplierInvoice[]> {
  return getWithNetworkFallback("/api/supplier-invoices", fallbackSupplierInvoices());
}

export async function getSupplierInvoiceAging(): Promise<SupplierInvoiceAgingView[]> {
  return getWithNetworkFallback("/api/supplier-invoices/aging", []);
}

export async function getRepairs(): Promise<RepairJob[]> {
  return getWithNetworkFallback("/api/repairs", []);
}

export async function getLoans(): Promise<LoanApplication[]> {
  return getWithNetworkFallback("/api/loans", fallbackLoans());
}

export async function getDeliveries(): Promise<DeliverySchedule[]> {
  return getWithNetworkFallback("/api/deliveries", fallbackDeliveries());
}

export async function getDeliveryWorkboard(): Promise<DeliveryWorkboardItem[]> {
  return request<DeliveryWorkboardItem[]>("/api/deliveries/workboard");
}

export async function getDeliveryPicOptions(): Promise<DeliveryPicOption[]> {
  return request<DeliveryPicOption[]>("/api/deliveries/pic-options");
}

export async function getDeliveryActivity(deliveryId: string): Promise<DeliveryActivity[]> {
  return request<DeliveryActivity[]>(`/api/deliveries/${deliveryId}/activity`);
}

export async function getPayments(): Promise<PaymentRecord[]> {
  return request<PaymentRecord[]>("/api/payments", {}, "Unable to load finance records");
}

export async function getCashHandovers(): Promise<CashHandover[]> {
  return getWithNetworkFallback("/api/cash-handovers", []);
}

export async function getCashHandoverPaymentLookup(): Promise<CashHandoverPaymentLookup[]> {
  return getWithNetworkFallback("/api/cash-handovers/payment-lookup", []);
}

export async function exportPaymentsCsv(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/payments/export`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Export failed with status ${response.status}`));
  }
  return response.text();
}

export async function exportAutoCountWorkbook(from?: string, to?: string): Promise<Blob> {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${apiBaseUrl}/api/payments/export-autocount${suffix}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `AutoCount export failed with status ${response.status}`));
  }
  return response.blob();
}

export async function getSettlementReminders(): Promise<SettlementReminder[]> {
  return getWithNetworkFallback("/api/settlement-reminders", []);
}

export async function getSettlementDrafts(): Promise<SettlementDraft[]> {
  return getWithNetworkFallback("/api/settlement-drafts", []);
}

export async function getDailySpends(): Promise<DailySpend[]> {
  return getWithNetworkFallback("/api/daily-spends", []);
}

export async function getBrokerCommissions(): Promise<BrokerCommission[]> {
  return getWithNetworkFallback("/api/broker-commissions", []);
}

export async function getDebtRecoveries(): Promise<DebtRecoveryCase[]> {
  return getWithNetworkFallback("/api/debt-recoveries", []);
}

export async function getPaymentVouchers(): Promise<PaymentVoucher[]> {
  return getWithNetworkFallback("/api/payment-vouchers", []);
}

export async function getDeliveryAccountingCharges(): Promise<DeliveryAccountingCharge[]> {
  return getWithNetworkFallback("/api/delivery-accounting-charges", []);
}

export async function confirmDeliveryAccountingCharge(chargeId: string): Promise<DeliveryAccountingCharge> {
  return request<DeliveryAccountingCharge>(`/api/delivery-accounting-charges/${chargeId}/confirm`, { method: "POST" });
}

export async function getLeads(): Promise<Lead[]> {
  return getWithNetworkFallback("/api/leads", fallbackLeads());
}

export async function getSalesWorkboard(agentUserId?: string): Promise<SalesWorkboard> {
  const query = agentUserId ? `?agentUserId=${encodeURIComponent(agentUserId)}` : "";
  const path = "/api/sales/workboard";
  return request<SalesWorkboard>(`${path}${query}`);
}

export async function getAuditLog(filters: AuditLogFilters = {}, options: AuditLogRequestOptions = {}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (filters.keyword?.trim()) params.set("q", filters.keyword.trim());
  if (filters.actor?.trim()) params.set("actor", filters.actor.trim());
  if (filters.action?.trim()) params.set("action", filters.action.trim());
  if (filters.entityName?.trim()) params.set("entityName", filters.entityName.trim());
  const query = params.toString();
  const path = `/api/audit-log${query ? `?${query}` : ""}`;
  return query || options.strict ? request<AuditLog[]>(path) : getWithNetworkFallback(path, []);
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  return getWithNetworkFallback("/api/admin/users", []);
}

export async function getSalesAgents(): Promise<StaffUser[]> {
  return getWithNetworkFallback("/api/sales-agents", []);
}

export async function getOcrUsageLimit(): Promise<AiUsageLimitSnapshot> {
  return request<AiUsageLimitSnapshot>("/api/admin/ai-limits/ocr");
}

export async function getHrStaffUsers(): Promise<StaffUser[]> {
  return getWithNetworkFallback("/api/hr/staff", fallbackHrStaffUsers(), { onNotFoundFallback: true });
}

export async function getHrAttendance(): Promise<HrAttendanceRecord[]> {
  return getWithNetworkFallback("/api/hr/attendance", fallbackHrAttendance(), { onNotFoundFallback: true });
}

export async function getHrBossCalendar(from: string, to: string): Promise<HrCalendarAvailability[]> {
  return getWithNetworkFallback(
    `/api/hr/boss-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    isLocalPreviewHost() ? fallbackHrBossCalendar(from, to) : []
  );
}

export async function getHrAttendanceNetworks(): Promise<HrAttendanceNetwork[]> {
  return getWithNetworkFallback("/api/hr/attendance-networks", []);
}

export async function createHrAttendanceNetwork(network: HrAttendanceNetwork): Promise<HrAttendanceNetwork> {
  return request<HrAttendanceNetwork>("/api/hr/attendance-networks", {
    method: "POST",
    body: JSON.stringify(network)
  });
}

export async function updateHrAttendanceNetwork(network: HrAttendanceNetwork): Promise<HrAttendanceNetwork> {
  return request<HrAttendanceNetwork>(`/api/hr/attendance-networks/${network.id}`, {
    method: "PUT",
    body: JSON.stringify(network)
  });
}

export async function checkInHrAttendance(): Promise<HrAttendanceRecord> {
  return requestWithNetworkFallback("/api/hr/attendance/check-in", { method: "POST" }, fallbackHrCheckInAttendance());
}

export async function checkOutHrAttendance(): Promise<HrAttendanceRecord> {
  return requestWithNetworkFallback("/api/hr/attendance/check-out", { method: "POST" }, fallbackHrCheckOutAttendance());
}

export async function getHrAttendanceDashboard(): Promise<HrAttendanceDashboardSummary> {
  return getWithNetworkFallback("/api/hr/dashboard", {
    checkedInToday: 0,
    checkedOutToday: 0,
    openSessionsToday: 0,
    officeQrSessionsToday: 0,
    manualSessionsToday: 0,
    outstationSessionsToday: 0,
    pendingBusinessTripRequests: 0,
    activeOutstationToday: 0,
    upcomingApprovedTrips: 0
  });
}

export async function getHrAvailabilityCalendar(): Promise<HrAvailabilityCalendarItem[]> {
  return getWithNetworkFallback("/api/hr/availability-calendar", []);
}

export async function getHrAttendanceReminderPolicies(): Promise<HrAttendanceReminderPolicy[]> {
  return getWithNetworkFallback("/api/hr/reminder-policies", []);
}

export async function updateHrAttendanceReminderPolicy(type: HrAttendanceReminderType, policy: Pick<HrAttendanceReminderPolicy, "isEnabled" | "leadHours">): Promise<HrAttendanceReminderPolicy> {
  return request<HrAttendanceReminderPolicy>(`/api/hr/reminder-policies/${type}`, { method: "PUT", body: JSON.stringify(policy) });
}

export async function getHrAttendanceReminders(): Promise<HrAttendanceReminderItem[]> {
  return getWithNetworkFallback("/api/hr/reminders", []);
}

export async function createHrAttendanceQrChallenge(): Promise<HrAttendanceQrChallenge> {
  return request<HrAttendanceQrChallenge>("/api/hr/attendance/qr/challenges", { method: "POST" });
}

export async function redeemHrAttendanceQr(requestBody: HrAttendanceQrRedemptionRequest): Promise<HrAttendanceRecord> {
  return request<HrAttendanceRecord>("/api/hr/attendance/qr/redeem", {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
}

export async function getHrBusinessTrips(): Promise<HrBusinessTrip[]> {
  return getWithNetworkFallback("/api/hr/business-trips", []);
}

export async function createHrBusinessTrip(trip: HrBusinessTrip): Promise<HrBusinessTrip> {
  return request<HrBusinessTrip>("/api/hr/business-trips", { method: "POST", body: JSON.stringify(trip) });
}

export async function decideHrBusinessTrip(tripId: string, status: Exclude<HrBusinessTripStatus, "Pending" | "Cancelled">, decisionNotes?: string): Promise<HrBusinessTrip> {
  return request<HrBusinessTrip>(`/api/hr/business-trips/${tripId}/decision`, { method: "PUT", body: JSON.stringify({ status, decisionNotes }) });
}

export async function cancelHrBusinessTrip(tripId: string): Promise<HrBusinessTrip> {
  return request<HrBusinessTrip>(`/api/hr/business-trips/${tripId}/cancel`, { method: "POST" });
}

export async function startHrOutstation(requestBody: HrOutstationAttendanceRequest): Promise<HrAttendanceRecord> {
  return request<HrAttendanceRecord>("/api/hr/attendance/outstation/start", { method: "POST", body: JSON.stringify(requestBody) });
}

export async function endHrOutstation(requestBody: HrOutstationAttendanceRequest): Promise<HrAttendanceRecord> {
  return request<HrAttendanceRecord>("/api/hr/attendance/outstation/end", { method: "POST", body: JSON.stringify(requestBody) });
}

export async function updateHrAttendance(attendance: HrAttendanceRecord): Promise<HrAttendanceRecord> {
  return request<HrAttendanceRecord>(`/api/hr/attendance/${attendance.id}`, {
    method: "PUT",
    body: JSON.stringify(attendance)
  });
}

export async function getHrLeaveRequests(): Promise<HrLeaveRequest[]> {
  return getWithNetworkFallback("/api/hr/leave-requests", fallbackHrLeaveRequests());
}

export async function createHrLeaveRequest(leave: HrLeaveRequest): Promise<HrLeaveRequest> {
  return request<HrLeaveRequest>("/api/hr/leave-requests", {
    method: "POST",
    body: JSON.stringify(leave)
  });
}

export async function decideHrLeaveRequest(leaveId: string, status: HrLeaveStatus, decisionNotes?: string): Promise<HrLeaveRequest> {
  return request<HrLeaveRequest>(`/api/hr/leave-requests/${leaveId}/decision`, {
    method: "PUT",
    body: JSON.stringify({ status, decisionNotes })
  });
}

export async function cancelHrLeaveRequest(leaveId: string): Promise<HrLeaveRequest> {
  return request<HrLeaveRequest>(`/api/hr/leave-requests/${leaveId}/cancel`, {
    method: "PUT"
  });
}

export async function uploadHrMedicalCertificate(leaveId: string, file: File) {
  return uploadFile(`/api/hr/leave-requests/${leaveId}/mc`, file);
}

export function hrMedicalCertificateContentUrl(leaveId: string) {
  return `${apiBaseUrl}/api/hr/leave-requests/${leaveId}/mc/content`;
}

export async function getHrLeaveBalances(): Promise<HrLeaveBalance[]> {
  return getWithNetworkFallback("/api/hr/leave-balances", fallbackHrLeaveBalances());
}

export async function getHrLeavePolicies(): Promise<HrLeavePolicy[]> {
  return getWithNetworkFallback("/api/hr/leave-policies", fallbackHrLeavePolicies());
}

export async function updateHrLeavePolicy(policy: HrLeavePolicy): Promise<HrLeavePolicy> {
  return request<HrLeavePolicy>(`/api/hr/leave-policies/${encodeURIComponent(policy.role)}`, {
    method: "PUT",
    body: JSON.stringify(policy)
  });
}

export async function updateHrLeaveBalance(balance: HrLeaveBalance): Promise<HrLeaveBalance> {
  return request<HrLeaveBalance>(`/api/hr/leave-balances/${encodeURIComponent(balance.staffUserId)}`, {
    method: "PUT",
    body: JSON.stringify(balance)
  });
}

export async function getHrLeaveAdjustments(): Promise<HrLeaveAdjustment[]> {
  return getWithNetworkFallback("/api/hr/leave-adjustments", fallbackHrLeaveAdjustments());
}

export async function createHrLeaveAdjustment(adjustment: HrLeaveAdjustmentRequest): Promise<HrLeaveAdjustmentResult> {
  return request<HrLeaveAdjustmentResult>("/api/hr/leave-adjustments", {
    method: "POST",
    body: JSON.stringify(adjustment)
  });
}

export async function getHrPayrollProfiles(): Promise<HrPayrollProfile[]> {
  return getWithNetworkFallback("/api/hr/payroll-profiles", fallbackHrPayrollProfiles());
}

export async function updateHrPayrollProfile(profile: HrPayrollProfile): Promise<HrPayrollProfile> {
  return request<HrPayrollProfile>(`/api/hr/payroll-profiles/${encodeURIComponent(profile.staffUserId)}`, {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export async function getHrPayPeriods(): Promise<HrPayPeriod[]> {
  return getWithNetworkFallback("/api/hr/pay-periods", fallbackHrPayPeriods());
}

export async function createHrPayPeriod(period: HrPayPeriod): Promise<HrPayPeriod> {
  return request<HrPayPeriod>("/api/hr/pay-periods", {
    method: "POST",
    body: JSON.stringify(period)
  });
}

export async function getHrPayslips(): Promise<HrPayslip[]> {
  return getWithNetworkFallback("/api/hr/payslips", fallbackHrPayslips());
}

export async function generateHrPayslips(payPeriodId: string): Promise<HrPayslip[]> {
  return request<HrPayslip[]>(`/api/hr/pay-periods/${payPeriodId}/generate-payslips`, { method: "POST" });
}

export async function createVehicle(vehicle: Vehicle): Promise<Vehicle> {
  return request<Vehicle>("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(vehicle)
  });
}

export async function createVehicleIntake(input: VehicleIntakeCreateInput, identityCard: File): Promise<VehicleIntakeCreateResponse> {
  const formData = new FormData();
  formData.append("request", JSON.stringify(input));
  formData.append("identityCard", identityCard);
  const response = await fetch(`${apiBaseUrl}/api/vehicle-intakes`, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Vehicle intake failed with status (${response.status})`));
  }

  return parseOptionalJson<VehicleIntakeCreateResponse>(response);
}

export async function updateVehicle(vehicle: Vehicle): Promise<Vehicle> {
  return request<Vehicle>(`/api/vehicles/${vehicle.id}`, {
    method: "PUT",
    body: JSON.stringify(vehicle)
  });
}

export function vehicleFromIntakeValues(values: VehicleIntakeValues, id: string): Vehicle {
  return {
    id,
    plateNumber: values.plateNumber,
    chassisNumber: values.chassisNumber?.trim() || undefined,
    engineNumber: values.engineNumber?.trim() || undefined,
    make: values.make,
    model: values.model,
    year: Number(values.year),
    stockOwner: values.stockOwner,
    stockLocation: values.stockLocation?.trim() || undefined,
    status: values.status,
    isPublic: values.isPublic,
    publicDescriptionMarkdown: values.publicDescriptionMarkdown?.trim() || undefined,
    purchasePrice: Number(values.purchasePrice ?? 0),
    sellingPrice: Number(values.sellingPrice ?? 0),
    additionalCharges: Number(values.additionalCharges ?? 0),
    refurbishmentTotal: Number(values.refurbishmentTotal ?? 0),
    commissionTotal: Number(values.commissionTotal ?? 0),
    bossConfirmed: Boolean(values.bossConfirmed),
    contraRangePrice: Number(values.contraRangePrice ?? 0),
    ucdStatus: values.ucdStatus?.trim() || undefined,
    customerId: values.customerId,
    ownerId: values.ownerId,
    outstationPickupAllowance: Number(values.outstationPickupAllowance ?? 0),
    outstationPickupScheduledAt: values.outstationPickupScheduledAt,
    outstationPickupBookingSlip: values.outstationPickupBookingSlip?.trim() || undefined
  };
}

export async function createCustomer(customer: Customer): Promise<Customer> {
  return request<Customer>("/api/customers", {
    method: "POST",
    body: JSON.stringify(customer)
  });
}

export async function updateCustomer(customer: Customer): Promise<Customer> {
  return request<Customer>(`/api/customers/${customer.id}`, {
    method: "PUT",
    body: JSON.stringify(customer)
  });
}

export async function createOwner(owner: Owner): Promise<Owner> {
  return request<Owner>("/api/owners", {
    method: "POST",
    body: JSON.stringify(owner)
  });
}

export async function updateOwner(owner: Owner): Promise<Owner> {
  return request<Owner>(`/api/owners/${owner.id}`, {
    method: "PUT",
    body: JSON.stringify(owner)
  });
}

export async function createPurchaseInvoice(invoice: PurchaseInvoice): Promise<PurchaseInvoice> {
  return request<PurchaseInvoice>("/api/purchase-invoices", {
    method: "POST",
    body: JSON.stringify(invoice)
  });
}

export async function updatePurchaseInvoice(invoice: PurchaseInvoice): Promise<PurchaseInvoice> {
  return request<PurchaseInvoice>(`/api/purchase-invoices/${invoice.id}`, {
    method: "PUT",
    body: JSON.stringify(invoice)
  });
}

export async function confirmPurchaseInvoiceAccounting(invoiceId: string): Promise<PurchaseInvoice> {
  return request<PurchaseInvoice>(`/api/purchase-invoices/${invoiceId}/confirm-accounting`, { method: "POST" });
}

export function customerFromLead(lead: Lead, id: string): Customer {
  return {
    id,
    name: lead.customerName,
    phone: lead.phone,
    notes: lead.message ? `Lead enquiry: ${lead.message}` : undefined
  };
}

export function customerSelectLabel(customer: Customer) {
  return [customer.name, customer.phone, customer.icNumber, customer.address].filter(Boolean).join(" / ");
}

export async function createSupplierInvoice(invoice: SupplierInvoice): Promise<SupplierInvoice> {
  return request<SupplierInvoice>("/api/supplier-invoices", {
    method: "POST",
    body: JSON.stringify(invoice)
  });
}

export async function updateSupplierInvoice(invoice: SupplierInvoice): Promise<SupplierInvoice> {
  return request<SupplierInvoice>(`/api/supplier-invoices/${invoice.id}`, {
    method: "PUT",
    body: JSON.stringify(invoice)
  });
}

export async function createSupplier(supplier: Supplier): Promise<Supplier> {
  return request<Supplier>("/api/supplier-master", { method: "POST", body: JSON.stringify(supplier) });
}

export async function updateSupplier(supplier: Supplier): Promise<Supplier> {
  return request<Supplier>(`/api/supplier-master/${supplier.id}`, { method: "PUT", body: JSON.stringify(supplier) });
}

export async function approveSupplier(supplierId: string): Promise<Supplier> {
  return request<Supplier>(`/api/supplier-master/${supplierId}/approve`, { method: "POST" });
}

export async function createRepair(repair: RepairJob): Promise<RepairJob> {
  return request<RepairJob>("/api/repairs", {
    method: "POST",
    body: JSON.stringify(repair)
  });
}

export async function updateRepair(repair: RepairJob): Promise<RepairJob> {
  return request<RepairJob>(`/api/repairs/${repair.id}`, {
    method: "PUT",
    body: JSON.stringify(repair)
  });
}

export async function createRepairWithReceipt(requestBody: CreateRepairWithReceiptRequest): Promise<CreateRepairWithReceiptResponse> {
  return request<CreateRepairWithReceiptResponse>("/api/repairs/from-receipt", {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
}

export async function approveRepair(repairId: string, notes?: string): Promise<RepairJob> {
  return request<RepairJob>(`/api/repairs/${repairId}/approval`, {
    method: "POST",
    body: JSON.stringify({ notes: notes?.trim() || undefined })
  });
}

export async function confirmRepairReceipt(repairId: string, receipt: ConfirmRepairReceiptRequest) {
  return request(`/api/repairs/${repairId}/receipts/confirm`, {
    method: "POST",
    body: JSON.stringify(receipt)
  });
}

export async function getRepairReceipts(repairId: string): Promise<RepairReceiptWithItems[]> {
  return request<RepairReceiptWithItems[]>(`/api/repairs/${repairId}/receipts`);
}

export async function createLoan(loan: LoanApplication): Promise<LoanApplication> {
  return request<LoanApplication>("/api/loans", {
    method: "POST",
    body: JSON.stringify(loan)
  });
}

export async function createDelivery(delivery: DeliverySchedule): Promise<DeliverySchedule> {
  return request<DeliverySchedule>("/api/deliveries", {
    method: "POST",
    body: JSON.stringify(delivery)
  });
}

export async function createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
  return request<PaymentRecord>("/api/payments", {
    method: "POST",
    body: JSON.stringify(payment)
  });
}

export async function decideLoan(loanId: string, status: LoanDecisionStatus, rejectionReason?: string): Promise<LoanApplication> {
  return request<LoanApplication>(`/api/loans/${loanId}/decision`, {
    method: "POST",
    body: JSON.stringify({ status, rejectionReason })
  });
}

export async function createFinanceSale(input: FinanceSaleInput): Promise<PaymentRecord> {
  return request<PaymentRecord>("/api/payments/finance-sale", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createStaffUser(user: CreateStaffUserRequest): Promise<StaffUser> {
  return request<StaffUser>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(user)
  });
}

export async function updateStaffUser(userId: string, requestBody: UpdateStaffUserRequest): Promise<StaffUser> {
  return request<StaffUser>(`/api/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(requestBody)
  });
}

export async function resetStaffUserPassword(userId: string, requestBody: ResetStaffPasswordRequest): Promise<StaffUser> {
  return request<StaffUser>(`/api/admin/users/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify(requestBody)
  });
}

export async function updateStaffUserStatus(userId: string, requestBody: UpdateStaffUserStatusRequest): Promise<StaffUser> {
  return request<StaffUser>(`/api/admin/users/${userId}/status`, {
    method: "PUT",
    body: JSON.stringify(requestBody)
  });
}

export async function updateStaffUserRoles(userId: string, roles: StaffRole[]): Promise<StaffUser> {
  return request<StaffUser>(`/api/admin/users/${userId}/roles`, {
    method: "PUT",
    body: JSON.stringify({ roles } satisfies UpdateStaffUserRolesRequest)
  });
}

export async function updateLoan(loan: LoanApplication): Promise<LoanApplication> {
  return request<LoanApplication>(`/api/loans/${loan.id}`, {
    method: "PUT",
    body: JSON.stringify(loan)
  });
}

export async function updateLead(lead: Lead): Promise<Lead> {
  return request<Lead>(`/api/leads/${lead.id}`, {
    method: "PUT",
    body: JSON.stringify(lead)
  });
}

export async function updateDelivery(delivery: DeliverySchedule): Promise<DeliverySchedule> {
  return request<DeliverySchedule>(`/api/deliveries/${delivery.id}`, {
    method: "PUT",
    body: JSON.stringify(delivery)
  });
}

export async function releaseDelivery(deliveryId: string): Promise<DeliverySchedule> {
  return request<DeliverySchedule>(`/api/deliveries/${deliveryId}/release`, {
    method: "POST"
  });
}

export async function cancelDelivery(deliveryId: string, reason: string): Promise<DeliverySchedule> {
  return request<DeliverySchedule>(`/api/deliveries/${deliveryId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function requestDeliveryInvoiceUpdate(deliveryId: string, reason: string): Promise<DeliverySchedule> {
  return request<DeliverySchedule>(`/api/deliveries/${deliveryId}/request-invoice-update`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function correctDeliveryBuyer(deliveryId: string, customerId: string, reason: string): Promise<DeliverySchedule> {
  return request<DeliverySchedule>(`/api/deliveries/${deliveryId}/correct-buyer`, {
    method: "POST",
    body: JSON.stringify({ customerId, reason })
  });
}

export async function getDeliveryInvoiceUpdateRequests(): Promise<DeliveryInvoiceUpdateRequestItem[]> {
  return request<DeliveryInvoiceUpdateRequestItem[]>("/api/deliveries/invoice-update-requests");
}

export async function resolveDeliveryInvoiceUpdate(deliveryId: string): Promise<{ id: string; resolvedAt: string }> {
  return request<{ id: string; resolvedAt: string }>(`/api/deliveries/${deliveryId}/resolve-invoice-update`, {
    method: "POST"
  });
}

export async function updatePayment(payment: PaymentRecord): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${payment.id}`, {
    method: "PUT",
    body: JSON.stringify(payment)
  });
}

export async function approvePaymentManagementReview(paymentId: string): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${paymentId}/management-review`, {
    method: "POST"
  });
}

export async function approveNettPriceOverride(paymentId: string): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${paymentId}/nett-price-override/approve`, { method: "POST" });
}

export async function issueFinanceInvoice(paymentId: string): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${paymentId}/invoice`, { method: "POST" });
}

export async function createCollection(paymentId: string, input: CollectionCreateInput): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${paymentId}/collections`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateCollectionFinancingStatus(collectionId: string, status: FinancingStatus): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/collection-transactions/${collectionId}/financing-status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function reconcileCollection(collectionId: string): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/collection-transactions/${collectionId}/reconcile`, { method: "POST" });
}

export async function reverseCollection(collectionId: string, reason: string): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/collection-transactions/${collectionId}/reverse`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export function financeInvoiceContentUrl(invoiceId: string) {
  return `${apiBaseUrl}/api/finance-invoices/${invoiceId}/content`;
}

export function paymentVoucherPdfUrl(voucherId: string) {
  return `${apiBaseUrl}/api/payment-vouchers/${voucherId}/pdf`;
}

export async function updateOcrUsageLimit(requestBody: UpdateAiServiceLimitRequest): Promise<AiUsageLimitSnapshot> {
  return request<AiUsageLimitSnapshot>("/api/admin/ai-limits/ocr", {
    method: "PUT",
    body: JSON.stringify(requestBody)
  });
}

export async function createVehicleCatalogModel(model: VehicleCatalogModelInput): Promise<VehicleCatalogModel> {
  return request<VehicleCatalogModel>("/api/vehicle-catalog/models", {
    method: "POST",
    body: JSON.stringify(model)
  });
}

export async function updateVehicleCatalogModel(id: string, model: VehicleCatalogModelInput): Promise<VehicleCatalogModel> {
  return request<VehicleCatalogModel>(`/api/vehicle-catalog/models/${id}`, {
    method: "PUT",
    body: JSON.stringify(model)
  });
}

export async function createCashHandover(paymentRecordId: string, amount: number, notes?: string): Promise<CashHandover> {
  return request<CashHandover>("/api/cash-handovers", {
    method: "POST",
    body: JSON.stringify({ paymentRecordId, amount, notes })
  });
}

export async function requestCashHandover(id: string): Promise<CashHandover> {
  return request<CashHandover>(`/api/cash-handovers/${id}/request-handover`, { method: "POST" });
}

export async function recordCashHandover(id: string): Promise<CashHandover> {
  return request<CashHandover>(`/api/cash-handovers/${id}/hand-over`, { method: "POST" });
}

export async function acceptCashHandover(id: string): Promise<CashHandover> {
  return request<CashHandover>(`/api/cash-handovers/${id}/accept`, { method: "POST" });
}

export async function rejectCashHandover(id: string, reason: string): Promise<CashHandover> {
  return request<CashHandover>(`/api/cash-handovers/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function createSettlementReminder(reminder: SettlementReminder): Promise<SettlementReminder> {
  return request<SettlementReminder>("/api/settlement-reminders", {
    method: "POST",
    body: JSON.stringify(reminder)
  });
}

export async function updateSettlementReminder(reminder: SettlementReminder): Promise<SettlementReminder> {
  return request<SettlementReminder>(`/api/settlement-reminders/${reminder.id}`, {
    method: "PUT",
    body: JSON.stringify(reminder)
  });
}

export async function createDailySpend(spend: DailySpend): Promise<DailySpend> {
  return request<DailySpend>("/api/daily-spends", {
    method: "POST",
    body: JSON.stringify(spend)
  });
}

export async function updateDailySpend(spend: DailySpend): Promise<DailySpend> {
  return request<DailySpend>(`/api/daily-spends/${spend.id}`, {
    method: "PUT",
    body: JSON.stringify(spend)
  });
}

export async function createBrokerCommission(commission: BrokerCommission): Promise<BrokerCommission> {
  return request<BrokerCommission>("/api/broker-commissions", {
    method: "POST",
    body: JSON.stringify(commission)
  });
}

export async function updateBrokerCommission(commission: BrokerCommission): Promise<BrokerCommission> {
  return request<BrokerCommission>(`/api/broker-commissions/${commission.id}`, {
    method: "PUT",
    body: JSON.stringify(commission)
  });
}

export async function createDebtRecovery(debt: DebtRecoveryCase): Promise<DebtRecoveryCase> {
  return request<DebtRecoveryCase>("/api/debt-recoveries", {
    method: "POST",
    body: JSON.stringify(debt)
  });
}

export async function updateDebtRecovery(debt: DebtRecoveryCase): Promise<DebtRecoveryCase> {
  return request<DebtRecoveryCase>(`/api/debt-recoveries/${debt.id}`, {
    method: "PUT",
    body: JSON.stringify(debt)
  });
}

export async function createPaymentVoucher(voucher: PaymentVoucher): Promise<PaymentVoucher> {
  return request<PaymentVoucher>("/api/payment-vouchers", {
    method: "POST",
    body: JSON.stringify(voucher)
  });
}

export async function updatePaymentVoucher(voucher: PaymentVoucher): Promise<PaymentVoucher> {
  return request<PaymentVoucher>(`/api/payment-vouchers/${voucher.id}`, {
    method: "PUT",
    body: JSON.stringify(voucher)
  });
}

export async function approvePaymentVoucher(voucherId: string): Promise<PaymentVoucher> {
  return request<PaymentVoucher>(`/api/payment-vouchers/${voucherId}/approve`, { method: "POST" });
}

export async function markPaymentVoucherPaid(voucherId: string, paymentEvidenceReference: string): Promise<PaymentVoucher> {
  return request<PaymentVoucher>(`/api/payment-vouchers/${voucherId}/mark-paid`, {
    method: "POST",
    body: JSON.stringify({ paymentEvidenceReference })
  });
}

export async function getVehicleDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/vehicles/${vehicleId}/documents`, { credentials: "include" });
    if (response.ok) return response.json();
  } catch {
    return [];
  }
  return [];
}

export async function getVehicleDocumentsStrict(vehicleId: string, errorMessage = "Unable to load finance evidence"): Promise<VehicleDocument[]> {
  return request<VehicleDocument[]>(`/api/vehicles/${vehicleId}/documents`, {}, errorMessage);
}

export async function getVehicleOcrJobs(vehicleId: string): Promise<VehicleOcrJob[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/vehicles/${vehicleId}/ocr-jobs`, { credentials: "include" });
    if (response.ok) return response.json();
  } catch {
    return [];
  }
  return [];
}

export async function getStockMovements(vehicleId: string): Promise<StockMovement[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/vehicles/${vehicleId}/stock-movements`, { credentials: "include" });
    if (response.ok) return response.json();
  } catch {
    return [];
  }
  return [];
}

export async function getVehiclePhotos(vehicleId: string): Promise<VehiclePhoto[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/vehicles/${vehicleId}/photos`, { credentials: "include" });
    if (response.ok) return response.json();
  } catch {
    return [];
  }
  return [];
}

export function vehicleDocumentContentUrl(vehicleId: string, documentId: string) {
  return `${apiBaseUrl}/api/vehicles/${vehicleId}/documents/${documentId}/content`;
}

export async function getVehicleDocumentContent(vehicleId: string, documentId: string): Promise<Blob> {
  const response = await fetch(vehicleDocumentContentUrl(vehicleId, documentId), { credentials: "include" });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Unable to load document preview (${response.status})`));
  }
  return response.blob();
}

export function officialReceiptContentUrl(cashHandoverId: string) {
  return `${apiBaseUrl}/api/cash-handovers/${cashHandoverId}/official-receipt/content`;
}

export function vehiclePhotoContentUrl(vehicleId: string, photoId: string) {
  return `${apiBaseUrl}/api/vehicles/${vehicleId}/photos/${photoId}/content`;
}

export async function uploadVehiclePhoto(vehicleId: string, file: File) {
  return uploadFile(`/api/vehicles/${vehicleId}/photos`, file, {
    isRepresentativeImage: "false"
  });
}

export async function uploadVehicleDocument(vehicleId: string, file: File, category: DocumentCategory, owner?: DocumentUploadOwner): Promise<VehicleDocument> {
  return uploadFile<VehicleDocument>(documentUploadPath(vehicleId, category, owner), file);
}

export async function uploadVehicleDocumentWithProgress(vehicleId: string, file: File, category: DocumentCategory, onProgress?: UploadProgressHandler, owner?: DocumentUploadOwner): Promise<VehicleDocument> {
  return uploadFileWithProgress<VehicleDocument>(documentUploadPath(vehicleId, category, owner), file, onProgress);
}

export async function previewOwnerIdentityCard(file: File, onProgress?: UploadProgressHandler): Promise<OwnerIdentityCardPreview> {
  return uploadFileWithProgress<OwnerIdentityCardPreview>("/api/owner-intakes/identity-card-preview", file, onProgress);
}

function documentUploadPath(vehicleId: string, category: DocumentCategory, owner?: DocumentUploadOwner) {
  const query = new URLSearchParams({ category });
  if (owner?.ownershipType) query.set("ownershipType", owner.ownershipType);
  if (owner?.customerId) query.set("customerId", owner.customerId);
  if (owner?.ownerId) query.set("ownerId", owner.ownerId);
  if (owner?.repairJobId) query.set("repairJobId", owner.repairJobId);
  if (owner?.paymentRecordId) query.set("paymentRecordId", owner.paymentRecordId);
  if (owner?.collectionTransactionId) query.set("collectionTransactionId", owner.collectionTransactionId);
  if (owner?.deliveryScheduleId) query.set("deliveryScheduleId", owner.deliveryScheduleId);
  return `/api/vehicles/${vehicleId}/documents?${query.toString()}`;
}

export async function startOcrJob(documentId: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/documents/${documentId}/ocr-jobs`, { method: "POST" });
}

export async function getOcrJob(jobId: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/ocr-jobs/${jobId}`);
}

export async function reviewOcrJob(jobId: string, result: OcrReviewedResult, notes?: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/ocr-jobs/${jobId}/review`, {
    method: "PUT",
    body: JSON.stringify({ result, notes })
  });
}

async function request<T = unknown>(path: string, init: RequestInit = {}, errorMessage = `Request failed with status`): Promise<T> {
  const headers = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...init.headers
  };
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    ...(Object.keys(headers).length ? { headers } : {})
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `${errorMessage} (${response.status})`));
  }

  return parseOptionalJson<T>(response);
}

async function requestWithNetworkFallback<T = unknown>(
  path: string,
  init: RequestInit = {},
  fallback: T,
  errorMessage = `Request failed with status`
): Promise<T> {
  const headers = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...init.headers
  };
  let response: Response | null = null;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      ...(Object.keys(headers).length ? { headers } : {})
    });

    if (response.ok) {
      return parseOptionalJson<T>(response);
    }

    if (response.status === 404) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  throw new Error(await responseErrorMessage(response, `${errorMessage} (${response.status})`));
}

async function uploadFile<T = unknown>(path: string, file: File, fields?: Record<string, string>): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(fields ?? {}).forEach(([name, value]) => formData.append(name, value));
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response, `Upload failed with status ${response.status}`));
  }

  return parseOptionalJson<T>(response);
}

async function uploadFileWithProgress<T = unknown>(path: string, file: File, onProgress?: UploadProgressHandler): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBaseUrl}${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.responseText.trim() ? JSON.parse(xhr.responseText) as T : undefined as T);
        return;
      }
      const responseMessage = extractErrorMessage(xhr.responseText);
      reject(new Error(humanizeApiError(new Error(responseMessage ?? `Upload failed with status (${xhr.status})`), "Upload failed. Please check the file and try again.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please check the file and try again."));
    xhr.send(formData);
  });
}

async function getWithNetworkFallback<T>(path: string, fallback: T, options: { onNotFoundFallback?: boolean } = {}): Promise<T> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
    if (response.ok) return response.json();
    if (response.status === 404 && options.onNotFoundFallback) return fallback;
    if (response.status === 401 || response.status === 403) return emptyLike(fallback);
  } catch {
    return fallback;
  }
  return emptyLike(fallback);
}

function emptyLike<T>(value: T): T {
  return Array.isArray(value) ? ([] as T) : value;
}

async function parseOptionalJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

async function responseErrorMessage(response: Response, fallback: string) {
  const text = await response.text();
  const extractedMessage = extractErrorMessage(text);
  if (extractedMessage) return extractedMessage;
  if (response.status === 401) {
    return "Login failed. Please check your email and password.";
  }
  if (response.status === 400) {
    return `${fallback} (empty or malformed request payload).`;
  }
  return fallback;
}

function extractErrorMessage(text: string) {
  if (!text.trim()) return null;

  try {
    const body = JSON.parse(text);
    const firstError = Array.isArray(body?.errors) ? body.errors[0] : undefined;
    if (firstError?.message) return String(firstError.message);
    if (body?.message) return String(body.message);
    if (body?.detail) return String(body.detail);
    if (body?.title) return String(body.title);
    if (body?.error) return String(body.error);
    if (body?.errors && typeof body.errors === "object" && !Array.isArray(body.errors)) {
      const values = Object.values(body.errors)
        .map((value) => (Array.isArray(value) ? value[0] : value))
        .filter((value) => typeof value === "string" && value.trim());
      if (values[0]) return String(values[0]);
    }
  } catch {
    if (!/^\s*<!doctype html|^\s*<html/i.test(text)) return text.trim();
  }

  return null;
}

function fallbackSupplierInvoices(): SupplierInvoice[] {
  return [
    {
      id: "329980d0-2e38-4d8c-872e-85ae013b8275",
      vehicleId: sampleVehicle.id,
      supplierName: "ABC Spray",
      invoiceNumber: "INV-1001",
      plateNumberOnInvoice: sampleVehicle.plateNumber,
      amount: 800,
      dueDate: "2026-06-07"
    }
  ];
}

function fallbackPurchaseInvoices(): PurchaseInvoice[] {
  return [
    {
      id: "1c8ff681-b827-41a8-8358-c05bdfbe8f18",
      vehicleId: sampleVehicle.id,
      invoiceNumber: "PI-1001",
      amount: 42000
    }
  ];
}

function fallbackLoans(): LoanApplication[] {
  return [
    {
      id: "66fa62b8-2f50-4499-9a65-3e93061bb84b",
      vehicleId: sampleVehicle.id,
      customerId: "863a9059-aac6-42f0-8616-f452c9221770",
      status: "Pending",
      louApproved: true,
      louDone: false,
      submittedAt: "2026-05-30"
    }
  ];
}

function fallbackDeliveries(): DeliverySchedule[] {
  return [
    {
      id: "e352ce93-6b76-49e3-9f91-804f99066f45",
      vehicleId: sampleVehicle.id,
      pic: "Ah Ming",
      status: "ReadyForRelease",
      scheduledDate: "2026-06-03",
      polishDone: true,
      tintedDone: true,
      washDone: false,
      documentsPrepared: true,
      inspectionDone: true,
      inspectionBookingReference: "BOOK-DEMO-1001",
      inspectionReportReference: "INSPECT-DEMO-1001",
      notificationSent: true,
      twoDayNoticeSent: true,
      insuranceHandled: true,
      insurancePolicyReference: "POL-DEMO-1001",
      insuranceExpiryDate: "2026-06-30",
      roadTaxHandled: true,
      roadTaxReceiptReference: "RT-DEMO-1001",
      roadTaxExpiryDate: "2026-06-30",
      windscreenInsuranceHandled: true,
      windscreenPolicyReference: "WS-DEMO-1001",
      windscreenInsuranceExpiryDate: "2026-06-30",
      handoverPhotoCaptured: true,
      signedHandoverReceived: true,
      customerAcknowledged: true,
      finalChecklistConfirmed: true
    }
  ];
}

function fallbackLeads(): Lead[] {
  return [
    {
      id: "1b5c8091-e3ee-4f5b-b23c-0375ea0eac1d",
      vehicleId: sampleVehicle.id,
      customerName: "Tan Wei Sheng",
      phone: "012-345 6789",
      message: "Wants to view after work in Kluang and check loan monthly payment.",
      sourcePage: "/vehicles/9f5d6f16-9bb5-46b9-bb13-e8a8b3534737?utm_source=facebook&utm_campaign=vios",
      sourceReferrer: "https://facebook.com/",
      sourceCampaign: "utm_source=facebook&utm_campaign=vios",
      status: "New",
      createdAt: "2026-05-30T00:00:00Z"
    },
    {
      id: "0ce6aef4-1b73-4b15-94ce-c3d22f6c6a35",
      vehicleId: sampleVehicle.id,
      customerName: "Nur Aisyah",
      phone: "011-2088 7721",
      message: "Asking if the Vios is still available and whether trade-in is accepted.",
      status: "Contacted",
      createdAt: "2026-05-31T03:30:00Z",
      takenByUserId: "staff-demo-sales",
      takenByName: "Jason Tan",
      takenAt: "2026-05-31T04:00:00Z"
    },
    {
      id: "de365225-747e-4d24-88b2-6ecce073c0f6",
      vehicleId: sampleVehicle.id,
      customerName: "Raj Kumar",
      phone: "016-771 9032",
      message: "Needs a low-maintenance car for daily Johor commute.",
      status: "New",
      createdAt: "2026-06-01T02:15:00Z"
    },
    {
      id: "5ca9381f-1211-4100-a3c5-e053713a4d2d",
      vehicleId: sampleVehicle.id,
      customerName: "Lim Mei Ling",
      phone: "017-662 1180",
      message: "Checking down payment, bank loan options, and viewing slot this weekend.",
      status: "New",
      createdAt: "2026-06-01T07:45:00Z"
    },
    {
      id: "f7c8b995-ddb5-4f6d-9e5d-556e4219294e",
      vehicleId: sampleVehicle.id,
      customerName: "Ahmad Faiz",
      phone: "013-904 5527",
      message: "Interested for family use; wants road tax and insurance estimate.",
      status: "Closed",
      createdAt: "2026-06-02T01:00:00Z"
    }
  ];
}

function fallbackHrStaffUsers(): StaffUser[] {
  return [
    {
      id: "staff-demo-hr",
      email: "hr@ysheng.local",
      displayName: "Mei Ling",
      roles: ["HrSalary"],
      isActive: true
    },
    {
      id: "staff-demo-sales",
      email: "sales@ysheng.local",
      displayName: "Jason Tan",
      roles: ["Sales"],
      isActive: true
    },
    {
      id: "staff-demo-delivery",
      email: "delivery@ysheng.local",
      displayName: "Ah Ming",
      roles: ["Delivery"],
      isActive: true
    }
  ];
}

function fallbackHrAttendance(): HrAttendanceRecord[] {
  return [
    {
      id: "attendance-demo-1",
      staffUserId: "staff-demo-sales",
      attendanceDate: "2026-06-06",
      checkInAt: "2026-06-06T01:03:00Z",
      checkOutAt: "2026-06-06T10:16:00Z",
      status: "Present",
      verificationMethod: "OfficeIp",
      officeNetworkLabel: "Showroom",
      notes: "Showroom duty"
    },
    {
      id: "attendance-demo-2",
      staffUserId: "staff-demo-delivery",
      attendanceDate: "2026-06-06",
      checkInAt: "2026-06-06T01:28:00Z",
      status: "Late",
      verificationMethod: "OfficeIp",
      officeNetworkLabel: "Showroom",
      notes: "JPJ runner queue"
    },
    {
      id: "attendance-demo-3",
      staffUserId: "staff-demo-hr",
      attendanceDate: "2026-06-05",
      checkInAt: "2026-06-05T00:55:00Z",
      checkOutAt: "2026-06-05T09:42:00Z",
      status: "Present",
      verificationMethod: "OfficeIp",
      officeNetworkLabel: "Showroom",
      notes: "Payroll review completed"
    }
  ];
}

function fallbackHrClockState(): { today: string; now: string } {
  const now = new Date();
  return { today: now.toISOString().slice(0, 10), now: now.toISOString() };
}

function fallbackHrCheckInAttendance(): HrAttendanceRecord {
  const clock = fallbackHrClockState();
  return {
    id: `attendance-demo-${clock.today}`,
    staffUserId: fallbackHrStaffUsers()[0]?.id ?? "staff-demo-hr",
    attendanceDate: clock.today,
    checkInAt: clock.now,
    status: "Present",
    verificationMethod: "OfficeIp",
    officeNetworkLabel: "Showroom",
    notes: "Demo check-in"
  };
}

function fallbackHrCheckOutAttendance(): HrAttendanceRecord {
  const clock = fallbackHrClockState();
  return {
    id: `attendance-demo-${clock.today}`,
    staffUserId: fallbackHrStaffUsers()[0]?.id ?? "staff-demo-hr",
    attendanceDate: clock.today,
    checkInAt: clock.now,
    checkOutAt: clock.now,
    status: "Present",
    verificationMethod: "OfficeIp",
    officeNetworkLabel: "Showroom",
    notes: "Demo check-out"
  };
}

function fallbackHrBossCalendar(from: string, to: string): HrCalendarAvailability[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];

  const month = from.slice(0, 7);
  return [
    { staffUserId: "staff-demo-sales", staffName: "Jason Tan", date: `${month}-04`, status: "Unavailable" as const },
    { staffUserId: "staff-demo-delivery", staffName: "Ah Ming", date: `${month}-05`, status: "Unavailable" as const },
    { staffUserId: "staff-demo-hr", staffName: "Mei Ling", date: `${month}-05`, status: "Unavailable" as const },
    { staffUserId: "staff-demo-sales", staffName: "Jason Tan", date: `${month}-14`, status: "Unavailable" as const },
    { staffUserId: "staff-demo-delivery", staffName: "Ah Ming", date: `${month}-20`, status: "Unavailable" as const }
  ].filter((item) => item.date >= from && item.date <= to);
}

function isLocalPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname.toLowerCase());
}

function fallbackHrLeaveRequests(): HrLeaveRequest[] {
  return [
    {
      id: "leave-demo-1",
      staffUserId: "staff-demo-sales",
      type: "AnnualLeave",
      status: "Pending",
      startDate: "2026-06-10",
      endDate: "2026-06-11",
      days: 2,
      reason: "Family appointment",
      createdAt: "2026-06-05T03:20:00Z"
    },
    {
      id: "leave-demo-2",
      staffUserId: "staff-demo-delivery",
      type: "MedicalLeave",
      status: "Approved",
      startDate: "2026-06-04",
      endDate: "2026-06-04",
      days: 1,
      reason: "Clinic visit",
      medicalCertificateDocumentId: "mc-demo-1",
      approvedBy: "staff-demo-hr",
      approvedAt: "2026-06-04T08:30:00Z",
      decisionNotes: "MC received",
      createdAt: "2026-06-04T02:10:00Z"
    },
    {
      id: "leave-demo-3",
      staffUserId: "staff-demo-hr",
      type: "UnpaidLeave",
      status: "Rejected",
      startDate: "2026-06-14",
      endDate: "2026-06-14",
      days: 1,
      reason: "Personal errand",
      approvedBy: "staff-demo-hr",
      approvedAt: "2026-06-05T07:10:00Z",
      decisionNotes: "Payroll closing week",
      createdAt: "2026-06-05T05:45:00Z"
    }
  ];
}

function fallbackHrLeaveBalances(): HrLeaveBalance[] {
  return [
    {
      id: "balance-demo-1",
      staffUserId: "staff-demo-sales",
      annualLeaveDays: 10,
      medicalLeaveDays: 13,
      notes: "Two AL days pending approval"
    },
    {
      id: "balance-demo-2",
      staffUserId: "staff-demo-delivery",
      annualLeaveDays: 8,
      medicalLeaveDays: 12,
      notes: "One MC used in June"
    },
    {
      id: "balance-demo-3",
      staffUserId: "staff-demo-hr",
      annualLeaveDays: 12,
      medicalLeaveDays: 14,
      notes: "Full-year entitlement"
    }
  ];
}

function fallbackHrLeavePolicies(): HrLeavePolicy[] {
  return staffRoleValues.map((role) => ({
    id: `policy-demo-${role}`,
    role,
    annualLeaveDays: 12,
    medicalLeaveDays: 14,
    notes: "Default full-time entitlement"
  }));
}

function fallbackHrLeaveAdjustments(): HrLeaveAdjustment[] {
  return [
    {
      id: "leave-adjustment-demo-1",
      staffUserId: "staff-demo-sales",
      type: "AnnualLeave",
      direction: "Increase",
      days: 1,
      annualLeaveBefore: 9,
      medicalLeaveBefore: 13,
      annualLeaveAfter: 10,
      medicalLeaveAfter: 13,
      reason: "Carry forward approved",
      adjustedBy: "admin@ysheng.local",
      createdAt: "2026-06-06T02:20:00Z"
    }
  ];
}

function fallbackHrPayrollProfiles(): HrPayrollProfile[] {
  return [
    {
      id: "profile-demo-1",
      staffUserId: "staff-demo-sales",
      employmentType: "Monthly",
      monthlyBaseSalary: 3200,
      hourlyRate: 0,
      overtimeHours: 4,
      overtimeRate: 18,
      allowances: 250,
      manualDeductions: 0,
      notes: "Sales floor allowance"
    },
    {
      id: "profile-demo-2",
      staffUserId: "staff-demo-delivery",
      employmentType: "Monthly",
      monthlyBaseSalary: 2800,
      hourlyRate: 0,
      overtimeHours: 6,
      overtimeRate: 16,
      allowances: 180,
      manualDeductions: 50,
      notes: "Runner allowance, uniform deduction"
    },
    {
      id: "profile-demo-3",
      staffUserId: "staff-demo-hr",
      employmentType: "Monthly",
      monthlyBaseSalary: 3600,
      hourlyRate: 0,
      overtimeHours: 2,
      overtimeRate: 20,
      allowances: 200,
      manualDeductions: 0,
      notes: "HR administration"
    }
  ];
}

function fallbackHrPayPeriods(): HrPayPeriod[] {
  return [
    {
      id: "period-demo-2026-06",
      name: "June 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      workingDays: 22,
      createdAt: "2026-06-01T00:00:00Z"
    },
    {
      id: "period-demo-2026-05",
      name: "May 2026",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      workingDays: 22,
      createdAt: "2026-05-01T00:00:00Z"
    }
  ];
}

function fallbackHrPayslips(): HrPayslip[] {
  return [
    {
      id: "payslip-demo-1",
      staffUserId: "staff-demo-sales",
      payPeriodId: "period-demo-2026-05",
      status: "Generated",
      employmentType: "Monthly",
      baseSalary: 3200,
      hourlyRate: 0,
      workedHours: 0,
      attendancePay: 0,
      workingDays: 22,
      dailySalary: 145.45,
      unpaidLeaveDays: 0,
      unpaidLeaveDeduction: 0,
      overtimePay: 72,
      allowances: 250,
      manualDeductions: 0,
      grossPay: 3522,
      netPay: 3522,
      generatedAt: "2026-05-31T10:00:00Z"
    },
    {
      id: "payslip-demo-2",
      staffUserId: "staff-demo-delivery",
      payPeriodId: "period-demo-2026-05",
      status: "Generated",
      employmentType: "Monthly",
      baseSalary: 2800,
      hourlyRate: 0,
      workedHours: 0,
      attendancePay: 0,
      workingDays: 22,
      dailySalary: 127.27,
      unpaidLeaveDays: 1,
      unpaidLeaveDeduction: 127.27,
      overtimePay: 96,
      allowances: 180,
      manualDeductions: 50,
      grossPay: 3076,
      netPay: 2898.73,
      generatedAt: "2026-05-31T10:05:00Z"
    },
    {
      id: "payslip-demo-3",
      staffUserId: "staff-demo-hr",
      payPeriodId: "period-demo-2026-05",
      status: "Generated",
      employmentType: "Monthly",
      baseSalary: 3600,
      hourlyRate: 0,
      workedHours: 0,
      attendancePay: 0,
      workingDays: 22,
      dailySalary: 163.64,
      unpaidLeaveDays: 0,
      unpaidLeaveDeduction: 0,
      overtimePay: 40,
      allowances: 200,
      manualDeductions: 0,
      grossPay: 3840,
      netPay: 3840,
      generatedAt: "2026-05-31T10:10:00Z"
    }
  ];
}

function vehicleLookupFromVehicle(vehicle: Vehicle): VehicleLookup {
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    stockOwner: vehicle.stockOwner,
    status: vehicle.status,
    customerId: vehicle.customerId
  };
}
