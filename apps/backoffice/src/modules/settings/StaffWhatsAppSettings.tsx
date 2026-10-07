import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Form, Grid, InputNumber, Modal, Select, Space, Switch, Tabs, Tag, TimePicker, Typography, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { getStaffWhatsAppDiagnostics, getStaffWhatsAppHistory, getStaffWhatsAppPolicies, humanizeApiError, updateStaffWhatsAppPolicy,
  type StaffWhatsAppDiagnostics,
  type StaffUser, type StaffWhatsAppHistoryFilters, type StaffWhatsAppHistoryItem, type StaffWhatsAppHistoryPage,
  type StaffWhatsAppPolicy, type StaffWhatsAppPolicyCategory, type StaffWhatsAppPolicyInput } from "../../api";
import { OperationsProTable } from "../shared/OperationsProTable";

const descriptions: Record<StaffWhatsAppPolicyCategory, { title: string; detail: string }> = {
  OutstandingDigest: { title: "Outstanding digest", detail: "Boss: due finance items and deliveries. Sales: assigned deliveries only. Default 09:00 Malaysia time, three calendar days ahead." },
  AttendanceSummary: { title: "Attendance summary", detail: "Daily staff availability summary. Default 10:00 Malaysia time." },
  LeaveApproval: { title: "Leave approval", detail: "Daily pending leave approval summary. Default 09:00 Malaysia time." },
  OcrUsage: { title: "OCR usage", detail: "Warn when OCR use reaches the selected share of its limit. Default 90%." },
  VehicleEvent: { title: "Vehicle events", detail: "Notify assigned staff about relevant vehicle workflow changes." },
  DeliveryEvent: { title: "Delivery events", detail: "Notify assigned staff about relevant handover changes." },
  FinanceEvent: { title: "Finance events", detail: "Notify authorized staff about relevant finance workflow changes." }
};
const categoryOrder = Object.keys(descriptions) as StaffWhatsAppPolicyCategory[];
const historyCategoryTitle = (category: StaffWhatsAppHistoryItem["category"]) =>
  category === "StaffInvitation" ? "Staff invitations" : descriptions[category].title;
const historyStates = ["Queued", "Sending", "Accepted", "Sent", "Delivered", "Read", "RetryScheduled", "DeadLetter", "Failed", "Suppressed", "UnknownOutcome"];
const pageSize = 25;

function stateLabel(state: string) {
  return state === "Accepted" ? "Accepted by provider" : state === "Sent" ? "Sent callback" :
    state === "UnknownOutcome" ? "Outcome unknown" : state === "DeadLetter" ? "Failed — review needed" :
    state === "RetryScheduled" ? "Retry scheduled" : state;
}
function stateColor(state: string) {
  return state === "Read" || state === "Delivered" ? "green" : state === "Failed" || state === "DeadLetter" ? "red" :
    state === "Suppressed" || state === "UnknownOutcome" ? "orange" : "blue";
}
function localTime(minute: number) {
  return dayjs().startOf("day").add(minute, "minute").format("HH:mm");
}
function timestamp(value: number | null) {
  return value == null ? "Not recorded" : new Date(value * 1000).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }) + " MYT";
}
function readiness(policy: StaffWhatsAppPolicy) {
  const missing: string[] = [];
  if (!policy.senderReady) missing.push("staff sender is unavailable; check its configuration");
  if (!policy.templateReady) missing.push("approved template is missing; arrange approval for this category");
  if (!policy.categoryReady) missing.push("reminder integration is pending for this category");
  if (!policy.enabled) return missing.length
    ? `This category is off. Before enabling, resolve: ${missing.join("; ")}.`
    : "This category is off. Enable it only after reviewing recipients and timing.";
  if (missing.length) return `Sending is blocked: ${missing.join("; ")}. Staff also need an active My WhatsApp connection.`;
  return "Sender and template are ready. Delivery also requires an eligible staff member with an active My WhatsApp connection and current role access.";
}

type PolicyFormValues = { enabled: boolean; time?: Dayjs; leadDays: number; thresholdPercent: number };

