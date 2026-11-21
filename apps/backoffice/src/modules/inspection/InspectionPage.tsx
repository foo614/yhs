import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  TimePicker,
  Upload,
  message
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
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
  type VehicleLookup,
  uploadVehicleDocument,
  updateInspection
} from "../../api";
import { inspectionTypeLabel, inspectionTypeOptions } from "./inspectionTypes";
import { inspectionReceiptNumber } from "./inspectionReceipt";
import { OperationsProTable as Table } from "../shared/OperationsProTable";

type InspectionFormValues = Omit<CreateInspectionRequest, "appointmentDate" | "appointmentTime" | "sourceReceiptNumber" | "company"> & {
  specialInspection: boolean;
  appointmentDate: Dayjs;
  appointmentTime?: Dayjs;
};

type InspectionPageProps = {
  vehicles: VehicleLookup[];
  canExportAutoCount?: boolean;
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
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selected, setSelected] = useState<InspectionRecord | null>(null);
  const [exportCompany, setExportCompany] = useState<InspectionCompany>("YSHengAuto");
  const [exporting, setExporting] = useState(false);

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
      const sourceReceiptNumber = inspectionReceiptNumber(values.supplierInvoiceReference, await getInspections());
      const created = await createInspection({
        ...booking,
        company: specialInspection ? "YSHengAuto" : "YSHengAutomotive",
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

  async function exportAutoCount() {
    setExporting(true);
    try {
      const blob = await exportInspectionAutoCountWorkbook(exportCompany);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inspection-autocount-${exportCompany}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      message.success("Inspection AutoCount workbook downloaded. Review each PI sheet before saving.");
    } catch (error) {
      message.error(refreshableError(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <ModalForm<InspectionFormValues>
        form={form}
        title="Create inspection booking / 新增验车预约"
        width={760}
        layout="vertical"
        dateFormatter={false}
        open={bookingOpen}
        onOpenChange={(open) => { if (!saving) setBookingOpen(open); }}
        onFinish={submit}
        initialValues={{ specialInspection: false, isLorry: false, receiptTotal: 0, allocatedAmount: 0 }}
        modalProps={{ forceRender: true, maskClosable: false, closable: !saving, keyboard: !saving }}
        submitter={{ searchConfig: { submitText: "Create booking / 新增预约", resetText: "Cancel / 取消" }, resetButtonProps: { disabled: saving }, submitButtonProps: { loading: saving } }}
      >
          <Tag color="blue" style={{ marginBottom: 16 }}>Validity: 4 months / 有效期：4个月</Tag>
          <div className="formGrid formGrid--three">
            <Form.Item name="vehicleId" label="Vehicle / 车辆" rules={[{ required: true, message: "Select a vehicle. / 请选择车辆。" }]}><Select showSearch optionFilterProp="label" options={vehicleOptions} placeholder="Select plate / 选择车牌" /></Form.Item>
            <Form.Item name="type" label="Inspection type / 验车类型" rules={[{ required: true, message: "Select inspection type. / 请选择验车类型。" }]}><Select options={inspectionTypeOptions.map(option => ({ value: option.value, label: option.label }))} /></Form.Item>
            <Form.Item name="specialInspection" label="Special inspection / 特殊验车" valuePropName="checked" extra="Checked: YS Heng Auto. Unchecked: YS Heng Automotive Sdn Bhd. / 勾选：YS Heng Auto；未勾选：YS Heng Automotive Sdn Bhd。"><Checkbox>Special inspection / 特殊验车</Checkbox></Form.Item>
            <Form.Item name="appointmentDate" label="Appointment date / 预约日期" rules={[{ required: true, message: "Select appointment date. / 请选择预约日期。" }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="appointmentTime" label="Appointment time / 预约时间"><TimePicker className="fullWidth" format="HH:mm" /></Form.Item>
            <Form.Item name="bookingReference" label="Appointment confirmation reference / 预约确认编号" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="supplierInvoiceReference" label="Supplier Invoice No / 供应商发票编号" validateTrigger="onBlur" rules={[
              { required: true, whitespace: true, message: "Enter supplier invoice number. / 请填写供应商发票编号。" },
              { validator: async (_, value: string) => {
                if (!value?.trim()) return;
                const result = await checkInspectionInvoiceNumber(value.trim());
                if (form.getFieldValue("supplierInvoiceReference") !== value) return;
                if (!result.available) throw new Error(`Number already used. Suggested: ${result.suggestedInvoiceNumber}. Please edit and confirm. / 编号已使用，建议改为 ${result.suggestedInvoiceNumber}，请自行修改确认。`);
              } }
            ]} extra="Enter the original number or your confirmed bracket suffix, e.g. INV123 (1). Allocations share the original receipt; the suffix does not create a new receipt. / 填原编号或自行确认的括号编号，如 INV123 (1)。分配金额仍合计到原收据，括号编号不另开收据。"><Input /></Form.Item>
            <Form.Item name="receiptTotal" label="Receipt total (RM) / 收据总额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="allocatedAmount" label="Allocated amount (RM) / 本车分配金额" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="isLorry" label="Vehicle type / 车辆类型"><Select options={[{ value: false, label: "Car / 轿车" }, { value: true, label: "Lorry / 罗里" }]} /></Form.Item>
            <Form.Item name="notes" label="Notes / 备注"><Input.TextArea rows={1} /></Form.Item>
          </div>
      </ModalForm>

      <Card title="Inspection records / 验车记录">
        <Table<InspectionRecord>
          rowKey="id"
          loading={loading}
          dataSource={records}
          toolBarRender={() => [
            <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setBookingOpen(true); }}>Create booking / 新增预约</Button>,
            ...(canExportAutoCount ? [
              <Space key="export" wrap>
                <Select aria-label="Inspection AutoCount company" value={exportCompany} onChange={(value: InspectionCompany) => setExportCompany(value)} options={companyOptions} />
                <Button onClick={() => void exportAutoCount()} loading={exporting}>Export AutoCount PI / 导出验车 PI</Button>
              </Space>
            ] : [])
          ]}
          scroll={{ x: 980 }}
          columns={[
            { title: "Vehicle / 车辆", dataIndex: "vehicleLabel", render: (value: string, record) => value || record.plateNumber || record.vehicleId },
            { title: "Type / 类型", dataIndex: "type", render: (value: number) => inspectionTypeLabel(value) },
            { title: "Company / 公司", dataIndex: "company" },
            { title: "Appointment / 预约日期", dataIndex: "appointmentDate", render: (value: string) => dateValue(value) },
            { title: "Report expiry / 报告到期日", dataIndex: "reportExpiryDate", render: (value: string) => dateValue(value) },
            { title: "Status / 状态", dataIndex: "status", render: (value: InspectionStatus) => <Tag color={value === "Completed" ? "green" : value === "Cancelled" ? "red" : "gold"}>{value === "Booked" ? "Booked / 已预约" : value === "Completed" ? "Completed / 已完成" : "Cancelled / 已取消"}</Tag> },
            { title: "Action / 操作", key: "actions", render: (_: unknown, record) => <Space><Button size="small" onClick={() => setSelected(record)}>View files / 查看文件</Button>{record.status === "Booked" && <Button size="small" type="primary" disabled={!record.documents?.some(document => document.category === "InspectionReport")} onClick={() => void setStatus(record, "Completed")} loading={saving}>Complete / 完成</Button>}</Space> }
          ]}
        />
      </Card>

      <Drawer title={selected ? `Inspection / 验车 · ${selected.plateNumber ?? selected.vehicleId}` : "Inspection / 验车"} open={selected !== null} onClose={() => setSelected(null)} width={560}>
        {selected && <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Type / 类型">{inspectionTypeLabel(selected.type)}</Descriptions.Item>
            <Descriptions.Item label="Appointment / 预约日期">{dateValue(selected.appointmentDate)}{selected.appointmentTime ? ` · ${selected.appointmentTime}` : ""}</Descriptions.Item>
            <Descriptions.Item label="Booking reference / 预约编号">{selected.bookingReference}</Descriptions.Item>
            <Descriptions.Item label="Supplier invoice reference / 供应商发票编号">{selected.supplierInvoiceReference}</Descriptions.Item>
            <Descriptions.Item label="Report expiry / 报告到期日">{dateValue(selected.reportExpiryDate)}</Descriptions.Item>
          </Descriptions>
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
      </Drawer>
    </Space>
  );
}
