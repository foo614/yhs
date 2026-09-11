import { useEffect, useRef, useState } from "react";
import { CheckCircleFilled, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Input, Radio, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { previewVehicleIntakeVoc, type OcrExtractionResult } from "../../api";
import { isOcrImageMimeType } from "../shared/OcrUploadReview";

const vocFields = [
  { name: "plateNumber", label: "Plate / 车牌" },
  { name: "chassisNumber", label: "Chassis number / 车架号码" },
  { name: "engineNumber", label: "Engine number / 发动机号码" },
  { name: "make", label: "Make / 品牌" },
  { name: "model", label: "Model / 型号" },
  { name: "year", label: "Year / 年份" }
] as const;

export type VehicleIntakeVocField = typeof vocFields[number]["name"];
export type VehicleIntakeVocDraft = {
  plateNumber?: string;
  chassisNumber?: string;
  engineNumber?: string;
  make?: string;
  model?: string;
  year?: number;
};
export type VehicleIntakeVocPatch = VehicleIntakeVocDraft;
export type VehicleIntakeVocDecision = "keep" | "replace";

export function isVehicleIntakeVocMimeType(mimeType: string) {
  return mimeType === "application/pdf" || isOcrImageMimeType(mimeType);
}

export function vocReviewWarnings(warnings: readonly string[]) {
  return warnings.filter((warning) => !/^(Google Document AI|Baidu Unlimited-OCR) result\. Review extracted values before saving\.$/i.test(warning.trim()));
}

export function createVehicleIntakeVocPreviewRequestGate() {
  let currentRequest = 0;
  let disposed = false;

  return {
    begin() {
      if (disposed) return 0;
      currentRequest += 1;
      return currentRequest;
    },
    isCurrent(request: number) {
      return !disposed && request !== 0 && request === currentRequest;
    },
    dispose() {
      disposed = true;
      currentRequest += 1;
    }
  };
}

function normalized(value: string | number | undefined | null) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function validYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1990 && year <= new Date().getFullYear() + 1;
}

export function vehicleIntakeVocPatch(
  draft: VehicleIntakeVocDraft,
  reviewedValues: Record<string, string | null | undefined>,
  decisions: Partial<Record<VehicleIntakeVocField, VehicleIntakeVocDecision>>
): VehicleIntakeVocPatch {
  return vocFields.reduce<VehicleIntakeVocPatch>((patch, field) => {
    const extracted = normalized(reviewedValues[field.name]);
    const current = normalized(draft[field.name]);
    if (!extracted || (field.name === "year" && !validYear(extracted))) return patch;
    if (current && (current === extracted || decisions[field.name] !== "replace")) return patch;
    if (field.name === "year") patch.year = Number(extracted);
    else patch[field.name] = extracted;
    return patch;
  }, {});
}

