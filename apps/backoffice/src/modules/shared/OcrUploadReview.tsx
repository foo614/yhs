import { useEffect, useRef, useState, type ReactNode } from "react";
import { DeleteOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Alert, Button, Collapse, Drawer, Form, Input, InputNumber, Progress, Select, Space, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { formatMoneyInputWithTwoDecimals, parseMoneyInput } from "../../money";
import {
  getOcrJob,
  humanizeApiError,
  reviewOcrJob,
  startOcrJob,
  uploadVehicleDocumentWithProgress,
  type DocumentCategory,
  type DocumentUploadOwner,
  type OcrJob,
  type OcrLineItem,
  type OcrReviewedResult
} from "../../api";
import { OperationsProTable } from "./OperationsProTable";

export type OcrFieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  section?: OcrFieldSection;
  fullWidth?: boolean;
};

export type OcrFieldSection = {
  key: string;
  title: string;
  description?: string;
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

export function isOcrUploadMimeType(category: DocumentCategory, mimeType: string) {
  return isOcrImageMimeType(mimeType) || (category === "Voc" && mimeType === "application/pdf");
}

export function ocrSupportsLineItems(category: DocumentCategory) {
  return ["RepairInvoice", "PurchaseInvoice", "PaymentInvoice", "PaymentReceipt"].includes(category);
}

export function ocrFailureMessage(job: Pick<OcrJob, "status" | "result" | "warnings"> | null | undefined) {
  if (!job) return undefined;
  if (job.status === "Failed") return job.warnings.find((warning) => Boolean(warning.trim())) ?? "OCR could not read this document.";
  if (!job.result || (!Object.values(job.result.fields).some((value) => Boolean(value?.trim())) && !job.result.lineItems?.length)) {
    return "OCR returned no usable values. Enter the details manually or try a clearer document.";
  }
  return undefined;
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

export function groupOcrFields(fields: OcrFieldConfig[]) {
  return fields.reduce<Array<{ key: string; section?: OcrFieldSection; fields: OcrFieldConfig[] }>>((groups, field) => {
    const key = field.section?.key ?? "details";
    const previous = groups[groups.length - 1];
    if (!previous || previous.key !== key) groups.push({ key, section: field.section, fields: [] });
    groups[groups.length - 1].fields.push(field);
    return groups;
  }, []);
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

export type OcrApplyProgress = { targetApplied: boolean; reviewedJob?: OcrJob };

export async function runOcrApplySteps(
  progress: OcrApplyProgress,
  targetFirst: boolean,
  applyTarget: (reviewedJob?: OcrJob) => Promise<void>,
  saveReview: () => Promise<OcrJob>,
  onProgress: () => void,
  isCurrent: () => boolean = () => true
) {
  if (targetFirst && !progress.targetApplied) {
    await applyTarget();
    progress.targetApplied = true;
    if (!isCurrent()) return;
    onProgress();
  }
  if (!progress.reviewedJob) {
    progress.reviewedJob = await saveReview();
    if (!isCurrent()) return;
    onProgress();
  }
  if (!targetFirst && !progress.targetApplied) {
    await applyTarget(progress.reviewedJob);
    progress.targetApplied = true;
    if (!isCurrent()) return;
    onProgress();
  }
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
  const [savedStep, setSavedStep] = useState<"target" | "review" | undefined>();
  const pendingApply = useRef<{ values: OcrReviewValues; result: OcrReviewedResult; localJob: OcrJob; progress: OcrApplyProgress } | undefined>(undefined);
  const requestVersion = useRef(0);
  const requestBusy = useRef(false);
  useEffect(() => {
    requestVersion.current += 1;
    requestBusy.current = false;
    setBusy(false);
    setJob(null);
    setSavedStep(undefined);
    pendingApply.current = undefined;
    setLineItems([]);
    setReviewOpen(false);
    setUploadProgress(0);
    setAnalyzeProgress(0);
    form.resetFields();
    return () => { requestVersion.current += 1; };
  }, [vehicleId, category, uploadOwner?.ownershipType, uploadOwner?.ownerId, uploadOwner?.customerId, uploadOwner?.repairJobId, uploadOwner?.paymentRecordId, uploadOwner?.collectionTransactionId, uploadOwner?.deliveryScheduleId, form]);
  const declaredAmount = Form.useWatch("amount", form) as string | number | undefined;
  const lineItemColumns = ocrLineItemColumns(updateLineItem, removeLineItem);
  const declaredAmountNumber = parseOcrAmount(declaredAmount);
  const declaredAmountForDisplay = declaredAmountNumber ?? 0;
  const lineItemsTotal = lineItems.reduce((sum, item) => sum + (parseOcrAmount(item.amount) ?? 0), 0);
  const hasMissingLineItemAmounts = lineItems.length > 0 && lineItems.some((item) => parseOcrAmount(item.amount) === undefined);
  const hasCompleteLineItemAmounts = lineItems.length > 0 && lineItems.every((item) => parseOcrAmount(item.amount) !== undefined);
  const hasAmountReconciliation = fields.some((field) => field.name === "amount") && declaredAmountNumber !== undefined && hasCompleteLineItemAmounts;
  const lineItemsMatchDeclaredAmount = !hasAmountReconciliation || Math.abs(lineItemsTotal - declaredAmountForDisplay) <= 0.01;
  const failureMessage = ocrFailureMessage(job);
  const canApplyReview = !failureMessage && Boolean(job?.result) && !hasMissingLineItemAmounts && lineItemsMatchDeclaredAmount;
  const reviewConflicts = job ? ocrFieldConflicts(fields, existingValues, initialValuesFromJob(job, fields)) : [];
  const reviewFieldGroups = groupOcrFields(fields);

  async function handleUpload(option: UploadRequestOption) {
    if (!vehicleId) {
      option.onError?.(new Error("Select a vehicle first."));
      message.warning("Select a vehicle before uploading a document.");
      return;
    }
    if (disabled || requestBusy.current || savedStep) return;
    const file = option.file as File;
    if (!isOcrUploadMimeType(category, file.type) || file.size > 10 * 1024 * 1024) {
      const error = new Error(category === "Voc" ? "Use a VOC PDF, JPG, PNG, or WebP file, up to 10 MB." : "Use a JPG, PNG, or WebP image, up to 10 MB.");
      option.onError?.(error);
      message.error(error.message);
      return;
    }
    const version = ++requestVersion.current;
    const isCurrent = () => requestVersion.current === version;
    requestBusy.current = true;

    try {
      setBusy(true);
      setJob(null);
      setLineItems([]);
      setUploadProgress(0);
      setAnalyzeProgress(0);
      const document = await uploadVehicleDocumentWithProgress(vehicleId, file, category, (progress) => { if (isCurrent()) setUploadProgress(progress); }, uploadOwner);
      if (!isCurrent()) return;
      onUploaded?.();
      const loadedJob = await analyzeUploadedDocument(document.id, async (progress) => {
        if (isCurrent()) setAnalyzeProgress(progress);
      });
      if (!isCurrent()) return;
      setJob(loadedJob);
      const extractedLineItems = !ocrSupportsLineItems(category) ? [] : loadedJob.result?.lineItems?.length
        ? loadedJob.result.lineItems
        : repairLineItemsFromRawText(loadedJob.result?.rawText);
      setLineItems(extractedLineItems);
      const initialValues = initialValuesFromJob(loadedJob, fields);
      for (const conflict of ocrFieldConflicts(fields, existingValues, initialValues)) initialValues[conflict.name] = conflict.existingValue;
      form.setFieldsValue(initialValues);
      setReviewOpen(true);
      option.onSuccess?.({ ok: true });
    } catch (error) {
      if (!isCurrent()) return;
      option.onError?.(error instanceof Error ? error : new Error("OCR upload failed."));
      message.error(humanizeApiError(error, "OCR upload failed. Please check the file and try again."));
    } finally {
      if (isCurrent()) {
        requestBusy.current = false;
        setBusy(false);
      }
    }
  }

  async function applyResult() {
    if (!job || requestBusy.current || disabled) return;
    if (!canApplyReview) {
      message.warning("Correct the receipt item amounts so they match the receipt total before saving this review.");
      return;
    }
    const version = requestVersion.current;
    const isCurrent = () => requestVersion.current === version;
    requestBusy.current = true;
    setBusy(true);
    try {
      const values = await form.validateFields();
      if (!isCurrent()) return;
      const reviewedResult = reviewedResultFrom(job, values, lineItems);
      const localJob: OcrJob = job.result
        ? { ...job, result: { ...job.result, fields: reviewedResult.fields, lineItems } }
        : job;
      const submission = pendingApply.current ?? { values, result: reviewedResult, localJob, progress: { targetApplied: false } };
      pendingApply.current = submission;
      await runOcrApplySteps(submission.progress, commitAfterApply,
        async (reviewedJob) => {
          const appliedJob = reviewedJob?.result && submission.localJob.result
            ? { ...reviewedJob, result: { ...reviewedJob.result, fields: submission.result.fields, lineItems: submission.result.lineItems } }
            : submission.localJob;
          await onApply(submission.values, appliedJob);
        },
        () => reviewOcrJob(job.id, submission.result, "OCR values reviewed by staff; linked workflow save is recorded separately"),
        () => {
          setSavedStep(submission.progress.targetApplied ? "target" : "review");
          if (submission.progress.reviewedJob) setJob(submission.progress.reviewedJob);
        },
        isCurrent
      );
      if (!isCurrent()) return;
      pendingApply.current = undefined;
      setSavedStep(undefined);
      setReviewOpen(false);
      message.success("OCR review complete. Check the linked form or record before continuing.");
    } catch (error) {
      if (!isCurrent()) return;
      if (!pendingApply.current?.progress.targetApplied && !pendingApply.current?.progress.reviewedJob) pendingApply.current = undefined;
      message.error(humanizeApiError(error, "Could not use these OCR values. Please correct the details and try again."));
    } finally {
      if (isCurrent()) {
        requestBusy.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <>
      <Space direction="vertical" size={8} className="fullWidth">
        {!compact && (
          <div className="ocrUploadGuide">
            <span className="ocrStepLabel">Step 1 of 3</span>
            <div>
              <Typography.Text strong>Choose a clear document</Typography.Text>
              <Typography.Text type="secondary">{category === "Voc" ? "English VOC PDF (1–15 readable, unencrypted pages), JPG, PNG, or WebP, up to 10 MB." : "JPG, PNG, or WebP, up to 10 MB. Use Document Upload for PDFs."}</Typography.Text>
            </div>
          </div>
        )}
        <Upload
          accept={[...ocrImageMimeTypes, ...(category === "Voc" ? ["application/pdf"] : [])].join(",")}
          disabled={disabled || busy || Boolean(savedStep)}
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            if (isOcrUploadMimeType(category, file.type) && file.size <= 10 * 1024 * 1024) return true;
            message.error(category === "Voc" ? "Choose a VOC PDF, JPG, PNG, or WebP file up to 10 MB." : "Choose a JPG, PNG, or WebP image up to 10 MB. Upload PDFs through Document Upload instead.");
            return Upload.LIST_IGNORE;
          }}
          customRequest={(option) => void handleUpload(option)}
        >
          <Button type={compact ? "primary" : "default"} size={compact ? "small" : "middle"} icon={<UploadOutlined />} disabled={disabled || busy || Boolean(savedStep)}>{buttonLabel}</Button>
        </Upload>
        {savedStep && !reviewOpen && <Button onClick={() => setReviewOpen(true)}>Resume unfinished OCR save</Button>}
        {(busy || uploadProgress > 0 || analyzeProgress > 0) && (
          <div className="ocrProgressStack">
            <Typography.Text type="secondary">Uploading document</Typography.Text>
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
            <span>{failureMessage ? "OCR could not read this document" : "Check the details we found"}</span>
          </div>
        )}
        open={reviewOpen}
        onClose={() => { if (!busy) setReviewOpen(false); }}
        actions={(
          <div className="ocrReviewActions">
            {failureMessage
              ? <Button onClick={() => setReviewOpen(false)}>Close</Button>
              : <Button type="primary" loading={busy} disabled={!canApplyReview || disabled} onClick={() => void applyResult()}>{savedStep ? "Retry remaining step" : applyLabel}</Button>}
          </div>
        )}
      >
        <Space direction="vertical" size={16} className="fullWidth">
          {failureMessage ? (
            <Alert
              type="error"
              showIcon
              message="No usable values were extracted from this document."
              description={<>{failureMessage}<br />The uploaded evidence is retained. Enter values manually or try a clearer document; an OCR failure does not change the vehicle or financial records.</>}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message={savedStep === "target" ? "The linked record is saved. OCR review still needs to finish." : savedStep === "review" ? "OCR review is saved. The linked record still needs to finish." : "Document saved. Details have not been applied."}
              description={savedStep ? "Retry the remaining step with the same reviewed values. Completed steps will not be submitted again. Do not upload another copy to retry." : "Check and correct the suggested values. Saving the review records the differences from the original OCR result; the linked record changes only after its save succeeds."}
            />
          )}
          {!failureMessage && job?.warnings?.length ? (
            <Alert type="warning" showIcon message={job.warnings.join(" ")} />
          ) : null}
          {!failureMessage ? <Space wrap className="ocrReviewSummary">
            <Tag color="blue">{documentCategoryLabel(job?.category)}</Tag>
            <Tag color="green">Ready for your check</Tag>
            <Tag color={confidenceColor(job?.result?.confidence)}>Reading quality: {confidenceLabel(job?.result?.confidence)}</Tag>
          </Space> : null}
          {!failureMessage ? <Form name={`ocrReview-${job?.id ?? category}`} form={form} disabled={busy || Boolean(savedStep)} component={reviewPresentation === "inline" ? false : undefined} layout="vertical" className="drawerForm">
            {reviewConflicts.length > 0 ? (
              <Form.Item label="Information already on file" extra="The current value is shown below. Edit it if this document proves it should change.">
                <Space direction="vertical" size={8} className="fullWidth">
                  {reviewConflicts.map((conflict) => (
                    <Alert
                      key={conflict.name}
                      type="warning"
                      showIcon
                      message={conflict.label}
                      description={<>Current record: <strong>{String(conflict.existingValue)}</strong><br />AI read: <strong>{String(conflict.extractedValue)}</strong></>}
                    />
                  ))}
                </Space>
              </Form.Item>
            ) : null}
            <div className="ocrReviewSectionHeading">
              <Typography.Text strong>Details from this document</Typography.Text>
              <Typography.Text type="secondary">Edit any value before you continue.</Typography.Text>
            </div>
            {reviewFieldGroups.map((group) => (
              <section key={group.key} className={group.section ? "ocrReviewFieldSection" : undefined}>
                {group.section ? (
                  <div className="ocrReviewFieldSectionHeading">
                    <Typography.Text strong>{group.section.title}</Typography.Text>
                    {group.section.description ? <Typography.Text type="secondary">{group.section.description}</Typography.Text> : null}
                  </div>
                ) : null}
                <div className={group.section ? "ocrReviewFieldGrid" : undefined}>
                  {group.fields.map((field) => (
                    <Form.Item key={field.name} name={field.name} className={field.fullWidth ? "ocrReviewFieldFullWidth" : undefined} label={fieldLabel(field, job)}>
                      {field.type === "number" ? (
                        <InputNumber className="fullWidth" min={0} precision={isMoneyField(field.name) ? 2 : undefined} formatter={isMoneyField(field.name) ? formatMoneyInputWithTwoDecimals : undefined} parser={isMoneyField(field.name) ? parseMoneyInput : undefined} />
                      ) : field.type === "select" ? (
                        <Select showSearch optionFilterProp="label" options={field.options ?? []} />
                      ) : (
                        <Input />
                      )}
                    </Form.Item>
                  ))}
                </div>
              </section>
            ))}
            {job && ocrSupportsLineItems(category) ? (
              <Form.Item
                label={(
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>Receipt items</span>
                    <Button size="small" icon={<PlusOutlined />} onClick={addLineItem}>Add item</Button>
                  </Space>
                )}
                extra="Check the description, quantity, unit, unit price, and line amount against the receipt before you continue."
              >
                <OperationsProTable<OcrLineItem>
                  size="small"
                  rowKey={(_, index) => String(index)}
                  columns={lineItemColumns as ColumnsType<OcrLineItem>}
                  dataSource={lineItems}
                  pagination={false}
                  scroll={{ x: 1040 }}
                  locale={{ emptyText: "No line item descriptions detected. Add one manually." }}
                />
                {hasMissingLineItemAmounts ? (
                  <Alert type="warning" showIcon message="Some item amounts are missing / 部分项目金额未填，请先补充后再核对总额。" />
                ) : null}
                {hasAmountReconciliation ? (
                  <Alert
                    type={lineItemsMatchDeclaredAmount ? "success" : "warning"}
                    showIcon
                    message={lineItemsMatchDeclaredAmount
                      ? `Amounts match / 金额一致: RM ${lineItemsTotal.toFixed(2)}`
                      : `Check totals before saving / 请先核对金额: receipt RM ${declaredAmountForDisplay.toFixed(2)}, items RM ${lineItemsTotal.toFixed(2)}`}
                  />
                ) : null}
              </Form.Item>
            ) : null}
          </Form> : null}
          {!failureMessage ? <Collapse
            size="small"
            items={[{
              key: "raw-text",
              label: "Technical details (only if you need to check the scan)",
              children: <Input.TextArea rows={5} value={job?.result?.rawText ?? ""} readOnly aria-label="Original text read from the document" />
            }]}
          /> : null}
          {!failureMessage ? <Typography.Text type="secondary">Step 3: save the reviewed values. The system records every change for OCR accuracy reporting.</Typography.Text> : null}
        </Space>
      </OcrReviewShell>
    </>
  );

  function updateLineItem(index: number, field: keyof OcrLineItem, value: string | number | null) {
    if (requestBusy.current || savedStep) return;
    setLineItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value === null ? undefined : String(value) } : item
    )));
  }

  function addLineItem() {
    if (requestBusy.current || savedStep) return;
    setLineItems((current) => [...current, { description: "", quantity: "1", unit: "", unitPrice: "", amount: "", rawText: "Added manually" }]);
  }

  function removeLineItem(index: number) {
    if (requestBusy.current || savedStep) return;
    setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }
}

