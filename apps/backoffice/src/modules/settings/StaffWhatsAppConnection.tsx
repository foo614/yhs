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

  const connect = (values: StaffWhatsAppConnectInput) => modal.confirm({
    title: "Connect this number to the staff account?",
    content: "The employee must send the connection command from this number. Once verified, WhatsApp queries use this account's current access. No role or password is changed.",
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
    content: "Future queries and queued replies will stop. Reconnecting requires a new one-time verification.",
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
    <Typography.Title level={5}>Staff WhatsApp / WhatsApp 员工连接</Typography.Title>
    <Typography.Paragraph type="secondary">Verify once, then query in WhatsApp without signing in each time. Customer notifications and staff queries use separate consent controls.</Typography.Paragraph>
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
          <Checkbox>The employee agrees to use this number for staff WhatsApp queries.</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Connect WhatsApp</Button>
      </Form>}
    {link && <Alert type="info" showIcon message="Send this command from the entered WhatsApp number" description={<Space direction="vertical" className="fullWidth">
      <Typography.Text code copyable style={{ overflowWrap: "anywhere" }}>{link.command}</Typography.Text>
      <Typography.Text>Expires at {new Date(link.expiresAt * 1000).toLocaleTimeString()}. Keep this one-time command private. After sending, refresh the status.</Typography.Text>
    </Space>} />}
  </Space>;
}
