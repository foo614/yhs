import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined
} from "@ant-design/icons";
import { PageContainer, ProCard, ProLayout } from "@ant-design/pro-components";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Steps,
  Table as AntTable,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
  notification
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableProps } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { assignableStaffRoles, backOfficeDataKeysForRoles, canAccessRoute, canApproveVehicles, canAssignStaffRoles, firstAccessiblePath, isRouteVisibleInNavigation, roleDataKeys, routeAccess, type AppRoutePath, type BackOfficeDataKey } from "./access";
import { canMarkDeliveryReady, canMarkNotificationSent, canMarkTwoDayNoticeSent, canReleaseDelivery, deliveryCreateBlockReason, deliveryDocumentCategories, filterDeliverySchedules, markDeliveryReady, markNotificationSent, markTwoDayNoticeSent, type DeliveryFilters } from "./delivery";
import { filterLoanApplications, loanCreateBlockReason, loanDocumentCategories, markLoanApproved, markLoanDone, type LoanFilters } from "./loan";
import {
  activeLeadCountByVehicle,
  filterLeadsForTriage,
  findCustomerForLead,
  groupLeadsByVehicle,
  leadSourceSummary,
  leadVehicleLabel,
  sortLeadsByHotCarDemand,
  type LeadVehicleGroup,
  type LeadLinkFilter
} from "./leads";
import { customerCreateBlockReason, ownerCreateBlockReason } from "./contacts";
import { filterRefurbishmentRecords, isRepairCostFinal, repairCreateBlockReason, repairDocumentCategories, supplierInvoiceAgingStatus, supplierInvoiceCreateBlockReason, type RefurbishmentFilters, type RefurbishmentRecord } from "./repairs";
import { filterStaffUsers, staffCreateBlockReason, staffPasswordResetBlockReason, staffUpdateBlockReason, type StaffStatusFilter } from "./staff";
import { dashboardMetricTarget, dashboardReminderTarget, filterDashboardReminders, financeRiskTarget, reminderDueLabel, reminderDueTagColor, safeDashboardStockSummary, type ReminderDueFilter } from "./dashboard";
import { FinancePage } from "./modules/finance/FinancePage";
import { Customer360Page } from "./modules/customers/Customer360Page";
import { HrSalaryPage as HrSalaryModulePage } from "./modules/hr/HrSalaryPage";
import { VehicleCatalogSettings } from "./modules/settings/VehicleCatalogSettings";
import { DocumentUploadChecklist } from "./modules/shared/DocumentUploadChecklist";
import { OcrUploadReview, type OcrReviewValues } from "./modules/shared/OcrUploadReview";
import { VehiclePage } from "./modules/vehicles/VehiclePage";
import {
  checkInHrAttendance,
  checkOutHrAttendance,
  acceptCashHandover,
  approvePaymentManagementReview,
  approveRepair,
  createCashHandover,
  createHrLeaveAdjustment,
  createHrLeaveRequest,
  createHrPayPeriod,
  createCustomer,
  createBrokerCommission,
  createDailySpend,
  createDebtRecovery,
  createDelivery,
  createLoan,
  createOwner,
  createPayment,
  createPaymentVoucher,
  createPurchaseInvoice,
  createRepair,
  createSettlementReminder,
  createStaffUser,
  createSupplierInvoice,
  createVehicle,
  customerFromLead,
  customerSelectLabel,
  decideHrLeaveRequest,
  exportPaymentsCsv,
  generateHrPayslips,
  getAuditLog,
  getCurrentUser,
  getCustomers,
  getBrokerCommissions,
  getCashHandovers,
  getCashHandoverPaymentLookup,
  getDailySpends,
  getDashboard,
  getDebtRecoveries,
  getDashboardReminders,
  getDeliveryReleaseReadiness,
  getDeliveries,
  getHrAttendance,
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
  getSettlementReminders,
  getStaffUsers,
  getSupplierInvoices,
  getVehicleDocuments,
  getVehicleLookup,
  getVehicleOcrJobs,
  getVehicles,
  humanizeApiError,
  login,
  logout,
  resetStaffUserPassword,
  recordCashHandover,
  rejectCashHandover,
  requestCashHandover,
  hrMedicalCertificateContentUrl,
  updateHrLeaveBalance,
  updateHrLeavePolicy,
  updateHrPayrollProfile,
  updateDelivery,
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
  updatePurchaseInvoice,
  updateRepair,
  updateSettlementReminder,
  updateStaffUser,
  updateStaffUserRoles,
  updateStaffUserStatus,
  updateSupplierInvoice,
  updateVehicle,
  uploadHrMedicalCertificate,
  uploadVehicleDocument,
  uploadVehiclePhoto,
  vehicleDocumentContentUrl,
  type AuditLog,
  type AuditLogFilters,
  type AiUsageLimitSnapshot,
  type BrokerCommission,
  type CashHandover,
  type CashHandoverPaymentLookup,
  type CreateStaffUserRequest,
  type CurrentUser,
  type Customer,
  type DailySpend,
  type DashboardReminder,
  type DashboardReminderFilters,
  type DashboardSummary,
  type DebtRecoveryCase,
  type DeliveryEvidenceItem,
  type DeliverySchedule,
  type DeliveryReleaseReadiness,
  type DocumentCategory,
  type HrAttendanceRecord,
  type HrLeaveAdjustment,
  type HrLeaveBalance,
  type HrLeavePolicy,
  type HrLeaveRequest,
  type HrLeaveStatus,
  type HrPayPeriod,
  type HrPayrollProfile,
  type HrPayslip,
  type Lead,
  type LoanApplication,
  type LoanDocumentCheck,
  type PaymentRecord,
  type PaymentVoucher,
  type Owner,
  type PurchaseInvoice,
  type RepairJob,
  type ResetStaffPasswordRequest,
  type SettlementReminder,
  type StaffRole,
  type StaffUser,
  type SupplierInvoice,
  type UpdateStaffUserRequest,
  type UpdateStaffUserStatusRequest,
  type UpdateAiServiceLimitRequest,
  type Vehicle,
  type VehicleLookup,
  type VehicleDocument,
  type VehicleOcrJob
} from "./api";

const staffRoles: StaffRole[] = assignableStaffRoles;

const dashboardReminderTypes: DashboardReminder["type"][] = [
  "LoanFollowUp",
  "DeliveryPreparation",
  "SettlementDue",
  "PaymentBankFollowUp",
  "PaymentStatusFollowUp",
  "DailySpendDue",
  "DebtRecoveryFollowUp",
  "PaymentVoucherFollowUp"
];

const deliveryChecklistFields = [
  "inspectionDone",
  "documentsPrepared",
  "polishDone",
  "tintedDone",
  "washDone",
  "insuranceHandled",
  "roadTaxHandled",
  "windscreenInsuranceHandled",
  "notificationSent",
  "twoDayNoticeSent",
  "handoverPhotoCaptured",
  "signedHandoverReceived",
  "customerAcknowledged",
  "finalChecklistConfirmed"
] as const;

type DeliveryChecklistField = (typeof deliveryChecklistFields)[number];

const deliveryFieldLabels: Record<DeliveryChecklistField, string> = {
  inspectionDone: "Inspection Done / 正式检查",
  documentsPrepared: "Documents Prepared / 准备文件",
  polishDone: "Polish Done / 抛光",
  tintedDone: "Tinted Done / 隔热膜",
  washDone: "Wash Done / 洗车",
  insuranceHandled: "Insurance Handled / 保险",
  roadTaxHandled: "Road Tax Handled / 路税",
  windscreenInsuranceHandled: "Windscreen Insurance / 挡风玻璃保险",
  notificationSent: "Customer Notified / 已通知客户",
  twoDayNoticeSent: "2-day Notice Sent / 提前2天通知",
  handoverPhotoCaptured: "Handover Photo",
  signedHandoverReceived: "Signed Handover",
  customerAcknowledged: "Customer Acknowledged",
  finalChecklistConfirmed: "Final Checklist"
};

const deliveryPreparationChecklist: DeliveryChecklistField[] = [
  "inspectionDone",
  "documentsPrepared",
  "polishDone",
  "tintedDone",
  "washDone",
  "insuranceHandled",
  "roadTaxHandled",
  "windscreenInsuranceHandled"
];

