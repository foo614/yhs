export type StockOwner = "YSHeng" | "KS";
export type VehicleStatus = "Available" | "LoanProcessing" | "Sold";
export type LeadStatus = "New" | "Contacted" | "Closed";
export type LoanStatus = "Draft" | "Pending" | "Approved" | "Rejected" | "Done";
export type DeliveryStatus = "BookingInspection" | "Scheduled" | "Inspection" | "PreparingDocuments" | "CarPreparation" | "ReadyForRelease" | "Released";
export type PaymentStatus = "Pending" | "Approved" | "Disbursed" | "Reconciled";
export type PaymentVoucherStatus = "Pending" | "Approved" | "Paid";
export type DebtRecoveryStatus = "Open" | "FollowedUp" | "Closed";
export type HrAttendanceStatus = "Present" | "Late" | "HalfDay" | "Absent";
export type HrLeaveType = "AnnualLeave" | "MedicalLeave" | "EmergencyLeave" | "UnpaidLeave";
export type HrLeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type HrPayslipStatus = "Draft" | "Generated";
export type DocumentCategory = "PurchaseInvoice" | "Voc" | "ApDocument" | "StatusReceipt" | "LoanDocument" | "DeliveryDocument" | "Policy" | "RoadTaxReceipt" | "RepairInvoice" | "PaymentReceipt" | "PaymentInvoice" | "MedicalCertificate";
export type OcrJobStatus = "Queued" | "Analyzing" | "NeedsReview" | "Failed";

export type OcrExtractionResult = {
  documentCategory: DocumentCategory;
  confidence: number;
  fieldConfidence: Record<string, number>;
  fields: Record<string, string | null | undefined>;
  rawText: string;
  warnings: string[];
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
};

export type UploadProgressHandler = (percent: number) => void;

export type Vehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  stockOwner: StockOwner;
  status: VehicleStatus;
  isPublic: boolean;
  purchasePrice: number;
  sellingPrice: number;
  additionalCharges: number;
  refurbishmentTotal: number;
  commissionTotal: number;
  bossConfirmed?: boolean;
  contraRangePrice?: number;
  ucdStatus?: string;
  customerId?: string;
  ownerId?: string;
  outstationPickupAllowance?: number;
  outstationPickupScheduledAt?: string;
  outstationPickupBookingSlip?: string;
};

export type VehicleLookup = Pick<Vehicle, "id" | "plateNumber" | "make" | "model" | "stockOwner" | "status">;

export type VehicleIntakeValues = Omit<Vehicle, "id">;

