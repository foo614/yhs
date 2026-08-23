import { ClockCircleOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import { QrcodeOutlined, ReloadOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { Alert, Button, Checkbox, Empty, Form, Input, InputNumber, Pagination, Select, Space, Statistic, Switch, Tabs, Tag, Tooltip, Typography, Upload } from "antd";
import { OperationsProTable as Table } from "../shared/OperationsProTable";
import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { staffRoleValues } from "../../api";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import type {
  CurrentUser,
  HrAttendanceAction,
  HrAttendanceDashboardSummary,
  HrAttendanceReminderItem,
  HrAttendanceReminderPolicy,
  HrAttendanceReminderType,
  HrAttendanceRecord,
  HrAvailabilityCalendarItem,
  HrAttendanceQrChallenge,
  HrAttendanceQrRedemptionRequest,
  HrBusinessTrip,
  HrBusinessTripStatus,
  HrOutstationAttendanceRequest,
  HrLeaveAdjustment,
  HrLeaveAdjustmentRequest,
  HrLeaveBalance,
  HrLeavePolicy,
  HrLeaveRequest,
  HrLeaveStatus,
  HrLeaveType,
  HrPayPeriod,
  HrPayrollProfile,
  HrPayslip,
  StaffRole,
  StaffUser
} from "../../api";

type HrSalaryPageProps = {
  currentUser: CurrentUser | null;
  staffUsers: StaffUser[];
  attendance: HrAttendanceRecord[];
  attendanceDashboard: HrAttendanceDashboardSummary | null;
  availabilityCalendar: HrAvailabilityCalendarItem[];
  attendanceReminders: HrAttendanceReminderItem[];
  attendanceReminderPolicies: HrAttendanceReminderPolicy[];
  leaveRequests: HrLeaveRequest[];
  leaveBalances: HrLeaveBalance[];
  leavePolicies: HrLeavePolicy[];
  leaveAdjustments: HrLeaveAdjustment[];
  payrollProfiles: HrPayrollProfile[];
  payPeriods: HrPayPeriod[];
  payslips: HrPayslip[];
  attendanceQrChallenge: HrAttendanceQrChallenge | null;
  attendanceQrToken?: string;
  businessTrips: HrBusinessTrip[];
  onClearAttendanceQrToken: () => void;
  onCheckIn: () => Promise<void>;
  onCheckOut: () => Promise<void>;
  onCreateQrChallenge: () => Promise<void>;
  onRedeemQr: (request: HrAttendanceQrRedemptionRequest) => Promise<void>;
  onCreateBusinessTrip: (trip: HrBusinessTrip) => Promise<void>;
  onDecideBusinessTrip: (tripId: string, status: Exclude<HrBusinessTripStatus, "Pending" | "Cancelled">, decisionNotes?: string) => Promise<void>;
  onCancelBusinessTrip: (tripId: string) => Promise<void>;
  onStartOutstation: (request: HrOutstationAttendanceRequest) => Promise<void>;
  onEndOutstation: (request: HrOutstationAttendanceRequest) => Promise<void>;
  onUpdateReminderPolicy: (type: HrAttendanceReminderType, policy: Pick<HrAttendanceReminderPolicy, "isEnabled" | "leadHours">) => Promise<void>;
  onCreateLeave: (leave: HrLeaveRequest) => Promise<void>;
  onDecideLeave: (leaveId: string, status: HrLeaveStatus, decisionNotes?: string) => Promise<void>;
  onUploadMc: (leaveId: string, file: File) => Promise<void>;
  mcContentUrl: (leaveId: string) => string;
  onUpdateBalance: (balance: HrLeaveBalance) => Promise<void>;
  onUpdatePolicy: (policy: HrLeavePolicy) => Promise<void>;
  onCreateAdjustment: (adjustment: HrLeaveAdjustmentRequest) => Promise<void>;
  onUpdatePayrollProfile: (profile: HrPayrollProfile) => Promise<void>;
  onCreatePayPeriod: (period: HrPayPeriod) => Promise<void>;
  onGeneratePayslips: (payPeriodId: string) => Promise<void>;
};

const leaveTypes: HrLeaveType[] = ["AnnualLeave", "MedicalLeave", "EmergencyLeave", "UnpaidLeave"];
const adjustmentTypes = [
  { value: "AnnualLeave", label: "AL / Annual Leave / 年假" },
  { value: "MedicalLeave", label: "MC / Medical Leave / 病假" }
];
const adjustmentDirections = [
  { value: "Increase", label: "Increase / 增加" },
  { value: "Decrease", label: "Decrease / 减少" }
];
const halfDayOptions = [
  { value: "AM", label: "AM / 上午" },
  { value: "PM", label: "PM / 下午" }
];
const johorHolidayReference = [
  "Default State / 默认州属: Johor",
  "Weekend / 周末: Saturday + Sunday",
  "Public holidays should be reviewed yearly by HR"
];
const hrRecordPageSize = 8;

export type HrRecordFilters = {
  keyword?: string;
  status?: string;
};

type HrRecordListKey = "attendance" | "leave" | "balances" | "policies" | "adjustments" | "payslips";

const initialHrRecordPages: Record<HrRecordListKey, number> = {
  attendance: 1,
  leave: 1,
  balances: 1,
  policies: 1,
  adjustments: 1,
  payslips: 1
};

const initialHrRecordFilters: Record<HrRecordListKey, HrRecordFilters> = {
  attendance: {},
  leave: {},
  balances: {},
  policies: {},
  adjustments: {},
  payslips: {}
};

export function filterHrRecords<T>(
  records: T[],
  filters: HrRecordFilters,
  searchableText: (record: T) => string,
  statusFor?: (record: T) => string
) {
  const keyword = filters.keyword?.trim().toLocaleLowerCase();

  return records.filter((record) => {
    if (keyword && !searchableText(record).toLocaleLowerCase().includes(keyword)) return false;
    if (filters.status && (!statusFor || statusFor(record) !== filters.status)) return false;
    return true;
  });
}

export function paginateHrRecords<T>(records: T[], page: number, pageSize = hrRecordPageSize) {
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    current,
    items: records.slice((current - 1) * pageSize, current * pageSize)
  };
}

export function withHrRecordFilterValue(filters: HrRecordFilters, key: keyof HrRecordFilters, value?: string) {
  return { ...filters, [key]: value === "" ? undefined : value };
}

export function HrSalaryPage({
  currentUser,
  staffUsers,
  attendance,
  attendanceDashboard,
  availabilityCalendar,
  attendanceReminders,
  attendanceReminderPolicies,
  leaveRequests,
  leaveBalances,
  leavePolicies,
  leaveAdjustments,
  payrollProfiles,
  payPeriods,
  payslips,
  attendanceQrChallenge,
  attendanceQrToken,
  businessTrips,
  onClearAttendanceQrToken,
  onCheckIn,
  onCheckOut,
  onCreateQrChallenge,
  onRedeemQr,
  onCreateBusinessTrip,
  onDecideBusinessTrip,
  onCancelBusinessTrip,
  onStartOutstation,
  onEndOutstation,
  onUpdateReminderPolicy,
  onCreateLeave,
  onDecideLeave,
  onUploadMc,
  mcContentUrl,
  onUpdateBalance,
  onUpdatePolicy,
  onCreateAdjustment,
  onUpdatePayrollProfile,
  onCreatePayPeriod,
  onGeneratePayslips
}: HrSalaryPageProps) {
  const isHrManager = Boolean(currentUser?.roles.some((role) => role === "BossAdmin" || role === "HrSalary"));
  const [leaveForm] = Form.useForm();
  const [businessTripForm] = Form.useForm();
  const [clockNow, setClockNow] = useState(() => new Date());
  const [qrRedeeming, setQrRedeeming] = useState(false);
  const [qrRedeemError, setQrRedeemError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [recordFilters, setRecordFilters] = useState<Record<HrRecordListKey, HrRecordFilters>>(initialHrRecordFilters);
  const [recordPages, setRecordPages] = useState<Record<HrRecordListKey, number>>(initialHrRecordPages);
  const staffOptions = staffUsers.map((staff) => ({ value: staff.id, label: staffLabel(staff) }));
  const selfId = currentUser?.id ?? "";
  const selfName = currentUser?.name ?? "Current staff";
  const today = new Date().toISOString().slice(0, 10);
  const openSession = attendance.find((record) => record.staffUserId === selfId && record.attendanceDate === today && record.checkInAt && !record.checkOutAt);
  const canCheckInToday = !openSession;
  const canCheckOutToday = Boolean(openSession);
  const attendanceActionText = openSession ? "Checked in now / 已上班" : "Ready to check in / 可以打卡";
  const checkInHelpText = canCheckInToday ? "" : "Already checked in. Check out before starting a new session.";
  const checkOutHelpText = canCheckOutToday ? "" : "Check in first before checking out.";
  const attendanceActionHint = openSession
    ? "Scan the office QR when the shift ends, or use manual Check Out as a fallback."
    : "Scan the office QR to start today attendance, or use manual Check In as a fallback.";
  const qrAction: HrAttendanceAction = openSession ? "CheckOut" : "CheckIn";
  const qrUrl = attendanceQrChallenge ? `${window.location.origin}/hr-salary#attendanceQr=${attendanceQrChallenge.token}` : "";
  const qrSecondsRemaining = attendanceQrChallenge ? Math.max(0, Math.ceil((new Date(attendanceQrChallenge.expiresAt).getTime() - clockNow.getTime()) / 1000)) : 0;
  const visibleStaff = staffUsers.length ? staffUsers : [{ id: selfId, email: currentUser?.name ?? "", displayName: selfName, roles: [], isActive: true }];
  const ownBusinessTrips = businessTrips.filter((trip) => trip.staffUserId === selfId);
  const approvedTripForToday = ownBusinessTrips.find((trip) => businessTripCoversDate(trip, today));
  const missingMedicalCertificateCount = leaveRequests.filter((record) => record.type === "MedicalLeave" && !record.medicalCertificateDocumentId).length;
  const leaveStartDate = Form.useWatch("startDate", leaveForm) as string | undefined;
  const leaveEndDate = Form.useWatch("endDate", leaveForm) as string | undefined;
  const leaveStartHalf = Form.useWatch("startHalf", leaveForm) as "AM" | "PM" | undefined;
  const leaveEndHalf = Form.useWatch("endHalf", leaveForm) as "AM" | "PM" | undefined;
  const calculatedLeaveDays = useMemo(
    () => calculateLeaveDays(leaveStartDate || today, leaveEndDate || today, leaveStartHalf || "AM", leaveEndHalf || "PM"),
    [leaveEndDate, leaveEndHalf, leaveStartDate, leaveStartHalf, today]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setQrRedeemError(null);
  }, [attendanceQrToken]);

  const updateRecordFilter = (list: HrRecordListKey, key: keyof HrRecordFilters, value?: string) => {
    setRecordFilters((current) => ({
      ...current,
      [list]: withHrRecordFilterValue(current[list], key, value)
    }));
    setRecordPages((current) => ({ ...current, [list]: 1 }));
  };
  const clearRecordFilters = (list: HrRecordListKey) => {
    setRecordFilters((current) => ({ ...current, [list]: {} }));
    setRecordPages((current) => ({ ...current, [list]: 1 }));
  };
  const setRecordPage = (list: HrRecordListKey, page: number) => {
    setRecordPages((current) => ({ ...current, [list]: page }));
  };
  const changeTab = (tab: string) => {
    setActiveTab(tab);
    setRecordPages(initialHrRecordPages);
  };

  const confirmQrAttendance = async () => {
    if (!attendanceQrToken || qrRedeeming) return;

    setQrRedeeming(true);
    setQrRedeemError(null);
    try {
      await onRedeemQr({ token: attendanceQrToken, action: qrAction });
      onClearAttendanceQrToken();
    } catch {
      setQrRedeemError("The office QR could not be recorded. Scan the current office QR and try again, or use the manual attendance fallback if the QR is unavailable.");
    } finally {
      setQrRedeeming(false);
    }
  };

  const openOfficeQrDisplay = () => {
    changeTab("qr-display");
    window.requestAnimationFrame(() => document.getElementById("hr-record-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const attendanceColumns: ColumnsType<HrAttendanceRecord> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Date / 日期", dataIndex: "attendanceDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status: HrAttendanceRecord["status"]) => <Tag color={attendanceStatusColor(status)}>{attendanceStatusLabel(status)}</Tag> },
    { title: "In / 上班", dataIndex: "checkInAt", render: formatDateTime },
    { title: "Out / 下班", dataIndex: "checkOutAt", render: formatDateTime },
    { title: "Method / 方式", dataIndex: "verificationMethod", render: (method: HrAttendanceRecord["verificationMethod"]) => attendanceVerificationMethodLabel(method) }
  ];

  const leaveColumns: ColumnsType<HrLeaveRequest> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Type / 类型", dataIndex: "type", render: (type: HrLeaveType) => <Tag>{leaveTypeLabel(type)}</Tag> },
    { title: "Dates / 日期", render: (_, record) => `${record.startDate} to ${record.endDate}` },
    { title: "Days / 天数", dataIndex: "days" },
    { title: "Status / 状态", dataIndex: "status", render: (status: HrLeaveStatus) => <Tag color={leaveStatusColor(status)}>{leaveStatusLabel(status)}</Tag> },
    { title: "Reason / 原因", dataIndex: "reason", render: (value?: string) => value || "-" },
    {
      title: "MC",
      render: (_, record) => (
        <Space className="tableActionGroup" wrap size={6}>
          {record.medicalCertificateDocumentId ? <Button icon={<DownloadOutlined />} href={mcContentUrl(record.id)} target="_blank" /> : record.type === "MedicalLeave" ? <Tag color="red">MC Missing / 缺少</Tag> : <Tag>Not required / 不需要</Tag>}
          <Upload beforeUpload={(file) => { void onUploadMc(record.id, file); return false; }} showUploadList={false}>
            <Button icon={<UploadOutlined />} disabled={record.type !== "MedicalLeave"} />
          </Upload>
        </Space>
      )
    },
    {
      title: "Action / 操作",
      render: (_, record) => record.status === "Pending" ? (
        <Space className="tableActionGroup" wrap size={6}>
          {isHrManager && <Button type="primary" onClick={() => onDecideLeave(record.id, "Approved")}>Approve / 批准</Button>}
          {isHrManager && <Button danger onClick={() => onDecideLeave(record.id, "Rejected")}>Reject / 拒绝</Button>}
        </Space>
      ) : record.decisionNotes || "-"
    }
  ];

  const balanceColumns: ColumnsType<HrLeaveBalance> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Role / 角色", dataIndex: "staffUserId", render: (id: string) => roleLabel(staffPrimaryRole(id, visibleStaff)) },
    { title: "Default / 默认", dataIndex: "staffUserId", render: (id: string) => defaultLeaveLabel(staffPrimaryRole(id, visibleStaff), leavePolicies) },
    { title: shortformLabel("Current AL", "Remaining annual leave / 剩余年假"), dataIndex: "annualLeaveDays" },
    { title: shortformLabel("Current MC", "Remaining medical leave / 剩余病假"), dataIndex: "medicalLeaveDays" },
    { title: "Notes / 备注", dataIndex: "notes", render: (value?: string) => value || "-" }
  ];

  const policyColumns: ColumnsType<HrLeavePolicy> = [
    { title: "Role / 角色", dataIndex: "role", render: (role: StaffRole) => roleLabel(role) },
    { title: "Default AL / 默认年假", dataIndex: "annualLeaveDays" },
    { title: "Default MC / 默认病假", dataIndex: "medicalLeaveDays" },
    { title: "Notes / 备注", dataIndex: "notes", render: (value?: string) => value || "-" }
  ];

  const adjustmentColumns: ColumnsType<HrLeaveAdjustment> = [
    { title: "Date / 日期", dataIndex: "createdAt", render: formatDateTime },
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Type / 类型", dataIndex: "type", render: leaveAdjustmentTypeLabel },
    { title: "Action / 操作", dataIndex: "direction", render: leaveAdjustmentDirectionLabel },
    { title: "Days / 天数", dataIndex: "days" },
    { title: "After / 调整后", render: (_, record) => `AL ${record.annualLeaveAfter} / MC ${record.medicalLeaveAfter}` },
    { title: "Reason / 原因", dataIndex: "reason" },
    { title: "By / 操作者", dataIndex: "adjustedBy", render: (value: string) => staffName(value, visibleStaff) }
  ];

  const payslipColumns: ColumnsType<HrPayslip> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Period / 月份", dataIndex: "payPeriodId", render: (id: string) => payPeriodName(id, payPeriods) },
    { title: "Status / 状态", dataIndex: "status", render: (status: HrPayslip["status"]) => <Tag color={status === "Generated" ? "green" : "default"}>{payslipStatusLabel(status)}</Tag> },
    { title: "Base / 底薪", dataIndex: "baseSalary", render: money },
    { title: "Work Days / 工作天", dataIndex: "workingDays" },
    { title: "Daily / 日薪", dataIndex: "dailySalary", render: money },
    { title: "Unpaid / 无薪假", dataIndex: "unpaidLeaveDays", render: (value: number) => `${value} days` },
    { title: "Deduction / 扣除", dataIndex: "unpaidLeaveDeduction", render: money },
    { title: "OT / 加班", dataIndex: "overtimePay", render: money },
    { title: "Allowance / 津贴", dataIndex: "allowances", render: money },
    { title: "Manual Deduct / 手动扣", dataIndex: "manualDeductions", render: money },
    { title: "Gross / 应发", dataIndex: "grossPay", render: money },
    { title: "Net Pay / 实发", dataIndex: "netPay", render: (value: number) => <Typography.Text strong>{money(value)}</Typography.Text> }
  ];

  const attendanceStatusOptions = ["Present", "Late", "HalfDay", "Absent"].map((value) => ({ value, label: attendanceStatusLabel(value as HrAttendanceRecord["status"]) }));
  const leaveStatusOptions = ["Pending", "Approved", "Rejected", "Cancelled"].map((value) => ({ value, label: leaveStatusLabel(value as HrLeaveStatus) }));
  const payslipStatusOptions = ["Draft", "Generated"].map((value) => ({ value, label: payslipStatusLabel(value as HrPayslip["status"]) }));
  const filteredAttendance = filterHrRecords(
    attendance,
    recordFilters.attendance,
    (record) => [staffName(record.staffUserId, visibleStaff), record.attendanceDate, attendanceStatusLabel(record.status), record.notes, formatDateTime(record.checkInAt), formatDateTime(record.checkOutAt)].filter(Boolean).join(" "),
    (record) => record.status
  );
  const filteredLeaveRequests = filterHrRecords(
    leaveRequests,
    recordFilters.leave,
    (record) => [staffName(record.staffUserId, visibleStaff), leaveTypeLabel(record.type), leaveStatusLabel(record.status), record.startDate, record.endDate, record.reason].filter(Boolean).join(" "),
    (record) => record.status
  );
  const filteredLeaveBalances = filterHrRecords(
    leaveBalances,
    recordFilters.balances,
    (record) => [staffName(record.staffUserId, visibleStaff), roleLabel(staffPrimaryRole(record.staffUserId, visibleStaff)), defaultLeaveLabel(staffPrimaryRole(record.staffUserId, visibleStaff), leavePolicies), record.annualLeaveDays, record.medicalLeaveDays, record.notes].filter(Boolean).join(" ")
  );
  const filteredLeavePolicies = filterHrRecords(
    leavePolicies,
    recordFilters.policies,
    (record) => [roleLabel(record.role), record.annualLeaveDays, record.medicalLeaveDays, record.notes].filter(Boolean).join(" ")
  );
  const filteredLeaveAdjustments = filterHrRecords(
    leaveAdjustments,
    recordFilters.adjustments,
    (record) => [formatDateTime(record.createdAt), staffName(record.staffUserId, visibleStaff), leaveAdjustmentTypeLabel(record.type), leaveAdjustmentDirectionLabel(record.direction), record.days, record.annualLeaveAfter, record.medicalLeaveAfter, record.reason, staffName(record.adjustedBy, visibleStaff)].filter(Boolean).join(" ")
  );
  const filteredPayslips = filterHrRecords(
    payslips,
    recordFilters.payslips,
    (record) => [staffName(record.staffUserId, visibleStaff), payPeriodName(record.payPeriodId, payPeriods), payslipStatusLabel(record.status), record.netPay].filter(Boolean).join(" "),
    (record) => record.status
  );
  const attendancePage = paginateHrRecords(filteredAttendance, recordPages.attendance);
  const leavePage = paginateHrRecords(filteredLeaveRequests, recordPages.leave);
  const balancePage = paginateHrRecords(filteredLeaveBalances, recordPages.balances);
  const policyPage = paginateHrRecords(filteredLeavePolicies, recordPages.policies);
  const adjustmentPage = paginateHrRecords(filteredLeaveAdjustments, recordPages.adjustments);
  const payslipPage = paginateHrRecords(filteredPayslips, recordPages.payslips);
  const attendanceEmptyText = hrRecordEmptyText(attendance.length, filteredAttendance.length, "No attendance records yet / 暂无打卡记录", "No attendance records match the current filters / 没有符合筛选条件的打卡记录");
  const leaveEmptyText = hrRecordEmptyText(leaveRequests.length, filteredLeaveRequests.length, "No leave requests yet / 暂无请假记录", "No leave requests match the current filters / 没有符合筛选条件的请假记录");
  const balanceEmptyText = hrRecordEmptyText(leaveBalances.length, filteredLeaveBalances.length, "No leave balances yet / 暂无假期余额", "No leave balances match the current filters / 没有符合筛选条件的假期余额");
  const policyEmptyText = hrRecordEmptyText(leavePolicies.length, filteredLeavePolicies.length, "No leave policies yet / 暂无假期政策", "No leave policies match the current filters / 没有符合筛选条件的假期政策");
  const adjustmentEmptyText = hrRecordEmptyText(leaveAdjustments.length, filteredLeaveAdjustments.length, "No leave adjustments yet / 暂无假期调整记录", "No leave adjustments match the current filters / 没有符合筛选条件的假期调整记录");
  const payslipEmptyText = hrRecordEmptyText(payslips.length, filteredPayslips.length, "No payslips generated yet / 暂无薪资单", "No payslips match the current filters / 没有符合筛选条件的薪资单");
  const tabLabel = (label: string, count: number) => <span className="tabLabelWithCount">{label}<Tag>{count}</Tag></span>;

  const attendanceMobileCards = (
    <div className="mobileRecordList">
      {filteredAttendance.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={attendanceEmptyText} />}
      {attendancePage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Attendance / 打卡</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color={attendanceStatusColor(record.status)}>{attendanceStatusLabel(record.status)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Date / 日期</span><strong>{record.attendanceDate}</strong></div>
            <div><span>In / 上班</span><strong>{formatDateTime(record.checkInAt)}</strong></div>
            <div><span>Out / 下班</span><strong>{formatDateTime(record.checkOutAt)}</strong></div>
          </div>
        </article>
      ))}
      {filteredAttendance.length > hrRecordPageSize && <Pagination current={attendancePage.current} pageSize={hrRecordPageSize} total={filteredAttendance.length} showSizeChanger={false} onChange={(page) => setRecordPage("attendance", page)} />}
    </div>
  );

  const leaveMobileCards = (
    <div className="mobileRecordList">
      {filteredLeaveRequests.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={leaveEmptyText} />}
      {leavePage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">{shortformLabel("Leave / MC", "Leave and medical certificate")}</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color={leaveStatusColor(record.status)}>{leaveStatusLabel(record.status)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Type / 类型</span><strong>{leaveTypeLabel(record.type)}</strong></div>
            <div><span>Days / 天数</span><strong>{record.days}</strong></div>
            <div><span>Start / 开始</span><strong>{record.startDate}</strong></div>
            <div><span>End / 结束</span><strong>{record.endDate}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Reason / 原因</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{record.reason || "-"}</span></div>
          </div>
          <div className="mobileRecordFooter hrMobileActions">
            {record.medicalCertificateDocumentId ? <Tooltip title="Medical certificate / 病假单"><Button size="small" icon={<DownloadOutlined />} href={mcContentUrl(record.id)} target="_blank">MC</Button></Tooltip> : <Tooltip title="Medical certificate / 病假单"><Tag color={record.type === "MedicalLeave" ? "red" : undefined}>MC: {record.type === "MedicalLeave" ? "Missing / 缺少" : "Not required / 不需要"}</Tag></Tooltip>}
            <Upload beforeUpload={(file) => { void onUploadMc(record.id, file); return false; }} showUploadList={false}>
              <Tooltip title="Upload medical certificate / 上传病假单">
                <Button size="small" icon={<UploadOutlined />} disabled={record.type !== "MedicalLeave"}>Upload MC / 上传MC</Button>
              </Tooltip>
            </Upload>
            {isHrManager && record.status === "Pending" && (
              <>
                <Button size="small" type="primary" onClick={() => onDecideLeave(record.id, "Approved")}>Approve / 批准</Button>
                <Button size="small" danger onClick={() => onDecideLeave(record.id, "Rejected")}>Reject / 拒绝</Button>
              </>
            )}
          </div>
        </article>
      ))}
      {filteredLeaveRequests.length > hrRecordPageSize && <Pagination current={leavePage.current} pageSize={hrRecordPageSize} total={filteredLeaveRequests.length} showSizeChanger={false} onChange={(page) => setRecordPage("leave", page)} />}
    </div>
  );

  const balanceMobileCards = (
    <div className="mobileRecordList">
      {filteredLeaveBalances.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={balanceEmptyText} />}
      {balancePage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">{shortformLabel("AL/MC Balance", "Annual leave and medical leave balance")}</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag>{record.annualLeaveDays + record.medicalLeaveDays} days / 天</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Annual Leave / 年假</span><strong>{record.annualLeaveDays}</strong></div>
            <div><span>Medical Leave / 病假</span><strong>{record.medicalLeaveDays}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Notes / 备注</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{record.notes || "-"}</span></div>
          </div>
        </article>
      ))}
      {filteredLeaveBalances.length > hrRecordPageSize && <Pagination current={balancePage.current} pageSize={hrRecordPageSize} total={filteredLeaveBalances.length} showSizeChanger={false} onChange={(page) => setRecordPage("balances", page)} />}
    </div>
  );

  const policyMobileCards = (
    <div className="mobileRecordList">
      {filteredLeavePolicies.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={policyEmptyText} />}
      {policyPage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Leave Policy / 假期政策</Typography.Text>
              <Typography.Title level={5}>{roleLabel(record.role)}</Typography.Title>
            </div>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Default AL / 默认年假</span><strong>{record.annualLeaveDays}</strong></div>
            <div><span>Default MC / 默认病假</span><strong>{record.medicalLeaveDays}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Notes / 备注</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{record.notes || "-"}</span></div>
          </div>
        </article>
      ))}
      {filteredLeavePolicies.length > hrRecordPageSize && <Pagination current={policyPage.current} pageSize={hrRecordPageSize} total={filteredLeavePolicies.length} showSizeChanger={false} onChange={(page) => setRecordPage("policies", page)} />}
    </div>
  );

  const adjustmentMobileCards = (
    <div className="mobileRecordList">
      {filteredLeaveAdjustments.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={adjustmentEmptyText} />}
      {adjustmentPage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Leave Adjustment / 假期调整</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color={record.direction === "Increase" ? "green" : "orange"}>{leaveAdjustmentDirectionLabel(record.direction)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Type / 类型</span><strong>{leaveAdjustmentTypeLabel(record.type)}</strong></div>
            <div><span>Days / 天数</span><strong>{record.days}</strong></div>
            <div><span>AL After / 年假调整后</span><strong>{record.annualLeaveAfter}</strong></div>
            <div><span>MC After / 病假调整后</span><strong>{record.medicalLeaveAfter}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Reason / 原因</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{record.reason}</span></div>
          </div>
        </article>
      ))}
      {filteredLeaveAdjustments.length > hrRecordPageSize && <Pagination current={adjustmentPage.current} pageSize={hrRecordPageSize} total={filteredLeaveAdjustments.length} showSizeChanger={false} onChange={(page) => setRecordPage("adjustments", page)} />}
    </div>
  );

  const payslipMobileCards = (
    <div className="mobileRecordList">
      {filteredPayslips.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={payslipEmptyText} />}
      {payslipPage.items.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Pay Slip / 薪资单</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color="green">{money(record.netPay)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Period / 月份</span><strong>{payPeriodName(record.payPeriodId, payPeriods)}</strong></div>
            <div><span>Status / 状态</span><strong>{payslipStatusLabel(record.status)}</strong></div>
            <div><span>Base / 底薪</span><strong>{money(record.baseSalary)}</strong></div>
            <div><span>Work Days / 工作天</span><strong>{record.workingDays}</strong></div>
            <div><span>Daily / 日薪</span><strong>{money(record.dailySalary)}</strong></div>
            <div><span>Unpaid / 无薪假</span><strong>{record.unpaidLeaveDays} days</strong></div>
            <div><span>Deduction / 扣除</span><strong>{money(record.unpaidLeaveDeduction)}</strong></div>
            <div><span>OT / 加班</span><strong>{money(record.overtimePay)}</strong></div>
            <div><span>Allowance / 津贴</span><strong>{money(record.allowances)}</strong></div>
            <div><span>Manual Deduct / 手动扣</span><strong>{money(record.manualDeductions)}</strong></div>
            <div><span>Gross / 应发</span><strong>{money(record.grossPay)}</strong></div>
          </div>
        </article>
      ))}
      {filteredPayslips.length > hrRecordPageSize && <Pagination current={payslipPage.current} pageSize={hrRecordPageSize} total={filteredPayslips.length} showSizeChanger={false} onChange={(page) => setRecordPage("payslips", page)} />}
    </div>
  );

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Alert
        type="info"
        showIcon
        message="HR Records / 人事记录"
        description="Attendance guide: Office staff — scan the office QR at both the start and end of the shift; use Manual Check In/Out only if QR is unavailable. Outstation staff follow their approved Business Trip / Outstation Duty flow on mobile. / 打卡说明：办公室员工——上班和放工都扫描办公室二维码，二维码不能用时才手动打卡；外勤员工按已批准的出差流程在手机上开始和结束打卡。"
      />

      {attendanceQrToken && (
        <Alert
          className="attendanceQrPrompt"
          type={qrRedeemError ? "warning" : "info"}
          showIcon
          message={qrRedeemError ? "Office QR needs attention / 办公室二维码需要处理" : "Office QR detected / 已识别办公室二维码"}
          description={qrRedeemError ?? `Confirm QR ${qrAction === "CheckIn" ? "Check In / 上班" : "Check Out / 放工"}. Your attendance is only recorded after you confirm.`}
          action={(
            <Space wrap size={8}>
              <Button type="primary" onClick={() => void confirmQrAttendance()} loading={qrRedeeming}>
                Confirm {qrAction === "CheckIn" ? "Check In / 确认上班" : "Check Out / 确认放工"}
              </Button>
              <Button onClick={onClearAttendanceQrToken} disabled={qrRedeeming}>Dismiss / 取消</Button>
            </Space>
          )}
        />
      )}

      {isHrManager && <ProCard
        className="hrOfficeQrQuickAction"
        title="Office Attendance QR / 办公室打卡二维码"
        extra={<Button icon={<ReloadOutlined />} onClick={() => void onCreateQrChallenge()}>Generate 5-minute QR / 生成5分钟二维码</Button>}
      >
        <Space direction="vertical" size={8} className="fullWidth">
          <Typography.Text type="secondary">
            Keep the current QR on the office display. Employees confirm their Check In or Check Out after signing in; the scan alone does not create attendance.
          </Typography.Text>
          <Space wrap>
            <Button type="primary" icon={<QrcodeOutlined />} onClick={openOfficeQrDisplay}>Open QR display / 打开二维码</Button>
            {attendanceQrChallenge && <Tag color={qrSecondsRemaining > 0 ? "green" : "red"}>Expires in {Math.floor(qrSecondsRemaining / 60)}:{String(qrSecondsRemaining % 60).padStart(2, "0")}</Tag>}
          </Space>
        </Space>
      </ProCard>}

      {attendanceDashboard && <ProCard title="Attendance Dashboard / 打卡概览">
        <Space wrap size={[28, 18]}>
          <Statistic title="Checked In / 已上班" value={attendanceDashboard.checkedInToday} />
          <Statistic title="Checked Out / 已放工" value={attendanceDashboard.checkedOutToday} />
          <Statistic title="Open Sessions / 未放工" value={attendanceDashboard.openSessionsToday} />
          <Statistic title="Office QR / 办公室二维码" value={attendanceDashboard.officeQrSessionsToday} />
          <Statistic title="Manual / 手动" value={attendanceDashboard.manualSessionsToday} />
          <Statistic title="Outstation / 外勤" value={attendanceDashboard.outstationSessionsToday} />
          <Statistic title="Pending Trips / 待审批外勤" value={attendanceDashboard.pendingBusinessTripRequests} />
          <Statistic title="Active Outstation / 当前外勤" value={attendanceDashboard.activeOutstationToday} />
          <Statistic title="Next 7 Days / 未来7天安排" value={attendanceDashboard.upcomingApprovedTrips} />
        </Space>
      </ProCard>}

      <ProCard title="Attendance Reminders / 打卡提醒">
        <Space direction="vertical" size={12} className="fullWidth">
          {attendanceReminders.length === 0 ? <Typography.Text type="secondary">No active reminders / 暂无提醒</Typography.Text> : attendanceReminders.map((reminder) => <Alert key={`${reminder.type}-${reminder.staffUserId}-${reminder.dueDate}`} type="warning" showIcon message={`${attendanceReminderTypeLabel(reminder.type)} · ${reminder.dueDate}`} description={isHrManager ? `${staffName(reminder.staffUserId, visibleStaff)}: ${reminder.message}` : reminder.message} />)}
          {isHrManager && <>
            <Typography.Text strong>Reminder settings / 提醒设置</Typography.Text>
            {attendanceReminderPolicies.map((policy) => <Form key={policy.type} layout="inline" initialValues={policy} onFinish={(values) => onUpdateReminderPolicy(policy.type, { isEnabled: Boolean(values.isEnabled), leadHours: Number(values.leadHours) })}>
              <Typography.Text>{attendanceReminderTypeLabel(policy.type)}</Typography.Text>
              <Form.Item name="isEnabled" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="leadHours" rules={[{ required: true, type: "number", min: 0, max: 720 }]}><InputNumber min={0} max={720} addonAfter="hours" /></Form.Item>
              <Button htmlType="submit">Save / 保存</Button>
            </Form>)}
          </>}
        </Space>
      </ProCard>

      <ProCard title="Business Trip / Outstation Duty / 出差外勤">
        <Space direction="vertical" size={14} className="fullWidth">
          <Typography.Text type="secondary">Outstation attendance requires an approved trip. If there is no approved trip, submit an urgent exception request first; it must still be approved by HR/Admin. / 外勤打卡必须先有已批准的出差安排；没有安排时先提交临时例外申请，仍需 HR/Admin 批准。</Typography.Text>
          <Form form={businessTripForm} layout="vertical" onFinish={(values) => onCreateBusinessTrip(businessTripFromValues(values, selfId))} initialValues={{ staffUserId: selfId, startDate: today, endDate: today, isUrgentException: false }}>
            <div className="leaveDetailsGrid">
              {isHrManager && <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select options={staffOptions} /></Form.Item>}
              <Form.Item name="startDate" label="Start / 开始" rules={[{ required: true }]}><Input type="date" /></Form.Item>
              <Form.Item name="endDate" label="End / 结束" rules={[{ required: true }]}><Input type="date" /></Form.Item>
              <Form.Item name="location" label="Location / 地点" rules={[{ required: true }]}><Input placeholder="Customer site / 客户地点" /></Form.Item>
              <Form.Item name="purpose" label="Purpose / 目的" rules={[{ required: true }]}><Input placeholder="Sales visit / 跑销" /></Form.Item>
              <Form.Item name="isUrgentException" valuePropName="checked"><Checkbox>Urgent exception / 临时外勤例外</Checkbox></Form.Item>
            </div>
            <Button type="primary" htmlType="submit">Submit Outstation Request / 提交外勤申请</Button>
          </Form>
          <Space wrap>
            {ownBusinessTrips.slice(0, 4).map((trip) => (
              <Space key={trip.id} className="tableActionGroup" wrap>
                <Tag color={businessTripStatusColor(trip.status)}>{businessTripStatusLabel(trip.status)}</Tag>
                <Typography.Text>{trip.startDate} to {trip.endDate} · {trip.location}</Typography.Text>
                {trip.status === "Approved" && approvedTripForToday?.id === trip.id && !openSession && <Button size="small" onClick={() => onStartOutstation({ businessTripId: trip.id })}>Start Duty / 开始外勤</Button>}
                {trip.status === "Approved" && approvedTripForToday?.id === trip.id && openSession && <Button size="small" onClick={() => onEndOutstation({ businessTripId: trip.id })}>End Duty / 结束外勤</Button>}
                {(trip.status === "Pending" || trip.status === "Approved") && <Button size="small" onClick={() => onCancelBusinessTrip(trip.id)}>Cancel / 取消</Button>}
              </Space>
            ))}
            {ownBusinessTrips.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstation requests / 暂无外勤申请" />}
          </Space>
          {isHrManager && <Table
            rowKey="id"
            size="small"
            pagination={{ pageSize: 5, showSizeChanger: false }}
            dataSource={businessTrips}
            columns={[
              { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
              { title: "Dates / 日期", render: (_: unknown, trip: HrBusinessTrip) => `${trip.startDate} to ${trip.endDate}` },
              { title: "Location / 地点", dataIndex: "location" },
              { title: "Purpose / 目的", dataIndex: "purpose" },
              { title: "Status / 状态", dataIndex: "status", render: (status: HrBusinessTripStatus) => <Tag color={businessTripStatusColor(status)}>{businessTripStatusLabel(status)}</Tag> },
              { title: "Action / 操作", render: (_: unknown, trip: HrBusinessTrip) => trip.status === "Pending" ? <Space><Button size="small" type="primary" onClick={() => onDecideBusinessTrip(trip.id, "Approved")}>Approve</Button><Button size="small" danger onClick={() => onDecideBusinessTrip(trip.id, "Rejected")}>Reject</Button></Space> : trip.decisionNotes || "-" }
            ]}
          />}
        </Space>
      </ProCard>

      <ProCard title="Today Attendance / 今日打卡">
        <Space direction="vertical" size={12} className="fullWidth attendancePunchCard">
          <div className="attendancePunchStatus">
            <Typography.Text className="mobileRecordEyebrow">Current Status / 当前状态</Typography.Text>
            <Typography.Title level={4}>{attendanceActionText}</Typography.Title>
            <Typography.Text type="secondary">{attendanceActionHint}</Typography.Text>
            <div className="attendanceLiveClock" aria-label="Current time">
              <ClockCircleOutlined />
              <span>{formatLiveClock(clockNow)}</span>
              <small>{formatLiveDate(clockNow)}</small>
            </div>
          </div>
          <div className="attendancePunchActions">
            <Tooltip title={checkInHelpText}>
              <Button icon={<ClockCircleOutlined />} onClick={onCheckIn} disabled={!canCheckInToday}>Manual Check In / 手动上班</Button>
            </Tooltip>
            <Tooltip title={checkOutHelpText}>
              <Button onClick={onCheckOut} disabled={!canCheckOutToday}>Manual Check Out / 手动放工</Button>
            </Tooltip>
            <Tooltip title="Use your phone camera to scan the rotating QR shown on the office screen.">
              <Button type="primary" icon={<QrcodeOutlined />} disabled={!canCheckInToday && !canCheckOutToday} onClick={() => window.alert("Use your phone camera to scan the QR shown on the office screen. / 请用手机相机扫描办公室屏幕上的二维码。")}>Scan Office QR / 扫码打卡</Button>
            </Tooltip>
            {isHrManager && <Button onClick={openOfficeQrDisplay}>Office QR Display / 办公室二维码</Button>}
          </div>
        </Space>
      </ProCard>

      <div id="hr-record-tabs" className="responsiveTabs">
        <Select
          aria-label="Choose HR section"
          className="mobileTabSelect"
          value={activeTab}
          onChange={changeTab}
          options={[
            { value: "attendance", label: "Attendance records / 打卡记录" },
            ...(isHrManager ? [{ value: "qr-display", label: "Office QR display / 办公室二维码" }] : []),
            { value: "availability", label: "Shared calendar / 共享日历" },
            { value: "leave", label: "Leave and MC / 请假与病假" },
            { value: "balances", label: "AL and MC control / 假期管理" },
            { value: "payroll", label: "Pay slip / 薪资单" }
          ]}
        />
        <Tabs
          activeKey={activeTab}
          onChange={changeTab}
          items={[
          {
            key: "attendance",
            label: tabLabel("Attendance / 打卡记录", attendance.length),
            children: (
              <>
                <HrRecordFilterControls
                  filters={recordFilters.attendance}
                  total={attendance.length}
                  filtered={filteredAttendance.length}
                  keywordPlaceholder="Search staff or date / 搜索员工或日期"
                  statusOptions={attendanceStatusOptions}
                  onKeywordChange={(value) => updateRecordFilter("attendance", "keyword", value)}
                  onStatusChange={(value) => updateRecordFilter("attendance", "status", value)}
                  onClear={() => clearRecordFilters("attendance")}
                />
                {attendanceMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={attendanceColumns} dataSource={filteredAttendance} pagination={{ ...tablePagination(hrRecordPageSize), current: attendancePage.current, onChange: (page) => setRecordPage("attendance", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: attendanceEmptyText }} />
              </>
            )
          },
          ...(isHrManager ? [{
            key: "qr-display",
            label: "QR Display / 二维码",
            children: (
              <ProCard title="Office Attendance QR / 办公室打卡二维码" extra={<Button icon={<ReloadOutlined />} onClick={() => void onCreateQrChallenge()}>Generate 5-minute QR / 生成5分钟二维码</Button>}>
                <Space direction="vertical" size={16} align="center" className="fullWidth">
                  {attendanceQrChallenge ? <>
                    <QRCodeSVG value={qrUrl} size={260} includeMargin />
                    <Typography.Text strong>Expires in {Math.floor(qrSecondsRemaining / 60)}:{String(qrSecondsRemaining % 60).padStart(2, "0")} / 剩余时间</Typography.Text>
                    <Typography.Text type="secondary">Employees scan this QR at both the start and end of their shift. Manual Punch In/Out is the fallback. / 员工上班和放工都扫描此二维码，手动打卡只作备用。</Typography.Text>
                  </> : <Empty description="Generate a QR code for the office display / 先生成办公室二维码" />}
                </Space>
              </ProCard>
            )
          }] : []),
          {
            key: "availability",
            label: "Shared Calendar / 共享日历",
            children: (
              <ProCard title="Team Availability / 团队可用时间">
                <Space direction="vertical" size={12} className="fullWidth">
                  <Typography.Text type="secondary">Staff see only busy status for other people; HR/Admin can see approved trip details. This calendar does not track GPS or replace attendance. / 员工只能看到其他人的忙碌状态；HR/Admin 可看到已批准外勤详情。此日历不追踪 GPS，也不取代打卡。</Typography.Text>
                  <Table
                    rowKey={(item) => `${item.staffUserId}-${item.kind}-${item.startDate}-${item.endDate}`}
                    dataSource={availabilityCalendar}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    columns={[
                      { title: "Staff / 员工", dataIndex: "staffDisplayName" },
                      { title: "Dates / 日期", render: (_: unknown, item: HrAvailabilityCalendarItem) => `${item.startDate} to ${item.endDate}` },
                      { title: "Type / 类型", dataIndex: "kind", render: (kind: HrAvailabilityCalendarItem["kind"]) => kind === "Outstation" ? "Outstation / 外勤" : "Leave / 请假" },
                      { title: "Status / 状态", dataIndex: "status", render: () => <Tag color="orange">Busy / 忙碌</Tag> },
                      { title: "Details / 详情", render: (_: unknown, item: HrAvailabilityCalendarItem) => item.location || item.purpose || "Busy / 忙碌" }
                    ]}
                    locale={{ emptyText: "No approved leave or outstation plans / 暂无已批准请假或外勤安排" }}
                  />
                </Space>
              </ProCard>
            )
          },
          {
            key: "leave",
            label: tabLabel("Leave / MC", leaveRequests.length),
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                <ProCard title="Submit Leave Request / 提交请假申请" className="leaveRequestCard">
                  <Form form={leaveForm} layout="vertical" className="leaveRequestForm" onFinish={(values) => onCreateLeave(leaveFromValues(values, selfId, calculatedLeaveDays))} initialValues={{ staffUserId: selfId, type: "AnnualLeave", startDate: today, startHalf: "AM", endDate: today, endHalf: "PM" }}>
                    <div className="leaveIdentityGrid">
                      {isHrManager && <Form.Item name="staffUserId" label="Staff / 员工"><Select options={staffOptions} /></Form.Item>}
                      <Form.Item name="type" label="Leave Type / 请假类型" rules={[{ required: true }]}><Select options={leaveTypes.map((value) => ({ value, label: leaveTypeLabel(value) }))} /></Form.Item>
                    </div>
                    <div className="leaveDatePanel">
                      <Typography.Text className="leaveSectionTitle">Leave Period / 请假日期</Typography.Text>
                      <div className="leaveDateGrid">
                        <Form.Item name="startDate" label="Start Date / 开始日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
                        <Form.Item name="startHalf" label="Start Session / 开始时段" rules={[{ required: true }]}><Select options={halfDayOptions} /></Form.Item>
                        <Form.Item name="endDate" label="End Date / 结束日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
                        <Form.Item name="endHalf" label="End Session / 结束时段" rules={[{ required: true }]}><Select options={halfDayOptions} /></Form.Item>
                      </div>
                    </div>
                    <div className="leaveDetailsGrid">
                      <Form.Item label="Calculated Days / 自动计算天数">
                        <div className="leaveCalculatedDays">
                          <strong>{calculatedLeaveDays > 0 ? calculatedLeaveDays : "-"}</strong>
                          <span>days / 天. Weekends excluded / 默认不计算周末.</span>
                        </div>
                      </Form.Item>
                      <Form.Item name="reason" label="Reason / 原因"><Input.TextArea rows={3} /></Form.Item>
                    </div>
                    <div className="leaveFormActions">
                      <Button type="primary" htmlType="submit" disabled={calculatedLeaveDays <= 0}>Submit Request / 提交申请</Button>
                    </div>
                  </Form>
                </ProCard>
                {isHrManager && (
                  <ProCard title="Holiday Calendar / Johor Default / 假期日历">
                    <Space direction="vertical" size={10} className="fullWidth">
                      <Typography.Text type="secondary">Use this as the HR reference for leave calculation / 作为请假计算参考. Public holiday persistence can be added as the next backend step / 公共假期设定可在下一阶段加入.</Typography.Text>
                      <Space wrap>
                        {johorHolidayReference.map((item) => <Tag color="green" key={item}>{item}</Tag>)}
                      </Space>
                    </Space>
                  </ProCard>
                )}
                <MissingUploadReminder
                  items={missingMedicalCertificateCount > 0 ? [{ label: `${missingMedicalCertificateCount} medical leave request${missingMedicalCertificateCount === 1 ? "" : "s"}`, isPresent: false }] : []}
                  title="Medical certificates need attention / 病假单需注意"
                  description="Medical certificate uploads are optional when a request is created. Use Upload MC in the corresponding leave row when the certificate is available."
                />
                <HrRecordFilterControls
                  filters={recordFilters.leave}
                  total={leaveRequests.length}
                  filtered={filteredLeaveRequests.length}
                  keywordPlaceholder="Search staff, leave type, date or reason / 搜索员工、假期、日期或原因"
                  statusOptions={leaveStatusOptions}
                  onKeywordChange={(value) => updateRecordFilter("leave", "keyword", value)}
                  onStatusChange={(value) => updateRecordFilter("leave", "status", value)}
                  onClear={() => clearRecordFilters("leave")}
                />
                {leaveMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={leaveColumns} dataSource={filteredLeaveRequests} pagination={{ ...tablePagination(hrRecordPageSize), current: leavePage.current, onChange: (page) => setRecordPage("leave", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: leaveEmptyText }} />
              </Space>
            )
          },
          {
            key: "balances",
            label: tabLabel("AL/MC Control", leaveBalances.length),
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                {isHrManager && (
                  <>
                    <ProCard title="Leave Policy Setup / 假期政策设定">
                      <Form layout="vertical" className="formGrid" onFinish={(values) => onUpdatePolicy(policyFromValues(values, leavePolicies))} initialValues={{ role: "Sales", annualLeaveDays: 12, medicalLeaveDays: 14 }}>
                        <Form.Item name="role" label="Role / 角色" rules={[{ required: true }]}><Select options={staffRoleValues.map((role) => ({ value: role, label: roleLabel(role) }))} /></Form.Item>
                        <Form.Item name="annualLeaveDays" label="Default AL / 默认年假" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} step={0.5} /></Form.Item>
                        <Form.Item name="medicalLeaveDays" label="Default MC / 默认病假" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} step={0.5} /></Form.Item>
                        <Form.Item name="notes" label="Notes / 备注"><Input placeholder="Default full-time entitlement / 默认正式员工假期" /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Policy / 保存政策</Button></Form.Item>
                      </Form>
                      <HrRecordFilterControls
                        filters={recordFilters.policies}
                        total={leavePolicies.length}
                        filtered={filteredLeavePolicies.length}
                        keywordPlaceholder="Search role or notes / 搜索角色或备注"
                        onKeywordChange={(value) => updateRecordFilter("policies", "keyword", value)}
                        onClear={() => clearRecordFilters("policies")}
                      />
                      {policyMobileCards}
                      <Table className="desktopDataTable" rowKey="id" columns={policyColumns} dataSource={filteredLeavePolicies} pagination={{ ...tablePagination(hrRecordPageSize), current: policyPage.current, onChange: (page) => setRecordPage("policies", page) }} locale={{ emptyText: policyEmptyText }} />
                    </ProCard>

                    <ProCard title="Apply Default Balance / 套用默认假期">
                      <Form layout="vertical" className="formGrid" onFinish={(values) => onUpdateBalance(balanceFromPolicyValues(values, leavePolicies, leaveBalances, visibleStaff))}>
                        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select options={staffOptions} /></Form.Item>
                        <Form.Item name="role" label="Use Role Policy / 使用角色政策" rules={[{ required: true }]}><Select options={staffRoleValues.map((role) => ({ value: role, label: roleLabel(role) }))} /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Apply Default / 套用默认</Button></Form.Item>
                      </Form>
                    </ProCard>

                    <ProCard title="Leave Adjustment / 假期调整">
                      <Form layout="vertical" className="formGrid" onFinish={(values) => onCreateAdjustment(adjustmentFromValues(values))} initialValues={{ type: "AnnualLeave", direction: "Increase", days: 0.5 }}>
                        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select options={staffOptions} /></Form.Item>
                        <Form.Item name="type" label="Leave Type / 假期类型" rules={[{ required: true }]}><Select options={adjustmentTypes} /></Form.Item>
                        <Form.Item name="direction" label="Action / 操作" rules={[{ required: true }]}><Select options={adjustmentDirections} /></Form.Item>
                        <Form.Item name="days" label="Days / 天数" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0.5} step={0.5} /></Form.Item>
                        <Form.Item name="reason" label="Reason / 原因" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Adjustment / 保存调整</Button></Form.Item>
                      </Form>
                    </ProCard>
                  </>
                )}
                <HrRecordFilterControls
                  filters={recordFilters.balances}
                  total={leaveBalances.length}
                  filtered={filteredLeaveBalances.length}
                  keywordPlaceholder="Search staff, role or notes / 搜索员工、角色或备注"
                  onKeywordChange={(value) => updateRecordFilter("balances", "keyword", value)}
                  onClear={() => clearRecordFilters("balances")}
                />
                {balanceMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={balanceColumns} dataSource={filteredLeaveBalances} pagination={{ ...tablePagination(hrRecordPageSize), current: balancePage.current, onChange: (page) => setRecordPage("balances", page) }} locale={{ emptyText: balanceEmptyText }} />
                <HrRecordFilterControls
                  filters={recordFilters.adjustments}
                  total={leaveAdjustments.length}
                  filtered={filteredLeaveAdjustments.length}
                  keywordPlaceholder="Search staff, action, date or reason / 搜索员工、操作、日期或原因"
                  onKeywordChange={(value) => updateRecordFilter("adjustments", "keyword", value)}
                  onClear={() => clearRecordFilters("adjustments")}
                />
                {adjustmentMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={adjustmentColumns} dataSource={filteredLeaveAdjustments} pagination={{ ...tablePagination(hrRecordPageSize), current: adjustmentPage.current, onChange: (page) => setRecordPage("adjustments", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: adjustmentEmptyText }} />
              </Space>
            )
          },
          {
            key: "payroll",
            label: tabLabel("Pay Slip / 薪资单", payslips.length),
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                {isHrManager && (
                  <>
                    <ProCard title="Payroll Profile / 薪资资料">
                      <Form layout="vertical" className="formGrid" onFinish={(values) => onUpdatePayrollProfile(profileFromValues(values))} initialValues={{ monthlyBaseSalary: 0, overtimeHours: 0, overtimeRate: 0, allowances: 0, manualDeductions: 0 }}>
                        <Form.Item name="id" hidden><Input /></Form.Item>
                        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select options={staffOptions} /></Form.Item>
                        <Form.Item name="monthlyBaseSalary" label="Base / 底薪"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item name="overtimeHours" label="OT Hours / 加班小时"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item name="overtimeRate" label="OT Rate / 加班费率"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item name="allowances" label="Allowances / 津贴"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item name="manualDeductions" label="Deductions / 扣除"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Profile / 保存资料</Button></Form.Item>
                      </Form>
                    </ProCard>
                    <ProCard title="Working Day Pay Period / 薪资月份">
                      <Form layout="vertical" className="formGrid" onFinish={(values) => onCreatePayPeriod(payPeriodFromValues(values))} initialValues={{ startDate: today, endDate: today, workingDays: 22 }}>
                        <Form.Item name="name" label="Period / 月份" rules={[{ required: true }]}><Input placeholder="June 2026" /></Form.Item>
                        <Form.Item name="startDate" label="Start / 开始" rules={[{ required: true }]}><Input type="date" /></Form.Item>
                        <Form.Item name="endDate" label="End / 结束" rules={[{ required: true }]}><Input type="date" /></Form.Item>
                        <Form.Item name="workingDays" label="Working Days / 工作天" rules={[{ required: true }]}><InputNumber className="fullWidth" min={1} /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Period / 新增月份</Button></Form.Item>
                      </Form>
                    </ProCard>
                    <ProCard title="Generate Payslips / 生成薪资单">
                      <Space className="hrGenerateActions" wrap>
                        <Select options={payPeriods.map((period) => ({ value: period.id, label: `${period.name} / ${period.workingDays} days / 天` }))} className="hrPeriodSelect" onChange={(id) => void onGeneratePayslips(id)} placeholder="Select period to generate / 选择月份生成" />
                        <Typography.Text type="secondary">Daily salary = base salary / working days / 日薪 = 底薪 / 工作天. Unpaid leave is deducted from approved leave only / 无薪假只按已批准假期扣除.</Typography.Text>
                      </Space>
                    </ProCard>
                  </>
                )}
                <HrRecordFilterControls
                  filters={recordFilters.payslips}
                  total={payslips.length}
                  filtered={filteredPayslips.length}
                  keywordPlaceholder="Search staff or pay period / 搜索员工或薪资月份"
                  statusOptions={payslipStatusOptions}
                  onKeywordChange={(value) => updateRecordFilter("payslips", "keyword", value)}
                  onStatusChange={(value) => updateRecordFilter("payslips", "status", value)}
                  onClear={() => clearRecordFilters("payslips")}
                />
                {payslipMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={payslipColumns} dataSource={filteredPayslips} pagination={{ ...tablePagination(hrRecordPageSize), current: payslipPage.current, onChange: (page) => setRecordPage("payslips", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: payslipEmptyText }} />
              </Space>
            )
          }
          ]}
        />
      </div>
    </Space>
  );
}

function HrRecordFilterControls({
  filters,
  total,
  filtered,
  keywordPlaceholder,
  statusOptions,
  onKeywordChange,
  onStatusChange,
  onClear
}: {
  filters: HrRecordFilters;
  total: number;
  filtered: number;
  keywordPlaceholder: string;
  statusOptions?: Array<{ value: string; label: string }>;
  onKeywordChange: (value: string) => void;
  onStatusChange?: (value?: string) => void;
  onClear: () => void;
}) {
  const filterActive = Boolean(filters.keyword?.trim() || filters.status);

  return (
    <Space wrap size={8} className="toolbarForm">
      <Input.Search allowClear placeholder={keywordPlaceholder} value={filters.keyword} style={{ width: 280 }} onChange={(event) => onKeywordChange(event.target.value)} />
      {statusOptions && <Select allowClear placeholder="Status / 状态" value={filters.status} options={statusOptions} style={{ minWidth: 160 }} onChange={onStatusChange} />}
      <Tag color={filterActive ? "blue" : "default"}>{filterActive ? `${filtered} of ${total} matching / 相符` : `${total} record${total === 1 ? "" : "s"} / 记录`}</Tag>
      {filterActive && <Button size="small" onClick={onClear}>Clear filters / 清除筛选</Button>}
    </Space>
  );
}

function leaveFromValues(values: Record<string, unknown>, currentUserId: string, calculatedDays: number): HrLeaveRequest {
  return {
    id: crypto.randomUUID(),
    staffUserId: String(values.staffUserId || currentUserId),
    type: values.type as HrLeaveType,
    status: "Pending",
    startDate: String(values.startDate),
    endDate: String(values.endDate),
    days: calculatedDays,
    reason: values.reason ? String(values.reason) : undefined,
    createdAt: new Date().toISOString()
  };
}

function policyFromValues(values: Record<string, unknown>, existingPolicies: HrLeavePolicy[]): HrLeavePolicy {
  const role = String(values.role || "Sales") as StaffRole;
  const existing = existingPolicies.find((policy) => policy.role === role);
  return {
    id: existing?.id || crypto.randomUUID(),
    role,
    annualLeaveDays: Number(values.annualLeaveDays ?? 0),
    medicalLeaveDays: Number(values.medicalLeaveDays ?? 0),
    notes: values.notes ? String(values.notes) : undefined
  };
}

function balanceFromPolicyValues(values: Record<string, unknown>, policies: HrLeavePolicy[], balances: HrLeaveBalance[], staffUsers: StaffUser[]): HrLeaveBalance {
  const staffUserId = String(values.staffUserId || "");
  const role = String(values.role || staffPrimaryRole(staffUserId, staffUsers)) as StaffRole;
  const policy = policies.find((item) => item.role === role);
  const existing = balances.find((item) => item.staffUserId === staffUserId);
  return {
    id: existing?.id || crypto.randomUUID(),
    staffUserId,
    annualLeaveDays: policy?.annualLeaveDays ?? 0,
    medicalLeaveDays: policy?.medicalLeaveDays ?? 0,
    notes: `Applied ${roleLabel(role)} default / 已套用角色默认假期`
  };
}

function adjustmentFromValues(values: Record<string, unknown>): HrLeaveAdjustmentRequest {
  return {
    staffUserId: String(values.staffUserId || ""),
    type: String(values.type || "AnnualLeave") as HrLeaveAdjustmentRequest["type"],
    direction: String(values.direction || "Increase") as HrLeaveAdjustmentRequest["direction"],
    days: Number(values.days ?? 0),
    reason: String(values.reason || "")
  };
}

function calculateLeaveDays(startDate: string, endDate: string, startHalf: "AM" | "PM", endHalf: "AM" | "PM") {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 0;

  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isWorkday(current)) {
      const isStart = sameDate(current, start);
      const isEnd = sameDate(current, end);
      if (isStart && isEnd) {
        days += sameDayLeaveValue(startHalf, endHalf);
      } else if (isStart) {
        days += startHalf === "AM" ? 1 : 0.5;
      } else if (isEnd) {
        days += endHalf === "PM" ? 1 : 0.5;
      } else {
        days += 1;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return Math.max(0, days);
}

function sameDayLeaveValue(startHalf: "AM" | "PM", endHalf: "AM" | "PM") {
  if (startHalf === "AM" && endHalf === "PM") return 1;
  if (startHalf === endHalf) return 0.5;
  return 0;
}

function parseDateOnly(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function isWorkday(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function profileFromValues(values: Record<string, unknown>): HrPayrollProfile {
  return {
    id: String(values.id || crypto.randomUUID()),
    staffUserId: String(values.staffUserId || ""),
    monthlyBaseSalary: Number(values.monthlyBaseSalary ?? 0),
    overtimeHours: Number(values.overtimeHours ?? 0),
    overtimeRate: Number(values.overtimeRate ?? 0),
    allowances: Number(values.allowances ?? 0),
    manualDeductions: Number(values.manualDeductions ?? 0),
    notes: values.notes ? String(values.notes) : undefined
  };
}

function payPeriodFromValues(values: Record<string, unknown>): HrPayPeriod {
  return {
    id: crypto.randomUUID(),
    name: String(values.name || ""),
    startDate: String(values.startDate),
    endDate: String(values.endDate),
    workingDays: Number(values.workingDays ?? 22),
    createdAt: new Date().toISOString()
  };
}

function staffLabel(staff: StaffUser) {
  return `${staff.displayName || staff.email} / ${staff.email}`;
}

function staffName(id: string, staffUsers: StaffUser[]) {
  const staff = staffUsers.find((item) => item.id === id || item.email === id);
  return staff?.displayName || staff?.email || "Unknown staff / 未知员工";
}

function staffPrimaryRole(id: string, staffUsers: StaffUser[]): StaffRole {
  return staffUsers.find((staff) => staff.id === id)?.roles[0] ?? "Sales";
}

function roleLabel(role: StaffRole) {
  return {
    BossAdmin: "Admin / 管理员",
    Sales: "Sales / 销售",
    Loan: "Loan / 贷款",
    Delivery: "Delivery / 出车",
    Finance: "Finance / 财务",
    Repair: "Repair / 整备",
    HrSalary: "HR Payroll / 人事薪资"
  }[role];
}

function defaultLeaveLabel(role: StaffRole, policies: HrLeavePolicy[]) {
  const policy = policies.find((item) => item.role === role);
  return policy ? `AL ${policy.annualLeaveDays} / MC ${policy.medicalLeaveDays}` : "-";
}

function shortformLabel(short: string, long: string) {
  return `${short} / ${long}`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatLiveClock(value: Date) {
  return value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatLiveDate(value: Date) {
  return value.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function payPeriodName(id: string, payPeriods: HrPayPeriod[]) {
  return payPeriods.find((period) => period.id === id)?.name || "Unknown period / 未知月份";
}

function money(value?: number) {
  return `RM ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tablePagination(pageSize = hrRecordPageSize): TablePaginationConfig {
  return {
    pageSize,
    showSizeChanger: false,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} / 共 ${total} 条`
  };
}

function hrRecordEmptyText(total: number, filtered: number, emptyText: string, filteredEmptyText: string) {
  return total > 0 && filtered === 0 ? filteredEmptyText : emptyText;
}

function leaveTypeLabel(type: HrLeaveType) {
  return {
    AnnualLeave: "Annual Leave / 年假",
    MedicalLeave: "Medical Leave / 病假",
    EmergencyLeave: "Emergency Leave / 紧急假",
    UnpaidLeave: "Unpaid Leave / 无薪假"
  }[type];
}

function leaveStatusLabel(status: HrLeaveStatus) {
  return {
    Pending: "Pending / 待处理",
    Approved: "Approved / 已批准",
    Rejected: "Rejected / 已拒绝",
    Cancelled: "Cancelled / 已取消"
  }[status];
}

function attendanceStatusLabel(status: HrAttendanceRecord["status"]) {
  return {
    Present: "Present / 出勤",
    Late: "Late / 迟到",
    HalfDay: "Half day / 半天",
    Absent: "Absent / 缺勤"
  }[status];
}

function attendanceStatusColor(status: HrAttendanceRecord["status"]) {
  return status === "Present" ? "green" : status === "Late" ? "orange" : status === "Absent" ? "red" : "blue";
}

function attendanceVerificationMethodLabel(method: HrAttendanceRecord["verificationMethod"]) {
  return method === "OfficeQr" ? "Office QR / 办公室二维码" : method === "Outstation" ? "Outstation / 外勤" : method === "ManualException" ? "Manual Exception / 人工例外" : "Manual / 手动";
}

function businessTripCoversDate(trip: HrBusinessTrip, date: string) {
  return trip.status === "Approved" && trip.startDate <= date && trip.endDate >= date;
}

function businessTripStatusLabel(status: HrBusinessTripStatus) {
  return status === "Approved" ? "Approved / 已批准" : status === "Rejected" ? "Rejected / 已拒绝" : status === "Cancelled" ? "Cancelled / 已取消" : "Pending / 待审批";
}

function businessTripStatusColor(status: HrBusinessTripStatus) {
  return status === "Approved" ? "green" : status === "Rejected" ? "red" : status === "Cancelled" ? "default" : "orange";
}

function attendanceReminderTypeLabel(type: HrAttendanceReminderType) {
  return type === "PendingApproval" ? "Pending approval / 待审批" : type === "UpcomingOutstation" ? "Upcoming outstation / 即将外勤" : "Missing Check Out / 未放工打卡";
}

function businessTripFromValues(values: Record<string, unknown>, fallbackStaffUserId: string): HrBusinessTrip {
  return {
    id: "",
    staffUserId: String(values.staffUserId || fallbackStaffUserId),
    status: "Pending",
    startDate: String(values.startDate || ""),
    endDate: String(values.endDate || ""),
    location: String(values.location || "").trim(),
    purpose: String(values.purpose || "").trim(),
    isUrgentException: Boolean(values.isUrgentException),
    requestedAt: new Date().toISOString()
  };
}

function payslipStatusLabel(status: HrPayslip["status"]) {
  return status === "Generated" ? "Generated / 已生成" : "Draft / 草稿";
}

function leaveAdjustmentTypeLabel(type: HrLeaveAdjustment["type"]) {
  return type === "AnnualLeave" ? "AL / Annual Leave / 年假" : "MC / Medical Leave / 病假";
}

function leaveAdjustmentDirectionLabel(direction: HrLeaveAdjustment["direction"]) {
  return direction === "Increase" ? "Increase / 增加" : "Decrease / 减少";
}

function leaveStatusColor(status: HrLeaveStatus) {
  return status === "Approved" ? "green" : status === "Rejected" ? "red" : status === "Cancelled" ? "default" : "orange";
}
