import { useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Drawer, Form, Input, InputNumber, Progress, Radio, Select, Space, Table, Tag, Typography, Upload, message } from "antd";
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
  compact = false,
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
  compact?: boolean;
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
  const reviewConflicts = job ? ocrFieldConflicts(fields, existingValues, initialValuesFromJob(job, fields)) : [];

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
        {!compact && (
          <div className="ocrUploadGuide">
            <span className="ocrStepLabel">Step 1 of 3</span>
            <div>
              <Typography.Text strong>Choose a clear document photo</Typography.Text>
              <Typography.Text type="secondary">JPG, PNG, or WebP. Use Document Upload for PDFs.</Typography.Text>
            </div>
          </div>
        )}
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
          <Button type={compact ? "primary" : "default"} size={compact ? "small" : "middle"} icon={<UploadOutlined />} disabled={disabled || busy}>{buttonLabel}</Button>
        </Upload>
        {(busy || uploadProgress > 0 || analyzeProgress > 0) && (
          <div className="ocrProgressStack">
            <Typography.Text type="secondary">Uploading photo</Typography.Text>
            <Progress size="small" percent={uploadProgress} status={uploadProgress === 100 ? "success" : "active"} />
            <Typography.Text type="secondary">Reading document details</Typography.Text>
            <Progress size="small" percent={analyzeProgress} status={analyzeProgress === 100 ? "success" : "active"} />
          </div>
        )}
      </Space>
      <Drawer
        title={(
          <div className="ocrReviewDrawerTitle">
            <span className="ocrStepLabel">Step 2 of 3</span>
            <span>Check the details we found</span>
          </div>
        )}
        width={560}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        className="recordEditDrawer ocrReviewDrawer"
        footer={(
          <div className="ocrReviewActions">
            <Button danger onClick={() => void rejectResult()} disabled={!job}>Don't use this scan</Button>
            <Button type="primary" disabled={!job?.result} onClick={() => void applyResult()}>{applyLabel}</Button>
          </div>
        )}
      >
        <Space direction="vertical" size={16} className="fullWidth">
          <Alert
            type="info"
            showIcon
            message="Nothing has been saved yet."
            description="Check the details below and correct anything that looks wrong. If a detail is already on file, we keep the current value unless you choose the one from this document."
          />
          {job?.warnings?.length ? (
            <Alert type="warning" showIcon message={job.warnings.join(" ")} />
          ) : null}
          <Space wrap className="ocrReviewSummary">
            <Tag color="blue">{documentCategoryLabel(job?.category)}</Tag>
            <Tag color="green">Ready for your check</Tag>
            <Tag color={confidenceColor(job?.result?.confidence)}>Reading quality: {confidenceLabel(job?.result?.confidence)}</Tag>
          </Space>
          <Form form={form} layout="vertical" className="drawerForm">
            {reviewConflicts.length > 0 ? (
              <Form.Item label="Information already on file" extra="Choose which value to keep for each difference.">
                <Space direction="vertical" size={8} className="fullWidth">
                  {reviewConflicts.map((conflict) => (
                    <Alert
                      key={conflict.name}
                      type="warning"
                      showIcon
                      message={conflict.label}
                      description={(
                        <Radio.Group
                          aria-label={`${conflict.label} conflict choice`}
                          value={conflictChoices[conflict.name] ?? "existing"}
                          onChange={(event) => setConflictChoices((current) => ({ ...current, [conflict.name]: event.target.value as "existing" | "ocr" }))}
                        >
                          <Space direction="vertical" size={4}>
                            <Radio value="existing">Keep current: <strong>{String(conflict.existingValue)}</strong></Radio>
                            <Radio value="ocr">Use from this document: <strong>{String(conflict.extractedValue)}</strong></Radio>
                          </Space>
                        </Radio.Group>
                      )}
                    />
                  ))}
                </Space>
              </Form.Item>
            ) : null}
            <div className="ocrReviewSectionHeading">
              <Typography.Text strong>Details from this document</Typography.Text>
              <Typography.Text type="secondary">Edit any value before you continue.</Typography.Text>
            </div>
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
            {lineItems.length > 0 ? (
              <Form.Item label="Items found on this document" extra="Check descriptions and amounts before using them.">
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
            ) : null}
          </Form>
          <Collapse
            size="small"
            items={[{
              key: "raw-text",
              label: "Technical details (only if you need to check the scan)",
              children: <Input.TextArea rows={5} value={job?.result?.rawText ?? ""} readOnly aria-label="Original text read from the document" />
            }]}
          />
          <Typography.Text type="secondary">Step 3: choose “{applyLabel}” when the details look right.</Typography.Text>
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
      <Tag color={confidenceColor(confidence)}>{confidence >= 0.75 ? "Clear" : "Check carefully"}</Tag>
    </Space>
  );
}

function confidenceColor(confidence: number | undefined) {
  if (confidence === undefined || confidence < 0.5) return "red";
  return confidence >= 0.75 ? "green" : "orange";
}

function confidenceLabel(confidence: number | undefined) {
  if (confidence === undefined || confidence < 0.5) return "Needs checking";
  return confidence >= 0.75 ? "Clear" : "Check carefully";
}

function documentCategoryLabel(category: DocumentCategory | undefined) {
  const labels: Partial<Record<DocumentCategory, string>> = {
    IdentityCard: "Identity card",
    PurchaseInvoice: "Purchase invoice",
    RepairInvoice: "Repair invoice",
    Voc: "Vehicle ownership certificate"
  };
  return category ? labels[category] ?? category : "Document";
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