export function VehicleIntakeVocReview({
  draft,
  disabled,
  onApply,
  onClear
}: {
  draft: VehicleIntakeVocDraft;
  disabled?: boolean;
  onApply: (patch: VehicleIntakeVocPatch, file: File) => void;
  onClear: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OcrExtractionResult | null>(null);
  const [reviewedValues, setReviewedValues] = useState<Record<string, string | null | undefined>>({});
  const [decisions, setDecisions] = useState<Partial<Record<VehicleIntakeVocField, VehicleIntakeVocDecision>>>({});
  const [busy, setBusy] = useState(false);
  const visibleWarnings = vocReviewWarnings(result?.warnings ?? []);
  const previewRequestGate = useRef<ReturnType<typeof createVehicleIntakeVocPreviewRequestGate> | null>(null);
  const previewInFlight = useRef(false);

  useEffect(() => {
    const gate = createVehicleIntakeVocPreviewRequestGate();
    previewRequestGate.current = gate;
    previewInFlight.current = false;
    return () => gate.dispose();
  }, []);

  const scanVoc = async (option: UploadRequestOption) => {
    const nextFile = option.file as File;
    if (disabled || previewInFlight.current) return;
    if (!isVehicleIntakeVocMimeType(nextFile.type)) {
      const error = new Error("Use an English PDF, JPG, PNG, or WebP file for VOC checking.");
      option.onError?.(error);
      message.error(error.message);
      return;
    }

    const gate = previewRequestGate.current;
    if (!gate) return;
    const request = gate.begin();
    if (!request) return;
    previewInFlight.current = true;
    setBusy(true);
    try {
      const preview = await previewVehicleIntakeVoc(nextFile);
      if (!gate.isCurrent(request)) return;
      const nextValues = { ...preview.result.fields };
      setFile(nextFile);
      setResult(preview.result);
      setReviewedValues(nextValues);
      setDecisions({});
      option.onSuccess?.({ ok: true });
    } catch (error) {
      if (!gate.isCurrent(request)) return;
      option.onError?.(error instanceof Error ? error : new Error("Unable to check this VOC."));
      message.error(error instanceof Error ? error.message : "Unable to check this VOC. Please try another clear file.");
    } finally {
      if (gate.isCurrent(request)) {
        previewInFlight.current = false;
        setBusy(false);
      }
    }
  };

  const apply = () => {
    if (!file || disabled || busy) return;
    const patch = vehicleIntakeVocPatch(draft, reviewedValues, decisions);
    onApply(patch, file);
  };

  const clear = () => {
    if (disabled || busy) return;
    setFile(null);
    setResult(null);
    setReviewedValues({});
    setDecisions({});
    onClear();
  };

  return (
    <div className="vehicleIntakeVocReview">
      <Alert
        type="info"
        showIcon
        message="Optional VOC check / 可选 VOC 核对"
        description="Choose an English VOC PDF, JPG, PNG, or WebP file (PDF: 1–15 readable, unencrypted pages; maximum 10 MB). Check the suggested vehicle details, then apply only the fields you approve. Nothing is saved until the vehicle intake is created."
      />
      {!result ? (
        <Upload accept="application/pdf,image/jpeg,image/png,image/webp" maxCount={1} showUploadList={false} disabled={disabled || busy} customRequest={(option) => void scanVoc(option)}>
          <Button icon={<UploadOutlined />} loading={busy} disabled={disabled || busy}>Scan VOC / 扫描 VOC</Button>
        </Upload>
      ) : (
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert
            type={result.confidence > 0 ? "warning" : "error"}
            showIcon
            message={result.confidence > 0 ? "Check every suggested value" : "VOC could not be read automatically"}
            description={result.confidence > 0
              ? "Blank vehicle fields can be filled after Apply. Existing different values stay unchanged unless you select Replace for that field."
              : "Keep or enter the vehicle details manually. You can choose another clear VOC file."}
          />
          {visibleWarnings.length ? (
            <Alert
              type="warning"
              showIcon
              message={`${visibleWarnings.length} item${visibleWarnings.length === 1 ? "" : "s"} need manual confirmation`}
              description={<ul className="vehicleIntakeVocWarnings">{visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            />
          ) : null}
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="Registered owner / 注册车主">
              {normalized(reviewedValues.ownerName) || "Not detected"} <Tag>Reference only</Tag>
            </Descriptions.Item>
          </Descriptions>
          {vocFields.map((field) => {
            const current = normalized(draft[field.name]);
            const extracted = normalized(reviewedValues[field.name]);
            const differs = Boolean(current && extracted && current !== extracted);
            const invalid = field.name === "year" && Boolean(extracted) && !validYear(extracted);
            const inputId = `vehicle-intake-voc-${field.name}`;
            return (
              <div className="vehicleIntakeVocField" key={field.name}>
                <Typography.Text strong><label htmlFor={inputId}>{field.label}</label></Typography.Text>
                <Input
                  id={inputId}
                  aria-label={field.label}
                  value={reviewedValues[field.name] ?? ""}
                  disabled={!extracted || disabled || busy}
                  onChange={(event) => setReviewedValues((values) => ({ ...values, [field.name]: event.target.value }))}
                />
                {invalid ? <Typography.Text type="danger">The suggested year is not valid and cannot be applied.</Typography.Text> : null}
                {differs ? (
                  <Radio.Group
                    aria-label={`Decision for ${field.label}`}
                    disabled={disabled || busy}
                    value={decisions[field.name] ?? "keep"}
                    onChange={(event) => setDecisions((currentDecisions) => ({ ...currentDecisions, [field.name]: event.target.value as VehicleIntakeVocDecision }))}
                    options={[
                      { value: "keep", label: `Keep current: ${current}` },
                      { value: "replace", label: "Replace with reviewed VOC value" }
                    ]}
                  />
                ) : current ? <Tag color="green">Matches current draft</Tag> : extracted ? <Tag color="blue">Will fill this empty draft field after Apply</Tag> : <Typography.Text type="secondary">Not detected</Typography.Text>}
              </div>
            );
          })}
          <Space wrap>
            <Button type="primary" icon={<CheckCircleFilled />} onClick={apply} disabled={disabled || busy}>Apply approved VOC values</Button>
            <Button onClick={clear} disabled={disabled || busy}>Remove VOC review</Button>
            <Upload accept="application/pdf,image/jpeg,image/png,image/webp" maxCount={1} showUploadList={false} disabled={disabled || busy} customRequest={(option) => void scanVoc(option)}>
              <Button loading={busy} disabled={disabled || busy}>Choose another file</Button>
            </Upload>
          </Space>
        </Space>
      )}
    </div>
  );
}
