import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Form, InputNumber, Modal, Space, Typography, message } from "antd";
import { getStaffWhatsAppBudget, humanizeApiError, updateStaffWhatsAppBudget,
  type StaffWhatsAppBudget } from "../../api";

type BudgetFormValues = {
  dailyAttemptLimit: number;
  monthlyBudgetRinggit: number;
  maximumCostPerAttemptRinggit: number;
};

const ringgit = (sen: number) => `RM ${(sen / 100).toLocaleString("en-MY", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
})}`;

export function StaffWhatsAppBudgetSettings() {
  const [budget, setBudget] = useState<StaffWhatsAppBudget>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<BudgetFormValues>();
  const [modal, contextHolder] = Modal.useModal();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getStaffWhatsAppBudget();
      setBudget(next);
      setError("");
      form.setFieldsValue({
        dailyAttemptLimit: next.dailyAttemptLimit,
        monthlyBudgetRinggit: next.monthlyBudgetSen / 100,
        maximumCostPerAttemptRinggit: next.maximumCostPerAttemptSen / 100
      });
    } catch (failure) {
      setError(humanizeApiError(failure, "Could not load the WhatsApp sending budget."));
    } finally { setLoading(false); }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  const reviewSave = (values: BudgetFormValues) => {
    const input = {
      dailyAttemptLimit: values.dailyAttemptLimit,
      monthlyBudgetSen: Math.round(values.monthlyBudgetRinggit * 100),
      maximumCostPerAttemptSen: Math.round(values.maximumCostPerAttemptRinggit * 100)
    };
    modal.confirm({
      title: "Save WhatsApp sending limits?",
      content: <Space direction="vertical">
        <span>Daily attempt limit: {input.dailyAttemptLimit.toLocaleString("en-MY")}.</span>
        <span>Monthly reserved-cost budget: {ringgit(input.monthlyBudgetSen)}.</span>
        <span>Reserved cost per attempt: {ringgit(input.maximumCostPerAttemptSen)}.</span>
        <span>These shared limits apply to staff, staff invitations and customer notifications. Increasing a blocked limit may allow queued messages to start sending immediately.</span>
      </Space>,
      okText: "Confirm and save",
      onOk: async () => {
        setSaving(true);
        try {
          await updateStaffWhatsAppBudget(input);
          await load();
          message.success("WhatsApp sending budget saved.");
        } catch (failure) {
          message.error(humanizeApiError(failure, "Could not save the WhatsApp sending budget."));
          throw failure;
        } finally { setSaving(false); }
      }
    });
  };

  return <section aria-label="WhatsApp sending budget">
    {contextHolder}
    <Space direction="vertical" size="large" className="fullWidth">
      <div className="staffWhatsAppSectionHead">
        <div>
          <Typography.Title level={5}>Sending budget</Typography.Title>
          <Typography.Text type="secondary">Shared safety limits for staff messages, staff invitations and customer notifications. Usage reserves the maximum cost before each provider attempt; it is not a provider invoice.</Typography.Text>
        </div>
        <Button loading={loading} onClick={() => void load()}>Refresh budget</Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      {budget?.blockedReason && <Alert type="warning" showIcon message="Sending is currently blocked by a limit" description={budget.blockedReason} />}
      {budget && <Card size="small" title="Current usage">
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
          { key: "daily", label: "Attempts today", children: `${budget.dailyAttempts.toLocaleString("en-MY")} / ${budget.dailyAttemptLimit.toLocaleString("en-MY")}` },
          { key: "dailyRemaining", label: "Attempts remaining today", children: budget.dailyRemainingAttempts.toLocaleString("en-MY") },
          { key: "monthlyAttempts", label: "Attempts this month", children: budget.monthlyAttempts.toLocaleString("en-MY") },
          { key: "reserved", label: "Reserved this month", children: ringgit(budget.monthlyReservedCostSen) },
          { key: "remaining", label: "Budget remaining", children: ringgit(budget.monthlyRemainingBudgetSen) },
          { key: "source", label: "Limit source", children: budget.adminConfigured ? "Saved in admin" : "Server default" }
        ]} />
      </Card>}
      <Card size="small" title="Configure limits" loading={loading && !budget}>
        <Form form={form} layout="vertical" onFinish={reviewSave} disabled={saving || !budget}>
          <div className="formGrid">
            <Form.Item name="dailyAttemptLimit" label="Daily provider attempts" rules={[{ required: true, type: "number", min: 1, message: "Enter at least 1 attempt." }]}>
              <InputNumber min={1} precision={0} className="fullWidth" />
            </Form.Item>
            <Form.Item name="monthlyBudgetRinggit" label="Monthly reserved-cost budget (RM)" rules={[{ required: true, type: "number", min: 0.01, message: "Enter at least RM 0.01." }]}>
              <InputNumber min={0.01} precision={2} step={1} className="fullWidth" />
            </Form.Item>
            <Form.Item name="maximumCostPerAttemptRinggit" label="Reserved cost per attempt (RM)" dependencies={["monthlyBudgetRinggit"]}
              rules={[{ required: true, type: "number", min: 0.01, message: "Enter at least RM 0.01." }, ({ getFieldValue }) => ({
                validator(_, value) { return value <= getFieldValue("monthlyBudgetRinggit")
                  ? Promise.resolve() : Promise.reject(new Error("Cost per attempt cannot exceed the monthly budget.")); }
              })]}>
              <InputNumber min={0.01} precision={2} step={0.01} className="fullWidth" />
            </Form.Item>
          </div>
          <Typography.Paragraph type="secondary">Lowering a limit below current usage blocks new attempts; it does not recall messages already submitted to WhatsApp.</Typography.Paragraph>
          <Button type="primary" htmlType="submit" loading={saving}>Review and save</Button>
        </Form>
      </Card>
    </Space>
  </section>;
}
