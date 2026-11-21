import { describe, expect, it } from "vitest";
import { calculateInsuranceRoadTax, roadTaxExpiryFromInsurance, type InsuranceRoadTaxInput } from "./InsuranceRoadTax";

const base: InsuranceRoadTaxInput = { region: "Peninsular", vehicleClass: "AB", fuel: "Petrol", capacity: 1500, months: 12 };
type Boundary = [number, number, number, number];
const tables: { name: string; regions: string[]; classes: string[]; bands: Boundary[] }[] = [
  { name: "Peninsular individual saloon", regions: ["Peninsular"], classes: ["AB"], bands: [
    [1, 1000, 20, 20], [1001, 1200, 55, 55], [1201, 1400, 70, 70], [1401, 1600, 90, 90],
    [1601, 1800, 200.40, 280], [1801, 2000, 280.50, 380], [2001, 2500, 381, 880], [2501, 3000, 882.50, 2130], [3001, 10000, 2134.50, 33630]
  ] },
  { name: "Peninsular company saloon", regions: ["Peninsular"], classes: ["AC"], bands: [
    [1, 1000, 20, 20], [1001, 1200, 110, 110], [1201, 1400, 140, 140], [1401, 1600, 180, 180],
    [1601, 1800, 400.80, 560], [1801, 2000, 561, 760], [2001, 2500, 763, 2260], [2501, 3000, 2267.50, 6010], [3001, 10000, 6023.50, 100510]
  ] },
  { name: "Peninsular non-saloon", regions: ["Peninsular"], classes: ["AD", "AE"], bands: [
    [1, 1000, 20, 20], [1001, 1200, 85, 85], [1201, 1400, 100, 100], [1401, 1600, 120, 120],
    [1601, 1800, 300.30, 360], [1801, 2000, 360.40, 440], [2001, 2500, 440.80, 840], [2501, 3000, 841.60, 1640], [3001, 10000, 1641.60, 12840]
  ] },
  { name: "Sabah/Sarawak saloon", regions: ["Sabah", "Sarawak"], classes: ["AB", "AC"], bands: [
    [1, 1000, 20, 20], [1001, 1200, 44, 44], [1201, 1400, 56, 56], [1401, 1600, 72, 72],
    [1601, 1800, 160.32, 224], [1801, 2000, 224.25, 274], [2001, 2500, 274.50, 524], [2501, 3000, 525, 1024], [3001, 10000, 1025.35, 10474]
  ] },
  { name: "Sabah/Sarawak non-saloon", regions: ["Sabah", "Sarawak"], classes: ["AD", "AE"], bands: [
    [1, 1000, 20, 20], [1001, 1200, 42.50, 42.50], [1201, 1400, 50, 50], [1401, 1600, 60, 60],
    [1601, 1800, 165.17, 199], [1801, 2000, 199.22, 243], [2001, 2500, 243.44, 463], [2501, 3000, 463.88, 903], [3001, 10000, 904.20, 9303]
  ] }
];

// These cases prevent applying the wrong owner/region table or charging the
// next band one cc early. Values are independently transcribed from JPJ tables.
describe.each(tables)("verified JPJ annual ICE: $name", table => {
  it("charges the exact lower and upper boundary of every band for each supported registration", () => {
    for (const region of table.regions) for (const vehicleClass of table.classes) for (const fuel of ["Petrol", "Diesel", "GreenDiesel"]) {
      if (region === "Sabah" && ["AD", "AE"].includes(vehicleClass) && fuel !== "Petrol") continue;
      for (const [lower, upper, firstPrice, lastPrice] of table.bands) {
        expect(calculateInsuranceRoadTax({ ...base, region, vehicleClass, fuel, capacity: lower })).toEqual({ amount: firstPrice, annualAmount: firstPrice });
        expect(calculateInsuranceRoadTax({ ...base, region, vehicleClass, fuel, capacity: upper })).toEqual({ amount: lastPrice, annualAmount: lastPrice });
      }
    }
  });
});

