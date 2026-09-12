import { useEffect, useRef, useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Space, Tag, Upload, message } from "antd";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { previewVehicleIntakeVoc, type OcrExtractionResult, type VehicleCatalogModel } from "../../api";
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

export type VehicleIntakeVocCatalogResolution = {
  item: VehicleCatalogModel;
  modelMatch: "exact" | "base";
};

function catalogWords(value: string | null | undefined) {
  return normalized(value).toLocaleUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function vehicleIntakeVocCatalogResolution(
  reviewedValues: Record<string, string | null | undefined>,
  catalogModels: readonly VehicleCatalogModel[]
): VehicleIntakeVocCatalogResolution | undefined {
  const make = catalogWords(reviewedValues.make);
  const model = catalogWords(reviewedValues.model);
  if (!make || !model) return undefined;
  const makeModels = catalogModels.filter((item) => item.isActive && catalogWords(item.make) === make);
  const exact = makeModels.filter((item) => catalogWords(item.model) === model);
  if (exact.length === 1) return { item: exact[0], modelMatch: "exact" };
  if (exact.length > 1) return undefined;
  const baseMatches = makeModels.filter((item) => {
    const candidate = catalogWords(item.model);
    return candidate && model.startsWith(`${candidate} `);
  });
  if (!baseMatches.length) return undefined;
  const longestLength = Math.max(...baseMatches.map((item) => catalogWords(item.model).length));
  const longest = baseMatches.filter((item) => catalogWords(item.model).length === longestLength);
  return longest.length === 1 ? { item: longest[0], modelMatch: "base" } : undefined;
}

export function vehicleIntakeVocCatalogMatch(
  reviewedValues: Record<string, string | null | undefined>,
  catalogModels: readonly VehicleCatalogModel[]
) {
  return vehicleIntakeVocCatalogResolution(reviewedValues, catalogModels)?.item;
}

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
  decisions: Partial<Record<VehicleIntakeVocField, VehicleIntakeVocDecision>>,
  catalogModels: readonly VehicleCatalogModel[]
): VehicleIntakeVocPatch {
  const catalogMatch = vehicleIntakeVocCatalogMatch(reviewedValues, catalogModels);
  const patch: VehicleIntakeVocPatch = {};
  if (catalogMatch) {
    const currentMake = normalized(draft.make);
    const currentModel = normalized(draft.model);
    const makeMatches = catalogWords(currentMake) === catalogWords(catalogMatch.make);
    const modelMatches = catalogWords(currentModel) === catalogWords(catalogMatch.model);
    const canApplyPair = (!currentMake || makeMatches || decisions.make === "replace")
      && (!currentModel || modelMatches || decisions.model === "replace");
    if (canApplyPair) {
      if (!makeMatches) patch.make = catalogMatch.make;
      if (!modelMatches) patch.model = catalogMatch.model;
    }
  }
  return vocFields.reduce<VehicleIntakeVocPatch>((nextPatch, field) => {
    if (field.name === "make" || field.name === "model") return nextPatch;
    const extracted = normalized(reviewedValues[field.name]);
    const current = normalized(draft[field.name]);
    if (!extracted || (field.name === "year" && !validYear(extracted))) return nextPatch;
    if (current && (current === extracted || decisions[field.name] !== "replace")) return nextPatch;
    if (field.name === "year") nextPatch.year = Number(extracted);
    else nextPatch[field.name] = extracted;
    return nextPatch;
  }, patch);
}

export function vehicleIntakeVocDetectedFields(reviewedValues: Record<string, string | null | undefined>) {
  return vocFields
    .filter((field) => normalized(reviewedValues[field.name]) && (field.name !== "year" || validYear(normalized(reviewedValues.year))))
    .map((field) => field.name);
}

export function vehicleIntakeVocFieldState(
  draft: VehicleIntakeVocDraft,
  reviewedValues: Record<string, string | null | undefined>,
  field: VehicleIntakeVocField
) {
  const extracted = normalized(reviewedValues[field]);
  const detected = Boolean(extracted) && (field !== "year" || validYear(extracted));
  if (!detected) return "Enter manually";
  return normalized(draft[field]) ? "Existing entry kept" : "OCR-filled";
}

