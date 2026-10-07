import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Tag, Typography, message } from "antd";
import { connectStaffWhatsApp, disconnectStaffWhatsApp, getStaffWhatsAppConnection, humanizeApiError, resendStaffWhatsAppInvitation, type StaffWhatsAppConnectInput, type StaffWhatsAppConnection as Connection, type StaffWhatsAppLink } from "../../api";

const labels: Record<Connection["state"], string> = {
  Disabled: "Staff WhatsApp queries are disabled",
  Disconnected: "Not connected",
  AwaitingVerification: "Waiting for WhatsApp verification",
  Connected: "Connected",
  RelinkRequired: "Disconnect and verify again"
};

export function StaffWhatsAppConnection({ staffUserId }: { staffUserId?: string }) {
  const [loadedConnection, setLoadedConnection] = useState<{ staffUserId?: string; value: Connection }>();
  const [loadedLink, setLoadedLink] = useState<{ staffUserId?: string; value: StaffWhatsAppLink }>();
  const connection = loadedConnection && loadedConnection.staffUserId === staffUserId ? loadedConnection.value : undefined;
  const link = loadedLink && loadedLink.staffUserId === staffUserId ? loadedLink.value : undefined;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);
  const statusInFlight = useRef<number | null>(null);
  const mutationInFlight = useRef(false);
  const currentStaff = useRef(staffUserId);
  currentStaff.current = staffUserId;
  const [form] = Form.useForm<StaffWhatsAppConnectInput>();
  const [modal, contextHolder] = Modal.useModal();
  const invitationLanguages = connection?.invitationLanguages ?? (connection?.invitationAvailable ? ["ms", "en_US"] : []);
  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    statusInFlight.current = requestId;
    try {
      const result = await getStaffWhatsAppConnection(staffUserId);
      if (requestId !== requestSequence.current || currentStaff.current !== staffUserId) return;
      setLoadedConnection({ staffUserId, value: result });
      if (result.state !== "AwaitingVerification") setLoadedLink(undefined);
      setError("");
    } catch (failure) {
      if (requestId === requestSequence.current && currentStaff.current === staffUserId) setError(humanizeApiError(failure));
    } finally { if (statusInFlight.current === requestId) statusInFlight.current = null; }
  }, [staffUserId]);
  const invalidateStatus = () => { requestSequence.current++; statusInFlight.current = null; };
  useEffect(() => {
    invalidateStatus();
    mutationInFlight.current = false;
    setLoadedConnection(undefined);
    setLoadedLink(undefined);
    setError("");
    void load();
    return () => { requestSequence.current++; statusInFlight.current = null; };
  }, [load]);
  useEffect(() => {
    if (connection?.state !== "AwaitingVerification" || !connection.expiresAt) return;
    const remaining = connection.expiresAt * 1000 - Date.now();
    const interval = window.setInterval(() => { if (!mutationInFlight.current && statusInFlight.current === null) void load(); }, 5000);
    const expiry = window.setTimeout(() => { if (!mutationInFlight.current && statusInFlight.current === null) void load(); }, Math.max(1000, remaining + 250));
    return () => { window.clearInterval(interval); window.clearTimeout(expiry); };
  }, [connection?.state, connection?.expiresAt, load]);
  const isSelf = !staffUserId;

  const connect = (values: StaffWhatsAppConnectInput) => modal.confirm({
    title: isSelf ? "Connect your WhatsApp number?" : "Connect this number to the selected staff account?",
    content: isSelf ? "An approved invitation will be queued to this number. It contains no verification secret. After it arrives, copy the one-time command from this portal and send it from the same number. Your account roles do not change." : "Confirm the employee's consent. An approved invitation will be queued to their number without a verification secret. Give the one-time portal command only to that employee; they must send it from the same number. Their account roles do not change.",
    okText: "Queue invitation and create command",
    onOk: async () => {
      invalidateStatus();
      mutationInFlight.current = true;
      setBusy(true);
      try {
        const result = await connectStaffWhatsApp({ ...values, staffUserId });
        if (currentStaff.current === staffUserId) { setLoadedLink({ staffUserId, value: result }); mutationInFlight.current = false; await load(); }
      } catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { mutationInFlight.current = false; setBusy(false); }
    }
  });
  const disconnect = () => modal.confirm({
    title: "Disconnect WhatsApp?",
    content: isSelf ? "Future queries and queued replies for your account will stop. Reconnecting requires a new one-time verification." : "Future queries and queued replies for this employee will stop. Reconnecting requires a new one-time verification.",
    okText: "Disconnect",
    okButtonProps: { danger: true },
    onOk: async () => {
      invalidateStatus();
      mutationInFlight.current = true;
      setBusy(true);
      try { await disconnectStaffWhatsApp(staffUserId); if (currentStaff.current === staffUserId) { setLoadedLink(undefined); form.resetFields(); mutationInFlight.current = false; await load(); } }
      catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { mutationInFlight.current = false; setBusy(false); }
    }
  });
  const resend = () => modal.confirm({
    title: "Resend the invitation?",
    content: "Only the approved setup invitation will be queued again. It contains no verification command; the portal command remains the same and keeps its original expiry.",
    okText: "Resend invitation",
    onOk: async () => {
      invalidateStatus();
      mutationInFlight.current = true;
      setBusy(true);
      try { await resendStaffWhatsAppInvitation(staffUserId); if (currentStaff.current === staffUserId) { mutationInFlight.current = false; await load(); message.success("Invitation queued again."); } }
      catch (failure) { message.error(humanizeApiError(failure)); throw failure; }
      finally { mutationInFlight.current = false; setBusy(false); }
    }
  });
  const hasBinding = connection?.state === "Connected" || connection?.state === "RelinkRequired" || connection?.state === "AwaitingVerification";
  return <Space direction="vertical" size="middle" className="fullWidth">
    {contextHolder}
    <Typography.Title level={5}>{isSelf ? "My WhatsApp assistant" : "Staff WhatsApp assistant"}</Typography.Title>
    <Typography.Paragraph type="secondary">Use one-time number verification to query read-only operational summaries in WhatsApp. Your existing role access continues to control what you can see; customer outbound notifications are managed separately.</Typography.Paragraph>
    {(connection?.state === "Disconnected" || connection?.state === "RelinkRequired") && <Alert
      type="info"
      showIcon
      message={isSelf ? "Set up your staff assistant" : "Admin-assisted staff setup"}
      description={<>
        <Typography.Paragraph>{isSelf ? "This connects your signed-in account. No admin approval is needed, and your existing roles stay in force." : "This connects the selected employee's account. The employee must consent and verify their own number; admin assistance does not change roles or passwords."}</Typography.Paragraph>
        <ol style={{ margin: 0, paddingInlineStart: 20 }}>
          <li>Enter the WhatsApp number you will use, including its country code.</li>
          <li>Choose a reply language and confirm consent for staff WhatsApp queries.</li>
          <li>Confirm setup to queue an approved invitation to that number. The invitation never contains the one-time command.</li>
          <li>Copy the command from this portal and send it from the same number within 10 minutes.</li>
          <li>This page checks automatically for verification while the command remains valid.</li>
        </ol>
      </>}
    />}
    <Space wrap><Tag>{connection ? labels[connection.state] : "Loading connection…"}</Tag>
      {connection?.maskedNumber && <Typography.Text>{connection.maskedNumber}</Typography.Text>}
      <Button onClick={() => void load()} disabled={busy}>Refresh status</Button>
    </Space>
    {error && <Alert type="error" showIcon message={error} />}
    {connection && !connection.enabled && <Alert type="info" showIcon message="Connection setup is not enabled yet." />}
    {connection?.enabled && !connection.invitationAvailable && connection.state === "Disconnected" && <Alert type="warning" showIcon message="Invitations are not available yet" description="An operator must enable the enrollment sender and approve its invitation template before a setup command can be created." />}
    {connection?.state === "AwaitingVerification" && <Alert type={connection.invitationState === "DeadLetter" || connection.invitationState === "Failed" || connection.invitationState === "Suppressed" ? "warning" : "info"} showIcon message="Awaiting verification" description={<Space direction="vertical">
      <Typography.Text>Invitation delivery: {connection.invitationState ?? "Not queued"}. Provider acceptance is not proof of delivery; send the portal command from the registered number even if the invitation is delayed.</Typography.Text>
      {!link && <Typography.Text>The one-time command was shown only when this setup was created. If you no longer have it, disconnect and start a new setup after the cooldown.</Typography.Text>}
      {connection.expiresAt && <Typography.Text>Command expires at {new Date(connection.expiresAt * 1000).toLocaleTimeString()}.</Typography.Text>}
      {connection.invitationState && ["Accepted", "DeadLetter", "Failed", "Suppressed"].includes(connection.invitationState) &&
        <Button onClick={resend} disabled={busy || !connection.invitationAvailable || !connection.invitationCreatedAt || Date.now() < (connection.invitationCreatedAt + 60) * 1000}>Resend invitation</Button>}
    </Space>} />}
    {hasBinding ? <Button danger disabled={busy} onClick={disconnect}>Disconnect WhatsApp</Button> : connection &&
      <Form form={form} name={`staffWhatsApp-${staffUserId ?? "self"}`} layout="vertical" initialValues={{ language: invitationLanguages[0], consentConfirmed: false }} disabled={!connection.enabled || !connection.invitationAvailable || invitationLanguages.length === 0 || busy} onFinish={connect}>
        <Form.Item name="recipient" label="WhatsApp number (with country code)" rules={[{ required: true, pattern: /^\+?[1-9][0-9]{7,14}$/, message: "Enter the country code and digits, for example +60123456789." }]}><Input aria-label="WhatsApp number (with country code)" autoComplete="off" inputMode="tel" /></Form.Item>
        <Form.Item name="language" label="Reply language" extra="Only languages with a configured invitation template are available."
          rules={[{ required: true }, { validator: (_, value) => invitationLanguages.includes(value) ? Promise.resolve() : Promise.reject(new Error("Choose an available invitation language.")) }]}>
          <Select options={[{ value: "ms", label: "Bahasa Malaysia" }, { value: "en_US", label: "English" }]
            .filter(option => invitationLanguages.some(language => language === option.value))} />
        </Form.Item>
        <Form.Item name="consentConfirmed" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Confirm agreement before connecting.")) }]}>
          <Checkbox>{isSelf ? "I agree to use this number for staff WhatsApp queries." : "The selected employee agrees to use this number for staff WhatsApp queries."}</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Send invitation</Button>
      </Form>}
    {connection?.state === "Connected" && <Alert type="success" showIcon message="Connected — next step" description="Send help to the company WhatsApp assistant chat from this verified number to see your available commands. Queries are read-only. Collections and seller settlement require Finance or Admin; profit and dashboard summaries require Admin." />}
    {link && connection?.state === "AwaitingVerification" && <Alert type="info" showIcon message="Verify from the invited number" description={<Space direction="vertical" className="fullWidth">
      <Typography.Text code copyable style={{ overflowWrap: "anywhere" }}>{link.command}</Typography.Text>
      {link.businessDisplayNumber && <Button type="primary" href={`https://wa.me/${link.businessDisplayNumber}?text=${encodeURIComponent(link.command)}`} target="_blank" rel="noopener noreferrer">Open WhatsApp &amp; Verify</Button>}
      {!link.businessDisplayNumber && <Typography.Text>The business display number is not configured; copy the command and paste it into the official company WhatsApp chat.</Typography.Text>}
      <Typography.Text>Expires at {new Date(link.expiresAt * 1000).toLocaleTimeString()}. Use it once from the invited number and keep it private. This page updates automatically.</Typography.Text>
    </Space>} />}
  </Space>;
}