const deliveryNotificationChecklist: DeliveryChecklistField[] = [
  "notificationSent",
  "twoDayNoticeSent",
  "handoverPhotoCaptured",
  "signedHandoverReceived",
  "customerAcknowledged",
  "finalChecklistConfirmed"
];

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
    showSizeChanger: true,
    pageSizeOptions: ["5", "8", "10", "20", "50"],
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} / 共 ${total} 条`
  };
}

const mobileWorkflowPageSize = 8;

function Table<RecordType extends object>({ columns, dataSource, pagination, ...props }: TableProps<RecordType>) {
  const tableColumns = useMemo(
    () => ensureColumnFilters(columns, dataSource),
    [columns, dataSource]
  );

  return (
    <AntTable
      {...props}
      columns={tableColumns}
      dataSource={dataSource}
      pagination={pagination ?? tablePagination()}
    />
  );
}

export default function App() {
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const [pathname, setPathname] = useState(() => normalizeRoutePath(window.location.pathname));
  const [routeUrl, setRouteUrl] = useState(() => browserRouteUrl(window.location));
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [reminders, setReminders] = useState<DashboardReminder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [repairs, setRepairs] = useState<RepairJob[]>([]);
  const [loans, setLoans] = useState<LoanApplication[]>([]);
  const [deliveries, setDeliveries] = useState<DeliverySchedule[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [cashHandovers, setCashHandovers] = useState<CashHandover[]>([]);
  const [cashHandoverPaymentLookup, setCashHandoverPaymentLookup] = useState<CashHandoverPaymentLookup[]>([]);
  const [settlements, setSettlements] = useState<SettlementReminder[]>([]);
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
  const [hrLeaveRequests, setHrLeaveRequests] = useState<HrLeaveRequest[]>([]);
  const [hrLeaveBalances, setHrLeaveBalances] = useState<HrLeaveBalance[]>([]);
  const [hrLeavePolicies, setHrLeavePolicies] = useState<HrLeavePolicy[]>([]);
  const [hrLeaveAdjustments, setHrLeaveAdjustments] = useState<HrLeaveAdjustment[]>([]);
  const [hrPayrollProfiles, setHrPayrollProfiles] = useState<HrPayrollProfile[]>([]);
  const [hrPayPeriods, setHrPayPeriods] = useState<HrPayPeriod[]>([]);
  const [hrPayslips, setHrPayslips] = useState<HrPayslip[]>([]);
  const [vehicleLookup, setVehicleLookup] = useState<VehicleLookup[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [logoutSucceeded, setLogoutSucceeded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const currentRoles = useMemo(() => currentUser?.roles ?? [], [currentUser?.roles]);

  const loadBackOfficeData = useCallback(async (roles?: string[]) => {
    const allowed = new Set(backOfficeDataKeysForRoles(roles));
    const canLoad = (key: BackOfficeDataKey) => allowed.has(key);
    const [
      dashboardData,
      reminderData,
      vehicleData,
      vehicleLookupData,
      customerData,
      ownerData,
      purchaseInvoiceData,
      supplierInvoiceData,
      repairData,
      loanData,
      deliveryData,
      paymentData,
      cashHandoverData,
      cashHandoverPaymentLookupData,
      settlementData,
      dailySpendData,
      brokerCommissionData,
      debtRecoveryData,
      paymentVoucherData,
      leadData,
      auditData,
      staffUserData,
      hrStaffUserData,
      hrAttendanceData,
      hrLeaveRequestData,
      hrLeaveBalanceData,
      hrLeavePolicyData,
      hrLeaveAdjustmentData,
      hrPayrollProfileData,
      hrPayPeriodData,
      hrPayslipData
    ] = await Promise.all([
      canLoad("dashboard") ? getDashboard() : Promise.resolve(null),
      canLoad("reminders") ? getDashboardReminders() : Promise.resolve([]),
      canLoad("vehicles") ? getVehicles() : Promise.resolve([]),
      canLoad("vehicleLookup") ? getVehicleLookup() : Promise.resolve([]),
      canLoad("customers") ? getCustomers() : Promise.resolve([]),
      canLoad("owners") ? getOwners() : Promise.resolve([]),
      canLoad("purchaseInvoices") ? getPurchaseInvoices() : Promise.resolve([]),
      canLoad("supplierInvoices") ? getSupplierInvoices() : Promise.resolve([]),
      canLoad("repairs") ? getRepairs() : Promise.resolve([]),
      canLoad("loans") ? getLoans() : Promise.resolve([]),
      canLoad("deliveries") ? getDeliveries() : Promise.resolve([]),
      canLoad("payments") ? getPayments() : Promise.resolve([]),
      canLoad("cashHandovers") ? getCashHandovers() : Promise.resolve([]),
      canLoad("cashHandoverPaymentLookup") ? getCashHandoverPaymentLookup() : Promise.resolve([]),
      canLoad("settlements") ? getSettlementReminders() : Promise.resolve([]),
      canLoad("dailySpends") ? getDailySpends() : Promise.resolve([]),
      canLoad("brokerCommissions") ? getBrokerCommissions() : Promise.resolve([]),
      canLoad("debtRecoveries") ? getDebtRecoveries() : Promise.resolve([]),
      canLoad("paymentVouchers") ? getPaymentVouchers() : Promise.resolve([]),
      canLoad("leads") ? getLeads() : Promise.resolve([]),
      canLoad("auditLog") ? getAuditLog() : Promise.resolve([]),
      canLoad("staffUsers") ? getStaffUsers() : Promise.resolve([]),
      canLoad("hrStaffUsers") ? getHrStaffUsers() : Promise.resolve([]),
      canLoad("hrAttendance") ? getHrAttendance() : Promise.resolve([]),
      canLoad("hrLeaveRequests") ? getHrLeaveRequests() : Promise.resolve([]),
      canLoad("hrLeaveBalances") ? getHrLeaveBalances() : Promise.resolve([]),
      canLoad("hrLeavePolicies") ? getHrLeavePolicies() : Promise.resolve([]),
      canLoad("hrLeaveAdjustments") ? getHrLeaveAdjustments() : Promise.resolve([]),
      canLoad("hrPayrollProfiles") ? getHrPayrollProfiles() : Promise.resolve([]),
      canLoad("hrPayPeriods") ? getHrPayPeriods() : Promise.resolve([]),
      canLoad("hrPayslips") ? getHrPayslips() : Promise.resolve([])
    ]);
    setDashboard(dashboardData);
    setReminders(reminderData);
    setVehicles(vehicleData);
    setVehicleLookup(vehicleLookupData);
    setCustomers(customerData);
    setOwners(ownerData);
    setPurchaseInvoices(purchaseInvoiceData);
    setSupplierInvoices(supplierInvoiceData);
    setRepairs(repairData);
    setLoans(loanData);
    setDeliveries(deliveryData);
    setPayments(paymentData);
    setCashHandovers(cashHandoverData);
    setCashHandoverPaymentLookup(cashHandoverPaymentLookupData);
    setSettlements(settlementData);
    setDailySpends(dailySpendData);
    setBrokerCommissions(brokerCommissionData);
    setDebtRecoveries(debtRecoveryData);
    setPaymentVouchers(paymentVoucherData);
    setLeads(leadData);
    setAuditLog(auditData);
    setStaffUsers(staffUserData);
    setHrStaffUsers(hrStaffUserData);
    setHrAttendance(hrAttendanceData);
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

  const route = useMemo(() => ({
    path: "/",
    routes: allRoutes
      .filter((item) => isRouteVisibleInNavigation(item.path))
      .filter((item) => !currentUser?.isAuthenticated || canAccessRoute(currentRoles, item.path))
      .map((item) => ({ ...item, name: routeDisplayName(item.path, currentRoles) }))
  }), [currentUser?.isAuthenticated, currentRoles]);
  const pageTitle = routeDisplayName(pathname, currentRoles);
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
    setAuditLogFilters(filters);
    const records = await getAuditLog(filters);
    setAuditLog(records);
    notifySuccess("Audit log filtered", `${records.length} records loaded`);
  }

  async function handleReminderSearch(filters: DashboardReminderFilters) {
    const records = await getDashboardReminders(filters);
    setReminders(records);
  }

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
          />
          {pathname === "/dashboard" && <DashboardPage dashboard={dashboard} reminders={reminders} vehicles={vehicles} onSearch={handleReminderSearch} onNavigate={navigateTo} />}
          {pathname === "/vehicles" && (
            <VehiclePage
              vehicles={vehicles}
              leads={leads}
              loans={loans}
              customers={customers}
              owners={owners}
              purchaseInvoices={purchaseInvoices}
              canApproveVehicles={canApproveVehicles(currentRoles)}
              onCreate={(vehicle) => runCreate(() => createVehicle(vehicle), (record) => setVehicles((items) => [record, ...items]), "Vehicle created")}
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
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Vehicle document uploaded")}
            />
          )}
          {pathname === "/repairs" && (
            <RepairPage
              vehicles={vehicleLookup}
              supplierInvoices={supplierInvoices}
              repairs={repairs}
              canApproveRepairs={currentRoles.includes("BossAdmin")}
              onCreateInvoice={(invoice) => runCreate(() => createSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => [record, ...items]), "Supplier invoice created")}
              onUpdateInvoice={(invoice) => runUpdate(() => updateSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => replaceById(items, record)), "Supplier invoice updated")}
              onCreateRepair={(repair) => runCreate(() => createRepair(repair), (record) => setRepairs((items) => [record, ...items]), "Repair task created")}
              onUpdateRepair={(repair) => runUpdate(() => updateRepair(repair), (record) => setRepairs((items) => replaceById(items, record)), "Repair task updated")}
              onApproveRepair={(repairId, notes) => runUpdate(() => approveRepair(repairId, notes), (record) => setRepairs((items) => replaceById(items, record)), "Repair approved")}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Repair document uploaded")}
            />
          )}
          {pathname === "/loans" && (
            <LoanPage
              vehicles={vehicleLookup}
              customers={customers}
              loans={loans}
              initialLoanId={loanIdFromRouteUrl(routeUrl)}
              onBackToList={() => navigateTo("/loans")}
              onCreate={(loan) => runCreate(() => createLoan(loan), (record) => setLoans((items) => [record, ...items]), "Loan submitted")}
              onUpdate={(loan) => runUpdate(() => updateLoan(loan), (record) => setLoans((items) => replaceById(items, record)), "Loan updated")}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Loan document uploaded")}
            />
          )}
          {pathname === "/delivery" && (
            <DeliveryPage
              vehicles={vehicleLookup}
              deliveries={deliveries}
              onCreate={(delivery) => runCreate(() => createDelivery(delivery), (record) => setDeliveries((items) => [record, ...items]), "Delivery scheduled")}
              onUpdate={(delivery) => runUpdate(() => updateDelivery(delivery), (record) => setDeliveries((items) => replaceById(items, record)), "Delivery updated")}
              onOpenCustomer={(customerId) => navigateTo(`/customer-360?customerId=${customerId}`)}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Delivery document uploaded")}
            />
          )}
          {pathname === "/finance" && (
            <FinancePage
              vehicles={vehicleLookup}
              customers={customers}
              owners={owners}
              payments={payments}
              settlements={settlements}
              dailySpends={dailySpends}
              brokerCommissions={brokerCommissions}
              debtRecoveries={debtRecoveries}
              paymentVouchers={paymentVouchers}
              currentUser={currentUser}
              cashHandovers={cashHandovers}
              cashHandoverPaymentLookup={cashHandoverPaymentLookup}
              onCreate={(payment) => runCreate(() => createPayment(payment), (record) => setPayments((items) => [record, ...items]), "Payment record created")}
              onUpdate={(payment) => runUpdate(() => updatePayment(payment), (record) => setPayments((items) => replaceById(items, record)), "Payment updated")}
              onApproveManagementReview={(paymentId) => runUpdate(() => approvePaymentManagementReview(paymentId), (record) => setPayments((items) => replaceById(items, record)), "Management review approved")}
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
              onExportPayments={() => exportPaymentsCsv()}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Finance document uploaded")}
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
              leaveRequests={hrLeaveRequests}
              leaveBalances={hrLeaveBalances}
              leavePolicies={hrLeavePolicies}
              leaveAdjustments={hrLeaveAdjustments}
              payrollProfiles={hrPayrollProfiles}
              payPeriods={hrPayPeriods}
              payslips={hrPayslips}
              onCheckIn={() => runUpdate(() => checkInHrAttendance(), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Attendance checked in")}
              onCheckOut={() => runUpdate(() => checkOutHrAttendance(), (record) => setHrAttendance((items) => replaceByIdOrPrepend(items, record)), "Attendance checked out")}
              onCreateLeave={(leave) => runCreate(() => createHrLeaveRequest(leave), (record) => setHrLeaveRequests((items) => [record, ...items]), "Leave request submitted")}
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
  hrPayslips
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
    <section className="moduleCommandBar">
      <div>
        <span className="moduleEyebrow">YS Heng Operations</span>
        <h1>{title}</h1>
        <div className="moduleRoles">
          {(roles.length > 0 ? roles : ["Guest"]).map((role) => <Tag key={role}>{displayRoleLabel(role)}</Tag>)}
        </div>
      </div>
      <div className="moduleStats">
        {stats.map((stat) => (
          <span key={stat.label}>
            <strong>{stat.value}</strong>
            {stat.label}
          </span>
        ))}
      </div>
    </section>
  );
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
  const pendingDeliveries = data.deliveries.filter((delivery) => delivery.status !== "Released").length;
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
      return [
        { label: "scheduled", value: data.deliveries.length },
        { label: "open", value: pendingDeliveries },
        { label: "release due", value: data.reminders.filter((reminder) => reminder.type === "DeliveryPreparation").length }
      ];
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

function ModuleDocumentList({
  vehicleId,
  categories,
  repairJobId,
  paymentRecordId,
  reloadKey = 0
}: {
  vehicleId?: string;
  categories: readonly DocumentCategory[];
  repairJobId?: string;
  paymentRecordId?: string;
  reloadKey?: number;
}) {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [ocrJobs, setOcrJobs] = useState<VehicleOcrJob[]>([]);

  useEffect(() => {
    let active = true;
    if (!vehicleId) {
      setDocuments([]);
      setOcrJobs([]);
      return () => {
        active = false;
      };
    }

    void Promise.all([getVehicleDocuments(vehicleId), getVehicleOcrJobs(vehicleId)]).then(([documentItems, ocrItems]) => {
      if (active) {
        const matchingDocuments = documentItems.filter((document) =>
          categories.includes(document.category) &&
          (!repairJobId || document.repairJobId === repairJobId) &&
          (!paymentRecordId || document.paymentRecordId === paymentRecordId)
        );
        const matchingDocumentIds = new Set(matchingDocuments.map((document) => document.id));
        setDocuments(matchingDocuments);
        setOcrJobs(ocrItems.filter((job) => matchingDocumentIds.has(job.document.id)));
      }
    });

    return () => {
      active = false;
    };
  }, [categories, paymentRecordId, reloadKey, repairJobId, vehicleId]);

  const columns: ColumnsType<VehicleDocument> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "Type / 类型",
      dataIndex: "category",
      filters: tableTextFilters(documents.map((document) => document.category)),
      onFilter: (value, row) => row.category === value
    },
    {
      title: "File / 文件",
      dataIndex: "fileName",
      filters: tableTextFilters(documents.map((document) => document.fileName)),
      filterSearch: true,
      onFilter: (value, row) => row.fileName === value
    },
    {
      title: "Uploaded By / 上传者",
      dataIndex: "uploadedBy",
      filters: tableTextFilters(documents.map((document) => document.uploadedBy || "System")),
      filterSearch: true,
      onFilter: (value, row) => (row.uploadedBy || "System") === value,
      render: (value) => value || "-"
    },
    {
      title: "Open / 查看",
      fixed: "right",
      width: 100,
      render: (_, row) => vehicleId ? (
        <Button size="small" icon={<DownloadOutlined />} href={vehicleDocumentContentUrl(vehicleId, row.id)} target="_blank">
          Open
        </Button>
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
      width: 120,
      render: (_, row) => <Tag color={row.status === "NeedsReview" ? "green" : "orange"}>{row.status}</Tag>
    }
  ];

  return (
    <Space direction="vertical" size={12} className="fullWidth">
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={documents}
        pagination={tablePagination(5)}
        scroll={{ x: 760 }}
        locale={{ emptyText: vehicleId ? "No uploaded documents for this selected record." : "Select a record to view uploaded documents." }}
      />
      <Table
        rowKey="id"
        size="small"
        columns={ocrColumns}
        dataSource={ocrJobs}
        pagination={tablePagination(5)}
        scroll={{ x: 760 }}
        locale={{ emptyText: vehicleId ? "No OCR results for these documents yet." : "Select a record to view OCR results." }}
      />
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
    fields.amount || fields.nettPrice ? `RM ${fields.amount || fields.nettPrice}` : undefined
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "-";
}

function DashboardPage({ dashboard, reminders, vehicles, onSearch, onNavigate }: { dashboard: DashboardSummary | null; reminders: DashboardReminder[]; vehicles: Vehicle[]; onSearch: (filters: DashboardReminderFilters) => Promise<void>; onNavigate: (path: string) => void }) {
  const [reminderTypeFilter, setReminderTypeFilter] = useState<DashboardReminder["type"] | "All">("All");
  const [reminderDueFilter, setReminderDueFilter] = useState<ReminderDueFilter>("All");
  const safeStock = safeDashboardStockSummary(vehicles);
  const agingBuckets = dashboard?.agingBuckets ?? [];
  const moneyRiskBreakdown = dashboard?.moneyRiskBreakdown ?? [];
  const riskTotal = moneyRiskBreakdown.reduce((sum, item) => sum + Math.max(item.amount, 0), 0);
  const profitValue = dashboard?.totalProfit ?? dashboard?.estimatedProfit ?? 0;
  const filteredReminders = filterDashboardReminders(reminders, { type: reminderTypeFilter, due: reminderDueFilter });
  const urgentReminderCount = reminders.filter((reminder) => {
    const dueLabel = reminderDueLabel(reminder.dueDate);
    return dueLabel === "Overdue" || dueLabel === "Due today";
  }).length;
  const reminderFiltersActive = reminderTypeFilter !== "All" || reminderDueFilter !== "All";
  const resetReminderFilters = () => {
    setReminderTypeFilter("All");
    setReminderDueFilter("All");
    void onSearch({});
  };

  return (
    <Space direction="vertical" size={16} className="fullWidth dashboardPage">
      {dashboard ? <>
        <ProCard
          title="Operations dashboard / 运营看板"
          className="dashboardOverviewCard"
          extra={<Tag color={urgentReminderCount > 0 ? "red" : "green"}>{urgentReminderCount} due now</Tag>}
        >
          <Typography.Text type="secondary">Simple daily view for stock, money, profit, and reminders.</Typography.Text>
          <div className="metricGrid dashboardMetricGrid">
            <Metric label="Total Stock / 总库存" value={dashboard.totalStock} onClick={() => onNavigate(dashboardMetricTarget("stock"))} />
            <Metric label="Pending Loan / 贷款待跟进" value={dashboard.pendingLoan} tone={dashboard.pendingLoan > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("loans"))} />
            <Metric label="Outstanding / 未收款" value={formatCompactMoney(dashboard.outstandingPayment)} tone={dashboard.outstandingPayment > 0 ? "risk" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("payments"))} />
            <Metric label="Settlement Due / 结算到期" value={dashboard.settlementDue} tone={dashboard.settlementDue > 0 ? "risk" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("settlements"))} />
            <Metric label="Profit / 利润" value={formatCompactMoney(profitValue)} tone={profitValue >= 0 ? "profit" : "risk"} onClick={() => onNavigate(dashboardMetricTarget("profit"))} />
            <Metric label="Aging / 超60天库存" value={dashboard.vehicleAging} tone={dashboard.vehicleAging > 0 ? "work" : "neutral"} onClick={() => onNavigate(dashboardMetricTarget("aging"))} />
          </div>
        </ProCard>

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
          <ProCard title="Money follow-up / 金额跟进" className="dashboardSimpleCard" extra={<Tag color={riskTotal > 0 ? "volcano" : "green"}>{formatCompactMoney(riskTotal)}</Tag>}>
          <Table
            rowKey="label"
            size="small"
            columns={[
              { title: "Item / 项目", dataIndex: "label", render: dashboardLabel },
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
          </div>
        </ProCard>
      )}

      <ProCard
        title="Reminder inbox / 提醒事项"
        className="dashboardReminderCard"
        extra={<Tag color={urgentReminderCount > 0 ? "red" : "blue"}>{reminderFiltersActive ? `${filteredReminders.length} matching` : `${filteredReminders.length} reminder${filteredReminders.length === 1 ? "" : "s"}`}</Tag>}
      >
        <div className="dashboardInboxHeader">
          <Space className="toolbarForm" wrap>
            <Select
              value={reminderTypeFilter}
              options={[{ value: "All", label: "All Types / 全部类型" }, ...dashboardReminderTypes.map((type) => ({ value: type, label: dashboardLabel(type) }))]}
              onChange={(value) => {
                setReminderTypeFilter(value);
                void onSearch({ type: value, due: reminderDueFilter });
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
                void onSearch({ type: reminderTypeFilter, due: value });
              }}
              style={{ width: 160 }}
            />
            {reminderFiltersActive && <Button size="small" onClick={resetReminderFilters}>Clear filters</Button>}
          </Space>
          <Typography.Text type="secondary">{urgentReminderCount} overdue or due today across all reminders.</Typography.Text>
        </div>
        <Table
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
    </Space>
  );
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
  New: "New / 新询问",
  Contacted: "Contacted / 已联系",
  Closed: "Closed / 已成交",
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

function reminderColor(type: DashboardReminder["type"]) {
  if (type === "SettlementDue") return "red";
  if (type === "LoanFollowUp") return "orange";
  if (type === "PaymentBankFollowUp") return "purple";
  if (type === "PaymentStatusFollowUp") return "geekblue";
  if (type === "DailySpendDue") return "cyan";
  if (type === "DebtRecoveryFollowUp") return "magenta";
  if (type === "PaymentVoucherFollowUp") return "volcano";
  return "blue";
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
  return `RM ${Math.round(value).toLocaleString()}`;
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}m`;
  if (absolute >= 10_000) return `RM ${Math.round(value / 1000).toLocaleString()}k`;
  return formatMoney(value);
}