export function repairLineItemsFromRawText(rawText?: string): OcrLineItem[] {
  if (!rawText) return [];
  const items: OcrLineItem[] = [];
  for (const line of rawText.split(/\r?\n/).map((value) => value.trim())) {
    if (/^(?:notes?|b\/f pages total|page total|total)\b/i.test(line)) break;
    const item = repairLineItemFromText(line);
    if (item) items.push(item);
  }
  if (items.length === 0) {
    const flattened = rawText.replace(/\\\./g, ".").replace(/\s+/g, " ");
    const matches = [...flattened.matchAll(/(?:^|\s)(\d+)[.)]\s+(.+?)(?=\s+\d+[.)]\s+|\s+(?:Notes?|B\/F Pages Total|Page Total|Total)\b|$)/gi)];
    for (const match of matches) {
      const item = repairLineItemFromText(`${match[1]}. ${match[2]}`);
      if (item) items.push(item);
    }
  }
  return items;
}

function repairLineItemFromText(rawLine: string): OcrLineItem | undefined {
  const line = rawLine.replace(/\\\./g, ".").replace(/\s+/g, " ").trim();
  if (!line || /^(?:all cheques|cheques should|authorised signature)\b/i.test(line)) return undefined;

  // Read values from the same printed row only. Never pair every amount on the
  // receipt by position: that is how one row's RM 130 was shown as another row's RM 7.50.
  const structured = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{1,12})\s+(?:RM\s*)?(\d{1,6}(?:,\d{3})*\.\d{2})\s+(?:RM\s*)?(\d{1,6}(?:,\d{3})*\.\d{2})$/i);
  if (structured) {
    return {
      description: structured[1].trim(),
      quantity: structured[2],
      unit: structured[3].toUpperCase(),
      unitPrice: structured[4].replace(/,/g, ""),
      amount: structured[5].replace(/,/g, ""),
      rawText: line,
      confidence: undefined
    };
  }

  const structuredWithoutUnit = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:RM\s*)?(\d{1,6}(?:,\d{3})*\.\d{2})\s+(?:RM\s*)?(\d{1,6}(?:,\d{3})*\.\d{2})$/i);
  if (structuredWithoutUnit) {
    return {
      description: structuredWithoutUnit[1].trim(),
      quantity: structuredWithoutUnit[2],
      unitPrice: structuredWithoutUnit[3].replace(/,/g, ""),
      amount: structuredWithoutUnit[4].replace(/,/g, ""),
      rawText: line,
      confidence: undefined
    };
  }

  const numbered = line.match(/^\d+[.)]\s*(.+)$/)?.[1]?.trim();
  if (!numbered || /^(?:all cheques|cheques should|authorised signature)\b/i.test(numbered)) return undefined;
  const quantityAndAmount = numbered.match(/^(.+?)\s+qty\s*(\d+(?:\.\d+)?)\s+(?:RM\s*)?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)$/i);
  return quantityAndAmount
    ? {
      description: quantityAndAmount[1].trim(),
      quantity: quantityAndAmount[2],
      amount: quantityAndAmount[3].replace(/,/g, ""),
      rawText: line,
      confidence: undefined
    }
    : { description: numbered, quantity: "1", amount: "", rawText: line, confidence: undefined };
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

