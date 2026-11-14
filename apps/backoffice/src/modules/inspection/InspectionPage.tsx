import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  Card,
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
import {
  createInspection,
  getInspections,
  type CreateInspectionRequest,
  type InspectionRecord,
  type InspectionStatus,
  type VehicleLookup,
  uploadVehicleDocument,
  updateInspection
} from "../../api";
import { inspectionTypeLabel, inspectionTypeOptions } from "./inspectionTypes";
import { OperationsProTable as Table } from "../shared/OperationsProTable";

type InspectionFormValues = Omit<CreateInspectionRequest, "appointmentDate" | "appointmentTime"> & {
  appointmentDate: Dayjs;
  appointmentTime?: Dayjs;
};

type InspectionPageProps = {
  vehicles: VehicleLookup[];
};

const companyOptions = [
  { value: "YSHengAuto", label: "YSHeng Auto" },
  { value: "YSHengAutomotive", label: "YSHeng Automotive" }
];

const documentUploads = [
  { category: "InspectionReceipt" as const, label: "Receipt" },
  { category: "InspectionAppointmentConfirmation" as const, label: "Appointment confirmation" },
  { category: "InspectionReport" as const, label: "Completion report" }
];

function dateValue(value: string) {
  return dayjs(value).format("DD MMM YYYY");
}

function refreshableError(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the inspection request.";
}

export function InspectionPage({ vehicles }: InspectionPageProps) {
  const [form] = Form.useForm<InspectionFormValues>();
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<InspectionRecord | null>(null);

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
      const created = await createInspection({
        ...values,
        appointmentDate: values.appointmentDate.format("YYYY-MM-DD"),
        appointmentTime: values.appointmentTime?.format("HH:mm") ?? null
      });
      form.resetFields();
      setSelected(created);
      await reload();
      message.success("Inspection booking created.");
    } catch (error) {
      message.error(refreshableError(error));
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

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title="New inspection booking" extra={<Tag color="blue">Validity: 4 months</Tag>}>
        <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} initialValues={{ company: "YSHengAuto", isLorry: false, receiptTotal: 0, allocatedAmount: 0 }}>
          <div className="formGrid formGrid--three">
            <Form.Item name="vehicleId" label="Vehicle" rules={[{ required: true, message: "Select a vehicle." }]}><Select showSearch optionFilterProp="label" options={vehicleOptions} placeholder="Select plate" /></Form.Item>
            <Form.Item name="type" label="Inspection type" rules={[{ required: true, message: "Select inspection type." }]}><Select options={inspectionTypeOptions.map(option => ({ value: option.value, label: option.label }))} /></Form.Item>
            <Form.Item name="company" label="Company" rules={[{ required: true }]}><Select options={companyOptions} /></Form.Item>
            <Form.Item name="appointmentDate" label="Appointment date" rules={[{ required: true, message: "Select appointment date." }]}><DatePicker className="fullWidth" format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="appointmentTime" label="Appointment time"><TimePicker className="fullWidth" format="HH:mm" /></Form.Item>
            <Form.Item name="bookingReference" label="Appointment confirmation reference" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="sourceReceiptNumber" label="Supplier receipt number" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="receiptTotal" label="Receipt total (RM)" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="allocatedAmount" label="Allocated amount (RM)" rules={[{ required: true }]}><InputNumber className="fullWidth" min={0} precision={2} /></Form.Item>
            <Form.Item name="isLorry" label="Vehicle type"><Select options={[{ value: false, label: "Car" }, { value: true, label: "Lorry" }]} /></Form.Item>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={1} /></Form.Item>
            <Form.Item className="formActions">
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>Create booking</Button>
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card title="Inspection records">
        <Table<InspectionRecord>
          rowKey="id"
          loading={loading}
          dataSource={records}
          scroll={{ x: 980 }}
          columns={[
            { title: "Vehicle", dataIndex: "vehicleLabel", render: (value: string, record) => value || record.plateNumber || record.vehicleId },
            { title: "Type", dataIndex: "type", render: (value: number) => inspectionTypeLabel(value) },
            { title: "Company", dataIndex: "company" },
            { title: "Appointment", dataIndex: "appointmentDate", render: (value: string) => dateValue(value) },
            { title: "Report expiry", dataIndex: "reportExpiryDate", render: (value: string) => dateValue(value) },
            { title: "Status", dataIndex: "status", render: (value: InspectionStatus) => <Tag color={value === "Completed" ? "green" : value === "Cancelled" ? "red" : "gold"}>{value}</Tag> },
            { title: "Actions", key: "actions", render: (_: unknown, record) => <Space><Button size="small" onClick={() => setSelected(record)}>View files</Button>{record.status === "Booked" && <Button size="small" type="primary" disabled={!record.documents?.some(document => document.category === "InspectionReport")} onClick={() => void setStatus(record, "Completed")} loading={saving}>Complete</Button>}</Space> }
          ]}
        />
      </Card>

      <Drawer title={selected ? `Inspection · ${selected.plateNumber ?? selected.vehicleId}` : "Inspection"} open={selected !== null} onClose={() => setSelected(null)} width={560}>
        {selected && <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Type">{inspectionTypeLabel(selected.type)}</Descriptions.Item>
            <Descriptions.Item label="Appointment">{dateValue(selected.appointmentDate)}{selected.appointmentTime ? ` · ${selected.appointmentTime}` : ""}</Descriptions.Item>
            <Descriptions.Item label="Booking reference">{selected.bookingReference}</Descriptions.Item>
            <Descriptions.Item label="Supplier invoice reference">{selected.supplierInvoiceReference}</Descriptions.Item>
            <Descriptions.Item label="Report expiry">{dateValue(selected.reportExpiryDate)}</Descriptions.Item>
          </Descriptions>
          {documentUploads.map(item => <div key={item.category}>
            <Space direction="vertical" size="small">
              <strong>{item.label}</strong>
              <Upload accept="application/pdf,image/jpeg,image/png,image/webp" maxCount={1} showUploadList={false} disabled={selected.status === "Cancelled"} customRequest={(options) => {
                void uploadEvidence(selected, item.category, options.file as File).then(() => options.onSuccess?.({}, options.file)).catch(error => options.onError?.(error));
              }}>
                <Button icon={<UploadOutlined />} disabled={selected.status === "Cancelled"}>Upload</Button>
              </Upload>
            </Space>
          </div>)}
        </Space>}
      </Drawer>
    </Space>
  );
}
