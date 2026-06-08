import { ClockCircleOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { ProCard } from "@ant-design/pro-components";
import { Alert, Button, Empty, Form, Input, InputNumber, Select, Space, Table, Tabs, Tag, Tooltip, Typography, Upload } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import type { TablePaginationConfig } from "antd/es/table/interface";
import { staffRoleValues } from "../../api";
import type {
  CurrentUser,
  HrAttendanceRecord,
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
  leaveRequests: HrLeaveRequest[];
  leaveBalances: HrLeaveBalance[];
  leavePolicies: HrLeavePolicy[];
  leaveAdjustments: HrLeaveAdjustment[];
  payrollProfiles: HrPayrollProfile[];
  payPeriods: HrPayPeriod[];
  payslips: HrPayslip[];
  onCheckIn: () => Promise<void>;
  onCheckOut: () => Promise<void>;
  onCreateLeave: (leave: HrLeaveRequest) => Promise<void>;
  onDecideLeave: (leaveId: string, status: HrLeaveStatus, decisionNotes?: string) => Promise<void>;
  onCancelLeave: (leaveId: string) => Promise<void>;
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

export function HrSalaryPage({
  currentUser,
  staffUsers,
  attendance,
  leaveRequests,
  leaveBalances,
  leavePolicies,
  leaveAdjustments,
  payrollProfiles,
  payPeriods,
  payslips,
  onCheckIn,
  onCheckOut,
  onCreateLeave,
  onDecideLeave,
  onCancelLeave,
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
  const [clockNow, setClockNow] = useState(() => new Date());
  const staffOptions = staffUsers.map((staff) => ({ value: staff.id, label: staffLabel(staff) }));
  const selfId = currentUser?.id ?? "";
  const selfName = currentUser?.name ?? "Current staff";
  const today = new Date().toISOString().slice(0, 10);
  const openSession = attendance.find((record) => record.staffUserId === selfId && record.attendanceDate === today && record.checkInAt && !record.checkOutAt);
  const canCheckInToday = !openSession;
  const canCheckOutToday = Boolean(openSession);
  const attendanceActionText = openSession ? "Checked in now / 已上班" : "Ready to check in / 可以打卡";
  const visibleStaff = staffUsers.length ? staffUsers : [{ id: selfId, email: currentUser?.name ?? "", displayName: selfName, roles: [], isActive: true }];
  const leaveStartDate = Form.useWatch("startDate", leaveForm) as string | undefined;
  const leaveEndDate = Form.useWatch("endDate", leaveForm) as string | undefined;
  const leaveStartHalf = Form.useWatch("startHalf", leaveForm) as "AM" | "PM" | undefined;
  const leaveEndHalf = Form.useWatch("endHalf", leaveForm) as "AM" | "PM" | undefined;
  const calculatedLeaveDays = useMemo(
    () => calculateLeaveDays(leaveStartDate || today, leaveEndDate || today, leaveStartHalf || "AM", leaveEndHalf || "PM"),
    [leaveEndDate, leaveEndHalf, leaveStartDate, leaveStartHalf, today]
  );
  const canCancelLeave = (record: HrLeaveRequest) => record.status === "Pending" && (isHrManager || record.staffUserId === selfId);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const attendanceColumns: ColumnsType<HrAttendanceRecord> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Date / 日期", dataIndex: "attendanceDate" },
    { title: "In / 上班", dataIndex: "checkInAt", render: formatDateTime },
    { title: "Out / 下班", dataIndex: "checkOutAt", render: formatDateTime }
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
          {record.medicalCertificateDocumentId ? <Button icon={<DownloadOutlined />} href={mcContentUrl(record.id)} target="_blank" /> : <Tag>None / 没有</Tag>}
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
          {canCancelLeave(record) && <Button onClick={() => onCancelLeave(record.id)}>Cancel / 取消</Button>}
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
    { title: "By / 操作者", dataIndex: "adjustedBy" }
  ];

  const payslipColumns: ColumnsType<HrPayslip> = [
    { title: "Staff / 员工", dataIndex: "staffUserId", render: (id: string) => staffName(id, visibleStaff) },
    { title: "Period / 月份", dataIndex: "payPeriodId", render: (id: string) => payPeriods.find((period) => period.id === id)?.name ?? id },
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

  const attendanceTableColumns = withColumnFilters(attendanceColumns, [
    { dataIndex: "staffUserId", filters: textFilters(attendance.map((record) => staffName(record.staffUserId, visibleStaff))), filterSearch: true, onFilter: (value, row) => staffName(row.staffUserId, visibleStaff) === value },
    { dataIndex: "attendanceDate", filters: textFilters(attendance.map((record) => record.attendanceDate)), filterSearch: true, onFilter: (value, row) => row.attendanceDate === value }
  ]);

  const leaveTableColumns = withColumnFilters(leaveColumns, [
    { dataIndex: "staffUserId", filters: textFilters(leaveRequests.map((record) => staffName(record.staffUserId, visibleStaff))), filterSearch: true, onFilter: (value, row) => staffName(row.staffUserId, visibleStaff) === value },
    { dataIndex: "type", filters: textFilters(leaveRequests.map((record) => leaveTypeLabel(record.type))), onFilter: (value, row) => leaveTypeLabel(row.type) === value },
    { dataIndex: "status", filters: textFilters(leaveRequests.map((record) => record.status)), onFilter: (value, row) => row.status === value }
  ]);

  const balanceTableColumns = withColumnFilters(balanceColumns, [
    { dataIndex: "staffUserId", filters: textFilters(leaveBalances.map((record) => staffName(record.staffUserId, visibleStaff))), filterSearch: true, onFilter: (value, row) => staffName(row.staffUserId, visibleStaff) === value }
  ]);

  const policyTableColumns = withColumnFilters(policyColumns, [
    { dataIndex: "role", filters: textFilters(leavePolicies.map((record) => roleLabel(record.role))), filterSearch: true, onFilter: (value, row) => roleLabel(row.role) === value }
  ]);

  const adjustmentTableColumns = withColumnFilters(adjustmentColumns, [
    { dataIndex: "staffUserId", filters: textFilters(leaveAdjustments.map((record) => staffName(record.staffUserId, visibleStaff))), filterSearch: true, onFilter: (value, row) => staffName(row.staffUserId, visibleStaff) === value },
    { dataIndex: "type", filters: textFilters(leaveAdjustments.map((record) => leaveAdjustmentTypeLabel(record.type))), onFilter: (value, row) => leaveAdjustmentTypeLabel(row.type) === value },
    { dataIndex: "direction", filters: textFilters(leaveAdjustments.map((record) => leaveAdjustmentDirectionLabel(record.direction))), onFilter: (value, row) => leaveAdjustmentDirectionLabel(row.direction) === value }
  ]);

  const payslipTableColumns = withColumnFilters(payslipColumns, [
    { dataIndex: "staffUserId", filters: textFilters(payslips.map((record) => staffName(record.staffUserId, visibleStaff))), filterSearch: true, onFilter: (value, row) => staffName(row.staffUserId, visibleStaff) === value },
    { dataIndex: "payPeriodId", filters: textFilters(payslips.map((record) => payPeriods.find((period) => period.id === record.payPeriodId)?.name ?? record.payPeriodId)), filterSearch: true, onFilter: (value, row) => (payPeriods.find((period) => period.id === row.payPeriodId)?.name ?? row.payPeriodId) === value }
  ]);

  const attendanceMobileCards = (
    <div className="mobileRecordList">
      {attendance.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attendance records yet / 暂无打卡记录" />}
      {attendance.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Attendance / 打卡</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Date / 日期</span><strong>{record.attendanceDate}</strong></div>
            <div><span>In / 上班</span><strong>{formatDateTime(record.checkInAt)}</strong></div>
            <div><span>Out / 下班</span><strong>{formatDateTime(record.checkOutAt)}</strong></div>
          </div>
        </article>
      ))}
    </div>
  );

  const leaveMobileCards = (
    <div className="mobileRecordList">
      {leaveRequests.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave requests yet / 暂无请假记录" />}
      {leaveRequests.map((record) => (
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
            {record.medicalCertificateDocumentId ? <Tooltip title="Medical certificate / 病假单"><Button size="small" icon={<DownloadOutlined />} href={mcContentUrl(record.id)} target="_blank">MC</Button></Tooltip> : <Tooltip title="Medical certificate / 病假单"><Tag>MC: None / 没有</Tag></Tooltip>}
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
            {canCancelLeave(record) && <Button size="small" onClick={() => onCancelLeave(record.id)}>Cancel / 取消</Button>}
          </div>
        </article>
      ))}
    </div>
  );

  const balanceMobileCards = (
    <div className="mobileRecordList">
      {leaveBalances.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave balances yet / 暂无假期余额" />}
      {leaveBalances.map((record) => (
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
    </div>
  );

  const policyMobileCards = (
    <div className="mobileRecordList">
      {leavePolicies.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave policies yet / 暂无假期政策" />}
      {leavePolicies.map((record) => (
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
    </div>
  );

  const adjustmentMobileCards = (
    <div className="mobileRecordList">
      {leaveAdjustments.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave adjustments yet / 暂无假期调整记录" />}
      {leaveAdjustments.map((record) => (
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
    </div>
  );

  const payslipMobileCards = (
    <div className="mobileRecordList">
      {payslips.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payslips generated yet / 暂无薪资单" />}
      {payslips.map((record) => (
        <article className="mobileRecordCard" key={record.id}>
          <div className="mobileRecordHeader">
            <div>
              <Typography.Text className="mobileRecordEyebrow">Pay Slip / 薪资单</Typography.Text>
              <Typography.Title level={5}>{staffName(record.staffUserId, visibleStaff)}</Typography.Title>
            </div>
            <Tag color="green">{money(record.netPay)}</Tag>
          </div>
          <div className="mobileRecordGrid">
            <div><span>Period / 月份</span><strong>{payPeriods.find((period) => period.id === record.payPeriodId)?.name ?? record.payPeriodId}</strong></div>
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
    </div>
  );

  return (
    <Space direction="vertical" size={16} className="fullWidth">
      <Alert
        type="info"
        showIcon
        message="HR Records / 人事记录"
        description="Staff can check attendance and submit leave. HR/Admin manage leave balances, payroll setup, and payslips. / 员工可打卡和请假，HR/Admin 管理假期余额、薪资资料和薪资单。"
      />

      <ProCard title="Today Attendance / 今日打卡">
        <Space direction="vertical" size={12} className="fullWidth attendancePunchCard">
          <div className="attendancePunchStatus">
            <Typography.Text className="mobileRecordEyebrow">Current Status / 当前状态</Typography.Text>
            <Typography.Title level={4}>{attendanceActionText}</Typography.Title>
            <div className="attendanceLiveClock" aria-label="Current time">
              <ClockCircleOutlined />
              <span>{formatLiveClock(clockNow)}</span>
              <small>{formatLiveDate(clockNow)}</small>
            </div>
          </div>
          <div className="attendancePunchActions">
            <Button type="primary" icon={<ClockCircleOutlined />} onClick={onCheckIn} disabled={!canCheckInToday}>Check In / 上班打卡</Button>
            <Button onClick={onCheckOut} disabled={!canCheckOutToday}>Check Out / 下班打卡</Button>
          </div>
        </Space>
      </ProCard>

      <Tabs
        defaultActiveKey="attendance"
        items={[
          {
            key: "attendance",
            label: "Attendance / 打卡记录",
            children: (
              <>
                {attendanceMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={attendanceTableColumns} dataSource={attendance} pagination={tablePagination(8)} scroll={{ x: "max-content" }} />
              </>
            )
          },
          {
            key: "leave",
            label: shortformLabel("Leave / MC", "请假与病假单"),
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
                {leaveMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={leaveTableColumns} dataSource={leaveRequests} pagination={tablePagination(8)} scroll={{ x: "max-content" }} />
              </Space>
            )
          },
          {
            key: "balances",
            label: shortformLabel("AL/MC Control", "年假与病假管理"),
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
                      {policyMobileCards}
                      <Table className="desktopDataTable" rowKey="id" columns={policyTableColumns} dataSource={leavePolicies} pagination={tablePagination(8)} />
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
                {balanceMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={balanceTableColumns} dataSource={leaveBalances} pagination={tablePagination(8)} />
                {adjustmentMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={adjustmentTableColumns} dataSource={leaveAdjustments} pagination={tablePagination(8)} scroll={{ x: "max-content" }} />
              </Space>
            )
          },
          {
            key: "payroll",
            label: "Pay Slip / 薪资单",
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
                {payslipMobileCards}
                <Table className="desktopDataTable" rowKey="id" columns={payslipTableColumns} dataSource={payslips} pagination={tablePagination(8)} scroll={{ x: "max-content" }} />
              </Space>
            )
          }
        ]}
      />
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
  return staffUsers.find((staff) => staff.id === id)?.displayName || staffUsers.find((staff) => staff.id === id)?.email || id;
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

function money(value?: number) {
  return `RM ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tablePagination(pageSize = 8): TablePaginationConfig {
  return {
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: ["5", "8", "10", "20", "50"],
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} / 共 ${total} 条`
  };
}

function textFilters(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ text: value, value }));
}

function withColumnFilters<T extends object>(
  columns: ColumnsType<T>,
  filters: Array<{ dataIndex: string; filters: Array<{ text: string; value: string }>; filterSearch?: boolean; onFilter: (value: string, row: T) => boolean }>
): ColumnsType<T> {
  return columns.map((column) => {
    const rawDataIndex = "dataIndex" in column ? column.dataIndex : "";
    const dataIndex = Array.isArray(rawDataIndex) ? rawDataIndex.join(".") : String(rawDataIndex ?? "");
    const filter = filters.find((item) => item.dataIndex === dataIndex);
    return filter ? { ...column, filters: filter.filters, filterSearch: filter.filterSearch, onFilter: (value, row) => filter.onFilter(String(value), row) } : column;
  });
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

function leaveAdjustmentTypeLabel(type: HrLeaveAdjustment["type"]) {
  return type === "AnnualLeave" ? "AL / Annual Leave / 年假" : "MC / Medical Leave / 病假";
}

function leaveAdjustmentDirectionLabel(direction: HrLeaveAdjustment["direction"]) {
  return direction === "Increase" ? "Increase / 增加" : "Decrease / 减少";
}

function leaveStatusColor(status: HrLeaveStatus) {
  return status === "Approved" ? "green" : status === "Rejected" ? "red" : status === "Cancelled" ? "default" : "orange";
}