describe("verified JPJ annual EV", () => {
  // Watt-level edges and all96 consecutive 10kW bands prevent accidental use
  // of old exemption/progressive tariffs or rounded motor-kW inputs.
  it("applies every 2026 private EV band at its first and last registered watt", () => {
    const expected = [
      20, 30, 40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280,
      305, 335, 365, 395, 425, 455, 485, 515, 545, 575, 615, 665, 715, 765, 815,
      865, 915, 965, 1015, 1065, 1140, 1240, 1340, 1440, 1540, 1640, 1740, 1840,
      1940, 2040, 2165, 2315, 2465, 2615, 2765, 2915, 3065, 3215, 3365, 3515,
      3690, 3890, 4090, 4290, 4490, 4690, 4890, 5090, 5290, 5490, 5715, 5965,
      6215, 6465, 6715, 6965, 7215, 7465, 7715, 7965,
      8240, 8540, 8840, 9140, 9440, 9740, 10040, 10340, 10640, 10940,
      11265, 11615, 11965, 12315, 12665, 13015, 13365, 13715, 14065, 14415
    ];
    for (const region of ["Peninsular", "Sabah", "Sarawak"]) for (const vehicleClass of ["AB", "AC", "AD", "AE"]) {
      expected.forEach((annualAmount, index) => {
        const upperWatt = index === 0 ? 50000 : 50000 + index * 10000;
        const lowerWatt = index === 0 ? 1 : upperWatt - 9999;
        for (const capacity of [lowerWatt / 1000, upperWatt / 1000]) expect(calculateInsuranceRoadTax({ ...base, region, vehicleClass, fuel: "EV", capacity })).toEqual({ amount: annualAmount, annualAmount });
      });
    }
    expect(calculateInsuranceRoadTax({ ...base, fuel: "EV", capacity: 1010.001 })).toEqual({ amount: 20000, annualAmount: 20000 });
    expect(calculateInsuranceRoadTax({ ...base, fuel: "EV", capacity: 10000 })).toEqual({ amount: 20000, annualAmount: 20000 });
    expect(calculateInsuranceRoadTax({ ...base, fuel: "EV", capacity: 83.003 })).toEqual({ amount: 60, annualAmount: 60 });
  });
});

describe("unverified registrations and terms", () => {
  it("requires manual confirmation instead of guessing six-month rounding or unsupported inputs", () => {
    const manual: Partial<InsuranceRoadTaxInput>[] = [
      { months: 6 }, { months: 6, region: "", vehicleClass: "", fuel: "", capacity: null },
      { region: "Other" }, { vehicleClass: "Other" }, { fuel: "Other" },
      { region: "Other", vehicleClass: "", fuel: "", capacity: null },
      { region: "", vehicleClass: "Other", fuel: "", capacity: null },
      { region: "", vehicleClass: "", fuel: "Other", capacity: null },
      { capacity: 10001 }, { fuel: "EV", capacity: 10000.001 },
      { region: "Sabah", vehicleClass: "AD", fuel: "Diesel" }, { region: "Sabah", vehicleClass: "AE", fuel: "GreenDiesel" }
    ];
    for (const input of manual) {
      const result = calculateInsuranceRoadTax({ ...base, ...input });
      expect(result).toMatchObject({ reason: expect.any(String), manualRequired: true });
      expect(result).not.toHaveProperty("amount");
    }
    const invalid: Partial<InsuranceRoadTaxInput>[] = [
      { months: 0 }, { months: 24 }, { region: "Labuan" }, { region: "Langkawi" }, { region: "Pangkor" }, { region: "" },
      { vehicleClass: "AH" }, { vehicleClass: "AA" }, { vehicleClass: "BA" }, { vehicleClass: "" }, { fuel: "Hybrid" }, { fuel: "" },
      { region: "Other", vehicleClass: "UNKNOWN" }, { vehicleClass: "Other", fuel: "UNKNOWN" },
      ...[null, undefined, 0, -1, NaN, Infinity, 1499.5, 10000.5].map(capacity => ({ capacity })),
      ...[0.0001, 50.0001, 83.00300000001, 10000.0001].map(capacity => ({ fuel: "EV", capacity }))
    ];
    for (const input of invalid) {
      const result = calculateInsuranceRoadTax({ ...base, ...input });
      expect(result).toHaveProperty("reason");
      expect(result).not.toHaveProperty("manualRequired");
      expect(result).not.toHaveProperty("amount");
    }
  });
});

describe("road-tax expiry draft from insurance expiry", () => {
  // Calendar clamping prevents charging/recording coverage through an impossible
  // day or rolling the date into a later month when subtracting six months.
  it.each([
    ["2027-08-31", 6, "2027-02-28"], ["2024-08-31", 6, "2024-02-29"],
    ["2024-02-29", 6, "2023-08-29"], ["2027-03-31", 6, "2026-09-30"],
    ["2027-01-31", 6, "2026-07-31"], ["2024-02-29", 12, "2024-02-29"],
    ["2000-08-31", 6, "2000-02-29"], ["1900-08-31", 6, "1900-02-28"]
  ])("maps %s for %s months to %s", (insurance, months, expected) => {
    expect(roadTaxExpiryFromInsurance(insurance, months)).toBe(expected);
  });
  it("rejects missing, non-date-only, impossible dates and unsupported terms", () => {
    for (const date of [null, undefined, "", "2027-2-03", "2027-02-29", "2024-02-30", "2027-04-31", "2027-13-01", "2027-00-01", "2027-01-00", "0000-01-01", "2027-01-01T00:00:00Z", " 2027-01-01"]) expect(roadTaxExpiryFromInsurance(date, 6)).toBeNull();
    expect(roadTaxExpiryFromInsurance("0001-01-01", 6)).toBeNull();
    expect(roadTaxExpiryFromInsurance("2027-01-01", 3)).toBeNull();
  });
});