export type DashboardSummary = {
  totalStock: number;
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
  profitBreakdown: DashboardAmountSlice[];
  supplierSpendTop: DashboardAmountSlice[];
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

export type DashboardReminderDueFilter = "All" | "Overdue" | "DueToday" | "Upcoming";

export type DashboardReminderFilters = {
  type?: DashboardReminder["type"] | "All";
  due?: DashboardReminderDueFilter;
};

export type SupplierInvoice = {
  id: string;
  vehicleId: string;
  supplierName: string;
  invoiceNumber: string;
  plateNumberOnInvoice?: string;
  amount: number;
};

export type PurchaseInvoice = {
  id: string;
  vehicleId: string;
  invoiceNumber: string;
  amount: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  icNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type Owner = {
  id: string;
  name: string;
  phone: string;
};

export type RepairJob = {
  id: string;
  vehicleId: string;
  repairPart: string;
  whatToDo: string;
  cost: number;
  checklistDone: boolean;
};

export type LoanApplication = {
  id: string;
  vehicleId: string;
  customerId: string;
  status: LoanStatus;
  louApproved: boolean;
  louDone: boolean;
  submittedAt?: string;
};

export type DeliverySchedule = {
  id: string;
  vehicleId: string;
  pic: string;
  status: DeliveryStatus;
  scheduledDate: string;
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
  roadTaxHandled: boolean;
  roadTaxReceiptReference?: string;
  windscreenInsuranceHandled: boolean;
  windscreenPolicyReference?: string;
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
  invoiceGenerated: boolean;
  autoCountKeyed: boolean;
  salesPrice?: number;
  interestAdditionalCharges?: number;
  ncdAmount?: number;
  windscreenCharges?: number;
  outstationDeliveryDate?: string;
  bankName?: string;
  bankFollowUpDate?: string;
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
  notes?: string;
};

export type HrAttendanceRecord = {
  id: string;
  staffUserId: string;
  attendanceDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: HrAttendanceStatus;
  notes?: string;
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
  monthlyBaseSalary: number;
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
  baseSalary: number;
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
  status: LeadStatus;
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
  actor?: string;
  action?: string;
  entityName?: string;
};

export type VehicleDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  category: DocumentCategory;
  uploadedBy: string;
  checksum: string;
  uploadedAt: string;
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
  missingCategories: DocumentCategory[];
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

const sampleVehicle: Vehicle = {
  id: "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737",
  plateNumber: "VPK1234",
  make: "Toyota",
  model: "Vios",
  year: 2021,
  stockOwner: "YSHeng",
  status: "Available",
  isPublic: true,
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

export async function getDashboard(): Promise<DashboardSummary> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/dashboard/summary`, { credentials: "include" });
    if (response.ok) return response.json();
  } catch {
    return fallbackDashboard();
  }
  return fallbackDashboard();
}

export async function getDashboardReminders(filters: DashboardReminderFilters = {}): Promise<DashboardReminder[]> {
  const params = new URLSearchParams();
  if (filters.type && filters.type !== "All") params.set("type", filters.type);
  if (filters.due && filters.due !== "All") params.set("due", filters.due);
  const query = params.toString();
  return getWithNetworkFallback(`/api/dashboard/reminders${query ? `?${query}` : ""}`, []);
}

export async function getLoanDocumentCheck(loanId: string): Promise<LoanDocumentCheck> {
  return getWithNetworkFallback(`/api/loans/${loanId}/document-check`, { isComplete: false, missingCategories: [] });
}

export async function getDeliveryReleaseReadiness(deliveryId: string): Promise<DeliveryReleaseReadiness> {
  return getWithNetworkFallback(`/api/deliveries/${deliveryId}/release-readiness`, { isReady: false, missingCategories: [] });
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

export async function getVehicleLookup(): Promise<VehicleLookup[]> {
  return getWithNetworkFallback("/api/vehicle-lookup", [vehicleLookupFromVehicle(sampleVehicle)]);
}

export async function getCustomers(): Promise<Customer[]> {
  return getWithNetworkFallback("/api/customers", []);
}

export async function getOwners(): Promise<Owner[]> {
  return getWithNetworkFallback("/api/owners", []);
}

export async function getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
  return getWithNetworkFallback("/api/purchase-invoices", fallbackPurchaseInvoices());
}

export async function getSupplierInvoices(): Promise<SupplierInvoice[]> {
  return getWithNetworkFallback("/api/supplier-invoices", fallbackSupplierInvoices());
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

export async function getPayments(): Promise<PaymentRecord[]> {
  return getWithNetworkFallback("/api/payments", fallbackPayments());
}

export async function getSettlementReminders(): Promise<SettlementReminder[]> {
  return getWithNetworkFallback("/api/settlement-reminders", []);
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

export async function getLeads(): Promise<Lead[]> {
  return getWithNetworkFallback("/api/leads", fallbackLeads());
}

export async function getAuditLog(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (filters.actor?.trim()) params.set("actor", filters.actor.trim());
  if (filters.action?.trim()) params.set("action", filters.action.trim());
  if (filters.entityName?.trim()) params.set("entityName", filters.entityName.trim());
  const query = params.toString();
  return getWithNetworkFallback(`/api/audit-log${query ? `?${query}` : ""}`, fallbackAuditLog());
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  return getWithNetworkFallback("/api/admin/users", []);
}

export async function getHrStaffUsers(): Promise<StaffUser[]> {
  return getWithNetworkFallback("/api/hr/staff", fallbackHrStaffUsers(), { onNotFoundFallback: true });
}

export async function getHrAttendance(): Promise<HrAttendanceRecord[]> {
  return getWithNetworkFallback("/api/hr/attendance", fallbackHrAttendance(), { onNotFoundFallback: true });
}

export async function checkInHrAttendance(): Promise<HrAttendanceRecord> {
  return requestWithNetworkFallback("/api/hr/attendance/check-in", { method: "POST" }, fallbackHrCheckInAttendance());
}

export async function checkOutHrAttendance(): Promise<HrAttendanceRecord> {
  return requestWithNetworkFallback("/api/hr/attendance/check-out", { method: "POST" }, fallbackHrCheckOutAttendance());
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
    make: values.make,
    model: values.model,
    year: Number(values.year),
    stockOwner: values.stockOwner,
    status: values.status,
    isPublic: values.isPublic,
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

export async function updatePayment(payment: PaymentRecord): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/api/payments/${payment.id}`, {
    method: "PUT",
    body: JSON.stringify(payment)
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

export async function getVehicleDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/vehicles/${vehicleId}/documents`, { credentials: "include" });
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

export function vehiclePhotoContentUrl(vehicleId: string, photoId: string) {
  return `${apiBaseUrl}/api/vehicles/${vehicleId}/photos/${photoId}/content`;
}

export async function uploadVehiclePhoto(vehicleId: string, file: File) {
  return uploadFile(`/api/vehicles/${vehicleId}/photos`, file);
}

export async function uploadVehicleDocument(vehicleId: string, file: File, category: DocumentCategory): Promise<VehicleDocument> {
  return uploadFile<VehicleDocument>(`/api/vehicles/${vehicleId}/documents?category=${encodeURIComponent(category)}`, file);
}

export async function uploadVehicleDocumentWithProgress(vehicleId: string, file: File, category: DocumentCategory, onProgress?: UploadProgressHandler): Promise<VehicleDocument> {
  return uploadFileWithProgress<VehicleDocument>(`/api/vehicles/${vehicleId}/documents?category=${encodeURIComponent(category)}`, file, onProgress);
}

export async function startOcrJob(documentId: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/documents/${documentId}/ocr-jobs`, { method: "POST" });
}

export async function getOcrJob(jobId: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/ocr-jobs/${jobId}`);
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

async function uploadFile<T = unknown>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
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
      reject(new Error(xhr.responseText.trim() || `Upload failed with status ${xhr.status}`));
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
  if (text.trim()) {
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
      if (text.trim()) return text.trim();
    }
  }
  if (response.status === 401) {
    return "Login failed. Please check your email and password.";
  }
  if (response.status === 400) {
    return `${fallback} (empty or malformed request payload).`;
  }
  return fallback;
}

function fallbackDashboard(): DashboardSummary {
  return {
    totalStock: 1,
    pendingLoan: 1,
    outstandingPayment: 58000,
    settlementDue: 1,
    repairCost: 3500,
    estimatedProfit: 11900,
    totalProfit: 11900,
    vehicleAging: 1,
    agingBuckets: [
      { label: "0-30", count: 0 },
      { label: "31-60", count: 0 },
      { label: "61+", count: 1 }
    ],
    topSupplier: "ABC Spray",
    salesPerformance: 0,
    stockStatusMix: [
      { label: "Available", count: 1 },
      { label: "LoanProcessing", count: 0 },
      { label: "Sold", count: 0 }
    ],
    stockOwnerMix: [
      { label: "YSHeng", count: 1 },
      { label: "KS", count: 0 }
    ],
    moneyRiskBreakdown: [
      { label: "Outstanding Payment", amount: 58000 },
      { label: "Unpaid Settlement", amount: 25000 },
      { label: "Open Debt Recovery", amount: 3200 },
      { label: "Unpaid Daily Spend", amount: 480 },
      { label: "Open Payment Voucher", amount: 180 }
    ],
    workflowBlockers: {
      byType: [
        { label: "LoanFollowUp", count: 1 },
        { label: "SettlementDue", count: 1 },
        { label: "PaymentBankFollowUp", count: 1 }
      ],
      dueBuckets: [
        { label: "Overdue", count: 1 },
        { label: "DueToday", count: 2 },
        { label: "Upcoming", count: 0 }
      ]
    },
    salesFunnel: {
      stages: [
        { label: "New", count: 1 },
        { label: "Contacted", count: 0 },
        { label: "Closed", count: 0 }
      ],
      conversionRate: 0
    },
    profitBreakdown: [
      { label: "Selling + Charges", amount: 58600 },
      { label: "Purchase Cost", amount: 42000 },
      { label: "Repair Cost", amount: 3500 },
      { label: "Commission", amount: 1200 },
      { label: "Pickup Allowance", amount: 0 },
      { label: "Estimated Profit", amount: 11900 }
    ],
    supplierSpendTop: [
      { label: "ABC Spray", amount: 800 }
    ]
  };
}

function fallbackSupplierInvoices(): SupplierInvoice[] {
  return [
    {
      id: "329980d0-2e38-4d8c-872e-85ae013b8275",
      vehicleId: sampleVehicle.id,
      supplierName: "ABC Spray",
      invoiceNumber: "INV-1001",
      plateNumberOnInvoice: sampleVehicle.plateNumber,
      amount: 800
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
      roadTaxHandled: true,
      roadTaxReceiptReference: "RT-DEMO-1001",
      windscreenInsuranceHandled: true,
      windscreenPolicyReference: "WS-DEMO-1001"
    }
  ];
}

function fallbackPayments(): PaymentRecord[] {
  return [
    {
      id: "7e0dcbee-5369-4f26-a97f-46f3c7784c6d",
      vehicleId: sampleVehicle.id,
      nettPrice: 58000,
      status: "Pending",
      receiptNumber: "RCPT-DEMO-1001",
      invoiceNumber: "INV-DEMO-1001",
      bossChecked: false,
      documentsPrepared: true,
      checklistValidated: true,
      invoiceGenerated: true,
      autoCountKeyed: false,
      salesPrice: 58000,
      interestAdditionalCharges: 600,
      ncdAmount: 1200,
      windscreenCharges: 450,
      outstationDeliveryDate: "2026-06-05",
      bankName: "Maybank",
      bankFollowUpDate: "2026-06-01",
      createdAt: "2026-05-30T00:00:00Z"
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

function fallbackAuditLog(): AuditLog[] {
  return [
    {
      id: "5d2ad503-6526-4b27-861f-c326f1b55aa1",
      actor: "system",
      action: "vehicle.created",
      entityName: "Vehicle",
      entityId: sampleVehicle.id,
      createdAt: "2026-05-30T00:00:00Z"
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
      notes: "Showroom duty"
    },
    {
      id: "attendance-demo-2",
      staffUserId: "staff-demo-delivery",
      attendanceDate: "2026-06-06",
      checkInAt: "2026-06-06T01:28:00Z",
      status: "Late",
      notes: "JPJ runner queue"
    },
    {
      id: "attendance-demo-3",
      staffUserId: "staff-demo-hr",
      attendanceDate: "2026-06-05",
      checkInAt: "2026-06-05T00:55:00Z",
      checkOutAt: "2026-06-05T09:42:00Z",
      status: "Present",
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
    notes: "Demo check-out"
  };
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
      monthlyBaseSalary: 3200,
      overtimeHours: 4,
      overtimeRate: 18,
      allowances: 250,
      manualDeductions: 0,
      notes: "Sales floor allowance"
    },
    {
      id: "profile-demo-2",
      staffUserId: "staff-demo-delivery",
      monthlyBaseSalary: 2800,
      overtimeHours: 6,
      overtimeRate: 16,
      allowances: 180,
      manualDeductions: 50,
      notes: "Runner allowance, uniform deduction"
    },
    {
      id: "profile-demo-3",
      staffUserId: "staff-demo-hr",
      monthlyBaseSalary: 3600,
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
      baseSalary: 3200,
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
      baseSalary: 2800,
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
      baseSalary: 3600,
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
    stockOwner: vehicle.stockOwner,
    status: vehicle.status
  };
}
