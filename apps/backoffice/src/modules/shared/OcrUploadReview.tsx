import { useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Form, Input, InputNumber, Progress, Select, Space, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import {
  getOcrJob,
  humanizeApiError,
  reviewOcrJob,
  startOcrJob,
  uploadVehicleDocumentWithProgress,
  type DocumentCategory,
  type DocumentUploadOwner,
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

export type OcrFieldConflict = {
  name: string;
  label: string;
  existingValue: string | number;
  extractedValue: string | number;
};

export const ocrImageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export function isOcrImageMimeType(mimeType: string) {
  return ocrImageMimeTypes.includes(mimeType as (typeof ocrImageMimeTypes)[number]);
}

export function ocrFieldConflicts(fields: OcrFieldConfig[], existingValues: OcrReviewValues | undefined, extractedValues: OcrReviewValues): OcrFieldConflict[] {
  if (!existingValues) return [];

  return fields.flatMap((field) => {
    const existingValue = existingValues[field.name];
    const extractedValue = extractedValues[field.name];
    if (existingValue === undefined || extractedValue === undefined || String(existingValue).trim() === "" || String(extractedValue).trim() === "" || valuesMatch(existingValue, extractedValue)) return [];
    return [{ name: field.name, label: field.label, existingValue, extractedValue }];
  });
}

export function resolveOcrReviewValues(
  values: OcrReviewValues,
  conflicts: OcrFieldConflict[],
  choices: Record<string, "existing" | "ocr">
): OcrReviewValues {
  const resolved = { ...values };
  for (const conflict of conflicts) {
    if (choices[conflict.name] !== "ocr") resolved[conflict.name] = conflict.existingValue;
  }
  return resolved;
}

export function OcrUploadReview({
  vehicleId,
  category,
  buttonLabel,
  applyLabel = "Apply to Form",
  disabled,
  fields,
  existingValues,
  uploadOwner,
  onUploaded,
  onApply
}: {
  vehicleId?: string;
  category: DocumentCategory;
  buttonLabel: string;
  applyLabel?: string;
  disabled?: boolean;
  fields: OcrFieldConfig[];
  existingValues?: OcrReviewValues;
  uploadOwner?: DocumentUploadOwner;
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
  const [conflictChoices, setConflictChoices] = useState<Record<string, "existing" | "ocr">>({});
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
      const document = await uploadVehicleDocumentWithProgress(vehicleId, file, category, setUploadProgress, uploadOwner);
      onUploaded?.();
      const loadedJob = await analyzeUploadedDocument(document.id, async (progress) => {
        setAnalyzeProgress(progress);
      });
      setJob(loadedJob);
      setLineItems(loadedJob.result?.lineItems ?? []);
      const initialValues = initialValuesFromJob(loadedJob, fields);
      form.setFieldsValue(initialValues);
      setConflictChoices(Object.fromEntries(ocrFieldConflicts(fields, existingValues, initialValues).map((conflict) => [conflict.name, "existing"])));
      setReviewOpen(true);
      option.onSuccess?.({ ok: true });
    } catch (error) {
      option.onError?.(error instanceof Error ? error : new Error("OCR upload failed."));
      message.error(humanizeApiError(error, "OCR upload failed. Please check the file and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function applyResult() {
    if (!job) return;
    const values = await form.validateFields();
    const conflicts = ocrFieldConflicts(fields, existingValues, values);
    const resolvedValues = resolveOcrReviewValues(values, conflicts, conflictChoices);
    const localJob: OcrJob = job.result
      ? { ...job, result: { ...job.result, lineItems } }
      : job;
    const reviewNotes = conflicts.length === 0
      ? "Accepted from OCR review drawer"
      : `Accepted from OCR review drawer; ${conflicts.map((conflict) => `${conflict.name}: ${conflictChoices[conflict.name] === "ocr" ? "use-ocr" : "keep-existing"}`).join(", ")}`;
    const reviewedJob = await reviewOcrJob(job.id, "Accepted", reviewNotes);
    const mergedJob: OcrJob = reviewedJob.result && localJob.result
      ? { ...reviewedJob, result: { ...reviewedJob.result, lineItems } }
      : reviewedJob;
    setJob(mergedJob);
    onApply(resolvedValues, mergedJob);
    setReviewOpen(false);
    message.success("OCR values accepted. Confirm the target workflow result before continuing.");
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
        <Upload
          accept={ocrImageMimeTypes.join(",")}
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            if (isOcrImageMimeType(file.type)) return true;
            message.error("OCR currently accepts JPG, PNG, or WebP images. Upload PDFs through Document Upload instead.");
            return Upload.LIST_IGNORE;
          }}
          customRequest={(option) => void handleUpload(option)}
        >
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
          message="OCR suggestions are editable. Differences from an existing record default to keeping the current value until you explicitly choose the OCR value."
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
            {ocrFieldConflicts(fields, existingValues, form.getFieldsValue()).length > 0 ? (
              <Form.Item label="Conflicting fields">
                <Space direction="vertical" size={8} className="fullWidth">
                  {ocrFieldConflicts(fields, existingValues, form.getFieldsValue()).map((conflict) => (
                    <Alert
                      key={conflict.name}
                      type="warning"
                      showIcon
                      message={`${conflict.label}: existing ${conflict.existingValue} / OCR ${conflict.extractedValue}`}
                      description={(
                        <Select
                          aria-label={`${conflict.label} conflict choice`}
                          value={conflictChoices[conflict.name] ?? "existing"}
                          options={[
                            { value: "existing", label: "Keep current value" },
                            { value: "ocr", label: "Use reviewed OCR value" }
                          ]}
                          onChange={(value) => setConflictChoices((current) => ({ ...current, [conflict.name]: value }))}
                        />
                      )}
                    />
                  ))}
                </Space>
              </Form.Item>
            ) : null}
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

function valuesMatch(left: string | number, right: string | number) {
  return String(left).trim().toLocaleLowerCase() === String(right).trim().toLocaleLowerCase();
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
