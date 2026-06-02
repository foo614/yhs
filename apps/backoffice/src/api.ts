export type StockOwner = "YSHeng" | "KS";
export type VehicleStatus = "Available" | "LoanProcessing" | "Sold";
export type LeadStatus = "New" | "Contacted" | "Closed";
export type LoanStatus = "Draft" | "Pending" | "Approved" | "Rejected" | "Done";
export type DeliveryStatus = "BookingInspection" | "Scheduled" | "Inspection" | "PreparingDocuments" | "CarPreparation" | "ReadyForRelease" | "Released";
export type PaymentStatus = "Pending" | "Approved" | "Disbursed" | "Reconciled";
export type PaymentVoucherStatus = "Pending" | "Approved" | "Paid";
export type DebtRecoveryStatus = "Open" | "FollowedUp" | "Closed";
export type DocumentCategory = "PurchaseInvoice" | "Voc" | "ApDocument" | "StatusReceipt" | "LoanDocument" | "DeliveryDocument" | "Policy" | "RoadTaxReceipt" | "RepairInvoice" | "PaymentReceipt" | "PaymentInvoice";

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
};

export type DashboardAgingBucket = {
  label: "0-30" | "31-60" | "61+";
  count: number;
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

export type Lead = {
  id: string;
  vehicleId: string;
  customerId?: string;
  customerName: string;
  phone: string;
  message?: string;
  status: LeadStatus;
  createdAt: string;
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
  name?: string;
  roles: string[];
};

export type StaffRole = "BossAdmin" | "Sales" | "Loan" | "Delivery" | "Finance" | "Repair" | "HrSalary";

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
  });
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

export async function uploadVehicleDocument(vehicleId: string, file: File, category: DocumentCategory) {
  return uploadFile(`/api/vehicles/${vehicleId}/documents?category=${encodeURIComponent(category)}`, file);
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(await responseErrorMessage(response, `Request failed with status ${response.status}`));
  }

  return parseOptionalJson<T>(response);
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

async function getWithNetworkFallback<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
    if (response.ok) return response.json();
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
  try {
    const body = await response.json();
    const firstError = Array.isArray(body?.errors) ? body.errors[0] : undefined;
    if (firstError?.message) return String(firstError.message);
    if (body?.message) return String(body.message);
    if (body?.title) return String(body.title);
  } catch {
    // Keep the status-based fallback.
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
    salesPerformance: 0
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
      customerName: "Ali Tan",
      phone: "0123456789",
      message: "Interested in test drive",
      status: "New",
      createdAt: "2026-05-30T00:00:00Z"
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
