import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Grid, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { OperationsProTable } from "../shared/OperationsProTable";
import { actOnWhatsAppQueue, getWhatsAppQueue, humanizeApiError, saveWhatsAppConsent, type WhatsAppConsentInput, type WhatsAppQueue, type WhatsAppQueueItem } from "../../api";

const states = ["HeldForApproval", "Queued", "Sending", "Accepted", "Sent", "Delivered", "Read", "RetryScheduled", "Failed", "DeadLetter", "Suppressed", "UnknownOutcome"];
const labels: Record<string, string> = { HeldForApproval: "Awaiting template approval", UnknownOutcome: "Outcome unknown", DeadLetter: "Failed — review needed", RetryScheduled: "Retry scheduled" };

export function WhatsAppSettings() {
  const [queue, setQueue] = useState<WhatsAppQueue>();
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<WhatsAppConsentInput>();
  const screens = Grid.useBreakpoint();
  const [modal, contextHolder] = Modal.useModal();
  const load = useCallback(async () => {
    setLoading(true);
    try { setQueue(await getWhatsAppQueue(state, page)); setError(""); }
    catch (failure) { setQueue(undefined); setError(humanizeApiError(failure, "Could not load WhatsApp notifications.")); }
    finally { setLoading(false); }
  }, [state, page]);
  useEffect(() => { void load(); }, [load]);

  const act = (row: WhatsAppQueueItem, action: "retry" | "suppress") => modal.confirm({
    title: action === "retry" ? (row.eventKind === "test" ? "Retry this test notification?" : "Retry this customer notification?") : "Suppress this pending notification?",
    content: action === "retry" ? (row.eventKind === "test" ? "Consent, test recipient and expiry will be checked again. This queues only the separate test flow." : "This can send a real WhatsApp notification to the customer. Consent, approved template, expiry, remaining attempts and sending limits will be checked again. Unknown outcomes cannot be retried.") : "This prevents the pending notification from being sent. Messages already submitted cannot be recalled.",
    okText: action === "retry" ? "Confirm retry" : "Confirm suppression",
    onOk: async () => {
      setBusy(true);
      try { await actOnWhatsAppQueue(row.id, action); message.success("Notification updated."); await load(); }
      catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { setBusy(false); }
    }
  });
  const actions = (row: WhatsAppQueueItem) => <Space wrap className="tableActionGroup">
    {row.canRetry && <Button disabled={busy} onClick={() => act(row, "retry")}>{row.eventKind === "test" ? "Retry test" : "Retry notification"}</Button>}
    {row.canSuppress && <Button disabled={busy} onClick={() => act(row, "suppress")}>Suppress</Button>}
    {!row.canRetry && !row.canSuppress && <Typography.Text type="secondary">No action</Typography.Text>}
  </Space>;
  const saveConsent = (values: WhatsAppConsentInput) => modal.confirm({
    title: values.optedIn ? "Record explicit WhatsApp consent?" : "Revoke WhatsApp consent?",
    content: `${values.optedIn ? "Confirm the recipient explicitly agreed to notifications. A saved phone number alone is not consent." : "Pending notifications will be suppressed."} Language: ${values.language === "ms" ? "Bahasa Malaysia" : "English"}.`,
    okText: "Confirm and save",
    onOk: async () => {
      setBusy(true);
      try { await saveWhatsAppConsent(values); message.success("Consent and language recorded."); form.resetFields(); await load(); }
      catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { setBusy(false); }
    }
  });
  return <Space direction="vertical" size="middle" className="fullWidth">
    {contextHolder}
    <Alert type={queue?.sendingEnabled ? "warning" : "info"} showIcon message={queue?.sendingEnabled ? "Production sending is enabled" : "Production sending is disabled"} description={queue?.sendingEnabled ? "Approved customer templates can be sent within the configured limits. This view does not include messages in the separate local WhatsApp test probe." : "Business notifications remain held until approved templates, sender and sending limits are configured. This view does not include messages in the separate local WhatsApp test probe."} />
    {error && <Alert type="error" showIcon message={error} />}
    {queue && !queue.captureEnabled && <Alert type="warning" showIcon message="Business event capture is disabled" description="No business notifications or consent changes are recorded until capture is configured." />}
    <Space wrap>
      <Select aria-label="Notification status" value={state} style={{ minWidth: 220 }} onChange={value => { setState(value); setPage(1); }} options={[{ value: "", label: "All statuses" }, ...states.map(value => ({ value, label: labels[value] ?? value }))]} />
      <Button loading={loading} onClick={() => void load()}>Refresh</Button>
    </Space>
    {screens.md ? <OperationsProTable<WhatsAppQueueItem> search={false} columnFilters={false} rowKey="id" loading={loading} dataSource={queue?.items ?? []} pagination={false} scroll={{ x: 950 }} columns={[
      { title: "Recipient", dataIndex: "recipient" },
      { title: "Event / reference", render: (_, row) => <><div>{row.eventKind}</div><Typography.Text type="secondary" style={{ overflowWrap: "anywhere" }}>{row.businessReference || "Test"}</Typography.Text></> },
      { title: "Language / template", render: (_, row) => <><div>{row.language === "ms" ? "Bahasa Malaysia" : "English"}</div><Typography.Text type="secondary">{row.templateVersion}</Typography.Text></> },
      { title: "Status", dataIndex: "state", render: value => <Tag>{labels[value] ?? value}</Tag> },
      { title: "Attempts", dataIndex: "attempts" },
      { title: "Created", dataIndex: "createdAt", render: value => new Date(value * 1000).toLocaleString() },
      { title: "Action", fixed: "right", render: (_, row) => actions(row) }
    ]} /> : <Space direction="vertical" className="fullWidth">
      {!queue?.items.length && <Typography.Text type="secondary">{loading ? "Loading notifications…" : "No notifications to show."}</Typography.Text>}
      {queue?.items.map(row => <Card key={row.id} size="small" title={row.recipient}>
        <Space direction="vertical"><Tag>{labels[row.state] ?? row.state}</Tag><Typography.Text>{row.eventKind}</Typography.Text>
          <Typography.Text style={{ overflowWrap: "anywhere" }}>{row.businessReference || "Test"}</Typography.Text>
          <Typography.Text>{row.language === "ms" ? "Bahasa Malaysia" : "English"} · {row.templateVersion}</Typography.Text>
          <Typography.Text type="secondary">{row.attempts} attempts · {new Date(row.createdAt * 1000).toLocaleString()}</Typography.Text>{actions(row)}</Space>
      </Card>)}
    </Space>}
    <Space><Button disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button><Typography.Text>Page {page}</Typography.Text><Button disabled={loading || (queue?.items.length ?? 0) < 25} onClick={() => setPage(page + 1)}>Next</Button></Space>
    <Card title="Record consent and language">
      <Typography.Paragraph type="secondary">Use evidence of the recipient's agreement or withdrawal. Only the selected, approved language can be sent when production sending is enabled.</Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ language: "ms", optedIn: false }} onFinish={saveConsent} disabled={!queue?.captureEnabled || busy}>
        <div className="formGrid">
          <Form.Item name="recipient" label="International phone number" rules={[{ required: true, pattern: /^\+?[1-9][0-9]{7,14}$/, message: "Use country code and digits, for example +60123456789." }]}><Input autoComplete="off" /></Form.Item>
          <Form.Item name="language" label="Notification language" rules={[{ required: true }]}><Select options={[{ value: "ms", label: "Bahasa Malaysia" }, { value: "en_US", label: "English" }]} /></Form.Item>
          <Form.Item name="optedIn" label="Consent decision" rules={[{ required: true }]}><Select options={[{ value: false, label: "Revoke / do not send" }, { value: true, label: "Explicitly agreed to notifications" }]} /></Form.Item>
          <Form.Item name="evidence" label="Consent evidence / withdrawal reason" rules={[{ required: true, whitespace: true, max: 160 }]}><Input maxLength={160} /></Form.Item>
        </div><Button type="primary" htmlType="submit">Review and save</Button>
      </Form>
    </Card>
  </Space>;
}
