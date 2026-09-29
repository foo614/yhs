import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { connectStaffWhatsApp, disconnectStaffWhatsApp, getStaffWhatsAppConnection, humanizeApiError, type StaffWhatsAppConnectInput, type StaffWhatsAppConnection as Connection, type StaffWhatsAppLink } from "../../api";

const labels: Record<Connection["state"], string> = {
  Disabled: "Staff WhatsApp queries are disabled",
  Disconnected: "Not connected",
  AwaitingVerification: "Waiting for WhatsApp verification",
  Connected: "Connected",
  RelinkRequired: "Disconnect and verify again"
};

export function StaffWhatsAppConnection({ staffUserId }: { staffUserId?: string }) {
  const [connection, setConnection] = useState<Connection>();
  const [link, setLink] = useState<StaffWhatsAppLink>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<StaffWhatsAppConnectInput>();
  const [modal, contextHolder] = Modal.useModal();
  const load = useCallback(async () => {
    try {
      const result = await getStaffWhatsAppConnection(staffUserId);
      setConnection(result);
      if (result.state === "Connected") setLink(undefined);
      setError("");
    } catch (failure) { setError(humanizeApiError(failure)); }
  }, [staffUserId]);
  useEffect(() => { void load(); }, [load]);
  const isSelf = !staffUserId;

  const connect = (values: StaffWhatsAppConnectInput) => modal.confirm({
    title: isSelf ? "Connect your WhatsApp number?" : "Connect this number to the selected staff account?",
    content: isSelf ? "Send the one-time connection command to the company WhatsApp assistant chat from your own number. Once verified, WhatsApp queries use your current account access. No admin approval, role change or password change is needed." : "The selected employee must consent and send the one-time connection command to the company WhatsApp assistant chat from this number. Once verified, WhatsApp queries use that employee's current account access. No role or password is changed.",
    okText: "Create connection command",
    onOk: async () => {
      setBusy(true);
      try {
        setLink(await connectStaffWhatsApp({ ...values, staffUserId }));
        await load();
      } catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { setBusy(false); }
    }
  });
  const disconnect = () => modal.confirm({
    title: "Disconnect WhatsApp?",
    content: isSelf ? "Future queries and queued replies for your account will stop. Reconnecting requires a new one-time verification." : "Future queries and queued replies for this employee will stop. Reconnecting requires a new one-time verification.",
    okText: "Disconnect",
    okButtonProps: { danger: true },
    onOk: async () => {
      setBusy(true);
      try { await disconnectStaffWhatsApp(staffUserId); setLink(undefined); form.resetFields(); await load(); }
      catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { setBusy(false); }
    }
  });
  const hasBinding = connection?.state === "Connected" || connection?.state === "RelinkRequired" || connection?.state === "AwaitingVerification";
  return <Space direction="vertical" size="middle" className="fullWidth">
    {contextHolder}
    <Typography.Title level={5}>{isSelf ? "My WhatsApp assistant" : "Staff WhatsApp assistant"}</Typography.Title>
    <Typography.Paragraph type="secondary">Use one-time number verification to query read-only operational summaries in WhatsApp. Your existing role access continues to control what you can see; customer outbound notifications are managed separately.</Typography.Paragraph>
    {connection?.state !== "Connected" && <Alert
      type="info"
      showIcon
      message={isSelf ? "Set up your staff assistant" : "Admin-assisted staff setup"}
      description={<>
        <Typography.Paragraph>{isSelf ? "This connects your signed-in account. No admin approval is needed, and your existing roles stay in force." : "This connects the selected employee's account. The employee must consent and verify their own number; admin assistance does not change roles or passwords."}</Typography.Paragraph>
        <ol style={{ margin: 0, paddingInlineStart: 20 }}>
          <li>Enter the WhatsApp number you will use, including its country code.</li>
          <li>Choose a reply language and confirm consent for staff WhatsApp queries.</li>
          <li>Review the confirmation, create the one-time command, and send it to the company WhatsApp assistant chat from that number within 10 minutes.</li>
          <li>Refresh the status after WhatsApp accepts the command.</li>
        </ol>
      </>}
    />}
    <Space wrap><Tag>{connection ? labels[connection.state] : "Loading connection…"}</Tag>
      {connection?.maskedNumber && <Typography.Text>{connection.maskedNumber}</Typography.Text>}
      <Button onClick={() => void load()} disabled={busy}>Refresh status</Button>
    </Space>
    {error && <Alert type="error" showIcon message={error} />}
    {connection && !connection.enabled && <Alert type="info" showIcon message="Connection setup is not enabled yet." />}
    {hasBinding ? <Button danger disabled={busy} onClick={disconnect}>Disconnect WhatsApp</Button> :
      <Form form={form} name={`staffWhatsApp-${staffUserId ?? "self"}`} layout="vertical" initialValues={{ language: "ms", consentConfirmed: false }} disabled={!connection?.enabled || busy} onFinish={connect}>
        <Form.Item name="recipient" label="WhatsApp number (with country code)" rules={[{ required: true, pattern: /^\+?[1-9][0-9]{7,14}$/, message: "Enter the country code and digits, for example +60123456789." }]}><Input aria-label="WhatsApp number (with country code)" autoComplete="off" inputMode="tel" /></Form.Item>
        <Form.Item name="language" label="Reply language" rules={[{ required: true }]}><Select options={[{ value: "ms", label: "Bahasa Malaysia" }, { value: "en_US", label: "English" }]} /></Form.Item>
        <Form.Item name="consentConfirmed" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Confirm agreement before connecting.")) }]}>
          <Checkbox>{isSelf ? "I agree to use this number for staff WhatsApp queries." : "The selected employee agrees to use this number for staff WhatsApp queries."}</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Connect WhatsApp</Button>
      </Form>}
    {connection?.state === "Connected" && <Alert type="success" showIcon message="Connected — next step" description="Send help to the company WhatsApp assistant chat from this verified number to see your available commands. Queries are read-only. Collections and seller settlement require Finance or Admin; profit and dashboard summaries require Admin." />}
    {link && <Alert type="info" showIcon message="Send the one-time command to the company assistant" description={<Space direction="vertical" className="fullWidth">
      <Typography.Text code copyable style={{ overflowWrap: "anywhere" }}>{link.command}</Typography.Text>
      <Typography.Text>Expires at {new Date(link.expiresAt * 1000).toLocaleTimeString()}. Use it once, keep it private, then refresh the status after sending.</Typography.Text>
    </Space>} />}
  </Space>;
}
