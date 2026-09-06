import { describe, expect, it } from "vitest";
import { settlementCompletionLabel, settlementPreview, settlementStatusLabel, settlementTotals } from "./settlements";

describe("seller settlement direction", () => {
  it("shows the three requested purchase-price and bank-debt scenarios", () => {
    expect(settlementPreview(30000, 25000)).toEqual({ direction: "PaySeller", amount: 5000 });
    expect(settlementPreview(30000, 35000)).toEqual({ direction: "CollectFromSeller", amount: 5000 });
    expect(settlementPreview(30000, 30000)).toEqual({ direction: "InternalOffset", amount: 0 });
  });

  it("uses cents and rejects invalid preview inputs", () => {
    expect(settlementPreview(30000.15, 30000.1)?.amount).toBe(0.05);
    expect(settlementPreview(30000, -1)).toBeUndefined();
    expect(settlementPreview(NaN, 0)).toBeUndefined();
    expect(settlementPreview(0, 0)).toBeUndefined();
  });

  it("does not label money collected or an offset as paid", () => {
    expect(settlementCompletionLabel({ direction: "CollectFromSeller" })).toBe("Confirm received");
    expect(settlementCompletionLabel({ direction: "InternalOffset" })).toBe("Confirm offset");
    expect(settlementStatusLabel({ direction: "CollectFromSeller", isPaid: true })).toBe("Received");
    expect(settlementStatusLabel({ direction: "InternalOffset", isPaid: false })).toBe("Offset to confirm");
  });

  it("keeps amounts due in each direction separate and preserves legacy payables", () => {
    const base = { id: "s", vehicleId: "v", deadline: "2026-09-07", isPaid: false };
    expect(settlementTotals([
      { ...base, amount: 1000 },
      { ...base, amount: 5000, direction: "PaySeller" },
      { ...base, amount: 5000, direction: "CollectFromSeller" },
      { ...base, amount: 0, direction: "InternalOffset" },
      { ...base, amount: 7000, direction: "PaySeller", isPaid: true }
    ])).toEqual({ toPay: 6000, toCollect: 5000, offsets: 1 });
  });
});
