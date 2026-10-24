import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Form, InputNumber, Modal, Space, Typography, message } from "antd";
import { getStaffWhatsAppLimits, humanizeApiError, updateStaffWhatsAppLimits,
  type StaffWhatsAppLimits } from "../../api";

type LimitsFormValues = { dailyAttemptLimit: number };

export function StaffWhatsAppLimitSettings() {
  const [limits, setLimits] = useState<StaffWhatsAppLimits>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<LimitsFormValues>();
  const [modal, contextHolder] = Modal.useModal();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getStaffWhatsAppLimits();
      setLimits(next);
      setError("");
      form.setFieldsValue({ dailyAttemptLimit: next.dailyAttemptLimit });
    } catch (failure) {
      setError(humanizeApiError(failure, "Could not load the WhatsApp sending limits."));
    } finally { setLoading(false); }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  const reviewSave = (values: LimitsFormValues) => {
    const input = { dailyAttemptLimit: values.dailyAttemptLimit };
    modal.confirm({
      title: "Save WhatsApp sending limits?",
      content: <Space direction="vertical">
        <span>Daily provider-attempt limit: {input.dailyAttemptLimit.toLocaleString("en-MY")}.</span>
        <span>These shared limits apply to staff messages, staff invitations and customer notifications. Attempts count provider submission attempts, not billed-message counts. Provider outcomes remain available in message history.</span>
        <span>Increasing a blocked limit may allow queued messages to start sending immediately.</span>
      </Space>,
      okText: "Confirm and save",
      onOk: async () => {
        setSaving(true);
        try {
          await updateStaffWhatsAppLimits(input);
          await load();
          message.success("WhatsApp sending limits saved.");
        } catch (failure) {
          message.error(humanizeApiError(failure, "Could not save the WhatsApp sending limits."));
          throw failure;
        } finally { setSaving(false); }
      }
    });
  };

  return <section aria-label="WhatsApp sending limits">
    {contextHolder}
    <Space direction="vertical" size="large" className="fullWidth">
      <div className="staffWhatsAppSectionHead">
        <div>
          <Typography.Title level={5}>Sending limits</Typography.Title>
          <Typography.Text type="secondary">Shared daily provider-attempt limits for staff messages, staff invitations and customer notifications. Attempts are not billed-message counts; provider outcomes remain in message history.</Typography.Text>
        </div>
        <Button loading={loading} onClick={() => void load()}>Refresh limits</Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {limits?.blockedReason && <Alert type="warning" showIcon message="Sending is currently blocked by a limit" description={limits.blockedReason} />}
      {limits && <Card size="small" title="Current usage">
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: "daily", label: "Attempts today", children: `${limits.dailyAttempts.toLocaleString("en-MY")} / ${limits.dailyAttemptLimit.toLocaleString("en-MY")}` },
          { key: "dailyRemaining", label: "Attempts remaining today", children: limits.dailyRemainingAttempts.toLocaleString("en-MY") },
          { key: "source", label: "Limit source", children: limits.adminConfigured ? "Saved in admin" : "Server default" }
        ]} />
      </Card>}
      <Card size="small" title="Configure daily limit" loading={loading && !limits}>
        <Form form={form} layout="vertical" onFinish={reviewSave} disabled={saving || !limits}>
          <Form.Item name="dailyAttemptLimit" label="Daily provider attempts" rules={[{ required: true, type: "number", min: 1, message: "Enter at least 1 attempt." }]}>
            <InputNumber min={1} precision={0} className="fullWidth" />
          </Form.Item>
          <Typography.Paragraph type="secondary">Lowering the limit below current usage blocks new attempts; it does not recall messages already submitted to WhatsApp. Provider acceptance, delivery and failure outcomes remain in history.</Typography.Paragraph>
          <Button type="primary" htmlType="submit" loading={saving}>Review and save</Button>
        </Form>
      </Card>
    </Space>
  </section>;
}