export function StaffWhatsAppSettings({ staffUsers }: { staffUsers: StaffUser[] }) {
  const screens = Grid.useBreakpoint();
  const [modal, contextHolder] = Modal.useModal();
  const [form] = Form.useForm<PolicyFormValues>();
  const [policies, setPolicies] = useState<StaffWhatsAppPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState("");
  const [diagnostics, setDiagnostics] = useState<StaffWhatsAppDiagnostics>();
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [editing, setEditing] = useState<StaffWhatsAppPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<StaffWhatsAppHistoryFilters>({ page: 1 });
  const [history, setHistory] = useState<StaffWhatsAppHistoryPage>();
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [selected, setSelected] = useState<StaffWhatsAppHistoryItem | null>(null);
  const [activeTab, setActiveTab] = useState("history");
  const historyRequest = useRef(0);

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try { setPolicies(await getStaffWhatsAppPolicies()); setPoliciesError(""); }
    catch (error) { setPoliciesError(humanizeApiError(error, "Could not load staff WhatsApp settings.")); }
    finally { setPoliciesLoading(false); }
  }, []);
  const loadDiagnostics = useCallback(async () => {
    try { setDiagnostics(await getStaffWhatsAppDiagnostics()); setDiagnosticsError(""); }
    catch (error) { setDiagnostics(undefined); setDiagnosticsError(humanizeApiError(error, "Could not check reminder data.")); }
  }, []);
  useEffect(() => { void loadDiagnostics(); }, [loadDiagnostics]);
  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const result = await getStaffWhatsAppHistory(filters);
      if (requestId === historyRequest.current) { setHistory(result); setHistoryError(""); }
    } catch (error) {
      if (requestId === historyRequest.current) {
        setHistory(undefined);
        setHistoryError(humanizeApiError(error, "Could not load staff message history."));
      }
    } finally { if (requestId === historyRequest.current) setHistoryLoading(false); }
  }, [filters]);
  useEffect(() => { void loadPolicies(); }, [loadPolicies]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => () => { historyRequest.current++; }, []);
  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({
      enabled: editing.enabled,
      time: dayjs().startOf("day").add(editing.localMinuteOfDay, "minute"),
      leadDays: editing.leadDays,
      thresholdPercent: editing.thresholdPercent
    });
  }, [editing, form]);

  const startEdit = (policy: StaffWhatsAppPolicy) => {
    setEditing(policy);
  };
  const reviewSave = (values: PolicyFormValues) => {
    if (!editing) return;
    const category = editing.category;
    const input: StaffWhatsAppPolicyInput = {
      enabled: values.enabled,
      localMinuteOfDay: category === "OutstandingDigest" || category === "AttendanceSummary" || category === "LeaveApproval"
        ? (values.time?.hour() ?? 0) * 60 + (values.time?.minute() ?? 0) : editing.localMinuteOfDay,
      leadDays: category === "OutstandingDigest" ? values.leadDays : editing.leadDays,
      thresholdPercent: category === "OcrUsage" ? values.thresholdPercent : editing.thresholdPercent
    };
    modal.confirm({
      title: `Save ${descriptions[category].title} settings?`,
      content: <Space direction="vertical">
        <span>{input.enabled ? "Enable" : "Disable"} this staff message category.</span>
        {(category === "OutstandingDigest" || category === "AttendanceSummary" || category === "LeaveApproval") && <span>Scheduled for {localTime(input.localMinuteOfDay)} Malaysia time.</span>}
        {category === "OutstandingDigest" && <span>Lead time: {input.leadDays} days.</span>}
        {category === "OcrUsage" && <span>Threshold: {input.thresholdPercent}%.</span>}
        {input.enabled && (!editing.senderReady || !editing.templateReady) && <span>Sending will remain unavailable until the readiness issues are resolved.</span>}
      </Space>,
      okText: "Confirm and save",
      onOk: async () => {
        setSaving(true);
        try {
          await updateStaffWhatsAppPolicy(category, input);
          await loadPolicies();
          setEditing(null);
          message.success("Staff WhatsApp settings saved.");
        } catch (error) {
          message.error(humanizeApiError(error, "Could not save staff WhatsApp settings."));
          throw error;
        } finally { setSaving(false); }
      }
    });
  };
  const updateFilters = (patch: Partial<StaffWhatsAppHistoryFilters>) =>
    setFilters(current => ({ ...current, ...patch, page: 1 }));
  const policyRows = categoryOrder.map(category => policies.find(item => item.category === category)).filter((item): item is StaffWhatsAppPolicy => !!item);
  const staffOptions = staffUsers.map(user => ({ value: user.id, label: `${user.displayName} / ${user.email}` }));
  const historyRows = history?.items ?? [];

  return <Space direction="vertical" size="large" className="fullWidth staffWhatsAppSettings">
    {contextHolder}
    <div>
      <Typography.Title level={5}>Staff WhatsApp settings</Typography.Title>
      <Typography.Paragraph type="secondary">Review staff reminders and their actual delivery history. My WhatsApp remains the place for each employee to connect a number.</Typography.Paragraph>
      <Alert showIcon type="info" message="Sending has separate readiness gates"
        description="A category must be enabled and integrated, its sender and template must be ready, and the recipient must have a verified staff WhatsApp connection. These settings do not activate customer notifications." />
    </div>
    <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
      { key: "history", label: "Message history" },
      { key: "policies", label: "Reminder settings" }
    ]} />

    {activeTab === "policies" && <section aria-label="Message categories">
      <div className="staffWhatsAppSectionHead">
        <Typography.Title level={5}>Message categories</Typography.Title>
        <Button loading={policiesLoading} onClick={() => { void loadPolicies(); void loadDiagnostics(); }}>Refresh settings</Button>
      </div>
      {policiesError && <Alert type="error" showIcon message={policiesError} />}
      {diagnosticsError && <Alert type="warning" showIcon message={diagnosticsError} />}
      {diagnostics && <Alert showIcon type={diagnostics.missingRequiredDate + diagnostics.unassignedDelivery + diagnostics.missingCommissionDate + diagnostics.unroutableWorkflowEvents > 0 || diagnostics.connectedStaff < diagnostics.eligibleStaff ? "warning" : "info"}
        message="Recipient and data checks"
        description={<Space direction="vertical">
          <span>{diagnostics.connectedStaff} of {diagnostics.eligibleStaff} active staff with reminder roles have a verified, currently eligible connection. This does not guarantee delivery.</span>
          <span>Missing required dates: {diagnostics.missingRequiredDate}. Unpaid commissions needing a due date: {diagnostics.missingCommissionDate}. Deliveries without a Sales assignment: {diagnostics.unassignedDelivery}.</span>
          <span>Active workflow events with assignment issues: {diagnostics.unroutableWorkflowEvents}. Old receipt events are not forwarded to a different salesperson after reassignment.</span>
          <span>Set dates in the source record and assign Sales on the vehicle. Staff connect through My WhatsApp. Undated items are not given an invented deadline.</span>
        </Space>} />}
      {policiesLoading && !policyRows.length && <Typography.Text type="secondary">Loading staff message settings…</Typography.Text>}
      {!policiesLoading && !policiesError && !policyRows.length && <Alert type="info" showIcon message="No staff message categories are available." />}
      <div className="staffWhatsAppPolicyGrid">
        {policyRows.map(policy => <Card key={policy.category} size="small" title={descriptions[policy.category].title}
          extra={<Tag color={policy.enabled ? "green" : "default"}>{policy.enabled ? "Enabled" : "Off"}</Tag>}>
          <Space direction="vertical" className="fullWidth">
            <Typography.Text type="secondary">{descriptions[policy.category].detail}</Typography.Text>
            {(policy.category === "OutstandingDigest" || policy.category === "AttendanceSummary" || policy.category === "LeaveApproval") &&
              <Typography.Text>Time: {localTime(policy.localMinuteOfDay)} MYT</Typography.Text>}
            {policy.category === "OutstandingDigest" && <Typography.Text>Lead time: {policy.leadDays} days</Typography.Text>}
            {policy.category === "OcrUsage" && <Typography.Text>Threshold: {policy.thresholdPercent}%</Typography.Text>}
            <Alert showIcon type={!policy.enabled ? "info" : policy.senderReady && policy.templateReady && policy.categoryReady ? "info" : "warning"}
              message={!policy.enabled ? "Off" : policy.senderReady && policy.templateReady && policy.categoryReady ? "Configuration gates ready" : "Action needed"}
              description={readiness(policy)} />
            <div className="staffWhatsAppAction"><Button onClick={() => startEdit(policy)}>Edit settings</Button></div>
          </Space>
        </Card>)}
      </div>
    </section>}

    {activeTab === "history" && <section aria-label="Staff message history">
      <div className="staffWhatsAppSectionHead">
        <div><Typography.Title level={5}>Message history</Typography.Title>
          <Typography.Text type="secondary">Provider acceptance and delivery callbacks are shown as distinct states. History is read only; retry is unavailable.</Typography.Text></div>
        <Button loading={historyLoading} onClick={() => void loadHistory()}>Refresh history</Button>
      </div>
      <div className="staffWhatsAppFilters">
        <DatePicker.RangePicker aria-label="History date range"
          value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
          onChange={dates => updateFilters({
          from: dates?.[0]?.format("YYYY-MM-DD"), to: dates?.[1]?.format("YYYY-MM-DD")
        })} />
        <Select aria-label="Staff recipient" showSearch optionFilterProp="label" allowClear placeholder="All staff"
          options={staffOptions} value={filters.staffUserId} onChange={value => updateFilters({ staffUserId: value })} />
        <Select aria-label="Message category" allowClear placeholder="All categories"
          options={[...categoryOrder.map(category => ({ value: category, label: descriptions[category].title })),
            { value: "StaffInvitation", label: "Staff invitations" }]}
          value={filters.category} onChange={value => updateFilters({ category: value })} />
        <Select aria-label="Delivery status" allowClear placeholder="All statuses"
          options={historyStates.map(value => ({ value, label: stateLabel(value) }))}
          value={filters.status} onChange={value => updateFilters({ status: value })} />
      </div>
      {historyError && <Alert type="error" showIcon message={historyError} />}
      {screens.md ? <OperationsProTable<StaffWhatsAppHistoryItem> search={false} columnFilters={false}
        rowKey="id" loading={historyLoading} dataSource={historyRows} pagination={false} scroll={{ x: 880 }}
        columns={[
          { title: "Staff / recipient", render: (_, row) => <><div>{row.staffName || staffUsers.find(user => user.id === row.staffUserId)?.displayName || "Staff member"}</div><Typography.Text type="secondary">{row.maskedNumber || "Number unavailable"}</Typography.Text></> },
          { title: "Category", render: (_, row) => historyCategoryTitle(row.category) },
          { title: "State", render: (_, row) => <Tag color={stateColor(row.state)}>{stateLabel(row.state)}</Tag> },
          { title: "Scheduled", render: (_, row) => timestamp(row.scheduledAt) },
          { title: "Accepted", render: (_, row) => timestamp(row.acceptedAt) },
          { title: "Action / 操作", fixed: "right", render: (_, row) => <Space className="tableActionGroup"><Button onClick={() => setSelected(row)}>Details</Button></Space> }
        ]} /> :
        <div className="staffWhatsAppHistoryCards">
          {historyLoading && !history && <Typography.Text type="secondary">Loading message history…</Typography.Text>}
          {historyRows.map(row => <Card key={row.id} size="small"
            title={row.staffName || staffUsers.find(user => user.id === row.staffUserId)?.displayName || "Staff member"}
            extra={<Tag color={stateColor(row.state)}>{stateLabel(row.state)}</Tag>}>
            <Space direction="vertical" className="fullWidth">
              <Typography.Text>{historyCategoryTitle(row.category)}</Typography.Text>
              <Typography.Text type="secondary">{row.maskedNumber || "Number unavailable"} · Scheduled {timestamp(row.scheduledAt)}</Typography.Text>
              <div className="staffWhatsAppAction"><Button onClick={() => setSelected(row)}>Details</Button></div>
            </Space>
          </Card>)}
        </div>}
      {!historyLoading && !historyError && historyRows.length === 0 && <Alert type="info" showIcon
        message="No staff messages match these filters" description="Adjust the date, staff, category or status filters to see other records." />}
      <div className="staffWhatsAppPager">
        <Button disabled={historyLoading || (filters.page ?? 1) <= 1} onClick={() => setFilters(current => ({ ...current, page: (current.page ?? 1) - 1 }))}>Previous</Button>
        <Typography.Text>Page {history?.page ?? filters.page ?? 1} · {history?.total ?? 0} records</Typography.Text>
        <Button disabled={historyLoading || (history?.page ?? 1) * pageSize >= (history?.total ?? 0)}
          onClick={() => setFilters(current => ({ ...current, page: (current.page ?? 1) + 1 }))}>Next</Button>
      </div>
    </section>}

    <Drawer title="Staff WhatsApp message" open={!!selected} onClose={() => setSelected(null)}
      width={screens.md ? 560 : "100%"} destroyOnClose className="recordEditDrawer">
      {selected && <Space direction="vertical" size="middle" className="fullWidth">
        <Descriptions size="small" bordered column={1} items={[
          { key: "staff", label: "Staff", children: selected.staffName || staffUsers.find(user => user.id === selected.staffUserId)?.displayName || "Staff member" },
          { key: "number", label: "Recipient", children: selected.maskedNumber || "Number unavailable" },
          { key: "category", label: "Category", children: historyCategoryTitle(selected.category) },
          { key: "state", label: "State", children: <Tag color={stateColor(selected.state)}>{stateLabel(selected.state)}</Tag> },
          { key: "scheduled", label: "Scheduled", children: timestamp(selected.scheduledAt) },
          { key: "accepted", label: "Accepted by provider", children: timestamp(selected.acceptedAt) },
          { key: "sent", label: "Sent callback", children: timestamp(selected.sentAt) },
          { key: "delivered", label: "Delivered callback", children: timestamp(selected.deliveredAt) },
          { key: "read", label: "Read callback", children: timestamp(selected.readAt) },
          { key: "failed", label: "Failed", children: timestamp(selected.failedAt) },
          { key: "suppressed", label: "Suppressed", children: timestamp(selected.suppressedAt) }
        ]} />
        <Card size="small" title="Submitted content">
          {selected.submittedBody ? <Typography.Paragraph className="staffWhatsAppSubmittedBody">{selected.submittedBody}</Typography.Paragraph> :
            <Typography.Text type="secondary">Content has not been submitted or was not captured for this record.</Typography.Text>}
          {(selected.submittedTemplateName || selected.submittedLanguage) && <Typography.Text type="secondary">
            Template: {selected.submittedTemplateName || "Not recorded"} · Language: {selected.submittedLanguage || "Not recorded"}
          </Typography.Text>}
          <Typography.Paragraph type="secondary">This is the recorded text parameter submitted to the provider. The provider's fixed template wrapper is not stored here.</Typography.Paragraph>
        </Card>
        {selected.failureReason && <Alert type="warning" showIcon message="Delivery issue" description={selected.failureReason} />}
        <Typography.Text type="secondary">No retry action is available from history. Check the recipient connection, sender readiness and failure reason before a new event.</Typography.Text>
      </Space>}
    </Drawer>

    <Drawer title={editing ? `Edit ${descriptions[editing.category].title}` : "Edit message category"}
      open={!!editing} onClose={() => setEditing(null)} width={screens.md ? 480 : "100%"} destroyOnClose className="recordEditDrawer">
      {editing && <Form form={form} layout="vertical" onFinish={reviewSave}>
        <Typography.Paragraph type="secondary">{descriptions[editing.category].detail}</Typography.Paragraph>
        <Form.Item name="enabled" label="Category" valuePropName="checked"><Switch checkedChildren="On" unCheckedChildren="Off" /></Form.Item>
        {(editing.category === "OutstandingDigest" || editing.category === "AttendanceSummary" || editing.category === "LeaveApproval") &&
          <Form.Item name="time" label="Daily time (Malaysia, UTC+8)" rules={[{ required: true, message: "Select a daily time." }]}>
            <TimePicker format="HH:mm" className="fullWidth" />
          </Form.Item>}
        {editing.category === "OutstandingDigest" && <Form.Item name="leadDays" label="Lead days" rules={[{ required: true, type: "number", min: 1, max: 30 }]}>
          <InputNumber min={1} max={30} precision={0} className="fullWidth" />
        </Form.Item>}
        {editing.category === "OcrUsage" && <Form.Item name="thresholdPercent" label="OCR usage threshold (%)" rules={[{ required: true, type: "number", min: 1, max: 100 }]}>
          <InputNumber min={1} max={100} precision={0} className="fullWidth" />
        </Form.Item>}
        <Alert type={editing.senderReady && editing.templateReady && editing.categoryReady ? "info" : "warning"} showIcon message="Readiness" description={readiness(editing)} />
        <Form.Item className="formActions"><Button type="primary" htmlType="submit" loading={saving}>Review and save</Button></Form.Item>
      </Form>}
    </Drawer>
  </Space>;
}
