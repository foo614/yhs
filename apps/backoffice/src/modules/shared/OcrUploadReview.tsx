import { useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Form, Input, InputNumber, Progress, Select, Space, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import {
  getOcrJob,
  reviewOcrJob,
  startOcrJob,
  uploadVehicleDocumentWithProgress,
  type DocumentCategory,
  type OcrJob,
  type OcrLineItem
} from "../../api";

export type OcrFieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
};

export type OcrReviewValues = Record<string, string | number | undefined>;

export function OcrUploadReview({
  vehicleId,
  category,
  buttonLabel,
  applyLabel = "Apply to Form",
  disabled,
  fields,
  onUploaded,
  onApply
}: {
  vehicleId?: string;
  category: DocumentCategory;
  buttonLabel: string;
  applyLabel?: string;
  disabled?: boolean;
  fields: OcrFieldConfig[];
  onUploaded?: () => void;
  onApply: (values: OcrReviewValues, job: OcrJob) => void;
}) {
  const [form] = Form.useForm<OcrReviewValues>();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [job, setJob] = useState<OcrJob | null>(null);
  const [lineItems, setLineItems] = useState<OcrLineItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lineItemColumns = ocrLineItemColumns(updateLineItem);

  async function handleUpload(option: UploadRequestOption) {
    if (!vehicleId) {
      option.onError?.(new Error("Select a vehicle first."));
      return;
    }

    try {
      setBusy(true);
      setJob(null);
      setLineItems([]);
      setUploadProgress(0);
      setAnalyzeProgress(0);
      const file = option.file as File;
      const document = await uploadVehicleDocumentWithProgress(vehicleId, file, category, setUploadProgress);
      onUploaded?.();
      const loadedJob = await analyzeUploadedDocument(document.id, async (progress) => {
        setAnalyzeProgress(progress);
      });
      setJob(loadedJob);
      setLineItems(loadedJob.result?.lineItems ?? []);
      form.setFieldsValue(initialValuesFromJob(loadedJob, fields));
      setReviewOpen(true);
      option.onSuccess?.({ ok: true });
    } catch (error) {
      option.onError?.(error instanceof Error ? error : new Error("OCR upload failed."));
      message.error(error instanceof Error ? error.message : "OCR upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyResult() {
    if (!job) return;
    const values = await form.validateFields();
    const localJob: OcrJob = job.result
      ? { ...job, result: { ...job.result, lineItems } }
      : job;
    const reviewedJob = await reviewOcrJob(job.id, "Accepted", "Accepted from OCR review drawer");
    const mergedJob: OcrJob = reviewedJob.result && localJob.result
      ? { ...reviewedJob, result: { ...reviewedJob.result, lineItems } }
      : reviewedJob;
    setJob(mergedJob);
    onApply(values, mergedJob);
    setReviewOpen(false);
    message.success("OCR values accepted. Review and save the form when ready.");
  }

  async function rejectResult() {
    if (!job) return;
    const reviewedJob = await reviewOcrJob(job.id, "Rejected", "Rejected from OCR review drawer");
    setJob(reviewedJob);
    setReviewOpen(false);
    message.warning("OCR values rejected. The uploaded document remains available for audit.");
  }

  return (
    <>
      <Space direction="vertical" size={8} className="fullWidth">
        <Upload maxCount={1} showUploadList={false} customRequest={(option) => void handleUpload(option)}>
          <Button icon={<UploadOutlined />} disabled={disabled || busy}>{buttonLabel}</Button>
        </Upload>
        {(busy || uploadProgress > 0 || analyzeProgress > 0) && (
          <div className="ocrProgressStack">
            <Typography.Text type="secondary">Upload</Typography.Text>
            <Progress size="small" percent={uploadProgress} status={uploadProgress === 100 ? "success" : "active"} />
            <Typography.Text type="secondary">OCR analysis</Typography.Text>
            <Progress size="small" percent={analyzeProgress} status={analyzeProgress === 100 ? "success" : "active"} />
          </div>
        )}
      </Space>
      <Drawer
        title="OCR Review"
        width={560}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        className="recordEditDrawer"
        extra={<Space><Button danger onClick={() => void rejectResult()} disabled={!job}>Reject</Button><Button type="primary" disabled={!job?.result} onClick={() => void applyResult()}>{applyLabel}</Button></Space>}
      >
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert
            type="info"
            showIcon
            message="OCR suggestions are editable. They will not be saved until you apply them and submit the normal form."
          />
          {job?.warnings?.length ? (
            <Alert type="warning" showIcon message={job.warnings.join(" ")} />
          ) : null}
          <Space wrap>
            <Tag color="blue">{job?.category}</Tag>
            <Tag color={job?.status === "NeedsReview" ? "green" : "orange"}>{job?.status}</Tag>
            <Tag color={job?.reviewDecision === "Accepted" ? "green" : job?.reviewDecision === "Rejected" ? "red" : "gold"}>{job?.reviewDecision ?? "Pending"}</Tag>
            <Tag>Confidence {Math.round((job?.result?.confidence ?? 0) * 100)}%</Tag>
          </Space>
          <Form form={form} layout="vertical" className="drawerForm">
            {fields.map((field) => (
              <Form.Item key={field.name} name={field.name} label={fieldLabel(field, job)}>
                {field.type === "number" ? (
                  <InputNumber className="fullWidth" min={0} />
                ) : field.type === "select" ? (
                  <Select showSearch optionFilterProp="label" options={field.options ?? []} />
                ) : (
                  <Input />
                )}
              </Form.Item>
            ))}
            <Form.Item label="Line Items">
              <Table
                size="small"
                rowKey={(_, index) => String(index)}
                columns={lineItemColumns}
                dataSource={lineItems}
                pagination={false}
                scroll={{ x: 760 }}
                locale={{ emptyText: "No line item descriptions detected." }}
              />
            </Form.Item>
            <Form.Item label="Raw OCR Text">
              <Input.TextArea rows={5} value={job?.result?.rawText ?? ""} readOnly />
            </Form.Item>
          </Form>
          <Typography.Text type="secondary">Review the values carefully before saving the target record.</Typography.Text>
        </Space>
      </Drawer>
    </>
  );

  function updateLineItem(index: number, field: keyof OcrLineItem, value: string | number | null) {
    setLineItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value === null ? undefined : String(value) } : item
    )));
  }
}

