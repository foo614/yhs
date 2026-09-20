import { useState } from "react";
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Tag, Typography } from "antd";
import { decideHrPayroll, humanizeApiError, saveHrStatutory } from "../../api";
import type { CurrentUser, HrPayPeriod, HrPayrollAction, HrPayslip, HrStatutoryInput } from "../../api";
import { formatMoneyInput, parseMoneyInput } from "../../money";

export const statutoryFields = [
  ["employeeEpf", "Employee EPF"], ["employeeSocso", "Employee SOCSO"], ["employeeEis", "Employee EIS"], ["pcb", "PCB"],
  ["employerEpf", "Employer EPF"], ["employerSocso", "Employer SOCSO"], ["employerEis", "Employer EIS"]
] as const;
const amount = (value?: number | null) => value == null ? "Not entered / 未填写" : `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function payrollActions(slip: HrPayslip, user: CurrentUser | null): HrPayrollAction[] {
  if (!user) return [];
  const hr = user.roles.some(role => role === "HrSalary" || role === "BossAdmin");
  if (slip.status === "Draft" && hr) return ["Submit"];
  if (slip.status === "PendingFinance" && user.roles.includes("Finance")) return user.id !== slip.preparedBy && user.id !== slip.submittedBy && user.id !== slip.staffUserId ? ["FinanceApprove", "Return"] : ["Return"];
  if (slip.status === "PendingBoss" && user.roles.includes("BossAdmin")) return user.id !== slip.preparedBy && user.id !== slip.submittedBy && user.id !== slip.financeApprovedBy && user.id !== slip.staffUserId ? ["BossApprove", "Return"] : ["Return"];
  return [];
}
const actionLabels: Record<HrPayrollAction, string> = { Submit: "Submit to Finance / 提交财务", FinanceApprove: "Finance approve / 财务批准", BossApprove: "Boss approve & publish / 老板批准并发布", Return: "Return to HR / 退回人事" };
function HrEarningsSummary({ slip }: { slip: HrPayslip }) {
  return <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
    { key: "base", label: slip.employmentType === "Hourly" ? `Attendance (${slip.workedHours} hours)` : "Base salary", children: amount(slip.employmentType === "Hourly" ? slip.attendancePay : slip.baseSalary) },
    { key: "ot", label: "Overtime", children: amount(slip.overtimePay) },
    { key: "allowance", label: "Allowances", children: amount(slip.allowances) },
    { key: "unpaid", label: "Unpaid leave deduction", children: amount(slip.unpaidLeaveDeduction) },
    { key: "manual", label: "Other deductions", children: amount(slip.manualDeductions) },
    { key: "gross", label: "Gross pay", children: amount(slip.grossPay) }
  ]} />;
}
export function HrStatutorySummary({ slip }: { slip: HrPayslip }) {
  return <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} items={statutoryFields.map(([key, label]) => ({ key, label, children: amount(slip[key]) }))} />;
}
export function HrPayrollReview({ currentUser, payslips, payPeriods, onChanged }: { currentUser: CurrentUser | null; payslips: HrPayslip[]; payPeriods: HrPayPeriod[]; onChanged?: () => Promise<void> }) {
  const isHr = Boolean(currentUser?.roles.some(role => role === "HrSalary" || role === "BossAdmin"));
  const [editing, setEditing] = useState<HrPayslip>();
  const [review, setReview] = useState<{ slip: HrPayslip; action: HrPayrollAction }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); await onChanged?.(); } catch (e) { setError(humanizeApiError(e)); } finally { setBusy(false); } };
  return <Space direction="vertical" size={12} className="fullWidth">
    <Alert type="info" showIcon message="HR prepares → Finance approves → Boss approves & publishes" description="Enter statutory amounts from the applicable official calculation for this employee and month. Automatic statutory calculation and filing are not provided. Employer contributions do not reduce employee net pay. Submit after the pay period ends. Published and legacy payslips are locked." />
    {error && <Alert type="error" showIcon message={error} />}
    {payslips.filter(slip => slip.status !== "Generated").map(slip => <Card key={slip.id} size="small" title={<Space wrap><span>{slip.staffName ?? "Employee"} · {payPeriods.find(period => period.id === slip.payPeriodId)?.name}</span><Tag>{slip.status}</Tag></Space>}>
      <Space wrap><strong>Gross: {amount(slip.grossPay)}</strong><strong>Net: {statutoryFields.some(([key]) => slip[key] == null) ? "Awaiting statutory amounts" : amount(slip.netPay)}</strong></Space>
      <HrStatutorySummary slip={slip} />
      <Typography.Paragraph type="secondary">{slip.statutoryReference || "Calculation source and exemption reasons are required before submission."}</Typography.Paragraph>
      {slip.reviewNotes && <Alert type="warning" message={slip.reviewNotes} />}
      <Space wrap className="tableActionGroup">
        {isHr && slip.status === "Draft" && <Button disabled={busy} onClick={() => { form.resetFields(); form.setFieldsValue({ ...slip, reference: slip.statutoryReference }); setEditing(slip); }}>Enter statutory amounts / 填写法定扣款</Button>}
        {payrollActions(slip, currentUser).map(action => <Button key={action} disabled={busy} type={action === "Return" ? "default" : "primary"} onClick={() => { reviewForm.resetFields(); setReview({ slip, action }); }}>{actionLabels[action]}</Button>)}
      </Space>
    </Card>)}
    <Modal title="Monthly statutory amounts / 每月法定扣款" open={Boolean(editing)} confirmLoading={busy} width={720} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText="Save for review / 保存待核对">
      {error && <Alert type="error" message={error} />}
      <Typography.Paragraph>Use the official employee-specific assessment for this month. Enter zero explicitly when not applicable and explain the exemption. Do not include these amounts again in manual deductions.</Typography.Paragraph>
      <Form form={form} layout="vertical" className="formGrid" onFinish={values => { if (editing) void run(async () => { await saveHrStatutory(editing.id, { ...values, version: editing.version ?? 0 } as HrStatutoryInput); setEditing(undefined); }); }}>
        {statutoryFields.map(([key, label]) => <Form.Item key={key} name={key} label={`${label} (MYR)`} rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} formatter={formatMoneyInput} parser={parseMoneyInput} /></Form.Item>)}
        <Form.Item name="reference" label="Calculation source, month and exemption reasons / 计算依据" rules={[{ required: true, whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={review ? actionLabels[review.action] : "Review payroll"} open={Boolean(review)} confirmLoading={busy} width={720} onCancel={() => setReview(undefined)} onOk={() => reviewForm.submit()} okText="Confirm / 确认">
      {error && <Alert type="error" message={error} />}
      {review && <><Typography.Paragraph>{review.slip.staffName} · {payPeriods.find(period => period.id === review.slip.payPeriodId)?.name} · Net {amount(review.slip.netPay)}</Typography.Paragraph><HrEarningsSummary slip={review.slip} /><HrStatutorySummary slip={review.slip} /><Typography.Paragraph>{review.slip.statutoryReference}</Typography.Paragraph></>}
      {review?.action === "BossApprove" && <Alert type="warning" message="Final approval publishes this payslip to the employee and locks its amounts." />}
      <Form form={reviewForm} layout="vertical" onFinish={values => { if (review) void run(async () => { await decideHrPayroll(review.slip.id, review.slip.version ?? 0, review.action, values.notes); setReview(undefined); }); }}><Form.Item name="notes" label="Review note / 审批说明" rules={[{ required: review?.action === "Return", whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item></Form>
    </Modal>
  </Space>;
}
