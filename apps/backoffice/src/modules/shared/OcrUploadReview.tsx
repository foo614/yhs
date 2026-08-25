import { useState, type ReactNode } from "react";
import { DeleteOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import { Alert, Button, Collapse, Drawer, Form, Input, InputNumber, Progress, Radio, Select, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { formatMoneyInput, parseMoneyInput } from "../../money";
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

function OcrReviewShell({
  presentation,
  open,
  title,
  actions,
  onClose,
  children
}: {
  presentation: "drawer" | "inline";
  open: boolean;
  title: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  if (presentation === "inline") {
    return open ? (
      <div className="ocrReviewInline">
        {title}
        {children}
        {actions}
      </div>
    ) : null;
  }

  return (
    <Drawer title={title} width={560} open={open} onClose={onClose} className="recordEditDrawer ocrReviewDrawer" footer={actions}>
      {children}
    </Drawer>
  );
}

export function OcrUploadReview({
  vehicleId,
  category,
  buttonLabel,
  applyLabel = "Apply to Form",
  disabled,
  compact = false,
  commitAfterApply = false,
  reviewPresentation = "drawer",
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
  commitAfterApply?: boolean;
  reviewPresentation?: "drawer" | "inline";
  fields: OcrFieldConfig[];
  existingValues?: OcrReviewValues;
  uploadOwner?: DocumentUploadOwner;
  onUploaded?: () => void;
  onApply: (values: OcrReviewValues, job: OcrJob) => void | Promise<void>;
}) {
  const [form] = Form.useForm<OcrReviewValues>();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [job, setJob] = useState<OcrJob | null>(null);
  const [lineItems, setLineItems] = useState<OcrLineItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, "existing" | "ocr">>({});
  const declaredAmount = Form.useWatch("amount", form) as string | number | undefined;
  const lineItemColumns = ocrLineItemColumns(updateLineItem, removeLineItem);
  const declaredAmountNumber = parseOcrAmount(declaredAmount);
  const declaredAmountForDisplay = declaredAmountNumber ?? 0;
  const lineItemsTotal = lineItems.reduce((sum, item) => sum + (parseOcrAmount(item.amount) ?? 0), 0);
  const hasMissingLineItemAmounts = lineItems.length > 0 && lineItems.some((item) => parseOcrAmount(item.amount) === undefined);
  const hasCompleteLineItemAmounts = lineItems.length > 0 && lineItems.every((item) => parseOcrAmount(item.amount) !== undefined);
  const hasAmountReconciliation = fields.some((field) => field.name === "amount") && declaredAmountNumber !== undefined && hasCompleteLineItemAmounts;
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
      const extractedLineItems = loadedJob.result?.lineItems?.length
        ? loadedJob.result.lineItems
        : repairLineItemsFromRawText(loadedJob.result?.rawText);
      setLineItems(extractedLineItems);
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
    try {
      const values = await form.validateFields();
      const conflicts = ocrFieldConflicts(fields, existingValues, values);
      const resolvedValues = resolveOcrReviewValues(values, conflicts, conflictChoices);
      const localJob: OcrJob = job.result
        ? { ...job, result: { ...job.result, lineItems } }
        : job;
      const reviewNotes = conflicts.length === 0
        ? "Accepted from OCR review"
        : `Accepted from OCR review; ${conflicts.map((conflict) => `${conflict.name}: ${conflictChoices[conflict.name] === "ocr" ? "use-ocr" : "keep-existing"}`).join(", ")}`;
      if (commitAfterApply) {
        await onApply(resolvedValues, localJob);
      }
      const reviewedJob = await reviewOcrJob(job.id, "Accepted", reviewNotes);
      const mergedJob: OcrJob = reviewedJob.result && localJob.result
        ? { ...reviewedJob, result: { ...reviewedJob.result, lineItems } }
        : reviewedJob;
      setJob(mergedJob);
      if (!commitAfterApply) {
        await onApply(resolvedValues, mergedJob);
      }
      setReviewOpen(false);
      message.success("OCR values accepted. Confirm the target workflow result before continuing.");
    } catch (error) {
      message.error(humanizeApiError(error, "Could not use these OCR values. Please correct the details and try again."));
    }
  }

  async function rejectResult() {
    if (!job) return;
    const reviewedJob = await reviewOcrJob(job.id, "Rejected", "Rejected from OCR review");
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
      <OcrReviewShell
        presentation={reviewPresentation}
        title={(
          <div className="ocrReviewDrawerTitle">
            <span className="ocrStepLabel">Step 2 of 3</span>
            <span>Check the details we found</span>
          </div>
        )}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        actions={(
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
          <Form form={form} component={reviewPresentation === "inline" ? false : undefined} layout="vertical" className="drawerForm">
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
                  <InputNumber className="fullWidth" min={0} formatter={isMoneyField(field.name) ? formatMoneyInput : undefined} parser={isMoneyField(field.name) ? parseMoneyInput : undefined} />
                ) : field.type === "select" ? (
                  <Select showSearch optionFilterProp="label" options={field.options ?? []} />
                ) : (
                  <Input />
                )}
              </Form.Item>
            ))}
            {job ? (
              <Form.Item
                label={(
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>Items found on this document</span>
                    <Button size="small" icon={<PlusOutlined />} onClick={addLineItem}>Add item</Button>
                  </Space>
                )}
                extra="Edit, add, or remove items before creating the repair."
              >
                <ProTable<OcrLineItem>
                  size="small"
                  rowKey={(_, index) => String(index)}
                  columns={lineItemColumns}
                  dataSource={lineItems}
                  search={false}
                  options={false}
                  pagination={false}
                  scroll={{ x: 840 }}
                  locale={{ emptyText: "No line item descriptions detected. Add one manually." }}
                />
                {hasMissingLineItemAmounts ? (
                  <Alert type="warning" showIcon message="Some item amounts are missing / 部分项目金额未填，请先补充后再核对总额。" />
                ) : null}
                {hasAmountReconciliation ? (
                  <Alert
                    type={Math.abs(lineItemsTotal - declaredAmountForDisplay) <= 0.01 ? "success" : "warning"}
                    showIcon
                    message={Math.abs(lineItemsTotal - declaredAmountForDisplay) <= 0.01
                      ? `Amounts match / 金额一致: RM ${lineItemsTotal.toFixed(2)}`
                      : `Check totals / 请核对金额: receipt RM ${declaredAmountForDisplay.toFixed(2)}, items RM ${lineItemsTotal.toFixed(2)}`}
                  />
                ) : null}
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
      </OcrReviewShell>
    </>
  );

  function updateLineItem(index: number, field: keyof OcrLineItem, value: string | number | null) {
    setLineItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value === null ? undefined : String(value) } : item
    )));
  }

  function addLineItem() {
    setLineItems((current) => [...current, { description: "", quantity: "1", amount: "", rawText: "Added manually" }]);
  }

  function removeLineItem(index: number) {
    setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }
}

