import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createPurchaseInvoiceHistoryRequestGate, OwnerPurchaseInvoiceDetails, purchaseInvoiceRevisionChanges } from "./OwnerPurchaseInvoiceDetails";
import type { PurchaseInvoice, PurchaseInvoiceRevision } from "../../api";

const revisionOne: PurchaseInvoiceRevision = {
  id: "revision-1",
  purchaseInvoiceId: "invoice-1",
  revisionNumber: 1,
  invoiceNumber: "PI-20260906-0001",
  sourceVehicleId: "vehicle-1",
  sourceOwnerId: "owner-1",
  invoiceDate: "2026-09-06",
  purchaseDate: "2026-09-05",
  sellerName: "Previous Owner",
  sellerPhone: "0123456789",
  vehiclePlateNumber: "VAA1001",
  vehicleDescription: "2022 Toyota Vios",
  amount: 42000,
  accountingStatus: "Draft",
  createdBy: "staff-1",
  createdAt: "2026-09-06T08:00:00Z",
  lines: [{ id: "line-1", purchaseInvoiceId: "invoice-1", lineType: "VehiclePurchase", description: "Vehicle purchase", amount: 42000, capitaliseIntoVehicleCost: true, sortOrder: 1 }]
};

describe("OwnerPurchaseInvoiceDetails", () => {
  it("keeps the Vehicle Details view simple while retaining Edit and the current PDF", () => {
    const invoice: PurchaseInvoice = { id: "invoice-1", vehicleId: "vehicle-1", ownerId: "owner-1", sourceType: "OwnerAcquisition", invoiceNumber: revisionOne.invoiceNumber, amount: revisionOne.amount, accountingStatus: "Draft", currentRevisionNumber: 1, currentRevision: revisionOne };
    const markup = renderToStaticMarkup(createElement(OwnerPurchaseInvoiceDetails, { invoice, onCreateRevision: async () => invoice }));
    expect(markup).toContain(">Edit<");
    expect(markup).toContain("Download PDF");
    expect(markup).not.toContain("Version history");
    expect(markup).not.toContain("Finance status");
    expect(markup).not.toContain("Issued official version");
  });

  it("ignores a deferred invoice A history response after the drawer switches to invoice B", async () => {
    let resolveA!: (value: PurchaseInvoiceRevision[]) => void;
    let resolveB!: (value: PurchaseInvoiceRevision[]) => void;
    const deferredA = new Promise<PurchaseInvoiceRevision[]>((resolve) => { resolveA = resolve; });
    const deferredB = new Promise<PurchaseInvoiceRevision[]>((resolve) => { resolveB = resolve; });
    const gate = createPurchaseInvoiceHistoryRequestGate("invoice-a");
    const applied: Array<{ invoiceId: string; revisions: PurchaseInvoiceRevision[] }> = [];
    const applyWhenCurrent = async (request: NonNullable<ReturnType<typeof gate.begin>>, pending: Promise<PurchaseInvoiceRevision[]>) => {
      const revisions = await pending;
      if (gate.canApply(request)) applied.push({ invoiceId: request.invoiceId, revisions });
    };

    const requestA = gate.begin("invoice-a")!;
    const pendingA = applyWhenCurrent(requestA, deferredA);
    gate.switchInvoice("invoice-b");
    const requestB = gate.begin("invoice-b")!;
    const pendingB = applyWhenCurrent(requestB, deferredB);

    resolveB([{ ...revisionOne, id: "revision-b", purchaseInvoiceId: "invoice-b", sourceVehicleId: "vehicle-b", revisionNumber: 2 }]);
    await pendingB;
    resolveA([revisionOne]);
    await pendingA;

    expect(applied).toEqual([{ invoiceId: "invoice-b", revisions: [expect.objectContaining({ id: "revision-b", purchaseInvoiceId: "invoice-b" })] }]);
  });

  it("summarises an immutable initial issue and readable before/after corrections", () => {
    expect(purchaseInvoiceRevisionChanges(undefined, revisionOne)).toEqual([{ field: "Issued", before: "—", after: "Initial official version" }]);

    const revised = {
      ...revisionOne,
      revisionNumber: 2,
      sellerTinNumber: "C1234567890",
      amount: 42120,
      lines: [{ ...revisionOne.lines[0], amount: 42120 }]
    };
    expect(purchaseInvoiceRevisionChanges(revisionOne, revised)).toEqual(expect.arrayContaining([
      { field: "Seller TIN", before: "Not provided", after: "C1234567890" },
      { field: "Total", before: "RM 42,000.00", after: "RM 42,120.00" }
    ]));
  });

  it("keeps Finance history read-only while exposing official state, current PDF, and version history", () => {
    const invoice: PurchaseInvoice = {
      id: "invoice-1",
      vehicleId: "vehicle-1",
      ownerId: "owner-1",
      sourceType: "OwnerAcquisition",
      invoiceNumber: revisionOne.invoiceNumber,
      amount: revisionOne.amount,
      accountingStatus: "Draft",
      currentRevisionNumber: 1,
      currentRevision: revisionOne
    };

    const markup = renderToStaticMarkup(createElement(OwnerPurchaseInvoiceDetails, { invoice, allowCorrections: false }));

    expect(markup).toContain("Formal owner-acquisition invoice");
    expect(markup).toContain("Issued official version");
    expect(markup).toContain("Pending Finance review");
    expect(markup).toContain("purchaseInvoiceStatusTag");
    expect(markup).toContain("Download current PDF");
    expect(markup).toContain("Version history");
    expect(markup).not.toContain("Correct with new version");
  });

  it("shows the Finance reviewer and review time retained on a confirmed version", () => {
    const confirmedRevision: PurchaseInvoiceRevision = {
      ...revisionOne,
      accountingStatus: "FinanceConfirmed",
      accountingConfirmedBy: "finance@ysheng.local",
      accountingConfirmedAt: "2026-09-06T09:30:00Z"
    };
    const invoice: PurchaseInvoice = {
      id: "invoice-1",
      vehicleId: "vehicle-1",
      ownerId: "owner-1",
      sourceType: "OwnerAcquisition",
      invoiceNumber: confirmedRevision.invoiceNumber,
      amount: confirmedRevision.amount,
      accountingStatus: "FinanceConfirmed",
      currentRevisionNumber: 1,
      currentRevision: confirmedRevision
    };

    const markup = renderToStaticMarkup(createElement(OwnerPurchaseInvoiceDetails, { invoice, allowCorrections: false }));

    expect(markup).toContain("Finance reviewed by finance@ysheng.local");
    expect(markup).toContain("06 Sep 2026");
  });
});
