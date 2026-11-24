import { dialogWidths } from "../shared/dialogSizing";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Modal, Select, Space, TimePicker, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { getStockListingPreferences, humanizeApiError, updateStockListingPreferences, type StockListingPreferences } from "../../api";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  .map((label, value) => ({ label, value }));

type StockListingForm = { weekday: number; time: Dayjs; recipientUserIds: string[] };

export function StockListingSettings() {
  const [form] = Form.useForm<StockListingForm>();
  const [modal, modalContext] = Modal.useModal();
  const [settings, setSettings] = useState<StockListingPreferences>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const display = useCallback((result: StockListingPreferences) => {
    setSettings(result);
    form.setFieldsValue({
      weekday: result.weekday,
      time: dayjs("2000-01-01").add(result.localMinuteOfDay, "minute"),
      recipientUserIds: result.recipientUserIds.filter(id => result.eligibleRecipients.some(person => person.userId === id))
    });
  }, [form]);

  useEffect(() => {
    let active = true;
    getStockListingPreferences().then(result => {
      if (active) display(result);
    }, failure => {
      if (active) setError(humanizeApiError(failure, "Could not load Stock Listing preferences."));
    });
    return () => { active = false; };
  }, [display]);

  function confirmSave(values: StockListingForm) {
    modal.confirm({ centered: true, width: dialogWidths.compact,
      title: "Save weekly Stock Listing preferences?",
      content: "The weekday, Malaysia time and recipients will be saved. Delivery is blocked while the template cannot attach Excel.",
      okText: "Save preferences",
      onOk: async () => {
        setSaving(true);
        setError("");
        try {
          const result = await updateStockListingPreferences({
            weekday: values.weekday,
            localMinuteOfDay: values.time.hour() * 60 + values.time.minute(),
            recipientUserIds: values.recipientUserIds
          });
          display(result);
          message.success("Stock Listing preferences saved");
        } catch (failure) {
          const detail = humanizeApiError(failure, "Could not save Stock Listing preferences.");
          setError(detail);
          message.error(detail);
        } finally {
          setSaving(false);
        }
      }
    });
  }

  return <Card title="Weekly Stock Listing" loading={!settings && !error}>
    {modalContext}
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 640 }}>
      {settings?.deliveryState === "XlsxTemplateUnsupported" &&
        <Alert type="warning" showIcon message="Automatic delivery blocked"
          description="The approved WhatsApp document template cannot attach Excel. You can save the weekly preferences now and export Excel manually from Vehicles." />}
      {error && <Alert type="error" showIcon message={error} />}
      {settings && <Form form={form} layout="vertical" onFinish={confirmSave} disabled={saving}>
        <Form.Item name="weekday" label="Weekly send day" rules={[{ required: true }]}>
          <Select options={weekdays} />
        </Form.Item>
        <Form.Item name="time" label="Send time (MYT)" rules={[{ required: true }]}>
          <TimePicker format="HH:mm" allowClear={false} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="recipientUserIds" label="Recipients"
          extra="Eligible recipients are Boss/Admin staff with an active My WhatsApp connection.">
          <Select mode="multiple" optionFilterProp="label" allowClear
            options={settings.eligibleRecipients.map(person => ({ value: person.userId, label: person.displayName || person.userId }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>Save preferences</Button>
      </Form>}
    </Space>
  </Card>;
}
