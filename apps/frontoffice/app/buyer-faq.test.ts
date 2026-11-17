import { describe, expect, it } from "vitest";
import { buyerFaq, recommendedVehiclePriceFromSalary } from "./buyer-faq";

describe("buyer FAQ budget guidance", () => {
  it("maps gross salary to a rounded, bounded vehicle price recommendation", () => {
    expect(recommendedVehiclePriceFromSalary(3000)).toBe(36000);
    expect(recommendedVehiclePriceFromSalary(0)).toBe(0);
    expect(recommendedVehiclePriceFromSalary(-3000)).toBe(0);
    expect(recommendedVehiclePriceFromSalary(1)).toBe(0);
    expect(recommendedVehiclePriceFromSalary(Number.NaN)).toBe(0);
    expect(recommendedVehiclePriceFromSalary(50000)).toBe(300000);
  });

  it("keeps the salary interaction in every supported FAQ language", () => {
    expect(Object.values(buyerFaq).every((copy) => copy.questions[0]?.interaction === "salary")).toBe(true);
  });
});
