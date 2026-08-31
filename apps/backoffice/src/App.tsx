import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileDoneOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined
} from "@ant-design/icons";
import { PageContainer, ProCard, ProLayout } from "@ant-design/pro-components";
import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  Result,
  Select,
  Space,
  Skeleton,
  Spin,
  Steps,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
  notification
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { assignableStaffRoles, backOfficeDataKeysForRoles, canAccessRoute, canApproveVehicles, canAssignStaffRoles, firstAccessiblePath, isRouteVisibleInNavigation, roleDataKeys, routeAccess, type AppRoutePath, type BackOfficeDataKey } from "./access";
import { canCreateManualLoan, canUploadLoanChecklistDocument, filterLoanApplications, loanCreateBlockReason, loanDocumentCategories, loanDocumentChecklistStatus, markLoanDone, type LoanFilters } from "./loan";
import {
  activeLeadCountByVehicle,
  filterLeadsForTriage,
  findCustomerForLead,
  groupLeadsByVehicle,
  leadFilterControlOptions,
  leadSourceSummary,
  leadVehicleLabel,
  sortLeadsByHotCarDemand,
  type LeadVehicleGroup,
  type LeadLinkFilter
} from "./leads";
import { customerCreateBlockReason, ownerCreateBlockReason } from "./contacts";
import { supplierApprovalBlockReason } from "./finance";
import { filterRefurbishmentRecords, isRepairCostFinal, refurbishmentDetailsSelection, repairCreateBlockReason, repairDocumentCategories, supplierInvoiceAgingStatus, supplierInvoiceCreateBlockReason, type RefurbishmentFilters, type RefurbishmentRecord } from "./repairs";
import { filterStaffUsers, staffCreateBlockReason, staffPasswordResetBlockReason, staffUpdateBlockReason, type StaffStatusFilter } from "./staff";
import { dashboardAnalyticsPeriodForPreset, dashboardDrilldownFromRouteUrl, dashboardMetricTarget, dashboardPriorityEntries, dashboardReminderTarget, filterDashboardReminders, financeRiskTarget, reminderDueLabel, reminderDueTagColor, safeDashboardStockSummary, singaporeTodayIsoDate, urgentDashboardReminders, type DashboardAnalyticsRangePreset, type DashboardDrilldown, type ReminderDueFilter } from "./dashboard";
import { FinancePage, financeTabForUrl } from "./modules/finance/FinancePage";
import { Customer360Page } from "./modules/customers/Customer360Page";
import { HrSalaryPage as HrSalaryModulePage } from "./modules/hr/HrSalaryPage";
import { AiUsageSnapshotDescriptions, OcrOperationalGuidance } from "./modules/settings/AiUsagePanel";
import { ShowroomEnquiryQrSettings } from "./modules/settings/ShowroomEnquiryQrSettings";
import { VehicleCatalogSettings } from "./modules/settings/VehicleCatalogSettings";
import { DocumentUploadChecklist } from "./modules/shared/DocumentUploadChecklist";
import { DocumentPreviewDrawer, documentPreviewKind, type DocumentPreviewSource } from "./modules/shared/DocumentPreviewDrawer";
import { PreviewDocumentUpload } from "./modules/shared/PreviewDocumentUpload";
import { OcrUploadReview, type OcrFieldSection, type OcrReviewValues } from "./modules/shared/OcrUploadReview";
import { ModuleGuideExperience } from "./modules/shared/ModuleGuideExperience";
import { OperationsProTable as Table, operationsKeywordFromFields } from "./modules/shared/OperationsProTable";
import { VehiclePage } from "./modules/vehicles/VehiclePage";
import { DeliveryWorkboardPage } from "./modules/delivery/DeliveryWorkboardPage";
import { SalesMyCarsPanel } from "./modules/leads/SalesMyCarsPanel";
import { markModuleGuideTourSeen, moduleGuideForPath, shouldShowModuleGuideTour } from "./moduleGuides";
import { formatMoney as formatRinggit, formatMoneyInput, parseMoneyInput } from "./money";
import {
  checkInHrAttendance,
  checkOutHrAttendance,
  createHrAttendanceQrChallenge,
  createHrBusinessTrip,
  acceptCashHandover,
  approveNettPriceOverride,
  approvePaymentManagementReview,
  approvePaymentVoucher,
  approveRepair,
  createCashHandover,
  createCollection,
  createFinanceSale,
  createHrLeaveAdjustment,
  createHrLeaveRequest,
  createHrPayPeriod,
  createCustomer,
  createBrokerCommission,
  createDailySpend,
  createDebtRecovery,
  createHrAttendanceNetwork,
  createLoan,
  decideLoan,
  createOwner,
  createPayment,
  createPaymentVoucher,
  createPurchaseInvoice,
  createRepair,
  createRepairWithReceipt,
  confirmRepairReceipt,
  createSettlementReminder,
  createStaffUser,
  createSupplier,
  createSupplierInvoice,
  createVehicleIntake,
  customerFromLead,
  customerSelectLabel,
  decideHrLeaveRequest,
  exportAutoCountWorkbook,
  exportPaymentsCsv,
  generateHrPayslips,
  getAuditLog,
  getCurrentUser,
  getFinanceVehicleOptions,
  getCustomers,
  getBrokerCommissions,
  getCashHandovers,
  getCashHandoverPaymentLookup,
  getDailySpends,
  getDashboard,
  getDebtRecoveries,
  getDashboardReminders,
  getPriorityActions,
  getDeliveries,
  getDeliveryAccountingCharges,
  getHrAttendance,
  getHrAttendanceDashboard,
  getHrAvailabilityCalendar,
  getHrAttendanceReminderPolicies,
  getHrAttendanceReminders,
  updateHrAttendanceReminderPolicy,
  getHrBusinessTrips,
  getHrAttendanceNetworks,
  getHrBossCalendar,
  getHrLeaveAdjustments,
  getHrLeaveBalances,
  getHrLeavePolicies,
  getHrLeaveRequests,
  getHrPayPeriods,
  getHrPayrollProfiles,
  getHrPayslips,
  getHrStaffUsers,
  getLeads,
  getLoanDocumentCheck,
  getLoans,
  getOcrUsageLimit,
  getOwners,
  getPayments,
  getPaymentVouchers,
  getPurchaseInvoices,
  getRepairs,
  getRepairReceipts,
  getSettlementDrafts,
  getSettlementReminders,
  getStaffUsers,
  getSupplierMaster,
  getSupplierInvoices,
  getVehicleDocuments,
  getVehicleDocumentsStrict,
  getVehicleDocumentContent,
  getVehicleLookup,
  getVehicleOcrJobs,
  getVehicles,
  humanizeApiError,
  issueFinanceInvoice,
  login,
  logout,
  mergeFinanceVehicleOptions,
  cancelHrBusinessTrip,
  decideHrBusinessTrip,
  endHrOutstation,
  startHrOutstation,
  redeemHrAttendanceQr,
  resetStaffUserPassword,
  recordCashHandover,
  reconcileCollection,
  rejectCashHandover,
  reverseCollection,
  requestCashHandover,
  markPaymentVoucherPaid,
  hrMedicalCertificateContentUrl,
  updateHrLeaveBalance,
  updateHrAttendance,
  updateHrLeavePolicy,
  updateHrAttendanceNetwork,
  updateHrPayrollProfile,
  updateBrokerCommission,
  updateCustomer,
  updateDailySpend,
  updateDebtRecovery,
  updateLead,
  updateLoan,
  updateOwner,
  updateOcrUsageLimit,
  updatePayment,
  updatePaymentVoucher,
  updateCollectionFinancingStatus,
  updatePurchaseInvoice,
  updateRepair,
  updateSettlementReminder,
  updateStaffUser,
  updateStaffUserRoles,
  updateStaffUserStatus,
  updateSupplierInvoice,
  approveSupplier,
  updateVehicle,
  uploadHrMedicalCertificate,
  uploadVehicleDocument,
  uploadVehicleDocumentWithProgress,
  uploadVehiclePhoto,
  vehicleDocumentContentUrl,
  type AuditLog,
  type AuditLogFilters,
  type AiUsageLimitSnapshot,
  type BrokerCommission,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type ConfirmRepairReceiptRequest,
  type CreateRepairWithReceiptRequest,
  type CreateRepairWithReceiptResponse,
  type CreateStaffUserRequest,
  type CurrentUser,
  type Customer,
  type DailySpend,
  type DashboardAiDocumentProcessing,
  type DashboardAnalyticsPeriod,
  type DashboardReminder,
  type DashboardSummary,
  type DebtRecoveryCase,
  type DeliverySchedule,
  type DeliveryAccountingCharge,
  type DocumentCategory,
  type DocumentUploadOwner,
  type HrAttendanceRecord,
  type HrAttendanceDashboardSummary,
  type HrAvailabilityCalendarItem,
  type HrAttendanceReminderItem,
  type HrAttendanceReminderPolicy,
  type HrAttendanceQrChallenge,
  type HrBusinessTrip,
  type HrAttendanceNetwork,
  type HrCalendarAvailability,
  type HrLeaveAdjustment,
  type HrLeaveBalance,
  type HrLeavePolicy,
  type HrLeaveRequest,
  type HrLeaveStatus,
  type HrPayPeriod,
  type HrPayrollProfile,
  type HrPayslip,
  type FinanceVehicleOption,
  type Lead,
  type LoanApplication,
  type LoanDecisionStatus,
  type LoanDocumentCheck,
  type PaymentRecord,
  type PaymentVoucher,
  type PriorityActionItem,
  type Owner,
  type PurchaseInvoice,
  type OcrJob,
  type RepairJob,
  type RepairReceiptItemInput,
  type RepairReceiptWithItems,
  type ResetStaffPasswordRequest,
  type SettlementDraft,
  type SettlementReminder,
  type StaffRole,
  type StaffUser,
  type SupplierInvoice,
  type Supplier,
  type UpdateStaffUserRequest,
  type UpdateStaffUserStatusRequest,
  type UpdateAiServiceLimitRequest,
  type Vehicle,
  type VehicleLookup,
  type VehicleDocument,
  type VehicleOcrJob,
  type UploadProgressHandler
} from "./api";

function browserModuleGuideStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const staffRoles: StaffRole[] = assignableStaffRoles;

const repairReceiptOcrSections = {
  supplier: {
    key: "supplier",
    title: "Supplier details / 供应商资料",
    description: "Use this information to match an approved supplier master record."
  },
  receipt: {
    key: "receipt",
    title: "Receipt and vehicle / 收据与车辆",
    description: "Check the receipt reference and the plate printed on this document."
  },
  amountAndItems: {
    key: "amount-and-items",
    title: "Amount and receipt items / 金额与项目",
    description: "Confirm the total and each line item before continuing."
  }
} satisfies Record<string, OcrFieldSection>;

const bilingual = {
  dashboard: "Dashboard / 管理层分析",
  vehicles: "Vehicles / 收车库存",
  repairs: "Repair / 整备",
  loans: "Loan / 贷款",
  delivery: "Delivery / 出车",
  finance: "Finance & Collection / 财务收款",
  leads: "Leads / 客户询问",
  auditLog: "Audit Log / 操作记录",
  settings: "Settings / 系统设置"
};

const hrPayrollRouteName = "HR Payroll / 人事薪资";
const staffSelfServiceRouteName = "My Attendance / Leave";

const allRoutes: { path: AppRoutePath; name: string; icon: ReactNode }[] = [
  { path: "/dashboard", name: bilingual.dashboard, icon: <DashboardOutlined /> },
  { path: "/vehicles", name: bilingual.vehicles, icon: <CarOutlined /> },
  { path: "/repairs", name: bilingual.repairs, icon: <ToolOutlined /> },
  { path: "/loans", name: bilingual.loans, icon: <FileDoneOutlined /> },
  { path: "/delivery", name: bilingual.delivery, icon: <AuditOutlined /> },
  { path: "/finance", name: bilingual.finance, icon: <BankOutlined /> },
  { path: "/customer-360", name: "Customer 360", icon: <UserOutlined /> },
  { path: "/leads", name: bilingual.leads, icon: <UserOutlined /> },
  { path: "/audit-log", name: bilingual.auditLog, icon: <AuditOutlined /> },
  { path: "/hr-salary", name: staffSelfServiceRouteName, icon: <CalendarOutlined /> },
  { path: "/admin", name: bilingual.settings, icon: <SettingOutlined /> }
];

function hasHrManagementRole(roles: readonly string[]) {
  return roles.includes("BossAdmin") || roles.includes("HrSalary");
}

function routeDisplayName(path: AppRoutePath, roles: readonly string[]) {
  if (path === "/hr-salary") {
    return hasHrManagementRole(roles) ? hrPayrollRouteName : staffSelfServiceRouteName;
  }
  return allRoutes.find((route) => route.path === path)?.name ?? path;
}

function normalizeRoutePath(path?: string): AppRoutePath {
  const candidate = path && path !== "/" ? path.split("?")[0] : "/dashboard";
  if (candidate === "/cash-custody") return "/finance";
  return allRoutes.some((route) => route.path === candidate) ? candidate as AppRoutePath : "/dashboard";
}

export function browserRouteUrl(location: Pick<Location, "pathname" | "search">) {
  return `${location.pathname}${location.search}`;
}

export function customerIdFromRouteUrl(routeUrl: string) {
  const queryIndex = routeUrl.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? routeUrl.slice(queryIndex + 1) : "").get("customerId") ?? undefined;
}

export function loanIdFromRouteUrl(routeUrl: string) {
  const queryIndex = routeUrl.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? routeUrl.slice(queryIndex + 1) : "").get("loanId") ?? undefined;
}

export function vehicleLoanCustomerId(vehicle: Pick<Vehicle, "customerId">, existingLoan?: Pick<LoanApplication, "customerId">) {
  return existingLoan?.customerId ?? vehicle.customerId;
}

export function activeLoanForVehicle(loans: LoanApplication[], vehicleId: string) {
  return loans.find((loan) => loan.vehicleId === vehicleId && ["Pending", "Approved", "Done"].includes(loan.status));
}

