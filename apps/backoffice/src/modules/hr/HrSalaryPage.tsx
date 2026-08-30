import { ClockCircleOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { QrcodeOutlined, ReloadOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { Alert, Button, Checkbox, Empty, Form, Input, InputNumber, Pagination, Select, Space, Statistic, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload } from "antd";
import { ProCard, ProTable } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import { OperationsProTable } from "../shared/OperationsProTable";
import { Calendar, DatePicker } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { staffRoleValues } from "../../api";
import { MissingUploadReminder } from "../shared/MissingUploadReminder";
import { OperationsProTable } from "../shared/OperationsProTable";
import { formatMoneyInput, parseMoneyInput } from "../../money";
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
  HrAttendanceNetwork,
  HrCalendarAvailability,
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
  bossCalendar: HrCalendarAvailability[];
  attendanceNetworks: HrAttendanceNetwork[];
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
  onUpdateAttendance: (attendance: HrAttendanceRecord) => Promise<void>;
  onLoadBossCalendar: (from: string, to: string) => Promise<void>;
  onSaveAttendanceNetwork: (network: HrAttendanceNetwork) => Promise<void>;
  onCreateLeave: (leave: HrLeaveRequest) => Promise<HrLeaveRequest>;
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
const businessTripPageSize = 5;

export type HrRecordFilters = {
  keyword?: string;
  status?: string;
};

type HrRecordListKey = "attendance" | "businessTrips" | "leave" | "balances" | "adjustments" | "payslips";

const initialHrRecordPages: Record<HrRecordListKey, number> = {
  attendance: 1,
  businessTrips: 1,
  leave: 1,
  balances: 1,
  adjustments: 1,
  payslips: 1
};

const initialHrRecordFilters: Record<HrRecordListKey, HrRecordFilters> = {
  attendance: {},
  businessTrips: {},
  leave: {},
  balances: {},
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

export function businessTripSearchText(trip: HrBusinessTrip, staffDisplayName: string) {
  return [
    staffDisplayName,
    trip.startDate,
    trip.endDate,
    trip.location,
    trip.purpose,
    businessTripStatusLabel(trip.status),
    trip.decisionNotes
  ].filter(Boolean).join(" ");
}

export const leavePolicyTableConfig = {
  search: false,
  options: false,
  pagination: false,
  recordCreatorProps: false
} as const;

export function groupCalendarAvailabilityByDate(availability: HrCalendarAvailability[]) {
  const events = new Map<string, HrCalendarAvailability[]>();
  availability.forEach((item) => events.set(item.date, [...(events.get(item.date) ?? []), item]));
  return events;
}

export function calendarAvailabilityCellItems(events: HrCalendarAvailability[], limit = 2) {
  const visibleEvents = events.slice(0, limit);
  return { visibleEvents, remainingCount: Math.max(0, events.length - visibleEvents.length) };
}

export function HrSalaryPage({
  currentUser,
  staffUsers,
  attendance,
  attendanceDashboard,
  availabilityCalendar,
  attendanceReminders,
  attendanceReminderPolicies,
  bossCalendar,
  attendanceNetworks,
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
  onUpdateAttendance,
  onLoadBossCalendar,
  onSaveAttendanceNetwork,
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
  const isBossAdmin = Boolean(currentUser?.roles.includes("BossAdmin"));
  const [leaveForm] = Form.useForm();
  const [businessTripForm] = Form.useForm();
  const [selectedMedicalCertificate, setSelectedMedicalCertificate] = useState<File | null>(null);
  const [attendanceNetworkForm] = Form.useForm();
  const [attendanceCorrectionForm] = Form.useForm();
  const [payrollProfileForm] = Form.useForm();
  const [payPeriodForm] = Form.useForm();
  const [clockNow, setClockNow] = useState(() => new Date());
  const [qrRedeeming, setQrRedeeming] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs());
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
  const leaveStartDate = datePickerValueToDateString(Form.useWatch("startDate", leaveForm));
  const leaveEndDate = datePickerValueToDateString(Form.useWatch("endDate", leaveForm));
  const leaveStartHalf = Form.useWatch("startHalf", leaveForm) as "AM" | "PM" | undefined;
  const leaveEndHalf = Form.useWatch("endHalf", leaveForm) as "AM" | "PM" | undefined;
  const leaveType = Form.useWatch("type", leaveForm) as HrLeaveType | undefined;
  const calculatedLeaveDays = useMemo(
    () => calculateLeaveDays(leaveStartDate || today, leaveEndDate || today, leaveStartHalf || "AM", leaveEndHalf || "PM"),
    [leaveEndDate, leaveEndHalf, leaveStartDate, leaveStartHalf, today]
  );

  useEffect(() => {
    if (!shouldShowOptionalMcUpload(leaveType)) setSelectedMedicalCertificate(null);
  }, [leaveType]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!attendanceQrToken || qrRedeeming) return;
    setQrRedeeming(true);
    void onRedeemQr({ token: attendanceQrToken, action: qrAction }).finally(() => {
      onClearAttendanceQrToken();
      setQrRedeeming(false);
    });
  }, [attendanceQrToken, onClearAttendanceQrToken, onRedeemQr, openSession, qrAction, qrRedeeming]);

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

  const attendanceColumns: ColumnsType<HrAttendanceRecord> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Date / 日期", dataIndex: "attendanceDate" },
    { title: "Status / 状态", dataIndex: "status", render: (status: HrAttendanceRecord["status"]) => <Tag color={attendanceStatusColor(status)}>{attendanceStatusLabel(status)}</Tag> },
    { title: "In / 上班", dataIndex: "checkInAt", render: formatDateTime },
    { title: "Out / 下班", dataIndex: "checkOutAt", render: formatDateTime },
    { title: "Method / 方式", render: (_, record) => record.officeNetworkLabel ? <Tag color="blue">Office IP: {record.officeNetworkLabel}</Tag> : attendanceVerificationMethodLabel(record.verificationMethod) }
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
      fixed: "right",
      width: 220,
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

  const policyColumns: ProColumns<HrLeavePolicy>[] = [
    { title: "Role / 角色", dataIndex: "role", editable: false, render: (_, policy) => roleLabel(policy.role) },
    { title: "Annual Leave / 年假", dataIndex: "annualLeaveDays", valueType: "digit", fieldProps: { min: 0, step: 0.5 } },
    { title: "MC entitlement / 病假", dataIndex: "medicalLeaveDays", valueType: "digit", fieldProps: { min: 0, step: 0.5 } },
    { title: "Notes / 备注", dataIndex: "notes", valueType: "text", render: (_, policy) => policy.notes || "-", fieldProps: { placeholder: "Optional notes" } }
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
    { title: "Type / 类型", dataIndex: "employmentType", render: employmentTypeLabel },
    { title: "Base / 底薪", dataIndex: "baseSalary", render: money },
    { title: "Hours / 小时", dataIndex: "workedHours", render: (value: number, record) => record.employmentType === "Hourly" ? value : "-" },
    { title: "Hourly Pay / 时薪", dataIndex: "attendancePay", render: (value: number, record) => record.employmentType === "Hourly" ? money(value) : "-" },
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

  const payrollProfileColumns: ColumnsType<HrPayrollProfile> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Type / 类型", dataIndex: "employmentType", render: (type: HrPayrollProfile["employmentType"]) => type === "Hourly" ? <Tag color="purple">Hourly / 时薪</Tag> : <Tag color="blue">Monthly / 月薪</Tag> },
    { title: "Base / 底薪", dataIndex: "monthlyBaseSalary", render: money },
    { title: "Hourly rate / 时薪", dataIndex: "hourlyRate", render: money },
    { title: "Action / 操作", fixed: "right", render: (_, profile) => <Button size="small" onClick={() => payrollProfileForm.setFieldsValue(profile)}>Edit / 编辑</Button> }
  ];

  const attendanceStatusOptions = ["Present", "Late", "HalfDay", "Absent"].map((value) => ({ value, label: attendanceStatusLabel(value as HrAttendanceRecord["status"]) }));
  const businessTripStatusOptions = ["Pending", "Approved", "Rejected", "Cancelled"].map((value) => ({ value, label: businessTripStatusLabel(value as HrBusinessTripStatus) }));
  const leaveStatusOptions = ["Pending", "Approved", "Rejected", "Cancelled"].map((value) => ({ value, label: leaveStatusLabel(value as HrLeaveStatus) }));
  const payslipStatusOptions = ["Draft", "Generated"].map((value) => ({ value, label: payslipStatusLabel(value as HrPayslip["status"]) }));
  const filteredAttendance = filterHrRecords(
    attendance,
    recordFilters.attendance,
    (record) => [staffName(record.staffUserId, visibleStaff), record.attendanceDate, attendanceStatusLabel(record.status), record.notes, formatDateTime(record.checkInAt), formatDateTime(record.checkOutAt)].filter(Boolean).join(" "),
    (record) => record.status
  );
  const filteredBusinessTrips = filterHrRecords(
    businessTrips,
    recordFilters.businessTrips,
    (trip) => businessTripSearchText(trip, staffName(trip.staffUserId, visibleStaff)),
    (trip) => trip.status
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
  const businessTripPage = paginateHrRecords(filteredBusinessTrips, recordPages.businessTrips, businessTripPageSize);
  const leavePage = paginateHrRecords(filteredLeaveRequests, recordPages.leave);
  const balancePage = paginateHrRecords(filteredLeaveBalances, recordPages.balances);
  const adjustmentPage = paginateHrRecords(filteredLeaveAdjustments, recordPages.adjustments);
  const payslipPage = paginateHrRecords(filteredPayslips, recordPages.payslips);
  const attendanceEmptyText = hrRecordEmptyText(attendance.length, filteredAttendance.length, "No attendance records yet / 暂无打卡记录", "No attendance records match the current filters / 没有符合筛选条件的打卡记录");
  const businessTripEmptyText = hrRecordEmptyText(businessTrips.length, filteredBusinessTrips.length, "No outstation requests yet / 暂无外勤申请", "No outstation requests match the current filters / 没有符合筛选条件的外勤申请");
  const leaveEmptyText = hrRecordEmptyText(leaveRequests.length, filteredLeaveRequests.length, "No leave requests yet / 暂无请假记录", "No leave requests match the current filters / 没有符合筛选条件的请假记录");
  const balanceEmptyText = hrRecordEmptyText(leaveBalances.length, filteredLeaveBalances.length, "No leave balances yet / 暂无假期余额", "No leave balances match the current filters / 没有符合筛选条件的假期余额");
  const adjustmentEmptyText = hrRecordEmptyText(leaveAdjustments.length, filteredLeaveAdjustments.length, "No leave adjustments yet / 暂无假期调整记录", "No leave adjustments match the current filters / 没有符合筛选条件的假期调整记录");
  const payslipEmptyText = hrRecordEmptyText(payslips.length, filteredPayslips.length, "No payslips generated yet / 暂无薪资单", "No payslips match the current filters / 没有符合筛选条件的薪资单");
  const calendarEventsByDate = useMemo(() => {
    const events = new Map<string, HrCalendarAvailability[]>();
    bossCalendar.forEach((item) => events.set(item.date, [...(events.get(item.date) ?? []), item]));
    return events;
  }, [bossCalendar]);
  const attendanceNetworkColumns: ColumnsType<HrAttendanceNetwork> = [
    { title: "Label / 标签", dataIndex: "label" },
    { title: "CIDR range / 网段", dataIndex: "cidr" },
    { title: "Status / 状态", dataIndex: "isActive", render: (active: boolean) => <Tag color={active ? "green" : "default"}>{active ? "Active / 启用" : "Disabled / 停用"}</Tag> },
    {
      title: "Action / 操作",
      fixed: "right",
      render: (_, network) => <Button size="small" disabled={!network.isActive} onClick={() => void onSaveAttendanceNetwork({ ...network, isActive: false })}>Disable / 停用</Button>
    }
  ];
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

  const businessTripMobileCards = (
    <div className="mobileRecordList">
      {filteredBusinessTrips.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={businessTripEmptyText} />}
      {businessTripPage.items.map((trip) => (
        <article className="mobileRecordCard" key={trip.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Outstation Request / 外勤申请</Typography.Text>
              <Typography.Title level={5}>{staffName(trip.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color={businessTripStatusColor(trip.status)}>{businessTripStatusLabel(trip.status)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Start / 开始</span><strong>{trip.startDate}</strong></div>
            <div><span>End / 结束</span><strong>{trip.endDate}</strong></div>
            <div><span>Location / 地点</span><strong>{trip.location}</strong></div>
          </div>
          <div className="mobileRecordSection">
            <Typography.Text className="mobileRecordLabel">Purpose / 目的</Typography.Text>
            <div className="mobileRecordTextBlock"><span>{trip.purpose}</span></div>
          </div>
          <div className="mobileRecordFooter hrMobileActions">
            {trip.isUrgentException && <Tag color="red">Urgent / 紧急</Tag>}
            {trip.status === "Pending" && <>
              <Button size="small" type="primary" onClick={() => onDecideBusinessTrip(trip.id, "Approved")}>Approve / 批准</Button>
              <Button size="small" danger onClick={() => onDecideBusinessTrip(trip.id, "Rejected")}>Reject / 拒绝</Button>
            </>}
            {trip.status !== "Pending" && trip.decisionNotes && <Typography.Text type="secondary">{trip.decisionNotes}</Typography.Text>}
          </div>
        </article>
      ))}
      {filteredBusinessTrips.length > businessTripPageSize && <Pagination current={businessTripPage.current} pageSize={businessTripPageSize} total={filteredBusinessTrips.length} showSizeChanger={false} onChange={(page) => setRecordPage("businessTrips", page)} />}
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
        className="operationalInfoAlert"
        type="info"
        showIcon
        message="HR Records / 人事记录"
        description="Attendance guide: Office staff — scan the office QR at both the start and end of the shift; use Manual Check In/Out only if QR is unavailable. Outstation staff follow their approved Business Trip / Outstation Duty flow on mobile. / 打卡说明：办公室员工——上班和放工都扫描办公室二维码，二维码不能用时才手动打卡；外勤员工按已批准的出差流程在手机上开始和结束打卡。"
      />

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
                {trip.status === "Approved" && approvedTripForToday?.id === trip.id && !openSession && <Tooltip title="Outstation attendance is not available yet. Use office IP attendance or ask HR for a correction."><Button size="small" disabled>Start Duty / 开始外勤</Button></Tooltip>}
                {trip.status === "Approved" && approvedTripForToday?.id === trip.id && openSession && <Tooltip title="Outstation attendance is not available yet. Use office IP attendance or ask HR for a correction."><Button size="small" disabled>End Duty / 结束外勤</Button></Tooltip>}
                {(trip.status === "Pending" || trip.status === "Approved") && <Button size="small" onClick={() => onCancelBusinessTrip(trip.id)}>Cancel / 取消</Button>}
              </Space>
            ))}
            {ownBusinessTrips.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstation requests / 暂无外勤申请" />}
          </Space>
          {isHrManager && <>
            <HrRecordFilterControls
              filters={recordFilters.businessTrips}
              total={businessTrips.length}
              filtered={filteredBusinessTrips.length}
              keywordPlaceholder="Search staff, location or purpose / 搜索员工、地点或目的"
              statusOptions={businessTripStatusOptions}
              onKeywordChange={(value) => updateRecordFilter("businessTrips", "keyword", value)}
              onStatusChange={(value) => updateRecordFilter("businessTrips", "status", value)}
              onClear={() => clearRecordFilters("businessTrips")}
            />
            {businessTripMobileCards}
            <OperationsProTable
              className="desktopDataTable"
              rowKey="id"
              size="small"
              pagination={{ ...tablePagination(businessTripPageSize), current: businessTripPage.current, onChange: (page) => setRecordPage("businessTrips", page) }}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: businessTripEmptyText }}
              dataSource={filteredBusinessTrips}
              columns={[
                { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
                { title: "Dates / 日期", render: (_: unknown, trip: HrBusinessTrip) => `${trip.startDate} to ${trip.endDate}` },
                { title: "Location / 地点", dataIndex: "location" },
                { title: "Purpose / 目的", dataIndex: "purpose" },
                { title: "Status / 状态", dataIndex: "status", render: (status: HrBusinessTripStatus) => <Tag color={businessTripStatusColor(status)}>{businessTripStatusLabel(status)}</Tag> },
                { title: "Action / 操作", fixed: "right", width: 220, render: (_: unknown, trip: HrBusinessTrip) => trip.status === "Pending" ? <Space className="tableActionGroup" wrap size={6}><Button size="small" type="primary" onClick={() => onDecideBusinessTrip(trip.id, "Approved")}>Approve / 批准</Button><Button size="small" danger onClick={() => onDecideBusinessTrip(trip.id, "Rejected")}>Reject / 拒绝</Button></Space> : trip.decisionNotes || "-" }
              ]}
            />
          </>}
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
          </div>
          {attendanceQrToken && <Alert type="info" showIcon message="Office QR detected / 已识别办公室二维码" description={`Recording QR ${qrAction === "CheckIn" ? "Check In / 上班" : "Check Out / 放工"} now. / 正在记录二维码${qrAction === "CheckIn" ? "上班" : "放工"}打卡。`} />}
        </Space>
      </ProCard>

      <Tabs
        activeKey={activeTab}
        onChange={changeTab}
        items={[
          ...(isBossAdmin ? [{
            key: "staff-calendar",
            label: "Staff Calendar / 员工日历",
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                <Alert
                  type="info"
                  showIcon
                  message="Approved leave availability only / 仅显示已批准的请假状态"
                  description="Each name below means Unavailable for that day. Leave reason, MC and medical details are intentionally not shown. If this local preview cannot reach the API, fictional sample availability is shown instead."
                />
                <ProCard title="Monthly availability / 月度可用性">
                  <Calendar
                    fullscreen={false}
                    value={calendarMonth}
                    onPanelChange={(value) => {
                      setCalendarMonth(value);
                      const [from, to] = calendarMonthRange(value);
                      void onLoadBossCalendar(from, to);
                    }}
                    cellRender={(value, info) => {
                      if (info.type !== "date") return null;
                      const events = calendarEventsByDate.get(value.format("YYYY-MM-DD")) ?? [];
                      return events.map((event) => <Tag color="volcano" key={`${event.staffUserId}-${event.date}`}>{event.staffName} · Unavailable</Tag>);
                    }}
                  />
                </ProCard>
              </Space>
            )
          }, {
            key: "office-network",
            label: "Office Network / 办公室网络",
            children: (
              <Space direction="vertical" size={16} className="fullWidth">
                <Alert type="warning" showIcon message="Attendance is accepted only from an active office CIDR range." description="Configure production office ranges before staff use this check-in method. Raw client IP history is not retained." />
                <ProCard title="Office network allow-list / 办公室网络白名单">
                  <Form
                    form={attendanceNetworkForm}
                    layout="vertical"
                    className="formGrid"
                    initialValues={{ isActive: true }}
                    onFinish={(values) => {
                      const network: HrAttendanceNetwork = {
                        id: crypto.randomUUID(),
                        label: String(values.label || ""),
                        cidr: String(values.cidr || ""),
                        isActive: Boolean(values.isActive),
                        createdAt: new Date().toISOString()
                      };
                      void onSaveAttendanceNetwork(network).then(() => attendanceNetworkForm.resetFields());
                    }}
                  >
                    <Form.Item name="label" label="Office label / 办公室标签" rules={[{ required: true }]}><Input placeholder="e.g. Showroom" /></Form.Item>
                    <Form.Item name="cidr" label="CIDR range / 网段" rules={[{ required: true }]}><Input placeholder="e.g. 203.0.113.0/24" /></Form.Item>
                    <Form.Item name="isActive" label="Status / 状态"><Select options={[{ value: true, label: "Active / 启用" }, { value: false, label: "Disabled / 停用" }]} /></Form.Item>
                    <Form.Item className="formActions"><Button type="primary" htmlType="submit">Add office network / 新增办公室网络</Button></Form.Item>
                  </Form>
                  <Table className="desktopDataTable" rowKey="id" columns={attendanceNetworkColumns} dataSource={attendanceNetworks} pagination={false} scroll={{ x: "max-content" }} locale={{ emptyText: "No office network configured / 尚未配置办公室网络" }} />
                </ProCard>
              </Space>
            )
          }] : []),
          {
            key: "attendance",
            label: tabLabel("Attendance / 打卡记录", attendance.length),
            children: (
              <>
                {isHrManager && (
                  <ProCard title="Attendance correction / 打卡更正" className="hrAttendanceCorrection">
                    <Form
                      form={attendanceCorrectionForm}
                      layout="vertical"
                      className="formGrid"
                      onFinish={(values) => {
                        const existing = attendance.find((record) => record.id === values.attendanceId);
                        if (!existing) return;
                        void onUpdateAttendance({ ...existing, status: values.status as HrAttendanceRecord["status"], notes: String(values.notes || "") }).then(() => attendanceCorrectionForm.resetFields());
                      }}
                    >
                      <Form.Item name="attendanceId" label="Attendance record / 打卡记录" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={attendance.map((record) => ({ value: record.id, label: `${staffName(record.staffUserId, visibleStaff)} · ${record.attendanceDate}` }))} /></Form.Item>
                      <Form.Item name="status" label="Corrected status / 更正状态" rules={[{ required: true }]}><Select options={attendanceStatusOptions} /></Form.Item>
                      <Form.Item name="notes" label="Correction note / 更正说明" rules={[{ required: true, whitespace: true, message: "A correction note is required." }]}><Input /></Form.Item>
                      <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save correction / 保存更正</Button></Form.Item>
                    </Form>
                  </ProCard>
                )}
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
                <OperationsProTable className="desktopDataTable" rowKey="id" columns={attendanceColumns} dataSource={filteredAttendance} pagination={{ ...tablePagination(hrRecordPageSize), current: attendancePage.current, onChange: (page) => setRecordPage("attendance", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: attendanceEmptyText }} />
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
                  <Form
                    form={leaveForm}
                    layout="vertical"
                    className="leaveRequestForm"
                    onFinish={async (values) => {
                      const leave = await onCreateLeave(leaveFromValues(values, selfId, calculatedLeaveDays));
                      if (selectedMedicalCertificate) await onUploadMc(leave.id, selectedMedicalCertificate);
                      leaveForm.resetFields();
                      setSelectedMedicalCertificate(null);
                    }}
                    initialValues={{ staffUserId: selfId, type: "AnnualLeave", startDate: dayjs(today), startHalf: "AM", endDate: dayjs(today), endHalf: "PM" }}
                  >
                    <div className="leaveIdentityGrid">
                      {isHrManager && <Form.Item name="staffUserId" label="Staff / 员工"><Select options={staffOptions} /></Form.Item>}
                      <Form.Item name="type" label="Leave Type / 请假类型" rules={[{ required: true }]}><Select options={leaveTypes.map((value) => ({ value, label: leaveTypeLabel(value) }))} /></Form.Item>
                    </div>
                    <div className="leaveDatePanel">
                      <Typography.Text className="leaveSectionTitle">Leave Period / 请假日期</Typography.Text>
                      <div className="leaveDateGrid">
                        <Form.Item name="startDate" label="Start Date / 开始日期" rules={[{ required: true }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
                        <Form.Item name="startHalf" label="Start Session / 开始时段" rules={[{ required: true }]}><Select options={halfDayOptions} /></Form.Item>
                        <Form.Item name="endDate" label="End Date / 结束日期" rules={[{ required: true }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
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
                    {shouldShowOptionalMcUpload(leaveType) && (
                      <Form.Item label="MC document (optional) / 病假单（可选）" extra="Upload a PDF or image now, or submit first and upload it later. Maximum 10 MB.">
                        <Space direction="vertical" size={4}>
                          <Upload
                            accept=".pdf,image/png,image/jpeg,image/webp"
                            beforeUpload={(file) => {
                              setSelectedMedicalCertificate(file);
                              return false;
                            }}
                            showUploadList={false}
                          >
                            <Button icon={<UploadOutlined />}>{selectedMedicalCertificate ? "Replace MC document / 更换病假单" : "Choose MC document / 选择病假单"}</Button>
                          </Upload>
                          {selectedMedicalCertificate && <Space size={6}><Typography.Text type="secondary">Selected: {selectedMedicalCertificate.name}</Typography.Text><Button type="link" size="small" onClick={() => setSelectedMedicalCertificate(null)}>Remove / 移除</Button></Space>}
                        </Space>
                      </Form.Item>
                    )}
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
                <OperationsProTable className="desktopDataTable" rowKey="id" columns={leaveColumns} dataSource={filteredLeaveRequests} pagination={{ ...tablePagination(hrRecordPageSize), current: leavePage.current, onChange: (page) => setRecordPage("leave", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: leaveEmptyText }} />
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
                    <ProCard title="Leave Policies / 假期政策">
                      <ProTable<HrLeavePolicy>
                        className="desktopDataTable"
                        rowKey="id"
                        columns={policyColumns}
                        dataSource={leavePolicies}
                        {...leavePolicyTableConfig}
                        editable={{
                          type: "multiple",
                          onSave: async (_, policy) => onUpdatePolicy(policy)
                        }}
                        scroll={{ x: 780 }}
                        locale={{ emptyText: "No leave policies yet / 暂无假期政策" }}
                      />
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
                <OperationsProTable className="desktopDataTable" rowKey="id" columns={balanceColumns} dataSource={filteredLeaveBalances} pagination={{ ...tablePagination(hrRecordPageSize), current: balancePage.current, onChange: (page) => setRecordPage("balances", page) }} locale={{ emptyText: balanceEmptyText }} />
                <HrRecordFilterControls
                  filters={recordFilters.adjustments}
                  total={leaveAdjustments.length}
                  filtered={filteredLeaveAdjustments.length}
                  keywordPlaceholder="Search staff, action, date or reason / 搜索员工、操作、日期或原因"
                  onKeywordChange={(value) => updateRecordFilter("adjustments", "keyword", value)}
                  onClear={() => clearRecordFilters("adjustments")}
                />
                {adjustmentMobileCards}
                <OperationsProTable className="desktopDataTable" rowKey="id" columns={adjustmentColumns} dataSource={filteredLeaveAdjustments} pagination={{ ...tablePagination(hrRecordPageSize), current: adjustmentPage.current, onChange: (page) => setRecordPage("adjustments", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: adjustmentEmptyText }} />
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
                      <Form form={payrollProfileForm} layout="vertical" className="formGrid" onFinish={(values) => onUpdatePayrollProfile(profileFromValues(values))} initialValues={{ employmentType: "Monthly", monthlyBaseSalary: 0, hourlyRate: 0, overtimeHours: 0, overtimeRate: 0, allowances: 0, manualDeductions: 0 }}>
                        <Form.Item name="id" hidden><Input /></Form.Item>
                        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select options={staffOptions} /></Form.Item>
                        <Form.Item name="employmentType" label="Employment type / 雇用类型" rules={[{ required: true }]}><Select options={[{ value: "Monthly", label: "Monthly / 月薪" }, { value: "Hourly", label: "Hourly / 时薪" }]} /></Form.Item>
                        <Form.Item name="monthlyBaseSalary" label="Base / 底薪"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                        <Form.Item name="hourlyRate" label="Hourly rate / 时薪"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                        <Form.Item name="overtimeHours" label="OT Hours / 加班小时"><InputNumber className="fullWidth" min={0} /></Form.Item>
                        <Form.Item name="overtimeRate" label="OT Rate / 加班费率"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                        <Form.Item name="allowances" label="Allowances / 津贴"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                        <Form.Item name="manualDeductions" label="Deductions / 扣除"><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Save Profile / 保存资料</Button></Form.Item>
                      </Form>
                      <Table className="desktopDataTable" rowKey="id" columns={payrollProfileColumns} dataSource={payrollProfiles} pagination={false} scroll={{ x: "max-content" }} locale={{ emptyText: "No payroll profiles yet / 暂无薪资资料" }} />
                    </ProCard>
                    <ProCard title="Working Day Pay Period / 薪资月份">
                      <Form form={payPeriodForm} layout="vertical" className="formGrid" onFinish={(values) => onCreatePayPeriod(payPeriodFromValues(values))} initialValues={payPeriodDefaults(dayjs(today))}>
                        <Form.Item name="payPeriod" label="Pay Period / 薪资月份" rules={[{ required: true }]}><DatePicker picker="month" className="fullWidth" format="MMMM YYYY" onChange={(value) => value && payPeriodForm.setFieldsValue(payPeriodDefaults(value))} /></Form.Item>
                        <Form.Item name="startDate" label="Start / 开始" rules={[{ required: true }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" disabled /></Form.Item>
                        <Form.Item name="endDate" label="End / 结束" rules={[{ required: true }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" disabled /></Form.Item>
                        <Form.Item name="workingDays" label="Working Days / 工作天" extra="Auto-filled for Monday–Friday. Adjust for public holidays if needed." rules={[{ required: true }]}><InputNumber className="fullWidth" min={1} /></Form.Item>
                        <Form.Item className="formActions"><Button type="primary" htmlType="submit">Create Period / 新增月份</Button></Form.Item>
                      </Form>
                    </ProCard>
                    <ProCard title="Generate Payslips / 生成薪资单">
                      <Space className="hrGenerateActions" wrap>
                        <Select options={payPeriods.map((period) => ({ value: period.id, label: `${period.name} / ${period.workingDays} days / 天` }))} className="hrPeriodSelect" onChange={(id) => void onGeneratePayslips(id)} placeholder="Select period to generate / 选择月份生成" />
                        <Typography.Text type="secondary">Monthly: base salary / working days, with approved unpaid leave deduction. Hourly: completed Present, Late and Half Day clock time × hourly rate + allowances − manual deductions. No break or overtime adjustment is applied automatically.</Typography.Text>
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
                <OperationsProTable className="desktopDataTable" rowKey="id" columns={payslipColumns} dataSource={filteredPayslips} pagination={{ ...tablePagination(hrRecordPageSize), current: payslipPage.current, onChange: (page) => setRecordPage("payslips", page) }} scroll={{ x: "max-content" }} locale={{ emptyText: payslipEmptyText }} />
              </Space>
            )
          }
        ]}
      />
    </Space>
  );
}

export function HrRecordFilterControls({
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
    startDate: datePickerValueToDateString(values.startDate),
    endDate: datePickerValueToDateString(values.endDate),
    days: calculatedDays,
    reason: values.reason ? String(values.reason) : undefined,
    createdAt: new Date().toISOString()
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
    employmentType: values.employmentType === "Hourly" ? "Hourly" : "Monthly",
    hourlyRate: Number(values.hourlyRate ?? 0),
    overtimeHours: Number(values.overtimeHours ?? 0),
    overtimeRate: Number(values.overtimeRate ?? 0),
    allowances: Number(values.allowances ?? 0),
    manualDeductions: Number(values.manualDeductions ?? 0),
    notes: values.notes ? String(values.notes) : undefined
  };
}

export function payPeriodFromValues(values: Record<string, unknown>): HrPayPeriod {
  return {
    id: crypto.randomUUID(),
    name: payPeriodNameFromValue(values.payPeriod ?? values.name),
    startDate: datePickerValueToDateString(values.startDate),
    endDate: datePickerValueToDateString(values.endDate),
    workingDays: Number(values.workingDays ?? 22),
    createdAt: new Date().toISOString()
  };
}

export function payPeriodDefaults(value: dayjs.Dayjs) {
  const payPeriod = value.startOf("month");
  const startDate = payPeriod.startOf("month");
  const endDate = payPeriod.endOf("month");
  let workingDays = 0;
  for (let date = startDate; date.isBefore(endDate) || date.isSame(endDate, "day"); date = date.add(1, "day")) {
    if (date.day() !== 0 && date.day() !== 6) workingDays += 1;
  }

  return { payPeriod, startDate, endDate, workingDays };
}

export function shouldShowOptionalMcUpload(type?: HrLeaveType) {
  return type === "MedicalLeave";
}

export function datePickerValueToDateString(value: unknown) {
  if (dayjs.isDayjs(value)) return value.format("YYYY-MM-DD");
  return typeof value === "string" ? value : "";
}

export function payPeriodNameFromValue(value: unknown) {
  if (dayjs.isDayjs(value)) return value.format("MMMM YYYY");
  const parsed = dayjs(String(value || ""));
  return parsed.isValid() ? parsed.format("MMMM YYYY") : "";
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
  return `RM ${new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0))}`;
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
  return method === "OfficeIp" ? "Office IP / 办公室网络" : method === "OfficeQr" ? "Office QR / 办公室二维码" : method === "Outstation" ? "Outstation / 外勤" : method === "ManualException" ? "Manual Exception / 人工例外" : "Manual / 手动";
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

function employmentTypeLabel(type: HrPayslip["employmentType"]) {
  return type === "Hourly" ? <Tag color="purple">Hourly / 时薪</Tag> : <Tag color="blue">Monthly / 月薪</Tag>;
}

function calendarMonthRange(value: dayjs.Dayjs): [string, string] {
  return [value.startOf("month").format("YYYY-MM-DD"), value.endOf("month").format("YYYY-MM-DD")];
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