function RepairPage({
  vehicles,
  supplierInvoices,
  repairs,
  canApproveRepairs,
  onCreateInvoice,
  onUpdateInvoice,
  onCreateRepair,
  onUpdateRepair,
  onApproveRepair,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  supplierInvoices: SupplierInvoice[];
  repairs: RepairJob[];
  canApproveRepairs: boolean;
  onCreateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onUpdateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onCreateRepair: (repair: RepairJob) => Promise<void>;
  onUpdateRepair: (repair: RepairJob) => Promise<void>;
  onApproveRepair: (repairId: string, notes?: string) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadRepairId, setUploadRepairId] = useState("");
  const [editSupplierInvoiceId, setEditSupplierInvoiceId] = useState(supplierInvoices[0]?.id ?? "");
  const [editRepairId, setEditRepairId] = useState(repairs[0]?.id ?? "");
  const [supplierInvoiceEditorOpen, setSupplierInvoiceEditorOpen] = useState(false);
  const [repairEditorOpen, setRepairEditorOpen] = useState(false);
  const [repairCreateOpen, setRepairCreateOpen] = useState(false);
  const [supplierInvoiceOcrDraft, setSupplierInvoiceOcrDraft] = useState<OcrReviewValues | null>(null);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [repairDocuments, setRepairDocuments] = useState<VehicleDocument[]>([]);
  const [refurbishmentFilters, setRefurbishmentFilters] = useState<RefurbishmentFilters>({});
  const [mobileRefurbishmentPage, setMobileRefurbishmentPage] = useState(1);
  const selectedRepair = repairs.find((repair) => repair.id === uploadRepairId);
  const selectedSupplierInvoice = supplierInvoices.find((invoice) => invoice.id === editSupplierInvoiceId) ?? supplierInvoices[0];
  const selectedEditRepair = repairs.find((repair) => repair.id === editRepairId) ?? repairs[0];
  const vehicleOptions = vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }));

  useEffect(() => {
    if (!editSupplierInvoiceId && supplierInvoices[0]?.id) {
      setEditSupplierInvoiceId(supplierInvoices[0].id);
    }
  }, [editSupplierInvoiceId, supplierInvoices]);

  useEffect(() => {
    if (!editRepairId && repairs[0]?.id) {
      setEditRepairId(repairs[0].id);
    }
  }, [editRepairId, repairs]);

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
    setSupplierInvoiceEditorOpen(true);
  };

  const selectRepair = (repairId: string) => {
    setEditRepairId(repairId);
    setRepairEditorOpen(true);
  };

  const pendingRepairs = repairs.filter((repair) => !repair.checklistDone).length;
  const repairTotal = repairs.filter(isRepairCostFinal).reduce((sum, repair) => sum + repair.cost, 0);
  const showRepairCompletionConfirmation = (repair: RepairJob, onConfirm: () => Promise<void> | void) => {
    Modal.confirm({
      title: "Mark repair done? / 确认完成整备？",
      content: (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, repair.vehicleId)}</Descriptions.Item>
          <Descriptions.Item label="Repair Task / 整备事项">{repair.whatToDo}</Descriptions.Item>
          <Descriptions.Item label="Cost / 费用">RM {repair.cost.toLocaleString()}</Descriptions.Item>
        </Descriptions>
      ),
      okText: "Mark Done",
      cancelText: "Keep Pending",
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
          <Descriptions.Item label="Repair Task / 整备事项">{repair.whatToDo}</Descriptions.Item>
          <Descriptions.Item label="Cost / 费用">RM {repair.cost.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Approval">Your signed-in account will be recorded as the approver.</Descriptions.Item>
        </Descriptions>
      ),
      okText: "Approve Repair",
      cancelText: "Cancel",
      onOk: () => onApproveRepair(repair.id, repair.approvalNotes)
    });
  };
  const refurbishmentRecordCount = repairs.length + supplierInvoices.length;
  const refurbishmentRecords = filterRefurbishmentRecords(repairs, supplierInvoices, vehicles, refurbishmentFilters);
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
  const refurbishmentColumns: ColumnsType<RefurbishmentRecord> = [
    {
      title: "Type / 类型",
      width: 150,
      render: (_, row) => row.kind === "repair" ? <Tag color="blue">Repair Task</Tag> : <Tag color="purple">Supplier Invoice</Tag>
    },
    {
      title: "Car Plate / 车牌",
      render: (_, row) => plateFor(vehicles, row.kind === "repair" ? row.repair.vehicleId : row.invoice.vehicleId)
    },
    {
      title: "Record / 记录",
      render: (_, row) => row.kind === "repair"
        ? (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.repair.repairPart || "Repair task"}</Typography.Text>
            <Typography.Text type="secondary">{row.repair.whatToDo}</Typography.Text>
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
      render: (_, row) => `RM ${(row.kind === "repair" ? row.repair.cost : row.invoice.amount).toLocaleString()}`
    },
    {
      title: "Status / 状态",
      render: (_, row) => {
        if (row.kind === "repair") {
          return (
            <Space wrap size={4}>
              <Tag color={row.repair.checklistDone ? "green" : "orange"}>{row.repair.checklistDone ? "Done" : "Pending"}</Tag>
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
              <Button size="small" type="primary" onClick={() => setUploadRepairId(row.repair.id)}>Details</Button>
              {canApproveRepairs && row.repair.approvalStatus !== "Approved" && <Button size="small" onClick={() => confirmRepairApproval(row.repair)}>Approve</Button>}
              <Button size="small" onClick={() => confirmRepairCompletion(row.repair)} disabled={row.repair.checklistDone || !isRepairCostFinal(row.repair)}>Mark Done</Button>
            </>
          ) : (
            <Button size="small" type="primary" onClick={() => selectSupplierInvoice(row.invoice.id)}>Details</Button>
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
            <Descriptions.Item label="Repair Part / 配件">{selectedRepair.repairPart || "-"}</Descriptions.Item>
            <Descriptions.Item label="Cost / 费用">RM {selectedRepair.cost.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Checklist / 检查表">
              <Tag color={selectedRepair.checklistDone ? "green" : "orange"}>{selectedRepair.checklistDone ? "Done" : "Pending"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Approval / 审批">
              <Tag color={selectedRepair.approvalStatus === "Rejected" ? "red" : selectedRepair.approvalStatus === "Pending" ? "gold" : "blue"}>{selectedRepair.approvalStatus ?? "Approved"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Approved By / 审批人">{selectedRepair.approvedBy || "Not approved"}</Descriptions.Item>
            <Descriptions.Item label="Approved At / 审批时间">{selectedRepair.approvedAt ? new Date(selectedRepair.approvedAt).toLocaleString() : "-"}</Descriptions.Item>
            <Descriptions.Item label="What To Do / 整备事项">{selectedRepair.whatToDo}</Descriptions.Item>
          </Descriptions>
          {canApproveRepairs && selectedRepair.approvalStatus !== "Approved" && <Button type="primary" onClick={() => confirmRepairApproval(selectedRepair)}>Approve Repair</Button>}
        </ProCard>
        <ProCard title="Repair Record / 整备资料">
          <Form
            key={`${selectedRepair.id}-repair-record`}
            layout="vertical"
            className="formGrid"
            initialValues={{ ...selectedRepair, checklistDone: selectedRepair.checklistDone ? "done" : "pending" }}
            onFinish={async (values) => {
              const repair: RepairJob = {
                ...selectedRepair,
                vehicleId: values.vehicleId,
                repairPart: values.repairPart,
                whatToDo: values.whatToDo,
                cost: Number(values.cost ?? 0),
                checklistDone: values.checklistDone === "done"
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
            <Form.Item name="id" label="Selected Repair">
              <Select options={repairs.map((repair) => ({ value: repair.id, label: `${plateFor(vehicles, repair.vehicleId)} / ${repair.whatToDo}` }))} onChange={setUploadRepairId} />
            </Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="repairPart" label="Repair Part / 配件"><Input placeholder="Spare part / bumper / tyre" /></Form.Item>
            <Form.Item name="whatToDo" label="What To Do" rules={[{ required: true }]}><Input placeholder="Polish, wash, spare part..." /></Form.Item>
            <Form.Item name="cost" label="Cost"><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="checklistDone" label="Checklist"><Select options={[{ value: "done", label: "Done" }, { value: "pending", label: "Pending" }]} /></Form.Item>
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
                      uploadOwner={{ repairJobId: selectedRepair.id }}
                      buttonLabel={isPresent ? "Upload another repair invoice" : "Upload repair invoice"}
                      applyLabel="Use details in supplier invoice"
                      fields={[
                        { name: "vehicleId", label: "Car Plate", type: "select", options: vehicleOptions },
                        { name: "supplierName", label: "Supplier" },
                        { name: "invoiceNumber", label: "Invoice" },
                        { name: "plateNumberOnInvoice", label: "Plate on Supplier Invoice" },
                        { name: "amount", label: "Amount", type: "number" }
                      ]}
                      onUploaded={() => setDocumentReloadKey((value) => value + 1)}
                      onApply={(values) => {
                        setSupplierInvoiceOcrDraft(values);
                        setRepairCreateOpen(true);
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
          </Space>
        </ProCard>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="metricGrid">
        <Metric label="Repair Tasks / 整备事项" value={repairs.length} />
        <Metric label="Pending Checklist / 未完成检查" value={pendingRepairs} />
        <Metric label="Repair Cost / 整备费用" value={`RM ${repairTotal.toLocaleString()}`} />
      </div>
      <ProCard
        id="repair-supplier-card"
        title="Supplier & Refurbishment / 供应商与整备"
        extra={<Space wrap><Tag color="blue">{refurbishmentRecordCount} records</Tag><Button type="primary" onClick={() => setRepairCreateOpen(true)}>New Repair</Button></Space>}
      >
        <Space className="toolbarForm workflowFilterBar" wrap>
          <Input.Search
            allowClear
            placeholder="Search plate, task, supplier, or invoice"
            value={refurbishmentFilters.keyword}
            onChange={(event) => updateRefurbishmentFilters({ keyword: event.target.value })}
            style={{ width: 280 }}
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
              { value: "Open", label: "Open / pending" },
              { value: "Done", label: "Done / paid" }
            ]}
            style={{ width: 170 }}
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
                    <Typography.Text className="mobileRecordEyebrow">{isRepair ? "Repair Task" : "Supplier Invoice"}</Typography.Text>
                    <Typography.Title level={5}>{plateFor(vehicles, isRepair ? record.repair.vehicleId : record.invoice.vehicleId)}</Typography.Title>
                  </div>
                  {isRepair ? <Tag color="blue">Repair Task</Tag> : <Tag color={status?.color}>{status?.label}</Tag>}
                </div>
                <div className="mobileRecordMeta">
                  <span>
                    <small>{isRepair ? "Repair Part" : "Supplier"}</small>
                    <strong>{isRepair ? record.repair.repairPart || "-" : record.invoice.supplierName}</strong>
                  </span>
                  <span>
                    <small>Amount / 金额</small>
                    <strong>RM {(isRepair ? record.repair.cost : record.invoice.amount).toLocaleString()}</strong>
                  </span>
                </div>
                <div className="mobileRecordSection">
                  <Typography.Text className="mobileRecordLabel">{isRepair ? "What To Do / 整备事项" : "Invoice / 单据"}</Typography.Text>
                  <div className="mobileRecordTextBlock">
                    {isRepair ? (
                      <span>{record.repair.whatToDo}</span>
                    ) : (
                      <>
                        <span>Invoice No: {record.invoice.invoiceNumber}</span>
                        <span>Plate on invoice: {record.invoice.plateNumberOnInvoice || "Not entered"}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="mobileRecordFooter">
                  <Space className="tableActionGroup" wrap size={6}>
                    {isRepair ? (
                      <>
                        <Button size="small" type="primary" onClick={() => setUploadRepairId(record.repair.id)}>Details</Button>
                        {canApproveRepairs && record.repair.approvalStatus !== "Approved" && <Button size="small" onClick={() => confirmRepairApproval(record.repair)}>Approve</Button>}
                        <Button size="small" onClick={() => confirmRepairCompletion(record.repair)} disabled={record.repair.checklistDone || !isRepairCostFinal(record.repair)}>Mark Done</Button>
                      </>
                    ) : (
                      <Button size="small" type="primary" onClick={() => selectSupplierInvoice(record.invoice.id)}>Details</Button>
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
        <Table className="desktopDataTable" rowKey="key" columns={refurbishmentColumns} dataSource={refurbishmentRecords} pagination={{ ...tablePagination(8), current: clampedMobileRefurbishmentPage, onChange: setMobileRefurbishmentPage }} scroll={{ x: 820 }} locale={{ emptyText: refurbishmentEmptyText }} />
      </ProCard>
      <Drawer
        title="Supplier Invoice Details / 供应商发票详情"
        width={560}
        open={supplierInvoiceEditorOpen}
        onClose={() => setSupplierInvoiceEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedSupplierInvoice?.id ?? "supplier-invoice-edit-drawer"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedSupplierInvoice}
          onFinish={async (values) => {
            if (!selectedSupplierInvoice) return;
            const invoice: SupplierInvoice = {
              ...selectedSupplierInvoice,
              vehicleId: values.vehicleId,
              supplierName: values.supplierName,
              invoiceNumber: values.invoiceNumber,
              plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined,
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
            setSupplierInvoiceEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Selected Supplier Invoice"><Select options={supplierInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.supplierName} / ${invoice.invoiceNumber}` }))} onChange={selectSupplierInvoice} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="supplierName" label="Supplier" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="plateNumberOnInvoice" label="Plate on Supplier Invoice / 发票车牌"><Input placeholder="Plate number printed on supplier invoice" /></Form.Item>
          <Form.Item name="amount" label="Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="dueDate" label="Due Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="paidAt" label="Paid Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedSupplierInvoice}>Update Supplier Invoice</Button></Form.Item>
        </Form>
      </Drawer>
      <Modal
        title="New Repair Task / 新增整备事项"
        width={760}
        open={repairCreateOpen}
        onCancel={() => {
          setRepairCreateOpen(false);
          setSupplierInvoiceOcrDraft(null);
        }}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm formGrid" onFinish={async (values) => {
          const invoice: SupplierInvoice = {
            id: newId(),
            vehicleId: values.vehicleId,
            supplierName: values.supplierName,
            invoiceNumber: values.invoiceNumber,
            plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined,
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
            repairPart: values.repairPart,
            whatToDo: values.whatToDo,
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
            setSupplierInvoiceOcrDraft(null);
            setRepairCreateOpen(false);
          };

          if (repair.checklistDone) {
            showRepairCompletionConfirmation(repair, saveRepair);
            return;
          }

          await saveRepair();
        }} initialValues={{ vehicleId: supplierInvoiceOcrDraft?.vehicleId ?? vehicles[0]?.id, checklistDone: "pending", ...supplierInvoiceOcrDraft }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="supplierName" label="Supplier" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="plateNumberOnInvoice" label="Plate on Supplier Invoice / 发票车牌"><Input placeholder="Plate number printed on supplier invoice" /></Form.Item>
          <Form.Item name="amount" label="Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="dueDate" label="Invoice Due Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="paidAt" label="Paid Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="repairPart" label="Repair Part / 配件"><Input placeholder="Spare part / bumper / tyre" /></Form.Item>
          <Form.Item name="whatToDo" label="What To Do"><Input placeholder="Polish, wash, spare part..." /></Form.Item>
          <Form.Item name="checklistDone" label="Checklist"><Select options={[{ value: "done", label: "Done" }, { value: "pending", label: "Pending" }]} /></Form.Item>
          <Alert type="info" showIcon message="New repair tasks start as Pending. Boss/Admin approval is recorded separately after the task and cost are checked." />
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Repair</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Edit Repair Task / 修改整备事项"
        width={560}
        open={repairEditorOpen}
        onClose={() => setRepairEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedEditRepair?.id ?? "repair-edit"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedEditRepair ? { ...selectedEditRepair, checklistDone: selectedEditRepair.checklistDone ? "done" : "pending" } : undefined}
          onFinish={async (values) => {
            if (!selectedEditRepair) return;
            const repair: RepairJob = {
              ...selectedEditRepair,
              vehicleId: values.vehicleId,
              repairPart: values.repairPart,
              whatToDo: values.whatToDo,
              cost: Number(values.cost ?? 0),
              checklistDone: values.checklistDone === "done"
            };
            const repairBlockReason = repairCreateBlockReason(repair);
            if (repairBlockReason) {
              message.warning(repairBlockReason);
              return;
            }

            if (!selectedEditRepair.checklistDone && repair.checklistDone) {
              confirmRepairCompletion(repair, () => setRepairEditorOpen(false));
              return;
            }

            await onUpdateRepair(repair);
            setRepairEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Edit Repair"><Select options={repairs.map((repair) => ({ value: repair.id, label: `${plateFor(vehicles, repair.vehicleId)} / ${repair.whatToDo}` }))} onChange={selectRepair} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="repairPart" label="Repair Part / 配件"><Input placeholder="Spare part / bumper / tyre" /></Form.Item>
          <Form.Item name="whatToDo" label="What To Do"><Input placeholder="Polish, wash, spare part..." /></Form.Item>
          <Form.Item name="cost" label="Cost"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="checklistDone" label="Checklist"><Select options={[{ value: "done", label: "Done" }, { value: "pending", label: "Pending" }]} /></Form.Item>
          <Descriptions size="small" column={1} className="fullWidth">
            <Descriptions.Item label="Approval / 审批">{selectedEditRepair?.approvalStatus ?? "Pending"}</Descriptions.Item>
            <Descriptions.Item label="Approval note / 审批备注">{selectedEditRepair?.approvalNotes || "-"}</Descriptions.Item>
          </Descriptions>
          {canApproveRepairs && selectedEditRepair && selectedEditRepair.approvalStatus !== "Approved" && <Button onClick={() => confirmRepairApproval(selectedEditRepair)}>Approve Repair</Button>}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditRepair}>Update Repair</Button></Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}

function LoanPage({
  vehicles,
  customers,
  loans,
  initialLoanId,
  onBackToList,
  onCreate,
  onUpdate,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  customers: Customer[];
  loans: LoanApplication[];
  initialLoanId?: string;
  onBackToList: () => void;
  onCreate: (loan: LoanApplication) => void;
  onUpdate: (loan: LoanApplication) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [documentChecks, setDocumentChecks] = useState<Record<string, LoanDocumentCheck>>({});
  const [uploadLoanId, setUploadLoanId] = useState(initialLoanId ?? "");
  const [editLoanId, setEditLoanId] = useState(loans[0]?.id ?? "");
  const [loanEditorOpen, setLoanEditorOpen] = useState(false);
  const [loanCreateOpen, setLoanCreateOpen] = useState(false);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [loanFilters, setLoanFilters] = useState<LoanFilters>({});
  const [mobileLoanPage, setMobileLoanPage] = useState(1);
  const selectedLoan: LoanApplication | undefined = loans.find((loan) => loan.id === uploadLoanId);
  const selectedEditLoan = loans.find((loan) => loan.id === editLoanId) ?? loans[0];
  const loanIds = useMemo(() => loans.map((loan) => loan.id).join(","), [loans]);
  const filteredLoans = filterLoanApplications(loans, vehicles, customers, documentChecks, loanFilters);
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

  useEffect(() => {
    if (!editLoanId && loans[0]?.id) {
      setEditLoanId(loans[0].id);
    }
  }, [editLoanId, loans]);

  const selectLoan = (loanId: string) => {
    setEditLoanId(loanId);
    setLoanEditorOpen(true);
  };

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

    if (!loan.louApproved) {
      return <Button size="small" type="primary" onClick={() => onUpdate(markLoanApproved(loan))}>Approve</Button>;
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

  const columns: ColumnsType<LoanApplication> = [
    {
      title: "Car Plate / 车牌",
      dataIndex: "vehicleId",
      width: 150,
      filters: tableTextFilters(loans.map((loan) => plateFor(vehicles, loan.vehicleId))),
      filterSearch: true,
      onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === String(value),
      render: (vehicleId) => plateFor(vehicles, vehicleId)
    },
    {
      title: "Customer / 客户",
      dataIndex: "customerId",
      width: 240,
      filters: tableTextFilters(loans.map((loan) => contactFor(customers, loan.customerId))),
      filterSearch: true,
      onFilter: (value, row) => contactFor(customers, row.customerId) === String(value),
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
    const uploadLoanDocument = (category: DocumentCategory, option: Parameters<NonNullable<React.ComponentProps<typeof Upload>["customRequest"]>>[0]) => {
      void onUploadDocument(selectedLoan.vehicleId, option.file as File, category)
        .then(() => {
          setDocumentReloadKey((value) => value + 1);
          option.onSuccess?.({ ok: true });
        })
        .catch((error) => option.onError?.(error));
    };
    return (
      <Space direction="vertical" size={16} className="fullWidth">
        <Button onClick={() => { setUploadLoanId(""); onBackToList(); }}>Back to Loan List</Button>
        <ProCard title={`Loan Details / 贷款详情 - ${plateFor(vehicles, selectedLoan.vehicleId)}`}>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, selectedLoan.vehicleId)}</Descriptions.Item>
            <Descriptions.Item label="Customer / 客户">{contactFor(customers, selectedLoan.customerId)}</Descriptions.Item>
            <Descriptions.Item label="Status / 状态"><Tag color={selectedLoan.status === "Pending" ? "orange" : "green"}>{selectedLoan.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Submitted / 提交">{selectedLoan.submittedAt}</Descriptions.Item>
            <Descriptions.Item label="LOU Approve">{selectedLoan.louApproved ? "Yes" : "No"}</Descriptions.Item>
            <Descriptions.Item label="LOU Done">{selectedLoan.louDone ? "Yes" : "No"}</Descriptions.Item>
            <Descriptions.Item label="Document Check / 文件检查">
              {check?.isComplete ? <Tag color="green">Complete</Tag> : <Tag color="red">Incomplete</Tag>}
            </Descriptions.Item>
          </Descriptions>
          {check && check.missingCategories.length > 0 && (
            <Space wrap className="detailTagRow">
              {check.missingCategories.map((category) => <Tag color="red" key={category}>Missing {documentCategoryLabel(category)}</Tag>)}
            </Space>
          )}
        </ProCard>
        <ProCard title="Loan Record / 贷款资料">
          <Form
            key={`${selectedLoan.id}-loan-record`}
            layout="vertical"
            className="formGrid"
            initialValues={selectedLoan}
            onFinish={(values) => {
              const loan: LoanApplication = {
                ...selectedLoan,
                vehicleId: values.vehicleId,
                customerId: values.customerId,
                status: values.status,
                louApproved: values.louApproved,
                louDone: values.louDone,
                submittedAt: values.submittedAt
              };
              const blockReason = loanCreateBlockReason(loan);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }

              if (selectedLoan.status !== "Done" && loan.status === "Done") {
                const completionBlockReason = loanCompletionBlockReason(selectedLoan.id);
                if (completionBlockReason) {
                  message.warning(completionBlockReason);
                  return;
                }
              }

              onUpdate(loan);
            }}
          >
            <Form.Item name="id" label="Selected Loan"><Select options={loans.map((loan) => ({ value: loan.id, label: `${plateFor(vehicles, loan.vehicleId)} / ${loan.status}` }))} onChange={setUploadLoanId} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select customer"
                options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
              />
            </Form.Item>
            <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected", "Done"].map((value) => ({ value, disabled: value === "Done" && !check?.isComplete }))} /></Form.Item>
            <Form.Item name="submittedAt" label="Submitted Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
            <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Update Loan</Button></Form.Item>
          </Form>
        </ProCard>
        <ProCard title="Loan Documents / 贷款文件">
          <Space direction="vertical" size={12} className="fullWidth">
            <DocumentUploadChecklist
              title="Required document checklist / 必需文件清单"
              description="Add files as they arrive. All four are required before loan follow-up can be completed."
              items={loanDocumentCategories.map((category) => {
                const isPresent = !missingLoanDocuments.includes(category);
                return {
                  label: documentCategoryLabel(category),
                  isPresent,
                  action: (
                    <Upload showUploadList={false} customRequest={(option) => uploadLoanDocument(category, option)}>
                      <Button type="primary" size="small" icon={<UploadOutlined />}>{isPresent ? `Upload another ${documentCategoryLabel(category)}` : `Upload ${documentCategoryLabel(category)}`}</Button>
                    </Upload>
                  )
                };
              })}
            />
            {!check?.isComplete && (
              <Alert
                type="warning"
                showIcon
                message={`${missingLoanDocuments.length} document${missingLoanDocuments.length === 1 ? "" : "s"} still needed before completion`}
                description="Uploads remain optional while preparing the loan."
              />
            )}
            <Typography.Text strong>Uploaded files / 已上传文件</Typography.Text>
            <ModuleDocumentList
              vehicleId={selectedLoan.vehicleId}
              categories={loanDocumentCategories}
              reloadKey={documentReloadKey}
            />
          </Space>
        </ProCard>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard
        title="Loan Workflow / 贷款流程"
        extra={<Space wrap><Tag color="blue">{loans.length} loans</Tag><Tag color={loans.some((loan) => loan.status === "Pending") ? "orange" : "default"}>{loans.filter((loan) => loan.status === "Pending").length} pending</Tag><Button type="primary" onClick={() => setLoanCreateOpen(true)}>New Loan</Button></Space>}
      >
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
              setLoanFilters({});
              setMobileLoanPage(1);
            }}
          >
            Clear filters
          </Button>}
        </Space>
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
                    <Typography.Title level={5}>{plateFor(vehicles, loan.vehicleId)}</Typography.Title>
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
        <Table className="desktopDataTable loanWorkflowTable" rowKey="id" columns={columns} dataSource={filteredLoans} pagination={{ ...tablePagination(8), current: clampedMobileLoanPage, onChange: setMobileLoanPage }} scroll={{ x: "max-content" }} locale={{ emptyText: loanEmptyText }} />
      </ProCard>
      <Modal
        title="Submit Loan / 提交贷款"
        width={680}
        open={loanCreateOpen}
        onCancel={() => setLoanCreateOpen(false)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm" onFinish={(values) => {
          const loan: LoanApplication = {
            id: newId(),
            vehicleId: values.vehicleId,
            customerId: values.customerId,
            status: values.status,
            louApproved: values.louApproved,
            louDone: values.louDone,
            submittedAt: values.submittedAt
          };
          const blockReason = loanCreateBlockReason(loan);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(loan);
          setLoanCreateOpen(false);
        }} initialValues={{ vehicleId: vehicles[0]?.id, customerId: customers[0]?.id, status: "Pending", louApproved: false, louDone: false, submittedAt: today() }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select customer"
              options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="submittedAt" label="Submitted Date" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Submit Loan</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Edit Loan / 修改贷款"
        width={560}
        open={loanEditorOpen}
        onClose={() => setLoanEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedEditLoan?.id ?? "loan-edit"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedEditLoan}
          onFinish={(values) => {
            if (!selectedEditLoan) return;
            const loan: LoanApplication = {
              ...selectedEditLoan,
              vehicleId: values.vehicleId,
              customerId: values.customerId,
              status: values.status,
              louApproved: values.louApproved,
              louDone: values.louDone,
              submittedAt: values.submittedAt
            };
            const blockReason = loanCreateBlockReason(loan);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            if (selectedEditLoan.status !== "Done" && loan.status === "Done") {
              const completionBlockReason = loanCompletionBlockReason(selectedEditLoan.id);
              if (completionBlockReason) {
                message.warning(completionBlockReason);
                return;
              }
            }

            onUpdate(loan);
            setLoanEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Edit Loan"><Select options={loans.map((loan) => ({ value: loan.id, label: `${plateFor(vehicles, loan.vehicleId)} / ${loan.status}` }))} onChange={selectLoan} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select customer"
              options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected", "Done"].map((value) => ({ value, disabled: value === "Done" && !documentChecks[selectedEditLoan?.id ?? ""]?.isComplete }))} /></Form.Item>
          <Form.Item name="submittedAt" label="Submitted Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditLoan}>Update Loan</Button></Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}

function DeliveryPage({
  vehicles,
  deliveries,
  onCreate,
  onUpdate,
  onOpenCustomer,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  deliveries: DeliverySchedule[];
  onCreate: (delivery: DeliverySchedule) => void;
  onUpdate: (delivery: DeliverySchedule) => void;
  onOpenCustomer: (customerId: string) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [releaseReadiness, setReleaseReadiness] = useState<Record<string, DeliveryReleaseReadiness>>({});
  const [uploadDeliveryId, setUploadDeliveryId] = useState("");
  const [editDeliveryId, setEditDeliveryId] = useState(deliveries[0]?.id ?? "");
  const [deliveryEditorOpen, setDeliveryEditorOpen] = useState(false);
  const [deliveryCreateOpen, setDeliveryCreateOpen] = useState(false);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [deliveryFilters, setDeliveryFilters] = useState<DeliveryFilters>({});
  const [mobileDeliveryPage, setMobileDeliveryPage] = useState(1);
  const selectedDelivery: DeliverySchedule | undefined = deliveries.find((delivery) => delivery.id === uploadDeliveryId);
  const selectedEditDelivery: DeliverySchedule | undefined = deliveries.find((delivery) => delivery.id === editDeliveryId) ?? deliveries[0];
  const selectedDeliveryReadiness = selectedDelivery
    ? releaseReadiness[selectedDelivery.id]
    : selectedEditDelivery
      ? releaseReadiness[selectedEditDelivery.id]
      : undefined;
  const eligibleDeliveryVehicles = vehicles.filter((vehicle) => Boolean(vehicle.customerId));
  const customerIdForVehicle = (vehicleId: string) => vehicles.find((vehicle) => vehicle.id === vehicleId)?.customerId;
  const filteredDeliveries = filterDeliverySchedules(deliveries, vehicles, releaseReadiness, deliveryFilters);
  const deliveryFiltersActive = Object.values(deliveryFilters).some((value) => value !== undefined && value !== "" && value !== "All");
  const mobileDeliveryPageCount = Math.max(1, Math.ceil(filteredDeliveries.length / mobileWorkflowPageSize));
  const clampedMobileDeliveryPage = Math.min(mobileDeliveryPage, mobileDeliveryPageCount);
  const mobileDeliveries = filteredDeliveries.slice(
    (clampedMobileDeliveryPage - 1) * mobileWorkflowPageSize,
    clampedMobileDeliveryPage * mobileWorkflowPageSize
  );
  const updateDeliveryFilters = (next: Partial<DeliveryFilters>) => {
    setDeliveryFilters((current) => ({ ...current, ...next }));
    setMobileDeliveryPage(1);
  };
  const deliveryEmptyText = deliveries.length > 0 ? "No deliveries match the current filters." : "No delivery records yet.";

  useEffect(() => {
    let active = true;
    if (deliveries.length === 0) {
      setReleaseReadiness({});
      return () => {
        active = false;
      };
    }

    void Promise.all(deliveries.map(async (delivery) => [delivery.id, await getDeliveryReleaseReadiness(delivery.id)] as const))
      .then((items) => {
        if (active) setReleaseReadiness(Object.fromEntries(items));
      });

    return () => {
      active = false;
    };
  }, [deliveries, documentReloadKey]);

  useEffect(() => {
    if (!editDeliveryId && deliveries[0]?.id) {
      setEditDeliveryId(deliveries[0].id);
    }
  }, [editDeliveryId, deliveries]);

  const selectDeliveryRecord = (deliveryId: string) => {
    setUploadDeliveryId(deliveryId);
    setEditDeliveryId(deliveryId);
  };

  const selectDelivery = (deliveryId: string) => {
    setEditDeliveryId(deliveryId);
    setDeliveryEditorOpen(true);
  };

  const tableHeader = (label: string, secondary: string) => (
    <span className="tableHeaderStack">
      <span>{label}</span>
      <span>{secondary}</span>
    </span>
  );

  const deliveryStatusLabel = (status: DeliverySchedule["status"]) => ({
    BookingInspection: "Booking inspection",
    Scheduled: "Scheduled",
    Inspection: "Inspection",
    PreparingDocuments: "Preparing docs",
    CarPreparation: "Car prep",
    ReadyForRelease: "Ready",
    Released: "Released"
  })[status] ?? status;

  const deliveryStatusColor = (status: DeliverySchedule["status"]) => ({
    BookingInspection: "blue",
    Scheduled: "gold",
    Inspection: "cyan",
    PreparingDocuments: "purple",
    CarPreparation: "geekblue",
    ReadyForRelease: "green",
    Released: "default"
  })[status] ?? "default";

  const deliveryActionDisabledReason = (row: DeliverySchedule) => {
    const readiness = releaseReadiness[row.id];
    const missingDocuments = readiness?.missingCategories ?? [];
    const missingEvidence = readiness?.missingEvidence ?? [];
    const expiredDocuments = readiness?.expiredDocuments ?? [];
    if (missingDocuments.length > 0) {
      return `Missing ${missingDocuments.map(documentCategoryLabel).join(", ")}`;
    }
    if (missingEvidence.length > 0) {
      return `Missing ${missingEvidence.join(", ")}`;
    }
    if (expiredDocuments.length > 0) {
      return expiredDocuments.join(", ");
    }
    if (!canMarkDeliveryReady(row) && !canReleaseDelivery(row)) {
      return "Finish the previous delivery steps first.";
    }
    return "";
  };

  const confirmDeliveryRelease = (
    delivery: DeliverySchedule,
    readiness: DeliveryReleaseReadiness | undefined,
    onConfirm: () => Promise<void> | void
  ) => {
    Modal.confirm({
      title: "Release vehicle? / 确认交车？",
      content: (
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, delivery.vehicleId)}</Descriptions.Item>
          <Descriptions.Item label="PIC">{delivery.pic}</Descriptions.Item>
          <Descriptions.Item label="Scheduled Date / 日期">{delivery.scheduledDate}</Descriptions.Item>
          <Descriptions.Item label="Release Check">{readiness?.isReady ?? canReleaseDelivery(delivery) ? "All prerequisites complete" : "Prerequisites need review"}</Descriptions.Item>
        </Descriptions>
      ),
      okText: "Release Vehicle",
      cancelText: "Keep Ready",
      onOk: onConfirm
    });
  };

  const renderNextDeliveryAction = (row: DeliverySchedule) => {
    const readiness = releaseReadiness[row.id];
    const missingDocuments = readiness?.missingCategories ?? [];
    const missingEvidence = readiness?.missingEvidence ?? [];
    const expiredDocuments = readiness?.expiredDocuments ?? [];
    const blocksReleaseStep = missingDocuments.length > 0 || missingEvidence.length > 0 || expiredDocuments.length > 0;
    const blockedReason = deliveryActionDisabledReason(row);

    if (canMarkNotificationSent(row)) {
      return <Button type="primary" size="small" onClick={() => onUpdate(markNotificationSent(row))}>Notify</Button>;
    }
    if (canMarkTwoDayNoticeSent(row)) {
      return <Button type="primary" size="small" onClick={() => onUpdate(markTwoDayNoticeSent(row))}>Notice</Button>;
    }
    if (canMarkDeliveryReady(row)) {
      return (
        <Tooltip title={blocksReleaseStep ? blockedReason : ""}>
          <Button
            type="primary"
            size="small"
            onClick={() => onUpdate(markDeliveryReady(row))}
            disabled={blocksReleaseStep || !canMarkDeliveryReady(row)}
          >
            Ready
          </Button>
        </Tooltip>
      );
    }
    if (row.status === "ReadyForRelease") {
      return (
        <Tooltip title={blocksReleaseStep ? blockedReason : ""}>
          <Button
            type="primary"
            size="small"
            onClick={() => confirmDeliveryRelease(row, readiness, () => onUpdate({ ...row, status: "Released" }))}
            disabled={blocksReleaseStep || !canReleaseDelivery(row)}
          >
            Release
          </Button>
        </Tooltip>
      );
    }
    if (row.status === "Released") {
      return <Tag color="default">Done</Tag>;
    }
    return null;
  };

  const columns: ColumnsType<DeliverySchedule> = [
    {
      title: tableHeader("Car Plate", "车牌"),
      dataIndex: "vehicleId",
      width: 116,
      filters: tableTextFilters(deliveries.map((delivery) => plateFor(vehicles, delivery.vehicleId))),
      filterSearch: true,
      onFilter: (value, row) => plateFor(vehicles, row.vehicleId) === String(value),
      render: (vehicleId) => <Typography.Text strong className="nowrapText">{plateFor(vehicles, vehicleId)}</Typography.Text>
    },
    {
      title: shortformLabel("PIC", "Person in charge"),
      dataIndex: "pic",
      width: 154,
      ellipsis: true,
      render: (pic) => <Typography.Text ellipsis={{ tooltip: pic }} className="deliveryTableText">{pic}</Typography.Text>
    },
    {
      title: tableHeader("Schedule", "时间"),
      dataIndex: "scheduledDate",
      width: 122,
      render: (value) => <span className="nowrapText">{value}</span>
    },
    {
      title: tableHeader("Status", "状态"),
      dataIndex: "status",
      width: 146,
      render: (status: DeliverySchedule["status"]) => <Tag color={deliveryStatusColor(status)}>{deliveryStatusLabel(status)}</Tag>
    },
    {
      title: tableHeader("Notify", "通知"),
      dataIndex: "notificationSent",
      width: 96,
      render: (sent) => <Badge status={sent ? "success" : "warning"} text={sent ? "Sent" : "Pending"} />
    },
    {
      title: tableHeader("Release Ready", "可出车"),
      width: 190,
      render: (_, row) => {
        const readiness = releaseReadiness[row.id];
        const ready = readiness?.isReady ?? isDeliveryReady(row);
        const missingCategories = readiness?.missingCategories ?? [];
        const missingEvidence = readiness?.missingEvidence ?? [];
        const expiredDocuments = readiness?.expiredDocuments ?? [];
        const missingLabel = missingCategories.map(documentCategoryLabel).join(", ");
        return (
          <Space direction="vertical" size={3} className="deliveryReadinessCell">
            <Tag color={ready ? "green" : "red"}>{ready ? "Ready" : "Blocked"}</Tag>
            {missingCategories.length > 0 && (
              <Tooltip title={missingLabel}>
                <Typography.Text type="danger" className="deliveryTableText">
                  {missingCategories.length} missing
                </Typography.Text>
              </Tooltip>
            )}
            {missingEvidence.length > 0 && <Typography.Text type="danger" className="deliveryTableText">{missingEvidence.length} evidence</Typography.Text>}
            {expiredDocuments.length > 0 && <Typography.Text type="danger" className="deliveryTableText">{expiredDocuments.length} expired</Typography.Text>}
          </Space>
        );
      }
    },
    {
      title: tableHeader("Next Action", "操作"),
      fixed: "right",
      width: 240,
      render: (_, row) => {
        const customerId = customerIdForVehicle(row.vehicleId);
        return (
          <Space className="tableActionGroup deliveryActionCell" wrap size={6}>
            <Button size="small" type="primary" onClick={() => selectDeliveryRecord(row.id)}>Details</Button>
            <Button size="small" disabled={!customerId} onClick={() => customerId && onOpenCustomer(customerId)}>Customer 360</Button>
            {renderNextDeliveryAction(row) ?? <Typography.Text type="secondary">No workflow action</Typography.Text>}
          </Space>
        );
      }
    }
  ];

  if (selectedDelivery) {
    const missingDeliveryDocuments = selectedDeliveryReadiness?.missingCategories ?? deliveryDocumentCategories;
    return (
      <Space direction="vertical" size={16} className="fullWidth">
        <Button onClick={() => setUploadDeliveryId("")}>Back to Delivery List</Button>
        <ProCard title={`Delivery Details / 出车详情 - ${plateFor(vehicles, selectedDelivery.vehicleId)}`}>
          <Descriptions size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Car Plate / 车牌">{plateFor(vehicles, selectedDelivery.vehicleId)}</Descriptions.Item>
            <Descriptions.Item label={shortformLabel("PIC", "Person in charge")}>{selectedDelivery.pic}</Descriptions.Item>
            <Descriptions.Item label="Schedule / 时间">{selectedDelivery.scheduledDate}</Descriptions.Item>
            <Descriptions.Item label="Status / 状态">{selectedDelivery.status}</Descriptions.Item>
            <Descriptions.Item label="Ready / 可出车">
              <Tag color={selectedDeliveryReadiness?.isReady ?? isDeliveryReady(selectedDelivery) ? "green" : "red"}>
                {selectedDeliveryReadiness?.isReady ?? isDeliveryReady(selectedDelivery) ? "Ready for release" : "Blocked"}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </ProCard>
        <ProCard title="Delivery Record / 出车资料">
          <Form
            key={`${selectedDelivery.id}-delivery-record`}
            layout="vertical"
            className="formGrid"
            initialValues={selectedDelivery}
            onFinish={(values) => {
              const delivery: DeliverySchedule = {
                ...selectedDelivery,
                vehicleId: values.vehicleId,
                pic: values.pic,
                status: values.status,
                scheduledDate: values.scheduledDate,
                polishDone: values.polishDone,
                tintedDone: values.tintedDone,
                washDone: values.washDone,
                documentsPrepared: values.documentsPrepared,
                inspectionDone: values.inspectionDone,
                inspectionBookingReference: values.inspectionBookingReference?.trim() || undefined,
                inspectionReportReference: values.inspectionReportReference?.trim() || undefined,
                notificationSent: values.notificationSent,
                twoDayNoticeSent: values.twoDayNoticeSent,
                insuranceHandled: values.insuranceHandled,
                insurancePolicyReference: values.insurancePolicyReference?.trim() || undefined,
                insuranceExpiryDate: values.insuranceExpiryDate?.trim() || undefined,
                roadTaxHandled: values.roadTaxHandled,
                roadTaxReceiptReference: values.roadTaxReceiptReference?.trim() || undefined,
                roadTaxExpiryDate: values.roadTaxExpiryDate?.trim() || undefined,
                windscreenInsuranceHandled: values.windscreenInsuranceHandled,
                windscreenPolicyReference: values.windscreenPolicyReference?.trim() || undefined,
                windscreenInsuranceExpiryDate: values.windscreenInsuranceExpiryDate?.trim() || undefined,
                handoverPhotoCaptured: Boolean(values.handoverPhotoCaptured),
                signedHandoverReceived: Boolean(values.signedHandoverReceived),
                customerAcknowledged: Boolean(values.customerAcknowledged),
                finalChecklistConfirmed: Boolean(values.finalChecklistConfirmed)
              };
              const blockReason = deliveryCreateBlockReason(delivery);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }

              if (selectedDelivery.status !== "Released" && delivery.status === "Released") {
                confirmDeliveryRelease(delivery, selectedDeliveryReadiness, () => onUpdate(delivery));
                return;
              }

              onUpdate(delivery);
            }}
          >
            <Form.Item name="id" label="Selected Delivery">
              <Select
                showSearch
                optionFilterProp="label"
                options={deliveries.map((delivery) => ({ value: delivery.id, label: `${plateFor(vehicles, delivery.vehicleId)} / ${delivery.status}` }))}
                onChange={selectDeliveryRecord}
              />
            </Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select car plate" options={vehicles.filter((vehicle) => vehicle.customerId || vehicle.id === selectedDelivery.vehicleId).map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} />
            </Form.Item>
            <Form.Item name="pic" label={shortformLabel("PIC", "Person in charge")} rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="scheduledDate" label="Schedule Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status"><Select options={["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="inspectionBookingReference" label="Inspection Booking Reference / 验车预约编号"><Input placeholder="Booking slip no. or appointment reference" /></Form.Item>
            <Form.Item name="inspectionReportReference" label="Inspection Report Reference / 检查报告编号"><Input placeholder="Report no. or uploaded file reference" /></Form.Item>
            <Form.Item name="insurancePolicyReference" label="Insurance Policy Reference / 保险保单编号"><Input placeholder="Policy no. or cover note reference" /></Form.Item>
            <Form.Item name="insuranceExpiryDate" label="Insurance Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="roadTaxReceiptReference" label="Road Tax Receipt Reference / 路税收据编号"><Input placeholder="Road tax receipt no." /></Form.Item>
            <Form.Item name="roadTaxExpiryDate" label="Road Tax Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="windscreenPolicyReference" label="Windscreen Policy Reference / 挡风玻璃保单编号"><Input placeholder="Windscreen policy reference" /></Form.Item>
            <Form.Item name="windscreenInsuranceExpiryDate" label="Windscreen Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            {deliveryChecklistFields.map((field) => (
              <Form.Item key={field} name={field} label={deliveryFieldLabels[field]}><Select options={[{ value: true, label: "Done" }, { value: false, label: "Pending" }]} /></Form.Item>
            ))}
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Update Delivery</Button></Form.Item>
          </Form>
        </ProCard>
        <ProCard title="Delivery Documents / 出车文件">
          <Space direction="vertical" size={12} className="fullWidth">
            <DocumentUploadChecklist
              title="Required delivery documents / 必需出车文件"
              description="Add files as they arrive. Policy and Road Tax Receipt are required before the vehicle can be released."
              items={deliveryDocumentCategories.map((category) => {
                const isPresent = !missingDeliveryDocuments.includes(category);
                return {
                  label: documentCategoryLabel(category),
                  isPresent,
                  action: (
                    <Upload
                      showUploadList={false}
                      customRequest={(option) => {
                        void onUploadDocument(selectedDelivery.vehicleId, option.file as File, category)
                          .then(() => {
                            setDocumentReloadKey((value) => value + 1);
                            option.onSuccess?.({ ok: true });
                          })
                          .catch((error) => option.onError?.(error));
                      }}
                    >
                      <Button type="primary" size="small" icon={<UploadOutlined />}>{isPresent ? `Upload another ${documentCategoryLabel(category)}` : `Upload ${documentCategoryLabel(category)}`}</Button>
                    </Upload>
                  )
                };
              })}
            />
            {missingDeliveryDocuments.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${missingDeliveryDocuments.length} document${missingDeliveryDocuments.length === 1 ? "" : "s"} still needed before release`}
                description="Uploads remain optional while preparing the delivery."
              />
            )}
            {selectedDeliveryReadiness?.evidence.length ? (
              <AntTable<DeliveryEvidenceItem>
                size="small"
                rowKey="category"
                pagination={false}
                scroll={{ x: "max-content" }}
                dataSource={selectedDeliveryReadiness.evidence}
                columns={[
                  {
                    title: "Required Evidence / 必需文件",
                    dataIndex: "category",
                    render: (category: DocumentCategory) => documentCategoryLabel(category)
                  },
                  {
                    title: "Status / 状态",
                    dataIndex: "isPresent",
                    render: (isPresent: boolean) => <Tag color={isPresent ? "green" : "red"}>{isPresent ? "Uploaded" : "Missing"}</Tag>
                  },
                  {
                    title: "Latest File / 最新文件",
                    render: (_, item) => item.documentId ? (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        href={vehicleDocumentContentUrl(selectedDelivery.vehicleId, item.documentId)}
                        target="_blank"
                      >
                        {item.fileName || "Open file"}
                      </Button>
                    ) : <Typography.Text type="secondary">-</Typography.Text>
                  },
                  {
                    title: "Uploaded / 日期",
                    dataIndex: "uploadedAt",
                    render: (value?: string | null) => value ? String(value).slice(0, 10) : "-"
                  },
                  {
                    title: "Uploaded By / 上传者",
                    dataIndex: "uploadedBy",
                    render: (value?: string | null) => value || "-"
                  }
                ]}
              />
            ) : null}
            <ModuleDocumentList
              vehicleId={selectedDelivery.vehicleId}
              categories={deliveryDocumentCategories}
              reloadKey={documentReloadKey}
            />
          </Space>
        </ProCard>
        <ProCard title="Final Checklist / 最后核对">
          <Space direction="vertical" size={12} className="fullWidth">
            <Alert
              type="info"
              showIcon
              message="Update final release preparation here."
              description="Use this checklist to mark preparation work done from the detail page. Upload required Policy/Road Tax/Delivery documents above, then use Ready or Release from the Delivery Workflow table when readiness is complete."
            />
            <Space wrap>
              <Tag color="blue">{plateFor(vehicles, selectedDelivery.vehicleId)}</Tag>
              <Tag color={selectedDeliveryReadiness?.isReady ?? isDeliveryReady(selectedDelivery) ? "green" : "red"}>
                {selectedDeliveryReadiness?.isReady ?? isDeliveryReady(selectedDelivery) ? "Ready for release" : "Blocked"}
              </Tag>
              {selectedDeliveryReadiness?.missingCategories.map((category) => (
                <Tag color="red" key={category}>Missing {documentCategoryLabel(category)}</Tag>
              ))}
              {selectedDeliveryReadiness?.missingEvidence.map((item) => (
                <Tag color="red" key={item}>Missing {item}</Tag>
              ))}
              {selectedDeliveryReadiness?.expiredDocuments.map((item) => (
                <Tag color="volcano" key={item}>{item}</Tag>
              ))}
            </Space>
            <Form
              key={`${selectedDelivery.id}-final-checklist`}
              layout="vertical"
              className="deliveryChecklistForm"
              initialValues={deliveryChecklistFields.reduce((values, field) => ({ ...values, [field]: selectedDelivery[field] }), {})}
              onFinish={(values) => {
                const delivery: DeliverySchedule = {
                  ...selectedDelivery,
                  ...deliveryChecklistFields.reduce(
                    (updates, field) => ({ ...updates, [field]: Boolean(values[field]) }),
                    {} as Pick<DeliverySchedule, DeliveryChecklistField>
                  )
                };
                const blockReason = deliveryCreateBlockReason(delivery);
                if (blockReason) {
                  message.warning(blockReason);
                  return;
                }

                onUpdate(delivery);
              }}
            >
              <div className="deliveryChecklistSection">
                <div>
                  <Typography.Text className="mobileRecordLabel">Preparation / 出车准备</Typography.Text>
                  <div className="deliveryChecklistEditGrid">
                    {deliveryPreparationChecklist.map((field) => (
                      <Form.Item key={field} name={field} valuePropName="checked">
                        <Checkbox>{deliveryFieldLabels[field]}</Checkbox>
                      </Form.Item>
                    ))}
                  </div>
                </div>
                <div>
                  <Typography.Text className="mobileRecordLabel">Notification / 通知</Typography.Text>
                  <div className="deliveryChecklistEditGrid compact">
                    {deliveryNotificationChecklist.map((field) => (
                      <Form.Item key={field} name={field} valuePropName="checked">
                        <Checkbox>{deliveryFieldLabels[field]}</Checkbox>
                      </Form.Item>
                    ))}
                  </div>
                </div>
              </div>
              <div className="checklistReferenceGrid">
                {deliveryReferenceChecklist(selectedDelivery).map((item) => (
                  <div className="checkItem" key={item.label}><Badge status={item.done ? "success" : "error"} text={item.label} /></div>
                ))}
              </div>
              <Form.Item className="formActions">
                <Button type="primary" htmlType="submit">Save Checklist</Button>
              </Form.Item>
            </Form>
          </Space>
        </ProCard>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard
        title="Delivery Workflow / 出车流程"
        extra={<Space wrap><Tag color="blue">{deliveries.length} deliveries</Tag><Tag color={deliveries.some((delivery) => delivery.status !== "Released") ? "orange" : "default"}>{deliveries.filter((delivery) => delivery.status !== "Released").length} open</Tag><Button type="primary" disabled={eligibleDeliveryVehicles.length === 0} onClick={() => setDeliveryCreateOpen(true)}>New Delivery</Button></Space>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert
            type="info"
            showIcon
            message="Click Details to view delivery documents, edit the record, and update the final checklist."
          />
          {eligibleDeliveryVehicles.length === 0 && <Alert type="warning" showIcon message="Link a confirmed buyer to a vehicle before scheduling delivery." />}
          <Space className="toolbarForm workflowFilterBar" wrap>
            <Input.Search
              allowClear
              placeholder="Search plate, PIC, date, or status"
              value={deliveryFilters.keyword}
              onChange={(event) => updateDeliveryFilters({ keyword: event.target.value })}
              style={{ width: 280 }}
            />
            <Select
              value={deliveryFilters.status ?? "All"}
              onChange={(status) => updateDeliveryFilters({ status })}
              options={[
                { value: "All", label: "All statuses" },
                ...(["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"] as DeliverySchedule["status"][])
                  .map((value) => ({ value, label: deliveryStatusLabel(value) }))
              ]}
              style={{ width: 190 }}
            />
            <Select
              value={deliveryFilters.readiness ?? "All"}
              onChange={(readiness) => updateDeliveryFilters({ readiness })}
              options={[
                { value: "All", label: "All readiness" },
                { value: "Ready", label: "Release ready" },
                { value: "Blocked", label: "Blocked" }
              ]}
              style={{ width: 170 }}
            />
            <Tag color={deliveryFiltersActive ? "blue" : "default"}>{deliveryFiltersActive ? `${filteredDeliveries.length} of ${deliveries.length} matching` : `${deliveries.length} ${deliveries.length === 1 ? "delivery" : "deliveries"}`}</Tag>
            {deliveryFiltersActive && <Button
              size="small"
              onClick={() => {
                setDeliveryFilters({});
                setMobileDeliveryPage(1);
              }}
            >
              Clear filters
            </Button>}
          </Space>
          <div className="mobileRecordList">
            {filteredDeliveries.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={deliveryEmptyText} />}
            {mobileDeliveries.map((delivery) => {
              const readiness = releaseReadiness[delivery.id];
              const ready = readiness?.isReady ?? isDeliveryReady(delivery);
              const missingCategories = readiness?.missingCategories ?? [];
              const nextAction = renderNextDeliveryAction(delivery);
              return (
                <article className="mobileRecordCard" key={delivery.id}>
                  <div className="mobileRecordHeader">
                    <div>
                      <Typography.Text className="mobileRecordEyebrow">Car Plate / 车牌</Typography.Text>
                      <Typography.Title level={5}>{plateFor(vehicles, delivery.vehicleId)}</Typography.Title>
                    </div>
                    <Tag color={deliveryStatusColor(delivery.status)}>{deliveryStatusLabel(delivery.status)}</Tag>
                  </div>
                  <div className="mobileRecordMeta">
                    <span>
                      <small>{shortformLabel("PIC", "Person in charge")}</small>
                      <strong>{delivery.pic}</strong>
                    </span>
                    <span>
                      <small>Schedule / 时间</small>
                      <strong>{delivery.scheduledDate}</strong>
                    </span>
                  </div>
                  <div className="mobileRecordSection">
                    <Typography.Text className="mobileRecordLabel">Readiness / 可出车</Typography.Text>
                    <Space wrap size={6}>
                      <Tag color={ready ? "green" : "red"}>{ready ? "Ready" : "Blocked"}</Tag>
                      <Badge status={delivery.notificationSent ? "success" : "warning"} text={delivery.notificationSent ? "Notified" : "Notify pending"} />
                      {missingCategories.map((category) => (
                        <Tag color="red" key={category}>Missing {documentCategoryLabel(category)}</Tag>
                      ))}
                    </Space>
                  </div>
                  <div className="mobileRecordFooter">
                    <Space className="tableActionGroup" wrap size={6}>
                      <Button size="small" type="primary" onClick={() => selectDeliveryRecord(delivery.id)}>Details</Button>
                      {nextAction}
                    </Space>
                  </div>
                </article>
                );
              })}
            {filteredDeliveries.length > mobileWorkflowPageSize && (
              <Pagination
                current={clampedMobileDeliveryPage}
                pageSize={mobileWorkflowPageSize}
                total={filteredDeliveries.length}
                showSizeChanger={false}
                onChange={setMobileDeliveryPage}
              />
            )}
          </div>
          <Table
            rowKey="id"
            className="deliveryWorkflowTable desktopDataTable"
            columns={columns}
            dataSource={filteredDeliveries}
            pagination={{ ...tablePagination(8), current: clampedMobileDeliveryPage, onChange: setMobileDeliveryPage }}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: deliveryEmptyText }}
          />
        </Space>
      </ProCard>
      <Modal
        title="Schedule New Delivery / 新增出车安排"
        width={820}
        open={deliveryCreateOpen}
        onCancel={() => setDeliveryCreateOpen(false)}
        footer={null}
        destroyOnClose
        className="recordCreateModal"
      >
        <Form layout="vertical" className="modalForm formGrid" onFinish={(values) => {
          const delivery: DeliverySchedule = {
            id: newId(),
            vehicleId: values.vehicleId,
            pic: values.pic,
            status: values.status,
            scheduledDate: values.scheduledDate,
            polishDone: values.polishDone,
            tintedDone: values.tintedDone,
            washDone: values.washDone,
            documentsPrepared: values.documentsPrepared,
            inspectionDone: values.inspectionDone,
            inspectionBookingReference: values.inspectionBookingReference?.trim() || undefined,
            inspectionReportReference: values.inspectionReportReference?.trim() || undefined,
            notificationSent: values.notificationSent,
            twoDayNoticeSent: values.twoDayNoticeSent,
            insuranceHandled: values.insuranceHandled,
            insurancePolicyReference: values.insurancePolicyReference?.trim() || undefined,
            insuranceExpiryDate: values.insuranceExpiryDate?.trim() || undefined,
            roadTaxHandled: values.roadTaxHandled,
            roadTaxReceiptReference: values.roadTaxReceiptReference?.trim() || undefined,
            roadTaxExpiryDate: values.roadTaxExpiryDate?.trim() || undefined,
            windscreenInsuranceHandled: values.windscreenInsuranceHandled,
            windscreenPolicyReference: values.windscreenPolicyReference?.trim() || undefined,
            windscreenInsuranceExpiryDate: values.windscreenInsuranceExpiryDate?.trim() || undefined,
            handoverPhotoCaptured: Boolean(values.handoverPhotoCaptured),
            signedHandoverReceived: Boolean(values.signedHandoverReceived),
            customerAcknowledged: Boolean(values.customerAcknowledged),
            finalChecklistConfirmed: Boolean(values.finalChecklistConfirmed)
          };
          const blockReason = deliveryCreateBlockReason(delivery);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          if (delivery.status === "Released") {
            confirmDeliveryRelease(delivery, undefined, async () => {
              await onCreate(delivery);
              setDeliveryCreateOpen(false);
            });
            return;
          }

          onCreate(delivery);
          setDeliveryCreateOpen(false);
        }} initialValues={{ vehicleId: eligibleDeliveryVehicles[0]?.id, status: "Scheduled", scheduledDate: today(), inspectionBookingReference: "", inspectionReportReference: "", insurancePolicyReference: "", insuranceExpiryDate: "", roadTaxReceiptReference: "", roadTaxExpiryDate: "", windscreenPolicyReference: "", windscreenInsuranceExpiryDate: "", polishDone: false, tintedDone: false, washDone: false, documentsPrepared: false, inspectionDone: false, notificationSent: false, twoDayNoticeSent: false, insuranceHandled: false, roadTaxHandled: false, windscreenInsuranceHandled: false, handoverPhotoCaptured: false, signedHandoverReceived: false, customerAcknowledged: false, finalChecklistConfirmed: false }}>
          <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select car plate"
              options={eligibleDeliveryVehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))}
            />
          </Form.Item>
          <Form.Item name="pic" label={shortformLabel("PIC", "Person in charge")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scheduledDate" label="Schedule Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="inspectionBookingReference" label="Inspection Booking Reference / 验车预约编号"><Input placeholder="Booking slip no. or appointment reference" /></Form.Item>
          <Form.Item name="inspectionReportReference" label="Inspection Report Reference / 检查报告编号"><Input placeholder="Report no. or uploaded file reference" /></Form.Item>
          <Form.Item name="insurancePolicyReference" label="Insurance Policy Reference / 保险保单编号"><Input placeholder="Policy no. or cover note reference" /></Form.Item>
          <Form.Item name="insuranceExpiryDate" label="Insurance Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="roadTaxReceiptReference" label="Road Tax Receipt Reference / 路税收据编号"><Input placeholder="Road tax receipt no." /></Form.Item>
          <Form.Item name="roadTaxExpiryDate" label="Road Tax Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="windscreenPolicyReference" label="Windscreen Policy Reference / 挡风玻璃保单编号"><Input placeholder="Windscreen policy reference" /></Form.Item>
          <Form.Item name="windscreenInsuranceExpiryDate" label="Windscreen Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          {deliveryChecklistFields.map((field) => (
            <Form.Item key={field} name={field} label={deliveryFieldLabels[field]}><Select options={[{ value: true, label: "Done" }, { value: false, label: "Pending" }]} /></Form.Item>
          ))}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Schedule</Button></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="Edit Delivery / 修改出车安排"
        width={560}
        open={deliveryEditorOpen}
        onClose={() => setDeliveryEditorOpen(false)}
        destroyOnClose
        className="recordEditDrawer"
      >
        <Form
          key={selectedEditDelivery?.id ?? "delivery-edit"}
          layout="vertical"
          className="drawerForm"
          initialValues={selectedEditDelivery}
          onFinish={(values) => {
            if (!selectedEditDelivery) return;
            const delivery: DeliverySchedule = {
              ...selectedEditDelivery,
              vehicleId: values.vehicleId,
              pic: values.pic,
              status: values.status,
              scheduledDate: values.scheduledDate,
              polishDone: values.polishDone,
              tintedDone: values.tintedDone,
              washDone: values.washDone,
              documentsPrepared: values.documentsPrepared,
              inspectionDone: values.inspectionDone,
              inspectionBookingReference: values.inspectionBookingReference?.trim() || undefined,
              inspectionReportReference: values.inspectionReportReference?.trim() || undefined,
              notificationSent: values.notificationSent,
              twoDayNoticeSent: values.twoDayNoticeSent,
              insuranceHandled: values.insuranceHandled,
              insurancePolicyReference: values.insurancePolicyReference?.trim() || undefined,
              insuranceExpiryDate: values.insuranceExpiryDate?.trim() || undefined,
              roadTaxHandled: values.roadTaxHandled,
              roadTaxReceiptReference: values.roadTaxReceiptReference?.trim() || undefined,
              roadTaxExpiryDate: values.roadTaxExpiryDate?.trim() || undefined,
              windscreenInsuranceHandled: values.windscreenInsuranceHandled,
              windscreenPolicyReference: values.windscreenPolicyReference?.trim() || undefined,
              windscreenInsuranceExpiryDate: values.windscreenInsuranceExpiryDate?.trim() || undefined,
              handoverPhotoCaptured: Boolean(values.handoverPhotoCaptured),
              signedHandoverReceived: Boolean(values.signedHandoverReceived),
              customerAcknowledged: Boolean(values.customerAcknowledged),
              finalChecklistConfirmed: Boolean(values.finalChecklistConfirmed)
            };
            const blockReason = deliveryCreateBlockReason(delivery);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            if (selectedEditDelivery.status !== "Released" && delivery.status === "Released") {
              confirmDeliveryRelease(delivery, releaseReadiness[selectedEditDelivery.id], async () => {
                await onUpdate(delivery);
                setDeliveryEditorOpen(false);
              });
              return;
            }

            onUpdate(delivery);
            setDeliveryEditorOpen(false);
          }}
        >
          <Form.Item name="id" label="Edit Delivery / 修改出车记录">
            <Select
              showSearch
              optionFilterProp="label"
              options={deliveries.map((delivery) => ({ value: delivery.id, label: `${plateFor(vehicles, delivery.vehicleId)} / ${delivery.status}` }))}
              onChange={selectDelivery}
            />
          </Form.Item>
          <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select car plate"
              options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))}
            />
          </Form.Item>
          <Form.Item name="pic" label={shortformLabel("PIC", "Person in charge")} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scheduledDate" label="Schedule Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="inspectionBookingReference" label="Inspection Booking Reference / 验车预约编号"><Input placeholder="Booking slip no. or appointment reference" /></Form.Item>
          <Form.Item name="inspectionReportReference" label="Inspection Report Reference / 检查报告编号"><Input placeholder="Report no. or uploaded file reference" /></Form.Item>
          <Form.Item name="insurancePolicyReference" label="Insurance Policy Reference / 保险保单编号"><Input placeholder="Policy no. or cover note reference" /></Form.Item>
          <Form.Item name="insuranceExpiryDate" label="Insurance Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="roadTaxReceiptReference" label="Road Tax Receipt Reference / 路税收据编号"><Input placeholder="Road tax receipt no." /></Form.Item>
          <Form.Item name="roadTaxExpiryDate" label="Road Tax Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="windscreenPolicyReference" label="Windscreen Policy Reference / 挡风玻璃保单编号"><Input placeholder="Windscreen policy reference" /></Form.Item>
          <Form.Item name="windscreenInsuranceExpiryDate" label="Windscreen Expiry"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          {deliveryChecklistFields.map((field) => (
            <Form.Item key={field} name={field} label={deliveryFieldLabels[field]}><Select options={[{ value: true, label: "Done" }, { value: false, label: "Pending" }]} /></Form.Item>
          ))}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDelivery}>Update Delivery</Button></Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}

function LeadsPage({ currentUser, vehicles, customers, leads, onCreateCustomer, onUpdate }: { currentUser: CurrentUser | null; vehicles: Vehicle[]; customers: Customer[]; leads: Lead[]; onCreateCustomer: (lead: Lead) => Promise<void>; onUpdate: (lead: Lead) => void }) {
  const [leadStatusFilter, setLeadStatusFilter] = useState<Lead["status"] | "All">("All");
  const [leadLinkFilter, setLeadLinkFilter] = useState<LeadLinkFilter>("All");
  const [leadSortMode, setLeadSortMode] = useState<"CloseAsap" | "Received">("CloseAsap");
  const filteredLeads = filterLeadsForTriage(leads, { status: leadStatusFilter, link: leadLinkFilter });
  const displayedLeads = leadSortMode === "CloseAsap"
    ? sortLeadsByHotCarDemand(filteredLeads, vehicles)
    : [...filteredLeads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const groupedLeadRows = groupLeadsByVehicle(displayedLeads, vehicles);
  const activeCounts = activeLeadCountByVehicle(leads);
  const openLeadCount = leads.filter((lead) => lead.status !== "Closed").length;
  const multiLeadVehicleCount = Object.values(activeCounts).filter((count) => count > 1).length;
  const hotVehicleCount = vehicles.filter((vehicle) => vehicle.status === "Available" && vehicle.isPublic && (activeCounts[vehicle.id] ?? 0) > 1).length;
  const leadFiltersActive = leadStatusFilter !== "All" || leadLinkFilter !== "All" || leadSortMode !== "CloseAsap";
  const clearLeadFilters = () => {
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
            onUpdate({ ...lead, status: "Closed" });
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
        <Space className="toolbarForm" wrap>
          <Select
            value={leadStatusFilter}
            options={["All", "New", "Contacted", "Closed"].map((value) => ({ value, label: value === "All" ? "All Status" : value }))}
            onChange={setLeadStatusFilter}
            style={{ width: 160 }}
          />
          <Select
            value={leadLinkFilter}
            options={[
              { value: "All", label: "All Customers" },
              { value: "Unlinked", label: "Needs Customer" },
              { value: "Linked", label: "Linked Customer" }
            ]}
            onChange={setLeadLinkFilter}
            style={{ width: 180 }}
          />
          <Select
            value={leadSortMode}
            options={[
              { value: "CloseAsap", label: "Close ASAP first" },
              { value: "Received", label: "Newest first" }
            ]}
            onChange={setLeadSortMode}
            style={{ width: 180 }}
          />
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
          className="desktopDataTable"
          rowKey="vehicleId"
          size="small"
          columns={groupColumns}
          dataSource={groupedLeadRows}
          pagination={tablePagination(8)}
          scroll={{ x: 930 }}
          expandable={{
            defaultExpandAllRows: groupedLeadRows.length <= 3,
            expandedRowRender: (group) => (
              <Table
                rowKey="id"
                size="small"
                columns={leadDetailColumns}
                dataSource={group.leads}
                pagination={false}
                scroll={{ x: 1120 }}
                locale={{ emptyText: "No lead details in this group." }}
              />
            )
          }}
          locale={{ emptyText: "No leads match the current filters." }}
        />
      </ProCard>
    </Space>
  );
}

function AuditLogRecords({ auditLog, filters, onSearch }: { auditLog: AuditLog[]; filters: AuditLogFilters; onSearch: (filters: AuditLogFilters) => Promise<void> }) {
  const [form] = Form.useForm<AuditLogFilters>();
  const [mobileAuditPage, setMobileAuditPage] = useState(1);
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

  return (
    <Space direction="vertical" size={12} className="fullWidth">
      <Form
        form={form}
        layout="inline"
        className="toolbarForm"
        onFinish={(values) => {
          setMobileAuditPage(1);
          void onSearch({
            actor: values.actor,
            action: values.action,
            entityName: values.entityName
          });
        }}
      >
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
          <Button type="primary" htmlType="submit">Filter</Button>
        </Form.Item>
        <Form.Item>
          <Button htmlType="button" onClick={() => {
            form.resetFields();
            setMobileAuditPage(1);
            void onSearch({});
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
      <Table className="desktopDataTable" rowKey="id" columns={auditLogColumns()} dataSource={auditLog} pagination={{ ...tablePagination(12), current: clampedMobileAuditPage, onChange: setMobileAuditPage }} scroll={{ x: 900 }} locale={{ emptyText: "No audit records match the current filters." }} />
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
        type="info"
        showIcon
        message="Audit trail is captured automatically for authenticated back-office mutations."
        description="Use this screen to confirm who created or updated vehicle, workflow, finance, upload, and staff records."
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
                <Space className="toolbarForm staffFilterBar" wrap>
                  <Input.Search
                    allowClear
                    placeholder="Search name, email, or role"
                    value={staffKeywordFilter}
                    onChange={(event) => {
                      setStaffKeywordFilter(event.target.value);
                      setMobileStaffPage(1);
                    }}
                    style={{ width: 240 }}
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
                <Table className="desktopDataTable" rowKey="id" size="small" columns={staffColumns} dataSource={filteredStaffUsers} pagination={{ ...tablePagination(6), current: clampedMobileStaffPage, onChange: setMobileStaffPage }} scroll={{ x: 1200 }} locale={{ emptyText: "No staff users match the current filters." }} />
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
                  type="info"
                  showIcon
                  message="OCR limits are enforced by the server"
                  description="Each OCR request reserves one unit before the external provider is called. Limits reset on the UTC calendar month and day."
                />
                <ProCard title="OCR Limit / OCR 限额">
                  {ocrLimitSnapshot ? (
                    <Space direction="vertical" size={16} className="fullWidth">
                      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label="This month used">{ocrLimitSnapshot.usedThisMonth}</Descriptions.Item>
                        <Descriptions.Item label="This month remaining">{ocrLimitSnapshot.remainingThisMonth}</Descriptions.Item>
                        <Descriptions.Item label="Last updated">{ocrLimitSnapshot.limit.updatedAt.slice(0, 16).replace("T", " ")}</Descriptions.Item>
                        <Descriptions.Item label="Updated by">{ocrLimitSnapshot.limit.updatedBy}</Descriptions.Item>
                      </Descriptions>
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
        pagination={tablePagination(8)}
        scroll={{ x: 900 }}
        locale={{ emptyText: "No ownership rows configured." }}
      />
      <Alert
        type="info"
        showIcon
        message="CP58 ownership"
        description="CP58 should be prepared by HR Payroll or Finance from approved commission/payment records, checked by Admin, and approved through management review. It remains a planned extension, not an MVP blocker."
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
        type="info"
        showIcon
        message="RBAC is enforced twice: the portal hides unavailable modules, and the API rejects unauthorized module requests."
        description="Admin can assign roles. Department users only load the datasets listed here, so restricted pages do not fetch unrelated records."
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
    Policy: "Policy",
    RoadTaxReceipt: "Road Tax Receipt",
    RepairInvoice: "Repair Invoice",
    PaymentReceipt: "Payment Receipt",
    PaymentInvoice: "Payment Invoice",
    MedicalCertificate: "Medical Certificate"
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

function ensureColumnFilters<RecordType extends object>(
  columns: TableProps<RecordType>["columns"],
  dataSource: TableProps<RecordType>["dataSource"]
): TableProps<RecordType>["columns"] {
  if (!columns || !Array.isArray(dataSource)) {
    return columns;
  }

  return columns.map((column) => {
    if ("children" in column && column.children) {
      return {
        ...column,
        children: ensureColumnFilters(column.children, dataSource)
      };
    }

    const filterableColumn = column as typeof column & {
      dataIndex?: string | number | readonly (string | number)[];
      filters?: unknown;
      filterDropdown?: unknown;
    };

    if (!filterableColumn.dataIndex || filterableColumn.filters || filterableColumn.filterDropdown) {
      return column;
    }

    const dataIndex = filterableColumn.dataIndex;
    const leafKey = String(Array.isArray(dataIndex) ? dataIndex[dataIndex.length - 1] : dataIndex);
    if (/(?:^id$|Id$|At$|Date$)/.test(leafKey)) {
      return column;
    }

    const filterValues = dataSource
      .flatMap((row) => tableFilterValues(row, dataIndex))
      .filter((value) => value.length > 0);
    const uniqueValues = Array.from(new Set(filterValues)).sort((a, b) => a.localeCompare(b));

    if (uniqueValues.length === 0) {
      return column;
    }

    return {
      ...column,
      filters: uniqueValues.map((value) => ({ text: value, value })),
      filterSearch: column.filterSearch ?? uniqueValues.length > 8,
      onFilter: column.onFilter ?? ((value, row) => tableFilterValues(row, dataIndex).includes(String(value)))
    };
  });
}

function tableFilterValues<RecordType extends object>(row: RecordType, dataIndex: string | number | readonly (string | number)[]) {
  const keys = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  const value = keys.reduce<unknown>((current, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[String(key)];
    }

    return undefined;
  }, row);

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [String(value)];
}

function isDeliveryReady(delivery: DeliverySchedule) {
  return delivery.status === "ReadyForRelease" &&
    delivery.inspectionDone &&
    Boolean(delivery.inspectionReportReference?.trim()) &&
    delivery.documentsPrepared &&
    delivery.polishDone &&
    delivery.tintedDone &&
    delivery.washDone &&
    delivery.insuranceHandled &&
    delivery.roadTaxHandled &&
    delivery.windscreenInsuranceHandled &&
    delivery.twoDayNoticeSent &&
    delivery.handoverPhotoCaptured &&
    delivery.signedHandoverReceived &&
    delivery.customerAcknowledged &&
    delivery.finalChecklistConfirmed &&
    Boolean(delivery.insuranceExpiryDate && delivery.insuranceExpiryDate >= delivery.scheduledDate) &&
    Boolean(delivery.roadTaxExpiryDate && delivery.roadTaxExpiryDate >= delivery.scheduledDate) &&
    Boolean(delivery.windscreenInsuranceExpiryDate && delivery.windscreenInsuranceExpiryDate >= delivery.scheduledDate);
}

function deliveryReferenceChecklist(delivery: DeliverySchedule) {
  return [
    { label: "Inspection Booking / 验车预约", done: Boolean(delivery.inspectionBookingReference?.trim()) },
    { label: "Inspection Report / 检查报告", done: Boolean(delivery.inspectionReportReference?.trim()) },
    { label: `Policy Ref / 保单: ${delivery.insurancePolicyReference?.trim() || "-"}`, done: Boolean(delivery.insurancePolicyReference?.trim()) },
    { label: `Policy Expiry: ${delivery.insuranceExpiryDate || "-"}`, done: Boolean(delivery.insuranceExpiryDate && delivery.insuranceExpiryDate >= delivery.scheduledDate) },
    { label: `Road Tax Receipt / 路税收据: ${delivery.roadTaxReceiptReference?.trim() || "-"}`, done: Boolean(delivery.roadTaxReceiptReference?.trim()) },
    { label: `Road Tax Expiry: ${delivery.roadTaxExpiryDate || "-"}`, done: Boolean(delivery.roadTaxExpiryDate && delivery.roadTaxExpiryDate >= delivery.scheduledDate) },
    { label: `Windscreen Ref: ${delivery.windscreenPolicyReference?.trim() || "-"}`, done: Boolean(delivery.windscreenPolicyReference?.trim()) },
    { label: `Windscreen Expiry: ${delivery.windscreenInsuranceExpiryDate || "-"}`, done: Boolean(delivery.windscreenInsuranceExpiryDate && delivery.windscreenInsuranceExpiryDate >= delivery.scheduledDate) }
  ];
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