function repairLineItemsFromRawText(rawText?: string): OcrLineItem[] {
  if (!rawText) return [];
  const items: OcrLineItem[] = [];
  for (const line of rawText.split(/\r?\n/).map((value) => value.trim())) {
    if (/^(?:notes?|b\/f pages total|page total|total)\b/i.test(line)) break;
    const description = line.match(/^\d+[.)]\s*(.+)$/)?.[1]?.trim() ?? "";
    if (!description || /^(?:all cheques|cheques should|authorised signature)\b/i.test(description)) continue;
    items.push({ description, quantity: "1", amount: "", rawText: description, confidence: undefined });
  }
  if (items.length === 0) {
    const flattened = rawText.replace(/\\\./g, ".").replace(/\s+/g, " ");
    const matches = [...flattened.matchAll(/(?:^|\s)(\d+)[.)]\s+(.+?)(?=\s+\d+[.)]\s+|\s+(?:Notes?|B\/F Pages Total|Page Total|Total)\b|$)/gi)];
    for (const match of matches) {
      const description = match[2].trim();
      if (!/^(?:all cheques|cheques should|authorised signature)\b/i.test(description) && description.length >= 3) {
        items.push({ description, quantity: "1", amount: "", rawText: description, confidence: undefined });
      }
    }
  }
  const detailText = rawText.split(/\b(?:Notes?|B\/F Pages Total)\b/i)[0];
  const amounts = [...detailText.matchAll(/\b\d{1,6}(?:,\d{3})*\.\d{2}\b/g)].map((match) => match[0].replace(/,/g, ""));
  const rowAmounts = amounts.slice(-items.length);
  const units = [...detailText.matchAll(/\b(SQF|PC|UNIT|HOUR|SET)\b/gi)].map((match) => match[1].toUpperCase());
  const rowUnits = units.slice(-items.length);
  items.forEach((item, index) => {
    if (rowAmounts[index]) item.amount = rowAmounts[index];
    if (rowUnits[index]) item.unitPrice = rowUnits[index];
  });
  return items
}

function isMoneyField(name: string) {
  return /(amount|price|cost|commission|salary|charge|allowance|deduction)/i.test(name);
}

function parseOcrAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
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
  updateLineItem: (index: number, field: keyof OcrLineItem, value: string | number | null) => void,
  removeLineItem: (index: number) => void
): ProColumns<OcrLineItem>[] {
  return [
    {
      title: "Description",
      dataIndex: "description",
      width: 260,
      render: (_, record, index) => (
        <Input value={record.description} onChange={(event) => updateLineItem(index, "description", event.target.value)} />
      )
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      width: 90,
      render: (_, record, index) => (
        <Input value={record.quantity ?? ""} onChange={(event) => updateLineItem(index, "quantity", event.target.value)} />
      )
    },
    {
      title: "Unit",
      dataIndex: "unitPrice",
      width: 110,
      render: (_, record, index) => (
        <Input value={record.unitPrice ?? ""} onChange={(event) => updateLineItem(index, "unitPrice", event.target.value)} />
      )
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 120,
      render: (_, record, index) => (
        <Input value={record.amount ?? ""} onChange={(event) => updateLineItem(index, "amount", event.target.value)} />
      )
    },
    {
      title: "Action",
      key: "action",
      width: 72,
      fixed: "right",
      render: (_, __, index) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          aria-label="Remove item"
          onClick={() => removeLineItem(index)}
        />
      )
    }
  ];
}
