import { useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Form, Input, InputNumber, Progress, Select, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import {
  getOcrJob,
  startOcrJob,
  uploadVehicleDocumentWithProgress,
  type DocumentCategory,
  type OcrJob
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleUpload(option: UploadRequestOption) {
    if (!vehicleId) {
      option.onError?.(new Error("Select a vehicle first."));
      return;
    }

    try {
      setBusy(true);
      setJob(null);
      setUploadProgress(0);
      setAnalyzeProgress(0);
      const document = await uploadVehicleDocumentWithProgress(vehicleId, option.file as File, category, setUploadProgress);
      onUploaded?.();
      setAnalyzeProgress(25);
      const createdJob = await startOcrJob(document.id);
      setAnalyzeProgress(70);
      const loadedJob = await getOcrJob(createdJob.id);
      setAnalyzeProgress(loadedJob.progress || 100);
      setJob(loadedJob);
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
    onApply(values, job);
    setReviewOpen(false);
    message.success("OCR values applied. Review and save the form when ready.");
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
        extra={<Button type="primary" onClick={() => void applyResult()}>{applyLabel}</Button>}
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
            <Form.Item label="Raw OCR Text">
              <Input.TextArea rows={5} value={job?.result?.rawText ?? ""} readOnly />
            </Form.Item>
          </Form>
          <Typography.Text type="secondary">Review the values carefully before saving the target record.</Typography.Text>
        </Space>
      </Drawer>
    </>
  );
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
