import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Space, Tag, Typography } from "antd";
import { decideHrPayroll, hrPayslipPdfUrl, humanizeApiError, saveHrStatutory } from "../../api";
import type { CurrentUser, HrPayPeriod, HrPayrollAction, HrPayslip, HrStatutoryInput } from "../../api";
import { formatMoneyInput, parseMoneyInput } from "../../money";
import { DocumentPreviewButton } from "../shared/DocumentPreviewButton";
import { malaysiaDate } from "./HrAttendanceWorkflow";

export const statutoryFields = [
  ["employeeEpf", "Employee EPF"], ["employeeSocso", "Employee SOCSO"], ["employeeEis", "Employee EIS"], ["pcb", "PCB"],
  ["employerEpf", "Employer EPF"], ["employerSocso", "Employer SOCSO"], ["employerEis", "Employer EIS"]
] as const;
const amount = (value?: number | null) => value == null ? "Not entered / 未填写" : `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hasCompleteStatutory = (slip: HrPayslip) => statutoryFields.every(([key]) => slip[key] != null);
export const payrollAmountLabel = (slip: HrPayslip) => hasCompleteStatutory(slip) ? "Net pay / 实发薪资" : "Provisional pay / 暂算薪资";
export function payrollActions(slip: HrPayslip, user: CurrentUser | null): HrPayrollAction[] {
  if (!user) return [];
  const hr = user.roles.some(role => role === "HrSalary" || role === "BossAdmin");
  if (slip.status === "Draft" && hr) return ["Submit"];
  if (slip.status === "PendingFinance" && user.roles.includes("Finance")) return user.id !== slip.preparedBy && user.id !== slip.submittedBy && user.id !== slip.staffUserId ? ["FinanceApprove", "Return"] : ["Return"];
  if (slip.status === "PendingBoss" && user.roles.includes("BossAdmin")) return user.id !== slip.preparedBy && user.id !== slip.submittedBy && user.id !== slip.financeApprovedBy && user.id !== slip.staffUserId ? ["BossApprove", "Return"] : ["Return"];
  return [];
}
const actionLabels: Record<HrPayrollAction, string> = { Submit: "Submit to Finance / 提交财务", FinanceApprove: "Finance approve / 财务批准", BossApprove: "Boss approve & publish / 老板批准并发布", Return: "Return to HR / 退回人事" };
const statusLabels: Record<HrPayslip["status"], string> = { Draft: "Draft / 草稿", Generated: "Legacy / 旧薪资单", PendingFinance: "Finance review / 待财务审批", PendingBoss: "Boss review / 待老板审批", Published: "Published / 已发布" };
function HrEarningsSummary({ slip }: { slip: HrPayslip }) {
  return <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }} items={[
    { key: "type", label: "Employment / 雇用类型", children: slip.employmentType === "Hourly" ? "Hourly / 时薪" : "Monthly / 月薪" },
    { key: "days", label: "Working days / 工作天", children: slip.workingDays },
    { key: "rate", label: slip.employmentType === "Hourly" ? "Hourly rate / 时薪" : "Daily salary / 日薪", children: amount(slip.employmentType === "Hourly" ? slip.hourlyRate : slip.dailySalary) },
    { key: "base", label: slip.employmentType === "Hourly" ? `Attendance (${slip.workedHours} hours)` : "Base salary", children: amount(slip.employmentType === "Hourly" ? slip.attendancePay : slip.baseSalary) },
    { key: "ot", label: "Overtime", children: amount(slip.overtimePay) },
    { key: "allowance", label: "Allowances", children: amount(slip.allowances) },
    { key: "unpaidDays", label: "Unpaid leave days / 无薪假天数", children: slip.unpaidLeaveDays },
    { key: "unpaid", label: "Unpaid leave deduction", children: amount(slip.unpaidLeaveDeduction) },
    { key: "manual", label: "Other deductions", children: amount(slip.manualDeductions) },
    { key: "gross", label: "Gross pay", children: amount(slip.grossPay) }
  ]} />;
}
export function HrStatutorySummary({ slip }: { slip: HrPayslip }) {
  return <Descriptions size="small" layout="vertical" column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }} items={statutoryFields.map(([key, label]) => ({ key, label, children: amount(slip[key]) }))} />;
}
export function HrPayrollReview({ currentUser, slip, period, onClose, onChanged, onLoadPayslip, onDownloadPayslip }: {
  currentUser: CurrentUser | null;
  slip?: HrPayslip;
  period?: HrPayPeriod;
  onClose: () => void;
  onChanged?: () => Promise<void>;
  onLoadPayslip?: (slip: HrPayslip) => Promise<Blob>;
  onDownloadPayslip?: (slip: HrPayslip) => Promise<void>;
}) {
  const isHr = Boolean(currentUser?.roles.some(role => role === "HrSalary" || role === "BossAdmin"));
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<HrPayrollAction>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  useEffect(() => { setEditing(false); setReview(undefined); setError(""); }, [slip?.id, slip?.version]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); setEditing(false); setReview(undefined); await onChanged?.(); }
    catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  };
  const complete = slip ? hasCompleteStatutory(slip) : false;
  const submitBlock = slip?.status === "Draft" && (!complete || !slip.statutoryReference?.trim())
    ? "Enter all statutory amounts and the calculation reference before submitting. / 提交前请填写所有法定金额及计算依据。"
    : slip?.status === "Draft" && (!period || period.endDate >= malaysiaDate(new Date()))
      ? "Submit after the pay period ends. / 薪资月份结束后方可提交。" : undefined;
  const actions = slip ? payrollActions(slip, currentUser) : [];
  const context = `${slip?.staffName || "Employee / 员工"} · ${period?.name || "Pay period / 薪资月份"}`;
  return <>
    <Drawer title={`Payslip details / 薪资单详情 · ${context}`} open={Boolean(slip)} onClose={onClose} closable={!busy} maskClosable={!busy} keyboard={!busy} width="min(720px, 100vw)">
      {slip && <Space direction="vertical" size={16} className="fullWidth">
        <Space wrap><Tag>{statusLabels[slip.status]}</Tag><Typography.Text strong>{payrollAmountLabel(slip)}: {amount(slip.netPay)}</Typography.Text></Space>
        {!complete && <Alert type="warning" showIcon message="Not final net pay / 非最终实发薪资" description="Statutory amounts are incomplete. Employer contributions must be recorded separately and do not reduce employee net pay. / 法定金额尚未填齐，雇主供款须另行记录，不从员工薪资扣除。" />}
        {slip.status !== "Generated" && slip.status !== "Published" && <Typography.Text type="secondary">Draft or under review — not approved for payment. / 草稿或审批中，尚未批准支付。</Typography.Text>}
        {period && <Typography.Text type="secondary">{period.startDate} – {period.endDate}</Typography.Text>}
        <HrEarningsSummary slip={slip} />
        <Typography.Text strong>Statutory amounts / 法定金额</Typography.Text>
        <HrStatutorySummary slip={slip} />
        <Typography.Paragraph type="secondary">{slip.statutoryReference || "No calculation reference recorded / 尚未记录计算依据"}</Typography.Paragraph>
        {slip.reviewNotes && <Alert type="warning" message={slip.reviewNotes} />}
        {submitBlock && isHr && <Alert type="info" message={submitBlock} />}
        {error && <Alert type="error" showIcon message={error} action={onChanged ? <Button disabled={busy} onClick={() => void onChanged().catch(e => setError(humanizeApiError(e)))}>Refresh / 刷新</Button> : undefined} />}
        <Space wrap className="tableActionGroup">
          {isHr && slip.status === "Draft" && <Button style={{ minHeight: 44 }} disabled={busy} onClick={() => { setError(""); form.resetFields(); form.setFieldsValue({ ...slip, reference: slip.statutoryReference }); setEditing(true); }}>Enter statutory amounts / 填写法定扣款</Button>}
          {actions.map(action => <Button key={action} style={{ minHeight: 44 }} disabled={busy || action === "Submit" && Boolean(submitBlock)} type={action === "Return" ? "default" : "primary"} onClick={() => { setError(""); reviewForm.resetFields(); setReview(action); }}>{actionLabels[action]}</Button>)}
        </Space>
        {slip.status === "PendingFinance" && !actions.includes("FinanceApprove") && <Typography.Text type="secondary">Waiting for a separate Finance reviewer. / 等待独立财务人员审批。</Typography.Text>}
        {slip.status === "PendingBoss" && !actions.includes("BossApprove") && <Typography.Text type="secondary">Waiting for a separate Boss/Admin reviewer. / 等待独立老板或管理员审批。</Typography.Text>}
        {slip.status === "Published" && <Typography.Text type="secondary">Published payslips are locked. / 已发布薪资单已锁定。</Typography.Text>}
        {onLoadPayslip ? <DocumentPreviewButton fileName={`payslip-${slip.id}.pdf`} mimeType="application/pdf" downloadUrl={hrPayslipPdfUrl(slip.id)} loadContent={() => onLoadPayslip(slip)} previewLabel="Preview PDF / 预览" downloadLabel="Download PDF / 下载" /> : onDownloadPayslip && <Button onClick={() => void onDownloadPayslip(slip)}>Download PDF / 下载</Button>}
      </Space>}
    </Drawer>
    <Modal title="Monthly statutory amounts / 每月法定扣款" open={editing && Boolean(slip)} confirmLoading={busy} width={720} closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }} onCancel={() => setEditing(false)} onOk={() => form.submit()} okText="Save for review / 保存待核对">
      {error && <Alert type="error" message={error} />}
      <Typography.Paragraph strong>{context}</Typography.Paragraph>
      <Typography.Paragraph>Use the official employee-specific assessment for this month. Enter zero explicitly when not applicable and explain the exemption. Do not include these amounts again in manual deductions. / 按此员工本月的正式计算填写；不适用时请填写零并说明，勿重复计入手动扣款。</Typography.Paragraph>
      <Form form={form} layout="vertical" className="formGrid" onFinish={values => { if (slip && !busy) void run(() => saveHrStatutory(slip.id, { ...values, version: slip.version ?? 0 } as HrStatutoryInput)); }}>
        {statutoryFields.map(([key, label]) => <Form.Item key={key} name={key} label={`${label} (MYR)`} rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>)}
        <Form.Item name="reference" label="Calculation source, month and exemption reasons / 计算依据" rules={[{ required: true, whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={review ? actionLabels[review] : "Review payroll"} open={Boolean(review && slip)} confirmLoading={busy} width={720} closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }} onCancel={() => setReview(undefined)} onOk={() => reviewForm.submit()} okText="Confirm / 确认">
      {error && <Alert type="error" message={error} />}
      {slip && <><Typography.Paragraph strong>{context} · {payrollAmountLabel(slip)}: {amount(slip.netPay)}</Typography.Paragraph><HrEarningsSummary slip={slip} /><HrStatutorySummary slip={slip} /><Typography.Paragraph>{slip.statutoryReference}</Typography.Paragraph></>}
      {review === "BossApprove" && <Alert type="warning" message="Final approval publishes this payslip to the employee and locks its amounts. / 最终批准后，薪资单将发布给员工且金额锁定。" />}
      <Form form={reviewForm} layout="vertical" onFinish={values => { if (review && slip && !busy) void run(() => decideHrPayroll(slip.id, slip.version ?? 0, review, values.notes)); }}><Form.Item name="notes" label="Review note / 审批说明" rules={[{ required: review === "Return", whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item></Form>
    </Modal>
  </>;
}