async function analyzeUploadedDocument(
  documentId: string,
  setProgress: (progress: number) => Promise<void>
) {
  await setProgress(20);
  const createdJob = await startOcrJob(documentId);
  await setProgress(70);
  const loadedJob = await getOcrJob(createdJob.id);
  await setProgress(loadedJob.progress || 100);
  return loadedJob;
}

function initialValuesFromJob(job: OcrJob, fields: OcrFieldConfig[]) {
  const extracted = job.result?.fields ?? {};
  const values: OcrReviewValues = {};
  for (const field of fields) {
    const raw = extracted[field.name];
    if (field.type === "number") {
      values[field.name] = raw === undefined || raw === null || raw === "" ? undefined : Number(raw);
    } else {
      values[field.name] = raw ?? undefined;
    }
  }
  return values;
}

function fieldLabel(field: OcrFieldConfig, job: OcrJob | null) {
  const confidence = job?.result?.fieldConfidence?.[field.name];
  if (confidence === undefined) return field.label;
  return (
    <Space size={6}>
      <span>{field.label}</span>
      <Tag color={confidence >= 0.75 ? "green" : "orange"}>{Math.round(confidence * 100)}%</Tag>
    </Space>
  );
}

function ocrLineItemColumns(
  updateLineItem: (index: number, field: keyof OcrLineItem, value: string | number | null) => void
): ColumnsType<OcrLineItem> {
  return [
    {
      title: "Description",
      dataIndex: "description",
      width: 260,
      render: (value: string, _record, index) => (
        <Input value={value} onChange={(event) => updateLineItem(index, "description", event.target.value)} />
      )
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      width: 90,
      render: (value: string | null | undefined, _record, index) => (
        <Input value={value ?? ""} onChange={(event) => updateLineItem(index, "quantity", event.target.value)} />
      )
    },
    {
      title: "Unit",
      dataIndex: "unitPrice",
      width: 110,
      render: (value: string | null | undefined, _record, index) => (
        <Input value={value ?? ""} onChange={(event) => updateLineItem(index, "unitPrice", event.target.value)} />
      )
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 120,
      render: (value: string | null | undefined, _record, index) => (
        <Input value={value ?? ""} onChange={(event) => updateLineItem(index, "amount", event.target.value)} />
      )
    },
    {
      title: "Conf.",
      dataIndex: "confidence",
      width: 90,
      render: (value?: number) => value === undefined ? "-" : `${Math.round(value * 100)}%`
    },
    {
      title: "Raw Line",
      dataIndex: "rawText",
      width: 220,
      render: (value?: string) => <Typography.Text type="secondary">{value ?? "-"}</Typography.Text>
    }
  ];
}
