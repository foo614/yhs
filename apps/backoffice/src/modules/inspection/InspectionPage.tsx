import { dialogWidths } from "../shared/dialogSizing";
import { BusinessDialog } from "../shared/BusinessDialog";
import { FieldHelp, fieldTooltip } from "../shared/FieldHelp";
import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Tag,
  TimePicker,
  Upload,
  message
} from "antd";
import { InfoCircleOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { ModalForm } from "@ant-design/pro-components";
import {
  createInspection,
  checkInspectionInvoiceNumber,
  exportInspectionAutoCountWorkbook,
  getInspections,
  type CreateInspectionRequest,
  type InspectionCompany,
  type InspectionRecord,
  type InspectionStatus,
  type UpdateInspectionPaperworkRequest,
  type VehicleLookup,
  uploadVehicleDocument,
  updateInspection,
  updateInspectionPaperwork
} from "../../api";
import { inspectionTypeLabel, inspectionTypeOptions } from "./inspectionTypes";
import { inspectionReceiptNumber } from "./inspectionReceipt";
import { OperationsProTable as Table } from "../shared/OperationsProTable";

type InspectionFormValues = Omit<CreateInspectionRequest, "appointmentDate" | "appointmentTime" | "receiptDate" | "sourceReceiptNumber" | "company"> & {
  specialInspection: boolean;
  appointmentDate: Dayjs;
  appointmentTime?: Dayjs;
  receiptDate?: Dayjs;
};

type PaperworkFormValues = Omit<UpdateInspectionPaperworkRequest, "receiptDate"> & { receiptDate?: Dayjs };

type InspectionPageProps = {
  vehicles: VehicleLookup[];
  canExportAutoCount?: boolean;
};

type ExportFormValues = {
  company: InspectionCompany;
  period: "month" | "range";
  month: Dayjs;
  range?: [Dayjs, Dayjs];
};

const companyOptions: { value: InspectionCompany; label: string }[] = [
  { value: "YSHengAuto", label: "YS Heng Auto" },
  { value: "YSHengAutomotive", label: "YS Heng Automotive Sdn Bhd" }
];

const documentUploads = [
  { category: "InspectionReceipt" as const, label: "Receipt / 收据" },
  { category: "InspectionAppointmentConfirmation" as const, label: "Appointment confirmation / 预约确认单" },
  { category: "InspectionReport" as const, label: "Completion report / 验车报告" }
];

function dateValue(value: string) {
  return dayjs(value).format("DD MMM YYYY");
}

function refreshableError(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the inspection request.";
}

export function InspectionPage({ vehicles, canExportAutoCount = false }: InspectionPageProps) {
  const [form] = Form.useForm<InspectionFormValues>();
  const [exportForm] = Form.useForm<ExportFormValues>();
  const specialInspection = Form.useWatch("specialInspection", form);
  const exportPeriod = Form.useWatch("period", exportForm);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selected, setSelected] = useState<InspectionRecord | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportInitialValues = useMemo<ExportFormValues>(() => ({ company: "YSHengAuto", period: "month", month: dayjs() }), []);

  const vehicleOptions = useMemo(() => vehicles.map(vehicle => ({
    value: vehicle.id,
    label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}`.trim()
  })), [vehicles]);

  async function reload() {
    setLoading(true);
    try {
      setRecords(await getInspections());
    } catch (error) {
      message.error(refreshableError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function submit(values: InspectionFormValues) {
    setSaving(true);
    try {
      const { specialInspection, ...booking } = values;
      const supplierInvoiceReference = values.supplierInvoiceReference?.trim() ?? "";
      const sourceReceiptNumber = supplierInvoiceReference
        ? inspectionReceiptNumber(supplierInvoiceReference, await getInspections())
        : "";
      const created = await createInspection({
        ...booking,
        bookingReference: values.bookingReference?.trim() ?? "",
        supplierInvoiceReference,
        receiptDate: values.receiptDate?.format("YYYY-MM-DD") ?? null,
        company: specialInspection ? "YSHengAuto" : "YSHengAutomotive",
        type: specialInspection ? values.type : null,
        sourceReceiptNumber,
        appointmentDate: values.appointmentDate.format("YYYY-MM-DD"),
        appointmentTime: values.appointmentTime?.format("HH:mm") ?? null
      });
      form.resetFields();
      setBookingOpen(false);
      setSelected(created);
      await reload();
      message.success("Inspection booking created.");
      return true;
    } catch (error) {
      message.error(refreshableError(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(record: InspectionRecord, status: InspectionStatus) {
    setSaving(true);
    try {
      const updated = await updateInspection(record.id, {
        type: record.type,
        company: record.company,
        status,
        isLorry: record.isLorry,
        appointmentDate: record.appointmentDate,
        appointmentTime: record.appointmentTime ?? null,
        bookingReference: record.bookingReference,
        receiptTotal: record.receiptTotal,
        allocatedAmount: record.allocatedAmount,
        notes: record.notes ?? null
      });
      setSelected(updated);
      await reload();
      message.success(status === "Completed" ? "Inspection marked completed." : "Inspection updated.");
    } catch (error) {
      message.error(refreshableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function savePaperwork(values: PaperworkFormValues) {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateInspectionPaperwork(selected.id, {
        ...values,
        receiptDate: values.receiptDate?.format("YYYY-MM-DD") ?? null,
        bookingReference: values.bookingReference?.trim() ?? "",
        supplierInvoiceReference: values.supplierInvoiceReference?.trim() ?? ""
      });
      setSelected({ ...selected, ...updated });
      await reload();
      message.success("Inspection paperwork saved. / 验车资料已保存。");
    } catch (error) {
      message.error(refreshableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence(record: InspectionRecord, category: typeof documentUploads[number]["category"], file: File) {
    try {
      await uploadVehicleDocument(record.vehicleId, file, category, { inspectionId: record.id, ownershipType: "Vehicle" });
      await reload();
      const refreshed = (await getInspections()).find(item => item.id === record.id);
      if (refreshed) setSelected(refreshed);
      message.success("Inspection document uploaded.");
    } catch (error) {
      message.error(refreshableError(error));
      throw error;
    }
  }

  async function exportAutoCount(values: ExportFormValues) {
    setExporting(true);
    try {
      const from = values.period === "month" ? values.month.startOf("month") : values.range![0];
      const to = values.period === "month" ? values.month.endOf("month") : values.range![1];
      const blob = await exportInspectionAutoCountWorkbook(values.company, from.format("YYYY-MM-DD"), to.format("YYYY-MM-DD"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inspection-autocount-${values.company}-${from.format("YYYY-MM-DD")}-${to.format("YYYY-MM-DD")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      message.success("Inspection AutoCount workbook downloaded. Review each PI sheet before saving.");
      setExportOpen(false);
      return true;
    } catch (error) {
      message.error(refreshableError(error));
      return false;
    } finally {
      setExporting(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <ModalForm<InspectionFormValues>
        form={form}
        title={<span>Create inspection booking / 新增验车预约 <FieldHelp label="Inspection validity guidance / 验车有效期说明">Validity: 4 months / 有效期：4个月</FieldHelp></span>}
        width={dialogWidths.formWide}
        layout="vertical"
        dateFormatter={false}
        open={bookingOpen}
        onOpenChange={(open) => { if (!saving) setBookingOpen(open); }}
        onFinish={submit}
        initialValues={{ specialInspection: false, isLorry: false, receiptTotal: 0, allocatedAmount: 0 }}
        modalProps={{ centered: true, forceRender: true, maskClosable: false, closable: !saving, keyboard: !saving }}
        submitter={{ searchConfig: { submitText: "Create booking / 新增预约", resetText: "Cancel / 取消" }, resetButtonProps: { disabled: saving }, submitButtonProps: { loading: saving } }}
      >
          <div className="formGrid formGrid--three">
            <Form.Item name="vehicleId" label="Vehicle / 车辆" rules={[{ required: true, message: "Select a vehicle. / 请选择车辆。" }]}><Select showSearch optionFilterProp="label" options={vehicleOptions} placeholder="Select plate / 选择车牌" /></Form.Item>
            {specialInspection && <Form.Item name="type" label="Inspection type / 验车类型" preserve={false} rules={[{ required: true, message: "Select inspection type. / 请选择验车类型。" }]}><Select options={inspectionTypeOptions.map(option => ({ value: option.value, label: option.label }))} /></Form.Item>}
            <Form.Item name="specialInspection" valuePropName="checked" style={{ gridColumn: "1 / -1" }}><Checkbox onChange={() => form.setFieldValue("type", undefined)}>Special inspection</Checkbox></Form.Item>
            <Form.Item name="appointmentDate" label="Appointment date / 预约日期" rules={[{ required: true, message: "Select appointment date. / 请选择预约日期。" }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="appointmentTime" label="Appointment time / 预约时间"><TimePicker className="fullWidth" format="HH:mm" /></Form.Item>
            <Form.Item name="bookingReference" label="Appointment confirmation reference / 预约确认编号" tooltip={fieldTooltip("Optional now; add it in View files when available. / 可稍后在查看文件中补填。", "Appointment confirmation reference guidance / 预约确认编号说明")} style={{ gridColumn: "1 / -1" }}><Input /></Form.Item>
            <Form.Item name="supplierInvoiceReference" label="Supplier Invoice No / 供应商发票编号" tooltip={{
              title: "Enter the original number or your confirmed bracket suffix, e.g. INV123 (1). Allocations share the original receipt; the suffix does not create a new receipt. / 填原编号或自行确认的括号编号，如 INV123 (1)。分配金额仍合计到原收据，括号编号不另开收据。",
              trigger: ["hover", "focus", "click"],
              icon: <Button type="text" size="small" aria-label="Supplier invoice number guidance" icon={<InfoCircleOutlined />} />
            }} validateTrigger="onBlur" rules={[
              { validator: async (_, value: string) => {
                if (!value?.trim()) return;
                const result = await checkInspectionInvoiceNumber(value.trim());
                if (form.getFieldValue("supplierInvoiceReference") !== value) return;
                if (!result.available) throw new Error(`Number already used. Suggested: ${result.suggestedInvoiceNumber}. Please edit and confirm. / 编号已使用，建议改为 ${result.suggestedInvoiceNumber}，请自行修改确认。`);
              } }
            ]}><Input /></Form.Item>
            <Form.Item name="receiptDate" label="Receipt date / 收据日期" tooltip={fieldTooltip("Actual inspection date; leave blank until known. / 实际验车日期，未确定时可留空。", "Receipt date guidance / 收据日期说明")}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="isLorry" label="Vehicle type / 车辆类型"><Select options={[{ value: false, label: "Car / 轿车" }, { value: true, label: "Lorry / 罗里" }]} /></Form.Item>
            <Form.Item name="receiptTotal" label="Receipt total (RM) / 收据总额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="allocatedAmount" label="Allocated amount (RM) / 本车分配金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注" style={{ gridColumn: "1 / -1" }}><Input.TextArea rows={1} /></Form.Item>
          </div>
      </ModalForm>

      <ModalForm<ExportFormValues>
        form={exportForm}
        title="Export AutoCount PI / 导出验车 PI"
        width={dialogWidths.form}
        layout="vertical"
        dateFormatter={false}
        open={exportOpen}
        onOpenChange={(open) => { if (!exporting) setExportOpen(open); }}
        onFinish={exportAutoCount}
        initialValues={exportInitialValues}
        modalProps={{ centered: true, forceRender: true, maskClosable: false, closable: !exporting, keyboard: !exporting }}
        submitter={{ searchConfig: { submitText: "Confirm export / 确认导出", resetText: "Cancel / 取消" }, resetButtonProps: { disabled: exporting }, submitButtonProps: { loading: exporting } }}
      >
        <Form.Item name="company" label="Company / 公司" rules={[{ required: true }]}><Select options={companyOptions} /></Form.Item>
        <Form.Item name="period" label="Period / 期间" tooltip={fieldTooltip(<><p>Receipt date / 收据日期：actual inspection date, including both start and end dates. / 按实际验车日期，包含起止日期。</p><p>Records without a receipt date appear in the review sheets only and cannot be pasted as a PI. / 未填收据日期的记录仅列于核对表，不生成可粘贴 PI。</p></>, "Export period guidance / 导出期间说明")}><Radio.Group options={[{ value: "month", label: "Month / 月份" }, { value: "range", label: "Custom dates / 自选日期" }]} /></Form.Item>
        {exportPeriod !== "range"
          ? <Form.Item name="month" label="Month and year / 月份及年份" rules={[{ required: true }]}><DatePicker picker="month" format="MMM YYYY" className="fullWidth" /></Form.Item>
          : <Form.Item name="range" label="Date range / 日期范围" rules={[{ required: true }]}><DatePicker.RangePicker format="DD MMM YYYY" className="fullWidth" /></Form.Item>}
      </ModalForm>

      <Card title="Inspection records / 验车记录">
        <Table<InspectionRecord>
          rowKey="id"
          loading={loading}
          dataSource={records}
          toolBarRender={() => [
            <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setBookingOpen(true); }}>Create booking / 新增预约</Button>,
            ...(canExportAutoCount ? [
              <Button key="export" onClick={() => { exportForm.resetFields(); setExportOpen(true); }}>Export AutoCount PI / 导出验车 PI</Button>
            ] : [])
          ]}
          scroll={{ x: 980 }}
          columns={[
            { title: "Vehicle / 车辆", dataIndex: "vehicleLabel", render: (value: string, record) => value || record.plateNumber || record.vehicleId },
            { title: "Type / 类型", dataIndex: "type", render: (_, record) => inspectionTypeLabel(record.type) },
            { title: "Appointment / 预约日期", dataIndex: "appointmentDate", render: (value: string) => dateValue(value) },
            { title: "Report expiry / 报告到期日", dataIndex: "reportExpiryDate", render: (value: string) => dateValue(value) },
            { title: "Status / 状态", dataIndex: "status", render: (value: InspectionStatus) => <Tag color={value === "Completed" ? "green" : value === "Cancelled" ? "red" : "gold"}>{value === "Booked" ? "Booked / 已预约" : value === "Completed" ? "Completed / 已完成" : "Cancelled / 已取消"}</Tag> },
            { title: "Action / 操作", key: "actions", render: (_: unknown, record) => <Space><Button size="small" onClick={() => setSelected(record)}>View files / 查看文件</Button>{record.status === "Booked" && <Button size="small" type="primary" disabled={!record.documents?.some(document => document.category === "InspectionReport")} onClick={() => void setStatus(record, "Completed")} loading={saving}>Complete / 完成</Button>}</Space> }
          ]}
        />
      </Card>

      <BusinessDialog title={selected ? `Inspection / 验车 · ${selected.plateNumber ?? selected.vehicleId}` : "Inspection / 验车"} open={selected !== null} onClose={() => setSelected(null)} width={dialogWidths.formWide}>
        {selected && <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Type / 类型">{inspectionTypeLabel(selected.type)}</Descriptions.Item>
            <Descriptions.Item label="Appointment / 预约日期">{dateValue(selected.appointmentDate)}{selected.appointmentTime ? ` · ${selected.appointmentTime}` : ""}</Descriptions.Item>
            <Descriptions.Item label="Report expiry / 报告到期日">{dateValue(selected.reportExpiryDate)}</Descriptions.Item>
          </Descriptions>
          <Form<PaperworkFormValues> key={selected.id} layout="vertical" initialValues={{ ...selected, receiptDate: selected.receiptDate ? dayjs(selected.receiptDate) : undefined }} onFinish={savePaperwork} disabled={saving || selected.status === "Cancelled"}>
            <Form.Item name="bookingReference" label="Appointment confirmation reference / 预约确认编号" tooltip={fieldTooltip("Numbers can be added later. Complete the references and amounts before AutoCount PI export. / 编号可稍后补填，导出 PI 前请补齐编号和金额。", "Paperwork guidance / 资料说明")}><Input /></Form.Item>
            <Form.Item name="supplierInvoiceReference" label="Supplier Invoice No / 供应商发票编号" validateTrigger="onBlur" rules={[{
              validator: async (_, value: string) => {
                if (!value?.trim() || value.trim().toUpperCase() === selected.supplierInvoiceReference.trim().toUpperCase()) return;
                const result = await checkInspectionInvoiceNumber(value.trim());
                if (!result.available) throw new Error(`Number already used. Suggested: ${result.suggestedInvoiceNumber}. Please edit and confirm. / 编号已使用，建议改为 ${result.suggestedInvoiceNumber}，请自行修改确认。`);
              }
            }]}><Input /></Form.Item>
            <Form.Item name="receiptDate" label="Receipt date / 收据日期" tooltip={fieldTooltip("Actual inspection date; required for dated PI export. / 实际验车日期，按日期导出 PI 前须补填。", "Receipt date guidance / 收据日期说明")}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="receiptTotal" label="Receipt total (RM) / 收据总额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="allocatedAmount" label="Allocated amount (RM) / 本车分配金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Button htmlType="submit" type="primary" loading={saving}>Save paperwork / 保存资料</Button>
          </Form>
          {documentUploads.map(item => <div key={item.category}>
            <Space direction="vertical" size="small">
              <strong>{item.label}</strong>
              <Upload accept="application/pdf,image/jpeg,image/png,image/webp" maxCount={1} showUploadList={false} disabled={selected.status === "Cancelled"} customRequest={(options) => {
                void uploadEvidence(selected, item.category, options.file as File).then(() => options.onSuccess?.({}, options.file)).catch(error => options.onError?.(error));
              }}>
                <Button icon={<UploadOutlined />} disabled={selected.status === "Cancelled"}>Upload / 上传</Button>
              </Upload>
            </Space>
          </div>)}
        </Space>}
      </BusinessDialog>
    </Space>
  );
}
