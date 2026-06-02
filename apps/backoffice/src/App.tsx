import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined
} from "@ant-design/icons";
import { PageContainer, ProCard, ProLayout } from "@ant-design/pro-components";
import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { assignableStaffRoles, backOfficeDataKeysForRoles, canAccessRoute, canAssignStaffRoles, firstAccessiblePath, type AppRoutePath, type BackOfficeDataKey } from "./access";
import { brokerCommissionCreateBlockReason, canCorrectReconciledPayment, canReconcilePayment, canReopenPaidDailySpend, canReopenPaidSettlement, dailySpendCreateBlockReason, debtRecoveryCreateBlockReason, financeDocumentCategories, paymentCreateBlockReason, paymentReconcileBlockReason, paymentVoucherCreateBlockReason, settlementCreateBlockReason } from "./finance";
import { canMarkDeliveryReady, canMarkNotificationSent, canMarkTwoDayNoticeSent, canReleaseDelivery, deliveryCreateBlockReason, deliveryDocumentCategories, markDeliveryReady, markNotificationSent, markTwoDayNoticeSent } from "./delivery";
import { loanCreateBlockReason, loanDocumentCategories, markLoanApproved, markLoanDone } from "./loan";
import { filterLeadsForTriage, findCustomerForLead, leadCustomerLinkLabel, leadCustomerLinkTagColor, type LeadLinkFilter } from "./leads";
import { customerCreateBlockReason, ownerCreateBlockReason } from "./contacts";
import { purchaseInvoiceCreateBlockReason, vehicleCreateBlockReason } from "./vehicles";
import { repairCreateBlockReason, repairDocumentCategories, supplierInvoiceCreateBlockReason } from "./repairs";
import { staffCreateBlockReason, staffPasswordResetBlockReason, staffUpdateBlockReason } from "./staff";
import { filterDashboardReminders, reminderDueLabel, reminderDueTagColor, type ReminderDueFilter } from "./dashboard";
import {
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
  getAuditLog,
  getCurrentUser,
  getCustomers,
  getBrokerCommissions,
  getDailySpends,
  getDashboard,
  getDebtRecoveries,
  getDashboardReminders,
  getDeliveryReleaseReadiness,
  getDeliveries,
  getLeads,
  getLoanDocumentCheck,
  getLoans,
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
  getVehiclePhotos,
  getVehicles,
  login,
  logout,
  resetStaffUserPassword,
  updateDelivery,
  updateBrokerCommission,
  updateCustomer,
  updateDailySpend,
  updateDebtRecovery,
  updateLead,
  updateLoan,
  updateOwner,
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
  uploadVehicleDocument,
  uploadVehiclePhoto,
  vehicleDocumentContentUrl,
  vehiclePhotoContentUrl,
  vehicleFromIntakeValues,
  type AuditLog,
  type AuditLogFilters,
  type BrokerCommission,
  type CreateStaffUserRequest,
  type CurrentUser,
  type Customer,
  type DailySpend,
  type DashboardReminder,
  type DashboardReminderFilters,
  type DashboardSummary,
  type DebtRecoveryCase,
  type DeliverySchedule,
  type DeliveryReleaseReadiness,
  type DocumentCategory,
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
  type Vehicle,
  type VehicleDocument,
  type VehicleLookup,
  type VehiclePhoto
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
  "twoDayNoticeSent"
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
  twoDayNoticeSent: "2-day Notice Sent / 提前2天通知"
};

const bilingual = {
  dashboard: "Dashboard / 管理层分析",
  vehicles: "Vehicles / 收车库存",
  repairs: "Repair / 整备",
  loans: "Loan / 贷款",
  delivery: "Delivery / 出车",
  finance: "Finance / 收款Bank",
  leads: "Leads / 客户询问",
  auditLog: "Audit Log / 操作记录",
  admin: "Admin / 用户角色"
};

const allRoutes: { path: AppRoutePath; name: string; icon: ReactNode }[] = [
  { path: "/dashboard", name: bilingual.dashboard, icon: <DashboardOutlined /> },
  { path: "/vehicles", name: bilingual.vehicles, icon: <CarOutlined /> },
  { path: "/repairs", name: bilingual.repairs, icon: <ToolOutlined /> },
  { path: "/loans", name: bilingual.loans, icon: <FileDoneOutlined /> },
  { path: "/delivery", name: bilingual.delivery, icon: <AuditOutlined /> },
  { path: "/finance", name: bilingual.finance, icon: <BankOutlined /> },
  { path: "/leads", name: bilingual.leads, icon: <UserOutlined /> },
  { path: "/audit-log", name: bilingual.auditLog, icon: <AuditOutlined /> },
  { path: "/hr-salary", name: "HR/Salary / 人事薪资", icon: <CalendarOutlined /> },
  { path: "/admin", name: bilingual.admin, icon: <UserOutlined /> }
];