function tablePagination(pageSize = 8): TablePaginationConfig {
  return {
    pageSize,
    showSizeChanger: false,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} / 共 ${total} 条`
  };
}

const mobileWorkflowPageSize = 8;
const defaultDashboardAnalyticsPeriod = dashboardAnalyticsPeriodForPreset("AllTime");

function combinedDashboardActionLoadError(...errors: Array<string | undefined>) {
  const messageText = errors.filter((error): error is string => Boolean(error)).join(" ");
  return messageText || null;
}

function hrCalendarMonthRange(value = new Date()): [string, string] {
  const year = value.getFullYear();
  const month = value.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return [format(from), format(to)];
}

export default function App() {
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const [pathname, setPathname] = useState(() => normalizeRoutePath(window.location.pathname));
  const [routeUrl, setRouteUrl] = useState(() => browserRouteUrl(window.location));
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<DashboardReminder[]>([]);
  const [priorityActions, setPriorityActions] = useState<PriorityActionItem[]>([]);
  const [reminderLoadError, setReminderLoadError] = useState<string | null>(null);
  const [dashboardLastCheckedAt, setDashboardLastCheckedAt] = useState<Date | null>(null);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardAnalyticsPeriod>(defaultDashboardAnalyticsPeriod);
  const [dashboardRangePreset, setDashboardRangePreset] = useState<DashboardAnalyticsRangePreset>("AllTime");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [repairs, setRepairs] = useState<RepairJob[]>([]);
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [deliveries, setDeliveries] = useState<DeliverySchedule[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null);
  const [paymentRefreshing, setPaymentRefreshing] = useState(false);
  const [cashHandovers, setCashHandovers] = useState<CashHandover[]>([]);
  const [cashHandoverPaymentLookup, setCashHandoverPaymentLookup] = useState<CashHandoverPaymentLookup[]>([]);
  const [settlements, setSettlements] = useState<SettlementReminder[]>([]);
  const [settlementDrafts, setSettlementDrafts] = useState<SettlementDraft[]>([]);
  const [dailySpends, setDailySpends] = useState<DailySpend[]>([]);
  const [brokerCommissions, setBrokerCommissions] = useState<BrokerCommission[]>([]);
  const [debtRecoveries, setDebtRecoveries] = useState<DebtRecoveryCase[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<PaymentVoucher[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [auditLogFilters, setAuditLogFilters] = useState<AuditLogFilters>({});
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [hrStaffUsers, setHrStaffUsers] = useState<StaffUser[]>([]);
  const [hrAttendance, setHrAttendance] = useState<HrAttendanceRecord[]>([]);
  const [hrAttendanceDashboard, setHrAttendanceDashboard] = useState<HrAttendanceDashboardSummary | null>(null);
  const [hrAvailabilityCalendar, setHrAvailabilityCalendar] = useState<HrAvailabilityCalendarItem[]>([]);
  const [hrAttendanceReminders, setHrAttendanceReminders] = useState<HrAttendanceReminderItem[]>([]);
  const [hrAttendanceReminderPolicies, setHrAttendanceReminderPolicies] = useState<HrAttendanceReminderPolicy[]>([]);
  const [hrBusinessTrips, setHrBusinessTrips] = useState<HrBusinessTrip[]>([]);
  const [hrAttendanceQrChallenge, setHrAttendanceQrChallenge] = useState<HrAttendanceQrChallenge | null>(null);
  const [attendanceQrToken, setAttendanceQrToken] = useState<string | undefined>(() => new URLSearchParams(window.location.hash.slice(1)).get("attendanceQr") ?? undefined);
  const [hrBossCalendar, setHrBossCalendar] = useState<HrCalendarAvailability[]>([]);
  const [hrAttendanceNetworks, setHrAttendanceNetworks] = useState<HrAttendanceNetwork[]>([]);
  const [hrLeaveRequests, setHrLeaveRequests] = useState<HrLeaveRequest[]>([]);
  const [hrLeaveBalances, setHrLeaveBalances] = useState<HrLeaveBalance[]>([]);
  const [hrLeavePolicies, setHrLeavePolicies] = useState<HrLeavePolicy[]>([]);
  const [hrLeaveAdjustments, setHrLeaveAdjustments] = useState<HrLeaveAdjustment[]>([]);
  const [hrPayrollProfiles, setHrPayrollProfiles] = useState<HrPayrollProfile[]>([]);
  const [hrPayPeriods, setHrPayPeriods] = useState<HrPayPeriod[]>([]);
  const [hrPayslips, setHrPayslips] = useState<HrPayslip[]>([]);
  const [vehicleLookup, setVehicleLookup] = useState<VehicleLookup[]>([]);
  const [financeVehicleOptions, setFinanceVehicleOptions] = useState<FinanceVehicleOption[]>([]);
  const [financeVehicleOptionLoadError, setFinanceVehicleOptionLoadError] = useState<string | null>(null);
  const [financeVehicleOptionRefreshing, setFinanceVehicleOptionRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [logoutSucceeded, setLogoutSucceeded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [moduleGuideOpen, setModuleGuideOpen] = useState(false);
  const [moduleTourOpen, setModuleTourOpen] = useState(false);
  const moduleCommandBarRef = useRef<HTMLElement>(null);
  const moduleContentRef = useRef<HTMLDivElement>(null);
  const moduleGuideButtonRef = useRef<HTMLSpanElement>(null);
  const currentRoles = useMemo(() => currentUser?.roles ?? [], [currentUser?.roles]);
  const financeVehicles = useMemo(
    () => mergeFinanceVehicleOptions(vehicleLookup, financeVehicleOptions),
    [financeVehicleOptions, vehicleLookup]
  );

  const loadBackOfficeData = useCallback(async (roles?: string[]) => {
    const allowed = new Set(backOfficeDataKeysForRoles(roles));
    const canLoad = (key: BackOfficeDataKey) => allowed.has(key);
    const [
      dashboardData,
      reminderData,
      priorityActionData,
      vehicleData,
      vehicleLookupData,
      financeVehicleOptionResult,
      customerData,
      ownerData,
      purchaseInvoiceData,
      supplierInvoiceData,
      repairData,
      loanData,
      deliveryData,
      paymentResult,
      cashHandoverData,
      cashHandoverPaymentLookupData,
      settlementData,
      settlementDraftData,
      dailySpendData,
      brokerCommissionData,
      debtRecoveryData,
      paymentVoucherData,
      leadData,
      auditData,
      staffUserData,
      hrStaffUserData,
      hrAttendanceData,
  hrAttendanceDashboardData,
  hrAvailabilityCalendarData,
  hrAttendanceReminderData,
  hrAttendanceReminderPolicyData,
  hrBusinessTripData,
  hrBossCalendarData,
  hrAttendanceNetworkData,
      hrLeaveRequestData,
      hrLeaveBalanceData,
      hrLeavePolicyData,
      hrLeaveAdjustmentData,
      hrPayrollProfileData,
      hrPayPeriodData,
      hrPayslipData
    ] = await Promise.all([
      canLoad("dashboard") ? getDashboard(defaultDashboardAnalyticsPeriod) : Promise.resolve({ dashboard: null as DashboardSummary | null, error: undefined as string | undefined }),
      canLoad("reminders") ? getDashboardReminders() : Promise.resolve({ reminders: [] as DashboardReminder[], error: undefined as string | undefined }),
      getPriorityActions(),
      canLoad("vehicles") ? getVehicles() : Promise.resolve([]),
      canLoad("vehicleLookup") ? getVehicleLookup() : Promise.resolve([]),
      canLoad("financeVehicleOptions")
        ? getFinanceVehicleOptions()
            .then((data) => ({ data, error: null as string | null }))
            .catch((error) => ({ data: [] as FinanceVehicleOption[], error: humanizeApiError(error, "Vehicle prices could not be loaded.") }))
        : Promise.resolve({ data: [] as FinanceVehicleOption[], error: null as string | null }),
      canLoad("customers") ? getCustomers() : Promise.resolve([]),
      canLoad("owners") ? getOwners() : Promise.resolve([]),
      canLoad("purchaseInvoices") ? getPurchaseInvoices() : Promise.resolve([]),
      canLoad("supplierInvoices") ? getSupplierInvoices() : Promise.resolve([]),
      canLoad("repairs") ? getRepairs() : Promise.resolve([]),
      canLoad("loans") ? getLoans() : Promise.resolve([]),
      canLoad("deliveries") ? getDeliveries() : Promise.resolve([]),
      canLoad("payments")
        ? getPayments()
            .then((data) => ({ data, error: null as string | null }))
            .catch((error) => ({ data: [] as PaymentRecord[], error: humanizeApiError(error, "Finance records could not be loaded.") }))
        : Promise.resolve({ data: [] as PaymentRecord[], error: null as string | null }),
      canLoad("cashHandovers") ? getCashHandovers() : Promise.resolve([]),
      canLoad("cashHandoverPaymentLookup") ? getCashHandoverPaymentLookup() : Promise.resolve([]),
      canLoad("settlements") ? getSettlementReminders() : Promise.resolve([]),
      canLoad("settlements") ? getSettlementDrafts() : Promise.resolve([]),
      canLoad("dailySpends") ? getDailySpends() : Promise.resolve([]),
      canLoad("brokerCommissions") ? getBrokerCommissions() : Promise.resolve([]),
      canLoad("debtRecoveries") ? getDebtRecoveries() : Promise.resolve([]),
      canLoad("paymentVouchers") ? getPaymentVouchers() : Promise.resolve([]),
      canLoad("leads") ? getLeads() : Promise.resolve([]),
      canLoad("auditLog") ? getAuditLog() : Promise.resolve([]),
      canLoad("staffUsers") ? getStaffUsers() : Promise.resolve([]),
      canLoad("hrStaffUsers") ? getHrStaffUsers() : Promise.resolve([]),
      canLoad("hrAttendance") ? getHrAttendance() : Promise.resolve([]),
  canLoad("hrDashboard") ? getHrAttendanceDashboard() : Promise.resolve(null as HrAttendanceDashboardSummary | null),
  canLoad("hrAvailabilityCalendar") ? getHrAvailabilityCalendar() : Promise.resolve([]),
  canLoad("hrReminders") ? getHrAttendanceReminders() : Promise.resolve([]),
  canLoad("hrReminderPolicies") ? getHrAttendanceReminderPolicies() : Promise.resolve([]),
  canLoad("hrBusinessTrips") ? getHrBusinessTrips() : Promise.resolve([]),
  canLoad("hrBossCalendar") ? getHrBossCalendar(...hrCalendarMonthRange()) : Promise.resolve([]),
  canLoad("hrAttendanceNetworks") ? getHrAttendanceNetworks() : Promise.resolve([]),
      canLoad("hrLeaveRequests") ? getHrLeaveRequests() : Promise.resolve([]),
      canLoad("hrLeaveBalances") ? getHrLeaveBalances() : Promise.resolve([]),
      canLoad("hrLeavePolicies") ? getHrLeavePolicies() : Promise.resolve([]),
      canLoad("hrLeaveAdjustments") ? getHrLeaveAdjustments() : Promise.resolve([]),
      canLoad("hrPayrollProfiles") ? getHrPayrollProfiles() : Promise.resolve([]),
      canLoad("hrPayPeriods") ? getHrPayPeriods() : Promise.resolve([]),
      canLoad("hrPayslips") ? getHrPayslips() : Promise.resolve([])
    ]);
    setDashboard(dashboardData.dashboard);
    setDashboardLoadError(dashboardData.error ?? null);
    setReminders(reminderData.reminders);
    setPriorityActions(priorityActionData.actions);
    setReminderLoadError(combinedDashboardActionLoadError(reminderData.error, priorityActionData.error));
    setDashboardLastCheckedAt(new Date());
    setVehicles(vehicleData);
    setVehicleLookup(vehicleLookupData);
    setFinanceVehicleOptions(financeVehicleOptionResult.data);
    setFinanceVehicleOptionLoadError(financeVehicleOptionResult.error);
    setCustomers(customerData);
    setOwners(ownerData);
    setPurchaseInvoices(purchaseInvoiceData);
    setSupplierInvoices(supplierInvoiceData);
    setRepairs(repairData);
    setLoans(loanData);
    setDeliveries(deliveryData);
    setPayments(paymentResult.data);
    setPaymentLoadError(paymentResult.error);
    setCashHandovers(cashHandoverData);
    setCashHandoverPaymentLookup(cashHandoverPaymentLookupData);
    setSettlements(settlementData);
    setSettlementDrafts(settlementDraftData);
    setDailySpends(dailySpendData);
    setBrokerCommissions(brokerCommissionData);
    setDebtRecoveries(debtRecoveryData);
    setPaymentVouchers(paymentVoucherData);
    setLeads(leadData);
    setAuditLog(auditData);
    setStaffUsers(staffUserData);
    setHrStaffUsers(hrStaffUserData);
    setHrAttendance(hrAttendanceData);
  setHrAttendanceDashboard(hrAttendanceDashboardData);
  setHrAvailabilityCalendar(hrAvailabilityCalendarData);
  setHrAttendanceReminders(hrAttendanceReminderData);
  setHrAttendanceReminderPolicies(hrAttendanceReminderPolicyData);
  setHrBusinessTrips(hrBusinessTripData);
  setHrBossCalendar(hrBossCalendarData);
  setHrAttendanceNetworks(hrAttendanceNetworkData);
    setHrLeaveRequests(hrLeaveRequestData);
    setHrLeaveBalances(hrLeaveBalanceData);
    setHrLeavePolicies(hrLeavePolicyData);
    setHrLeaveAdjustments(hrLeaveAdjustmentData);
    setHrPayrollProfiles(hrPayrollProfileData);
    setHrPayPeriods(hrPayPeriodData);
    setHrPayslips(hrPayslipData);
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;

        setCurrentUser(user);
        if (user.isAuthenticated) {
          await loadBackOfficeData(user.roles);
        }
      } catch {
        if (!active) return;

        setCurrentUser(null);
      } finally {
        if (active) setSessionReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadBackOfficeData]);

  useEffect(() => {
    if (currentUser?.isAuthenticated && !canAccessRoute(currentRoles, pathname)) {
      const fallbackPath = firstAccessiblePath(currentRoles);
      setPathname(fallbackPath);
      setRouteUrl(fallbackPath);
      window.history.replaceState(null, "", fallbackPath);
    }
  }, [currentRoles, currentUser?.isAuthenticated, pathname]);

  useEffect(() => {
    const syncPathFromBrowser = () => {
      if (window.location.pathname === "/cash-custody") {
        window.history.replaceState(null, "", "/finance?tab=cash-custody");
      }
      setPathname(normalizeRoutePath(window.location.pathname));
      setRouteUrl(browserRouteUrl(window.location));
    };
    syncPathFromBrowser();
    window.addEventListener("popstate", syncPathFromBrowser);
    return () => window.removeEventListener("popstate", syncPathFromBrowser);
  }, []);

  useEffect(() => {
    const syncAttendanceQrToken = () => setAttendanceQrToken(new URLSearchParams(window.location.hash.slice(1)).get("attendanceQr") ?? undefined);
    window.addEventListener("hashchange", syncAttendanceQrToken);
    return () => window.removeEventListener("hashchange", syncAttendanceQrToken);
  }, []);

  const route = useMemo(() => ({
    path: "/",
    routes: allRoutes
      .filter((item) => isRouteVisibleInNavigation(item.path))
      .filter((item) => !currentUser?.isAuthenticated || canAccessRoute(currentRoles, item.path))
      .map((item) => ({ ...item, name: routeDisplayName(item.path, currentRoles) }))
  }), [currentUser?.isAuthenticated, currentRoles]);
  const pageTitle = routeDisplayName(pathname, currentRoles);
  const activeModuleGuide = useMemo(() => moduleGuideForPath(pathname, currentRoles), [currentRoles, pathname]);
  const activeModuleGuideSectionKey = useMemo(() => {
    if (pathname !== "/finance") return undefined;

    const searchIndex = routeUrl.indexOf("?");
    const search = searchIndex >= 0 ? routeUrl.slice(searchIndex) : "";
    const canManageFinance = currentRoles.some((role) => role === "BossAdmin" || role === "Finance");
    return financeTabForUrl(pathname, search, canManageFinance);
  }, [currentRoles, pathname, routeUrl]);
  const moduleGuideAudienceKey = useMemo(
    () => `${currentUser?.id ?? "staff"}:${[...currentRoles].sort().join(",") || "guest"}`,
    [currentRoles, currentUser?.id]
  );
  const dashboardDrilldown = useMemo(() => dashboardDrilldownFromRouteUrl(routeUrl), [routeUrl]);
  const navigateTo = (path: string) => {
    const nextPath = normalizeRoutePath(path);
    const nextUrl = path.includes("?") ? path : nextPath;
    setPathname(nextPath);
    setRouteUrl(nextUrl);
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
    setMobileNavOpen(false);
  };
  const notifySuccess = useCallback((messageText: string, description?: string) => {
    notificationApi.success({
      message: messageText,
      description,
      placement: "topRight"
    });
  }, [notificationApi]);
  const notifyError = useCallback((messageText: string, description?: string) => {
    notificationApi.error({
      message: messageText,
      description,
      placement: "topRight"
    });
  }, [notificationApi]);

  const finishModuleTour = useCallback(() => {
    markModuleGuideTourSeen(browserModuleGuideStorage(), pathname, moduleGuideAudienceKey);
    setModuleTourOpen(false);
  }, [moduleGuideAudienceKey, pathname]);

  useEffect(() => {
    setModuleGuideOpen(false);
    if (!currentUser?.isAuthenticated) {
      setModuleTourOpen(false);
      return;
    }

    setModuleTourOpen(shouldShowModuleGuideTour(browserModuleGuideStorage(), pathname, moduleGuideAudienceKey));
  }, [currentUser?.isAuthenticated, moduleGuideAudienceKey, pathname]);

  useEffect(() => {
    if (logoutSucceeded && !currentUser?.isAuthenticated) {
      notifySuccess("Logged out", "Your back-office session ended successfully.");
    }
  }, [currentUser?.isAuthenticated, logoutSucceeded, notifySuccess]);

  async function handleLogin(values: { email: string; password: string }) {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await login(values.email, values.password);
      const user = await getCurrentUser();
      setCurrentUser(user);
      setLogoutSucceeded(false);
      const nextPath = firstAccessiblePath(user.roles);
      setPathname(nextPath);
      setRouteUrl(nextPath);
      window.history.replaceState(null, "", nextPath);
      await loadBackOfficeData(user.roles);
      notifySuccess("Login successful", `Signed in as ${user.name ?? values.email}`);
    } catch (error) {
      const messageText = humanizeApiError(error, "Please check your credentials and API connection.");
      setLoginError(messageText);
      notifyError("Login failed", messageText);
      throw error;
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleAuditLogSearch(filters: AuditLogFilters) {
    try {
      const records = await getAuditLog(filters, { strict: true });
      setAuditLogFilters(filters);
      setAuditLog(records);
      notifySuccess("Audit log filtered", `${records.length} records loaded`);
    } catch (error) {
      notifyError("Audit search failed", humanizeApiError(error, "Audit records could not be loaded."));
      throw error;
    }
  }

  const refreshDashboard = useCallback(async () => {
    setDashboardRefreshing(true);
    try {
      const [dashboardData, reminderData, priorityActionData] = await Promise.all([getDashboard(dashboardPeriod), getDashboardReminders(), getPriorityActions()]);
      setDashboard(dashboardData.dashboard);
      setDashboardLoadError(dashboardData.error ?? null);
      setReminders(reminderData.reminders);
      setPriorityActions(priorityActionData.actions);
      setReminderLoadError(combinedDashboardActionLoadError(reminderData.error, priorityActionData.error));
      setDashboardLastCheckedAt(new Date());
    } finally {
      setDashboardRefreshing(false);
    }
  }, [dashboardPeriod]);

  const refreshPayments = useCallback(async () => {
    setPaymentRefreshing(true);
    try {
      const records = await getPayments();
      setPayments(records);
      setPaymentLoadError(null);
    } catch (error) {
      setPayments([]);
      setPaymentLoadError(humanizeApiError(error, "Finance records could not be loaded."));
    } finally {
      setPaymentRefreshing(false);
    }
  }, []);

  const refreshFinanceVehicleOptions = useCallback(async () => {
    setFinanceVehicleOptionRefreshing(true);
    try {
      const options = await getFinanceVehicleOptions();
      setFinanceVehicleOptions(options);
      setFinanceVehicleOptionLoadError(null);
    } catch (error) {
      setFinanceVehicleOptions([]);
      setFinanceVehicleOptionLoadError(humanizeApiError(error, "Vehicle prices could not be loaded."));
    } finally {
      setFinanceVehicleOptionRefreshing(false);
    }
  }, []);

  const changeDashboardPeriod = useCallback(async (preset: DashboardAnalyticsRangePreset, period: DashboardAnalyticsPeriod) => {
    setDashboardRangePreset(preset);
    setDashboardPeriod(period);
    setDashboardRefreshing(true);
    try {
      const dashboardData = await getDashboard(period);
      setDashboard(dashboardData.dashboard);
      setDashboardLoadError(dashboardData.error ?? null);
      setDashboardLastCheckedAt(new Date());
    } finally {
      setDashboardRefreshing(false);
    }
  }, []);

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setLogoutSucceeded(true);
    setPathname("/dashboard");
    setRouteUrl("/dashboard");
    window.history.replaceState(null, "", "/dashboard");
  }

  async function runCreate<T>(action: () => Promise<T>, success: (record: T) => void, text: string) {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      notifySuccess(text, "The record has been saved and synced.");
    } catch (error) {
      notifyError("Request failed", humanizeApiError(error));
      throw error;
    }
  }

  async function runCreateWithResult<T>(action: () => Promise<T>, success: (record: T) => void, text: string): Promise<T> {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      notifySuccess(text, "The record has been saved and synced.");
      return record;
    } catch (error) {
      notifyError("Request failed", humanizeApiError(error));
      throw error;
    }
  }

  async function runUpload(action: () => Promise<unknown>, text: string) {
    try {
      await action();
      notifySuccess(text, "The file is stored and linked to the selected vehicle.");
    } catch (error) {
      notifyError("Upload failed", humanizeApiError(error, "Please check the file and try again."));
      throw error;
    }
  }

  async function runUpdate<T>(action: () => Promise<T>, success: (record: T) => void, text: string) {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      notifySuccess(text, "The record has been updated and synced.");
    } catch (error) {
      notifyError("Update failed", humanizeApiError(error));
      throw error;
    }
  }

  async function runUpdateWithResult<T>(action: () => Promise<T>, success: (record: T) => void, text: string): Promise<T> {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      notifySuccess(text, "The record has been updated and synced.");
      return record;
    } catch (error) {
      notifyError("Update failed", humanizeApiError(error));
      throw error;
    }
  }

  async function handleStartVehicleLoan(vehicle: Vehicle) {
    const existingLoan = activeLoanForVehicle(loans, vehicle.id);
    const loanCustomerId = vehicleLoanCustomerId(vehicle, existingLoan);
    if (!loanCustomerId) {
      notifyError("Customer required", "Open the vehicle record and link or create the customer before starting the loan workflow.");
      return;
    }

    try {
      let targetLoan = existingLoan;
      if (!targetLoan) {
        const createdLoan = await createLoan({
          id: newId(),
          vehicleId: vehicle.id,
          customerId: loanCustomerId,
          status: "Pending",
          louApproved: false,
          louDone: false,
          submittedAt: today()
        });
        targetLoan = createdLoan;
        setLoans((items) => [createdLoan, ...items]);
      }

      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      navigateTo(`/loans?loanId=${encodeURIComponent(targetLoan.id)}`);
      notifySuccess(
        existingLoan ? "Loan workflow opened" : "Loan workflow started",
        existingLoan ? "This vehicle already has a loan record." : "A pending loan record was created and linked to the selected customer."
      );
    } catch (error) {
      notifyError("Loan workflow failed", humanizeApiError(error));
      throw error;
    }
  }

  if (!sessionReady) {
    return (
      <>
        {notificationContextHolder}
        <SessionLoading />
      </>
    );
  }

  if (!currentUser?.isAuthenticated) {
    return (
      <>
        {notificationContextHolder}
        <LoginHome
          onLogin={handleLogin}
          loginLoading={loginLoading}
          loginError={loginError}
          logoutSucceeded={logoutSucceeded}
          onDismissLogoutResult={() => setLogoutSucceeded(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="mobileTopBar">
        <Button aria-label="Open navigation" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} />
        <div className="mobileTopTitle">
          <strong>YS Heng · {currentRoles[0] ? displayRoleLabel(currentRoles[0]) : "Guest"}{currentRoles.length > 1 ? ` +${currentRoles.length - 1}` : ""}</strong>
          <span role="heading" aria-level={1}>{pageTitle}</span>
        </div>
        <Button
          aria-label="Logout"
          className="mobileLogoutButton"
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          title="Logout"
        />
      </div>
      <Drawer
        title="YS Heng Portal"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        placement="left"
        width={300}
        className="mobileNavDrawer"
      >
        <Space direction="vertical" size={6} className="fullWidth">
          {route.routes.map((item) => (
            <button
              key={item.path}
              className={item.path === pathname ? "mobileNavItem active" : "mobileNavItem"}
              onClick={() => navigateTo(item.path)}
            >
              <span className="mobileNavIcon">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </Space>
      </Drawer>
      <ProLayout
        title="YS Heng Portal"
        logo={false}
        route={route}
        location={{ pathname }}
        menuItemRender={(item, dom) => <button className="menuButton" onClick={() => navigateTo(item.path ?? "/dashboard")}>{dom}</button>}
        layout="mix"
        actionsRender={() => [
          <div className="headerSession" key="session">
            <span className="headerSessionUser">{currentUser.name ?? "staff"}</span>
            <span className="headerSessionRole">{currentRoles.map(displayRoleLabel).join(", ") || "none"}</span>
            <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>Logout</Button>
          </div>
        ]}
      >
      {notificationContextHolder}
      <PageContainer title={false}>
        <Space direction="vertical" size={16} className="fullWidth">
          <ModuleCommandBar
            pathname={pathname}
            title={pageTitle}
            currentUser={currentUser}
            dashboard={dashboard}
            reminders={reminders}
            vehicles={vehicles}
            customers={customers}
            supplierInvoices={supplierInvoices}
            repairs={repairs}
            loans={loans}
            deliveries={deliveries}
            payments={payments}
            cashHandovers={cashHandovers}
            settlements={settlements}
            leads={leads}
            staffUsers={staffUsers}
            hrAttendance={hrAttendance}
            hrLeaveRequests={hrLeaveRequests}
            hrPayslips={hrPayslips}
            commandBarRef={moduleCommandBarRef}
            guideButtonRef={moduleGuideButtonRef}
            onOpenGuide={() => {
              finishModuleTour();
              setModuleGuideOpen(true);
            }}
          />
          <div ref={moduleContentRef}>
          {pathname === "/dashboard" && <DashboardPage dashboard={dashboard} dashboardLoadError={dashboardLoadError} reminders={reminders} priorityActions={priorityActions} reminderLoadError={reminderLoadError} vehicles={vehicles} lastCheckedAt={dashboardLastCheckedAt} refreshing={dashboardRefreshing} analyticsPeriod={dashboardPeriod} analyticsRangePreset={dashboardRangePreset} onRefresh={refreshDashboard} onAnalyticsPeriodChange={changeDashboardPeriod} onNavigate={navigateTo} />}
          {pathname === "/vehicles" && (
            <VehiclePage
              vehicles={vehicles}
              leads={leads}
              loans={loans}
              customers={customers}
              owners={owners}
              purchaseInvoices={purchaseInvoices}
              repairs={repairs}
              brokerCommissions={brokerCommissions}
              paymentVouchers={paymentVouchers}
              canApproveVehicles={canApproveVehicles(currentRoles)}
              canPrepareSettlement={currentRoles.includes("BossAdmin") || currentRoles.includes("Finance")}
              dashboardFocus={dashboardDrilldown.vehicleFocus}
              dashboardAnalyticsPeriod={dashboardDrilldown.analyticsPeriod}
              onClearDashboardFocus={() => navigateTo("/vehicles")}
              onCreate={(vehicle, settlement, newOwner, identityCard) =>
                runCreateWithResult(
                  () => createVehicleIntake({ vehicle, settlement, newOwner }, identityCard),
                  (record) => {
                    setVehicles((items) => [record.vehicle, ...items]);
                    if (record.settlement) setSettlements((items) => [record.settlement!, ...items]);
                    if (record.createdOwner) setOwners((items) => [record.createdOwner!, ...items]);
                  },
                  settlement ? "Vehicle and settlement reminder created" : "Vehicle created"
                )}
              onUpdate={(vehicle) => runUpdate(() => updateVehicle(vehicle), (record) => setVehicles((items) => replaceById(items, record)), "Vehicle updated")}
              onStartLoan={handleStartVehicleLoan}
              onOpenCustomer={(customerId) => navigateTo(`/customer-360?customerId=${customerId}`)}
              onCreateCustomer={(customer) => runCreate(() => createCustomer(customer), (record) => setCustomers((items) => [record, ...items]), "Customer created")}
              onUpdateCustomer={(customer) => runUpdate(() => updateCustomer(customer), (record) => setCustomers((items) => replaceById(items, record)), "Customer updated")}
              onCreateOwner={(owner) => runCreate(() => createOwner(owner), (record) => setOwners((items) => [record, ...items]), "Owner created")}
              onUpdateOwner={(owner) => runUpdate(() => updateOwner(owner), (record) => setOwners((items) => replaceById(items, record)), "Owner updated")}
              onCreatePurchaseInvoice={(invoice) => runCreate(() => createPurchaseInvoice(invoice), (record) => setPurchaseInvoices((items) => [record, ...items]), "Purchase invoice created")}
              onUpdatePurchaseInvoice={(invoice) => runUpdate(() => updatePurchaseInvoice(invoice), (record) => setPurchaseInvoices((items) => replaceById(items, record)), "Purchase invoice updated")}
              onUploadPhoto={(vehicleId, file) => runUpload(() => uploadVehiclePhoto(vehicleId, file), "Vehicle photo uploaded")}
              onUploadDocument={(vehicleId, file, category, owner) => runUpload(() => uploadVehicleDocument(vehicleId, file, category, owner), "Vehicle document uploaded")}
            />
          )}
          {pathname === "/repairs" && (
            <RepairPage
              vehicles={vehicleLookup}
              supplierInvoices={supplierInvoices}
              repairs={repairs}
              canApproveRepairs={currentRoles.includes("BossAdmin")}
              currentUserId={currentUser?.id}
              onCreateInvoice={(invoice) => runCreate(() => createSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => [record, ...items]), "Supplier invoice created")}
              onUpdateInvoice={(invoice) => runUpdate(() => updateSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => replaceById(items, record)), "Supplier invoice updated")}
              onCreateRepair={(repair) => runCreate(() => createRepair(repair), (record) => setRepairs((items) => [record, ...items]), "Repair task created")}
              onCreateRepairWithReceipt={(request) => runCreateWithResult(
                () => createRepairWithReceipt(request),
                (record) => {
                  setRepairs((items) => [record.repair, ...items]);
                  setSupplierInvoices((items) => [record.invoice, ...items]);
                },
                "Repair and receipt created"
              )}
              onUpdateRepair={(repair) => runUpdate(() => updateRepair(repair), (record) => setRepairs((items) => replaceById(items, record)), "Repair task updated")}
              onConfirmReceipt={(repairId, receipt) => confirmRepairReceipt(repairId, receipt)}
              onApproveRepair={(repairId, notes) => runUpdate(() => approveRepair(repairId, notes), (record) => setRepairs((items) => replaceById(items, record)), "Repair approved")}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Repair document uploaded")}
            />
          )}
          {pathname === "/loans" && (
            <LoanPage
              vehicles={vehicleLookup}
              customers={customers}
              loans={loans}
              roles={currentRoles}
              initialLoanId={loanIdFromRouteUrl(routeUrl)}
              dashboardFocus={dashboardDrilldown}
              onClearDashboardFocus={() => navigateTo("/loans")}
              onBackToList={() => navigateTo("/loans")}
              onCreate={(loan) => runCreate(() => createLoan(loan), (record) => setLoans((items) => [record, ...items]), "Loan submitted")}
              onUpdate={(loan) => runUpdate(() => updateLoan(loan), (record) => setLoans((items) => replaceById(items, record)), "Loan updated")}
              onDecide={(loanId, status, rejectionReason) => runUpdate(
                () => decideLoan(loanId, status, rejectionReason),
                (record) => setLoans((items) => replaceById(items, record)),
                status === "Approved" ? "Loan approval recorded" : "Loan rejection recorded"
              )}
              onUploadDocument={(vehicleId, file, category, onProgress) => runUpload(
                () => uploadVehicleDocumentWithProgress(vehicleId, file, category, onProgress),
                "Loan document uploaded"
              )}
            />
          )}
          {pathname === "/delivery" && (
            <DeliveryPage
              vehicles={vehicleLookup}
              canCorrectBuyer={currentRoles.includes("BossAdmin")}
              dashboardFocus={dashboardDrilldown}
              onClearDashboardFocus={() => navigateTo("/delivery")}
              onOpenCustomer={(customerId) => navigateTo(`/customer-360?customerId=${customerId}`)}
            />
          )}
          {pathname === "/finance" && (
            <FinancePage
              vehicles={financeVehicles}
              customers={customers}
              loans={loans}
              owners={owners}
              payments={payments}
              paymentLoadError={paymentLoadError}
              paymentRefreshing={paymentRefreshing}
              financeVehicleOptionLoadError={financeVehicleOptionLoadError}
              financeVehicleOptionRefreshing={financeVehicleOptionRefreshing}
              settlements={settlements}
              settlementDrafts={settlementDrafts}
              dailySpends={dailySpends}
              brokerCommissions={brokerCommissions}
              debtRecoveries={debtRecoveries}
              paymentVouchers={paymentVouchers}
              currentUser={currentUser}
              dashboardFocus={dashboardDrilldown}
              onClearDashboardFocus={(tab) => navigateTo(`/finance?tab=${encodeURIComponent(tab)}`)}
              onRetryPayments={refreshPayments}
              onRetryFinanceVehicleOptions={refreshFinanceVehicleOptions}
              cashHandovers={cashHandovers}
              cashHandoverPaymentLookup={cashHandoverPaymentLookup}
              onCreate={(payment) => runCreate(() => createPayment(payment), (record) => setPayments((items) => [record, ...items]), "Payment record created")}
              onUpdate={(payment) => runUpdate(() => updatePayment(payment), (record) => setPayments((items) => replaceById(items, record)), "Payment updated")}
              onApproveManagementReview={(paymentId) => runUpdate(() => approvePaymentManagementReview(paymentId), (record) => setPayments((items) => replaceById(items, record)), "Management review approved")}
              onCreateFinanceSale={(input) => runCreateWithResult(() => createFinanceSale(input), (record) => setPayments((items) => replaceByIdOrPrepend(items, record)), "Invoice prepared")}
              onApproveNettPriceOverride={(paymentId) => runUpdateWithResult(() => approveNettPriceOverride(paymentId), (record) => setPayments((items) => replaceById(items, record)), "Price adjustment approved")}
              onIssueInvoice={(paymentId) => runUpdateWithResult(() => issueFinanceInvoice(paymentId), (record) => setPayments((items) => replaceById(items, record)), "Invoice issued")}
              onCreateCollection={(paymentId, input) => runUpdateWithResult(() => createCollection(paymentId, input), (record) => setPayments((items) => replaceById(items, record)), "Payment added")}
              onUpdateCollectionFinancingStatus={(collectionId, status) => runUpdateWithResult(() => updateCollectionFinancingStatus(collectionId, status), (record) => setPayments((items) => replaceById(items, record)), "Financing status updated")}
              onReconcileCollection={(collectionId) => runUpdateWithResult(() => reconcileCollection(collectionId), (record) => setPayments((items) => replaceById(items, record)), "Payment reconciled")}
              onReverseCollection={(collectionId, reason) => runUpdateWithResult(() => reverseCollection(collectionId, reason), (record) => setPayments((items) => replaceById(items, record)), "Payment reversed")}
              onOpenCustomer={(customerId) => navigateTo(`/customer-360?customerId=${customerId}`)}
              onCreateSettlement={(settlement) => runCreate(() => createSettlementReminder(settlement), (record) => setSettlements((items) => [record, ...items]), "Settlement reminder created")}
              onUpdateSettlement={(settlement) => runUpdate(() => updateSettlementReminder(settlement), (record) => setSettlements((items) => replaceById(items, record)), "Settlement reminder updated")}
              onCreateDailySpend={(spend) => runCreate(() => createDailySpend(spend), (record) => setDailySpends((items) => [record, ...items]), "Daily spend created")}
              onUpdateDailySpend={(spend) => runUpdate(() => updateDailySpend(spend), (record) => setDailySpends((items) => replaceById(items, record)), "Daily spend updated")}
              onCreateBrokerCommission={(commission) => runCreate(() => createBrokerCommission(commission), (record) => setBrokerCommissions((items) => [record, ...items]), "Broker commission created")}
              onUpdateBrokerCommission={(commission) => runUpdate(() => updateBrokerCommission(commission), (record) => setBrokerCommissions((items) => replaceById(items, record)), "Broker commission updated")}
              onCreateDebtRecovery={(debt) => runCreate(() => createDebtRecovery(debt), (record) => setDebtRecoveries((items) => [record, ...items]), "Debt recovery created")}
              onUpdateDebtRecovery={(debt) => runUpdate(() => updateDebtRecovery(debt), (record) => setDebtRecoveries((items) => replaceById(items, record)), "Debt recovery updated")}
              onCreatePaymentVoucher={(voucher) => runCreate(() => createPaymentVoucher(voucher), (record) => setPaymentVouchers((items) => [record, ...items]), "Payment voucher created")}
              onUpdatePaymentVoucher={(voucher) => runUpdate(() => updatePaymentVoucher(voucher), (record) => setPaymentVouchers((items) => replaceById(items, record)), "Payment voucher updated")}
              onApprovePaymentVoucher={(voucherId) => runUpdate(() => approvePaymentVoucher(voucherId), (record) => setPaymentVouchers((items) => replaceById(items, record)), "Payment voucher approved")}
              onMarkPaymentVoucherPaid={(voucherId, evidence) => runUpdate(() => markPaymentVoucherPaid(voucherId, evidence), (record) => setPaymentVouchers((items) => replaceById(items, record)), "Payment voucher marked paid")}
              onExportPayments={() => exportPaymentsCsv()}
              onExportAutoCount={(from, to) => exportAutoCountWorkbook(from, to)}
              onUploadDocument={(vehicleId, file, category, owner?: DocumentUploadOwner) => runUpload(() => uploadVehicleDocument(vehicleId, file, category, owner), "Finance document uploaded")}
              onCreateCashHandover={(paymentRecordId, amount, notes) => runCreate(() => createCashHandover(paymentRecordId, amount, notes), (record) => setCashHandovers((items) => [record, ...items]), "Cash received recorded")}
              onRequestCashHandover={(id) => runUpdate(() => requestCashHandover(id), (record) => setCashHandovers((items) => replaceById(items, record)), "Cash handover requested")}
              onRecordCashHandover={(id) => runUpdate(() => recordCashHandover(id), (record) => setCashHandovers((items) => replaceById(items, record)), "Cash receipt confirmed")}
              onAcceptCashHandover={(id) => runUpdate(() => acceptCashHandover(id), (record) => setCashHandovers((items) => replaceById(items, record)), "Official receipt issued")}
              onRejectCashHandover={(id, reason) => runUpdate(() => rejectCashHandover(id, reason), (record) => setCashHandovers((items) => replaceById(items, record)), "Cash handover rejected")}
            />
          )}
          {pathname === "/customer-360" && (
            <Customer360Page
              customerId={customerIdFromRouteUrl(routeUrl)}
              onCustomerChange={(customerId) => navigateTo(`/customer-360?customerId=${customerId}`)}
              onNavigate={navigateTo}
              canAccessPath={(path) => canAccessRoute(currentRoles, path)}
            />
          )}
          {pathname === "/leads" && (
            <LeadsPage
              currentUser={currentUser}
              vehicles={vehicles}
              customers={customers}
              leads={leads}
              onCreateCustomer={async (lead) => {
                const existingCustomer = findCustomerForLead(lead, customers);
                const customer = existingCustomer ?? await createCustomer(customerFromLead(lead, newId()));
                if (!existingCustomer) {
                  setCustomers((items) => [customer, ...items]);
                }
                const updatedLead = await updateLead({ ...lead, customerId: customer.id, status: "Contacted" });
                setLeads((items) => replaceById(items, updatedLead));
                await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
                notifySuccess(
                  existingCustomer ? "Existing customer linked to lead" : "Customer linked to lead",
                  `${lead.customerName} is ready for sales follow-up.`
                );
              }}
              onUpdate={(lead) => runUpdate(() => updateLead(lead), (record) => setLeads((items) => replaceById(items, record)), "Lead updated")}
            />
          )}
          {pathname === "/hr-salary" && (
            <HrSalaryModulePage
              currentUser={currentUser}
              staffUsers={hrStaffUsers}
              attendance={hrAttendance}
  attendanceDashboard={hrAttendanceDashboard}
  availabilityCalendar={hrAvailabilityCalendar}
  attendanceReminders={hrAttendanceReminders}
  attendanceReminderPolicies={hrAttendanceReminderPolicies}
  bossCalendar={hrBossCalendar}
  attendanceNetworks={hrAttendanceNetworks}
              leaveRequests={hrLeaveRequests}
              leaveBalances={hrLeaveBalances}
              leavePolicies={hrLeavePolicies}
              leaveAdjustments={hrLeaveAdjustments}
              payrollProfiles={hrPayrollProfiles}
              payPeriods={hrPayPeriods}
              payslips={hrPayslips}
              attendanceQrChallenge={hrAttendanceQrChallenge}
              attendanceQrToken={attendanceQrToken}
              businessTrips={hrBusinessTrips}
              onClearAttendanceQrToken={() => {
                setAttendanceQrToken(undefined);
                window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
              }}
              onCheckIn={() => runUpdate(() => checkInHrAttendance(), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Attendance checked in")}
              onCheckOut={() => runUpdate(() => checkOutHrAttendance(), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Attendance checked out")}
  onCreateQrChallenge={() => runCreate(createHrAttendanceQrChallenge, setHrAttendanceQrChallenge, "Office QR created")}
  onRedeemQr={(requestBody) => runUpdate(() => redeemHrAttendanceQr(requestBody), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), requestBody.action === "CheckIn" ? "Attendance checked in by QR" : "Attendance checked out by QR")}
  onCreateBusinessTrip={(trip) => runCreate(() => createHrBusinessTrip(trip), (record) => setHrBusinessTrips((items) => [record, ...items]), "Outstation request submitted")}
  onDecideBusinessTrip={(tripId, status, decisionNotes) => runUpdate(() => decideHrBusinessTrip(tripId, status, decisionNotes), (record) => setHrBusinessTrips((items) => replaceById(items, record)), status === "Approved" ? "Outstation request approved" : "Outstation request rejected")}
  onCancelBusinessTrip={(tripId) => runUpdate(() => cancelHrBusinessTrip(tripId), (record) => setHrBusinessTrips((items) => replaceById(items, record)), "Outstation request cancelled")}
  onStartOutstation={(requestBody) => runUpdate(() => startHrOutstation(requestBody), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Outstation duty started")}
  onEndOutstation={(requestBody) => runUpdate(() => endHrOutstation(requestBody), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Outstation duty ended")}
  onUpdateReminderPolicy={(type, policy) => runUpdate(() => updateHrAttendanceReminderPolicy(type, policy), (record) => setHrAttendanceReminderPolicies((items) => replaceById(items, record)), "Attendance reminder updated")}
  onUpdateAttendance={(attendance) => runUpdate(() => updateHrAttendance(attendance), (record) => setHrAttendance((items) => replaceById(items, record)), "Attendance correction saved")}
              onLoadBossCalendar={async (from, to) => {
                try {
                  setHrBossCalendar(await getHrBossCalendar(from, to));
                } catch (error) {
                  notifyError("Calendar could not be loaded", humanizeApiError(error));
                }
              }}
              onSaveAttendanceNetwork={(network) => runUpdate(
                () => hrAttendanceNetworks.some((item) => item.id === network.id) ? updateHrAttendanceNetwork(network) : createHrAttendanceNetwork(network),
                (record) => setHrAttendanceNetworks((items) => replaceByIdOrPrepend(items, record)),
                network.isActive ? "Office network saved" : "Office network disabled"
  )}
  onCreateLeave={(leave) => runCreateWithResult(() => createHrLeaveRequest(leave), (record) => setHrLeaveRequests((items) => [record, ...items]), "Leave request submitted")}
              onDecideLeave={(leaveId, status, decisionNotes) => runUpdate(() => decideHrLeaveRequest(leaveId, status, decisionNotes), (record) => setHrLeaveRequests((items) => replaceById(items, record)), status === "Approved" ? "Leave approved" : "Leave rejected")}
              onUploadMc={async (leaveId, file) => {
                await runUpload(() => uploadHrMedicalCertificate(leaveId, file), "MC uploaded");
                await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
              }}
              mcContentUrl={hrMedicalCertificateContentUrl}
              onUpdateBalance={(balance) => runUpdate(() => updateHrLeaveBalance(balance), (record) => setHrLeaveBalances((items) => replaceByIdOrPrepend(items, record)), "Leave balance updated")}
              onUpdatePolicy={(policy) => runUpdate(() => updateHrLeavePolicy(policy), (record) => setHrLeavePolicies((items) => replaceByIdOrPrepend(items, record)), "Leave policy updated")}
              onCreateAdjustment={(adjustment) => runCreate(() => createHrLeaveAdjustment(adjustment), (result) => {
                setHrLeaveBalances((items) => replaceByIdOrPrepend(items, result.balance));
                setHrLeaveAdjustments((items) => [result.adjustment, ...items]);
              }, "Leave adjustment saved")}
              onUpdatePayrollProfile={(profile) => runUpdate(() => updateHrPayrollProfile(profile), (record) => setHrPayrollProfiles((items) => replaceByIdOrPrepend(items, record)), "Payroll profile updated")}
              onCreatePayPeriod={(period) => runCreate(() => createHrPayPeriod(period), (record) => setHrPayPeriods((items) => [record, ...items]), "Pay period created")}
              onGeneratePayslips={(payPeriodId) => runUpdate(() => generateHrPayslips(payPeriodId), (records) => setHrPayslips((items) => mergeById(items, records)), "Payslips generated")}
            />
          )}
          {pathname === "/audit-log" && <AuditLogPage auditLog={auditLog} filters={auditLogFilters} onSearch={handleAuditLogSearch} />}
          {pathname === "/admin" && (
            <AdminPage
              auditLog={auditLog}
              staffUsers={staffUsers}
              onCreateStaffUser={(user) => runCreate(() => createStaffUser(user), (record) => setStaffUsers((items) => [record, ...items]), "Staff user created")}
              onUpdateStaffUser={(userId, requestBody) => runUpdate(() => updateStaffUser(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff user updated")}
              onResetStaffPassword={(userId, requestBody) => runUpdate(() => resetStaffUserPassword(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff password reset")}
              onUpdateStaffStatus={(userId, requestBody) => runUpdate(() => updateStaffUserStatus(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), requestBody.isActive ? "Staff user enabled" : "Staff user disabled")}
              onUpdateStaffRoles={(userId, roles) => runUpdate(() => updateStaffUserRoles(userId, roles), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff roles updated")}
              auditLogFilters={auditLogFilters}
              onSearchAuditLog={handleAuditLogSearch}
            />
          )}
          </div>
          <ModuleGuideExperience
            guide={activeModuleGuide}
            activeSectionKey={activeModuleGuideSectionKey}
            drawerOpen={moduleGuideOpen}
            tourOpen={moduleTourOpen}
            headerTarget={() => moduleCommandBarRef.current}
            contentTarget={() => moduleContentRef.current}
            buttonTarget={() => moduleGuideButtonRef.current}
            onCloseDrawer={() => setModuleGuideOpen(false)}
            onReplayTour={() => {
              setModuleGuideOpen(false);
              setModuleTourOpen(true);
            }}
            onCloseTour={finishModuleTour}
          />
        </Space>
      </PageContainer>
      </ProLayout>
    </>
  );
}

function SessionLoading() {
  return (
    <main className="sessionLoading" aria-busy="true">
      <Spin size="large" />
      <div>
        <Typography.Title level={3}>Loading back-office session</Typography.Title>
        <Typography.Text type="secondary">Checking staff access and preparing the operations workspace.</Typography.Text>
      </div>
    </main>
  );
}

function LoginHome({
  onLogin,
  loginLoading,
  loginError,
  logoutSucceeded,
  onDismissLogoutResult
}: {
  onLogin: (values: { email: string; password: string }) => Promise<void>;
  loginLoading?: boolean;
  loginError?: string | null;
  logoutSucceeded?: boolean;
  onDismissLogoutResult?: () => void;
}) {
  return (
    <main className="loginHome loginHomeMinimal">
      <section className="loginPanel">
        {logoutSucceeded ? (
          <Result
            className="logoutResult"
            status="success"
            title="Logged out successfully"
            subTitle="Your YS Heng back-office session has ended. Sign in again when you are ready to continue."
            extra={[
              <Button type="primary" key="signin" onClick={onDismissLogoutResult}>Back to sign in</Button>
            ]}
          />
        ) : (
          <>
            <div className="loginPanelHeader">
              <img className="loginPanelLogo" src="/ys-heng-logo.png" alt="YS Heng" />
              <Typography.Title level={2}>YS Heng Portal</Typography.Title>
            </div>
            <Form layout="vertical" onFinish={onLogin} initialValues={{ email: "admin@ysheng.local" }}>
              <Form.Item name="email" label="Work email" rules={[{ required: true, type: "email" }]}>
                <Input prefix={<UserOutlined />} placeholder="admin@ysheng.local" autoComplete="email" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" />
              </Form.Item>
              {loginError && <Alert className="loginError" message="Login failed" description={loginError} type="error" showIcon />}
              <Button type="primary" htmlType="submit" className="loginButton" loading={loginLoading}>
                Sign in
              </Button>
            </Form>
          </>
        )}
      </section>
    </main>
  );
}

function LoginHomeLegacy({
  onLogin,
  loginLoading,
  loginError,
  logoutSucceeded,
  onDismissLogoutResult
}: {
  onLogin: (values: { email: string; password: string }) => Promise<void>;
  loginLoading?: boolean;
  loginError?: string | null;
  logoutSucceeded?: boolean;
  onDismissLogoutResult?: () => void;
}) {
  return (
    <main className="loginHome">
      <section className="loginHero">
        <div className="loginBrand">
          <span className="loginMark"><img src="/ys-heng-logo.png" alt="YS Heng" /></span>
          <div>
            <Typography.Text className="loginKicker">Back-office operations</Typography.Text>
            <Typography.Title level={1}>YS Heng Portal</Typography.Title>
            <Typography.Text>Staff operations login / 员工后台登录</Typography.Text>
          </div>
        </div>
        <div className="loginWorkflow">
          <span><CarOutlined /> Vehicle intake</span>
          <span><FileDoneOutlined /> Loan follow-up</span>
          <span><BankOutlined /> Finance control</span>
        </div>
        <div className="loginSummary">
          <span><strong>7</strong> roles</span>
          <span><strong>RBAC</strong> access</span>
          <span><strong>Live</strong> workflow</span>
        </div>
      </section>
      <section className="loginPanel">
        {logoutSucceeded ? (
          <Result
            className="logoutResult"
            status="success"
            title="Logged out successfully"
            subTitle="Your YS Heng back-office session has ended. Sign in again when you are ready to continue."
            extra={[
              <Button type="primary" key="signin" onClick={onDismissLogoutResult}>Back to sign in</Button>
            ]}
          />
        ) : (
          <>
            <div className="loginPanelHeader">
              <Typography.Text className="loginPanelEyebrow">Secure staff access</Typography.Text>
              <Typography.Title level={2}>Welcome back</Typography.Title>
              <Typography.Text>Sign in to continue vehicle intake, delivery, finance, HR, and admin work.</Typography.Text>
            </div>
            <Form layout="vertical" onFinish={onLogin} initialValues={{ email: "admin@ysheng.local" }}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                <Input prefix={<UserOutlined />} placeholder="admin@ysheng.local" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="Password" />
              </Form.Item>
              {loginError && <Alert className="loginError" message="Login failed" description={loginError} type="error" showIcon />}
              <Button type="primary" htmlType="submit" className="loginButton" loading={loginLoading}>
                Enter portal
              </Button>
            </Form>
            <div className="loginHelpStrip">
              <span>Cookie session</span>
              <span>Role-based modules</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function ModuleCommandBar({
  pathname,
  title,
  currentUser,
  dashboard,
  reminders,
  vehicles,
  customers,
  supplierInvoices,
  repairs,
  loans,
  deliveries,
  payments,
  cashHandovers,
  settlements,
  leads,
  staffUsers,
  hrAttendance,
  hrLeaveRequests,
  hrPayslips,
  commandBarRef,
  guideButtonRef,
  onOpenGuide
}: {
  pathname: string;
  title: string;
  currentUser: CurrentUser | null;
  dashboard: DashboardSummary | null;
  reminders: DashboardReminder[];
  vehicles: Vehicle[];
  customers: Customer[];
  supplierInvoices: SupplierInvoice[];
  repairs: RepairJob[];
  loans: LoanApplication[];
  deliveries: DeliverySchedule[];
  payments: PaymentRecord[];
  cashHandovers: CashHandover[];
  settlements: SettlementReminder[];
  leads: Lead[];
  staffUsers: StaffUser[];
  hrAttendance: HrAttendanceRecord[];
  hrLeaveRequests: HrLeaveRequest[];
  hrPayslips: HrPayslip[];
  commandBarRef: RefObject<HTMLElement | null>;
  guideButtonRef: RefObject<HTMLSpanElement | null>;
  onOpenGuide: () => void;
}) {
  const stats = moduleStats(pathname, {
    dashboard,
    reminders,
    vehicles,
    customers,
    supplierInvoices,
    repairs,
    loans,
    deliveries,
    payments,
    cashHandovers,
    settlements,
    leads,
    staffUsers,
    hrAttendance,
    hrLeaveRequests,
    hrPayslips
  });
  const roles = currentUser?.roles ?? [];

  return (
    <section className="moduleCommandBar" ref={commandBarRef}>
      <div>
        <span className="moduleEyebrow">YS Heng Operations</span>
        <h1>{title}</h1>
        <div className="moduleRoles">
          {(roles.length > 0 ? roles : ["Guest"]).map((role) => <Tag key={role}>{displayRoleLabel(role)}</Tag>)}
        </div>
      </div>
      <div className="moduleCommandAside">
        <div className="moduleStats">
          {stats.map((stat) => (
            <span key={stat.label}>
              <strong>{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
        <span className="moduleGuideButtonWrap" ref={guideButtonRef}>
          <Button className="moduleGuideButton" icon={<QuestionCircleOutlined />} onClick={onOpenGuide}>
            How to use / 使用指南
          </Button>
        </span>
      </div>
    </section>
  );
}

function PriorityActionsPanel({ actions, onNavigate }: { actions: PriorityActionItem[]; onNavigate: (path: string) => void }) {
  const visibleActions = actions.slice(0, 6);

  return (
    <ProCard
      title="My priority actions / 我的待办"
      extra={<Tag color={actions.length > 0 ? "orange" : "green"}>{actions.length > 0 ? `${actions.length} action${actions.length === 1 ? "" : "s"}` : "All clear"}</Tag>}
    >
      {visibleActions.length > 0 ? (
        <div className="dashboardPriorityList">
          {visibleActions.map((action) => (
            <article className="dashboardPriorityAction" key={`${action.type}-${action.subject}-${action.dueDate}`}>
              <Tag className="dashboardStatusBadge" color={action.dueDate < today() ? "red" : "orange"}>{action.dueDate < today() ? "Overdue" : "Action"}</Tag>
              <div className="dashboardPriorityDetails"><strong>{action.title}</strong><span>{action.subject ?? "General"}</span></div>
              <div className="dashboardPriorityDue"><small>Due / 到期</small><strong>{action.dueDate}</strong></div>
              {action.amount !== undefined && <div className="dashboardPriorityAmount"><small>Exposure / 金额</small><strong>{formatMoney(action.amount)}</strong></div>}
              <Button type="primary" size="small" onClick={() => onNavigate(priorityActionTarget(action.target))}>Open action</Button>
            </article>
          ))}
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending actions for your role." />}
    </ProCard>
  );
}

function priorityActionTarget(target: PriorityActionItem["target"]) {
  return {
    Loans: "/loans?status=Pending",
    Delivery: "/delivery",
    Finance: "/finance",
    Leads: "/leads",
    Repairs: "/repairs",
    HrSalary: "/hr-salary"
  }[target];
}

function moduleStats(pathname: string, data: {
  dashboard: DashboardSummary | null;
  reminders: DashboardReminder[];
  vehicles: Vehicle[];
  customers: Customer[];
  supplierInvoices: SupplierInvoice[];
  repairs: RepairJob[];
  loans: LoanApplication[];
  deliveries: DeliverySchedule[];
  payments: PaymentRecord[];
  cashHandovers: CashHandover[];
  settlements: SettlementReminder[];
  leads: Lead[];
  staffUsers: StaffUser[];
  hrAttendance: HrAttendanceRecord[];
  hrLeaveRequests: HrLeaveRequest[];
  hrPayslips: HrPayslip[];
}) {
  const availableVehicles = data.vehicles.filter((vehicle) => vehicle.status === "Available").length;
  const publicVehicles = data.vehicles.filter((vehicle) => vehicle.isPublic).length;
  const pendingLoans = data.loans.filter((loan) => loan.status === "Pending").length;
  const openPayments = data.payments.filter((payment) => payment.status !== "Reconciled").length;
  const newLeads = data.leads.filter((lead) => lead.status === "New").length;
  const todayText = today();
  const attendanceToday = data.hrAttendance.filter((record) => record.attendanceDate === todayText).length;
  const pendingLeave = data.hrLeaveRequests.filter((leave) => leave.status === "Pending").length;

  switch (pathname) {
    case "/vehicles":
      return [
        { label: "stock rows", value: data.vehicles.length },
        { label: "public", value: publicVehicles },
        { label: "contacts", value: data.customers.length }
      ];
    case "/repairs":
      return [
        { label: "repair jobs", value: data.repairs.length },
        { label: "supplier invoices", value: data.supplierInvoices.length },
        { label: "checklist done", value: data.repairs.filter((repair) => repair.checklistDone).length }
      ];
    case "/loans":
      return [
        { label: "loan files", value: data.loans.length },
        { label: "pending", value: pendingLoans },
        { label: "reminders", value: data.reminders.filter((reminder) => reminder.type === "LoanFollowUp").length }
      ];
    case "/delivery":
      return [];
    case "/finance":
      return [
        { label: "payments", value: data.payments.length },
        { label: "open bank", value: openPayments },
        { label: "open custody", value: data.cashHandovers.filter((handover) => handover.status !== "Receipted" && handover.status !== "Rejected").length }
      ];
    case "/leads":
      return [
        { label: "enquiries", value: data.leads.length },
        { label: "new", value: newLeads },
        { label: "linked", value: data.leads.filter((lead) => Boolean(lead.customerId)).length }
      ];
    case "/audit-log":
      return [
        { label: "active reminders", value: data.reminders.length },
        { label: "stock rows", value: data.vehicles.length },
        { label: "staff roles", value: data.staffUsers.length }
      ];
    case "/admin":
      return [
        { label: "staff users", value: data.staffUsers.length },
        { label: "active", value: data.staffUsers.filter((staff) => staff.isActive).length },
        { label: "disabled", value: data.staffUsers.filter((staff) => !staff.isActive).length }
      ];
    case "/hr-salary":
      return [
        { label: "attendance today", value: attendanceToday },
        { label: "pending leave", value: pendingLeave },
        { label: "payslips", value: data.hrPayslips.length }
      ];
    default:
      return [
        { label: "total stock", value: data.dashboard?.totalStock ?? data.vehicles.length },
        { label: "available", value: availableVehicles },
        { label: "reminders", value: data.reminders.length }
      ];
  }
}

export function ModuleDocumentList({
  vehicleId,
  categories,
  repairJobId,
  paymentRecordId,
  reloadKey = 0,
  showOcrResults = true,
  enablePreview = false
}: {
  vehicleId?: string;
  categories: readonly DocumentCategory[];
  repairJobId?: string;
  paymentRecordId?: string;
  reloadKey?: number;
  showOcrResults?: boolean;
  enablePreview?: boolean;
}) {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [ocrJobs, setOcrJobs] = useState<VehicleOcrJob[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [previewDocument, setPreviewDocument] = useState<VehicleDocument>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequestId = useRef(0);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    if (!vehicleId) {
      setDocuments([]);
      setOcrJobs([]);
      setDocumentsLoading(false);
      setDocumentsError("");
      return () => {
        active = false;
      };
    }

    setDocumentsLoading(enablePreview);
    setDocumentsError("");
    const ocrItems = showOcrResults ? getVehicleOcrJobs(vehicleId) : Promise.resolve<VehicleOcrJob[]>([]);
    const documentItems = enablePreview
      ? getVehicleDocumentsStrict(vehicleId, "Unable to load uploaded documents")
      : getVehicleDocuments(vehicleId);
    void Promise.all([documentItems, ocrItems])
      .then(([documentItems, ocrResults]) => {
        if (active) {
          const matchingDocuments = documentItems.filter((document) =>
            categories.includes(document.category) &&
            (!repairJobId || document.repairJobId === repairJobId) &&
            (!paymentRecordId || document.paymentRecordId === paymentRecordId)
          );
          const matchingDocumentIds = new Set(matchingDocuments.map((document) => document.id));
          setDocuments(matchingDocuments);
          setOcrJobs(ocrResults.filter((job) => matchingDocumentIds.has(job.document.id)));
        }
      })
      .catch((error) => {
        if (active) {
          setDocuments([]);
          setOcrJobs([]);
          setDocumentsError(humanizeApiError(error, "Unable to load uploaded documents."));
        }
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [categories, enablePreview, paymentRecordId, reloadKey, repairJobId, showOcrResults, vehicleId]);

  const closeDocumentPreview = () => {
    previewRequestId.current += 1;
    setPreviewDocument(undefined);
    setPreviewUrl("");
    setPreviewLoading(false);
    setPreviewError("");
  };

  const openDocumentPreview = async (document: VehicleDocument) => {
    if (!vehicleId) return;
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setPreviewDocument(document);
    setPreviewUrl("");
    setPreviewError("");

    if (documentPreviewKind(document.mimeType) === "unsupported") {
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    try {
      const blob = await getVehicleDocumentContent(vehicleId, document.id);
      const objectUrl = URL.createObjectURL(blob);
      if (previewRequestId.current !== requestId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setPreviewUrl(objectUrl);
    } catch (error) {
      if (previewRequestId.current === requestId) {
        setPreviewError(humanizeApiError(error, "Unable to load this document preview."));
      }
    } finally {
      if (previewRequestId.current === requestId) setPreviewLoading(false);
    }
  };

  const columns: ColumnsType<VehicleDocument> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "Type / 类型",
      dataIndex: "category",
      ...(repairJobId ? {} : {
        filters: tableTextFilters(documents.map((document) => document.category)),
        onFilter: (value: any, row: VehicleDocument) => row.category === value
      })
    },
    {
      title: "File / 文件",
      dataIndex: "fileName",
      ...(repairJobId ? {} : {
        filters: tableTextFilters(documents.map((document) => document.fileName)),
        filterSearch: true,
        onFilter: (value: any, row: VehicleDocument) => row.fileName === value
      })
    },
    {
      title: "Uploaded By / 上传者",
      dataIndex: "uploadedBy",
      ...(repairJobId ? {} : {
        filters: tableTextFilters(documents.map((document) => document.uploadedBy || "System")),
        filterSearch: true,
        onFilter: (value: any, row: VehicleDocument) => (row.uploadedBy || "System") === value
      }),
      render: (value) => value || "-"
    },
    {
      title: enablePreview ? "Actions / 操作" : "Open / 查看",
      fixed: "right",
      width: enablePreview ? 210 : 100,
      render: (_, row) => vehicleId ? (
        enablePreview ? (
          <Space className="tableActionGroup" size={6} wrap>
            <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => void openDocumentPreview(row)}>Preview</Button>
            <Button size="small" icon={<DownloadOutlined />} href={vehicleDocumentContentUrl(vehicleId, row.id)} target="_blank">Download</Button>
          </Space>
        ) : (
          <Button size="small" icon={<DownloadOutlined />} href={vehicleDocumentContentUrl(vehicleId, row.id)} target="_blank">Open</Button>
        )
      ) : null
    }
  ];

  const ocrColumns: ColumnsType<VehicleOcrJob> = [
    { title: "Analyzed / 日期", dataIndex: "completedAt", render: (value, row) => String(value || row.createdAt).slice(0, 10) },
    { title: "Type / 类型", dataIndex: "category" },
    { title: "File / 文件", render: (_, row) => row.document.fileName },
    {
      title: "Extracted / OCR",
      render: (_, row) => ocrFieldSummary(row)
    },
    {
      title: "Status / 状态",
      width: 190,
      render: (_, row) => <Tag color={row.status === "Reviewed" ? "green" : row.status === "NeedsReview" ? "orange" : row.status === "Failed" ? "red" : "blue"}>{row.status === "NeedsReview" ? "Pending staff check / 待员工核对" : row.status}</Tag>
    }
  ];

  return (
    <Space direction="vertical" size={12} className="fullWidth">
      {documentsError && <Alert type="error" showIcon message="Uploaded files could not be loaded" description={documentsError} />}
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={documents}
        loading={documentsLoading}
        columnFilters={!repairJobId}
        pagination={tablePagination(5)}
        scroll={{ x: 760 }}
        locale={{ emptyText: vehicleId ? "No uploaded documents for this selected record." : "Select a record to view uploaded documents." }}
      />
      {showOcrResults && (
        <Table
          rowKey="id"
          size="small"
          columns={ocrColumns}
          dataSource={ocrJobs}
          columnFilters={!repairJobId}
          pagination={tablePagination(5)}
          scroll={{ x: 760 }}
          locale={{ emptyText: vehicleId ? "No OCR results for these documents yet." : "Select a record to view OCR results." }}
        />
      )}
      {enablePreview && (
        <DocumentPreviewDrawer
          open={Boolean(previewDocument)}
          title="Document preview / 文件预览"
          source={previewDocument ? {
            fileName: previewDocument.fileName,
            mimeType: previewDocument.mimeType,
            url: previewUrl
          } satisfies DocumentPreviewSource : undefined}
          loading={previewLoading}
          error={previewError}
          onClose={closeDocumentPreview}
          footer={previewDocument && vehicleId ? (
            <div className="documentPreviewFooter documentPreviewFooterActionsOnly">
              <Typography.Text type="secondary">Preview is read-only. Download the original file when needed.</Typography.Text>
              <Button icon={<DownloadOutlined />} href={vehicleDocumentContentUrl(vehicleId, previewDocument.id)} target="_blank">Download original</Button>
            </div>
          ) : undefined}
        />
      )}
    </Space>
  );
}

function ocrFieldSummary(job: VehicleOcrJob) {
  const fields = job.result?.fields ?? {};
  const parts = [
    fields.supplierName ? `Supplier: ${fields.supplierName}` : undefined,
    fields.invoiceNumber ? `Invoice: ${fields.invoiceNumber}` : undefined,
    fields.receiptNumber ? `Receipt: ${fields.receiptNumber}` : undefined,
    fields.plateNumberOnInvoice || fields.plateNumber ? `Plate: ${fields.plateNumberOnInvoice || fields.plateNumber}` : undefined,
    fields.amount || fields.nettPrice ? formatOcrMoney(fields.amount || fields.nettPrice) : undefined
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "-";
}

export function DashboardPage({
  dashboard,
  dashboardLoadError,
  reminders,
  priorityActions,
  reminderLoadError,
  vehicles = [],
  lastCheckedAt,
  refreshing,
  onRefresh,
  analyticsPeriod,
  analyticsRangePreset,
  onAnalyticsPeriodChange,
  onNavigate
}: {
  dashboard: DashboardSummary | null;
  dashboardLoadError: string | null;
  reminders: DashboardReminder[];
  priorityActions: PriorityActionItem[];
  reminderLoadError: string | null;
  vehicles?: Vehicle[];
  lastCheckedAt: Date | null;
  refreshing: boolean;
  analyticsPeriod: DashboardAnalyticsPeriod;
  analyticsRangePreset: DashboardAnalyticsRangePreset;
  onRefresh: () => Promise<void>;
  onAnalyticsPeriodChange: (preset: DashboardAnalyticsRangePreset, period: DashboardAnalyticsPeriod) => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const [reminderTypeFilter, setReminderTypeFilter] = useState<DashboardReminder["type"] | "All">("All");
  const [reminderDueFilter, setReminderDueFilter] = useState<ReminderDueFilter>("All");
  const [mobileReminderPage, setMobileReminderPage] = useState(1);
  const dashboardReminderTypes = Array.from(new Set(reminders.map((reminder) => reminder.type)));
  const safeStock = safeDashboardStockSummary(vehicles);
  const agingBuckets = dashboard?.agingBuckets ?? [];
  const moneyRiskBreakdown = dashboard?.moneyRiskBreakdown ?? [];
  const topEnquiredVehicles = dashboard?.topEnquiredVehicles ?? [];
  const topSellingModels = dashboard?.topSellingModels ?? [];
  const leadTrend = dashboard?.leadTrend ?? [];
  const leadsAwaitingFirstResponse = dashboard?.leadsAwaitingFirstResponse ?? 0;
  const monthlyProfitTrend = dashboard?.monthlyProfitTrend ?? [];
  const leadStages = dashboard?.salesFunnel?.stages ?? [];
  const leadClosureRate = Math.min(100, Math.max(0, dashboard?.salesFunnel?.conversionRate ?? 0));
  const topDemandVehicle = topEnquiredVehicles[0];
  const topSellingDisplayItems = topSellingModels;
  const topSellingModel = topSellingDisplayItems[0];
  const refurbishment = dashboard?.refurbishment;
  const aiDocumentProcessing = dashboard?.aiDocumentProcessing;
  const refurbishmentHighestCosts = refurbishment?.highestCostVehicles ?? [];
  const analyticsPeriodLabel = dashboardAnalyticsPeriodLabel(analyticsPeriod);
  const receivableLabels = new Set(["Outstanding Payment", "Open Debt Recovery"]);
  const moneyToCollect = moneyRiskBreakdown
    .filter((item) => receivableLabels.has(item.label))
    .reduce((sum, item) => sum + Math.max(item.amount, 0), 0);
  const moneyToPay = moneyRiskBreakdown
    .filter((item) => !receivableLabels.has(item.label))
    .reduce((sum, item) => sum + Math.max(item.amount, 0), 0);
  const filteredReminders = filterDashboardReminders(reminders, { type: reminderTypeFilter, due: reminderDueFilter });
  const projectedStockProfit = dashboard?.totalProfit ?? dashboard?.estimatedProfit ?? 0;
  const purchaseCost = dashboard?.purchaseCost ?? 0;
  const actualProfit = dashboard?.actualProfit ?? 0;
  const totalSales = dashboard?.totalSales ?? 0;
  const outstandingCollection = dashboard?.outstandingCollection ?? dashboard?.outstandingPayment ?? 0;
  const settlementDueAmount = dashboard?.settlementDueAmount ?? 0;
  const urgentReminderCount = reminders.filter((reminder) => {
    const dueLabel = reminderDueLabel(reminder);
    return dueLabel === "Overdue" || dueLabel === "Due today";
  }).length;
  const reminderFiltersActive = reminderTypeFilter !== "All" || reminderDueFilter !== "All";
  const resetReminderFilters = () => {
    setReminderTypeFilter("All");
    setReminderDueFilter("All");
    setMobileReminderPage(1);
  };
  const mobileReminderPageCount = Math.max(1, Math.ceil(filteredReminders.length / 8));
  const clampedMobileReminderPage = Math.min(mobileReminderPage, mobileReminderPageCount);
  const mobileReminders = filteredReminders.slice((clampedMobileReminderPage - 1) * 8, clampedMobileReminderPage * 8);
  const urgentReminders = urgentDashboardReminders(reminders);
  const dashboardToday = singaporeTodayIsoDate();
  const priorityEntries = dashboardPriorityEntries(reminders, priorityActions, dashboardToday);
  const priorityDueNowCount = priorityEntries.filter((entry) => entry.dueDate <= dashboardToday).length;
  const priorityStatus = reminderLoadError
    ? { color: "orange", label: "Check incomplete" }
    : priorityDueNowCount > 0
      ? { color: "red", label: `${priorityDueNowCount} action${priorityDueNowCount === 1 ? "" : "s"} due now` }
      : priorityEntries.length > 0
        ? { color: "blue", label: `${priorityEntries.length} active action${priorityEntries.length === 1 ? "" : "s"}` }
        : { color: "green", label: "All clear" };
  const cashFollowUpItems = moneyRiskBreakdown.filter((item) => item.amount > 0);
  const collectCashItemCount = cashFollowUpItems.filter((item) => receivableLabels.has(item.label)).length;
  const payCashItemCount = cashFollowUpItems.length - collectCashItemCount;

  if (!dashboard && !dashboardLoadError) {
    return (
      <Space direction="vertical" size={16} className="fullWidth dashboardPage">
        <ProCard title="Operations dashboard / 运营看板">
          <Skeleton active paragraph={{ rows: 6 }} />
        </ProCard>
      </Space>
    );
  }

  if (!dashboard) {
    return (
      <ProCard title="Operations dashboard / 运营看板">
        <Alert
          type="error"
          showIcon
          message="Dashboard data could not be loaded"
          description={dashboardLoadError ?? "The dashboard is still loading. Please try again."}
          action={<Button onClick={() => void onRefresh()} loading={refreshing}>Try again</Button>}
        />
      </ProCard>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth dashboardPage">
      <div className="dashboardCommandBar">
        <div>
          <Typography.Text className="loginKicker">Executive pulse / 老板速览</Typography.Text>
          <Typography.Title level={2}>See demand, cost, sales, and follow-up at a glance</Typography.Title>
          <Typography.Text>Every ranking comes from protected operational records.</Typography.Text>
        </div>
        <div className={topDemandVehicle ? "dashboardFocusQueue dashboardFocusQueueHot" : "dashboardFocusQueue"}>
          <span>URGENT STOCK</span>
          <strong>{dashboard.vehicleAging} vehicles over 60 days</strong>
          <small>{dashboard.vehicleAging > 0 ? "Review price or clearance action now." : "No urgent aging stock."}</small>
        </div>
      </div>

        <ProCard
          title="Operations dashboard / 运营看板"
          className="dashboardOverviewCard"
          extra={<Space size={8} wrap><Tag color={reminderLoadError ? "orange" : priorityDueNowCount > 0 ? "red" : "green"}>{reminderLoadError ? "Check incomplete" : `${priorityDueNowCount} due now`}</Tag><Button size="small" onClick={() => void onRefresh()} loading={refreshing}>Refresh</Button></Space>}
        >
          <DashboardAnalyticsControls
            period={analyticsPeriod}
            preset={analyticsRangePreset}
            disabled={refreshing}
            onChange={(preset, period) => void onAnalyticsPeriodChange(preset, period)}
          />
          <Typography.Text type="secondary">Live stock, current-stock cost, projected margin, loan, collection, settlement, and aging figures are current as of now. Sales, realised profit, lead, and refurbishment analysis use {analyticsPeriodLabel}. {lastCheckedAt ? `Last checked ${lastCheckedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "Not checked yet."}</Typography.Text>
          <div className="metricGrid dashboardMetricGrid">
            <Metric label="Total Stock / 总库存" value={dashboard.totalStock} onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
            <Metric label="Total Sales / 销售总数" value={totalSales} meta={analyticsPeriodLabel} tone="profit" onClick={() => onNavigate(dashboardMetricTarget("sold", analyticsPeriod))} />
            <Metric label="Total Profit / 实际利润" value={formatCompactMoney(actualProfit)} meta={analyticsPeriodLabel} tone={actualProfit >= 0 ? "profit" : "risk"} onClick={() => onNavigate(dashboardMetricTarget("sold", analyticsPeriod))} />
            <Metric label="Pending Loan / 贷款待跟进" value={dashboard.pendingLoan} tone={dashboard.pendingLoan > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("loans"))} />
            <Metric label="Outstanding Collection / 待收总额" value={formatCompactMoney(outstandingCollection)} meta="Unreconciled payments + open debt" tone={outstandingCollection > 0 ? "risk" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("payments"))} />
            <Metric label="Settlement Due / 结算到期" value={dashboard.settlementDue} meta={formatCompactMoney(settlementDueAmount)} tone={dashboard.settlementDue > 0 ? "risk" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("settlements"))} />
            <Metric label="Purchase Cost / 收车成本" value={formatCompactMoney(purchaseCost)} meta="Current unsold stock" tone="neutral" onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
            <Metric label="Repair Cost / 整备费用" value={formatCompactMoney(dashboard.repairCost)} meta="Current unsold stock" tone={dashboard.repairCost > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("profit"))} />
            <Metric label="Projected Stock Profit / 库存预计利润" value={formatCompactMoney(projectedStockProfit)} meta="Current unsold stock" tone={projectedStockProfit >= 0 ? "profit" : "risk"} onClick={() => onNavigate(dashboardMetricTarget("profit"))} />
            <Metric label="Aging / 超60天库存" value={dashboard.vehicleAging} tone={dashboard.vehicleAging > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("aging"))} />
          </div>
        </ProCard>

        {aiDocumentProcessing && <DashboardAiDocumentProcessingPanel processing={aiDocumentProcessing} analyticsPeriodLabel={analyticsPeriodLabel} />}

        {/* The upstream fallback is retained in data-safe form by the priority, cash, and aging panels below. */}
        {/*
        <div className="dashboardSimpleGrid">
          <ProCard title="Vehicle aging / 库存车龄" className="dashboardSimpleCard">
          <Table
            rowKey="label"
            size="small"
            columns={[
              { title: "Age / 车龄", dataIndex: "label", render: (value) => `${value} days` },
              { title: "Stock / 库存", dataIndex: "count" }
            ]}
            dataSource={agingBuckets}
            pagination={false}
            locale={{ emptyText: "No aging buckets available." }}
          />
          </ProCard>
          <ProCard title="Cash follow-up / 收付款跟进" className="dashboardSimpleCard" extra={<Space size={4} wrap><Tag color={moneyToCollect > 0 ? "blue" : "green"}>Collect {formatCompactMoney(moneyToCollect)}</Tag><Tag color={moneyToPay > 0 ? "volcano" : "green"}>Pay {formatCompactMoney(moneyToPay)}</Tag></Space>}>
          <Table
            rowKey="label"
            size="small"
            columns={[
              { title: "Item / 项目", dataIndex: "label", render: dashboardLabel },
              { title: "Direction / 方向", render: (_, row) => <Tag color={receivableLabels.has(row.label) ? "blue" : "volcano"}>{receivableLabels.has(row.label) ? "Collect / 待收" : "Pay / 待付"}</Tag> },
              { title: "Amount / 金额", dataIndex: "amount", align: "right", render: (value) => formatMoney(Number(value)) },
              { title: "Action / 操作", render: (_, row) => <Button size="small" onClick={() => onNavigate(financeRiskTarget(row.label))}>Open</Button> }
            ]}
            dataSource={moneyRiskBreakdown}
            pagination={false}
            locale={{ emptyText: "No money follow-up items available." }}
          />
          </ProCard>
        </div>
      </> : (
        <ProCard title="Dashboard summary unavailable / 看板摘要暂不可用" className="dashboardOverviewCard">
          <Alert type="warning" showIcon message="Live dashboard metrics could not be loaded." description="Only the authorized vehicle counts below are shown; finance, profit, aging, and workflow values are unavailable." />
          <div className="metricGrid dashboardMetricGrid">
            <Metric label="Authorized stock / 已加载库存" value={safeStock.totalStock} onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
            <Metric label="Available / 可售" value={safeStock.available} tone={safeStock.available > 0 ? "neutral" : "work"} onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
            <Metric label="Loan processing / 贷款处理中" value={safeStock.loanProcessing} tone={safeStock.loanProcessing > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("loans"))} />
            <Metric label="Sold / 已售" value={safeStock.sold} onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
        */}
        <ProCard
          title="Priority actions / 老板待办"
          className="dashboardPriorityCard"
          extra={<Tag color={priorityStatus.color}>{priorityStatus.label}</Tag>}
        >
          {priorityEntries.length > 0 ? (
            <>
              <Typography.Text type="secondary">Start here: overdue and due-today work comes first; upcoming department actions and Daily Spend due soon follow.</Typography.Text>
              <div className="dashboardPriorityList">
                {priorityEntries.map((entry) => {
                  const dueLabel = entry.dueDate < dashboardToday
                    ? "Overdue"
                    : entry.dueDate === dashboardToday
                      ? "Due today"
                      : entry.source === "reminder" && entry.type === "DailySpendDue"
                        ? "Due soon"
                        : "Action";
                  const dueColor = dueLabel === "Overdue" ? "red" : dueLabel === "Due today" ? "orange" : dueLabel === "Due soon" ? "blue" : "default";
                  return (
                    <article className="dashboardPriorityAction" key={entry.key}>
                      <Tag className="dashboardStatusBadge" color={dueColor}>{dashboardLabel(dueLabel)}</Tag>
                      <div className="dashboardPriorityDetails">
                        <strong>{entry.title}</strong>
                        <span>{dashboardLabel(entry.type)} · {entry.subject ?? "General"}</span>
                      </div>
                      <div className="dashboardPriorityDue">
                        <small>Due / 到期</small>
                        <strong>{entry.dueDate}</strong>
                      </div>
                      <div className="dashboardPriorityAmount">
                        <small>Exposure / 金额</small>
                        <strong>{entry.amount ? formatMoney(Number(entry.amount)) : "—"}</strong>
                      </div>
                      <Button type="primary" size="small" aria-label={`Open ${entry.title}`} onClick={() => onNavigate(entry.target)}>Open action</Button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={reminderLoadError ? "The action queue could not be checked completely." : "No overdue, due-today, due-soon, or department actions."} />
          )}
          {reminderLoadError && <Alert className="dashboardPriorityAlert" type="warning" showIcon message="Priority actions could not be refreshed" description={reminderLoadError} action={<Button size="small" onClick={() => void onRefresh()} loading={refreshing}>Try again</Button>} />}
          <div className="dashboardCashActions">
            <div className="dashboardCashActionsHeader">
              <div><strong>Cash follow-up / 收付款跟进</strong><span>Money requiring a decision or follow-up.</span></div>
              <Space size={4} wrap><Tag className="dashboardStatusBadge" color={moneyToCollect > 0 ? "blue" : "green"}>Collect total {formatCompactMoney(moneyToCollect)} · {collectCashItemCount} item{collectCashItemCount === 1 ? "" : "s"}</Tag><Tag className="dashboardStatusBadge" color={moneyToPay > 0 ? "red" : "green"}>Pay total {formatCompactMoney(moneyToPay)} · {payCashItemCount} item{payCashItemCount === 1 ? "" : "s"}</Tag></Space>
            </div>
            {cashFollowUpItems.length > 0 ? (
              <div className="dashboardCashActionList">
                {cashFollowUpItems.map((item) => {
                  const collect = receivableLabels.has(item.label);
                  return (
                    <article className="dashboardCashAction" key={item.label}>
                      <Tag className="dashboardStatusBadge" color={collect ? "blue" : "red"}>{collect ? "Collect / 待收" : "Pay / 待付"}</Tag>
                      <strong>{dashboardLabel(item.label)}</strong>
                      <span>{formatMoney(item.amount)}</span>
                      <Button size="small" aria-label={`Open ${dashboardLabel(item.label)}`} onClick={() => onNavigate(financeRiskTarget(item.label))}>Open cash item</Button>
                    </article>
                  );
                })}
              </div>
            ) : <Typography.Text type="secondary">No outstanding cash follow-up.</Typography.Text>}
          </div>
        </ProCard>

      {/*
      <ProCard
        title="Reminder inbox / 提醒事项"
        className="dashboardReminderCard"
        extra={<Space size={8} wrap><Tag color={urgentReminderCount > 0 ? "red" : "blue"}>{reminderFiltersActive ? `${filteredReminders.length} matching` : `${filteredReminders.length} reminder${filteredReminders.length === 1 ? "" : "s"}`}</Tag><Button size="small" onClick={() => void onRefresh()} loading={refreshing}>Refresh</Button></Space>}
      >
        {reminderLoadError && <Alert type="error" showIcon message="Reminder inbox could not be loaded" description={reminderLoadError} action={<Button size="small" onClick={() => void onRefresh()} loading={refreshing}>Try again</Button>} />}
        <div className="dashboardInboxHeader">
          <Space className="toolbarForm" wrap>
            <Select
              value={reminderTypeFilter}
              options={[{ value: "All", label: "All Types / 全部类型" }, ...dashboardReminderTypes.map((type) => ({ value: type, label: dashboardLabel(type) }))]}
              onChange={(value) => {
                setReminderTypeFilter(value);
                setMobileReminderPage(1);
              }}
              style={{ width: 220 }}
            />
            <Select
              value={reminderDueFilter}
              options={[
                { value: "All", label: "All Due / 全部到期" },
                { value: "Overdue", label: "Overdue / 已逾期" },
                { value: "DueToday", label: "Due today / 今日到期" },
                { value: "Upcoming", label: "Upcoming / 即将到期" }
              ]}
              onChange={(value) => {
                setReminderDueFilter(value);
                setMobileReminderPage(1);
              }}
              style={{ width: 160 }}
            />
            {reminderFiltersActive && <Button size="small" onClick={resetReminderFilters}>Clear filters</Button>}
          </Space>
          <Typography.Text type="secondary">{urgentReminderCount} overdue or due today across all reminders.</Typography.Text>
        </div>
        <div className="mobileRecordList dashboardReminderMobileList">
          {mobileReminders.map((reminder) => (
            <article className="mobileRecordCard" key={`${reminder.type}-${reminder.vehicleId}-${reminder.dueDate}`}>
              <div className="mobileRecordHeader">
                <div>
                  <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                  <Typography.Title level={5}>{reminder.vehiclePlate}</Typography.Title>
                </div>
                <Tag color={reminderColor(reminder.type)}>{dashboardLabel(reminder.type)}</Tag>
              </div>
              <div className="mobileRecordMeta">
                <span><small>Due / 到期</small><strong>{reminder.dueDate} · {dashboardLabel(reminderDueLabel(reminder.dueDate))}</strong></span>
                <span><small>Amount / 金额</small><strong>{reminder.amount ? formatMoney(Number(reminder.amount)) : "-"}</strong></span>
              </div>
              <div className="mobileRecordTextBlock">{reminder.title}</div>
              <div className="mobileRecordFooter"><Button type="primary" onClick={() => onNavigate(dashboardReminderTarget(reminder))}>Open follow-up</Button></div>
            </article>
          ))}
          {filteredReminders.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={reminderLoadError ? "Retry to load reminders." : "No reminders match the current filters."} />}
          <Pagination className="mobileRecordPagination" current={clampedMobileReminderPage} pageSize={8} total={filteredReminders.length} showSizeChanger={false} hideOnSinglePage onChange={setMobileReminderPage} />
        </div>
        <Table
          className="desktopDataTable"
          rowKey={(row) => `${row.type}-${row.vehicleId}-${row.dueDate}`}
          columns={[
            { title: "Type / 类型", dataIndex: "type", render: (value) => <Tag color={reminderColor(value)}>{dashboardLabel(value)}</Tag> },
            { title: "Title / 事项", dataIndex: "title" },
            { title: "Car Plate / 车牌", dataIndex: "vehiclePlate" },
            { title: "Due / 到期", dataIndex: "dueDate", render: (value) => <Space><span>{value}</span><Tag color={reminderDueTagColor(value)}>{dashboardLabel(reminderDueLabel(value))}</Tag></Space> },
            { title: "Amount / 金额", dataIndex: "amount", render: (value) => value ? `RM ${Number(value).toLocaleString()}` : "-" },
            { title: "Action / 操作", render: (_, row) => <Button size="small" onClick={() => onNavigate(dashboardReminderTarget(row))}>Open</Button> }
          ]}
          dataSource={filteredReminders}
          pagination={tablePagination(8)}
          scroll={{ x: 760 }}
          locale={{ emptyText: "No reminders match the current filters." }}
        />
      </ProCard>
      */}
        <ProCard
          title="Reminder inbox / 提醒事项"
          className="dashboardReminderCard"
          extra={<Space size={8} wrap><Tag color={urgentReminderCount > 0 ? "red" : "blue"}>{reminderFiltersActive ? `${filteredReminders.length} matching` : `${filteredReminders.length} reminder${filteredReminders.length === 1 ? "" : "s"}`}</Tag><Button size="small" onClick={() => void onRefresh()} loading={refreshing}>Refresh</Button></Space>}
        >
          {reminderLoadError && <Alert type="warning" showIcon message="Reminder inbox could not be refreshed" description={reminderLoadError} />}
          <Space className="toolbarForm" wrap>
            <Select value={reminderTypeFilter} options={[{ value: "All", label: "All Types / 全部类型" }, ...dashboardReminderTypes.map((type) => ({ value: type, label: dashboardLabel(type) }))]} onChange={(value) => { setReminderTypeFilter(value); setMobileReminderPage(1); }} style={{ width: 220 }} />
            <Select value={reminderDueFilter} options={[{ value: "All", label: "All Due / 全部到期" }, { value: "Overdue", label: "Overdue / 已逾期" }, { value: "DueToday", label: "Due today / 今日到期" }, { value: "DueSoon", label: "Due soon / 即将到期" }, { value: "Upcoming", label: "Upcoming / 后续到期" }]} onChange={(value) => { setReminderDueFilter(value); setMobileReminderPage(1); }} style={{ width: 170 }} />
            {reminderFiltersActive && <Button size="small" onClick={resetReminderFilters}>Clear filters</Button>}
          </Space>
          <div className="mobileRecordList dashboardReminderMobileList">
            {mobileReminders.map((reminder) => (
              <article className="mobileRecordCard" key={`${reminder.type}-${reminder.vehicleId}-${reminder.dueDate}`}>
                <div className="mobileRecordHeader">
                  <div>
                    <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                    <Typography.Title level={5}>{reminder.vehiclePlate}</Typography.Title>
                  </div>
                  <Tag>{dashboardLabel(reminder.type)}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span><small>Due / 到期</small><strong>{reminder.dueDate} · {dashboardLabel(reminderDueLabel(reminder))}</strong></span>
                  <span><small>Amount / 金额</small><strong>{reminder.amount ? formatMoney(Number(reminder.amount)) : "-"}</strong></span>
                </div>
                <div className="mobileRecordTextBlock">{reminder.title}</div>
                <div className="mobileRecordFooter"><Button type="primary" onClick={() => onNavigate(dashboardReminderTarget(reminder))}>Open follow-up</Button></div>
              </article>
            ))}
            {filteredReminders.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={reminderLoadError ? "Retry to load reminders." : "No reminders match the current filters."} />}
            <Pagination className="mobileRecordPagination" current={clampedMobileReminderPage} pageSize={8} total={filteredReminders.length} showSizeChanger={false} hideOnSinglePage onChange={setMobileReminderPage} />
          </div>
          <Table
            className="desktopDataTable"
            rowKey={(row) => `${row.type}-${row.vehicleId}-${row.dueDate}`}
            columns={[
              { title: "Type / 类型", dataIndex: "type", render: (value) => <Tag>{dashboardLabel(value)}</Tag> },
              { title: "Title / 事项", dataIndex: "title" },
              { title: "Car Plate / 车牌", dataIndex: "vehiclePlate" },
              { title: "Due / 到期", dataIndex: "dueDate", render: (value, row) => <Space><span>{value}</span><Tag color={reminderDueTagColor(row)}>{dashboardLabel(reminderDueLabel(row))}</Tag></Space> },
              { title: "Amount / 金额", dataIndex: "amount", render: (value) => value ? `RM ${Number(value).toLocaleString()}` : "-" },
              { title: "Action / 操作", render: (_, row) => <Button size="small" onClick={() => onNavigate(dashboardReminderTarget(row))}>Open</Button> }
            ]}
            dataSource={filteredReminders}
            pagination={tablePagination(8)}
            scroll={{ x: 760 }}
            locale={{ emptyText: "No reminders match the current filters." }}
          />
        </ProCard>

        <section className="dashboardPanel" aria-labelledby="dashboard-intelligence-title">
          <div className="dashboardPanelHeader">
            <div>
              <span id="dashboard-intelligence-title">Executive intelligence / 决策图表</span>
              <strong>Ranked answers for the questions a boss asks first.</strong>
            </div>
            <Tag color="green">Live protected data</Tag>
          </div>
          <div className="dashboardInsightGrid dashboardInsightGridOperations">
            <ProCard
              title="Refurbishment analysis / 整备分析"
              className="dashboardInsightCard dashboardInsightCardPriority"
              extra={<Button size="small" onClick={() => onNavigate("/repairs")}>Open repairs</Button>}
            >
              <div className="insightCaption"><span>Final repair cost in {analyticsPeriodLabel}</span><strong>{formatCompactMoney(refurbishment?.finalRepairSpend ?? 0)}</strong></div>
              <div className="refurbishmentSummaryGrid">
                <span><small>Vehicles repaired</small><strong>{refurbishment?.vehicleCount ?? 0}</strong></span>
                <span><small>Average per vehicle</small><strong>{formatCompactMoney(refurbishment?.averageSpendPerVehicle ?? 0)}</strong></span>
                <span><small>Work in progress</small><strong>{refurbishment?.workInProgressCount ?? 0}</strong></span>
                <span><small>Overdue work</small><strong>{refurbishment?.overdueWorkCount ?? 0}</strong></span>
              </div>
              <DashboardRepairCostChart
                items={refurbishmentHighestCosts.map((item) => ({ label: item.label, value: item.amount }))}
                emptyText="No repair cost recorded yet."
              />
            </ProCard>
            <ProCard
              title="Sales performance / 销售表现"
              className="dashboardInsightCard dashboardInsightCardPositive"
              extra={<Button size="small" onClick={() => onNavigate(dashboardMetricTarget("sold", analyticsPeriod))}>Open sold vehicles</Button>}
            >
              <div className="insightCaption"><span>{totalSales} confirmed sold vehicle{totalSales === 1 ? "" : "s"} in {analyticsPeriodLabel}</span><strong>{topSellingModel?.label ?? "No data"}</strong></div>
              <DashboardBarList
                items={topSellingDisplayItems.map((item) => ({ label: item.label, value: item.count }))}
                formatValue={(value) => `${value} sold`}
                tone="sales"
                emptyText="No sold vehicle records yet."
              />
            </ProCard>
            <ProCard
              title="Lead volume / 询问趋势"
              className="dashboardInsightCard dashboardInsightCardWide"
              extra={<Button size="small" onClick={() => onNavigate("/leads")}>Open leads</Button>}
            >
              <div className="insightCaption"><span>Enquiries in {analyticsPeriodLabel}, separate from confirmed sales</span><strong>{leadTrend.reduce((sum, item) => sum + item.count, 0)} enquiries</strong></div>
              <DashboardLeadTrend items={leadTrend} />
              <DashboardLeadVehicleList items={topEnquiredVehicles} />
            </ProCard>
            <ProCard
              title="Monthly sales & profit / 月度销售与利润"
              className="dashboardInsightCard dashboardInsightCardWide"
              extra={<Button size="small" onClick={() => onNavigate(dashboardMetricTarget("sold", analyticsPeriod))}>Open sold vehicles</Button>}
            >
              <div className="insightCaption"><span>Blue: actual sold profit · Grey: projected profit from stock introduced</span><strong>{formatCompactMoney(monthlyProfitTrend.reduce((sum, item) => sum + item.soldProfit, 0))} realised</strong></div>
              <DashboardProfitTrend items={monthlyProfitTrend} />
            </ProCard>
            <ProCard
              title="Lead follow-up / 询问跟进"
              className="dashboardInsightCard"
              extra={<Button size="small" onClick={() => onNavigate("/leads")}>Follow up</Button>}
            >
              <div className="insightCaption"><span>Case status, not confirmed sales</span><strong>{leadsAwaitingFirstResponse > 0 ? `${leadsAwaitingFirstResponse} waiting over 24h` : "All new leads covered"}</strong></div>
              <DashboardLeadStatus stages={leadStages} closureRate={leadClosureRate} />
            </ProCard>
          </div>
        </section>

        <div className="dashboardSimpleGrid">
          <ProCard title="Vehicle aging / 库存车龄" className="dashboardSimpleCard dashboardAgingCard">
            <DashboardAgingActionBoard items={agingBuckets} onNavigate={onNavigate} />
          </ProCard>
        </div>
    </Space>
  );
}

function DashboardAiDocumentProcessingPanel({
  processing,
  analyticsPeriodLabel
}: {
  processing: DashboardAiDocumentProcessing;
  analyticsPeriodLabel: string;
}) {
  return (
    <ProCard
      title="AI document processing / AI 文件处理"
      className="dashboardPriorityCard"
      extra={<Tag color={processing.pendingReviewCount > 0 ? "orange" : "green"}>{processing.pendingReviewCount > 0 ? `${processing.pendingReviewCount} pending staff check${processing.pendingReviewCount === 1 ? "" : "s"}` : "Staff check queue clear"}</Tag>}
    >
      <Alert className="operationalInfoAlert sectionIntroAlert" type="info" showIcon message="Staff must review AI-extracted values before saving. This dashboard excludes document images, identity details, filenames, and extracted text." />
      <div className="metricGrid dashboardMetricGrid">
        <Metric label="Scans / 扫描" value={processing.scanCount} meta={analyticsPeriodLabel} />
        <Metric label="Reviewed AI documents / 已复核 AI 文件" value={processing.reviewedCount} meta="Staff-corrected values are retained" tone="profit" />
        <Metric label="OCR field accuracy / OCR 字段准确率" value={processing.accuracyPercent === null || processing.accuracyPercent === undefined ? "Pending" : `${processing.accuracyPercent}%`} meta={processing.comparedFieldCount > 0 ? `${processing.correctFieldCount} unchanged · ${processing.correctedFieldCount} corrected` : "Appears after the first saved review"} tone={processing.correctedFieldCount > 0 ? "work" : "neutral"} />
        <Metric label="Need checking / 需仔细检查" value={processing.lowConfidenceCount} meta="Below 75% reading confidence" tone={processing.lowConfidenceCount > 0 ? "work" : "neutral"} />
        <Metric label="Failed scans / 失败扫描" value={processing.failedCount} meta={analyticsPeriodLabel} tone={processing.failedCount > 0 ? "risk" : "neutral"} />
        <Metric label="Pending staff check / 待员工核对" value={processing.pendingReviewCount} meta="Live backlog" tone={processing.pendingReviewCount > 0 ? "work" : "neutral"} />
        <Metric label="OCR capacity / OCR 容量" value={`${processing.remainingThisMonth} left`} meta={`${processing.usedThisMonth} of ${processing.monthlyRequestLimit} used this month`} tone={processing.remainingThisMonth === 0 ? "risk" : "neutral"} />
      </div>
      <Table
        rowKey="category"
        size="small"
        pagination={false}
        scroll={{ x: 760 }}
        dataSource={processing.categories}
        locale={{ emptyText: "No OCR activity in this period." }}
        columns={[
          { title: "Document type / 文件类型", dataIndex: "label" },
          { title: "Scans", dataIndex: "scanCount", align: "right" },
          { title: "Reviewed", dataIndex: "reviewedCount", align: "right" },
          { title: "Accuracy", dataIndex: "accuracyPercent", align: "right", render: (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value}%` },
          { title: "Corrected", dataIndex: "correctedFieldCount", align: "right", render: (value: number) => <Tag color={value > 0 ? "orange" : "default"}>{value}</Tag> },
          { title: "Need checking", dataIndex: "lowConfidenceCount", align: "right", render: (value: number) => <Tag color={value > 0 ? "orange" : "default"}>{value}</Tag> },
          { title: "Failed", dataIndex: "failedCount", align: "right", render: (value: number) => <Tag color={value > 0 ? "red" : "default"}>{value}</Tag> }
        ]}
      />
    </ProCard>
  );
}

function DashboardAnalyticsControls({
  period,
  preset,
  disabled,
  onChange
}: {
  period: DashboardAnalyticsPeriod;
  preset: DashboardAnalyticsRangePreset;
  disabled: boolean;
  onChange: (preset: DashboardAnalyticsRangePreset, period: DashboardAnalyticsPeriod) => void;
}) {
  const [customFrom, setCustomFrom] = useState(period.from ?? "");
  const [customTo, setCustomTo] = useState(period.to ?? "");

  useEffect(() => {
    setCustomFrom(period.from ?? "");
    setCustomTo(period.to ?? "");
  }, [period.from, period.to]);

  const selectPreset = (nextPreset: DashboardAnalyticsRangePreset) => {
    if (nextPreset === "Custom") return onChange(nextPreset, period);
    onChange(nextPreset, dashboardAnalyticsPeriodForPreset(nextPreset));
  };

  return (
    <div className="dashboardAnalyticsControls">
      <div>
        <strong>Analytics range / 分析期间</strong>
        <span>Sales, profit, lead, and refurbishment analysis only.</span>
      </div>
      <Space wrap>
        <Select
          aria-label="Dashboard analytics range"
          value={preset}
          disabled={disabled}
          onChange={selectPreset}
          options={[
            { value: "ThisMonth", label: "This month" },
            { value: "LastMonth", label: "Last month" },
            { value: "YearToDate", label: "Year to date" },
            { value: "AllTime", label: "All time" },
            { value: "Custom", label: "Custom dates" }
          ]}
        />
        {preset === "Custom" && <>
          <DatePicker.RangePicker
            aria-label="Dashboard analytics date range"
            disabled={disabled}
            format="YYYY-MM-DD"
            placeholder={["Start date", "End date"]}
            value={customFrom && customTo ? [dayjs(customFrom), dayjs(customTo)] : null}
            onChange={(_, dateStrings) => {
              setCustomFrom(dateStrings[0] ?? "");
              setCustomTo(dateStrings[1] ?? "");
            }}
          />
          <Button size="small" disabled={disabled || !customFrom || !customTo || customFrom > customTo} onClick={() => onChange("Custom", { from: customFrom, to: customTo })}>Apply dates</Button>
        </>}
      </Space>
    </div>
  );
}

function dashboardAnalyticsPeriodLabel(period: DashboardAnalyticsPeriod) {
  if (!period.from || !period.to) return "all time";
  return `${period.from} to ${period.to}`;
}

const dashboardLabelMap: Record<string, string> = {
  Available: "Available / 可售",
  LoanProcessing: "Loan Processing / 贷款处理中",
  Sold: "Sold / 已售",
  YSHeng: "YSHeng / 裕盛",
  KS: "KS / KS",
  "0-30": "0-30 days / 0-30天",
  "31-60": "31-60 days / 31-60天",
  "61+": "61+ days / 61天以上",
  "Outstanding Payment": "Outstanding Payment / 未收款",
  "Unpaid Settlement": "Unpaid Settlement / 未付结算",
  "Open Debt Recovery": "Open Debt Recovery / 债务追收",
  "Unpaid Daily Spend": "Unpaid Daily Spend / 未付日常支出",
  "Open Payment Voucher": "Open Payment Voucher / 未付付款凭证",
  Overdue: "Overdue / 已逾期",
  "Due today": "Due today / 今日到期",
  "Due soon": "Due soon / 即将到期",
  Action: "Action / 待办",
  DueToday: "Due Today / 今日到期",
  Upcoming: "Upcoming / 即将到期",
  LoanFollowUp: "Loan Follow-up / 贷款跟进",
  DeliveryPreparation: "Delivery Preparation / 交车准备",
  SettlementDue: "Settlement Due / 结算到期",
  PaymentBankFollowUp: "Payment Bank Follow-up / 银行收款跟进",
  PaymentStatusFollowUp: "Payment Status Follow-up / 收款状态跟进",
  DailySpendDue: "Daily Spend Due / 日常支出到期",
  DebtRecoveryFollowUp: "Debt Recovery Follow-up / 债务追收跟进",
  PaymentVoucherFollowUp: "Payment Voucher Follow-up / 付款凭证跟进",
  LeadFollowUp: "Lead Follow-up / 询问跟进",
  RepairWorkInProgress: "Repair Work in Progress / 整备处理中",
  LeaveApproval: "Leave Approval / 请假审批",
  New: "New / 新询问",
  Contacted: "Contacted / 已联系",
  Closed: "Closed / 已关闭",
  "Selling + Charges": "Selling + Charges / 售价加收费",
  "Purchase Cost": "Purchase Cost / 收车成本",
  "Repair Cost": "Repair Cost / 整备费用",
  Commission: "Commission / 佣金",
  "Pickup Allowance": "Pickup Allowance / 收车津贴",
  "Estimated Profit": "Estimated Profit / 预估利润"
};

function dashboardLabel(label: string) {
  return dashboardLabelMap[label] ?? label;
}

type DashboardBarItem = {
  label: string;
  value: number;
};

function DashboardBarList({
  items,
  formatValue,
  tone,
  emptyText
}: {
  items: DashboardBarItem[];
  formatValue: (value: number) => string;
  tone: "demand" | "cost" | "sales";
  emptyText: string;
}) {
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className={`barList barList-${tone}`} role="list">
      {items.map((item) => (
        <div className="barRow" role="listitem" key={item.label}>
          <div className="barRowHeader"><span title={item.label}>{item.label}</span><strong>{formatValue(item.value)}</strong></div>
          <div className="barTrack" aria-hidden="true"><span style={{ width: `${item.value <= 0 ? 0 : Math.max(4, item.value * 100 / maxValue)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function DashboardRepairCostChart({
  items,
  emptyText
}: {
  items: DashboardBarItem[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="repairCostChart" role="list" aria-label="Repair cost exposure by vehicle">
      {items.map((item, index) => {
        const width = item.value <= 0 ? 0 : Math.max(5, item.value * 100 / maxValue);
        return (
          <div className="repairCostRow" role="listitem" key={item.label}>
            <div className="repairCostRowHeader">
              <span className="repairCostRank">{index + 1}</span>
              <strong className="repairCostLabel" title={item.label}>{item.label}</strong>
              <strong className="repairCostAmount">{formatCompactMoney(item.value)}</strong>
            </div>
            <div className="repairCostTrack" aria-hidden="true"><i style={{ width: `${width}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardLeadTrend({ items }: { items: Array<{ label: string; count: number }> }) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);
  const accessibleSummary = items.map((item) => `${item.label}: ${item.count}`).join(", ");
  const chartWidth = 780;
  const chartHeight = 156;
  const baseline = 130;
  const leftInset = 30;
  const rightInset = 30;
  const usableWidth = chartWidth - leftInset - rightInset;
  const points = items.map((item, index) => {
    const x = items.length <= 1 ? chartWidth / 2 : leftInset + (usableWidth * index / (items.length - 1));
    const y = baseline - (item.count / maxCount) * 96;
    return { ...item, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = points.length ? `M ${points[0].x} ${baseline} L ${linePoints.replaceAll(" ", " L ")} L ${points[points.length - 1].x} ${baseline} Z` : "";

  return (
    <div className="leadLineChart" role="img" aria-label={`Lead volume by month. ${accessibleSummary}`}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet" shapeRendering="geometricPrecision">
        {[34, 82, baseline].map((y) => <line key={y} x1={leftInset} x2={chartWidth - rightInset} y1={y} y2={y} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />)}
        {areaPath && <path className="leadLineArea" d={areaPath} />}
        {linePoints && <polyline className="leadLinePath" points={linePoints} vectorEffect="non-scaling-stroke" />}
        {points.map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="4.5" vectorEffect="non-scaling-stroke" /><text x={point.x} y={Math.max(17, point.y - 12)}>{point.count}</text></g>)}
      </svg>
      <div className="leadLineLabels">
        {items.map((item) => <small key={item.label}>{item.label}</small>)}
      </div>
    </div>
  );
}

function DashboardProfitTrend({ items }: { items: Array<{ label: string; estimatedProfit: number; soldProfit: number; soldCount: number }> }) {
  if (items.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No monthly profit data yet." />;
  const width = 780;
  const height = 178;
  const baseline = 138;
  const inset = 30;
  const maxValue = Math.max(...items.flatMap((item) => [Math.abs(item.estimatedProfit), Math.abs(item.soldProfit)]), 1);
  const pointFor = (value: number, index: number) => ({
    x: items.length === 1 ? width / 2 : inset + ((width - inset * 2) * index / (items.length - 1)),
    y: baseline - (value / maxValue) * 94
  });
  const estimatedPoints = items.map((item, index) => pointFor(item.estimatedProfit, index));
  const soldPoints = items.map((item, index) => pointFor(item.soldProfit, index));
  const path = (points: Array<{ x: number; y: number }>) => points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="profitLineChart" role="img" aria-label={items.map((item) => `${item.label}: sold ${formatCompactMoney(item.soldProfit)}, projected ${formatCompactMoney(item.estimatedProfit)}`).join(", ")}>
      <div className="profitLegend"><span><i className="profitLegendSold" />Actual sold profit</span><span><i className="profitLegendEstimated" />Projected stock profit</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        {[44, 91, baseline].map((y) => <line key={y} x1={inset} x2={width - inset} y1={y} y2={y} />)}
        <polyline className="profitLineEstimated" points={path(estimatedPoints)} />
        <polyline className="profitLineSold" points={path(soldPoints)} />
        {soldPoints.map((point, index) => <g key={items[index].label}><circle className="profitPointSold" cx={point.x} cy={point.y} r="4" /><text x={point.x} y={Math.max(18, point.y - 12)}>{formatCompactMoney(items[index].soldProfit)}</text></g>)}
      </svg>
      <div className="profitLineLabels">{items.map((item) => <small key={item.label}>{item.label}<br />{item.soldCount} sold</small>)}</div>
    </div>
  );
}

function DashboardLeadVehicleList({ items }: { items: Array<{ label: string; count: number }> }) {
  return (
    <section className="leadVehicleList" aria-labelledby="lead-vehicle-list-title">
      <div className="leadVehicleListHeader">
        <strong id="lead-vehicle-list-title">Enquiry vehicles / 询问车辆</strong>
        <span>All-time count</span>
      </div>
      {items.length > 0 ? (
        <div className="leadVehicleListRows" role="list">
          {items.map((item) => (
            <div className="leadVehicleListRow" role="listitem" key={item.label}>
              <span title={item.label}>{item.label}</span>
              <strong>{item.count} {item.count === 1 ? "enquiry" : "enquiries"}</strong>
            </div>
          ))}
        </div>
      ) : <Typography.Text type="secondary">No vehicle-linked enquiries yet.</Typography.Text>}
    </section>
  );
}

function DashboardAgingActionBoard({
  items,
  onNavigate
}: {
  items: Array<{ label: "0-30" | "31-60" | "61+"; count: number }>;
  onNavigate: (path: string) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const agingActions = [
    { bucket: "0-30" as const, title: "Fresh stock / 新鲜库存", action: "Normal sales follow-up", button: "Open fresh stock", focus: "fresh" as const },
    { bucket: "31-60" as const, title: "Watch list / 关注库存", action: "Review price and promotion", button: "Open watch list", focus: "watch" as const },
    { bucket: "61+" as const, title: "Urgent stock / 紧急库存", action: "Set price or clearance action", button: "Open urgent stock", focus: "aging" as const }
  ];

  return (
    <div className="agingActionBoard" role="list" aria-label="Vehicle aging action board">
      {agingActions.map((item) => {
        const count = items.find((bucket) => bucket.label === item.bucket)?.count ?? 0;
        const share = total > 0 ? Math.round(count * 100 / total) : 0;
        return (
          <article className={`agingAction agingAction${item.bucket.replace("+", "Plus").replace("-", "To")}`} role="listitem" key={item.bucket}>
            <div className="agingActionHeader"><strong>{item.title}</strong><span>{item.bucket} days</span></div>
            <div className="agingActionCount"><strong>{count}</strong><span>{share}% of stock</span></div>
            <p>{item.action}</p>
            <Button size="small" onClick={() => onNavigate(dashboardMetricTarget(item.focus))}>{item.button}</Button>
          </article>
        );
      })}
    </div>
  );
}

function DashboardLeadStatus({ stages, closureRate }: { stages: Array<{ label: string; count: number }>; closureRate: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1);

  return (
    <div className="salesFunnel">
      <div className="conversionDial" aria-label={`${closureRate}% of lead cases are closed`} role="img">
        <svg viewBox="0 0 112 112" aria-hidden="true">
          <circle cx="56" cy="56" r={radius} />
          <circle cx="56" cy="56" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - closureRate / 100) }} />
        </svg>
        <span><strong>{closureRate}%</strong>case closure</span>
      </div>
      <div className="funnelRows">
        {stages.map((stage) => (
          <div className="funnelRow" key={stage.label}>
            <span>{dashboardLabel(stage.label)}</span>
            <div className="funnelTrack" aria-hidden="true"><i className={`funnel-${stage.label.toLowerCase()}`} style={{ width: `${stage.count <= 0 ? 0 : Math.max(5, stage.count * 100 / maxCount)}%` }} /></div>
            <strong>{stage.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardRepairWorkList({ items }: { items: Array<{ label: string; count: number }> }) {
  return (
    <section className="repairWorkList" aria-label="Incomplete repair jobs by vehicle">
      {items.length > 0 ? (
        <div role="list">
          {items.map((item) => (
            <div className="repairWorkRow" role="listitem" key={item.label}>
              <span title={item.label}>{item.label}</span>
              <Tag className="dashboardStatusBadge" color="gold">{item.count} open {item.count === 1 ? "job" : "jobs"}</Tag>
            </div>
          ))}
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No incomplete repair jobs." />}
      <Typography.Text type="secondary">Completion dates are not recorded yet, so this view shows only confirmed open work.</Typography.Text>
    </section>
  );
}

function Metric({
  label,
  value,
  meta,
  tone = "neutral",
  onClick
}: {
  label: string;
  value: string | number;
  meta?: string;
  tone?: "neutral" | "risk" | "profit" | "work";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`metricCard metricCard-${tone} metricCardButton`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div className={`metricCard metricCard-${tone}`}>
      {content}
    </div>
  );
}

function formatMoney(value: number) {
  return formatRinggit(value);
}

function formatRecordDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });
}

function formatCompactMoney(value: number) {
  return formatMoney(value);
}

function formatOcrMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "RM -";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatMoney(numeric) : `RM ${value}`;
}

function receiptLineAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function repairReceiptItemsFromOcr(job: OcrJob): RepairReceiptItemInput[] {
  const extractedItems = (job.result?.lineItems ?? [])
    .map((item, index) => {
      const quantity = item.quantity?.trim();
      const unit = item.unit?.trim();
      const unitPrice = receiptLineAmount(item.unitPrice);
      return {
        description: item.description?.trim() || "",
        ...(quantity ? { quantity } : {}),
        ...(unit ? { unit } : {}),
        ...(unitPrice === undefined ? {} : { unitPrice }),
        amount: receiptLineAmount(item.amount) ?? 0,
        sortOrder: index + 1
      };
    })
    .filter((item) => item.description);

  return extractedItems;
}

export function repairReceiptDraftFromOcr(values: OcrReviewValues, job: OcrJob): ConfirmRepairReceiptRequest {
  return {
    documentId: job.documentId,
    supplierName: String(values.supplierName ?? "").trim() || undefined,
    invoiceNumber: String(values.invoiceNumber ?? "").trim() || undefined,
    totalAmount: Number(values.amount ?? 0),
    items: repairReceiptItemsFromOcr(job)
  };
}

export type SupplierOcrMatchInput = Pick<Supplier, "companyName"> & Partial<Pick<Supplier, "registrationNumber" | "tinNumber" | "address" | "phone" | "contactPerson">>;

type SupplierDraftPrefill = SupplierOcrMatchInput;

type ReceiptSupplierResolution =
  | { kind: "matched"; supplier: Supplier }
  | { kind: "draft"; supplier: Supplier }
  | { kind: "missing" };

function supplierDraftPrefillFromOcr(values: OcrReviewValues): SupplierDraftPrefill | undefined {
  const valueFor = (name: string) => String(values[name] ?? "").trim() || undefined;
  const companyName = valueFor("supplierName");
  if (!companyName) return undefined;

  return {
    companyName,
    registrationNumber: valueFor("supplierRegistrationNumber"),
    tinNumber: valueFor("supplierTinNumber"),
    address: valueFor("supplierAddress"),
    phone: valueFor("supplierPhone"),
    contactPerson: valueFor("supplierContactPerson")
  };
}

type RefurbishmentTableRecord = RefurbishmentRecord & {
  plateNumber: string;
  createdAt: string;
};

export function buildRefurbishmentTableRecords(
  repairs: RepairJob[],
  supplierInvoices: SupplierInvoice[],
  vehicles: VehicleLookup[],
  filters: RefurbishmentFilters
): RefurbishmentTableRecord[] {
  return filterRefurbishmentRecords(repairs, supplierInvoices, vehicles, filters).map((record) => {
    const source = record.kind === "repair" ? record.repair : record.invoice;
    return {
      ...record,
      plateNumber: plateFor(vehicles, source.vehicleId),
      createdAt: formatRecordDate(source.createdAt)
    };
  });
}


export function filterSupplierMaster(suppliers: Supplier[], keyword: string, status: Supplier["approvalStatus"] | "All") {
  return suppliers.filter((supplier) => matchesOperationalSearch(keyword, [
    supplier.companyName,
    supplier.registrationNumber,
    supplier.tinNumber,
    supplier.address,
    supplier.phone,
    supplier.contactPerson,
    supplier.autoCountCreditorCode
  ]) && (status === "All" || supplier.approvalStatus === status));
}

export function supplierMasterMatchFromOcr(suppliers: Supplier[], source: SupplierOcrMatchInput | string | undefined): Supplier | undefined {
  const receiptSupplier = typeof source === "string" ? { companyName: source } : source;
  if (!receiptSupplier) return undefined;

  const identifiers = [
    [receiptSupplier.tinNumber, (supplier: Supplier) => supplier.tinNumber],
    [receiptSupplier.registrationNumber, (supplier: Supplier) => supplier.registrationNumber],
    [receiptSupplier.phone, (supplier: Supplier) => supplier.phone]
  ] as const;
  const identityMatches = suppliers.filter((supplier) => identifiers.some(([value, supplierValue]) => {
    const normalizedValue = normalizeSupplierIdentifier(value);
    return Boolean(normalizedValue) && normalizedValue === normalizeSupplierIdentifier(supplierValue(supplier));
  }));
  if (identityMatches.length === 1) return identityMatches[0];
  if (identityMatches.length > 1) return undefined;

  const normalizedName = normalizeSupplierIdentifier(receiptSupplier.companyName);
  if (!normalizedName) return undefined;
  const nameMatches = suppliers.filter((supplier) => normalizeSupplierIdentifier(supplier.companyName) === normalizedName);
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

function normalizeSupplierIdentifier(value?: string) {
  return value?.toLocaleLowerCase().replace(/[^a-z0-9]/gi, "") ?? "";
}

export type ReceiptVehicleMatch =
  | { kind: "matched"; vehicle: VehicleLookup }
  | { kind: "different"; vehicle: VehicleLookup }
  | { kind: "notFound"; plate: string };

export function receiptVehicleMatchFromOcr(vehicles: VehicleLookup[], selectedVehicleId: string | undefined, receiptPlate: string | undefined): ReceiptVehicleMatch | undefined {
  const plate = receiptPlate?.trim();
  const normalizedPlate = normalizePlate(plate);
  if (!plate || !normalizedPlate) return undefined;

  const matches = vehicles.filter((vehicle) => normalizePlate(vehicle.plateNumber) === normalizedPlate);
  if (matches.length !== 1) return { kind: "notFound", plate };
  return matches[0].id === selectedVehicleId
    ? { kind: "matched", vehicle: matches[0] }
    : { kind: "different", vehicle: matches[0] };
}

export function filterDeliveryAccountingCharges(
  charges: DeliveryAccountingCharge[],
  vehicles: VehicleLookup[],
  keyword: string,
  status: DeliveryAccountingCharge["accountingStatus"] | "All"
) {
  return charges.filter((charge) => matchesOperationalSearch(keyword, [
    plateFor(vehicles, charge.vehicleId),
    charge.chargeType,
    charge.providerName,
    charge.referenceNumber,
    charge.invoiceDate
  ]) && (status === "All" || charge.accountingStatus === status));
}

function matchesOperationalSearch(keyword: string, values: Array<string | undefined>) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  const compactKeyword = normalizedKeyword.replace(/[^a-z0-9]/gi, "");
  return values.some((value) => {
    const normalizedValue = value?.toLowerCase() ?? "";
    return normalizedValue.includes(normalizedKeyword)
      || (Boolean(compactKeyword) && normalizedValue.replace(/[^a-z0-9]/gi, "").includes(compactKeyword));
  });
}

function RepairPage({
  vehicles,
  supplierInvoices,
  repairs,
  canApproveRepairs,
  currentUserId,
  onCreateInvoice,
  onUpdateInvoice,
  onCreateRepair,
  onCreateRepairWithReceipt,
  onUpdateRepair,
  onConfirmReceipt,
  onApproveRepair,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  supplierInvoices: SupplierInvoice[];
  repairs: RepairJob[];
  canApproveRepairs: boolean;
  currentUserId?: string;
  onCreateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onUpdateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onCreateRepair: (repair: RepairJob) => Promise<void>;
  onCreateRepairWithReceipt: (request: CreateRepairWithReceiptRequest) => Promise<CreateRepairWithReceiptResponse>;
  onUpdateRepair: (repair: RepairJob) => Promise<void>;
  onConfirmReceipt: (repairId: string, receipt: ConfirmRepairReceiptRequest) => Promise<unknown>;
  onApproveRepair: (repairId: string, notes?: string) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadRepairId, setUploadRepairId] = useState("");
  const [editSupplierInvoiceId, setEditSupplierInvoiceId] = useState("");
  const [repairCreateOpen, setRepairCreateOpen] = useState(false);
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);
  const [supplierMaster, setSupplierMaster] = useState<Supplier[]>([]);
  const [supplierKeyword, setSupplierKeyword] = useState("");
  const [supplierStatus, setSupplierStatus] = useState<Supplier["approvalStatus"] | "All">("All");
  const [repairCreateMode, setRepairCreateMode] = useState<"receipt" | "manual">("receipt");
  const [receiptDraft, setReceiptDraft] = useState<ConfirmRepairReceiptRequest | null>(null);
  const [repairCreateForm] = Form.useForm();
  const [supplierCreateForm] = Form.useForm();
  const repairCreateVehicleId = Form.useWatch("vehicleId", repairCreateForm) as string | undefined;
  const repairCreateSupplierId = Form.useWatch("supplierId", repairCreateForm) as string | undefined;
  const repairCreateReceiptPlate = Form.useWatch("plateNumberOnInvoice", repairCreateForm) as string | undefined;
  const receiptVehicleMatch = receiptVehicleMatchFromOcr(vehicles, repairCreateVehicleId, repairCreateReceiptPlate);
  const [receiptSupplierResolution, setReceiptSupplierResolution] = useState<ReceiptSupplierResolution | null>(null);
  const [unmatchedReceiptSupplier, setUnmatchedReceiptSupplier] = useState<SupplierDraftPrefill | null>(null);
  const [creatingSupplierFromReceipt, setCreatingSupplierFromReceipt] = useState(false);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [repairDocuments, setRepairDocuments] = useState<VehicleDocument[]>([]);
  const [repairReceipts, setRepairReceipts] = useState<RepairReceiptWithItems[]>([]);
  const [refurbishmentFilters, setRefurbishmentFilters] = useState<RefurbishmentFilters>({});
  const [mobileRefurbishmentPage, setMobileRefurbishmentPage] = useState(1);
  const selectedRepair = repairs.find((repair) => repair.id === uploadRepairId);
  const selectedSupplierInvoice = supplierInvoices.find((invoice) => invoice.id === editSupplierInvoiceId);
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }));

  const reloadSupplierMaster = useCallback(async () => {
    try {
      setSupplierMaster(await getSupplierMaster());
    } catch (error) {
      message.error(humanizeApiError(error, "Unable to load supplier master."));
    }
  }, []);

  const closeSupplierCreate = () => {
    setSupplierCreateOpen(false);
    setCreatingSupplierFromReceipt(false);
    supplierCreateForm.resetFields();
  };

  const openNewSupplier = () => {
    setCreatingSupplierFromReceipt(false);
    supplierCreateForm.resetFields();
    setSupplierCreateOpen(true);
  };

  const openSupplierDraftFromReceipt = (prefill: SupplierDraftPrefill) => {
    setCreatingSupplierFromReceipt(true);
    supplierCreateForm.resetFields();
    supplierCreateForm.setFieldsValue(prefill);
    setSupplierCreateOpen(true);
  };

  useEffect(() => { void reloadSupplierMaster(); }, [reloadSupplierMaster]);

  useEffect(() => {
    let active = true;
    if (!selectedRepair) {
      setRepairReceipts([]);
      return () => { active = false; };
    }
    void getRepairReceipts(selectedRepair.id)
      .then((receipts) => { if (active) setRepairReceipts(receipts); })
      .catch(() => { if (active) setRepairReceipts([]); });
    return () => { active = false; };
  }, [selectedRepair?.id, documentReloadKey]);

  useEffect(() => {
    let active = true;
    if (!selectedRepair) {
      setRepairDocuments([]);
      return () => {
        active = false;
      };
    }

    void getVehicleDocuments(selectedRepair.vehicleId).then((documents) => {
      if (active) setRepairDocuments(documents.filter((document) => document.repairJobId === selectedRepair.id));
    });

    return () => {
      active = false;
    };
  }, [documentReloadKey, selectedRepair?.id, selectedRepair?.vehicleId]);

  const selectSupplierInvoice = (invoiceId: string) => {
    setEditSupplierInvoiceId(invoiceId);
  };

  const openRefurbishmentDetails = (record: RefurbishmentTableRecord) => {
    const selection = refurbishmentDetailsSelection(record);
    setUploadRepairId(selection.repairId ?? "");
    setEditSupplierInvoiceId(selection.supplierInvoiceId ?? "");
  };

  const pendingRepairs = repairs.filter((repair) => !repair.checklistDone).length;
  const repairTotal = repairs.filter(isRepairCostFinal).reduce((sum, repair) => sum + repair.cost, 0);
  const filteredSupplierMaster = filterSupplierMaster(supplierMaster, supplierKeyword, supplierStatus);
  const supplierFiltersActive = Boolean(supplierKeyword.trim()) || supplierStatus !== "All";
  const showRepairCompletionConfirmation = (repair: RepairJob, onConfirm: () => Promise<void> | void) => {
    Modal.confirm({
      title: "Mark repair completed? / 确认完成整备？",
      content: (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, repair.vehicleId)}</Descriptions.Item>
          <Descriptions.Item label="Repair title / 整备标题">{repair.whatToDo || repair.repairPart || "Repair"}</Descriptions.Item>
          <Descriptions.Item label="Cost / 费用">{formatMoney(repair.cost)}</Descriptions.Item>
        </Descriptions>
      ),
      okText: "Mark completed",
      cancelText: "Keep in progress",
      onOk: onConfirm
    });
  };
  const confirmRepairCompletion = (repair: RepairJob, onConfirmed?: () => void) => {
    showRepairCompletionConfirmation(repair, async () => {
      await onUpdateRepair({ ...repair, checklistDone: true });
      onConfirmed?.();
    });
  };
  const confirmRepairApproval = (repair: RepairJob) => {
    Modal.confirm({
      title: "Approve repair? / 批准整备？",
      content: (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, repair.vehicleId)}</Descriptions.Item>
          <Descriptions.Item label="Repair title / 整备标题">{repair.whatToDo || repair.repairPart || "Repair"}</Descriptions.Item>
          <Descriptions.Item label="Cost / 费用">{formatMoney(repair.cost)}</Descriptions.Item>
          <Descriptions.Item label="Approval">Your signed-in account will be recorded as the approver.</Descriptions.Item>
        </Descriptions>
      ),
      okText: "Approve Repair",
      cancelText: "Cancel",
      onOk: () => onApproveRepair(repair.id, repair.approvalNotes)
    });
  };
  const refurbishmentRecordCount = repairs.length + supplierInvoices.length;
  const refurbishmentRecords = buildRefurbishmentTableRecords(repairs, supplierInvoices, vehicles, refurbishmentFilters);
  const refurbishmentFiltersActive = Object.values(refurbishmentFilters).some((value) => value !== undefined && value !== "" && value !== "All");
  const mobileRefurbishmentPageCount = Math.max(1, Math.ceil(refurbishmentRecords.length / mobileWorkflowPageSize));
  const clampedMobileRefurbishmentPage = Math.min(mobileRefurbishmentPage, mobileRefurbishmentPageCount);
  const mobileRefurbishmentRecords = refurbishmentRecords.slice(
    (clampedMobileRefurbishmentPage - 1) * mobileWorkflowPageSize,
    clampedMobileRefurbishmentPage * mobileWorkflowPageSize
  );
  const updateRefurbishmentFilters = (next: Partial<RefurbishmentFilters>) => {
    setRefurbishmentFilters((current) => ({ ...current, ...next }));
    setMobileRefurbishmentPage(1);
  };
  const refurbishmentEmptyText = refurbishmentRecordCount > 0
    ? "No repair or supplier invoice records match the current filters."
    : "No repair or supplier invoice records yet.";
  const refurbishmentColumns: ColumnsType<RefurbishmentTableRecord> = [
    {
      title: "Car Plate / 车牌",
      dataIndex: "plateNumber",
      width: 220,
      render: (_, row) => <VehicleIdentity vehicles={vehicles} vehicleId={row.kind === "repair" ? row.repair.vehicleId : row.invoice.vehicleId} />
    },
    {
      title: "Created / 建立时间",
      dataIndex: "createdAt",
      render: (_, row) => formatRecordDate(row.kind === "repair" ? row.repair.createdAt : row.invoice.createdAt)
    },
    {
      title: "Record / 记录",
      render: (_, row) => row.kind === "repair"
        ? (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.repair.whatToDo || row.repair.repairPart || "Repair"}</Typography.Text>
          </Space>
        )
        : (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.invoice.supplierName}</Typography.Text>
            <Typography.Text type="secondary">Invoice: {row.invoice.invoiceNumber}</Typography.Text>
          </Space>
        )
    },
    {
      title: "Amount / 金额",
      render: (_, row) => formatMoney(row.kind === "repair" ? row.repair.cost : row.invoice.amount)
    },
    {
      title: "Status / 状态",
      render: (_, row) => {
        if (row.kind === "repair") {
          return (
            <Space wrap size={4}>
              <Tag color={row.repair.checklistDone ? "green" : "orange"}>{row.repair.checklistDone ? "Completed" : "In progress"}</Tag>
              <Tag color={row.repair.approvalStatus === "Rejected" ? "red" : row.repair.approvalStatus === "Pending" ? "gold" : "blue"}>
                {row.repair.approvalStatus ?? "Approved"}
              </Tag>
            </Space>
          );
        }

        const status = supplierInvoicePlateStatus(row.invoice, vehicles);
        const aging = supplierInvoiceAgingStatus(row.invoice);
        return (
          <Space wrap size={4}>
            <Tag color={status.color}>{status.label}</Tag>
            <Tag color={aging === "Overdue" ? "red" : aging === "DueSoon" ? "gold" : aging === "Paid" ? "green" : "default"}>{aging}</Tag>
          </Space>
        );
      }
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 220,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          {row.kind === "repair" ? (
            <>
              <Button size="small" type="primary" onClick={() => openRefurbishmentDetails(row)}>Details</Button>
              {canApproveRepairs && row.repair.approvalStatus !== "Approved" && <Button size="small" onClick={() => confirmRepairApproval(row.repair)}>Approve</Button>}
              <Button size="small" onClick={() => confirmRepairCompletion(row.repair)} disabled={row.repair.checklistDone || !isRepairCostFinal(row.repair)}>Mark completed</Button>
            </>
          ) : (
            <Button size="small" type="primary" onClick={() => openRefurbishmentDetails(row)}>Details</Button>
          )}
        </Space>
      )
    }
  ];

  if (selectedRepair) {
    return (
      <Space direction="vertical" size={16} className="fullWidth">
        <Button onClick={() => setUploadRepairId("")}>Back to Repair List</Button>
        <ProCard title={`Repair Details / 整备详情 - ${plateFor(vehicles, selectedRepair.vehicleId)}`}>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, selectedRepair.vehicleId)}</Descriptions.Item>
            <Descriptions.Item label="Repair title / 整备标题">{selectedRepair.whatToDo || selectedRepair.repairPart || "-"}</Descriptions.Item>
            <Descriptions.Item label="Cost / 费用 (RM)">{formatMoney(selectedRepair.cost)}</Descriptions.Item>
            <Descriptions.Item label="Work status / 工作状态">
              <Tag color={selectedRepair.checklistDone ? "green" : "orange"}>{selectedRepair.checklistDone ? "Completed" : "In progress"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Started on / 开始日期">{selectedRepair.startedOn || "-"}</Descriptions.Item>
            <Descriptions.Item label="Expected completion / 预计完成">{selectedRepair.expectedCompletionDate || "-"}</Descriptions.Item>
            <Descriptions.Item label="Approval / 审批">
              <Tag color={selectedRepair.approvalStatus === "Rejected" ? "red" : selectedRepair.approvalStatus === "Pending" ? "gold" : "blue"}>{selectedRepair.approvalStatus ?? "Approved"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Approved By / 审批人">{selectedRepair.approvedBy || "Not approved"}</Descriptions.Item>
            <Descriptions.Item label="Approved At / 审批时间">{selectedRepair.approvedAt ? new Date(selectedRepair.approvedAt).toLocaleString() : "-"}</Descriptions.Item>
          </Descriptions>
          {canApproveRepairs && selectedRepair.approvalStatus !== "Approved" && <Button type="primary" onClick={() => confirmRepairApproval(selectedRepair)}>Approve Repair</Button>}
        </ProCard>
        <ProCard title="Repair Record / 整备资料">
          <Form
            key={`${selectedRepair.id}-repair-record`}
            layout="vertical"
            className="formGrid"
            initialValues={{
              ...selectedRepair,
              startedOn: selectedRepair.startedOn ? dayjs(selectedRepair.startedOn) : undefined,
              expectedCompletionDate: selectedRepair.expectedCompletionDate ? dayjs(selectedRepair.expectedCompletionDate) : undefined,
              checklistDone: selectedRepair.checklistDone ? "done" : "pending"
            }}
            onFinish={async (values) => {
              const repair: RepairJob = {
                ...selectedRepair,
                vehicleId: values.vehicleId,
                repairPart: selectedRepair.repairPart,
                whatToDo: String(values.whatToDo ?? "").trim(),
                cost: Number(values.cost ?? 0),
                checklistDone: values.checklistDone === "done",
                assignedTo: values.assignedTo?.trim() || undefined,
                startedOn: values.startedOn ? dayjs(values.startedOn).format("YYYY-MM-DD") : undefined,
                expectedCompletionDate: values.expectedCompletionDate ? dayjs(values.expectedCompletionDate).format("YYYY-MM-DD") : undefined
              };
              const repairBlockReason = repairCreateBlockReason(repair);
              if (repairBlockReason) {
                message.warning(repairBlockReason);
                return;
              }

              if (!selectedRepair.checklistDone && repair.checklistDone) {
                confirmRepairCompletion(repair);
                return;
              }

              await onUpdateRepair(repair);
            }}
          >
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="whatToDo" label="Repair title / 整备标题" rules={[{ required: true }]}><Input placeholder="Example: Windscreen replacement" /></Form.Item>
            <Form.Item name="cost" label="Cost / 费用 (RM)"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="assignedTo" label="Repair owner / 负责人"><Input placeholder="Staff or workshop name" /></Form.Item>
            <Form.Item name="startedOn" label="Started on / 开始日期"><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="expectedCompletionDate" label="Expected completion / 预计完成"><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="checklistDone" label="Work status / 工作状态" extra="Set to Completed only after the actual repair work is finished."><Select options={[{ value: "done", label: "Completed" }, { value: "pending", label: "In progress" }]} /></Form.Item>
            <Descriptions size="small" column={1} className="fullWidth">
              <Descriptions.Item label="Approval / 审批">{selectedRepair.approvalStatus ?? "Pending"}</Descriptions.Item>
              <Descriptions.Item label="Approval note / 审批备注">{selectedRepair.approvalNotes || "-"}</Descriptions.Item>
            </Descriptions>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Update Repair</Button></Form.Item>
          </Form>
        </ProCard>
        <ProCard title="Repair Documents / 整备文件">
          <Space direction="vertical" size={12} className="fullWidth">
            <DocumentUploadChecklist
              title="Required repair document / 必需整备文件"
              description="Attach the supplier invoice to this repair record before the refurbishment cost is finalised."
              items={repairDocumentCategories.map((category) => {
                const isPresent = repairDocuments.some((document) => document.category === category);
                return {
                  label: documentCategoryLabel(category),
                  isPresent,
                  action: (
                    <OcrUploadReview
                      vehicleId={selectedRepair.vehicleId}
                      category={category}
                      compact
                      commitAfterApply
                      uploadOwner={{ repairJobId: selectedRepair.id }}
                      buttonLabel={isPresent ? "Upload another repair invoice" : "Upload repair invoice"}
                      applyLabel="Review and use repair details"
                      existingValues={{
                        vehicleId: selectedRepair.vehicleId,
                        amount: selectedRepair.cost
                      }}
                      fields={[
                        { name: "vehicleId", label: "Car Plate", type: "select", options: vehicleOptions },
                        { name: "supplierName", label: "Supplier" },
                        { name: "invoiceNumber", label: "Invoice" },
                        { name: "plateNumberOnInvoice", label: "Plate on Supplier Invoice" },
                        { name: "amount", label: "Receipt total / 收据总额 (RM)", type: "number" },
                      ]}
                      onUploaded={() => setDocumentReloadKey((value) => value + 1)}
                      onApply={async (values, job) => {
                        const items = repairReceiptItemsFromOcr(job);
                        if (items.some((item) => !item.description)) {
                          message.warning("Add a repair item description before confirming this receipt.");
                          return;
                        }
                        await onConfirmReceipt(selectedRepair.id, {
                          documentId: job.documentId,
                          supplierName: String(values.supplierName ?? "").trim() || undefined,
                          invoiceNumber: String(values.invoiceNumber ?? "").trim() || undefined,
                          totalAmount: Number(values.amount ?? 0),
                          items
                        });
                        setDocumentReloadKey((value) => value + 1);
                        message.success(`${items.length} repair item${items.length === 1 ? "" : "s"} saved under this receipt.`);
                      }}
                    />
                  )
                };
              })}
            />
            <Alert type="info" showIcon message="Use a clear JPG, PNG, or WebP photo for OCR. PDFs remain available through the document upload workflow." />
            <ModuleDocumentList
              vehicleId={selectedRepair.vehicleId}
              categories={repairDocumentCategories}
              repairJobId={selectedRepair.id}
              reloadKey={documentReloadKey}
            />
            <Typography.Text strong>Confirmed receipt items / 已确认收据项目</Typography.Text>
            <Table
              size="small"
              rowKey="id"
              columns={[
                { title: "Receipt / 收据", render: (_, row) => row.invoiceNumber || row.supplierName || "Receipt" },
                { title: "Item / 项目", dataIndex: "description" },
                { title: "Qty / 数量", dataIndex: "quantity", render: (value) => value || "-" },
                { title: "Unit / 单位", dataIndex: "unit", render: (value) => value || "-" },
                { title: "Unit price / 单价", dataIndex: "unitPrice", render: (value) => value === undefined || value === null ? "-" : formatMoney(Number(value)) },
                { title: "Line amount / 项目金额", dataIndex: "amount", render: (value) => formatMoney(Number(value ?? 0)) }
              ]}
              dataSource={repairReceipts.flatMap(({ receipt, items }) => items.map((item) => ({ ...item, invoiceNumber: receipt.invoiceNumber, supplierName: receipt.supplierName })))}
              pagination={tablePagination(8)}
              scroll={{ x: 1040 }}
              locale={{ emptyText: "No receipt items confirmed for this repair yet." }}
            />
          </Space>
        </ProCard>
      </Space>
    );
  }

  if (selectedSupplierInvoice) {
    const plateStatus = supplierInvoicePlateStatus(selectedSupplierInvoice, vehicles);
    const agingStatus = supplierInvoiceAgingStatus(selectedSupplierInvoice);
    return (
      <Space direction="vertical" size={16} className="fullWidth">
        <Button onClick={() => setEditSupplierInvoiceId("")}>Back to Repair List</Button>
        <ProCard title={`Supplier Invoice Details / 供应商发票详情 - ${selectedSupplierInvoice.invoiceNumber}`}>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, selectedSupplierInvoice.vehicleId)}</Descriptions.Item>
            <Descriptions.Item label="Supplier / 供应商">{selectedSupplierInvoice.supplierName}</Descriptions.Item>
            <Descriptions.Item label="Amount / 金额">{formatMoney(selectedSupplierInvoice.amount)}</Descriptions.Item>
            <Descriptions.Item label="Invoice Date / 发票日期">{selectedSupplierInvoice.invoiceDate || "-"}</Descriptions.Item>
            <Descriptions.Item label="Plate Status / 车牌状态"><Tag color={plateStatus.color}>{plateStatus.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="Payment Status / 付款状态">
              <Tag color={agingStatus === "Overdue" ? "red" : agingStatus === "DueSoon" ? "gold" : agingStatus === "Paid" ? "green" : "default"}>{agingStatus}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </ProCard>
        <ProCard title="Supplier Invoice Record / 供应商发票资料">
          <Form
            key={selectedSupplierInvoice.id}
            layout="vertical"
            className="formGrid"
            initialValues={selectedSupplierInvoice}
            onFinish={async (values) => {
              const invoice: SupplierInvoice = {
                ...selectedSupplierInvoice,
                vehicleId: values.vehicleId,
                supplierId: values.supplierId,
                supplierName: supplierMaster.find((supplier) => supplier.id === values.supplierId)?.companyName ?? values.supplierName,
                invoiceNumber: values.invoiceNumber,
                plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined,
                invoiceDate: values.invoiceDate?.trim() || undefined,
                amount: Number(values.amount ?? 0),
                dueDate: values.dueDate?.trim() || undefined,
                paidAt: values.paidAt?.trim() || undefined
              };
              const blockReason = supplierInvoiceCreateBlockReason(invoice, supplierInvoices, vehicles);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }

              await onUpdateInvoice(invoice);
            }}
          >
            <Form.Item name="id" label="Selected Supplier Invoice"><Select options={supplierInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.supplierName} / ${invoice.invoiceNumber}` }))} onChange={selectSupplierInvoice} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="supplierId" label="Approved supplier" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={supplierMaster.filter((supplier) => supplier.approvalStatus === "Approved").map((supplier) => ({ value: supplier.id, label: supplier.companyName }))} /></Form.Item>
            <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="invoiceDate" label="Invoice date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="plateNumberOnInvoice" label="Plate on Supplier Invoice / 发票车牌"><Input placeholder="Plate number printed on supplier invoice" /></Form.Item>
            <Form.Item name="amount" label="Amount"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="paidAt" label="Paid Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Update Supplier Invoice</Button></Form.Item>
          </Form>
        </ProCard>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="metricGrid">
        <Metric label="Repair records / 整备记录" value={repairs.length} />
        <Metric label="Open repair work / 未完成整备" value={pendingRepairs} />
        <Metric label="Repair Cost / 整备费用" value={formatMoney(repairTotal)} />
      </div>
      <ProCard
        title="Supplier Master / 供应商资料"
        extra={<Button type="primary" onClick={openNewSupplier}>New Supplier</Button>}
      >
        <Alert className="sectionIntroAlert" type="info" showIcon message="Repair creates the supplier draft. Finance uses a different approver; Boss/Admin may approve directly under Finance → Approvals & Vouchers." />
        <Space className="toolbarForm workflowFilterBar pageFilterMobileOnly" wrap>
          <Input.Search
            allowClear
            aria-label="Search supplier master"
            placeholder="Company, phone, TIN, or creditor code"
            value={supplierKeyword}
            onChange={(event) => setSupplierKeyword(event.target.value)}
            onSearch={setSupplierKeyword}
            style={{ width: 300 }}
          />
          <Select
            aria-label="Filter supplier approval status"
            value={supplierStatus}
            onChange={setSupplierStatus}
            style={{ width: 170 }}
            options={[
              { value: "All", label: "All statuses" },
              { value: "Draft", label: "Draft" },
              { value: "Approved", label: "Approved" },
              { value: "Inactive", label: "Inactive" }
            ]}
          />
          <Tag color={supplierFiltersActive ? "blue" : "default"}>{supplierFiltersActive ? `${filteredSupplierMaster.length} of ${supplierMaster.length} matching` : `${supplierMaster.length} suppliers`}</Tag>
          {supplierFiltersActive && <Button onClick={() => { setSupplierKeyword(""); setSupplierStatus("All"); }}>Clear filters</Button>}
        </Space>
        <Table<Supplier>
          className="nativeSearchDesktopOnly"
          rowKey="id"
          dataSource={filteredSupplierMaster}
          nativeSearch={{
            fields: [
              { name: "company", label: "Company" },
              { name: "phone", label: "Phone" },
              { name: "tin", label: "TIN" },
              { name: "creditor", label: "Creditor code" },
              { name: "status", label: "Status", options: [
                { value: "Draft", label: "Draft" },
                { value: "Approved", label: "Approved" },
                { value: "Inactive", label: "Inactive" }
              ] }
            ],
            values: { status: supplierStatus === "All" ? undefined : supplierStatus },
            onSubmit: (values) => {
              setSupplierKeyword(operationsKeywordFromFields(values, ["company", "phone", "tin", "creditor"]));
              setSupplierStatus((values.status as Supplier["approvalStatus"] | undefined) ?? "All");
            },
            onReset: () => {
              setSupplierKeyword("");
              setSupplierStatus("All");
            }
          }}
          pagination={tablePagination(5)}
          locale={{ emptyText: supplierMaster.length === 0 ? "No suppliers yet." : "No suppliers match the current filters." }}
          columns={[
            { title: "Company", dataIndex: "companyName" },
            { title: "Phone", dataIndex: "phone" },
            { title: "TIN", dataIndex: "tinNumber", render: (value) => value || "-" },
            { title: "AutoCount creditor", dataIndex: "autoCountCreditorCode", render: (value) => value || "Auto-create" },
            { title: "Status", dataIndex: "approvalStatus", render: (value) => <Tag color={value === "Approved" ? "green" : "gold"}>{value}</Tag> },
            { title: "Action", render: (_, supplier) => {
              if (!canApproveRepairs || supplier.approvalStatus !== "Draft") return null;
              const blockReason = supplierApprovalBlockReason(supplier, currentUserId, canApproveRepairs);
              return <Tooltip title={blockReason}><span><Button size="small" disabled={Boolean(blockReason)} onClick={async () => { try { await approveSupplier(supplier.id); message.success("Supplier approved."); await reloadSupplierMaster(); } catch (error) { message.error(humanizeApiError(error, "Unable to approve supplier.")); } }}>{blockReason ? "Needs another approver" : "Approve"}</Button></span></Tooltip>;
            } }
          ]}
        />
      </ProCard>
      <ProCard
        id="repair-supplier-card"
        title="Supplier & Refurbishment / 供应商与整备"
        extra={<Space wrap><Tag color="blue">{refurbishmentRecordCount} records</Tag><Button type="primary" onClick={() => setRepairCreateOpen(true)}>New Repair</Button></Space>}
      >
        <Space className="toolbarForm workflowFilterBar pageFilterMobileOnly" wrap>
          <Input.Search
            allowClear
            placeholder="Search plate, repair, supplier, or invoice"
            value={refurbishmentFilters.keyword ?? ""}
            onChange={(event) => updateRefurbishmentFilters({ keyword: event.target.value })}
            style={{ width: 300 }}
          />
          <Select
            value={refurbishmentFilters.kind ?? "All"}
            onChange={(kind) => updateRefurbishmentFilters({ kind })}
            options={[
              { value: "All", label: "All record types" },
              { value: "Repair", label: "Repair tasks" },
              { value: "SupplierInvoice", label: "Supplier invoices" }
            ]}
            style={{ width: 180 }}
          />
          <Select
            value={refurbishmentFilters.state ?? "All"}
            onChange={(state) => updateRefurbishmentFilters({ state })}
            options={[
              { value: "All", label: "All states" },
              { value: "Open", label: "Open" },
              { value: "Done", label: "Done" }
            ]}
            style={{ width: 140 }}
          />
          <Tag color={refurbishmentFiltersActive ? "blue" : "default"}>{refurbishmentFiltersActive ? `${refurbishmentRecords.length} of ${refurbishmentRecordCount} matching` : `${refurbishmentRecordCount} record${refurbishmentRecordCount === 1 ? "" : "s"}`}</Tag>
          {refurbishmentFiltersActive && <Button
            size="small"
            onClick={() => {
              setRefurbishmentFilters({});
              setMobileRefurbishmentPage(1);
            }}
          >
            Clear filters
          </Button>}
        </Space>
        <div className="mobileRecordList">
          {refurbishmentRecords.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={refurbishmentEmptyText} />}
          {mobileRefurbishmentRecords.map((record) => {
            const isRepair = record.kind === "repair";
            const status = isRepair ? undefined : supplierInvoicePlateStatus(record.invoice, vehicles);
            return (
              <article className="mobileRecordCard" key={record.key}>
                  <div className="mobileRecordHeader">
                    <div>
                      <Typography.Text className="mobileRecordEyebrow">{isRepair ? "Repair" : "Supplier Invoice"}</Typography.Text>
                      <VehicleIdentity vehicles={vehicles} vehicleId={isRepair ? record.repair.vehicleId : record.invoice.vehicleId} />
                    </div>
                  {isRepair ? <Tag color={record.repair.checklistDone ? "green" : "orange"}>{record.repair.checklistDone ? "Completed" : "In progress"}</Tag> : <Tag color={status?.color}>{status?.label}</Tag>}
                </div>
                <div className="mobileRecordMeta">
                  <span>
                    <small>{isRepair ? "Repair title" : "Supplier"}</small>
                    <strong>{isRepair ? record.repair.whatToDo || record.repair.repairPart || "Repair" : record.invoice.supplierName}</strong>
                  </span>
                  <span>
                    <small>Amount / 金额</small>
                    <strong>{formatMoney(isRepair ? record.repair.cost : record.invoice.amount)}</strong>
                  </span>
                </div>
                {!isRepair && (
                  <div className="mobileRecordSection">
                    <Typography.Text className="mobileRecordLabel">Invoice / 单据</Typography.Text>
                    <div className="mobileRecordTextBlock">
                      <span>Invoice No: {record.invoice.invoiceNumber}</span>
                      <span>Plate on invoice: {record.invoice.plateNumberOnInvoice || "Not entered"}</span>
                    </div>
                  </div>
                )}
                <div className="mobileRecordFooter">
                  <Space className="tableActionGroup" wrap size={6}>
                    {isRepair ? (
                      <>
                        <Button size="small" type="primary" onClick={() => openRefurbishmentDetails(record)}>Details</Button>
                        {canApproveRepairs && record.repair.approvalStatus !== "Approved" && <Button size="small" onClick={() => confirmRepairApproval(record.repair)}>Approve</Button>}
                        <Button size="small" onClick={() => confirmRepairCompletion(record.repair)} disabled={record.repair.checklistDone || !isRepairCostFinal(record.repair)}>Mark completed</Button>
                      </>
                    ) : (
                      <Button size="small" type="primary" onClick={() => openRefurbishmentDetails(record)}>Details</Button>
                    )}
                  </Space>
                </div>
              </article>
            );
          })}
          {refurbishmentRecords.length > mobileWorkflowPageSize && (
            <Pagination
              current={clampedMobileRefurbishmentPage}
              pageSize={mobileWorkflowPageSize}
              total={refurbishmentRecords.length}
              showSizeChanger={false}
              onChange={setMobileRefurbishmentPage}
            />
          )}
        </div>
        <Table
          className="desktopDataTable nativeSearchDesktopOnly"
          rowKey="key"
          columns={refurbishmentColumns}
          dataSource={refurbishmentRecords}
          nativeSearch={{
            fields: [
              { name: "plate", label: "Plate" },
              { name: "repair", label: "Repair" },
              { name: "supplier", label: "Supplier" },
              { name: "invoice", label: "Invoice" },
              { name: "kind", label: "Record type", options: [
                { value: "Repair", label: "Repair tasks" },
                { value: "SupplierInvoice", label: "Supplier invoices" }
              ] },
              { name: "state", label: "State", options: [
                { value: "Open", label: "Open" },
                { value: "Done", label: "Done" }
              ] }
            ],
            values: {
              kind: refurbishmentFilters.kind === "All" ? undefined : refurbishmentFilters.kind,
              state: refurbishmentFilters.state === "All" ? undefined : refurbishmentFilters.state
            },
            onSubmit: (values) => {
              setRefurbishmentFilters({
                keyword: operationsKeywordFromFields(values, ["plate", "repair", "supplier", "invoice"]),
                kind: (values.kind as RefurbishmentFilters["kind"] | undefined) ?? "All",
                state: (values.state as RefurbishmentFilters["state"] | undefined) ?? "All"
              });
              setMobileRefurbishmentPage(1);
            },
            onReset: () => {
              setRefurbishmentFilters({});
              setMobileRefurbishmentPage(1);
            }
          }}
          pagination={{ ...tablePagination(8), current: clampedMobileRefurbishmentPage, onChange: setMobileRefurbishmentPage }}
          scroll={{ x: 820 }}
          locale={{ emptyText: refurbishmentEmptyText }}
        />
      </ProCard>
      <Modal
        title={creatingSupplierFromReceipt ? "Create supplier draft from receipt / 从收据建立供应商草稿" : "New Supplier / 新增供应商"}
        open={supplierCreateOpen}
        onCancel={closeSupplierCreate}
        footer={null}
        destroyOnClose
      >
        <Form form={supplierCreateForm} layout="vertical" onFinish={async (values) => {
          const supplier: Supplier = {
            id: newId(),
            companyName: String(values.companyName ?? "").trim(),
            registrationNumber: String(values.registrationNumber ?? "").trim() || undefined,
            tinNumber: String(values.tinNumber ?? "").trim() || undefined,
            address: String(values.address ?? "").trim(),
            phone: String(values.phone ?? "").trim(),
            contactPerson: String(values.contactPerson ?? "").trim() || undefined,
            autoCountCreditorCode: String(values.autoCountCreditorCode ?? "").trim() || undefined,
            approvalStatus: "Draft"
          };
          try {
            const createdSupplier = await createSupplier(supplier);
            await reloadSupplierMaster();
            if (creatingSupplierFromReceipt) {
              setReceiptSupplierResolution({ kind: "draft", supplier: createdSupplier });
              setUnmatchedReceiptSupplier(null);
              message.success("Supplier draft created from the receipt. Boss/Admin must approve it before this repair can use the supplier.");
            } else {
              message.success("Supplier draft created. Finance uses a different approver, while Boss/Admin may approve it directly under Finance → Approvals & Vouchers.");
            }
            closeSupplierCreate();
          } catch (error) {
            message.error(humanizeApiError(error, "Unable to create supplier."));
          }
        }}>
          {creatingSupplierFromReceipt && unmatchedReceiptSupplier ? (
            <Alert
              className="operationalInfoAlert"
              type="warning"
              showIcon
              message={`“${unmatchedReceiptSupplier.companyName}” was not found in Supplier Master.`}
              description="Review the OCR details and complete the required fields. This creates a Draft only; Boss/Admin approval is still required before the repair can use it."
            />
          ) : null}
          <Form.Item name="companyName" label="Company name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="registrationNumber" label="Registration number"><Input /></Form.Item>
          <Form.Item name="tinNumber" label="TIN"><Input /></Form.Item>
          <Form.Item name="address" label="Address" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="phone" label="Phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="contactPerson" label="Contact person"><Input /></Form.Item>
          <Form.Item name="autoCountCreditorCode" label="AutoCount creditor code" extra="Leave blank if AutoCount should auto-create the code."><Input /></Form.Item>
          <Button type="primary" htmlType="submit">Create supplier draft</Button>
        </Form>
      </Modal>
      <Modal
        title="New Repair / 新增整备"
        width={920}
        open={repairCreateOpen}
        onCancel={() => {
          setRepairCreateOpen(false);
          setRepairCreateMode("receipt");
          setReceiptDraft(null);
          setReceiptSupplierResolution(null);
          setUnmatchedReceiptSupplier(null);
          repairCreateForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form form={repairCreateForm} layout="vertical" className="modalForm formGrid" onFinish={async (values) => {
          if (repairCreateMode === "receipt") {
            if (!receiptDraft) {
              message.warning("Upload and review a receipt before creating this repair.");
              return;
            }

            const invoice: SupplierInvoice = {
              id: newId(),
              vehicleId: values.vehicleId,
              supplierId: values.supplierId,
              supplierName: supplierMaster.find((supplier) => supplier.id === values.supplierId)?.companyName ?? String(values.supplierName ?? "").trim(),
              invoiceNumber: String(values.invoiceNumber ?? "").trim(),
              plateNumberOnInvoice: String(values.plateNumberOnInvoice ?? "").trim() || undefined,
              invoiceDate: dayjs().format("YYYY-MM-DD"),
              amount: Number(values.amount ?? 0),
              dueDate: String(values.dueDate ?? "").trim() || undefined,
              paidAt: String(values.paidAt ?? "").trim() || undefined
            };
            const invoiceBlockReason = supplierInvoiceCreateBlockReason({ ...invoice, plateNumberOnInvoice: undefined }, supplierInvoices, vehicles);
            if (invoiceBlockReason) {
              message.warning(invoiceBlockReason);
              return;
            }

            const repair: RepairJob = {
              id: newId(),
              vehicleId: invoice.vehicleId,
              repairPart: "",
              whatToDo: String(values.whatToDo ?? "").trim(),
              cost: invoice.amount,
              checklistDone: false
            };
            const repairBlockReason = repairCreateBlockReason(repair);
            if (repairBlockReason) {
              message.warning(repairBlockReason);
              return;
            }

            const created = await onCreateRepairWithReceipt({
              repair,
              invoice,
              receipt: {
                ...receiptDraft,
                supplierName: invoice.supplierName,
                invoiceNumber: invoice.invoiceNumber,
                totalAmount: invoice.amount
              }
            });
            repairCreateForm.resetFields();
            setReceiptDraft(null);
            setRepairCreateOpen(false);
            setRepairCreateMode("receipt");
            setUploadRepairId(created.repair.id);
            message.success(`${receiptDraft.items.length} receipt item${receiptDraft.items.length === 1 ? "" : "s"} added to the new repair.`);
            return;
          }

          const invoice: SupplierInvoice = {
            id: newId(),
            vehicleId: values.vehicleId,
            supplierId: values.supplierId,
            supplierName: supplierMaster.find((supplier) => supplier.id === values.supplierId)?.companyName ?? values.supplierName,
            invoiceNumber: values.invoiceNumber,
            plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined,
            invoiceDate: values.invoiceDate?.trim() || dayjs().format("YYYY-MM-DD"),
            amount: Number(values.amount ?? 0),
            dueDate: values.dueDate?.trim() || undefined,
            paidAt: values.paidAt?.trim() || undefined
          };
          const blockReason = supplierInvoiceCreateBlockReason(invoice, supplierInvoices, vehicles);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          const repair: RepairJob = {
            id: newId(),
            vehicleId: values.vehicleId,
            repairPart: "",
            whatToDo: String(values.whatToDo ?? "").trim(),
            cost: invoice.amount,
            checklistDone: values.checklistDone === "done"
          };
          const repairBlockReason = repairCreateBlockReason(repair);
          if (repairBlockReason) {
            message.warning(repairBlockReason);
            return;
          }

          const saveRepair = async () => {
            await onCreateInvoice(invoice);
            await onCreateRepair(repair);
            repairCreateForm.resetFields();
            setReceiptDraft(null);
            setRepairCreateOpen(false);
            setRepairCreateMode("receipt");
          };

          if (repair.checklistDone) {
            showRepairCompletionConfirmation(repair, saveRepair);
            return;
          }

          await saveRepair();
        }} initialValues={{ vehicleId: vehicles[0]?.id, checklistDone: "pending" }}>
          <div className="repairCreateContext">
            <div className="repairCreateContextHeading">
              <Typography.Text strong>Car & supplier / 车辆与供应商</Typography.Text>
              <Typography.Text type="secondary">
                {repairCreateMode === "receipt"
                  ? "Choose the car first. We will match an approved supplier after you review the receipt."
                  : "Choose the car and approved supplier for this repair."}
              </Typography.Text>
            </div>
            <div className="repairCreateContextFields">
              <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
              <Form.Item
                name="supplierId"
                label="Approved supplier"
                rules={[{ required: true }]}
                extra={repairCreateMode === "receipt"
                  ? receiptDraft
                    ? repairCreateSupplierId ? "Matched or selected after receipt review." : "Choose an approved supplier to continue."
                    : "This will be matched after the receipt review."
                  : undefined}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={repairCreateMode === "receipt" && !receiptDraft ? "Waiting for receipt match" : "Select an approved supplier"}
                  disabled={repairCreateMode === "receipt" && !receiptDraft}
                  options={supplierMaster.filter((supplier) => supplier.approvalStatus === "Approved").map((supplier) => ({ value: supplier.id, label: `${supplier.companyName} · ${supplier.phone}` }))}
                  onChange={() => { setReceiptSupplierResolution(null); setUnmatchedReceiptSupplier(null); }}
                />
              </Form.Item>
            </div>
          </div>
          <Radio.Group
            className="repairCreateMode fullWidth"
            value={repairCreateMode}
            optionType="button"
            buttonStyle="solid"
            onChange={(event) => {
              const nextMode = event.target.value as "receipt" | "manual";
              setRepairCreateMode(nextMode);
              setReceiptDraft(null);
              setReceiptSupplierResolution(null);
              setUnmatchedReceiptSupplier(null);
              if (nextMode === "receipt") repairCreateForm.setFieldValue("supplierId", undefined);
            }}
          >
            <Radio.Button value="receipt">From receipt / 从收据建立</Radio.Button>
            <Radio.Button value="manual">Enter manually / 手动建立</Radio.Button>
          </Radio.Group>
          {repairCreateMode === "receipt" ? (
            <div className="fullWidth repairReceiptFlow">
              <div className="repairReceiptStart">
                <div className="repairReceiptStartHeading">
                  <span className="ocrStepLabel">Step 1 of 3 / 步骤一</span>
                  <Typography.Text strong>Upload a repair receipt / 上传整备收据</Typography.Text>
                  <Typography.Text type="secondary">Receipt scanning fills supplier and amount details only. Enter the repair instructions below.</Typography.Text>
                </div>
              </div>
              <div className="repairReceiptUploadAction">
                <OcrUploadReview
                  vehicleId={repairCreateVehicleId}
                  category="RepairInvoice"
                  buttonLabel="Upload receipt / 上传收据"
                  applyLabel="Use receipt details"
                  reviewPresentation="inline"
                  compact
                  disabled={!repairCreateVehicleId}
                  fields={[
                    { name: "supplierName", label: "Supplier", section: repairReceiptOcrSections.supplier, fullWidth: true },
                    { name: "supplierAddress", label: "Supplier address", section: repairReceiptOcrSections.supplier, fullWidth: true },
                    { name: "supplierPhone", label: "Supplier phone", section: repairReceiptOcrSections.supplier },
                    { name: "supplierRegistrationNumber", label: "Supplier registration number", section: repairReceiptOcrSections.supplier },
                    { name: "supplierTinNumber", label: "Supplier TIN", section: repairReceiptOcrSections.supplier, fullWidth: true },
                    { name: "invoiceNumber", label: "Receipt / Invoice reference", section: repairReceiptOcrSections.receipt },
                    { name: "plateNumberOnInvoice", label: "Plate on receipt / invoice / 发票车牌", section: repairReceiptOcrSections.receipt },
                    { name: "amount", label: "Receipt total / 收据总额 (RM)", type: "number", section: repairReceiptOcrSections.amountAndItems, fullWidth: true },
                  ]}
                  onApply={async (values, job) => {
                    const draft = repairReceiptDraftFromOcr(values, job);
                    if (draft.items.some((item) => !item.description)) {
                      throw new Error("Add a repair item description before confirming this receipt.");
                    }

                    setReceiptDraft(draft);
                    const supplierPrefill = supplierDraftPrefillFromOcr(values);
                    const matchedSupplier = supplierPrefill
                      ? supplierMasterMatchFromOcr(supplierMaster, supplierPrefill)
                      : undefined;
                    if (!supplierPrefill) {
                      setReceiptSupplierResolution({ kind: "missing" });
                      setUnmatchedReceiptSupplier(null);
                    } else if (matchedSupplier?.approvalStatus === "Approved") {
                      setReceiptSupplierResolution({ kind: "matched", supplier: matchedSupplier });
                      setUnmatchedReceiptSupplier(null);
                    } else if (matchedSupplier) {
                      setReceiptSupplierResolution({ kind: "draft", supplier: matchedSupplier });
                      setUnmatchedReceiptSupplier(null);
                    } else {
                      setReceiptSupplierResolution(null);
                      setUnmatchedReceiptSupplier(supplierPrefill);
                      openSupplierDraftFromReceipt(supplierPrefill);
                    }
                    repairCreateForm.setFieldsValue({
                      supplierId: matchedSupplier?.approvalStatus === "Approved" ? matchedSupplier.id : undefined,
                      supplierName: String(values.supplierName ?? "").trim(),
                      invoiceNumber: String(values.invoiceNumber ?? "").trim(),
                      plateNumberOnInvoice: String(values.plateNumberOnInvoice ?? "").trim() || undefined,
                      amount: Number(values.amount ?? 0)
                    });
                  }}
                />
              </div>
              {receiptDraft && receiptVehicleMatch?.kind === "matched" ? (
                <Alert className="operationalInfoAlert" type="success" showIcon message={`Receipt plate matches the selected car: ${receiptVehicleMatch.vehicle.plateNumber}.`} />
              ) : null}
              {receiptDraft && receiptVehicleMatch?.kind === "different" ? (
                <Alert className="operationalInfoAlert" type="warning" showIcon message={`Receipt plate matches ${receiptVehicleMatch.vehicle.plateNumber}, not the selected car.`} description="This uploaded receipt remains linked to the car selected before upload. To create this repair for the matched plate, close this form and upload the receipt again after selecting that car." />
              ) : null}
              {receiptDraft && receiptVehicleMatch?.kind === "notFound" ? (
                <Alert className="operationalInfoAlert" type="warning" showIcon message={`Receipt plate ${receiptVehicleMatch.plate} is not in the current car list.`} description="Check the printed plate and selected car before creating the repair." />
              ) : null}
              {receiptSupplierResolution?.kind === "matched" ? (
                <Alert className="operationalInfoAlert" type="success" showIcon message={`Receipt supplier matched approved master: ${receiptSupplierResolution.supplier.companyName}.`} />
              ) : null}
              {receiptSupplierResolution?.kind === "draft" ? (
                <Alert className="operationalInfoAlert" type="warning" showIcon message={`Supplier draft: ${receiptSupplierResolution.supplier.companyName}.`} description="Boss/Admin must approve the supplier before this repair can be created." />
              ) : null}
              {receiptSupplierResolution?.kind === "missing" ? (
                <Alert className="operationalInfoAlert" type="warning" showIcon message="The receipt did not include a supplier name." description="Select an approved supplier manually before creating this repair." />
              ) : null}
              {unmatchedReceiptSupplier ? (
                <Alert
                  className="operationalInfoAlert"
                  type="warning"
                  showIcon
                  message={`“${unmatchedReceiptSupplier.companyName}” is not in Supplier Master.`}
                  description={<Space wrap><span>Create a reviewed supplier draft, then ask Boss/Admin to approve it before creating the repair.</span><Button size="small" onClick={() => openSupplierDraftFromReceipt(unmatchedReceiptSupplier)}>Create supplier draft</Button></Space>}
                />
              ) : null}
              {receiptDraft ? (
                <section className="repairReceiptFinalStep">
                  <div className="repairReceiptFinalStepHeading">
                    <span className="ocrStepLabel">Step 3 of 3 / 步骤三</span>
                    <Typography.Text strong>Finish this repair / 完成整备记录</Typography.Text>
                    <Typography.Text type="secondary">Receipt details and items have been reviewed. Add one short title for this repair work.</Typography.Text>
                  </div>
                  <Form.Item name="whatToDo" label="Repair title / 整备标题" rules={[{ required: true }]}><Input placeholder="Example: Windscreen replacement" /></Form.Item>
                  <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!repairCreateSupplierId}>Create repair / 建立整备</Button></Form.Item>
                </section>
              ) : null}
            </div>
          ) : null}
          {repairCreateMode === "manual" ? (
            <section className="repairManualFlow" aria-label="Manual repair entry">
              <div className="repairManualIntro">
                <span className="repairManualEyebrow">Manual entry / 手动建立</span>
                <Typography.Text strong>Add the supplier invoice / 填写供应商发票</Typography.Text>
                <Typography.Text type="secondary">The approved supplier selected above will be used for this repair. Enter the printed invoice details and a short repair title.</Typography.Text>
              </div>
              <div className="repairManualFields">
                <Form.Item name="invoiceNumber" label="Receipt / Invoice reference" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="amount" label="Receipt total / 收据总额 (RM)"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                <Form.Item name="invoiceDate" label="Invoice date / 发票日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
                <Form.Item name="dueDate" label="Payment due date / 付款到期日"><Input placeholder="YYYY-MM-DD" /></Form.Item>
                <Form.Item name="paidAt" label="Paid date / 付款日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
                <Form.Item className="repairManualFieldFullWidth" name="plateNumberOnInvoice" label="Plate on receipt / invoice / 发票车牌"><Input placeholder="Plate number printed on the receipt or invoice" /></Form.Item>
                <Form.Item className="repairManualFieldFullWidth" name="whatToDo" label="Repair title / 整备标题" rules={[{ required: true }]}><Input placeholder="Example: Windscreen replacement" /></Form.Item>
              </div>
              <div className="repairManualApprovalNote">
                <Typography.Text type="secondary">A Boss/Admin records approval separately after checking the repair work and cost.</Typography.Text>
              </div>
              <Form.Item className="formActions repairManualSubmit"><Button type="primary" htmlType="submit">Save repair / 保存整备</Button></Form.Item>
            </section>
          ) : null}
        </Form>
      </Modal>
    </Space>
  );
}

export function LoanPage({
  vehicles,
  customers,
  loans,
  roles,
  initialLoanId,
  dashboardFocus,
  onClearDashboardFocus,
  onBackToList,
  onCreate,
  onUpdate,
  onDecide,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  customers: Customer[];
  loans: LoanApplication[];
  roles: readonly string[];
  initialLoanId?: string;
  dashboardFocus: DashboardDrilldown;
  onClearDashboardFocus: () => void;
  onBackToList: () => void;
  onCreate: (loan: LoanApplication) => void;
  onUpdate: (loan: LoanApplication) => void;
  onDecide: (loanId: string, status: LoanDecisionStatus, rejectionReason?: string) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory, onProgress: UploadProgressHandler) => Promise<void>;
}) {
  const [documentChecks, setDocumentChecks] = useState<Record<string, LoanDocumentCheck>>({});
  const [uploadLoanId, setUploadLoanId] = useState(initialLoanId ?? "");
  const [loanCreateOpen, setLoanCreateOpen] = useState(false);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [loanFilters, setLoanFilters] = useState<LoanFilters>({});
  const [loanFilterForm] = Form.useForm<LoanFilters>();
  const [mobileLoanPage, setMobileLoanPage] = useState(1);
  const [rejectionLoan, setRejectionLoan] = useState<LoanApplication>();
  const [rejectionReason, setRejectionReason] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const selectedLoan: LoanApplication | undefined = loans.find((loan) => loan.id === uploadLoanId);
  const loanIds = useMemo(() => loans.map((loan) => loan.id).join(","), [loans]);
  const filteredLoans = filterLoanApplications(loans, vehicles, customers, documentChecks, loanFilters);
  const canCreateManually = canCreateManualLoan(roles);
  const loanFiltersActive = Object.values(loanFilters).some((value) => value !== undefined && value !== "" && value !== "All");
  const mobileLoanPageCount = Math.max(1, Math.ceil(filteredLoans.length / mobileWorkflowPageSize));
  const clampedMobileLoanPage = Math.min(mobileLoanPage, mobileLoanPageCount);
  const mobileLoans = filteredLoans.slice(
    (clampedMobileLoanPage - 1) * mobileWorkflowPageSize,
    clampedMobileLoanPage * mobileWorkflowPageSize
  );
  const updateLoanFilters = (next: Partial<LoanFilters>) => {
    setLoanFilters((current) => ({ ...current, ...next }));
    setMobileLoanPage(1);
  };
  const loanEmptyText = loans.length > 0 ? "No loans match the current filters." : "No loan records yet.";

  useEffect(() => {
    if (initialLoanId) setUploadLoanId(initialLoanId);
  }, [initialLoanId]);

  useEffect(() => {
    const nextFilters = {
      status: dashboardFocus.loanStatus,
      vehicleId: dashboardFocus.vehicleId
    } satisfies LoanFilters;
    setLoanFilters(nextFilters);
    loanFilterForm.resetFields();
    loanFilterForm.setFieldsValue(nextFilters);
    setMobileLoanPage(1);
  }, [dashboardFocus.loanStatus, dashboardFocus.vehicleId, loanFilterForm]);

  useEffect(() => {
    if (!loans.length) {
      setDocumentChecks({});
      return;
    }

    let active = true;
    void Promise.all(loans.map(async (loan) => [loan.id, await getLoanDocumentCheck(loan.id)] as const))
      .then((items) => {
        if (active) setDocumentChecks(Object.fromEntries(items));
      });

    return () => {
      active = false;
    };
  }, [documentReloadKey, loanIds, loans]);

  const loanStatusColor: Record<LoanApplication["status"], string> = {
    Draft: "default",
    Pending: "orange",
    Approved: "green",
    Rejected: "red",
    Done: "blue"
  };

  const renderLoanDocumentSummary = (check?: LoanDocumentCheck) => {
    if (!check) return <Tag>Checking</Tag>;
    if (check.isComplete) return <Tag color="green">Complete</Tag>;

    const missingLabel = check.missingCategories.map(documentCategoryLabel).join(", ");
    return (
      <Tooltip title={`Missing: ${missingLabel}`}>
        <Tag color="red">{check.missingCategories.length} missing</Tag>
      </Tooltip>
    );
  };

  const loanCompletionBlockReason = (loanId: string) => {
    const check = documentChecks[loanId];
    if (!check) return "Document check is still loading.";
    if (check.isComplete) return "";
    return `Upload ${check.missingCategories.map(documentCategoryLabel).join(", ")} before marking the loan done.`;
  };

  const renderLoanNextAction = (loan: LoanApplication) => {
    if (loan.status === "Done") {
      return <Typography.Text type="secondary">Completed</Typography.Text>;
    }

    if (loan.status === "Rejected") {
      return <Typography.Text type="secondary">Review record</Typography.Text>;
    }

    if (loan.status === "Draft") {
      return (
        <Button size="small" onClick={() => onUpdate({ ...loan, status: "Pending", submittedAt: loan.submittedAt || today() })}>
          Submit
        </Button>
      );
    }

    if (loan.status === "Pending") {
      return (
        <Space size={6} wrap>
          <Popconfirm
            title="Record loan approval?"
            description="This records the loan and LOU as approved. Continue only after checking the decision evidence."
            okText="Record approval"
            cancelText="Cancel"
            onConfirm={() => onDecide(loan.id, "Approved")}
          >
            <Button size="small" type="primary">Record approval</Button>
          </Popconfirm>
          <Button
            size="small"
            danger
            onClick={() => {
              setRejectionLoan(loan);
              setRejectionReason("");
            }}
          >
            Record rejection
          </Button>
        </Space>
      );
    }

    if (!loan.louApproved) {
      return <Typography.Text type="danger">LOU approval needs correction</Typography.Text>;
    }

    if (!loan.louDone) {
      const blockReason = loanCompletionBlockReason(loan.id);
      return (
        <Tooltip title={blockReason}>
          <span><Button size="small" type="primary" disabled={Boolean(blockReason)} onClick={() => onUpdate(markLoanDone(loan))}>Mark Done</Button></span>
        </Tooltip>
      );
    }

    return <Typography.Text type="secondary">No workflow action</Typography.Text>;
  };

  const submitLoanRejection = async () => {
    if (!rejectionLoan) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      message.warning("Enter the bank or decision reason before rejecting the loan.");
      return;
    }

    setDecisionSubmitting(true);
    try {
      await onDecide(rejectionLoan.id, "Rejected", reason);
      setRejectionLoan(undefined);
      setRejectionReason("");
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const rejectionModal = (
    <Modal
      title="Record loan rejection / 记录贷款拒绝"
      open={Boolean(rejectionLoan)}
      okText="Confirm rejection"
      okButtonProps={{ danger: true }}
      confirmLoading={decisionSubmitting}
      onOk={() => void submitLoanRejection()}
      onCancel={() => {
        if (decisionSubmitting) return;
        setRejectionLoan(undefined);
        setRejectionReason("");
      }}
      destroyOnClose
    >
      <Space direction="vertical" size={12} className="fullWidth">
        <Alert
          type="warning"
          showIcon
          message="This closes the current loan application"
          description="Existing documents and the linked customer are preserved. The vehicle remains hidden and normally returns to Available; another active loan or reconciled payment keeps its workflow-owned status."
        />
        <div>
          <Typography.Text strong>Rejection reason / 拒绝原因</Typography.Text>
          <Input.TextArea
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            maxLength={500}
            showCount
            rows={4}
            placeholder="Example: Bank declined due to affordability assessment"
            autoFocus
          />
        </div>
      </Space>
    </Modal>
  );

  const columns: ColumnsType<LoanApplication> = [
    {
      title: "Car Plate / 车牌",
      dataIndex: "vehicleId",
      width: 220,
      render: (vehicleId) => <VehicleIdentity vehicles={vehicles} vehicleId={vehicleId} />
    },
    {
      title: "Customer / 客户",
      dataIndex: "customerId",
      width: 240,
      render: (customerId) => contactFor(customers, customerId)
    },
    { title: "Status / 状态", dataIndex: "status", width: 130, render: (status: LoanApplication["status"]) => <Tag color={loanStatusColor[status]}>{status}</Tag> },
    {
      title: "LOU",
      width: 180,
      render: (_, row) => (
        <Space size={8}>
          <Badge status={row.louApproved ? "success" : "default"} text="Approved" />
          <Badge status={row.louDone ? "success" : "warning"} text="Completed" />
        </Space>
      )
    },
    {
      title: "Documents / 文件",
      width: 150,
      render: (_, row) => renderLoanDocumentSummary(documentChecks[row.id])
    },
    { title: "Submitted / 提交", dataIndex: "submittedAt", width: 140, render: (value) => value || "-" },
    { title: "Follow Up / 跟进", width: 140, render: (_, row) => <Tag color={row.status === "Pending" ? "orange" : "default"}>{row.status === "Pending" ? "3-day active" : "No reminder"}</Tag> },
    {
      title: "Next Action / 操作",
      fixed: "right",
      width: 240,
      render: (_, row) => (
        <Space className="tableActionGroup loanActionCell" wrap size={6}>
          <Button size="small" type="primary" onClick={() => setUploadLoanId(row.id)}>Details</Button>
          {renderLoanNextAction(row)}
        </Space>
      )
    }
  ];

  if (selectedLoan) {
    const check = documentChecks[selectedLoan.id];
    const missingLoanDocuments = check?.missingCategories ?? loanDocumentCategories;
    const uploadLoanDocument = async (category: DocumentCategory, file: File, onProgress: UploadProgressHandler) => {
      await onUploadDocument(selectedLoan.vehicleId, file, category, onProgress);
      setDocumentReloadKey((value) => value + 1);
    };
    const progressStep = selectedLoan.status === "Done" ? 3 : selectedLoan.status === "Approved" ? 2 : selectedLoan.status === "Draft" ? 0 : 1;
    const progressStatus = selectedLoan.status === "Rejected" ? "error" : selectedLoan.status === "Done" ? "finish" : "process";
    const progressMessage = selectedLoan.status === "Draft"
      ? "Submit this draft before bank follow-up begins."
      : selectedLoan.status === "Pending"
        ? "Awaiting the loan and LOU decision. Documents may be added while waiting."
        : selectedLoan.status === "Rejected"
          ? `Loan rejected${selectedLoan.rejectionReason ? `: ${selectedLoan.rejectionReason}` : "."}`
          : selectedLoan.status === "Done"
            ? "Loan file complete and ready for Finance and Delivery follow-up."
            : check?.isComplete
              ? "Approval and all required documents are recorded. Mark the loan file complete when the final check is finished."
              : "Approval recorded. Complete the four-document checklist before finishing the loan file.";
    return (
      <Space direction="vertical" size={16} className="fullWidth">
        <Button onClick={() => { setUploadLoanId(""); onBackToList(); }}>Back to Loan List</Button>
        <ProCard title={`Loan Details / 贷款详情 - ${plateFor(vehicles, selectedLoan.vehicleId)}`}>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, selectedLoan.vehicleId)}</Descriptions.Item>
            <Descriptions.Item label="Customer / 客户">{contactFor(customers, selectedLoan.customerId)}</Descriptions.Item>
            <Descriptions.Item label="Status / 状态"><Tag color={loanStatusColor[selectedLoan.status]}>{selectedLoan.status === "Done" ? "Loan file complete" : selectedLoan.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Submitted / 提交">{selectedLoan.submittedAt}</Descriptions.Item>
            <Descriptions.Item label="LOU approval recorded / LOU 已批准">{selectedLoan.louApproved ? "Yes" : "No"}</Descriptions.Item>
            <Descriptions.Item label="LOU completed / LOU 已完成">{selectedLoan.louDone ? "Yes" : "No"}</Descriptions.Item>
            <Descriptions.Item label="Document Check / 文件检查">
              {check?.isComplete ? <Tag color="green">Complete</Tag> : <Tag color="red">Incomplete</Tag>}
            </Descriptions.Item>
            {selectedLoan.decisionBy && <Descriptions.Item label="Decision by / 决定人">{selectedLoan.decisionBy}</Descriptions.Item>}
            {selectedLoan.decisionAt && <Descriptions.Item label="Decision time / 决定时间">{String(selectedLoan.decisionAt).replace("T", " ").slice(0, 16)}</Descriptions.Item>}
          </Descriptions>
          <Space direction="vertical" size={12} className="detailWorkflowAction loanDecisionPanel">
            <Typography.Text strong>Loan decision and completion / 贷款决定与完成</Typography.Text>
            <Steps
              size="small"
              current={progressStep}
              status={progressStatus}
              responsive
              items={[
                { title: "Submitted / 已提交" },
                { title: selectedLoan.status === "Rejected" ? "Rejected / 已拒绝" : "Decision / 审批结果" },
                { title: "Documents / 文件" },
                { title: "Ready / 可交接" }
              ]}
            />
            <Alert type={selectedLoan.status === "Rejected" ? "error" : selectedLoan.status === "Done" ? "success" : "info"} showIcon message={progressMessage} />
            <Space wrap>{renderLoanNextAction(selectedLoan)}</Space>
          </Space>
        </ProCard>
        <ProCard title="Loan Documents / 贷款文件">
          <Space direction="vertical" size={12} className="fullWidth">
            <DocumentUploadChecklist
              title="Required document checklist / 必需文件清单"
              description="Add files as they arrive. All four are required before loan follow-up can be completed."
              items={loanDocumentCategories.map((category) => {
                const isPresent = !missingLoanDocuments.includes(category);
                const canUpload = selectedLoan.status !== "Rejected" && canUploadLoanChecklistDocument(roles, category);
                return {
                  label: documentCategoryLabel(category),
                  isPresent,
                  statusText: selectedLoan.status === "Rejected"
                    ? "Application rejected — existing files are read-only"
                    : canUpload ? undefined : loanDocumentChecklistStatus(category, isPresent),
                  action: canUpload ? (
                    <PreviewDocumentUpload
                      documentLabel={documentCategoryLabel(category)}
                      buttonLabel={isPresent ? `Upload another ${documentCategoryLabel(category)}` : `Upload ${documentCategoryLabel(category)}`}
                      onUpload={(file, onProgress) => uploadLoanDocument(category, file, onProgress)}
                    />
                  ) : undefined
                };
              })}
            />
            {selectedLoan.status !== "Rejected" && !check?.isComplete && (
              <Alert
                type="warning"
                showIcon
                message={`${missingLoanDocuments.length} document${missingLoanDocuments.length === 1 ? "" : "s"} still needed before completion`}
                description="Loan Document can be uploaded here. Missing VOC, AP Document, and Status Receipt are provided by Sales and remain visible until received."
              />
            )}
            {selectedLoan.status === "Rejected" && (
              <Alert type="info" showIcon message="Documents preserved for audit" description="Existing files remain available to preview or download. Reopen support is not available, so new uploads are disabled for this rejected application." />
            )}
            <Typography.Text strong>Uploaded files / 已上传文件</Typography.Text>
            <ModuleDocumentList
              vehicleId={selectedLoan.vehicleId}
              categories={loanDocumentCategories}
              reloadKey={documentReloadKey}
              showOcrResults={false}
              enablePreview
            />
          </Space>
        </ProCard>
        {rejectionModal}
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard
        title="Loan Workflow / 贷款流程"
        extra={<Space wrap><Tag color="blue">{loans.length} loans</Tag><Tag color={loans.some((loan) => loan.status === "Pending") ? "orange" : "default"}>{loans.filter((loan) => loan.status === "Pending").length} pending</Tag>{canCreateManually ? <Button onClick={() => setLoanCreateOpen(true)}>Manual loan record</Button> : <Typography.Text type="secondary">Start loans from Vehicle Details</Typography.Text>}</Space>}
      >
        {(dashboardFocus.loanStatus || dashboardFocus.vehicleId) && <Alert
          className="sectionIntroAlert"
          type="info"
          showIcon
          message={dashboardFocus.vehicleId ? "Dashboard focus: loan follow-up for the selected vehicle" : "Dashboard focus: pending loan follow-up"}
          action={<Button size="small" onClick={onClearDashboardFocus}>Clear focus</Button>}
        />}
        {/*
        <Space className="toolbarForm workflowFilterBar" wrap>
          <Input.Search
            allowClear
            placeholder="Search plate, customer, phone, or date"
            value={loanFilters.keyword}
            onChange={(event) => updateLoanFilters({ keyword: event.target.value })}
            style={{ width: 280 }}
          />
          <Select
            value={loanFilters.status ?? "All"}
            onChange={(status) => updateLoanFilters({ status })}
            options={[
              { value: "All", label: "All statuses" },
              ...(["Draft", "Pending", "Approved", "Rejected", "Done"] as LoanApplication["status"][]).map((value) => ({ value, label: value }))
            ]}
            style={{ width: 160 }}
          />
          <Select
            value={loanFilters.documents ?? "All"}
            onChange={(documents) => updateLoanFilters({ documents })}
            options={[
              { value: "All", label: "All document states" },
              { value: "Missing", label: "Documents missing" },
              { value: "Complete", label: "Documents complete" }
            ]}
            style={{ width: 190 }}
          />
          <Tag color={loanFiltersActive ? "blue" : "default"}>{loanFiltersActive ? `${filteredLoans.length} of ${loans.length} matching` : `${loans.length} loan${loans.length === 1 ? "" : "s"}`}</Tag>
          {loanFiltersActive && <Button
            size="small"
            onClick={() => {
              if (dashboardFocus.loanStatus || dashboardFocus.vehicleId) {
                onClearDashboardFocus();
                return;
              }
              setLoanFilters({});
              setMobileLoanPage(1);
            }}
          >
            Clear filters
          </Button>}
        </Space>
        */}
        <Form
          form={loanFilterForm}
          layout="inline"
          className="toolbarForm workflowFilterBar pageFilterMobileOnly"
          onValuesChange={(_, values: LoanFilters) => updateLoanFilters(values)}
        >
          <Form.Item name="keyword">
            <Input allowClear aria-label="Search loans by plate, customer, phone, or status" placeholder="Search plate, customer, phone, status" style={{ width: 280 }} />
          </Form.Item>
          <Form.Item name="status" initialValue="All">
            <Select
              options={[
                { value: "All", label: "All statuses" },
                ...(["Draft", "Pending", "Approved", "Rejected", "Done"] as LoanApplication["status"][]).map((value) => ({ value, label: value }))
              ]}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item name="documents" initialValue="All">
            <Select
              options={[
                { value: "All", label: "All document states" },
                { value: "Missing", label: "Documents missing" },
                { value: "Complete", label: "Documents complete" }
              ]}
              style={{ width: 190 }}
            />
            </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">Query</Button></Form.Item>
          <Form.Item><Button htmlType="button" onClick={() => {
            loanFilterForm.resetFields();
            if (dashboardFocus.loanStatus || dashboardFocus.vehicleId) {
              onClearDashboardFocus();
            }
            setLoanFilters({});
            setMobileLoanPage(1);
          }}>Reset</Button></Form.Item>
          <Tag color={loanFiltersActive ? "blue" : "default"}>{loanFiltersActive ? `${filteredLoans.length} of ${loans.length} matching` : `${loans.length} loan${loans.length === 1 ? "" : "s"}`}</Tag>
        </Form>
        <div className="mobileRecordList loanMobileList">
          {filteredLoans.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loanEmptyText} />}
          {mobileLoans.map((loan) => {
            const check = documentChecks[loan.id];
            const isPending = loan.status === "Pending";
            return (
              <article className="mobileRecordCard" key={loan.id}>
                  <div className="mobileRecordHeader">
                    <div>
                      <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                      <VehicleIdentity vehicles={vehicles} vehicleId={loan.vehicleId} />
                    </div>
                  <Tag color={loanStatusColor[loan.status]}>{loan.status}</Tag>
                </div>
                <div className="mobileRecordMeta">
                  <span>
                    <small>Customer / 客户</small>
                    <strong>{contactFor(customers, loan.customerId)}</strong>
                  </span>
                  <span>
                    <small>Submitted / 提交</small>
                    <strong>{loan.submittedAt}</strong>
                  </span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">LOU</Typography.Text>
                  <Space wrap size={6}>
                    <Badge status={loan.louApproved ? "success" : "default"} text="Approved" />
                    <Badge status={loan.louDone ? "success" : "warning"} text="Completed" />
                  </Space>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">Documents / 文件</Typography.Text>
                  {renderLoanDocumentSummary(check)}
                </div>
                <div className="mobileRecordFooter">
                  <Tag color={isPending ? "orange" : "default"}>{isPending ? "3-day reminder active" : "No reminder"}</Tag>
                  <Space className="tableActionGroup" wrap size={6}>
                    <Button size="small" type="primary" onClick={() => setUploadLoanId(loan.id)}>Details</Button>
                    {renderLoanNextAction(loan)}
                  </Space>
                </div>
              </article>
            );
          })}
          {filteredLoans.length > mobileWorkflowPageSize && (
            <Pagination
              current={clampedMobileLoanPage}
              pageSize={mobileWorkflowPageSize}
              total={filteredLoans.length}
              showSizeChanger={false}
              onChange={setMobileLoanPage}
            />
          )}
        </div>
        <Table
          className="desktopDataTable loanWorkflowTable nativeSearchDesktopOnly"
          rowKey="id"
          columns={columns}
          dataSource={filteredLoans}
          nativeSearch={{
            fields: [
              { name: "plate", label: "Plate" },
              { name: "customer", label: "Customer" },
              { name: "phone", label: "Phone" },
              { name: "status", label: "Status", options: (["Draft", "Pending", "Approved", "Rejected", "Done"] as LoanApplication["status"][]).map((value) => ({ value, label: value })) },
              { name: "documents", label: "Documents", options: [
                { value: "Missing", label: "Documents missing" },
                { value: "Complete", label: "Documents complete" }
              ] }
            ],
            values: {
              status: loanFilters.status === "All" ? undefined : loanFilters.status,
              documents: loanFilters.documents === "All" ? undefined : loanFilters.documents
            },
            onSubmit: (values) => {
              setLoanFilters({
                keyword: operationsKeywordFromFields(values, ["plate", "customer", "phone"]),
                status: (values.status as LoanFilters["status"] | undefined) ?? "All",
                documents: (values.documents as LoanFilters["documents"] | undefined) ?? "All"
              });
              setMobileLoanPage(1);
            },
            onReset: () => {
              loanFilterForm.resetFields();
              if (dashboardFocus.loanStatus || dashboardFocus.vehicleId) onClearDashboardFocus();
              setLoanFilters({});
              setMobileLoanPage(1);
            }
          }}
          pagination={{ ...tablePagination(8), current: clampedMobileLoanPage, onChange: setMobileLoanPage }}
          scroll={{ x: "max-content" }}
          locale={{ emptyText: loanEmptyText }}
        />
      </ProCard>
      {rejectionModal}
      <Modal
        title="Manual Loan Record / 手动贷款记录"
        width={680}
        open={loanCreateOpen}
        onCancel={() => setLoanCreateOpen(false)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Alert
          type="warning"
          showIcon
          message="Exception-only record"
          description="For ordinary sales, start from Vehicle Details and confirm the buyer there. This route is for Boss/Admin corrections only."
          className="manualLoanRecordAlert"
        />
        <Form layout="vertical" className="modalForm" onFinish={(values) => {
          const loan: LoanApplication = {
            id: newId(),
            vehicleId: values.vehicleId,
            customerId: values.customerId,
            status: values.status,
            louApproved: values.louApproved,
            louDone: values.louDone,
            submittedAt: values.submittedAt,
            rejectionReason: values.rejectionReason
          };
          const blockReason = loanCreateBlockReason(loan);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(loan);
          setLoanCreateOpen(false);
        }} initialValues={{ vehicleId: vehicles[0]?.id, customerId: customers[0]?.id, status: "Pending", louApproved: false, louDone: false, submittedAt: today() }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select customer"
              options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.status !== current.status}>
            {({ getFieldValue }) => getFieldValue("status") === "Rejected" ? (
              <Form.Item
                name="rejectionReason"
                label="Rejection reason / 拒绝原因"
                rules={[
                  { required: true, whitespace: true, message: "Enter the bank or decision reason." },
                  { max: 500, message: "Rejection reason must be 500 characters or fewer." }
                ]}
              >
                <Input.TextArea rows={4} maxLength={500} showCount placeholder="Example: Bank declined due to affordability assessment" />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Form.Item name="submittedAt" label="Submitted Date" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create manual record</Button></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export function DeliveryPage({
  vehicles,
  canCorrectBuyer = false,
  dashboardFocus,
  onClearDashboardFocus,
  onOpenCustomer
}: {
  vehicles: VehicleLookup[];
  canCorrectBuyer?: boolean;
  dashboardFocus: DashboardDrilldown;
  onClearDashboardFocus: () => void;
  onOpenCustomer: (customerId: string) => void;
}) {
  return (
    <DeliveryWorkboardPage
      vehicles={vehicles}
      canCorrectBuyer={canCorrectBuyer}
      dashboardFocus={dashboardFocus}
      onClearDashboardFocus={onClearDashboardFocus}
      onOpenCustomer={onOpenCustomer}
    />
  );
}

export function LeadsPage({ currentUser, vehicles, customers, leads, onCreateCustomer, onUpdate }: { currentUser: CurrentUser | null; vehicles: Vehicle[]; customers: Customer[]; leads: Lead[]; onCreateCustomer: (lead: Lead) => Promise<void>; onUpdate: (lead: Lead) => void }) {
  const [leadKeyword, setLeadKeyword] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<Lead["status"] | "All">("All");
  const [leadLinkFilter, setLeadLinkFilter] = useState<LeadLinkFilter>("All");
  const [leadSortMode, setLeadSortMode] = useState<"CloseAsap" | "Received">("CloseAsap");
  const [closingLead, setClosingLead] = useState<Lead | null>(null);
  const [closureOutcome, setClosureOutcome] = useState<"Sold" | "Lost" | "Invalid">("Lost");
  const [leadView, setLeadView] = useState<"Leads" | "MyCars">("Leads");
  const filteredLeads = filterLeadsForTriage(leads, { status: leadStatusFilter, link: leadLinkFilter });
  const displayedLeads = leadSortMode === "CloseAsap"
    ? sortLeadsByHotCarDemand(filteredLeads, vehicles)
    : [...filteredLeads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const groupedLeadRows = groupLeadsByVehicle(displayedLeads, vehicles);
  const activeCounts = activeLeadCountByVehicle(leads);
  const openLeadCount = leads.filter((lead) => lead.status !== "Closed").length;
  const multiLeadVehicleCount = Object.values(activeCounts).filter((count) => count > 1).length;
  const hotVehicleCount = vehicles.filter((vehicle) => vehicle.status === "Available" && vehicle.isPublic && (activeCounts[vehicle.id] ?? 0) > 1).length;
  const leadFiltersActive = Boolean(leadKeyword.trim()) || leadStatusFilter !== "All" || leadLinkFilter !== "All" || leadSortMode !== "CloseAsap";
  const clearLeadFilters = () => {
    setLeadKeyword("");
    setLeadStatusFilter("All");
    setLeadLinkFilter("All");
    setLeadSortMode("CloseAsap");
  };
  const customerRecordForLead = (lead: Lead) => lead.customerId ? customers.find((customer) => customer.id === lead.customerId) : undefined;
  const currentUserId = currentUser?.id ?? "";
  const isTakenByCurrentUser = (lead: Lead) => Boolean(lead.takenByUserId && lead.takenByUserId === currentUserId);
  const isTakenByOtherUser = (lead: Lead) => Boolean(lead.takenByUserId && lead.takenByUserId !== currentUserId);
  const leadOwnerLabel = (lead: Lead) => {
    if (lead.takenByName) return `Taken by ${lead.takenByName}`;
    if (lead.status === "Closed") return undefined;
    return "Not taken";
  };
  const canReleaseLead = (lead: Lead) => lead.status === "Contacted" && isTakenByCurrentUser(lead);
  const releaseLead = (lead: Lead) => onUpdate({
    ...lead,
    status: "New",
    takenByUserId: undefined,
    takenByName: undefined,
    takenAt: undefined
  });
  const renderLeadReleaseButton = (lead: Lead) => canReleaseLead(lead) ? (
    <Button size="small" className="leadReleaseButton" onClick={() => releaseLead(lead)}>
      Release Lead
    </Button>
  ) : null;

  const renderLeadWorkflowButton = (lead: Lead) => {
    const takenByOther = isTakenByOtherUser(lead);
    const disabled = lead.status === "Closed" || takenByOther || !currentUserId;
    const label = !currentUserId
      ? "Sign in"
      : takenByOther
        ? `Taken by ${lead.takenByName || "staff"}`
        : lead.status === "New"
          ? "Take Lead"
          : lead.status === "Contacted"
            ? "Close Case"
            : "Closed";

    return (
      <Button
        size="small"
        type={lead.status === "Closed" || takenByOther ? "default" : "primary"}
        disabled={disabled}
        onClick={() => {
          if (lead.status === "New") {
            if (lead.customerId) {
              onUpdate({ ...lead, status: "Contacted" });
            } else {
              void onCreateCustomer(lead);
            }
            return;
          }

          if (lead.status === "Contacted") {
            setClosingLead(lead);
          }
        }}
      >
        {label}
      </Button>
    );
  };
  const renderLeadActions = (lead: Lead) => (
    <Space className="tableActionGroup leadActionGroup" wrap size={6}>
      {renderLeadWorkflowButton(lead)}
      {renderLeadReleaseButton(lead)}
    </Space>
  );
  const renderLeadCustomer = (lead: Lead) => {
    const customer = customerRecordForLead(lead);
    return (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{customer?.name ?? lead.customerName}</Typography.Text>
        <Typography.Text type="secondary">{customer?.phone ?? lead.phone}</Typography.Text>
      </Space>
    );
  };

  const leadDetailColumns: ColumnsType<Lead> = [
    {
      title: "Customer Record",
      width: 220,
      render: (_, row) => renderLeadCustomer(row)
    },
    { title: "Received / 日期", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
    { title: "Message / 询问", dataIndex: "message", render: (value) => value || "-" },
    {
      title: "Source / 来源",
      width: 260,
      render: (_, row) => (
        <Tooltip title={leadSourceSummary(row)}>
          <Typography.Text className="leadSourceText">{leadSourceSummary(row)}</Typography.Text>
        </Tooltip>
      )
    },
    {
      title: "Status / 状态",
      dataIndex: "status",
      render: (status, row) => (
        <Space direction="vertical" size={2}>
          <Tag color={status === "New" ? "orange" : status === "Contacted" ? "blue" : "green"}>{status}</Tag>
          {leadOwnerLabel(row) ? (
            <Typography.Text type="secondary" className="leadTakenByText">
              {leadOwnerLabel(row)}
            </Typography.Text>
          ) : null}
        </Space>
      )
    },
    {
      title: "Next Action / 操作",
      fixed: "right",
      width: 230,
      render: (_, row) => renderLeadActions(row)
    }
  ];
  const groupColumns: ColumnsType<LeadVehicleGroup> = [
    {
      title: "Vehicle / 车辆",
      width: 300,
      render: (_, row) => (
        <Space direction="vertical" size={0} className="leadVehicleCell">
          <Typography.Text strong>{leadVehicleLabel(row.latestLead, vehicles)}</Typography.Text>
          <Typography.Text type="secondary">{row.activeCount} active lead{row.activeCount === 1 ? "" : "s"} / {row.leads.length} total</Typography.Text>
        </Space>
      )
    },
    {
      title: "Customer Leads",
      render: (_, row) => (
        <Space direction="vertical" size={2} className="leadGroupCustomers">
          {row.leads.slice(0, 3).map((lead) => (
            <Typography.Text key={lead.id}>{lead.customerName} / {lead.phone}</Typography.Text>
          ))}
          {row.leads.length > 3 ? <Typography.Text type="secondary">+{row.leads.length - 3} more</Typography.Text> : null}
        </Space>
      )
    },
    {
      title: "Lead Status",
      width: 220,
      render: (_, row) => {
        const newCount = row.leads.filter((lead) => lead.status === "New").length;
        const contactedCount = row.leads.filter((lead) => lead.status === "Contacted").length;
        const closedCount = row.leads.filter((lead) => lead.status === "Closed").length;
        return (
          <Space wrap size={4}>
            <Tag color="orange">{newCount} New</Tag>
            <Tag color="blue">{contactedCount} Contacted</Tag>
            <Tag color="green">{closedCount} Closed</Tag>
          </Space>
        );
      }
    },
    {
      title: "Latest / 日期",
      width: 120,
      render: (_, row) => String(row.latestLead.createdAt).slice(0, 10)
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth leadsPage">
      <Radio.Group
        className="salesLeadViewSwitch"
        optionType="button"
        buttonStyle="solid"
        value={leadView}
        onChange={(event) => setLeadView(event.target.value)}
        options={[
          { value: "Leads", label: "Leads / 客户询问" },
          { value: "MyCars", label: "My Cars / 我的车辆" }
        ]}
      />
      {leadView === "Leads" ? <>
      <ProCard title={bilingual.leads}>
        <div className="leadCloseAsapBand">
          <div>
            <Typography.Text className="moduleEyebrow">Close ASAP</Typography.Text>
            <Typography.Title level={3}>Hot cars with active customer demand</Typography.Title>
            <Typography.Text type="secondary">Open leads on available public vehicles move to the top, with multi-lead cars highlighted for fast follow-up.</Typography.Text>
          </div>
          <div className="vehicleMiniStats">
            <span><strong>{hotVehicleCount}</strong>Hot cars</span>
            <span><strong>{openLeadCount}</strong>Open leads</span>
            <span><strong>{multiLeadVehicleCount}</strong>Multi-lead cars</span>
          </div>
        </div>
        <Space className="leadFilterControls pageFilterMobileOnly" wrap>
          <label className="leadFilterControl">
            <span>Search</span>
            <Input.Search
              allowClear
              aria-label="Search leads by customer, phone, plate, or message"
              placeholder="Customer, phone, plate, or message"
              value={leadKeyword}
              onChange={(event) => setLeadKeyword(event.target.value)}
              onSearch={setLeadKeyword}
              style={{ width: 280 }}
            />
          </label>
          <label className="leadFilterControl">
            <span>Status</span>
            <Select value={leadStatusFilter} options={leadFilterControlOptions.status} onChange={setLeadStatusFilter} style={{ width: 160 }} />
          </label>
          <label className="leadFilterControl">
            <span>Customer Link</span>
            <Select value={leadLinkFilter} options={leadFilterControlOptions.customerLink} onChange={setLeadLinkFilter} style={{ width: 180 }} />
          </label>
          <label className="leadFilterControl">
            <span>Sort By</span>
            <Select value={leadSortMode} options={leadFilterControlOptions.sort} onChange={setLeadSortMode} style={{ width: 180 }} />
          </label>
          <Tag color="blue">{groupedLeadRows.length} cars / {displayedLeads.length} leads</Tag>
          {leadFiltersActive && <Button size="small" onClick={clearLeadFilters}>Clear filters</Button>}
        </Space>
        <div className="mobileRecordList">
          {groupedLeadRows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leads match the current filters." />}
          {groupedLeadRows.map((group) => (
            <article className="mobileRecordCard" key={group.vehicleId}>
              <div className="mobileRecordHeader">
                <div>
                  <Typography.Text className="mobileRecordEyebrow">Vehicle / 车辆</Typography.Text>
                  <Typography.Title level={5}>{leadVehicleLabel(group.latestLead, vehicles)}</Typography.Title>
                </div>
                <Space wrap size={4}>
                  <Tag>{group.activeCount} active</Tag>
                </Space>
              </div>
              <div className="mobileRecordMeta">
                <span>
                  <small>Total Leads</small>
                  <strong>{group.leads.length}</strong>
                </span>
                <span>
                  <small>Latest / 日期</small>
                  <strong>{String(group.latestLead.createdAt).slice(0, 10)}</strong>
                </span>
              </div>
              <div className="mobileRecordSection">
                <Typography.Text className="mobileRecordLabel">Leads / 客户询问</Typography.Text>
                <div className="leadMobileGroupList">
                  {group.leads.map((lead) => (
                    <div className="leadMobileGroupItem" key={lead.id}>
                      <div>
                        <strong>{lead.customerName}</strong>
                        <span>{lead.phone}</span>
                        <small>{lead.message || "No message"}</small>
                        <small>{leadSourceSummary(lead)}</small>
                        {leadOwnerLabel(lead) ? <small>{leadOwnerLabel(lead)}</small> : null}
                      </div>
                      <Space wrap size={4}>
                        <Tag color={lead.status === "New" ? "orange" : lead.status === "Contacted" ? "blue" : "green"}>{lead.status}</Tag>
                        {renderLeadActions(lead)}
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mobileRecordFooter">
                <Space wrap size={6}>
                  <Tag color="orange">{group.leads.filter((lead) => lead.status === "New").length} New</Tag>
                  <Tag color="blue">{group.leads.filter((lead) => lead.status === "Contacted").length} Contacted</Tag>
                  <Tag color="green">{group.leads.filter((lead) => lead.status === "Closed").length} Closed</Tag>
                </Space>
              </div>
            </article>
          ))}
        </div>
        <Table
          className="desktopDataTable nativeSearchDesktopOnly"
          rowKey="vehicleId"
          size="small"
          columns={groupColumns}
          dataSource={groupedLeadRows}
          nativeSearch={{
            fields: [
              { name: "customer", label: "Customer" },
              { name: "phone", label: "Phone" },
              { name: "plate", label: "Plate" },
              { name: "message", label: "Message" },
              { name: "status", label: "Status", options: leadFilterControlOptions.status.filter((option) => option.value !== "All") },
              { name: "customerLink", label: "Customer link", options: leadFilterControlOptions.customerLink.filter((option) => option.value !== "All") },
              { name: "sort", label: "Sort by", options: leadFilterControlOptions.sort }
            ],
            values: {
              status: leadStatusFilter === "All" ? undefined : leadStatusFilter,
              customerLink: leadLinkFilter === "All" ? undefined : leadLinkFilter,
              sort: leadSortMode
            },
            onSubmit: (values) => {
              setLeadKeyword(operationsKeywordFromFields(values, ["customer", "phone", "plate", "message"]));
              setLeadStatusFilter((values.status as typeof leadStatusFilter | undefined) ?? "All");
              setLeadLinkFilter((values.customerLink as typeof leadLinkFilter | undefined) ?? "All");
              setLeadSortMode((values.sort as typeof leadSortMode | undefined) ?? leadFilterControlOptions.sort[0].value);
            },
            onReset: clearLeadFilters
          }}
          pagination={tablePagination(8)}
          scroll={{ x: 930 }}
          expandable={{
            defaultExpandAllRows: groupedLeadRows.length <= 3,
            expandedRowRender: (group) => (
              <Table
                className="nativeSearchDesktopOnly"
                rowKey="id"
                size="small"
                columns={leadDetailColumns}
                dataSource={group.leads}
                search={false}
                pagination={false}
                scroll={{ x: 1120 }}
                locale={{ emptyText: "No lead details in this group." }}
              />
            )
          }}
          locale={{ emptyText: "No leads match the current filters." }}
        />
      </ProCard>
      <Modal
        title="Close lead / 结束询问"
        open={Boolean(closingLead)}
        okText="Close lead"
        onCancel={() => setClosingLead(null)}
        onOk={() => {
          if (closingLead) onUpdate({ ...closingLead, status: "Closed", closureOutcome });
          setClosingLead(null);
        }}
      >
        <Typography.Paragraph type="secondary">Record the real outcome so the Dashboard can distinguish sales from lost enquiries.</Typography.Paragraph>
        <Select value={closureOutcome} onChange={setClosureOutcome} className="fullWidth" options={[
          { value: "Sold", label: "Sold / 已成交" },
          { value: "Lost", label: "Lost / 已流失" },
          { value: "Invalid", label: "Invalid / 无效询问" }
        ]} />
      </Modal>
      </> : <SalesMyCarsPanel currentUser={currentUser} />}
    </Space>
  );
}

function AuditLogRecords({ auditLog, filters, onSearch }: { auditLog: AuditLog[]; filters: AuditLogFilters; onSearch: (filters: AuditLogFilters) => Promise<void> }) {
  const [form] = Form.useForm<AuditLogFilters>();
  const [mobileAuditPage, setMobileAuditPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const mobileAuditPageCount = Math.max(1, Math.ceil(auditLog.length / mobileWorkflowPageSize));
  const clampedMobileAuditPage = Math.min(mobileAuditPage, mobileAuditPageCount);
  const mobileAuditRecords = auditLog.slice(
    (clampedMobileAuditPage - 1) * mobileWorkflowPageSize,
    clampedMobileAuditPage * mobileWorkflowPageSize
  );

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(filters);
    setMobileAuditPage(1);
  }, [filters, form]);

  const runSearch = async (nextFilters: AuditLogFilters) => {
    setSearching(true);
    setMobileAuditPage(1);
    try {
      await onSearch(nextFilters);
    } catch {
      form.resetFields();
      form.setFieldsValue(filters);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Space direction="vertical" size={12} className="fullWidth">
      <Form
        form={form}
        layout="inline"
        className="toolbarForm pageFilterMobileOnly"
        onFinish={(values) => {
          void runSearch({
            keyword: values.keyword,
            actor: values.actor,
            action: values.action,
            entityName: values.entityName
          });
        }}
      >
        <Form.Item name="keyword" label="Search">
          <Input placeholder="Actor, action, or entity" allowClear />
        </Form.Item>
        <Form.Item name="actor" label="Actor">
          <Input placeholder="admin@ysheng.local" allowClear />
        </Form.Item>
        <Form.Item name="action" label="Action">
          <Input placeholder="vehicle.updated" allowClear />
        </Form.Item>
        <Form.Item name="entityName" label="Entity">
          <Input placeholder="Vehicle" allowClear />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={searching}>Search</Button>
        </Form.Item>
        <Form.Item>
          <Button htmlType="button" disabled={searching} onClick={() => {
            form.resetFields();
            void runSearch({});
          }}>Reset</Button>
        </Form.Item>
        <Tag color="blue">{auditLog.length} records</Tag>
      </Form>
      <div className="mobileRecordList">
        {auditLog.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No audit records match the current filters." />}
        {mobileAuditRecords.map((entry) => (
          <article className="mobileRecordCard" key={entry.id}>
            <div className="mobileRecordHeader">
              <div>
                <Typography.Text className="mobileRecordEyebrow">Action / 动作</Typography.Text>
                <Typography.Title level={5}>{entry.action}</Typography.Title>
              </div>
              <Tag>{entry.entityName}</Tag>
            </div>
            <div className="mobileRecordMeta">
              <span><small>Actor / 操作人</small><strong>{entry.actor}</strong></span>
              <span><small>Time / 时间</small><strong>{String(entry.createdAt).replace("T", " ").slice(0, 16)}</strong></span>
            </div>
            <div className="mobileRecordSection">
              <Typography.Text className="mobileRecordLabel">Entity Id</Typography.Text>
              <div className="mobileRecordTextBlock"><span>{entry.entityId}</span></div>
            </div>
          </article>
        ))}
        {auditLog.length > mobileWorkflowPageSize && (
          <Pagination
            current={clampedMobileAuditPage}
            pageSize={mobileWorkflowPageSize}
            total={auditLog.length}
            showSizeChanger={false}
            onChange={setMobileAuditPage}
          />
        )}
      </div>
      <Table
        className="desktopDataTable nativeSearchDesktopOnly"
        rowKey="id"
        columns={auditLogColumns()}
        dataSource={auditLog}
        nativeSearch={{
          fields: [
            { name: "actor", label: "Actor", placeholder: "Staff email" },
            { name: "action", label: "Action", placeholder: "vehicle.updated" },
            { name: "entityName", label: "Entity", placeholder: "Vehicle" }
          ],
          values: filters,
          onSubmit: (values) => void runSearch({
            actor: String(values.actor ?? "") || undefined,
            action: String(values.action ?? "") || undefined,
            entityName: String(values.entityName ?? "") || undefined
          }),
          onReset: () => void runSearch({})
        }}
        pagination={{ ...tablePagination(mobileWorkflowPageSize), current: clampedMobileAuditPage, onChange: setMobileAuditPage }}
        scroll={{ x: 900 }}
        locale={{ emptyText: "No audit records match the current filters." }}
      />
    </Space>
  );
}

function AuditLogPage({ auditLog, filters, onSearch }: { auditLog: AuditLog[]; filters: AuditLogFilters; onSearch: (filters: AuditLogFilters) => Promise<void> }) {
  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title={bilingual.auditLog}>
        <AuditLogRecords auditLog={auditLog} filters={filters} onSearch={onSearch} />
      </ProCard>
      <Alert
        className="operationalInfoAlert"
        type="info"
        showIcon
        message="Use the automatic audit trail to confirm who changed vehicle, workflow, finance, upload, and staff records."
      />
    </Space>
  );
}

function AdminPage({
  auditLog,
  auditLogFilters,
  staffUsers,
  onCreateStaffUser,
  onUpdateStaffUser,
  onResetStaffPassword,
  onUpdateStaffStatus,
  onUpdateStaffRoles,
  onSearchAuditLog
}: {
  auditLog: AuditLog[];
  auditLogFilters: AuditLogFilters;
  staffUsers: StaffUser[];
  onCreateStaffUser: (user: CreateStaffUserRequest) => Promise<void>;
  onUpdateStaffUser: (userId: string, request: UpdateStaffUserRequest) => Promise<void>;
  onResetStaffPassword: (userId: string, request: ResetStaffPasswordRequest) => Promise<void>;
  onUpdateStaffStatus: (userId: string, request: UpdateStaffUserStatusRequest) => Promise<void>;
  onUpdateStaffRoles: (userId: string, roles: StaffRole[]) => Promise<void>;
  onSearchAuditLog: (filters: AuditLogFilters) => Promise<void>;
}) {
  const [editStaffUserId, setEditStaffUserId] = useState(staffUsers[0]?.id ?? "");
  const [staffEditorOpen, setStaffEditorOpen] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [staffKeywordFilter, setStaffKeywordFilter] = useState("");
  const [staffStatusFilter, setStaffStatusFilter] = useState<StaffStatusFilter>("All");
  const [staffRoleFilter, setStaffRoleFilter] = useState<StaffRole | "All">("All");
  const [mobileStaffPage, setMobileStaffPage] = useState(1);
  const [ocrLimitSnapshot, setOcrLimitSnapshot] = useState<AiUsageLimitSnapshot | null>(null);
  const [ocrLimitSaving, setOcrLimitSaving] = useState(false);
  const [ocrLimitForm] = Form.useForm<UpdateAiServiceLimitRequest>();
  const selectedEditStaffUser = staffUsers.find((user) => user.id === editStaffUserId) ?? staffUsers[0];
  const filteredStaffUsers = filterStaffUsers(staffUsers, {
    keyword: staffKeywordFilter,
    status: staffStatusFilter,
    role: staffRoleFilter
  });
  const staffFiltersActive = Boolean(staffKeywordFilter.trim()) || staffStatusFilter !== "All" || staffRoleFilter !== "All";
  const mobileStaffPageCount = Math.max(1, Math.ceil(filteredStaffUsers.length / mobileWorkflowPageSize));
  const clampedMobileStaffPage = Math.min(mobileStaffPage, mobileStaffPageCount);
  const mobileStaffUsers = filteredStaffUsers.slice(
    (clampedMobileStaffPage - 1) * mobileWorkflowPageSize,
    clampedMobileStaffPage * mobileWorkflowPageSize
  );
  const activeStaffCount = staffUsers.filter((user) => user.isActive).length;
  const disabledStaffCount = staffUsers.filter((user) => !user.isActive).length;
  const adminStaffCount = staffUsers.filter((user) => user.roles.includes("BossAdmin")).length;

  useEffect(() => {
    let active = true;
    void getOcrUsageLimit()
      .then((snapshot) => {
        if (!active) return;
        setOcrLimitSnapshot(snapshot);
        ocrLimitForm.setFieldsValue(snapshot.limit);
      })
      .catch((error) => {
        if (active) message.error(humanizeApiError(error, "AI usage settings could not be loaded."));
      });
    return () => {
      active = false;
    };
  }, [ocrLimitForm]);

  const saveOcrLimit = async (values: UpdateAiServiceLimitRequest) => {
    setOcrLimitSaving(true);
    try {
      const snapshot = await updateOcrUsageLimit(values);
      setOcrLimitSnapshot(snapshot);
      ocrLimitForm.setFieldsValue(snapshot.limit);
      message.success("AI usage limit updated");
    } catch (error) {
      message.error(humanizeApiError(error, "AI usage limit could not be updated."));
    } finally {
      setOcrLimitSaving(false);
    }
  };

  useEffect(() => {
    if (!editStaffUserId && staffUsers[0]?.id) {
      setEditStaffUserId(staffUsers[0].id);
    }
  }, [editStaffUserId, staffUsers]);

  const selectStaffUser = (userId: string) => {
    setEditStaffUserId(userId);
    setStaffEditorOpen(true);
  };

  const openPasswordReset = (userId: string) => {
    setEditStaffUserId(userId);
    setPasswordResetOpen(true);
  };

  const clearStaffFilters = () => {
    setStaffKeywordFilter("");
    setStaffStatusFilter("All");
    setStaffRoleFilter("All");
    setMobileStaffPage(1);
  };

  const confirmStaffRoleChange = (row: StaffUser, roles: StaffRole[]) => {
    if (!canAssignStaffRoles(roles)) {
      message.warning("Select at least one department role before saving staff access.");
      return;
    }

    Modal.confirm({
      title: "Update staff roles?",
      content: `${row.displayName} will have: ${roles.map(roleLabel).join(", ")}.`,
      okText: "Update roles",
      cancelText: "Cancel",
      onOk: () => onUpdateStaffRoles(row.id, roles)
    });
  };

  const staffColumns: ColumnsType<StaffUser> = [
    { title: "Name / 姓名", dataIndex: "displayName", width: 180 },
    { title: "Email", dataIndex: "email", width: 260 },
    { title: "Status", dataIndex: "isActive", width: 110, render: (isActive: boolean) => <Tag color={isActive ? "green" : "red"}>{isActive ? "Active" : "Disabled"}</Tag> },
    { title: "Roles / 角色", dataIndex: "roles", width: 170, render: (roles: StaffRole[]) => <Space wrap>{roles.map((role) => <Tag key={role}>{roleLabel(role)}</Tag>)}</Space> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 250,
      render: (_, row) => (
        <Space className="tableActionGroup" wrap size={6}>
          <Button size="small" type="primary" onClick={() => selectStaffUser(row.id)}>Details</Button>
          <Button size="small" onClick={() => openPasswordReset(row.id)}>Reset</Button>
          <Popconfirm
            title={row.isActive ? "Disable staff user?" : "Enable staff user?"}
            description={row.isActive ? "The staff member will no longer be able to sign in." : "The staff member will be able to sign in again."}
            okText={row.isActive ? "Disable" : "Enable"}
            cancelText="Cancel"
            onConfirm={() => onUpdateStaffStatus(row.id, { isActive: !row.isActive })}
          >
            <Button size="small" danger={row.isActive}>
              {row.isActive ? "Disable" : "Enable"}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <ProCard title={bilingual.settings}>
      <Tabs
        items={[
          { key: "flow", label: "System Flow / 系统流程", children: <SystemFlowReference /> },
          {
            key: "users",
            label: "Staff Users / 员工账号",
            children: (
              <Space id="staff-users-panel" direction="vertical" size={16} className="fullWidth staffUsersPanel">
                <div className="tableToolbar">
                  <Typography.Text type="secondary">Create users here, then open Details to update identity or department access.</Typography.Text>
                  <Button type="primary" onClick={() => setStaffCreateOpen(true)}>New Staff</Button>
                </div>
                <div className="staffSummaryStrip">
                  <span><strong>{staffUsers.length}</strong>Total staff</span>
                  <span><strong>{activeStaffCount}</strong>Active</span>
                  <span><strong>{disabledStaffCount}</strong>Disabled</span>
                  <span><strong>{adminStaffCount}</strong>Admin</span>
                </div>
                <Space className="toolbarForm staffFilterBar pageFilterMobileOnly" wrap>
                  <Input.Search
                    aria-label="Search staff users"
                    placeholder="Search name, email, or role"
                    value={staffKeywordFilter}
                    onChange={(event) => {
                      setStaffKeywordFilter(event.target.value);
                      setMobileStaffPage(1);
                    }}
                    allowClear
                    style={{ width: 260 }}
                  />
                  <Select
                    value={staffStatusFilter}
                    options={[
                      { value: "All", label: "All status" },
                      { value: "Active", label: "Active" },
                      { value: "Disabled", label: "Disabled" }
                    ]}
                    onChange={(status) => {
                      setStaffStatusFilter(status);
                      setMobileStaffPage(1);
                    }}
                    style={{ width: 150 }}
                  />
                  <Select<StaffRole | "All">
                    value={staffRoleFilter}
                    options={[
                      { value: "All", label: "All roles" },
                      ...staffRoles.map((role) => ({ value: role, label: roleLabel(role) }))
                    ]}
                    onChange={(role) => {
                      setStaffRoleFilter(role);
                      setMobileStaffPage(1);
                    }}
                    style={{ width: 180 }}
                  />
                  <Tag color={staffFiltersActive ? "blue" : "default"}>{staffFiltersActive ? `${filteredStaffUsers.length} of ${staffUsers.length} matching` : `${staffUsers.length} staff member${staffUsers.length === 1 ? "" : "s"}`}</Tag>
                  {staffFiltersActive && <Button size="small" onClick={clearStaffFilters}>Clear filters</Button>}
                </Space>
                <div className="mobileRecordList">
                  {filteredStaffUsers.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No staff users match the current filters." />}
                  {mobileStaffUsers.map((user) => (
                    <article className="mobileRecordCard" key={user.id}>
                      <div className="mobileRecordHeader">
                        <div>
                          <Typography.Text className="mobileRecordEyebrow">Staff / 员工</Typography.Text>
                          <Typography.Title level={5}>{user.displayName}</Typography.Title>
                        </div>
                        <Tag color={user.isActive ? "green" : "red"}>{user.isActive ? "Active" : "Disabled"}</Tag>
                      </div>
                      <div className="mobileRecordMeta">
                        <span><small>Email</small><strong>{user.email}</strong></span>
                      </div>
                      <div className="mobileRecordSection">
                        <Typography.Text className="mobileRecordLabel">Roles / 角色</Typography.Text>
                        <Space wrap size={4}>{user.roles.map((role) => <Tag key={role}>{roleLabel(role)}</Tag>)}</Space>
                      </div>
                      <div className="mobileRecordFooter">
                        <Space className="tableActionGroup" wrap size={6}>
                          <Button size="small" type="primary" onClick={() => selectStaffUser(user.id)}>Details</Button>
                          <Button size="small" onClick={() => openPasswordReset(user.id)}>Reset</Button>
                          <Popconfirm
                            title={user.isActive ? "Disable staff user?" : "Enable staff user?"}
                            description={user.isActive ? "The staff member will no longer be able to sign in." : "The staff member will be able to sign in again."}
                            okText={user.isActive ? "Disable" : "Enable"}
                            cancelText="Cancel"
                            onConfirm={() => onUpdateStaffStatus(user.id, { isActive: !user.isActive })}
                          >
                            <Button size="small" danger={user.isActive}>
                              {user.isActive ? "Disable" : "Enable"}
                            </Button>
                          </Popconfirm>
                        </Space>
                      </div>
                    </article>
                  ))}
                  {filteredStaffUsers.length > mobileWorkflowPageSize && (
                    <Pagination
                      current={clampedMobileStaffPage}
                      pageSize={mobileWorkflowPageSize}
                      total={filteredStaffUsers.length}
                      showSizeChanger={false}
                      onChange={setMobileStaffPage}
                    />
                  )}
                </div>
                <Table
                  className="desktopDataTable nativeSearchDesktopOnly"
                  rowKey="id"
                  size="small"
                  columns={staffColumns}
                  dataSource={filteredStaffUsers}
                  nativeSearch={{
                    fields: [
                      { name: "name", label: "Name" },
                      { name: "email", label: "Email" },
                      { name: "status", label: "Status", options: [
                        { value: "Active", label: "Active" },
                        { value: "Disabled", label: "Disabled" }
                      ] },
                      { name: "role", label: "Role", options: staffRoles.map((role) => ({ value: role, label: roleLabel(role) })) }
                    ],
                    values: {
                      status: staffStatusFilter === "All" ? undefined : staffStatusFilter,
                      role: staffRoleFilter === "All" ? undefined : staffRoleFilter
                    },
                    onSubmit: (values) => {
                      setStaffKeywordFilter(operationsKeywordFromFields(values, ["name", "email"]));
                      setStaffStatusFilter((values.status as typeof staffStatusFilter | undefined) ?? "All");
                      setStaffRoleFilter((values.role as StaffRole | undefined) ?? "All");
                      setMobileStaffPage(1);
                    },
                    onReset: clearStaffFilters
                  }}
                  pagination={{ ...tablePagination(mobileWorkflowPageSize), current: clampedMobileStaffPage, onChange: setMobileStaffPage }}
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: "No staff users match the current filters." }}
                />
                <Drawer
                  title="Staff Details / 员工详情"
                  width={520}
                  open={staffEditorOpen}
                  onClose={() => setStaffEditorOpen(false)}
                  destroyOnClose
                  className="recordEditDrawer"
                >
                  <Form
                    key={selectedEditStaffUser?.id ?? "staff-edit-drawer"}
                    layout="vertical"
                    className="drawerForm"
                    initialValues={selectedEditStaffUser ? { id: selectedEditStaffUser.id, displayName: selectedEditStaffUser.displayName } : {}}
                    onFinish={(values) => {
                      if (!selectedEditStaffUser) {
                        message.warning("Select a staff user before updating.");
                        return;
                      }

                      const staffUser: UpdateStaffUserRequest = {
                        displayName: values.displayName
                      };
                      const blockReason = staffUpdateBlockReason(staffUser);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      onUpdateStaffUser(selectedEditStaffUser.id, staffUser);
                      setStaffEditorOpen(false);
                    }}
                  >
                    <Form.Item name="id" label="Selected Staff / 已选员工">
                      <Select
                        options={staffUsers.map((user) => ({ value: user.id, label: `${user.displayName} / ${user.email}` }))}
                        onChange={selectStaffUser}
                      />
                    </Form.Item>
                    <Form.Item name="displayName" label="Display Name / 姓名" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item label="Email">
                      <Input value={selectedEditStaffUser?.email} disabled />
                    </Form.Item>
                    <Form.Item label="Department Roles / 部门角色">
                      <Select<StaffRole[]>
                        mode="multiple"
                        className="fullWidth"
                        value={selectedEditStaffUser?.roles ?? []}
                        options={staffRoles.map((role) => ({ value: role, label: roleLabel(role) }))}
                        onChange={(roles) => selectedEditStaffUser && confirmStaffRoleChange(selectedEditStaffUser, roles)}
                        placeholder="Select at least one department role"
                      />
                    </Form.Item>
                    <Typography.Text type="secondary">
                      Role changes are confirmed separately and take effect immediately after saving.
                    </Typography.Text>
                    <Form.Item className="formActions">
                      <Button type="primary" htmlType="submit" disabled={!selectedEditStaffUser}>Update Staff</Button>
                    </Form.Item>
                  </Form>
                </Drawer>
                <Drawer
                  title="Reset Password / 重设密码"
                  width={520}
                  open={passwordResetOpen}
                  onClose={() => setPasswordResetOpen(false)}
                  destroyOnClose
                  className="recordEditDrawer"
                >
                  <Form
                    key={`${selectedEditStaffUser?.id ?? "staff"}-password-drawer`}
                    layout="vertical"
                    className="drawerForm"
                    initialValues={selectedEditStaffUser ? { id: selectedEditStaffUser.id } : {}}
                    onFinish={(values) => {
                      if (!selectedEditStaffUser) {
                        message.warning("Select a staff user before resetting password.");
                        return;
                      }

                      const requestBody: ResetStaffPasswordRequest = {
                        password: values.password
                      };
                      const blockReason = staffPasswordResetBlockReason(requestBody);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      Modal.confirm({
                        title: "Reset staff password?",
                        content: `Reset password for ${selectedEditStaffUser.displayName}. The new password will take effect immediately.`,
                        okText: "Reset password",
                        cancelText: "Cancel",
                        onOk: () => onResetStaffPassword(selectedEditStaffUser.id, requestBody).then(() => setPasswordResetOpen(false))
                      });
                    }}
                  >
                    <Form.Item name="id" label="Staff / 员工">
                      <Select
                        options={staffUsers.map((user) => ({ value: user.id, label: `${user.displayName} / ${user.email}` }))}
                        onChange={(userId) => setEditStaffUserId(userId)}
                      />
                    </Form.Item>
                    <Form.Item name="password" label="New Password" rules={[{ required: true, min: 8 }]}>
                      <Input.Password />
                    </Form.Item>
                    <Form.Item className="formActions">
                      <Button htmlType="submit" disabled={!selectedEditStaffUser}>Reset Password</Button>
                    </Form.Item>
                  </Form>
                </Drawer>
                <Modal
                  title="Create Staff / 新增员工"
                  width={680}
                  open={staffCreateOpen}
                  onCancel={() => setStaffCreateOpen(false)}
                  footer={null}
                  destroyOnClose
                  className="recordCreateModal"
                >
                  <Form
                  layout="vertical"
                  className="modalForm formGrid"
                  initialValues={{ role: "Sales" }}
                  onFinish={(values) => {
                    const staffUser: CreateStaffUserRequest = {
                      email: values.email,
                      displayName: values.displayName,
                      password: values.password,
                      role: values.role
                    };
                    const blockReason = staffCreateBlockReason(staffUser, staffUsers);
                    if (blockReason) {
                      message.warning(blockReason);
                      return;
                    }

                    onCreateStaffUser(staffUser);
                    setStaffCreateOpen(false);
                  }}
                >
                  <Form.Item name="displayName" label="Display Name / 姓名" rules={[{ required: true }]}><Input /></Form.Item>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
                  <Form.Item name="password" label="Initial Password" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
                  <Form.Item name="role" label="Department Role"><Select options={staffRoles.map((role) => ({ value: role, label: roleLabel(role) }))} /></Form.Item>
                  <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Staff</Button></Form.Item>
                  </Form>
                </Modal>
              </Space>
            )
          },
          {
            key: "ai-usage",
            label: "AI Usage / AI 使用量",
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                <Alert
                  className="operationalInfoAlert"
                  type="info"
                  showIcon
                  message="OCR limits are enforced by the server and reset on the UTC calendar day and month."
                />
                <ProCard title="OCR Limit / OCR 限额">
                  {ocrLimitSnapshot ? (
                    <Space direction="vertical" size={16} className="fullWidth">
                      <AiUsageSnapshotDescriptions snapshot={ocrLimitSnapshot} />
                      <OcrOperationalGuidance />
                      <Form form={ocrLimitForm} layout="vertical" onFinish={saveOcrLimit}>
                        <Form.Item name="isEnabled" label="OCR service" valuePropName="checked">
                          <Checkbox>Allow staff to run OCR</Checkbox>
                        </Form.Item>
                        <div className="formGrid">
                          <Form.Item name="monthlyRequestLimit" label="Monthly request limit" rules={[{ required: true, type: "number", min: 0, max: 100000 }]}>
                            <InputNumber className="fullWidth" min={0} max={100000} precision={0} />
                          </Form.Item>
                          <Form.Item name="perStaffDailyRequestLimit" label="Per-staff daily limit" rules={[{ required: true, type: "number", min: 0, max: 10000 }]}>
                            <InputNumber className="fullWidth" min={0} max={10000} precision={0} />
                          </Form.Item>
                        </div>
                        <Form.Item className="formActions">
                          <Button type="primary" htmlType="submit" loading={ocrLimitSaving}>Save AI limit</Button>
                        </Form.Item>
                      </Form>
                    </Space>
                  ) : <Spin />}
                </ProCard>
              </Space>
            )
          },
          { key: "showroom-enquiry", label: "QR Enquiry / 二维码询问", children: <ShowroomEnquiryQrSettings /> },
          { key: "vehicle-catalog", label: "Make & Model / 品牌车型", children: <VehicleCatalogSettings /> },
          { key: "roles", label: "RBAC Listing / 角色权限", children: <RbacListing /> },
          { key: "audit", label: "Audit Log / 操作记录", children: <AuditLogRecords auditLog={auditLog} filters={auditLogFilters} onSearch={onSearchAuditLog} /> }
        ]}
      />
    </ProCard>
  );
}

function SystemFlowReference() {
  const flowSteps = [
    {
      title: "1. Lead / Enquiry",
      owner: "Sales",
      records: ["Lead", "Customer"],
      detail: "Public enquiry or walk-in customer is captured, qualified, and linked to a customer record."
    },
    {
      title: "2. Vehicle Intake",
      owner: "Sales + Admin",
      records: ["Vehicle", "Purchase Invoice", "Owner"],
      detail: "Stock is created with plate, owner, purchase cost, selling price, management approval, and website visibility."
    },
    {
      title: "3. Refurbishment",
      owner: "Repair",
      records: ["Repair Job", "Supplier Invoice"],
      detail: "Repair checklist, parts, supplier invoice checks, and refurbishment cost are linked to the car plate."
    },
    {
      title: "4. Loan Workflow",
      owner: "Loan",
      records: ["Loan Application", "Loan Documents"],
      detail: "Loan documents, LOU approve/done status, and follow-up reminders move the vehicle out of ready stock."
    },
    {
      title: "5. Delivery Prep",
      owner: "Delivery",
      records: ["Delivery Schedule", "Policy", "Road Tax"],
      detail: "Inspection, documents, polish, tinted, wash, insurance, road tax, and 2-day release notification are tracked."
    },
    {
      title: "6. Finance Close",
      owner: "Finance",
      records: ["Payment", "Settlement", "Voucher"],
      detail: "Receipts, invoices, bank follow-up, settlement reminders, profit estimate, and payment status are reconciled."
    }
  ];

  const ownershipRows = [
    {
      role: "BossAdmin" as StaffRole,
      owns: "Approve pricing, manage staff/RBAC, inspect audit trail, review dashboard exceptions.",
      handoff: "Confirms vehicle economics before website/loan/sold workflow progresses."
    },
    {
      role: "Sales" as StaffRole,
      owns: "Leads, customer follow-up, vehicle intake, website stock visibility.",
      handoff: "Hands confirmed buyer to Loan and closes sales notes before Delivery/Finance."
    },
    {
      role: "Repair" as StaffRole,
      owns: "Refurbishment jobs, parts checklist, supplier invoice validation.",
      handoff: "Updates repair total so Finance can estimate real profit."
    },
    {
      role: "Loan" as StaffRole,
      owns: "Loan submission, document checklist, LOU approve/done, 3-day follow-up.",
      handoff: "Moves approved buyer to Delivery preparation."
    },
    {
      role: "Delivery" as StaffRole,
      owns: "Inspection booking, release schedule, document prep, road tax, policy, final cleaning checklist.",
      handoff: "Sends 2-day notice and marks release readiness before Finance final close."
    },
    {
      role: "Finance" as StaffRole,
      owns: "Payment receipts/invoices, bank follow-up, settlement deadline/amount, vouchers.",
      handoff: "Reconciles money movement and flags overdue settlement."
    },
    {
      role: "HrSalary" as StaffRole,
      owns: "Salary/commission reference, leave/MC controls, CP58 preparation as a planned extension.",
      handoff: "Uses approved commission/payment records for year-end staff tax reporting."
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth systemFlowReference">
      <div className="settingsOverview">
        <div>
          <span className="moduleEyebrow">Operating Model</span>
          <Typography.Title level={3}>System Flow Reference / 系统流程参考</Typography.Title>
          <Typography.Text>Use this page as the standard department handoff map before configuring users and roles.</Typography.Text>
        </div>
        <div className="rbacSummary">
          <span><strong>{flowSteps.length}</strong> workflow steps</span>
          <span><strong>{ownershipRows.length}</strong> owner roles</span>
          <span><strong>RBAC</strong> enforced</span>
        </div>
      </div>

      <div className="systemFlowMap" aria-label="YS Heng department workflow">
        {flowSteps.map((step) => (
          <div className="systemFlowNode" key={step.title}>
            <Tag color="green">{step.owner}</Tag>
            <Typography.Title level={5}>{step.title}</Typography.Title>
            <Typography.Text>{step.detail}</Typography.Text>
            <div className="systemFlowRecords">
              {step.records.map((record) => <Tag key={record}>{record}</Tag>)}
            </div>
          </div>
        ))}
      </div>

      <ProCard title="Approval and Handoff Standard / 审批交接标准" className="systemHandoffCard">
        <Steps
          direction="vertical"
          size="small"
          items={[
            { title: "Vehicle record created", description: "Sales creates the stock record and uploads purchase/VOC/AP documents where available." },
            { title: "Management approves economics", description: "Admin confirms stock owner, purchase cost, selling price, and publish readiness." },
            { title: "Department modules update same vehicle", description: "Repair, Loan, Delivery, and Finance update their own records against the same car plate." },
            { title: "Finance closes and Audit Log records", description: "Payment, settlement, and status changes are visible in dashboard/audit trail for management review." }
          ]}
        />
      </ProCard>

      <div className="mobileRecordList">
        {ownershipRows.map((row) => (
          <article className="mobileRecordCard" key={row.role}>
            <div className="mobileRecordHeader">
              <div>
                <Typography.Text className="mobileRecordEyebrow">Department Role</Typography.Text>
                <Typography.Title level={5}>{roleLabel(row.role)}</Typography.Title>
              </div>
              <Tag color={row.role === "BossAdmin" ? "green" : "blue"}>{roleLabel(row.role)}</Tag>
            </div>
            <div className="mobileRecordSection">
              <Typography.Text className="mobileRecordLabel">Owns / 负责</Typography.Text>
              <div className="mobileRecordTextBlock"><span>{row.owns}</span></div>
            </div>
            <div className="mobileRecordSection">
              <Typography.Text className="mobileRecordLabel">Handoff / 交接</Typography.Text>
              <div className="mobileRecordTextBlock"><span>{row.handoff}</span></div>
            </div>
          </article>
        ))}
      </div>
      <Table
        rowKey="role"
        size="small"
        className="systemOwnershipTable desktopDataTable"
        columns={[
          {
            title: "Department Role",
            dataIndex: "role",
            width: 160,
            render: (role: StaffRole) => <Tag color={role === "BossAdmin" ? "green" : "blue"}>{roleLabel(role)}</Tag>
          },
          { title: "Owns / 负责", dataIndex: "owns" },
          { title: "Handoff / 交接", dataIndex: "handoff" }
        ]}
        dataSource={ownershipRows}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: "No ownership rows configured." }}
      />
      <Alert
        className="operationalInfoAlert"
        type="info"
        showIcon
        message="CP58 is a planned extension owned by HR Payroll or Finance, with Admin checks and management approval."
      />
    </Space>
  );
}

type RbacRoleRow = {
  role: StaffRole;
  modules: string[];
  dataKeys: BackOfficeDataKey[];
  canManageStaff: boolean;
  canViewAudit: boolean;
};

function RbacListing() {
  const rows: RbacRoleRow[] = staffRoles.map((role) => ({
    role,
    modules: routeAccess
      .filter((access) => access.roles.includes(role) || role === "BossAdmin")
      .map((access) => routeLabel(access.path)),
    dataKeys: roleDataKeys[role],
    canManageStaff: role === "BossAdmin",
    canViewAudit: role === "BossAdmin"
  }));

  const columns: ColumnsType<RbacRoleRow> = [
    {
      title: "Role / 角色",
      dataIndex: "role",
      fixed: "left",
      width: 150,
      render: (role: StaffRole) => <Tag color={role === "BossAdmin" ? "green" : "blue"}>{roleLabel(role)}</Tag>
    },
    {
      title: "Portal Modules / 可进入模块",
      dataIndex: "modules",
      render: (modules: string[]) => <div className="rbacTagList">{modules.map((module) => <Tag key={module}>{module}</Tag>)}</div>
    },
    {
      title: "Data Scope / 资料范围",
      dataIndex: "dataKeys",
      render: (dataKeys: BackOfficeDataKey[]) => dataKeys.length
        ? <div className="rbacTagList">{dataKeys.map((key) => <Tag key={key} color="cyan">{dataKeyLabel(key)}</Tag>)}</div>
        : <Typography.Text type="secondary">No MVP data module assigned</Typography.Text>
    },
    {
      title: "Admin Powers",
      width: 190,
      render: (_, row) => (
        <Space direction="vertical" size={4}>
          <Badge status={row.canManageStaff ? "success" : "default"} text={row.canManageStaff ? "Manage staff users" : "No staff management"} />
          <Badge status={row.canViewAudit ? "success" : "default"} text={row.canViewAudit ? "View audit log" : "No audit access"} />
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="rbacOverview">
        <div>
          <span className="moduleEyebrow">Access Control</span>
          <Typography.Title level={3}>RBAC Listing / 角色权限列表</Typography.Title>
          <Typography.Text>Review department role access before assigning staff permissions.</Typography.Text>
        </div>
        <div className="rbacSummary">
          <span><strong>{staffRoles.length}</strong> roles</span>
          <span><strong>{routeAccess.length}</strong> modules</span>
          <span><strong>{rows.filter((row) => row.canManageStaff).length}</strong> admin role</span>
        </div>
      </div>
      <div className="mobileRecordList">
        {rows.map((row) => (
          <article className="mobileRecordCard" key={row.role}>
            <div className="mobileRecordHeader">
              <div>
                <Typography.Text className="mobileRecordEyebrow">Role / 角色</Typography.Text>
                <Typography.Title level={5}>{roleLabel(row.role)}</Typography.Title>
              </div>
              <Tag color={row.role === "BossAdmin" ? "green" : "blue"}>{roleLabel(row.role)}</Tag>
            </div>
            <div className="mobileRecordSection">
              <Typography.Text className="mobileRecordLabel">Portal Modules / 可进入模块</Typography.Text>
              <Space wrap size={4}>{row.modules.map((module) => <Tag key={module}>{module}</Tag>)}</Space>
            </div>
            <div className="mobileRecordSection">
              <Typography.Text className="mobileRecordLabel">Data Scope / 资料范围</Typography.Text>
              <Space wrap size={4}>
                {row.dataKeys.length
                  ? row.dataKeys.map((key) => <Tag key={key} color="cyan">{dataKeyLabel(key)}</Tag>)
                  : <Tag>No MVP data module assigned</Tag>}
              </Space>
            </div>
            <div className="mobileRecordFooter">
              <Badge status={row.canManageStaff ? "success" : "default"} text={row.canManageStaff ? "Manage staff users" : "No staff management"} />
              <Badge status={row.canViewAudit ? "success" : "default"} text={row.canViewAudit ? "View audit log" : "No audit access"} />
            </div>
          </article>
        ))}
      </div>
      <Table className="rbacTable desktopDataTable" rowKey="role" columns={columns} dataSource={rows} pagination={tablePagination(8)} scroll={{ x: 980 }} locale={{ emptyText: "No role access rows configured." }} />
      <Alert
        className="operationalInfoAlert"
        type="info"
        showIcon
        message="The portal hides unavailable modules and the API rejects unauthorized requests; restricted pages do not load unrelated data."
      />
    </Space>
  );
}

function auditLogColumns(): ColumnsType<AuditLog> {
  return [
    { title: "Time / 时间", dataIndex: "createdAt", render: (value) => String(value).replace("T", " ").slice(0, 16) },
    { title: "Actor / 操作人", dataIndex: "actor" },
    { title: "Action / 动作", dataIndex: "action", render: (value) => <Tag color="blue">{value}</Tag> },
    { title: "Entity / 模块", dataIndex: "entityName" },
    { title: "Entity Id", dataIndex: "entityId" }
  ];
}

function routeLabel(path: AppRoutePath) {
  return routeDisplayName(path, ["BossAdmin"]);
}

function dataKeyLabel(key: BackOfficeDataKey) {
  const labels: Record<BackOfficeDataKey, string> = {
    dashboard: "Dashboard summary",
    reminders: "Reminder inbox",
    vehicles: "Vehicle records",
    vehicleLookup: "Car plate lookup",
    financeVehicleOptions: "Finance invoice vehicle defaults",
    customers: "Customer records",
    owners: "Owner records",
    purchaseInvoices: "Purchase invoices",
    supplierInvoices: "Supplier invoices",
    repairs: "Repair jobs",
    loans: "Loan applications",
    deliveries: "Delivery schedules",
    payments: "Payments",
    cashHandovers: "Cash custody records",
    cashHandoverPaymentLookup: "Cash custody payment lookup",
    settlements: "Settlement reminders",
    dailySpends: "Daily spends",
    brokerCommissions: "Broker commissions",
    debtRecoveries: "Debt recovery",
    paymentVouchers: "Payment vouchers",
    leads: "Public leads",
    auditLog: "Audit log",
    staffUsers: "Staff users",
    hrStaffUsers: "HR staff users",
    hrAttendance: "HR attendance",
  hrDashboard: "HR attendance dashboard",
  hrAvailabilityCalendar: "HR shared availability calendar",
  hrReminders: "HR attendance reminders",
  hrReminderPolicies: "HR reminder settings",
  hrBusinessTrips: "HR business trips and outstation duty",
  hrBossCalendar: "Boss leave calendar",
  hrAttendanceNetworks: "Office attendance networks",
    hrLeaveRequests: "HR leave requests",
    hrLeaveBalances: "HR leave balances",
    hrLeavePolicies: "HR leave policies",
    hrLeaveAdjustments: "HR leave adjustments",
    hrPayrollProfiles: "HR payroll profiles",
    hrPayPeriods: "HR pay periods",
    hrPayslips: "HR payslips"
  };
  return labels[key];
}

function roleLabel(role: StaffRole) {
  return displayRoleLabel(role);
}

function displayRoleLabel(role: string) {
  return role === "BossAdmin" ? "Admin" : role === "HrSalary" ? "HR Payroll" : role;
}

function documentCategoryLabel(category: DocumentCategory) {
  const labels: Record<DocumentCategory, string> = {
    PurchaseInvoice: "Purchase Invoice",
    Voc: "VOC",
    IdentityCard: "Identity Card",
    ApDocument: "AP Document",
    StatusReceipt: "Status Receipt",
    LoanDocument: "Loan Document",
    DeliveryDocument: "Delivery Document",
    HandoverPhoto: "Handover Photo",
    SignedHandover: "Signed Handover",
    Policy: "Policy",
    RoadTaxReceipt: "Road Tax Receipt",
    RepairInvoice: "Repair Invoice",
    PaymentReceipt: "Payment Receipt",
    PaymentInvoice: "Payment Invoice",
    MedicalCertificate: "Medical Certificate",
    InspectionReport: "Inspection Report",
    WindscreenPolicy: "Windscreen Policy"
  };
  return labels[category];
}

function shortformLabel(label: string, title: string) {
  return (
    <Tooltip title={title}>
      <span>{label}</span>
    </Tooltip>
  );
}

function plateFor(vehicles: VehicleLookup[], vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.plateNumber ?? "Unknown";
}

export function vehicleIdentityFor(vehicles: VehicleLookup[], vehicleId: string) {
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return { plateNumber: "Unknown", description: "Vehicle details unavailable" };

  return {
    plateNumber: vehicle.plateNumber,
    description: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
  };
}

function VehicleIdentity({ vehicles, vehicleId }: { vehicles: VehicleLookup[]; vehicleId: string }) {
  const identity = vehicleIdentityFor(vehicles, vehicleId);
  return (
    <Space direction="vertical" size={0}>
      <Typography.Text type="secondary">{identity.plateNumber}</Typography.Text>
      <Typography.Text strong>{identity.description}</Typography.Text>
    </Space>
  );
}

function normalizePlate(value?: string) {
  return value?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
}

function supplierInvoicePlateStatus(invoice: SupplierInvoice, vehicles: VehicleLookup[]) {
  const invoicePlate = normalizePlate(invoice.plateNumberOnInvoice);
  const vehiclePlate = normalizePlate(plateFor(vehicles, invoice.vehicleId));

  if (!invoicePlate) {
    return { color: "default", label: "No invoice plate" };
  }

  if (invoicePlate === vehiclePlate) {
    return { color: "green", label: "Plate matched" };
  }

  return { color: "red", label: "Plate mismatch" };
}

function customerLabel(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.name ?? "Unknown";
}

function paymentChecklistTags(payment: PaymentRecord) {
  return [
    ["Docs", payment.documentsPrepared, "Documents prepared"],
    ["Checklist", payment.checklistValidated]
  ].map(([label, done, tooltip]) => {
    const tag = <Tag key={String(label)} color={done ? "green" : "orange"}>{String(label)}</Tag>;
    return tooltip ? <Tooltip key={String(label)} title={String(tooltip)}>{tag}</Tooltip> : tag;
  });
}

function contactFor<T extends { id: string; name: string; phone: string }>(contacts: T[], contactId?: string) {
  if (!contactId) return "-";
  const contact = contacts.find((item) => item.id === contactId);
  return contact ? `${contact.name} / ${contact.phone}` : "Unknown";
}

function tableTextFilters(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ text: value, value }));
}

function replaceById<T extends { id: string }>(items: T[], record: T) {
  return items.map((item) => item.id === record.id ? record : item);
}

function replaceByIdOrPrepend<T extends { id: string }>(items: T[], record: T) {
  return items.some((item) => item.id === record.id) ? replaceById(items, record) : [record, ...items];
}

function mergeById<T extends { id: string }>(items: T[], records: T[]) {
  const next = [...items];
  for (const record of records) {
    const index = next.findIndex((item) => item.id === record.id);
    if (index >= 0) next[index] = record;
    else next.unshift(record);
  }
  return next;
}

function newId() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthlyElectricBillDueDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-15`;
}
