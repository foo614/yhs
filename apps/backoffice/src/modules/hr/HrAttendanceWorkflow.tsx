import { useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { createHrAttendanceCorrection, decideHrAttendanceCorrection, getHrAttendanceCorrections, getHrWorkSchedules, humanizeApiError, saveHrWorkSchedule } from "../../api";
import type { CurrentUser, HrAttendanceCorrection, HrAttendanceRecord, HrWorkSchedule, StaffUser } from "../../api";

export const malaysiaDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const malaysiaInput = (value?: string) => value ? dayjs(new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 19)) : undefined;
export const malaysiaUtc = (value: dayjs.Dayjs) => new Date(`${value.format("YYYY-MM-DDTHH:mm:ss")}+08:00`).toISOString();
export const malaysiaTime = (value?: string) => value ? new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";

type Props = { currentUser: CurrentUser | null; staff: StaffUser[]; attendance: HrAttendanceRecord[]; onChanged?: () => Promise<void> };
export function HrAttendanceWorkflow({ currentUser, staff, attendance, onChanged }: Props) {
  const isHr = Boolean(currentUser?.roles.some(role => role === "HrSalary" || role === "BossAdmin"));
  const [corrections, setCorrections] = useState<HrAttendanceCorrection[]>([]);
  const [schedules, setSchedules] = useState<HrWorkSchedule[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<{ item: HrAttendanceCorrection; approve: boolean }>();
  const [form] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [decisionForm] = Form.useForm();
  const selectedStaff = Form.useWatch("staffUserId", form) as string | undefined;
  const selectedRecord = Form.useWatch("attendanceRecordId", form) as string | undefined;
  const staffOptions = (isHr ? staff : [{ id: currentUser?.id ?? "", displayName: currentUser?.name ?? "Me" }]).map(item => ({ value: item.id, label: item.displayName }));
  const name = (id: string) => staffOptions.find(item => item.value === id)?.label ?? (id === currentUser?.id ? currentUser.name : "Staff");
  const reload = async () => { const [nextCorrections, nextSchedules] = await Promise.all([getHrAttendanceCorrections(), getHrWorkSchedules()]); setCorrections(nextCorrections); setSchedules(nextSchedules); };
  useEffect(() => { let active = true; void Promise.all([getHrAttendanceCorrections(), getHrWorkSchedules()]).then(([items, shifts]) => { if (active) { setCorrections(items); setSchedules(shifts); } }).catch(e => { if (active) setError(humanizeApiError(e)); }); return () => { active = false; }; }, [currentUser?.id]);
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); await reload(); await onChanged?.(); } catch (e) { setError(humanizeApiError(e)); } finally { setBusy(false); } };
  return <Space direction="vertical" className="fullWidth" size={16}>
    {error && <Alert type="error" showIcon message={error} />}
    <Card title="Attendance corrections / 打卡更正" extra={<Button onClick={() => { form.resetFields(); form.setFieldsValue({ staffUserId: currentUser?.id }); setEditing(true); }}>Request correction / 申请更正</Button>}>
      <Typography.Paragraph>Forgot to clock out? Enter the actual times and a reason. HR must approve before hours change. All times are Malaysia time.</Typography.Paragraph>
      <Space direction="vertical" className="fullWidth">
        {corrections.length === 0 && <Typography.Text type="secondary">No correction requests / 暂无更正申请</Typography.Text>}
        {corrections.map(item => <Card key={item.id} size="small">
          <Space wrap><strong>{name(item.staffUserId)} · {item.attendanceDate}</strong><Tag>{item.status}</Tag></Space>
          <p>Original: {malaysiaTime(item.originalCheckInAt)} → {malaysiaTime(item.originalCheckOutAt)}</p>
          <p>Requested: {malaysiaTime(item.checkInAt)} → {malaysiaTime(item.checkOutAt)}</p>
          <p>{item.reason}</p>{item.decisionNotes && <p>HR: {item.decisionNotes}</p>}
          {isHr && item.status === "Pending" && currentUser?.id !== item.staffUserId && currentUser?.id !== item.requestedBy && <Space wrap>
            <Button type="primary" disabled={busy} onClick={() => { decisionForm.resetFields(); setDecision({ item, approve: true }); }}>Review & Approve / 核对并批准</Button>
            <Button danger disabled={busy} onClick={() => { decisionForm.resetFields(); setDecision({ item, approve: false }); }}>Reject / 拒绝</Button>
          </Space>}
        </Card>)}
      </Space>
    </Card>
    <Card title="Work schedule / 工作时间表">
      <Typography.Paragraph>HR sets each shift before it starts. An early check-out asks for confirmation and a reason; no automatic salary penalty is applied.</Typography.Paragraph>
      {isHr && <Form form={scheduleForm} layout="vertical" className="formGrid" onFinish={values => void run(async () => { await saveHrWorkSchedule({ staffUserId: values.staffUserId, attendanceDate: values.startAt.format("YYYY-MM-DD"), startAt: malaysiaUtc(values.startAt), endAt: malaysiaUtc(values.endAt) }); scheduleForm.resetFields(); })}>
        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={staffOptions} /></Form.Item>
        <Form.Item name="startAt" label="Shift starts (Malaysia) / 上班时间" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" className="fullWidth" /></Form.Item>
        <Form.Item name="endAt" label="Shift ends (Malaysia) / 放工时间" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" className="fullWidth" /></Form.Item>
        <Form.Item className="formActions"><Button htmlType="submit" loading={busy}>Save schedule / 保存时间表</Button></Form.Item>
      </Form>}
      <Space direction="vertical" className="fullWidth">{schedules.length === 0 && <Typography.Text type="secondary">No schedules configured / 尚未设置时间表</Typography.Text>}{schedules.map(item => <div key={item.id}><strong>{name(item.staffUserId)}</strong> · {malaysiaTime(item.startAt)} → {malaysiaTime(item.endAt)} {isHr && new Date(item.startAt) > new Date() && <Button size="small" onClick={() => scheduleForm.setFieldsValue({ staffUserId: item.staffUserId, startAt: malaysiaInput(item.startAt), endAt: malaysiaInput(item.endAt) })}>Edit / 编辑</Button>}</div>)}</Space>
    </Card>
    <Modal title="Request attendance correction / 申请打卡更正" open={editing} confirmLoading={busy} onCancel={() => setEditing(false)} onOk={() => form.submit()} okText="Submit for HR approval / 提交审批">
      {error && <Alert type="error" message={error} />}
      <Form form={form} layout="vertical" onFinish={values => void run(async () => {
        await createHrAttendanceCorrection({ staffUserId: values.staffUserId, attendanceRecordId: values.attendanceRecordId || undefined, attendanceDate: values.checkInAt.format("YYYY-MM-DD"), checkInAt: malaysiaUtc(values.checkInAt), checkOutAt: malaysiaUtc(values.checkOutAt), reason: values.reason }); setEditing(false);
      })}>
        <Form.Item name="staffUserId" label="Staff / 员工" rules={[{ required: true }]}><Select disabled={!isHr} options={staffOptions} onChange={() => form.resetFields(["attendanceRecordId", "checkInAt", "checkOutAt"])} /></Form.Item>
        <Form.Item name="attendanceRecordId" label="Existing session (leave empty for a missing session) / 原打卡"><Select allowClear showSearch optionFilterProp="label" options={attendance.filter(item => item.staffUserId === selectedStaff).map(item => ({ value: item.id, label: `${item.attendanceDate} · ${malaysiaTime(item.checkInAt)}` }))} onChange={id => { const item = attendance.find(record => record.id === id); form.setFieldsValue({ checkInAt: malaysiaInput(item?.checkInAt), checkOutAt: malaysiaInput(item?.checkOutAt) }); }} /></Form.Item>
        {selectedRecord && <Typography.Paragraph type="secondary">Keep the original check-in date. Enter the actual missing or corrected times.</Typography.Paragraph>}
        <Form.Item name="checkInAt" label="Actual check-in (Malaysia) / 实际上班" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" className="fullWidth" /></Form.Item>
        <Form.Item name="checkOutAt" label="Actual check-out (Malaysia) / 实际放工" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" className="fullWidth" /></Form.Item>
        <Form.Item name="reason" label="Reason / 原因" rules={[{ required: true, whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={decision?.approve ? "Approve corrected times? / 批准更正时间？" : "Reject correction / 拒绝更正"} open={Boolean(decision)} confirmLoading={busy} onCancel={() => setDecision(undefined)} onOk={() => decisionForm.submit()}>
      {error && <Alert type="error" message={error} />}
      <Typography.Paragraph>{decision && `${malaysiaTime(decision.item.checkInAt)} → ${malaysiaTime(decision.item.checkOutAt)}`}</Typography.Paragraph>
      <Form form={decisionForm} onFinish={values => { if (decision) void run(async () => { await decideHrAttendanceCorrection(decision.item.id, decision.approve, values.notes); setDecision(undefined); }); }}><Form.Item name="notes" label="Review note / 审批说明" rules={[{ required: decision?.approve === false, whitespace: true }]}><Input.TextArea maxLength={1000} /></Form.Item></Form>
    </Modal>
  </Space>;
}
