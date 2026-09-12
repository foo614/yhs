import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Form } from "antd";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OcrExtractionResult, VehicleCatalogModel } from "../../api";
import { VehicleMakeModelFields } from "./VehiclePage";
import { createVehicleIntakeVocPreviewRequestGate, isVehicleIntakeVocMimeType, VehicleIntakeVocReview, vehicleIntakeVocCatalogReference, vehicleIntakeVocCatalogResolution, vehicleIntakeVocDetectedFields, vehicleIntakeVocFieldState, vehicleIntakeVocPatch, vehicleIntakeVocPreviewApplication, vocReviewWarnings } from "./VehicleIntakeVocReview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("vehicle intake VOC review", () => {
  const catalogModels: VehicleCatalogModel[] = [
    { id: "proton-x70", make: "Proton", model: "X70", isActive: true },
    { id: "honda-civic", make: "Honda", model: "Civic", isActive: true },
    { id: "nissan-civic", make: "Nissan", model: "Civic", isActive: true }
  ];
  const reviewedValues = {
    plateNumber: "VAB1234",
    chassisNumber: "MMB12345678901234",
    engineNumber: "4B11T123456",
    make: "Proton",
    model: "X70",
    year: "2024",
    ownerName: "Registered owner"
  };

  it("fills only empty intake fields until staff explicitly applies the reviewed VOC", () => {
    expect(vehicleIntakeVocPatch({ plateNumber: "VAB1234", make: "", model: "", year: undefined }, reviewedValues, {}, catalogModels)).toEqual({
      chassisNumber: "MMB12345678901234",
      engineNumber: "4B11T123456",
      make: "Proton",
      model: "X70",
      year: 2024
    });
  });

  it("keeps differing nonblank intake values unless staff chooses Replace for that field", () => {
    const draft = { plateNumber: "VAB1234", make: "Honda", model: "CR-V", year: 2023 };

    expect(vehicleIntakeVocPatch(draft, reviewedValues, {}, catalogModels)).toEqual({
      chassisNumber: "MMB12345678901234",
      engineNumber: "4B11T123456"
    });
    expect(vehicleIntakeVocPatch(draft, reviewedValues, { make: "replace", year: "replace" }, catalogModels)).toEqual({
      chassisNumber: "MMB12345678901234",
      engineNumber: "4B11T123456",
      year: 2024
    });
    expect(vehicleIntakeVocPatch(draft, reviewedValues, { make: "replace", model: "replace" }, catalogModels)).toMatchObject({ make: "Proton", model: "X70" });
  });

  it("does not apply an invalid OCR year", () => {
    expect(vehicleIntakeVocPatch({}, { ...reviewedValues, year: "2099" }, {}, catalogModels)).not.toHaveProperty("year");
  });

  it("selects a unique canonical model base within the matched Make and preserves match type", () => {
    const resolution = vehicleIntakeVocCatalogResolution({ make: "HONDA", model: "CIVIC 1.5L V" }, catalogModels);

    expect(resolution).toMatchObject({ item: { make: "Honda", model: "Civic" }, modelMatch: "base" });
    expect(vehicleIntakeVocPatch({}, { make: "HONDA", model: "CIVIC 1.5L V" }, {}, catalogModels)).toEqual({ make: "Honda", model: "Civic" });
  });

  it("resolves a no-delimiter combined Make and Model to one canonical catalogue pair", () => {
    const resolution = vehicleIntakeVocCatalogResolution({ make: "HONDA CIVIC 1.5L V", model: null }, catalogModels);

    expect(resolution).toMatchObject({ item: { make: "Honda", model: "Civic" }, modelMatch: "base" });
    expect(vehicleIntakeVocPatch({}, { make: "HONDA CIVIC 1.5L V", model: null }, {}, catalogModels)).toEqual({ make: "Honda", model: "Civic" });
    expect(vehicleIntakeVocCatalogReference({ make: "HONDA CIVIC 1.5L V", model: null })).toBe("HONDA CIVIC 1.5L V");
  });

  it("takes an API-shaped VOC preview through the apply callback into visible canonical selectors", () => {
    const result: OcrExtractionResult = {
      documentCategory: "Voc",
      confidence: 0.9,
      fieldConfidence: {},
      fields: {
        plateNumber: "QAA1234",
        chassisNumber: "SYNTHCHASSIS12345",
        engineNumber: "SYNTHENGINE67890",
        make: "HONDA CIVIC 1.5L V",
        model: null,
        year: "2024"
      },
      rawText: "redacted provider fixture",
      warnings: []
    };
    const applied = vehicleIntakeVocPreviewApplication({}, result, catalogModels);
    const formValues = { ...applied.patch };
    const markup = renderToStaticMarkup(createElement(Form, { initialValues: formValues },
      createElement(VehicleMakeModelFields, {
        catalogModels,
        onCreateCatalogModel: async () => false
      })));

    expect(applied.patch).toEqual({
      plateNumber: "QAA1234",
      chassisNumber: "SYNTHCHASSIS12345",
      engineNumber: "SYNTHENGINE67890",
      make: "Honda",
      model: "Civic",
      year: 2024
    });
    expect(applied.detectedFields).toEqual(["plateNumber", "chassisNumber", "engineNumber", "make", "model", "year"]);
    expect(markup).toMatch(/ant-select-selection-item[^>]*title="Honda"[^>]*>Honda/);
    expect(markup).toMatch(/ant-select-selection-item[^>]*title="Civic"[^>]*>Civic/);
  });

  it("does not report or apply a canonical Model when the existing Make conflicts", () => {
    const result: OcrExtractionResult = {
      documentCategory: "Voc",
      confidence: 0.9,
      fieldConfidence: {},
      fields: { make: "HONDA CIVIC 1.5L V", model: null },
      rawText: "redacted provider fixture",
      warnings: []
    };

    const applied = vehicleIntakeVocPreviewApplication({ make: "Proton" }, result, catalogModels);

    expect(applied.patch).toEqual({});
    expect(applied.detectedFields).toEqual(["make"]);
    const reviewSource = readFileSync(fileURLToPath(new URL("./VehicleIntakeVocReview.tsx", import.meta.url)), "utf8");
    expect(reviewSource).toContain("VOC Make and Model conflict with the existing entry");
    expect(reviewSource).toContain("The existing Make or Model was preserved");
  });

  it("requires manual selection for ambiguous prefixes, wrong-Make models, and no match", () => {
    const ambiguous = [
      ...catalogModels,
      { id: "honda-civic-hyphen", make: "Honda", model: "Civic-X", isActive: true },
      { id: "honda-civic-space", make: "Honda", model: "Civic X", isActive: true }
    ];

    expect(vehicleIntakeVocCatalogResolution({ make: "Honda", model: "Civic X Premium" }, ambiguous)).toBeUndefined();
    expect(vehicleIntakeVocCatalogResolution({ make: "Honda", model: "Nissan Leaf" }, catalogModels)).toBeUndefined();
    expect(vehicleIntakeVocCatalogResolution({ make: "Unknown", model: "Civic" }, catalogModels)).toBeUndefined();
    expect(vehicleIntakeVocCatalogResolution({ make: "Honda", model: "Accord" }, catalogModels)).toBeUndefined();
    expect(vehicleIntakeVocCatalogResolution({ make: "HONDA CIVIC X PREMIUM", model: null }, ambiguous)).toBeUndefined();
  });

  it("distinguishes OCR-filled fields from fields that still need manual entry", () => {
    expect(vehicleIntakeVocDetectedFields({ plateNumber: "VAB1234", chassisNumber: null, year: "2024" })).toEqual(["plateNumber", "year"]);
    expect(vehicleIntakeVocFieldState({}, reviewedValues, "make")).toBe("OCR-filled");
    expect(vehicleIntakeVocFieldState({ make: "Honda" }, reviewedValues, "make")).toBe("Existing entry kept");
    expect(vehicleIntakeVocFieldState({}, { chassisNumber: null }, "chassisNumber")).toBe("Enter manually");
  });

  it("keeps the compact extraction summary wrapping across desktop, tablet, and mobile widths", () => {
    const styles = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");
    expect(styles).toMatch(/\.vehicleIntakeVocSummary\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
    expect(styles).not.toMatch(/\.vehicleIntakeVocSummary\s*\{[^}]*width:\s*\d+px;/s);
  });

  it("keeps OCR guidance compact and separated from the following control at every width", () => {
    const styles = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");
    const reviewSource = readFileSync(fileURLToPath(new URL("./VehicleIntakeVocReview.tsx", import.meta.url)), "utf8");
    const vehiclePageSource = readFileSync(fileURLToPath(new URL("./VehiclePage.tsx", import.meta.url)), "utf8");
    expect(styles).toMatch(/\.vehicleIntakeVocReview\s*\{[^}]*display:\s*grid;[^}]*gap:\s*12px;/s);
    expect(styles).toMatch(/\.compactOcrGuidanceAlert\.ant-alert\s*\{[^}]*padding:\s*8px 12px;/s);
    expect(styles).toMatch(/\.vehicleIntakeOwnerReviewAlert\.ant-alert\s*\{[^}]*margin-bottom:\s*16px;/s);
    expect(styles).not.toMatch(/@media[^}]*\.compactOcrGuidanceAlert[^}]*padding:\s*0/s);
    expect(reviewSource).toContain('className="compactOcrGuidanceAlert"');
    expect(vehiclePageSource).toContain('className="compactOcrGuidanceAlert vehicleIntakeOwnerReviewAlert"');
  });

  it("uses governed catalogue selectors for vehicle edits while preserving current legacy values", () => {
    const vehiclePageSource = readFileSync(fileURLToPath(new URL("./VehiclePage.tsx", import.meta.url)), "utf8");
    expect(vehiclePageSource).toContain('legacySelection={{ make: selectedVehicle?.make, model: selectedVehicle?.model }}');
    expect(vehiclePageSource).not.toContain('<Form.Item name="make" label="Make"><Input placeholder="Toyota" /></Form.Item>');
    expect(vehiclePageSource).toContain("(current saved value)");
  });

  it("accepts the intake VOC file types without broadening the NRIC image-only rule", () => {
    expect(isVehicleIntakeVocMimeType("application/pdf")).toBe(true);
    expect(isVehicleIntakeVocMimeType("image/jpeg")).toBe(true);
    expect(isVehicleIntakeVocMimeType("text/plain")).toBe(false);
  });

  it("keeps actionable OCR warnings while removing the repeated provider explanation", () => {
    expect(vocReviewWarnings([
      "Google Document AI result. Review extracted values before saving.",
      "No chassis number was detected. Confirm the VOC manually before saving vehicle details."
    ])).toEqual(["No chassis number was detected. Confirm the VOC manually before saving vehicle details."]);
  });

  it("disables the initial scan control when the intake is disabled", () => {
    const markup = renderToStaticMarkup(createElement(VehicleIntakeVocReview, {
      draft: {},
      catalogModels,
      disabled: true,
      onReviewReady: () => undefined,
      onClear: () => undefined
    }));

    expect(markup).toMatch(/<button[^>]*disabled[^>]*>.*Scan VOC/s);
  });

  it("keeps a deferred stale preview or error from replacing the active preview state", async () => {
    const gate = createVehicleIntakeVocPreviewRequestGate();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];
    let busy = true;
    const firstRequest = gate.begin();
    const secondRequest = gate.begin();

    void first.promise.then(
      (value) => { if (gate.isCurrent(firstRequest)) committed.push(value); },
      () => { if (gate.isCurrent(firstRequest)) busy = false; }
    );
    void second.promise.then((value) => {
      if (gate.isCurrent(secondRequest)) {
        committed.push(value);
        busy = false;
      }
    });

    first.reject(new Error("first preview failed after replacement"));
    await Promise.resolve();
    expect(busy).toBe(true);
    expect(committed).toEqual([]);

    second.resolve("newest preview");
    await Promise.resolve();
    expect(busy).toBe(false);
    expect(committed).toEqual(["newest preview"]);
  });

  it("invalidates an in-flight preview when the review unmounts", async () => {
    const gate = createVehicleIntakeVocPreviewRequestGate();
    const preview = deferred<string>();
    const committed: string[] = [];
    const request = gate.begin();

    void preview.promise.then((value) => {
      if (gate.isCurrent(request)) committed.push(value);
    });
    gate.dispose();
    preview.resolve("late preview");
    await Promise.resolve();

    expect(committed).toEqual([]);
  });
});