export default function App() {
  const [pathname, setPathname] = useState("/dashboard");
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
  const [settlements, setSettlements] = useState<SettlementReminder[]>([]);
  const [dailySpends, setDailySpends] = useState<DailySpend[]>([]);
  const [brokerCommissions, setBrokerCommissions] = useState<BrokerCommission[]>([]);
  const [debtRecoveries, setDebtRecoveries] = useState<DebtRecoveryCase[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<PaymentVoucher[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [vehicleLookup, setVehicleLookup] = useState<VehicleLookup[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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
      settlementData,
      dailySpendData,
      brokerCommissionData,
      debtRecoveryData,
      paymentVoucherData,
      leadData,
      auditData,
      staffUserData
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
      canLoad("settlements") ? getSettlementReminders() : Promise.resolve([]),
      canLoad("dailySpends") ? getDailySpends() : Promise.resolve([]),
      canLoad("brokerCommissions") ? getBrokerCommissions() : Promise.resolve([]),
      canLoad("debtRecoveries") ? getDebtRecoveries() : Promise.resolve([]),
      canLoad("paymentVouchers") ? getPaymentVouchers() : Promise.resolve([]),
      canLoad("leads") ? getLeads() : Promise.resolve([]),
      canLoad("auditLog") ? getAuditLog() : Promise.resolve([]),
      canLoad("staffUsers") ? getStaffUsers() : Promise.resolve([])
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
    setSettlements(settlementData);
    setDailySpends(dailySpendData);
    setBrokerCommissions(brokerCommissionData);
    setDebtRecoveries(debtRecoveryData);
    setPaymentVouchers(paymentVoucherData);
    setLeads(leadData);
    setAuditLog(auditData);
    setStaffUsers(staffUserData);
  }, []);

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        return loadBackOfficeData(user.isAuthenticated ? user.roles : undefined);
      })
      .catch(() => {
        setCurrentUser(null);
        return loadBackOfficeData();
      });
  }, [loadBackOfficeData]);

  useEffect(() => {
    if (currentUser?.isAuthenticated && !canAccessRoute(currentRoles, pathname)) {
      setPathname(firstAccessiblePath(currentRoles));
    }
  }, [currentRoles, currentUser?.isAuthenticated, pathname]);

  const route = useMemo(() => ({
    path: "/",
    routes: currentUser?.isAuthenticated ? allRoutes.filter((item) => canAccessRoute(currentRoles, item.path)) : allRoutes
  }), [currentUser?.isAuthenticated, currentRoles]);
  const pageTitle = route.routes.find((item) => item.path === pathname)?.name ?? bilingual.dashboard;

  async function handleLogin(values: { email: string; password: string }) {
    await login(values.email, values.password);
    const user = await getCurrentUser();
    setCurrentUser(user);
    setPathname(firstAccessiblePath(user.roles));
    await loadBackOfficeData(user.roles);
    message.success("Logged in");
  }

  async function handleAuditLogSearch(filters: AuditLogFilters) {
    const records = await getAuditLog(filters);
    setAuditLog(records);
    message.success("Audit log filtered");
  }

  async function handleReminderSearch(filters: DashboardReminderFilters) {
    const records = await getDashboardReminders(filters);
    setReminders(records);
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setPathname("/dashboard");
    message.success("Logged out");
  }

  async function runCreate<T>(action: () => Promise<T>, success: (record: T) => void, text: string) {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      message.success(text);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Request failed");
      throw error;
    }
  }

  async function runUpload(action: () => Promise<unknown>, text: string) {
    try {
      await action();
      message.success(text);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Upload failed");
      throw error;
    }
  }

  async function runUpdate<T>(action: () => Promise<T>, success: (record: T) => void, text: string) {
    try {
      const record = await action();
      success(record);
      await loadBackOfficeData(currentUser?.isAuthenticated ? currentRoles : undefined);
      message.success(text);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Update failed");
      throw error;
    }
  }

  return (
    <ProLayout
      title="YS Heng Portal"
      logo={false}
      route={route}
      location={{ pathname }}
      menuItemRender={(item, dom) => <button className="menuButton" onClick={() => setPathname(item.path ?? "/dashboard")}>{dom}</button>}
      layout="mix"
    >
      <PageContainer title={pageTitle}>
        <Space direction="vertical" size={16} className="fullWidth">
          <SessionPanel currentUser={currentUser} onLogin={handleLogin} onLogout={handleLogout} />
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
            settlements={settlements}
            leads={leads}
            staffUsers={staffUsers}
          />
          {pathname === "/dashboard" && <DashboardPage dashboard={dashboard} reminders={reminders} onSearch={handleReminderSearch} />}
          {pathname === "/vehicles" && (
            <VehiclesPage
              vehicles={vehicles}
              customers={customers}
              owners={owners}
              purchaseInvoices={purchaseInvoices}
              onCreate={(vehicle) => runCreate(() => createVehicle(vehicle), (record) => setVehicles((items) => [record, ...items]), "Vehicle created")}
              onUpdate={(vehicle) => runUpdate(() => updateVehicle(vehicle), (record) => setVehicles((items) => replaceById(items, record)), "Vehicle updated")}
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
              onCreateInvoice={(invoice) => runCreate(() => createSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => [record, ...items]), "Supplier invoice created")}
              onUpdateInvoice={(invoice) => runUpdate(() => updateSupplierInvoice(invoice), (record) => setSupplierInvoices((items) => replaceById(items, record)), "Supplier invoice updated")}
              onCreateRepair={(repair) => runCreate(() => createRepair(repair), (record) => setRepairs((items) => [record, ...items]), "Repair task created")}
              onUpdateRepair={(repair) => runUpdate(() => updateRepair(repair), (record) => setRepairs((items) => replaceById(items, record)), "Repair task updated")}
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Repair document uploaded")}
            />
          )}
          {pathname === "/loans" && (
            <LoanPage
              vehicles={vehicleLookup}
              customers={customers}
              loans={loans}
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
              onCreate={(payment) => runCreate(() => createPayment(payment), (record) => setPayments((items) => [record, ...items]), "Payment record created")}
              onUpdate={(payment) => runUpdate(() => updatePayment(payment), (record) => setPayments((items) => replaceById(items, record)), "Payment updated")}
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
              onUploadDocument={(vehicleId, file, category) => runUpload(() => uploadVehicleDocument(vehicleId, file, category), "Finance document uploaded")}
            />
          )}
          {pathname === "/leads" && (
            <LeadsPage
              vehicles={vehicleLookup}
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
                message.success(existingCustomer ? "Existing customer linked to lead" : "Customer linked to lead");
              }}
              onUpdate={(lead) => runUpdate(() => updateLead(lead), (record) => setLeads((items) => replaceById(items, record)), "Lead updated")}
            />
          )}
          {pathname === "/hr-salary" && <HrSalaryPage />}
          {pathname === "/audit-log" && <AuditLogPage auditLog={auditLog} onSearch={handleAuditLogSearch} />}
          {pathname === "/admin" && (
            <AdminPage
              currentUser={currentUser}
              auditLog={auditLog}
              staffUsers={staffUsers}
              onCreateStaffUser={(user) => runCreate(() => createStaffUser(user), (record) => setStaffUsers((items) => [record, ...items]), "Staff user created")}
              onUpdateStaffUser={(userId, requestBody) => runUpdate(() => updateStaffUser(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff user updated")}
              onResetStaffPassword={(userId, requestBody) => runUpdate(() => resetStaffUserPassword(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff password reset")}
              onUpdateStaffStatus={(userId, requestBody) => runUpdate(() => updateStaffUserStatus(userId, requestBody), (record) => setStaffUsers((items) => replaceById(items, record)), requestBody.isActive ? "Staff user enabled" : "Staff user disabled")}
              onUpdateStaffRoles={(userId, roles) => runUpdate(() => updateStaffUserRoles(userId, roles), (record) => setStaffUsers((items) => replaceById(items, record)), "Staff roles updated")}
            />
          )}
        </Space>
      </PageContainer>
    </ProLayout>
  );
}

function SessionPanel({ currentUser, onLogin, onLogout }: { currentUser: CurrentUser | null; onLogin: (values: { email: string; password: string }) => Promise<void>; onLogout: () => Promise<void> }) {
  if (currentUser?.isAuthenticated) {
    return (
      <Alert
        type="success"
        showIcon
        message={`Logged in as ${currentUser.name ?? "staff"}`}
        description={`Roles: ${currentUser.roles.join(", ") || "none"}`}
        action={<Button onClick={onLogout}>Logout</Button>}
      />
    );
  }

  return (
    <ProCard title="Staff Login / 员工登录">
      <Form layout="inline" onFinish={onLogin} initialValues={{ email: "admin@ysheng.local" }}>
        <Form.Item name="email" rules={[{ required: true }]}><Input placeholder="Email" /></Form.Item>
        <Form.Item name="password" rules={[{ required: true }]}><Input.Password placeholder="Password" /></Form.Item>
        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Login</Button></Form.Item>
      </Form>
    </ProCard>
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
  settlements,
  leads,
  staffUsers
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
  settlements: SettlementReminder[];
  leads: Lead[];
  staffUsers: StaffUser[];
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
    settlements,
    leads,
    staffUsers
  });
  const roles = currentUser?.roles ?? [];

  return (
    <section className="moduleCommandBar">
      <div>
        <span className="moduleEyebrow">YS Heng Operations</span>
        <h1>{title}</h1>
        <div className="moduleRoles">
          {(roles.length > 0 ? roles : ["Guest"]).map((role) => <Tag key={role}>{role}</Tag>)}
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
  settlements: SettlementReminder[];
  leads: Lead[];
  staffUsers: StaffUser[];
}) {
  const availableVehicles = data.vehicles.filter((vehicle) => vehicle.status === "Available").length;
  const publicVehicles = data.vehicles.filter((vehicle) => vehicle.isPublic).length;
  const pendingLoans = data.loans.filter((loan) => loan.status === "Pending").length;
  const openPayments = data.payments.filter((payment) => payment.status !== "Reconciled").length;
  const dueSettlements = data.settlements.filter((settlement) => !settlement.isPaid).length;
  const pendingDeliveries = data.deliveries.filter((delivery) => delivery.status !== "Released").length;
  const newLeads = data.leads.filter((lead) => lead.status === "New").length;

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
        { label: "settlement due", value: dueSettlements }
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
        { label: "scope", value: "MVP" },
        { label: "access", value: "Role" },
        { label: "payroll", value: "Next" }
      ];
    default:
      return [
        { label: "total stock", value: data.dashboard?.totalStock ?? data.vehicles.length },
        { label: "available", value: availableVehicles },
        { label: "reminders", value: data.reminders.length }
      ];
  }
}

function DashboardPage({ dashboard, reminders, onSearch }: { dashboard: DashboardSummary | null; reminders: DashboardReminder[]; onSearch: (filters: DashboardReminderFilters) => Promise<void> }) {
  const [reminderTypeFilter, setReminderTypeFilter] = useState<DashboardReminder["type"] | "All">("All");
  const [reminderDueFilter, setReminderDueFilter] = useState<ReminderDueFilter>("All");
  const data = dashboard ?? {
    totalStock: 0,
    pendingLoan: 0,
    outstandingPayment: 0,
    settlementDue: 0,
    repairCost: 0,
    estimatedProfit: 0,
    totalProfit: 0,
    vehicleAging: 0,
    agingBuckets: [
      { label: "0-30" as const, count: 0 },
      { label: "31-60" as const, count: 0 },
      { label: "61+" as const, count: 0 }
    ],
    topSupplier: "-",
    salesPerformance: 0
  };
  const agingBuckets = data.agingBuckets?.length ? data.agingBuckets : [
    { label: "0-30" as const, count: 0 },
    { label: "31-60" as const, count: 0 },
    { label: "61+" as const, count: data.vehicleAging }
  ];
  const filteredReminders = filterDashboardReminders(reminders, { type: reminderTypeFilter, due: reminderDueFilter });

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="metricGrid">
        <Metric label="Total Stock / 总库存" value={data.totalStock} />
        <Metric label="Pending Loan / 贷款待跟进" value={data.pendingLoan} />
        <Metric label="Outstanding / 未收款" value={`RM ${data.outstandingPayment.toLocaleString()}`} />
        <Metric label="Settlement Due / 结算到期" value={data.settlementDue} />
        <Metric label="Repair Cost / 整备费用" value={`RM ${data.repairCost.toLocaleString()}`} />
        <Metric label="Total Profit / 总利润" value={`RM ${(data.totalProfit ?? data.estimatedProfit).toLocaleString()}`} />
        <Metric label="Vehicle Aging / 超60天库存" value={data.vehicleAging} />
        <Metric label="Top Supplier / 主要供应商" value={data.topSupplier || "-"} />
        <Metric label="Sales Performance / 成交询问" value={data.salesPerformance} />
      </div>
      <ProCard title="Vehicle Aging / 库存车龄">
        <Table
          rowKey="label"
          columns={[
            { title: "Age / 车龄", dataIndex: "label", render: (value) => `${value} days` },
            { title: "Stock / 库存", dataIndex: "count" }
          ]}
          dataSource={agingBuckets}
          pagination={false}
        />
      </ProCard>
      <ProCard title="Reminder Inbox / 提醒事项">
        <Space className="toolbarForm" wrap>
          <Select
            value={reminderTypeFilter}
            options={[{ value: "All", label: "All Types" }, ...dashboardReminderTypes.map((type) => ({ value: type, label: type }))]}
            onChange={(value) => {
              setReminderTypeFilter(value);
              void onSearch({ type: value, due: reminderDueFilter });
            }}
            style={{ width: 220 }}
          />
          <Select
            value={reminderDueFilter}
            options={[
              { value: "All", label: "All Due" },
              { value: "Overdue", label: "Overdue" },
              { value: "DueToday", label: "Due today" },
              { value: "Upcoming", label: "Upcoming" }
            ]}
            onChange={(value) => {
              setReminderDueFilter(value);
              void onSearch({ type: reminderTypeFilter, due: value });
            }}
            style={{ width: 160 }}
          />
          <Tag color="blue">{filteredReminders.length} shown</Tag>
        </Space>
        <Table
          rowKey={(row) => `${row.type}-${row.vehicleId}-${row.dueDate}`}
          columns={[
            { title: "Type / 类型", dataIndex: "type", render: (value) => <Tag color={reminderColor(value)}>{value}</Tag> },
            { title: "Title / 事项", dataIndex: "title" },
            { title: "Car Plate / 车牌", dataIndex: "vehiclePlate" },
            { title: "Due / 到期", dataIndex: "dueDate", render: (value) => <Space><span>{value}</span><Tag color={reminderDueTagColor(value)}>{reminderDueLabel(value)}</Tag></Space> },
            { title: "Amount / 金额", dataIndex: "amount", render: (value) => value ? `RM ${Number(value).toLocaleString()}` : "-" }
          ]}
          dataSource={filteredReminders}
          pagination={false}
          scroll={{ x: 760 }}
        />
      </ProCard>
    </Space>
  );
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metricCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VehiclesPage({
  vehicles,
  customers,
  owners,
  purchaseInvoices,
  onCreate,
  onUpdate,
  onCreateCustomer,
  onUpdateCustomer,
  onCreateOwner,
  onUpdateOwner,
  onCreatePurchaseInvoice,
  onUpdatePurchaseInvoice,
  onUploadPhoto,
  onUploadDocument
}: {
  vehicles: Vehicle[];
  customers: Customer[];
  owners: Owner[];
  purchaseInvoices: PurchaseInvoice[];
  onCreate: (vehicle: Vehicle) => void;
  onUpdate: (vehicle: Vehicle) => void;
  onCreateCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onCreateOwner: (owner: Owner) => void;
  onUpdateOwner: (owner: Owner) => void;
  onCreatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUpdatePurchaseInvoice: (invoice: PurchaseInvoice) => Promise<void>;
  onUploadPhoto: (vehicleId: string, file: File) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadVehicleId, setUploadVehicleId] = useState(vehicles[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PurchaseInvoice");
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [editVehicleId, setEditVehicleId] = useState(vehicles[0]?.id ?? "");
  const [editPurchaseInvoiceId, setEditPurchaseInvoiceId] = useState(purchaseInvoices[0]?.id ?? "");
  const [editCustomerId, setEditCustomerId] = useState(customers[0]?.id ?? "");
  const [editOwnerId, setEditOwnerId] = useState(owners[0]?.id ?? "");
  const selectedVehicleId = uploadVehicleId || vehicles[0]?.id || "";
  const uploadDisabled = !selectedVehicleId;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === editVehicleId) ?? vehicles[0];
  const selectedPurchaseInvoice = purchaseInvoices.find((invoice) => invoice.id === editPurchaseInvoiceId) ?? purchaseInvoices[0];
  const selectedCustomer = customers.find((customer) => customer.id === editCustomerId) ?? customers[0];
  const selectedOwner = owners.find((owner) => owner.id === editOwnerId) ?? owners[0];

  const loadUploads = useCallback(async () => {
    if (!selectedVehicleId) {
      setDocuments([]);
      setPhotos([]);
      return;
    }
    const [photoData, documentData] = await Promise.all([
      getVehiclePhotos(selectedVehicleId),
      getVehicleDocuments(selectedVehicleId)
    ]);
    setPhotos(photoData);
    setDocuments(documentData);
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!uploadVehicleId && vehicles[0]?.id) {
      setUploadVehicleId(vehicles[0].id);
    }
  }, [uploadVehicleId, vehicles]);

  useEffect(() => {
    if (!editVehicleId && vehicles[0]?.id) {
      setEditVehicleId(vehicles[0].id);
    }
  }, [editVehicleId, vehicles]);

  useEffect(() => {
    if (!editPurchaseInvoiceId && purchaseInvoices[0]?.id) {
      setEditPurchaseInvoiceId(purchaseInvoices[0].id);
    }
  }, [editPurchaseInvoiceId, purchaseInvoices]);

  useEffect(() => {
    if (!editCustomerId && customers[0]?.id) {
      setEditCustomerId(customers[0].id);
    }
  }, [editCustomerId, customers]);

  useEffect(() => {
    if (!editOwnerId && owners[0]?.id) {
      setEditOwnerId(owners[0].id);
    }
  }, [editOwnerId, owners]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const columns: ColumnsType<Vehicle> = [
    { title: "Plate / 车牌", dataIndex: "plateNumber" },
    { title: "Vehicle / 车辆", render: (_, row) => `${row.year} ${row.make} ${row.model}` },
    { title: "Customer / 客户", dataIndex: "customerId", render: (customerId) => contactFor(customers, customerId) },
    { title: "Owner / 原车主", dataIndex: "ownerId", render: (ownerId) => contactFor(owners, ownerId) },
    {
      title: "Outstation Pickup / 外地收车",
      render: (_, row) => row.outstationPickupScheduledAt || row.outstationPickupAllowance || row.outstationPickupBookingSlip
        ? (
          <Space direction="vertical" size={0}>
            <span>{row.outstationPickupScheduledAt ? String(row.outstationPickupScheduledAt).replace("T", " ").slice(0, 16) : "No schedule"}</span>
            <span>RM {(row.outstationPickupAllowance ?? 0).toLocaleString()} / {row.outstationPickupBookingSlip || "No slip"}</span>
          </Space>
        )
        : "-"
    },
    { title: "Stock / 分类", dataIndex: "stockOwner" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Available" ? "green" : "blue"}>{status}</Tag> },
    { title: "Boss Confirm / 老板确认", dataIndex: "bossConfirmed", render: (value) => <Badge status={value ? "success" : "warning"} text={value ? "Confirmed" : "Pending"} /> },
    { title: "Contra Range / Contra 价格", dataIndex: "contraRangePrice", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: "UCD Status", dataIndex: "ucdStatus", render: (value) => value || "-" },
    { title: "Public / 网站", dataIndex: "isPublic", render: (value) => <Badge status={value ? "success" : "default"} text={value ? "Visible" : "Hidden"} /> },
    { title: "Selling / 售价", dataIndex: "sellingPrice", render: (value) => `RM ${value.toLocaleString()}` },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 250,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Available", isPublic: true })} disabled={row.status === "Available" && row.isPublic}>Publish</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "LoanProcessing", isPublic: false })} disabled={row.status === "LoanProcessing"}>Loan</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Sold", isPublic: false })} disabled={row.status === "Sold"}>Sold</Button>
          <Button size="small" onClick={() => setEditVehicleId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const documentColumns: ColumnsType<VehicleDocument> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    { title: "Type / 类型", dataIndex: "category" },
    { title: "File / 文件", dataIndex: "fileName" },
    { title: "Uploaded By / 上传者", dataIndex: "uploadedBy", render: (value) => value || "-" },
    { title: "Checksum / 校验", dataIndex: "checksum", render: (value) => value ? `${String(value).slice(0, 12)}...` : "-" },
    {
      title: "Download / 下载",
      render: (_, row) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={vehicleDocumentContentUrl(selectedVehicleId, row.id)}
          target="_blank"
        >
          Open
        </Button>
      )
    }
  ];
  const photoColumns: ColumnsType<VehiclePhoto> = [
    { title: "Uploaded / 日期", dataIndex: "uploadedAt", render: (value) => String(value).slice(0, 10) },
    { title: "File / 文件", dataIndex: "fileName" },
    { title: "MIME", dataIndex: "mimeType" },
    { title: "Uploaded By / 上传者", dataIndex: "uploadedBy", render: (value) => value || "-" },
    { title: "Checksum / 校验", dataIndex: "checksum", render: (value) => value ? `${String(value).slice(0, 12)}...` : "-" },
    {
      title: "Preview / 预览",
      render: (_, row) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          href={vehiclePhotoContentUrl(selectedVehicleId, row.id)}
          target="_blank"
        >
          Open
        </Button>
      )
    }
  ];
  const customerColumns: ColumnsType<Customer> = [
    { title: "Name / 姓名", dataIndex: "name" },
    { title: "Phone / 电话", dataIndex: "phone" },
    { title: "IC", dataIndex: "icNumber", render: (value) => value || "-" },
    { title: "Email", dataIndex: "email", render: (value) => value || "-" },
    { title: "Address / 地址", dataIndex: "address", render: (value) => value || "-" },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    { title: "Action", fixed: "right", width: 90, render: (_, row) => <Button size="small" onClick={() => setEditCustomerId(row.id)}>Edit</Button> }
  ];
  const ownerColumns: ColumnsType<Owner> = [
    { title: "Owner / 原车主", dataIndex: "name" },
    { title: "Phone / 电话", dataIndex: "phone" },
    { title: "Action", fixed: "right", width: 90, render: (_, row) => <Button size="small" onClick={() => setEditOwnerId(row.id)}>Edit</Button> }
  ];
  const purchaseInvoiceColumns: ColumnsType<PurchaseInvoice> = [
    { title: "Car Plate", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Invoice", dataIndex: "invoiceNumber" },
    { title: "Amount", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Action", fixed: "right", width: 90, render: (_, row) => <Button size="small" onClick={() => setEditPurchaseInvoiceId(row.id)}>Edit</Button> }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="收车 Flow (Upload to Website)">
        <Table rowKey="id" columns={columns} dataSource={vehicles} pagination={false} scroll={{ x: 980 }} />
      </ProCard>
      <ProCard title="Vehicle Intake Form / 收车资料">
        <Form layout="vertical" className="formGrid" onFinish={(values) => {
          const vehicle = vehicleFromIntakeValues(values, newId());
          const blockReason = vehicleCreateBlockReason(vehicle, vehicles);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          onCreate(vehicle);
        }} initialValues={{ stockOwner: "YSHeng", status: "Available", isPublic: true, bossConfirmed: false, contraRangePrice: 0, additionalCharges: 0, refurbishmentTotal: 0, commissionTotal: 0, outstationPickupAllowance: 0 }}>
          <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>
          <Form.Item name="model" label="Model"><Input placeholder="Vios" /></Form.Item>
          <Form.Item name="year" label="Year"><InputNumber className="fullWidth" min={1990} max={2030} /></Form.Item>
          <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="bossConfirmed" label="Boss Confirm / 老板确认"><Select options={[{ value: true, label: "Confirmed" }, { value: false, label: "Pending" }]} /></Form.Item>
          <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ucdStatus" label="UCD Status Tracking"><Input placeholder="Ready / Pending / Submitted" /></Form.Item>
          <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupScheduledAt" label="Outstation Pickup Date & Time / 外地收车时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / Booking Slip"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select customer" options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} />
          </Form.Item>
          <Form.Item name="ownerId" label="Owner / 原车主">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select owner" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} />
          </Form.Item>
          <Form.Item name="stockOwner" label="Stock"><Select options={["YSHeng", "KS"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Available", "LoanProcessing", "Sold"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="isPublic" label="Website Visible"><Select options={[{ value: true, label: "Visible" }, { value: false, label: "Hidden" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Vehicle</Button></Form.Item>
        </Form>
        <Form
          key={selectedVehicle?.id ?? "vehicle-edit"}
          layout="vertical"
          className="formGrid"
          initialValues={selectedVehicle}
          onFinish={(values) => {
            if (!selectedVehicle) return;
            const vehicle = vehicleFromIntakeValues(values, selectedVehicle.id);
            const blockReason = vehicleCreateBlockReason(vehicle, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            onUpdate(vehicle);
          }}
        >
          <Form.Item name="id" label="Edit Vehicle"><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model}` }))} onChange={setEditVehicleId} /></Form.Item>
          <Form.Item name="plateNumber" label="Plate / 车牌" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>
          <Form.Item name="model" label="Model"><Input placeholder="Vios" /></Form.Item>
          <Form.Item name="year" label="Year"><InputNumber className="fullWidth" min={1990} max={2030} /></Form.Item>
          <Form.Item name="purchasePrice" label="Purchase / 收车价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="sellingPrice" label="Selling / 售价"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="bossConfirmed" label="Boss Confirm / 老板确认"><Select options={[{ value: true, label: "Confirmed" }, { value: false, label: "Pending" }]} /></Form.Item>
          <Form.Item name="contraRangePrice" label="Contra Range Price / Contra 价格范围"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ucdStatus" label="UCD Status Tracking"><Input placeholder="Ready / Pending / Submitted" /></Form.Item>
          <Form.Item name="additionalCharges" label="Additional Charges / 杂费"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="refurbishmentTotal" label="Refurbishment Total / 整备预算"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="commissionTotal" label="Commission / 佣金"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupAllowance" label="Outstation Pickup Allowance / 外地收车津贴"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationPickupScheduledAt" label="Outstation Pickup Date & Time / 外地收车时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="outstationPickupBookingSlip" label="Booking Slip Reference / Booking Slip"><Input placeholder="Booking slip no. or file ref" /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select customer" options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} />
          </Form.Item>
          <Form.Item name="ownerId" label="Owner / 原车主">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select owner" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} />
          </Form.Item>
          <Form.Item name="stockOwner" label="Stock"><Select options={["YSHeng", "KS"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Available", "LoanProcessing", "Sold"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="isPublic" label="Website Visible"><Select options={[{ value: true, label: "Visible" }, { value: false, label: "Hidden" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedVehicle}>Update Vehicle</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Purchase Invoice / 收车发票">
        <Table rowKey="id" columns={purchaseInvoiceColumns} dataSource={purchaseInvoices} pagination={{ pageSize: 5 }} scroll={{ x: 560 }} />
        <Form layout="vertical" className="formGrid" onFinish={async (values) => {
          const invoice: PurchaseInvoice = {
            id: newId(),
            vehicleId: values.vehicleId,
            invoiceNumber: values.invoiceNumber,
            amount: Number(values.amount ?? 0)
          };
          const blockReason = purchaseInvoiceCreateBlockReason(invoice, purchaseInvoices);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          await onCreatePurchaseInvoice(invoice);
        }} initialValues={{ vehicleId: vehicles[0]?.id }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Purchase Invoice</Button></Form.Item>
        </Form>
        <Form
          key={selectedPurchaseInvoice?.id ?? "purchase-invoice-edit"}
          layout="vertical"
          className="formGrid"
          initialValues={selectedPurchaseInvoice}
          onFinish={async (values) => {
            if (!selectedPurchaseInvoice) return;
            const invoice: PurchaseInvoice = {
              ...selectedPurchaseInvoice,
              vehicleId: values.vehicleId,
              invoiceNumber: values.invoiceNumber,
              amount: Number(values.amount ?? 0)
            };
            const blockReason = purchaseInvoiceCreateBlockReason(invoice, purchaseInvoices);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            await onUpdatePurchaseInvoice(invoice);
          }}
        >
          <Form.Item name="id" label="Edit Purchase Invoice"><Select options={purchaseInvoices.map((invoice) => ({ value: invoice.id, label: `${plateFor(vehicles, invoice.vehicleId)} / ${invoice.invoiceNumber}` }))} onChange={setEditPurchaseInvoiceId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice Number" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="Purchase Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedPurchaseInvoice}>Update Purchase Invoice</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Customer & Owner Details / 客户与原车主">
        <Tabs
          items={[
            {
              key: "customers",
              label: "Customers",
              children: (
                <Space direction="vertical" size={16} className="fullWidth">
                  <Table rowKey="id" columns={customerColumns} dataSource={customers} pagination={{ pageSize: 5 }} scroll={{ x: 720 }} />
                  <Form layout="vertical" className="formGrid" onFinish={(values) => {
                    const customer: Customer = {
                      id: newId(),
                      name: values.name,
                      phone: values.phone,
                      icNumber: values.icNumber,
                      email: values.email,
                      address: values.address,
                      notes: values.notes
                    };
                    const blockReason = customerCreateBlockReason(customer, customers);
                    if (blockReason) {
                      message.warning(blockReason);
                      return;
                    }

                    onCreateCustomer(customer);
                  }}>
                    <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="icNumber" label="IC / 身份证"><Input /></Form.Item>
                    <Form.Item name="email" label="Email"><Input /></Form.Item>
                    <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
                    <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Customer</Button></Form.Item>
                  </Form>
                  <Form
                    key={selectedCustomer?.id ?? "customer-edit"}
                    layout="vertical"
                    className="formGrid"
                    initialValues={selectedCustomer}
                    onFinish={(values) => {
                      if (!selectedCustomer) return;
                      const customer: Customer = {
                        ...selectedCustomer,
                        name: values.name,
                        phone: values.phone,
                        icNumber: values.icNumber,
                        email: values.email,
                        address: values.address,
                        notes: values.notes
                      };
                      const blockReason = customerCreateBlockReason(customer, customers);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      onUpdateCustomer(customer);
                    }}
                  >
                    <Form.Item name="id" label="Edit Customer"><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} onChange={setEditCustomerId} /></Form.Item>
                    <Form.Item name="name" label="Customer Name / 客户姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="icNumber" label="IC / 身份证"><Input /></Form.Item>
                    <Form.Item name="email" label="Email"><Input /></Form.Item>
                    <Form.Item name="address" label="Address / 地址"><Input placeholder="Customer address for invoice/delivery" /></Form.Item>
                    <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Customer detail note" /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedCustomer}>Update Customer</Button></Form.Item>
                  </Form>
                </Space>
              )
            },
            {
              key: "owners",
              label: "Owners",
              children: (
                <Space direction="vertical" size={16} className="fullWidth">
                  <Table rowKey="id" columns={ownerColumns} dataSource={owners} pagination={{ pageSize: 5 }} scroll={{ x: 520 }} />
                  <Form layout="vertical" className="formGrid" onFinish={(values) => {
                    const owner: Owner = {
                      id: newId(),
                      name: values.name,
                      phone: values.phone
                    };
                    const blockReason = ownerCreateBlockReason(owner, owners);
                    if (blockReason) {
                      message.warning(blockReason);
                      return;
                    }

                    onCreateOwner(owner);
                  }}>
                    <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Owner</Button></Form.Item>
                  </Form>
                  <Form
                    key={selectedOwner?.id ?? "owner-edit"}
                    layout="vertical"
                    className="formGrid"
                    initialValues={selectedOwner}
                    onFinish={(values) => {
                      if (!selectedOwner) return;
                      const owner: Owner = {
                        ...selectedOwner,
                        name: values.name,
                        phone: values.phone
                      };
                      const blockReason = ownerCreateBlockReason(owner, owners);
                      if (blockReason) {
                        message.warning(blockReason);
                        return;
                      }

                      onUpdateOwner(owner);
                    }}
                  >
                    <Form.Item name="id" label="Edit Owner"><Select options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} onChange={setEditOwnerId} /></Form.Item>
                    <Form.Item name="name" label="Owner Name / 原车主姓名" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="phone" label="Phone / 电话" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedOwner}>Update Owner</Button></Form.Item>
                  </Form>
                </Space>
              )
            }
          ]}
        />
      </ProCard>
      <ProCard title="Photo & Document Upload / 照片与文件上传">
        <Form layout="vertical" className="formGrid">
          <Form.Item label="Car Plate">
            <Select
              value={selectedVehicleId || undefined}
              placeholder="Select vehicle"
              options={vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} - ${vehicle.make} ${vehicle.model}` }))}
              onChange={setUploadVehicleId}
            />
          </Form.Item>
          <Form.Item label="Website Photo">
            <Upload
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadDisabled}
              maxCount={1}
              showUploadList={false}
              customRequest={(option) => {
                void onUploadPhoto(selectedVehicleId, option.file as File)
                  .then(async () => {
                    await loadUploads();
                    option.onSuccess?.({}, option.file);
                  })
                  .catch((error: Error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={uploadDisabled}>Upload Website Photo</Button>
            </Upload>
          </Form.Item>
          <Form.Item label="Document Type">
            <Select<DocumentCategory>
              value={documentCategory}
              onChange={setDocumentCategory}
              options={[
                { value: "PurchaseInvoice", label: "Purchase Invoice" },
                { value: "Voc", label: "VOC" },
                { value: "ApDocument", label: "AP Document" },
                { value: "StatusReceipt", label: "Status Receipt" },
                { value: "LoanDocument", label: "Loan Document" },
                { value: "DeliveryDocument", label: "Delivery Document" },
                { value: "Policy", label: "Policy" },
                { value: "RoadTaxReceipt", label: "Road Tax Receipt" },
                { value: "RepairInvoice", label: "Repair Invoice" }
              ]}
            />
          </Form.Item>
          <Form.Item label="Document Upload">
            <Upload
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              disabled={uploadDisabled}
              maxCount={1}
              showUploadList={false}
              customRequest={(option) => {
                void onUploadDocument(selectedVehicleId, option.file as File, documentCategory)
                  .then(async () => {
                    await loadUploads();
                    option.onSuccess?.({}, option.file);
                  })
                  .catch((error: Error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={uploadDisabled}>Upload Document</Button>
            </Upload>
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          columns={photoColumns}
          dataSource={photos}
          pagination={false}
          scroll={{ x: 820 }}
        />
        <Table
          rowKey="id"
          columns={documentColumns}
          dataSource={documents}
          pagination={false}
          scroll={{ x: 760 }}
        />
      </ProCard>
    </Space>
  );
}

function RepairPage({
  vehicles,
  supplierInvoices,
  repairs,
  onCreateInvoice,
  onUpdateInvoice,
  onCreateRepair,
  onUpdateRepair,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  supplierInvoices: SupplierInvoice[];
  repairs: RepairJob[];
  onCreateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onUpdateInvoice: (invoice: SupplierInvoice) => Promise<void>;
  onCreateRepair: (repair: RepairJob) => Promise<void>;
  onUpdateRepair: (repair: RepairJob) => Promise<void>;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadRepairId, setUploadRepairId] = useState(repairs[0]?.id ?? "");
  const [editSupplierInvoiceId, setEditSupplierInvoiceId] = useState(supplierInvoices[0]?.id ?? "");
  const [editRepairId, setEditRepairId] = useState(repairs[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("RepairInvoice");
  const selectedRepair = repairs.find((repair) => repair.id === uploadRepairId) ?? repairs[0];
  const selectedSupplierInvoice = supplierInvoices.find((invoice) => invoice.id === editSupplierInvoiceId) ?? supplierInvoices[0];
  const selectedEditRepair = repairs.find((repair) => repair.id === editRepairId) ?? repairs[0];

  useEffect(() => {
    if (!uploadRepairId && repairs[0]?.id) {
      setUploadRepairId(repairs[0].id);
    }
  }, [uploadRepairId, repairs]);

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

  const columns: ColumnsType<SupplierInvoice> = [
    { title: "Invoice Plate / Plate", dataIndex: "plateNumberOnInvoice", render: (value) => value || "-" },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Supplier / 供应商", dataIndex: "supplierName" },
    { title: "Invoice / 单据", dataIndex: "invoiceNumber" },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Validation / 检查", render: (_, row) => <Tag color={row.invoiceNumber ? "green" : "red"}>{row.invoiceNumber ? "Plate-linked" : "Missing invoice"}</Tag> },
    { title: "Action / 操作", fixed: "right", width: 90, render: (_, row) => <Button size="small" onClick={() => setEditSupplierInvoiceId(row.id)}>Edit</Button> }
  ];
  const repairColumns: ColumnsType<RepairJob> = [
    { title: "Repair Part / 配件", dataIndex: "repairPart", render: (value) => value || "-" },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "What To Do / 整备事项", dataIndex: "whatToDo" },
    { title: "Cost / 费用", dataIndex: "cost", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Checklist / 检查表", dataIndex: "checklistDone", render: (done) => <Tag color={done ? "green" : "orange"}>{done ? "Done" : "Pending"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdateRepair({ ...row, checklistDone: true })} disabled={row.checklistDone}>Mark Done</Button>
          <Button size="small" onClick={() => setEditRepairId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const pendingRepairs = repairs.filter((repair) => !repair.checklistDone).length;
  const repairTotal = repairs.reduce((sum, repair) => sum + repair.cost, 0);

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <div className="metricGrid">
        <Metric label="Repair Tasks / 整备事项" value={repairs.length} />
        <Metric label="Pending Checklist / 未完成检查" value={pendingRepairs} />
        <Metric label="Repair Cost / 整备费用" value={`RM ${repairTotal.toLocaleString()}`} />
      </div>
      <ProCard title="Repair Checklist / 整备检查表">
        <Table rowKey="id" columns={repairColumns} dataSource={repairs} pagination={false} scroll={{ x: 760 }} />
      </ProCard>
      <ProCard title="Supplier & Refurbishment / 供应商与整备">
        <Table rowKey="id" columns={columns} dataSource={supplierInvoices} pagination={false} scroll={{ x: 760 }} />
        <Form
          key={selectedSupplierInvoice?.id ?? "supplier-invoice-edit"}
          layout="vertical"
          className="formGrid"
          initialValues={selectedSupplierInvoice}
          onFinish={async (values) => {
            if (!selectedSupplierInvoice) return;
            const invoice: SupplierInvoice = {
              ...selectedSupplierInvoice,
              vehicleId: values.vehicleId,
              supplierName: values.supplierName,
              invoiceNumber: values.invoiceNumber,
              plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined,
              amount: Number(values.amount ?? 0)
            };
            const blockReason = supplierInvoiceCreateBlockReason(invoice, supplierInvoices, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }

            await onUpdateInvoice(invoice);
          }}
        >
          <Form.Item name="id" label="Edit Supplier Invoice"><Select options={supplierInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.supplierName} / ${invoice.invoiceNumber}` }))} onChange={setEditSupplierInvoiceId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="supplierName" label="Supplier" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="plateNumberOnInvoice" label="Plate on Supplier Invoice / Invoice Plate"><Input placeholder="Plate printed on invoice" /></Form.Item>
          <Form.Item name="amount" label="Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedSupplierInvoice}>Update Supplier Invoice</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Repair Task Entry / 整备事项">
        <Form layout="vertical" className="formGrid" onFinish={async (values) => {
          const invoice: SupplierInvoice = { id: newId(), vehicleId: values.vehicleId, supplierName: values.supplierName, invoiceNumber: values.invoiceNumber, plateNumberOnInvoice: values.plateNumberOnInvoice?.trim() || undefined, amount: Number(values.amount ?? 0) };
          const blockReason = supplierInvoiceCreateBlockReason(invoice, supplierInvoices, vehicles);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }

          const repair: RepairJob = { id: newId(), vehicleId: values.vehicleId, repairPart: values.repairPart, whatToDo: values.whatToDo, cost: invoice.amount, checklistDone: values.checklistDone === "done" };
          const repairBlockReason = repairCreateBlockReason(repair);
          if (repairBlockReason) {
            message.warning(repairBlockReason);
            return;
          }

          await onCreateInvoice(invoice);
          await onCreateRepair(repair);
        }} initialValues={{ vehicleId: vehicles[0]?.id, checklistDone: "pending" }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="supplierName" label="Supplier" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="plateNumberOnInvoice" label="Plate on Supplier Invoice / Invoice Plate"><Input placeholder="Plate printed on invoice" /></Form.Item>
          <Form.Item name="amount" label="Amount"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="repairPart" label="Repair Part / 配件"><Input placeholder="Spare part / bumper / tyre" /></Form.Item>
          <Form.Item name="whatToDo" label="What To Do"><Input placeholder="Polish, wash, spare part..." /></Form.Item>
          <Form.Item name="checklistDone" label="Checklist"><Select options={[{ value: "done", label: "Done" }, { value: "pending", label: "Pending" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Repair</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Edit Repair Task / 修改整备事项">
        <Form
          key={selectedEditRepair?.id ?? "repair-edit"}
          layout="vertical"
          className="formGrid"
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

            await onUpdateRepair(repair);
          }}
        >
          <Form.Item name="id" label="Edit Repair"><Select options={repairs.map((repair) => ({ value: repair.id, label: `${plateFor(vehicles, repair.vehicleId)} / ${repair.whatToDo}` }))} onChange={setEditRepairId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="repairPart" label="Repair Part / 配件"><Input placeholder="Spare part / bumper / tyre" /></Form.Item>
          <Form.Item name="whatToDo" label="What To Do"><Input placeholder="Polish, wash, spare part..." /></Form.Item>
          <Form.Item name="cost" label="Cost"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="checklistDone" label="Checklist"><Select options={[{ value: "done", label: "Done" }, { value: "pending", label: "Pending" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditRepair}>Update Repair</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Repair Documents / 整备文件">
        <Space direction="vertical" size={12} className="fullWidth">
          <Space wrap>
            <Select
              value={selectedRepair?.id}
              onChange={setUploadRepairId}
              placeholder="Select repair"
              style={{ minWidth: 180 }}
              options={repairs.map((repair) => ({ value: repair.id, label: `${plateFor(vehicles, repair.vehicleId)} / ${repair.whatToDo}` }))}
            />
            <Select<DocumentCategory>
              value={documentCategory}
              onChange={setDocumentCategory}
              style={{ minWidth: 180 }}
              options={repairDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
            />
            <Upload
              showUploadList={false}
              disabled={!selectedRepair}
              customRequest={(option) => {
                if (!selectedRepair) return;
                void onUploadDocument(selectedRepair.vehicleId, option.file as File, documentCategory)
                  .then(() => option.onSuccess?.({ ok: true }))
                  .catch((error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={!selectedRepair}>Upload Repair Invoice</Button>
            </Upload>
          </Space>
          <Alert type="info" showIcon message="Upload supplier repair invoices against the linked car plate for audit and profit tracking." />
        </Space>
      </ProCard>
    </Space>
  );
}

function LoanPage({
  vehicles,
  customers,
  loans,
  onCreate,
  onUpdate,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  customers: Customer[];
  loans: LoanApplication[];
  onCreate: (loan: LoanApplication) => void;
  onUpdate: (loan: LoanApplication) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [documentChecks, setDocumentChecks] = useState<Record<string, LoanDocumentCheck>>({});
  const [uploadLoanId, setUploadLoanId] = useState(loans[0]?.id ?? "");
  const [editLoanId, setEditLoanId] = useState(loans[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("LoanDocument");
  const selectedLoan = loans.find((loan) => loan.id === uploadLoanId) ?? loans[0];
  const selectedEditLoan = loans.find((loan) => loan.id === editLoanId) ?? loans[0];
  const loanIds = useMemo(() => loans.map((loan) => loan.id).join(","), [loans]);

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
  }, [loanIds, loans]);

  useEffect(() => {
    if (!uploadLoanId && loans[0]?.id) {
      setUploadLoanId(loans[0].id);
    }
  }, [uploadLoanId, loans]);

  useEffect(() => {
    if (!editLoanId && loans[0]?.id) {
      setEditLoanId(loans[0].id);
    }
  }, [editLoanId, loans]);

  const columns: ColumnsType<LoanApplication> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Pending" ? "orange" : "green"}>{status}</Tag> },
    { title: "LOU", render: (_, row) => <Space><Badge status={row.louApproved ? "success" : "default"} text="Approve" /><Badge status={row.louDone ? "success" : "warning"} text="Done" /></Space> },
    {
      title: "Documents / 文件",
      render: (_, row) => {
        const check = documentChecks[row.id];
        if (!check) return <Tag>Checking</Tag>;
        return check.isComplete
          ? <Tag color="green">Complete</Tag>
          : <Space wrap>{check.missingCategories.map((category) => <Tag key={category} color="red">{documentCategoryLabel(category)}</Tag>)}</Space>;
      }
    },
    { title: "Submitted / 提交", dataIndex: "submittedAt" },
    { title: "3 Days Follow Up", render: (_, row) => <Tag color={row.status === "Pending" ? "orange" : "default"}>{row.status === "Pending" ? "Reminder Active" : "No reminder"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 170,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdate(markLoanApproved(row))} disabled={row.status === "Approved" || row.status === "Done"}>Approve</Button>
          <Button size="small" onClick={() => onUpdate(markLoanDone(row))} disabled={row.status === "Done"}>Done</Button>
          <Button size="small" onClick={() => setEditLoanId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="Loan Workflow / 贷款流程">
        <Table rowKey="id" columns={columns} dataSource={loans} pagination={false} scroll={{ x: 760 }} />
      </ProCard>
      <ProCard title="Submit Loan / 提交贷款">
        <Form layout="vertical" className="formGrid" onFinish={(values) => {
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
          <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected", "Done"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="submittedAt" label="Submitted Date" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Submit Loan</Button></Form.Item>
        </Form>
        <Form
          key={selectedEditLoan?.id ?? "loan-edit"}
          layout="vertical"
          className="formGrid"
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

            onUpdate(loan);
          }}
        >
          <Form.Item name="id" label="Edit Loan"><Select options={loans.map((loan) => ({ value: loan.id, label: `${plateFor(vehicles, loan.vehicleId)} / ${loan.status}` }))} onChange={setEditLoanId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select customer"
              options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Draft", "Pending", "Approved", "Rejected", "Done"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="submittedAt" label="Submitted Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="louApproved" label="LOU Approve"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item name="louDone" label="LOU Done"><Select options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditLoan}>Update Loan</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Loan Documents / 贷款文件">
        <Space direction="vertical" size={12} className="fullWidth">
          <Space wrap>
            <Select
              value={selectedLoan?.id}
              onChange={setUploadLoanId}
              placeholder="Select loan"
              style={{ minWidth: 180 }}
              options={loans.map((loan) => ({ value: loan.id, label: `${plateFor(vehicles, loan.vehicleId)} / ${loan.status}` }))}
            />
            <Select<DocumentCategory>
              value={documentCategory}
              onChange={setDocumentCategory}
              style={{ minWidth: 180 }}
              options={loanDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
            />
            <Upload
              showUploadList={false}
              disabled={!selectedLoan}
              customRequest={(option) => {
                if (!selectedLoan) return;
                void onUploadDocument(selectedLoan.vehicleId, option.file as File, documentCategory)
                  .then(() => option.onSuccess?.({ ok: true }))
                  .catch((error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={!selectedLoan}>Upload Loan Document</Button>
            </Upload>
          </Space>
          <Alert
            type="info"
            showIcon
            message="Upload VOC, AP Document, Status Receipt, and Loan Document before completing loan follow-up."
          />
        </Space>
      </ProCard>
    </Space>
  );
}

function DeliveryPage({
  vehicles,
  deliveries,
  onCreate,
  onUpdate,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  deliveries: DeliverySchedule[];
  onCreate: (delivery: DeliverySchedule) => void;
  onUpdate: (delivery: DeliverySchedule) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [releaseReadiness, setReleaseReadiness] = useState<Record<string, DeliveryReleaseReadiness>>({});
  const [uploadDeliveryId, setUploadDeliveryId] = useState(deliveries[0]?.id ?? "");
  const [editDeliveryId, setEditDeliveryId] = useState(deliveries[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("Policy");
  const selectedDelivery = deliveries.find((delivery) => delivery.id === uploadDeliveryId) ?? deliveries[0];
  const selectedEditDelivery = deliveries.find((delivery) => delivery.id === editDeliveryId) ?? deliveries[0];

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
  }, [deliveries]);

  useEffect(() => {
    if (!uploadDeliveryId && deliveries[0]?.id) {
      setUploadDeliveryId(deliveries[0].id);
    }
  }, [uploadDeliveryId, deliveries]);

  useEffect(() => {
    if (!editDeliveryId && deliveries[0]?.id) {
      setEditDeliveryId(deliveries[0].id);
    }
  }, [editDeliveryId, deliveries]);

  const columns: ColumnsType<DeliverySchedule> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "PIC", dataIndex: "pic" },
    { title: "Notification / Notify", dataIndex: "notificationSent", render: (sent) => <Tag color={sent ? "green" : "orange"}>{sent ? "Sent" : "Pending"}</Tag> },
    { title: "Schedule / 时间", dataIndex: "scheduledDate" },
    { title: "Status / 状态", dataIndex: "status" },
    { title: "Booking / 预约", dataIndex: "inspectionBookingReference", render: (value) => value || "-" },
    { title: "Inspection Report / 检查报告", dataIndex: "inspectionReportReference", render: (value) => value || "-" },
    { title: "Policy / 保单", dataIndex: "insurancePolicyReference", render: (value) => value || "-" },
    { title: "Road Tax Receipt / 路税收据", dataIndex: "roadTaxReceiptReference", render: (value) => value || "-" },
    { title: "Windscreen / 挡风玻璃", dataIndex: "windscreenPolicyReference", render: (value) => value || "-" },
    {
      title: "Release Ready / 可出车",
      render: (_, row) => {
        const readiness = releaseReadiness[row.id];
        const ready = readiness?.isReady ?? isDeliveryReady(row);
        return (
          <Space direction="vertical" size={4}>
            <Tag color={ready ? "green" : "red"}>{ready ? "Ready" : "Blocked"}</Tag>
            {readiness && readiness.missingCategories.length > 0 && (
              <Space wrap>{readiness.missingCategories.map((category) => <Tag key={category} color="red">{documentCategoryLabel(category)}</Tag>)}</Space>
            )}
          </Space>
        );
      }
    },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdate(markNotificationSent(row))} disabled={!canMarkNotificationSent(row)}>Notify</Button>
          <Button size="small" onClick={() => onUpdate(markTwoDayNoticeSent(row))} disabled={!canMarkTwoDayNoticeSent(row)}>Notice</Button>
          <Button size="small" onClick={() => onUpdate(markDeliveryReady(row))} disabled={!canMarkDeliveryReady(row) || Boolean(releaseReadiness[row.id]?.missingCategories.length)}>Ready</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Released" })} disabled={!canReleaseDelivery(row) || Boolean(releaseReadiness[row.id]?.missingCategories.length)}>Release</Button>
          <Button size="small" onClick={() => setEditDeliveryId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="Delivery Workflow / 出车流程">
        <Table rowKey="id" columns={columns} dataSource={deliveries} pagination={false} scroll={{ x: 760 }} />
      </ProCard>
      <ProCard title="Schedule Delivery / 安排出车">
        <Form layout="vertical" className="formGrid" onFinish={(values) => {
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
            roadTaxHandled: values.roadTaxHandled,
            roadTaxReceiptReference: values.roadTaxReceiptReference?.trim() || undefined,
            windscreenInsuranceHandled: values.windscreenInsuranceHandled,
            windscreenPolicyReference: values.windscreenPolicyReference?.trim() || undefined
          };
          const blockReason = deliveryCreateBlockReason(delivery);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(delivery);
        }} initialValues={{ vehicleId: vehicles[0]?.id, status: "Scheduled", scheduledDate: today(), inspectionBookingReference: "", inspectionReportReference: "", insurancePolicyReference: "", roadTaxReceiptReference: "", windscreenPolicyReference: "", polishDone: false, tintedDone: false, washDone: false, documentsPrepared: false, inspectionDone: false, notificationSent: false, twoDayNoticeSent: false, insuranceHandled: false, roadTaxHandled: false, windscreenInsuranceHandled: false }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="pic" label="PIC" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scheduledDate" label="Schedule Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="inspectionBookingReference" label="Inspection Booking Reference / 验车预约编号"><Input placeholder="Booking slip no. or appointment reference" /></Form.Item>
          <Form.Item name="inspectionReportReference" label="Inspection Report Reference / 检查报告编号"><Input placeholder="Report no. or uploaded file reference" /></Form.Item>
          <Form.Item name="insurancePolicyReference" label="Insurance Policy Reference / 保险保单编号"><Input placeholder="Policy no. or cover note reference" /></Form.Item>
          <Form.Item name="roadTaxReceiptReference" label="Road Tax Receipt Reference / 路税收据编号"><Input placeholder="Road tax receipt no." /></Form.Item>
          <Form.Item name="windscreenPolicyReference" label="Windscreen Policy Reference / 挡风玻璃保单编号"><Input placeholder="Windscreen policy reference" /></Form.Item>
          {deliveryChecklistFields.map((field) => (
            <Form.Item key={field} name={field} label={deliveryFieldLabels[field]}><Select options={[{ value: true, label: "Done" }, { value: false, label: "Pending" }]} /></Form.Item>
          ))}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Schedule</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Edit Delivery / 修改出车安排">
        <Form
          key={selectedEditDelivery?.id ?? "delivery-edit"}
          layout="vertical"
          className="formGrid"
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
              roadTaxHandled: values.roadTaxHandled,
              roadTaxReceiptReference: values.roadTaxReceiptReference?.trim() || undefined,
              windscreenInsuranceHandled: values.windscreenInsuranceHandled,
              windscreenPolicyReference: values.windscreenPolicyReference?.trim() || undefined
            };
            const blockReason = deliveryCreateBlockReason(delivery);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onUpdate(delivery);
          }}
        >
          <Form.Item name="id" label="Edit Delivery"><Select options={deliveries.map((delivery) => ({ value: delivery.id, label: `${plateFor(vehicles, delivery.vehicleId)} / ${delivery.status}` }))} onChange={setEditDeliveryId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="pic" label="PIC" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scheduledDate" label="Schedule Date"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["BookingInspection", "Scheduled", "Inspection", "PreparingDocuments", "CarPreparation", "ReadyForRelease", "Released"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="inspectionBookingReference" label="Inspection Booking Reference / 验车预约编号"><Input placeholder="Booking slip no. or appointment reference" /></Form.Item>
          <Form.Item name="inspectionReportReference" label="Inspection Report Reference / 检查报告编号"><Input placeholder="Report no. or uploaded file reference" /></Form.Item>
          <Form.Item name="insurancePolicyReference" label="Insurance Policy Reference / 保险保单编号"><Input placeholder="Policy no. or cover note reference" /></Form.Item>
          <Form.Item name="roadTaxReceiptReference" label="Road Tax Receipt Reference / 路税收据编号"><Input placeholder="Road tax receipt no." /></Form.Item>
          <Form.Item name="windscreenPolicyReference" label="Windscreen Policy Reference / 挡风玻璃保单编号"><Input placeholder="Windscreen policy reference" /></Form.Item>
          {deliveryChecklistFields.map((field) => (
            <Form.Item key={field} name={field} label={deliveryFieldLabels[field]}><Select options={[{ value: true, label: "Done" }, { value: false, label: "Pending" }]} /></Form.Item>
          ))}
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDelivery}>Update Delivery</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Delivery Documents / 出车文件">
        <Space direction="vertical" size={12} className="fullWidth">
          <Space wrap>
            <Select
              value={selectedDelivery?.id}
              onChange={setUploadDeliveryId}
              placeholder="Select delivery"
              style={{ minWidth: 180 }}
              options={deliveries.map((delivery) => ({ value: delivery.id, label: plateFor(vehicles, delivery.vehicleId) }))}
            />
            <Select<DocumentCategory>
              value={documentCategory}
              onChange={setDocumentCategory}
              style={{ minWidth: 180 }}
              options={deliveryDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
            />
            <Upload
              showUploadList={false}
              disabled={!selectedDelivery}
              customRequest={(option) => {
                if (!selectedDelivery) return;
                void onUploadDocument(selectedDelivery.vehicleId, option.file as File, documentCategory)
                  .then(() => option.onSuccess?.({ ok: true }))
                  .catch((error) => option.onError?.(error));
              }}
            >
              <Button icon={<UploadOutlined />} disabled={!selectedDelivery}>Upload Delivery Document</Button>
            </Upload>
          </Space>
          <Alert
            type="info"
            showIcon
            message="Upload Policy and Road Tax Receipt before marking a delivery Ready or Released."
          />
        </Space>
      </ProCard>
      <ProCard title="Final Checklist / 最后核对">
        <div className="checklistGrid">
          {deliveries[0] ? deliveryChecklist(deliveries[0]).map((item) => (
            <div className="checkItem" key={item.label}><Badge status={item.done ? "success" : "error"} text={item.label} /></div>
          )) : <Typography.Text>No delivery scheduled.</Typography.Text>}
        </div>
      </ProCard>
    </Space>
  );
}

function FinancePage({
  vehicles,
  customers,
  owners,
  payments,
  settlements,
  dailySpends,
  brokerCommissions,
  debtRecoveries,
  paymentVouchers,
  onCreate,
  onUpdate,
  onCreateSettlement,
  onUpdateSettlement,
  onCreateDailySpend,
  onUpdateDailySpend,
  onCreateBrokerCommission,
  onUpdateBrokerCommission,
  onCreateDebtRecovery,
  onUpdateDebtRecovery,
  onCreatePaymentVoucher,
  onUpdatePaymentVoucher,
  onUploadDocument
}: {
  vehicles: VehicleLookup[];
  customers: Customer[];
  owners: Owner[];
  payments: PaymentRecord[];
  settlements: SettlementReminder[];
  dailySpends: DailySpend[];
  brokerCommissions: BrokerCommission[];
  debtRecoveries: DebtRecoveryCase[];
  paymentVouchers: PaymentVoucher[];
  onCreate: (payment: PaymentRecord) => void;
  onUpdate: (payment: PaymentRecord) => void;
  onCreateSettlement: (settlement: SettlementReminder) => void;
  onUpdateSettlement: (settlement: SettlementReminder) => void;
  onCreateDailySpend: (spend: DailySpend) => void;
  onUpdateDailySpend: (spend: DailySpend) => void;
  onCreateBrokerCommission: (commission: BrokerCommission) => void;
  onUpdateBrokerCommission: (commission: BrokerCommission) => void;
  onCreateDebtRecovery: (debt: DebtRecoveryCase) => void;
  onUpdateDebtRecovery: (debt: DebtRecoveryCase) => void;
  onCreatePaymentVoucher: (voucher: PaymentVoucher) => void;
  onUpdatePaymentVoucher: (voucher: PaymentVoucher) => void;
  onUploadDocument: (vehicleId: string, file: File, category: DocumentCategory) => Promise<void>;
}) {
  const [uploadPaymentId, setUploadPaymentId] = useState(payments[0]?.id ?? "");
  const [editPaymentId, setEditPaymentId] = useState(payments[0]?.id ?? "");
  const [editSettlementId, setEditSettlementId] = useState(settlements[0]?.id ?? "");
  const [editDailySpendId, setEditDailySpendId] = useState(dailySpends[0]?.id ?? "");
  const [editBrokerCommissionId, setEditBrokerCommissionId] = useState(brokerCommissions[0]?.id ?? "");
  const [editDebtRecoveryId, setEditDebtRecoveryId] = useState(debtRecoveries[0]?.id ?? "");
  const [editPaymentVoucherId, setEditPaymentVoucherId] = useState(paymentVouchers[0]?.id ?? "");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("PaymentReceipt");
  const selectedPayment = payments.find((payment) => payment.id === uploadPaymentId) ?? payments[0];
  const selectedEditPayment = payments.find((payment) => payment.id === editPaymentId) ?? payments[0];
  const selectedEditSettlement = settlements.find((settlement) => settlement.id === editSettlementId) ?? settlements[0];
  const selectedEditDailySpend = dailySpends.find((spend) => spend.id === editDailySpendId) ?? dailySpends[0];
  const selectedEditBrokerCommission = brokerCommissions.find((commission) => commission.id === editBrokerCommissionId) ?? brokerCommissions[0];
  const selectedEditDebtRecovery = debtRecoveries.find((debt) => debt.id === editDebtRecoveryId) ?? debtRecoveries[0];
  const selectedEditPaymentVoucher = paymentVouchers.find((voucher) => voucher.id === editPaymentVoucherId) ?? paymentVouchers[0];

  useEffect(() => {
    if (!uploadPaymentId && payments[0]?.id) {
      setUploadPaymentId(payments[0].id);
    }
  }, [uploadPaymentId, payments]);

  useEffect(() => {
    if (!editPaymentId && payments[0]?.id) {
      setEditPaymentId(payments[0].id);
    }
  }, [editPaymentId, payments]);

  useEffect(() => {
    if (!editSettlementId && settlements[0]?.id) {
      setEditSettlementId(settlements[0].id);
    }
  }, [editSettlementId, settlements]);

  useEffect(() => {
    if (!editDailySpendId && dailySpends[0]?.id) {
      setEditDailySpendId(dailySpends[0].id);
    }
  }, [editDailySpendId, dailySpends]);

  useEffect(() => {
    if (!editBrokerCommissionId && brokerCommissions[0]?.id) {
      setEditBrokerCommissionId(brokerCommissions[0].id);
    }
  }, [editBrokerCommissionId, brokerCommissions]);

  useEffect(() => {
    if (!editDebtRecoveryId && debtRecoveries[0]?.id) {
      setEditDebtRecoveryId(debtRecoveries[0].id);
    }
  }, [editDebtRecoveryId, debtRecoveries]);

  useEffect(() => {
    if (!editPaymentVoucherId && paymentVouchers[0]?.id) {
      setEditPaymentVoucherId(paymentVouchers[0].id);
    }
  }, [editPaymentVoucherId, paymentVouchers]);

  const columns: ColumnsType<PaymentRecord> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Nett Price / 净价", dataIndex: "nettPrice", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Reconciled" ? "green" : "orange"}>{status}</Tag> },
    { title: "Receipt", dataIndex: "receiptNumber", render: (value) => value || "-" },
    { title: "Invoice", dataIndex: "invoiceNumber", render: (value) => value || "-" },
    { title: "Boss Check", dataIndex: "bossChecked", render: (value) => <Tag color={value ? "green" : "orange"}>{value ? "Checked" : "Pending"}</Tag> },
    { title: "Finance Checklist", render: (_, row) => <Space wrap>{paymentChecklistTags(row)}</Space> },
    { title: "NCD / 无索偿折扣", dataIndex: "ncdAmount", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: "Windscreen / 挡风玻璃", dataIndex: "windscreenCharges", render: (value) => `RM ${Number(value ?? 0).toLocaleString()}` },
    { title: "Outstation Delivery / 外地送车", dataIndex: "outstationDeliveryDate", render: (value) => value || "-" },
    { title: "Bank", dataIndex: "bankName", render: (value) => value || "-" },
    { title: "Follow Up", dataIndex: "bankFollowUpDate", render: (value) => value || "-" },
    { title: "Created / 日期", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Disbursed" })} disabled={row.status === "Disbursed" || row.status === "Reconciled"}>Disbursed</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, bossChecked: true })} disabled={row.bossChecked || row.status === "Reconciled"}>Boss Check</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, documentsPrepared: true, checklistValidated: true, invoiceGenerated: true, autoCountKeyed: true })} disabled={row.status === "Reconciled" || (row.documentsPrepared && row.checklistValidated && row.invoiceGenerated && row.autoCountKeyed)}>Checklist</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Disbursed" })} disabled={!canCorrectReconciledPayment(row)}>Undo</Button>
          <Button size="small" title={paymentReconcileBlockReason(row, payments)} onClick={() => onUpdate({ ...row, status: "Reconciled" })} disabled={!canReconcilePayment(row, payments)}>Reconcile</Button>
          <Button size="small" onClick={() => setEditPaymentId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const settlementColumns: ColumnsType<SettlementReminder> = [
    { title: "Owner / Previous Owner", dataIndex: "ownerId", render: (ownerId) => contactFor(owners, ownerId) },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Deadline / 截止日期", dataIndex: "deadline" },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "red"}>{isPaid ? "Paid" : "Due"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 270,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdateSettlement({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Button size="small" onClick={() => onUpdateSettlement({ ...row, isPaid: false })} disabled={!canReopenPaidSettlement(row)}>Reopen</Button>
          <Button size="small" onClick={() => setEditSettlementId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const dailySpendColumns: ColumnsType<DailySpend> = [
    { title: "Description / 项目", dataIndex: "description" },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Due / 到期", dataIndex: "dueDate" },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "red"}>{isPaid ? "Paid" : "Due"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdateDailySpend({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Button size="small" onClick={() => onUpdateDailySpend({ ...row, isPaid: false })} disabled={!canReopenPaidDailySpend(row)}>Reopen</Button>
          <Button size="small" onClick={() => setEditDailySpendId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const brokerCommissionColumns: ColumnsType<BrokerCommission> = [
    {
      title: "CP58",
      render: (_, row) => row.cp58Required
        ? <Tag color={row.cp58Prepared ? "green" : "gold"}>{row.cp58Prepared ? "Prepared" : "Required"}</Tag>
        : <Tag>Not Required</Tag>
    },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Broker / 经纪人", dataIndex: "brokerName" },
    { title: "Commission / 佣金", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Status / 状态", dataIndex: "isPaid", render: (isPaid) => <Tag color={isPaid ? "green" : "orange"}>{isPaid ? "Paid" : "Unpaid"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 270,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, isPaid: true })} disabled={row.isPaid}>Mark Paid</Button>
          <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, cp58Required: true, cp58Prepared: true })} disabled={!row.cp58Required || row.cp58Prepared}>CP58</Button>
          <Button size="small" onClick={() => onUpdateBrokerCommission({ ...row, isPaid: false })} disabled={!row.isPaid}>Reopen</Button>
          <Button size="small" onClick={() => setEditBrokerCommissionId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const debtRecoveryColumns: ColumnsType<DebtRecoveryCase> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Customer / 客户", dataIndex: "customerId", render: (customerId) => customerLabel(customers, customerId) },
    { title: "Balance / 欠款", dataIndex: "balanceAmount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Follow Up / 跟进", dataIndex: "followUpDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Closed" ? "green" : status === "FollowedUp" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 210,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "FollowedUp" })} disabled={row.status !== "Open"}>Followed</Button>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "Closed" })} disabled={row.status === "Closed"}>Close</Button>
          <Button size="small" onClick={() => onUpdateDebtRecovery({ ...row, status: "Open" })} disabled={row.status === "Open"}>Reopen</Button>
          <Button size="small" onClick={() => setEditDebtRecoveryId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const paymentVoucherColumns: ColumnsType<PaymentVoucher> = [
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Payee / 收款人", dataIndex: "payeeName" },
    { title: "Purpose / 用途", dataIndex: "purpose" },
    { title: "Amount / 金额", dataIndex: "amount", render: (value) => `RM ${value.toLocaleString()}` },
    { title: "Issued / 日期", dataIndex: "issuedDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "Paid" ? "green" : status === "Approved" ? "blue" : "orange"}>{status}</Tag> },
    { title: "Notes / 备注", dataIndex: "notes", render: (value) => value || "-" },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 180,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Approved" })} disabled={row.status !== "Pending"}>Approve</Button>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Paid" })} disabled={row.status === "Paid"}>Paid</Button>
          <Button size="small" onClick={() => onUpdatePaymentVoucher({ ...row, status: "Pending" })} disabled={row.status === "Pending"}>Reopen</Button>
          <Button size="small" onClick={() => setEditPaymentVoucherId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];
  const outstanding = payments.filter((payment) => payment.status !== "Reconciled").reduce((sum, payment) => sum + payment.nettPrice, 0);
  const settlementOutstanding = settlements.filter((settlement) => !settlement.isPaid).reduce((sum, settlement) => sum + settlement.amount, 0);
  const dailySpendOutstanding = dailySpends.filter((spend) => !spend.isPaid).reduce((sum, spend) => sum + spend.amount, 0);
  const brokerCommissionOutstanding = brokerCommissions.filter((commission) => !commission.isPaid).reduce((sum, commission) => sum + commission.amount, 0);
  const debtOutstanding = debtRecoveries.filter((debt) => debt.status !== "Closed").reduce((sum, debt) => sum + debt.balanceAmount, 0);
  const voucherOutstanding = paymentVouchers.filter((voucher) => voucher.status !== "Paid").reduce((sum, voucher) => sum + voucher.amount, 0);

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title="Bank Collection / 收款Bank">
        <Table rowKey="id" columns={columns} dataSource={payments} pagination={false} scroll={{ x: 1040 }} />
      </ProCard>
      <ProCard title="Payment Entry / 收款记录">
        <Form layout="vertical" className="formGrid" onFinish={(values) => {
          const payment: PaymentRecord = {
            id: newId(),
            vehicleId: values.vehicleId,
            nettPrice: Number(values.nettPrice ?? 0),
            status: values.status,
            receiptNumber: values.receiptNumber,
            invoiceNumber: values.invoiceNumber,
            bossChecked: values.bossChecked,
            documentsPrepared: values.documentsPrepared,
            checklistValidated: values.checklistValidated,
            invoiceGenerated: values.invoiceGenerated,
            autoCountKeyed: values.autoCountKeyed,
            salesPrice: Number(values.salesPrice ?? 0),
            interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
            ncdAmount: Number(values.ncdAmount ?? 0),
            windscreenCharges: Number(values.windscreenCharges ?? 0),
            outstationDeliveryDate: values.outstationDeliveryDate,
            bankName: values.bankName,
            bankFollowUpDate: values.bankFollowUpDate,
            createdAt: new Date().toISOString()
          };
          const blockReason = paymentCreateBlockReason(payment, payments);
          if (blockReason) {
            message.warning(blockReason);
            return;
          }
          onCreate(payment);
        }} initialValues={{ vehicleId: vehicles[0]?.id, status: "Pending", bossChecked: false, documentsPrepared: false, checklistValidated: false, invoiceGenerated: false, autoCountKeyed: false }}>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="bossChecked" label="Boss Check"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Checked" }]} /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="invoiceGenerated" label="Invoice Generated"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="autoCountKeyed" label="AutoCount Key In"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ncdAmount" label="NCD / 无索偿折扣"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationDeliveryDate" label="Outstation Delivery Date / 外地送车日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Payment</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Edit Payment / 修改收款记录">
        <Form
          key={selectedEditPayment?.id ?? "payment-edit"}
          layout="vertical"
          className="formGrid"
          initialValues={selectedEditPayment}
          onFinish={(values) => {
            if (!selectedEditPayment) return;
            const payment: PaymentRecord = {
              ...selectedEditPayment,
              vehicleId: values.vehicleId,
              nettPrice: Number(values.nettPrice ?? 0),
              status: values.status,
              receiptNumber: values.receiptNumber?.trim() || undefined,
              invoiceNumber: values.invoiceNumber?.trim() || undefined,
              bossChecked: values.bossChecked,
              documentsPrepared: values.documentsPrepared,
              checklistValidated: values.checklistValidated,
              invoiceGenerated: values.invoiceGenerated,
              autoCountKeyed: values.autoCountKeyed,
              salesPrice: Number(values.salesPrice ?? 0),
              interestAdditionalCharges: Number(values.interestAdditionalCharges ?? 0),
              ncdAmount: Number(values.ncdAmount ?? 0),
              windscreenCharges: Number(values.windscreenCharges ?? 0),
              outstationDeliveryDate: values.outstationDeliveryDate?.trim() || undefined,
              bankName: values.bankName?.trim() || undefined,
              bankFollowUpDate: values.bankFollowUpDate?.trim() || undefined
            };
            const blockReason = paymentCreateBlockReason(payment, payments);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onUpdate(payment);
          }}
        >
          <Form.Item name="id" label="Edit Payment"><Select options={payments.map((payment) => ({ value: payment.id, label: `${plateFor(vehicles, payment.vehicleId)} / ${payment.receiptNumber || "No receipt"} / ${payment.status}` }))} onChange={setEditPaymentId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="nettPrice" label="Nett Price"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["Pending", "Approved", "Disbursed", "Reconciled"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="receiptNumber" label="Receipt No."><Input placeholder="RCPT-1001" /></Form.Item>
          <Form.Item name="invoiceNumber" label="Invoice No."><Input placeholder="INV-1001" /></Form.Item>
          <Form.Item name="bossChecked" label="Boss Check"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Checked" }]} /></Form.Item>
          <Form.Item name="documentsPrepared" label="Prepare Document"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="checklistValidated" label="Checklist Validation"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="invoiceGenerated" label="Invoice Generated"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="autoCountKeyed" label="AutoCount Key In"><Select options={[{ value: false, label: "Pending" }, { value: true, label: "Done" }]} /></Form.Item>
          <Form.Item name="salesPrice" label="Sales Price / 销售价格"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="interestAdditionalCharges" label="Interest + Additional Charges / 利息与增加项"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="ncdAmount" label="NCD / 无索偿折扣"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="windscreenCharges" label="Windscreen Charges / 挡风玻璃费用"><InputNumber className="fullWidth" min={0} /></Form.Item>
          <Form.Item name="outstationDeliveryDate" label="Outstation Delivery Date / 外地送车日期"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="bankName" label="Bank"><Input placeholder="Maybank" /></Form.Item>
          <Form.Item name="bankFollowUpDate" label="Bank Follow-up"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPayment}>Update Payment</Button></Form.Item>
        </Form>
      </ProCard>
      <ProCard title="Finance Documents / 财务文件">
        <Space direction="vertical" size={12} className="fullWidth">
          <Form layout="vertical" className="formGrid">
            <Form.Item label="Payment Record / 收款记录">
              <Select
                value={selectedPayment?.id}
                onChange={setUploadPaymentId}
                options={payments.map((payment) => ({
                  value: payment.id,
                  label: `${plateFor(vehicles, payment.vehicleId)} / ${payment.receiptNumber || "No receipt"} / ${payment.invoiceNumber || "No invoice"}`
                }))}
              />
            </Form.Item>
            <Form.Item label="Document Type / 文件类型">
              <Select<DocumentCategory>
                value={documentCategory}
                onChange={setDocumentCategory}
                options={financeDocumentCategories.map((category) => ({ value: category, label: documentCategoryLabel(category) }))}
              />
            </Form.Item>
            <Form.Item label="Receipt / Invoice Upload / 收据与发票上传">
              <Upload
                maxCount={1}
                customRequest={(option) => {
                  if (!selectedPayment) {
                    option.onError?.(new Error("Select a payment first."));
                    return;
                  }
                  void onUploadDocument(selectedPayment.vehicleId, option.file as File, documentCategory)
                    .then(() => option.onSuccess?.({}))
                    .catch((error) => option.onError?.(error));
                }}
              >
                <Button icon={<UploadOutlined />} disabled={!selectedPayment}>Upload Finance Document / 上传财务文件</Button>
              </Upload>
            </Form.Item>
          </Form>
          <Alert
            type="info"
            showIcon
            message="Upload payment receipts and invoices against the linked car plate for finance audit and reconciliation. / 上传收据和发票并关联车牌，方便财务审核与对账。"
          />
        </Space>
      </ProCard>
      <ProCard title="Settlement Reminder / 收车结算提醒">
        <Space direction="vertical" size={16} className="fullWidth">
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Deadline Popup">Boss/Admin receives reminder when settlement deadline is due.</Descriptions.Item>
            <Descriptions.Item label="AutoCount">Extension point prepared; MVP tracks key-in status manually.</Descriptions.Item>
            <Descriptions.Item label="Outstanding Bank Collection">RM {outstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Outstanding Settlement">RM {settlementOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Daily Spend Due">RM {dailySpendOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Broker Commission Due">RM {brokerCommissionOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Debt Recovery Balance">RM {debtOutstanding.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Payment Voucher Open">RM {voucherOutstanding.toLocaleString()}</Descriptions.Item>
          </Descriptions>
          <Table rowKey="id" columns={settlementColumns} dataSource={settlements} pagination={false} scroll={{ x: 640 }} />
          <Form layout="vertical" className="formGrid" onFinish={(values) => {
            const settlement: SettlementReminder = {
              id: newId(),
              vehicleId: values.vehicleId,
              ownerId: values.ownerId,
              amount: Number(values.amount ?? 0),
              deadline: values.deadline,
              isPaid: values.isPaid
            };
            const blockReason = settlementCreateBlockReason(settlement, owners);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateSettlement(settlement);
          }} initialValues={{ vehicleId: vehicles[0]?.id, deadline: today(), isPaid: false }}>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Settlement</Button></Form.Item>
          </Form>
          <Form
            key={selectedEditSettlement?.id ?? "settlement-edit"}
            layout="vertical"
            className="formGrid"
            initialValues={selectedEditSettlement}
            onFinish={(values) => {
              if (!selectedEditSettlement) return;
              const settlement: SettlementReminder = {
                ...selectedEditSettlement,
                vehicleId: values.vehicleId,
                ownerId: values.ownerId,
                amount: Number(values.amount ?? 0),
                deadline: values.deadline,
                isPaid: values.isPaid
              };
              const blockReason = settlementCreateBlockReason(settlement, owners);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateSettlement(settlement);
            }}
          >
            <Form.Item name="id" label="Edit Settlement"><Select options={settlements.map((settlement) => ({ value: settlement.id, label: `${plateFor(vehicles, settlement.vehicleId)} / RM ${settlement.amount.toLocaleString()} / ${settlement.deadline}` }))} onChange={setEditSettlementId} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="ownerId" label="Settlement Owner / Previous Owner"><Select allowClear showSearch optionFilterProp="label" options={owners.map((owner) => ({ value: owner.id, label: `${owner.name} / ${owner.phone}` }))} /></Form.Item>
            <Form.Item name="amount" label="Settlement Amount" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditSettlement}>Update Settlement</Button></Form.Item>
          </Form>
        </Space>
      </ProCard>
      <ProCard title="Broker Commission / 经纪人佣金">
        <Space direction="vertical" size={12} className="fullWidth">
          <Table rowKey="id" columns={brokerCommissionColumns} dataSource={brokerCommissions} pagination={false} scroll={{ x: 760 }} />
          <Form layout="vertical" className="formGrid" onFinish={(values) => {
            const commission: BrokerCommission = {
              id: newId(),
              vehicleId: values.vehicleId,
              brokerName: values.brokerName,
              amount: Number(values.amount ?? 0),
              isPaid: values.isPaid,
              cp58Required: values.cp58Required,
              cp58Prepared: values.cp58Prepared
            };
            const blockReason = brokerCommissionCreateBlockReason(commission, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateBrokerCommission(commission);
          }} initialValues={{ vehicleId: vehicles[0]?.id, isPaid: false, cp58Required: false, cp58Prepared: false }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Unpaid" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item name="cp58Required" label="CP58 Required"><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item name="cp58Prepared" label="CP58 Prepared"><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Commission</Button></Form.Item>
          </Form>
          <Form
            key={selectedEditBrokerCommission?.id ?? "broker-commission-edit"}
            layout="vertical"
            className="formGrid"
            initialValues={selectedEditBrokerCommission}
            onFinish={(values) => {
              if (!selectedEditBrokerCommission) return;
              const commission: BrokerCommission = {
                ...selectedEditBrokerCommission,
                vehicleId: values.vehicleId,
                brokerName: values.brokerName,
                amount: Number(values.amount ?? 0),
                isPaid: values.isPaid,
                cp58Required: values.cp58Required,
                cp58Prepared: values.cp58Prepared
              };
              const blockReason = brokerCommissionCreateBlockReason(commission, vehicles);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateBrokerCommission(commission);
            }}
          >
            <Form.Item name="id" label="Edit Broker Commission"><Select options={brokerCommissions.map((commission) => ({ value: commission.id, label: `${plateFor(vehicles, commission.vehicleId)} / ${commission.brokerName} / RM ${commission.amount.toLocaleString()}` }))} onChange={setEditBrokerCommissionId} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="brokerName" label="Broker / 经纪人" rules={[{ required: true }]}><Input placeholder="Broker name" /></Form.Item>
            <Form.Item name="amount" label="Commission / 佣金" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Unpaid" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item name="cp58Required" label="CP58 Required"><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item name="cp58Prepared" label="CP58 Prepared"><Select options={[{ value: false, label: "No" }, { value: true, label: "Yes" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditBrokerCommission}>Update Commission</Button></Form.Item>
          </Form>
        </Space>
      </ProCard>
      <ProCard title="Debt Recovery / 欠款追讨">
        <Space direction="vertical" size={12} className="fullWidth">
          <Table rowKey="id" columns={debtRecoveryColumns} dataSource={debtRecoveries} pagination={false} scroll={{ x: 960 }} />
          <Form layout="vertical" className="formGrid" onFinish={(values) => {
            const debt: DebtRecoveryCase = {
              id: newId(),
              vehicleId: values.vehicleId,
              customerId: values.customerId,
              balanceAmount: Number(values.balanceAmount ?? 0),
              status: values.status,
              followUpDate: values.followUpDate,
              notes: values.notes
            };
            const blockReason = debtRecoveryCreateBlockReason(debt, vehicles, customers);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateDebtRecovery(debt);
          }} initialValues={{ vehicleId: vehicles[0]?.id, customerId: customers[0]?.id, status: "Open", followUpDate: today() }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="followUpDate" label="Follow-up Date / 跟进日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Open", "FollowedUp", "Closed"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Balance reminder note" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Debt Case</Button></Form.Item>
          </Form>
          <Form
            key={selectedEditDebtRecovery?.id ?? "debt-recovery-edit"}
            layout="vertical"
            className="formGrid"
            initialValues={selectedEditDebtRecovery}
            onFinish={(values) => {
              if (!selectedEditDebtRecovery) return;
              const debt: DebtRecoveryCase = {
                ...selectedEditDebtRecovery,
                vehicleId: values.vehicleId,
                customerId: values.customerId,
                balanceAmount: Number(values.balanceAmount ?? 0),
                status: values.status,
                followUpDate: values.followUpDate,
                notes: values.notes?.trim() || undefined
              };
              const blockReason = debtRecoveryCreateBlockReason(debt, vehicles, customers);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateDebtRecovery(debt);
            }}
          >
            <Form.Item name="id" label="Edit Debt Case"><Select options={debtRecoveries.map((debt) => ({ value: debt.id, label: `${plateFor(vehicles, debt.vehicleId)} / ${customerLabel(customers, debt.customerId)} / RM ${debt.balanceAmount.toLocaleString()}` }))} onChange={setEditDebtRecoveryId} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="customerId" label="Customer / 客户" rules={[{ required: true }]}><Select options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
            <Form.Item name="balanceAmount" label="Balance / 欠款" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="followUpDate" label="Follow-up Date / 跟进日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Open", "FollowedUp", "Closed"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Balance reminder note" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDebtRecovery}>Update Debt Case</Button></Form.Item>
          </Form>
        </Space>
      </ProCard>
      <ProCard title="Payment Voucher / 付款凭证">
        <Space direction="vertical" size={12} className="fullWidth">
          <Table rowKey="id" columns={paymentVoucherColumns} dataSource={paymentVouchers} pagination={false} scroll={{ x: 960 }} />
          <Form layout="vertical" className="formGrid" onFinish={(values) => {
            const voucher: PaymentVoucher = {
              id: newId(),
              vehicleId: values.vehicleId,
              payeeName: values.payeeName,
              amount: Number(values.amount ?? 0),
              purpose: values.purpose,
              status: values.status,
              issuedDate: values.issuedDate,
              notes: values.notes
            };
            const blockReason = paymentVoucherCreateBlockReason(voucher, vehicles);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreatePaymentVoucher(voucher);
          }} initialValues={{ vehicleId: vehicles[0]?.id, purpose: "Outstation Pickup Allowance", status: "Pending", issuedDate: today() }}>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Pending", "Approved", "Paid"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Booking slip / salary voucher reference" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Voucher</Button></Form.Item>
          </Form>
          <Form
            key={selectedEditPaymentVoucher?.id ?? "payment-voucher-edit"}
            layout="vertical"
            className="formGrid"
            initialValues={selectedEditPaymentVoucher}
            onFinish={(values) => {
              if (!selectedEditPaymentVoucher) return;
              const voucher: PaymentVoucher = {
                ...selectedEditPaymentVoucher,
                vehicleId: values.vehicleId,
                payeeName: values.payeeName,
                amount: Number(values.amount ?? 0),
                purpose: values.purpose,
                status: values.status,
                issuedDate: values.issuedDate,
                notes: values.notes?.trim() || undefined
              };
              const blockReason = paymentVoucherCreateBlockReason(voucher, vehicles);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdatePaymentVoucher(voucher);
            }}
          >
            <Form.Item name="id" label="Edit Voucher"><Select options={paymentVouchers.map((voucher) => ({ value: voucher.id, label: `${plateFor(vehicles, voucher.vehicleId)} / ${voucher.payeeName} / RM ${voucher.amount.toLocaleString()}` }))} onChange={setEditPaymentVoucherId} /></Form.Item>
            <Form.Item name="vehicleId" label="Car Plate / 车牌" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
            <Form.Item name="payeeName" label="Payee / 收款人" rules={[{ required: true }]}><Input placeholder="Driver / staff name" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="purpose" label="Purpose / 用途" rules={[{ required: true }]}><Input placeholder="Outstation Pickup Allowance" /></Form.Item>
            <Form.Item name="issuedDate" label="Issued Date / 日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="status" label="Status / 状态"><Select options={["Pending", "Approved", "Paid"].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Booking slip / salary voucher reference" /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditPaymentVoucher}>Update Voucher</Button></Form.Item>
          </Form>
        </Space>
      </ProCard>
      <ProCard title="Daily Spend / 日常支出">
        <Space direction="vertical" size={12} className="fullWidth">
          <Table rowKey="id" columns={dailySpendColumns} dataSource={dailySpends} pagination={false} scroll={{ x: 640 }} />
          <Form layout="vertical" className="formGrid" onFinish={(values) => {
            const spend: DailySpend = {
              id: newId(),
              description: values.description,
              amount: Number(values.amount ?? 0),
              dueDate: values.dueDate,
              isPaid: values.isPaid
            };
            const blockReason = dailySpendCreateBlockReason(spend);
            if (blockReason) {
              message.warning(blockReason);
              return;
            }
            onCreateDailySpend(spend);
          }} initialValues={{ description: "Electric Bill", dueDate: monthlyElectricBillDueDate(), isPaid: false }}>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Daily Spend</Button></Form.Item>
          </Form>
          <Form
            key={selectedEditDailySpend?.id ?? "daily-spend-edit"}
            layout="vertical"
            className="formGrid"
            initialValues={selectedEditDailySpend}
            onFinish={(values) => {
              if (!selectedEditDailySpend) return;
              const spend: DailySpend = {
                ...selectedEditDailySpend,
                description: values.description,
                amount: Number(values.amount ?? 0),
                dueDate: values.dueDate,
                isPaid: values.isPaid
              };
              const blockReason = dailySpendCreateBlockReason(spend);
              if (blockReason) {
                message.warning(blockReason);
                return;
              }
              onUpdateDailySpend(spend);
            }}
          >
            <Form.Item name="id" label="Edit Daily Spend"><Select options={dailySpends.map((spend) => ({ value: spend.id, label: `${spend.description} / RM ${spend.amount.toLocaleString()} / ${spend.dueDate}` }))} onChange={setEditDailySpendId} /></Form.Item>
            <Form.Item name="description" label="Description / 项目" rules={[{ required: true }]}><Input placeholder="Electric Bill" /></Form.Item>
            <Form.Item name="amount" label="Amount / 金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date / 到期日" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isPaid" label="Status / 状态"><Select options={[{ value: false, label: "Due" }, { value: true, label: "Paid" }]} /></Form.Item>
            <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditDailySpend}>Update Daily Spend</Button></Form.Item>
          </Form>
        </Space>
      </ProCard>
    </Space>
  );
}

function LeadsPage({ vehicles, customers, leads, onCreateCustomer, onUpdate }: { vehicles: VehicleLookup[]; customers: Customer[]; leads: Lead[]; onCreateCustomer: (lead: Lead) => Promise<void>; onUpdate: (lead: Lead) => void }) {
  const [editLeadId, setEditLeadId] = useState(leads[0]?.id ?? "");
  const [leadStatusFilter, setLeadStatusFilter] = useState<Lead["status"] | "All">("All");
  const [leadLinkFilter, setLeadLinkFilter] = useState<LeadLinkFilter>("All");
  const selectedEditLead = leads.find((lead) => lead.id === editLeadId) ?? leads[0];
  const filteredLeads = filterLeadsForTriage(leads, { status: leadStatusFilter, link: leadLinkFilter });

  useEffect(() => {
    if (!editLeadId && leads[0]?.id) {
      setEditLeadId(leads[0].id);
    }
  }, [editLeadId, leads]);

  const columns: ColumnsType<Lead> = [
    { title: "Customer Record", render: (_, row) => <Tag color={leadCustomerLinkTagColor(row)}>{leadCustomerLinkLabel(row)}</Tag> },
    { title: "Received / 日期", dataIndex: "createdAt", render: (value) => String(value).slice(0, 10) },
    { title: "Customer / 客户", dataIndex: "customerName" },
    { title: "Phone / 电话", dataIndex: "phone" },
    { title: "Car Plate / 车牌", dataIndex: "vehicleId", render: (vehicleId) => plateFor(vehicles, vehicleId) },
    { title: "Message / 询问", dataIndex: "message", render: (value) => value || "-" },
    { title: "Status / 状态", dataIndex: "status", render: (status) => <Tag color={status === "New" ? "orange" : status === "Contacted" ? "blue" : "green"}>{status}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      width: 190,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => onCreateCustomer(row)} disabled={row.status === "Closed" || Boolean(row.customerId)}>Customer</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Contacted" })} disabled={row.status !== "New"}>Contacted</Button>
          <Button size="small" onClick={() => onUpdate({ ...row, status: "Closed" })} disabled={row.status === "Closed"}>Close</Button>
          <Button size="small" onClick={() => setEditLeadId(row.id)}>Edit</Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title={bilingual.leads}>
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
          <Tag color="blue">{filteredLeads.length} shown</Tag>
        </Space>
        <Table rowKey="id" columns={columns} dataSource={filteredLeads} pagination={false} scroll={{ x: 980 }} />
      </ProCard>
      <ProCard title="Sales Follow Up / 销售跟进">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="Source">Public website enquiry form</Descriptions.Item>
          <Descriptions.Item label="Next Action">Sales contacts the customer, then creates customer, loan, delivery, and payment records after confirmation.</Descriptions.Item>
          <Descriptions.Item label="Open Leads">{filteredLeads.filter((lead) => lead.status !== "Closed").length}</Descriptions.Item>
        </Descriptions>
      </ProCard>
      <ProCard title="Edit Lead / 修改询问">
        <Form
          key={selectedEditLead?.id ?? "lead-edit"}
          layout="vertical"
          className="formGrid"
          initialValues={selectedEditLead}
          onFinish={(values) => {
            if (!selectedEditLead) return;
            const lead: Lead = {
              ...selectedEditLead,
              vehicleId: values.vehicleId,
              customerId: values.customerId,
              customerName: values.customerName,
              phone: values.phone,
              message: values.message?.trim() || undefined,
              status: values.status
            };
            if (!lead.customerName.trim()) {
              message.warning("Lead customer name is required.");
              return;
            }
            if (!lead.phone.trim()) {
              message.warning("Lead phone is required.");
              return;
            }
            onUpdate(lead);
          }}
        >
          <Form.Item name="id" label="Edit Lead"><Select options={leads.map((lead) => ({ value: lead.id, label: `${lead.customerName} / ${lead.phone} / ${lead.status}` }))} onChange={setEditLeadId} /></Form.Item>
          <Form.Item name="vehicleId" label="Car Plate" rules={[{ required: true }]}><Select options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.plateNumber }))} /></Form.Item>
          <Form.Item name="customerId" label="Linked Customer"><Select allowClear showSearch optionFilterProp="label" options={customers.map((customer) => ({ value: customer.id, label: customerSelectLabel(customer) }))} /></Form.Item>
          <Form.Item name="customerName" label="Customer Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="message" label="Message"><Input /></Form.Item>
          <Form.Item name="status" label="Status"><Select options={["New", "Contacted", "Closed"].map((value) => ({ value }))} /></Form.Item>
          <Form.Item className="formActions"><Button type="primary" htmlType="submit" disabled={!selectedEditLead}>Update Lead</Button></Form.Item>
        </Form>
      </ProCard>
    </Space>
  );
}

function HrSalaryPage() {
  const plannedItems = [
    { title: "Working Day / 工作日计算", description: "Future payroll calendars can reuse delivery/outstation working-day rules without affecting current vehicle workflows." },
    { title: "Leave Request / 请假申请", description: "Planned request and Boss approval notification flow for AL and emergency leave." },
    { title: "MC Upload / 病假单上传", description: "Planned document upload category for medical certificates and HR review." },
    { title: "Attendance / 打卡", description: "Planned attendance capture and exception review for staff records." },
    { title: "AL/MC Control / 年假病假控制", description: "Planned balance tracking and Boss/Admin adjustment controls." },
    { title: "Pay Slip / 薪资单", description: "Planned payslip generation after salary rules are approved." }
  ];

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Alert
        type="info"
        showIcon
        message="HR/Salary is a planned extension module."
        description="The MVP keeps HR access visible and role-scoped, while salary calculation, leave approvals, MC uploads, attendance, AL/MC control, and pay slip generation remain future extension points."
      />
      <ProCard title="HR/Salary Scope / 人事薪资范围">
        <div className="extensionGrid">
          {plannedItems.map((item) => (
            <ProCard key={item.title} bordered>
              <Typography.Title level={5}>{item.title}</Typography.Title>
              <Typography.Paragraph>{item.description}</Typography.Paragraph>
              <Tag color="default">Planned extension</Tag>
            </ProCard>
          ))}
        </div>
      </ProCard>
    </Space>
  );
}

function AuditLogPage({ auditLog, onSearch }: { auditLog: AuditLog[]; onSearch: (filters: AuditLogFilters) => Promise<void> }) {
  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <ProCard title={bilingual.auditLog}>
        <Form
          layout="inline"
          className="toolbarForm"
          onFinish={(values) => onSearch({
            actor: values.actor,
            action: values.action,
            entityName: values.entityName
          })}
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
            <Button htmlType="button" onClick={() => onSearch({})}>Reset</Button>
          </Form.Item>
        </Form>
        <Table rowKey="id" columns={auditLogColumns()} dataSource={auditLog} pagination={{ pageSize: 12 }} scroll={{ x: 900 }} />
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
  currentUser,
  auditLog,
  staffUsers,
  onCreateStaffUser,
  onUpdateStaffUser,
  onResetStaffPassword,
  onUpdateStaffStatus,
  onUpdateStaffRoles
}: {
  currentUser: CurrentUser | null;
  auditLog: AuditLog[];
  staffUsers: StaffUser[];
  onCreateStaffUser: (user: CreateStaffUserRequest) => Promise<void>;
  onUpdateStaffUser: (userId: string, request: UpdateStaffUserRequest) => Promise<void>;
  onResetStaffPassword: (userId: string, request: ResetStaffPasswordRequest) => Promise<void>;
  onUpdateStaffStatus: (userId: string, request: UpdateStaffUserStatusRequest) => Promise<void>;
  onUpdateStaffRoles: (userId: string, roles: StaffRole[]) => Promise<void>;
}) {
  const [editStaffUserId, setEditStaffUserId] = useState(staffUsers[0]?.id ?? "");
  const selectedEditStaffUser = staffUsers.find((user) => user.id === editStaffUserId) ?? staffUsers[0];

  useEffect(() => {
    if (!editStaffUserId && staffUsers[0]?.id) {
      setEditStaffUserId(staffUsers[0].id);
    }
  }, [editStaffUserId, staffUsers]);

  const staffColumns: ColumnsType<StaffUser> = [
    { title: "Name / 姓名", dataIndex: "displayName" },
    { title: "Email", dataIndex: "email" },
    { title: "Status", dataIndex: "isActive", render: (isActive: boolean) => <Tag color={isActive ? "green" : "red"}>{isActive ? "Active" : "Disabled"}</Tag> },
    { title: "Roles / 角色", dataIndex: "roles", render: (roles: StaffRole[]) => <Space>{roles.map((role) => <Tag key={role}>{roleLabel(role)}</Tag>)}</Space> },
    {
      title: "Update Roles / 调整角色",
      fixed: "right",
      width: 360,
      render: (_, row) => (
        <Space.Compact className="fullWidth">
          <Select
            mode="multiple"
            className="fullWidth"
            value={row.roles}
            options={staffRoles.map((role) => ({ value: role, label: roleLabel(role) }))}
            onChange={(roles) => {
              if (!canAssignStaffRoles(roles)) {
                message.warning("Select at least one department role before saving staff access.");
                return;
              }
              onUpdateStaffRoles(row.id, roles);
            }}
          />
        </Space.Compact>
      )
    },
    {
      title: "Action",
      fixed: "right",
      width: 180,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => setEditStaffUserId(row.id)}>Edit</Button>
          <Button size="small" danger={row.isActive} onClick={() => onUpdateStaffStatus(row.id, { isActive: !row.isActive })}>
            {row.isActive ? "Disable" : "Enable"}
          </Button>
        </Space>
      )
    }
  ];

  return (
    <ProCard title={bilingual.admin}>
      <Tabs
        items={[
          {
            key: "users",
            label: "Staff Users",
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                <Table rowKey="id" columns={staffColumns} dataSource={staffUsers} pagination={{ pageSize: 8 }} scroll={{ x: 720 }} />
                <Form
                  key={selectedEditStaffUser?.id ?? "staff-edit"}
                  layout="vertical"
                  className="formGrid"
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
                  }}
                >
                  <Form.Item name="id" label="Edit Staff / 修改员工">
                    <Select
                      options={staffUsers.map((user) => ({ value: user.id, label: `${user.displayName} / ${user.email}` }))}
                      onChange={setEditStaffUserId}
                    />
                  </Form.Item>
                  <Form.Item name="displayName" label="Display Name / 姓名" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="Email">
                    <Input value={selectedEditStaffUser?.email} disabled />
                  </Form.Item>
                  <Form.Item className="formActions">
                    <Button type="primary" htmlType="submit" disabled={!selectedEditStaffUser}>Update Staff</Button>
                  </Form.Item>
                </Form>
                <Form
                  key={`${selectedEditStaffUser?.id ?? "staff"}-password`}
                  layout="vertical"
                  className="formGrid"
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

                    onResetStaffPassword(selectedEditStaffUser.id, requestBody);
                  }}
                >
                  <Form.Item name="id" label="Reset Password / 重设密码">
                    <Select
                      options={staffUsers.map((user) => ({ value: user.id, label: `${user.displayName} / ${user.email}` }))}
                      onChange={setEditStaffUserId}
                    />
                  </Form.Item>
                  <Form.Item name="password" label="New Password" rules={[{ required: true, min: 8 }]}>
                    <Input.Password />
                  </Form.Item>
                  <Form.Item className="formActions">
                    <Button htmlType="submit" disabled={!selectedEditStaffUser}>Reset Password</Button>
                  </Form.Item>
                </Form>
                <Form
                  layout="vertical"
                  className="formGrid"
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
                  }}
                >
                  <Form.Item name="displayName" label="Display Name / 姓名" rules={[{ required: true }]}><Input /></Form.Item>
                  <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
                  <Form.Item name="password" label="Initial Password" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
                  <Form.Item name="role" label="Department Role"><Select options={staffRoles.map((role) => ({ value: role, label: roleLabel(role) }))} /></Form.Item>
                  <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Staff</Button></Form.Item>
                </Form>
              </Space>
            )
          },
          { key: "roles", label: "Department Roles", children: <Typography.Paragraph>{staffRoles.map(roleLabel).join(", ")}.</Typography.Paragraph> },
          { key: "session", label: "Current Session", children: <Typography.Paragraph>{currentUser?.isAuthenticated ? `${currentUser.name} (${currentUser.roles.join(", ")})` : "Not logged in"}</Typography.Paragraph> },
          { key: "audit", label: "Audit Log", children: <Table rowKey="id" columns={auditLogColumns()} dataSource={auditLog} pagination={{ pageSize: 8 }} scroll={{ x: 900 }} /> }
        ]}
      />
    </ProCard>
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

function roleLabel(role: StaffRole) {
  return role === "BossAdmin" ? "Boss/Admin" : role === "HrSalary" ? "HR/Salary" : role;
}

function documentCategoryLabel(category: DocumentCategory) {
  const labels: Record<DocumentCategory, string> = {
    PurchaseInvoice: "Purchase Invoice",
    Voc: "VOC",
    ApDocument: "AP Document",
    StatusReceipt: "Status Receipt",
    LoanDocument: "Loan Document",
    DeliveryDocument: "Delivery Document",
    Policy: "Policy",
    RoadTaxReceipt: "Road Tax Receipt",
    RepairInvoice: "Repair Invoice",
    PaymentReceipt: "Payment Receipt",
    PaymentInvoice: "Payment Invoice"
  };
  return labels[category];
}

function plateFor(vehicles: VehicleLookup[], vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId)?.plateNumber ?? "Unknown";
}

function customerLabel(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.name ?? "Unknown";
}

function paymentChecklistTags(payment: PaymentRecord) {
  return [
    ["Docs", payment.documentsPrepared],
    ["Checklist", payment.checklistValidated],
    ["Invoice", payment.invoiceGenerated],
    ["AutoCount", payment.autoCountKeyed]
  ].map(([label, done]) => <Tag key={String(label)} color={done ? "green" : "orange"}>{String(label)}</Tag>);
}

function contactFor<T extends { id: string; name: string; phone: string }>(contacts: T[], contactId?: string) {
  if (!contactId) return "-";
  const contact = contacts.find((item) => item.id === contactId);
  return contact ? `${contact.name} / ${contact.phone}` : "Unknown";
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
    delivery.twoDayNoticeSent;
}

function deliveryChecklist(delivery: DeliverySchedule) {
  return [
    { label: "Inspection / 正式检查", done: delivery.inspectionDone },
    { label: "Inspection Booking / 验车预约", done: Boolean(delivery.inspectionBookingReference?.trim()) },
    { label: "Inspection Report / 检查报告", done: Boolean(delivery.inspectionReportReference?.trim()) },
    { label: "Prepare Document / 准备文件", done: delivery.documentsPrepared },
    { label: "Polish / 抛光", done: delivery.polishDone },
    { label: "Tinted / 隔热膜", done: delivery.tintedDone },
    { label: "Wash / 洗车", done: delivery.washDone },
    { label: "Insurance / 保险", done: delivery.insuranceHandled },
    { label: `Policy Ref / 保单: ${delivery.insurancePolicyReference?.trim() || "-"}`, done: Boolean(delivery.insurancePolicyReference?.trim()) },
    { label: "Road Tax / 路税", done: delivery.roadTaxHandled },
    { label: `Road Tax Receipt / 路税收据: ${delivery.roadTaxReceiptReference?.trim() || "-"}`, done: Boolean(delivery.roadTaxReceiptReference?.trim()) },
    { label: "Windscreen Insurance", done: delivery.windscreenInsuranceHandled },
    { label: `Windscreen Ref: ${delivery.windscreenPolicyReference?.trim() || "-"}`, done: Boolean(delivery.windscreenPolicyReference?.trim()) },
    { label: "Notification / Notify", done: delivery.notificationSent },
    { label: "2-day Notice / 提前2天通知", done: delivery.twoDayNoticeSent }
  ];
}

function replaceById<T extends { id: string }>(items: T[], record: T) {
  return items.map((item) => item.id === record.id ? record : item);
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