function reviewedResultFrom(job: OcrJob, values: OcrReviewValues, lineItems: OcrLineItem[]): OcrReviewedResult {
  const fields: Record<string, string | null | undefined> = { ...(job.result?.fields ?? {}) };
  for (const [name, value] of Object.entries(values)) fields[name] = value === undefined || value === null || String(value).trim() === "" ? null : String(value).trim();
  return { fields, lineItems };
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
      dataIndex: "unit",
      width: 110,
      render: (_, record, index) => (
        <Input value={record.unit ?? ""} onChange={(event) => updateLineItem(index, "unit", event.target.value)} />
      )
    },
    {
      title: "Unit price (RM)",
      dataIndex: "unitPrice",
      width: 150,
      render: (_, record, index) => (
        <InputNumber
          className="fullWidth"
          min={0}
          precision={2}
          value={parseOcrAmount(record.unitPrice)}
          formatter={formatMoneyInputWithTwoDecimals}
          parser={parseMoneyInput}
          onChange={(value) => updateLineItem(index, "unitPrice", value)}
        />
      )
    },
    {
      title: "Line amount (RM)",
      dataIndex: "amount",
      width: 150,
      render: (_, record, index) => (
        <InputNumber
          className="fullWidth"
          min={0}
          precision={2}
          value={parseOcrAmount(record.amount)}
          formatter={formatMoneyInputWithTwoDecimals}
          parser={parseMoneyInput}
          onChange={(value) => updateLineItem(index, "amount", value)}
        />
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