export function VehicleIntakeVocReview({
  draft,
  catalogModels,
  disabled,
  onReviewReady,
  onClear
}: {
  draft: VehicleIntakeVocDraft;
  catalogModels: readonly VehicleCatalogModel[];
  disabled?: boolean;
  onReviewReady: (patch: VehicleIntakeVocPatch, file: File, detectedFields: VehicleIntakeVocField[]) => void;
  onClear: () => void;
}) {
  const [result, setResult] = useState<OcrExtractionResult | null>(null);
  const [reviewedValues, setReviewedValues] = useState<Record<string, string | null | undefined>>({});
  const [busy, setBusy] = useState(false);
  const visibleWarnings = vocReviewWarnings(result?.warnings ?? []);
  const catalogResolution = vehicleIntakeVocCatalogResolution(reviewedValues, catalogModels);
  const catalogMatch = catalogResolution?.item;
  const ocrMake = normalized(reviewedValues.make);
  const ocrModel = normalized(reviewedValues.model);
  const hasExtractedCatalogText = Boolean(ocrMake || ocrModel);
  const needsCatalogConfirmation = hasExtractedCatalogText && !catalogMatch;
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
      const detectedFields = vehicleIntakeVocDetectedFields(nextValues);
      setResult(preview.result);
      setReviewedValues(nextValues);
      onReviewReady(vehicleIntakeVocPatch(draft, nextValues, {}, catalogModels), nextFile, detectedFields);
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

  const clear = () => {
    if (disabled || busy) return;
    setResult(null);
    setReviewedValues({});
    onClear();
  };

  return (
    <div className="vehicleIntakeVocReview">
      <Alert
        className="compactOcrGuidanceAlert"
        type="info"
        showIcon
        message="Optional VOC check / 可选 VOC 核对"
        description="Upload an English VOC (PDF: 1–15 readable, unencrypted pages; JPG, PNG, or WebP; maximum 10 MB). Suggestions fill empty fields only. Review them before Create Vehicle."
      />
      {!result ? (
        <Upload accept="application/pdf,image/jpeg,image/png,image/webp" maxCount={1} showUploadList={false} disabled={disabled || busy} customRequest={(option) => void scanVoc(option)}>
          <Button icon={<UploadOutlined />} loading={busy} disabled={disabled || busy}>Scan VOC / 扫描 VOC</Button>
        </Upload>
      ) : (
        <Space direction="vertical" size={12} className="fullWidth">
          <Alert
            className="compactOcrGuidanceAlert"
            type={result.confidence > 0 ? "warning" : "error"}
            showIcon
            message={result.confidence > 0 ? "VOC draft prepared — review the vehicle fields below" : "VOC could not be read automatically"}
            description={result.confidence > 0
              ? "Existing entries were preserved. Nothing is saved until you review the full intake and confirm Create Vehicle."
              : "Keep or enter the vehicle details manually. You can choose another clear VOC file."}
          />
          {visibleWarnings.length ? (
            <Alert
              className="compactOcrGuidanceAlert"
              type="warning"
              showIcon
              message={`${visibleWarnings.length} item${visibleWarnings.length === 1 ? "" : "s"} need manual confirmation`}
              description={<ul className="vehicleIntakeVocWarnings">{visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            />
          ) : null}
          {needsCatalogConfirmation ? (
            <Alert
              className="compactOcrGuidanceAlert"
              type="warning"
              showIcon
              message="OCR Make or Model is not in the catalogue"
              description={`OCR reference: ${ocrMake || "Make not detected"} / ${ocrModel || "Model not detected"}. Choose an existing Make and Model below, or explicitly add the checked option through the governed catalogue flow. OCR will not create or submit catalogue data.`}
            />
          ) : catalogResolution?.modelMatch === "base" ? (
            <Alert
              className="compactOcrGuidanceAlert"
              type="info"
              showIcon
              message={`Matched to catalogue: ${catalogResolution.item.make} / ${catalogResolution.item.model}`}
              description={`OCR reference: ${ocrMake} / ${ocrModel}. The detailed OCR variant remains visible for review; the vehicle will use the existing canonical catalogue model.`}
            />
          ) : null}
          <div className="vehicleIntakeVocSummary" aria-label="VOC extraction summary">
            {vocFields.map((field) => {
              const state = needsCatalogConfirmation && (field.name === "make" || field.name === "model") && !normalized(draft[field.name])
                ? "Select manually"
                : vehicleIntakeVocFieldState(draft, reviewedValues, field.name);
              return <Tag key={field.name} color={state === "OCR-filled" ? "blue" : state === "Existing entry kept" ? "green" : "default"}>{field.label}: {state}</Tag>;
            })}
            <Tag color={normalized(reviewedValues.ownerName) ? "green" : "default"}>Registered owner: {normalized(reviewedValues.ownerName) ? "Detected for reference" : "Not detected"}</Tag>
          </div>
          <Space wrap>
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
