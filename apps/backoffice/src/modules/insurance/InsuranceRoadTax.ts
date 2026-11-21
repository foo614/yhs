export type InsuranceRoadTaxInput = {
  region: string;
  vehicleClass: string;
  fuel: string;
  /** Engine cc for ICE; registered motor kW for EV. */
  capacity: number | null | undefined;
  months: number;
};
export type InsuranceRoadTaxResult = { amount: number; annualAmount: number } | { reason: string; manualRequired?: true };

type IceRates = { flat: number[]; progressive: [number, number][] };
// JPJ Lampiran A, private AB/AC/AD/AE tables (Peninsular pp1–3,
// Sabah pp18–20, Sarawak pp29–30). All values below are integer RM cents.
// https://www.jpj.gov.my/wp-content/uploads/2026/07/Lampiran-A-Garis_Panduan_Pengiraan_LKM_Bajet_20092-2.pdf
const peninsularIndividual: IceRates = { flat: [2000, 5500, 7000, 9000], progressive: [[20000, 40], [28000, 50], [38000, 100], [88000, 250], [213000, 450]] };
const peninsularCompany: IceRates = { flat: [2000, 11000, 14000, 18000], progressive: [[40000, 80], [56000, 100], [76000, 300], [226000, 750], [601000, 1350]] };
const peninsularNonSaloon: IceRates = { flat: [2000, 8500, 10000, 12000], progressive: [[30000, 30], [36000, 40], [44000, 80], [84000, 160], [164000, 160]] };
const eastSaloon: IceRates = { flat: [2000, 4400, 5600, 7200], progressive: [[16000, 32], [22400, 25], [27400, 50], [52400, 100], [102400, 135]] };
const eastNonSaloon: IceRates = { flat: [2000, 4250, 5000, 6000], progressive: [[16500, 17], [19900, 22], [24300, 44], [46300, 88], [90300, 120]] };

// JPJ circular 01/2026 (1 April 2026), section2, AB/AC/AD/AE.
// First band ends at50kW; every subsequent band spans another10kW.
// https://www.jpj.gov.my/wp-content/uploads/2026/07/Lampiran-B-01.04.2026-Garis-Panduan-Kadar-LKM-Bagi-Kenderaan-Motor-Elektrik-ZEVs.pdf
const evAnnualRinggit = [
  20, 30, 40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280,
  305, 335, 365, 395, 425, 455, 485, 515, 545, 575, 615, 665, 715, 765, 815,
  865, 915, 965, 1015, 1065, 1140, 1240, 1340, 1440, 1540, 1640, 1740, 1840,
  1940, 2040, 2165, 2315, 2465, 2615, 2765, 2915, 3065, 3215, 3365, 3515,
  3690, 3890, 4090, 4290, 4490, 4690, 4890, 5090, 5290, 5490, 5715, 5965,
  6215, 6465, 6715, 6965, 7215, 7465, 7715, 7965, 8240, 8540, 8840, 9140,
  9440, 9740, 10040, 10340, 10640, 10940, 11265, 11615, 11965, 12315,
  12665, 13015, 13365, 13715, 14065, 14415
];

export function calculateInsuranceRoadTax(input: InsuranceRoadTaxInput): InsuranceRoadTaxResult {
  if (input.months === 6) return { reason: "Six-month pricing requires separate JPJ verification. Enter the confirmed amount manually.", manualRequired: true };
  if (input.months !== 12) return { reason: "Select a supported road-tax term." };
  if (input.region && !["Peninsular", "Sabah", "Sarawak", "Other"].includes(input.region)) return { reason: "Select the registered region. Use Other for islands and other regions." };
  if (input.vehicleClass && !["AB", "AC", "AD", "AE", "Other"].includes(input.vehicleClass)) return { reason: "Select the registered usage class; do not infer it from the model." };
  if (input.fuel && !["Petrol", "Diesel", "GreenDiesel", "EV", "Other"].includes(input.fuel)) return { reason: "Select the registered fuel type." };
  if (input.region === "Other") return { reason: "Islands and other regions require a confirmed manual JPJ amount.", manualRequired: true };
  if (input.vehicleClass === "Other") return { reason: "Registrations outside private AB/AC/AD/AE require a confirmed manual JPJ amount.", manualRequired: true };
  if (input.fuel === "Other") return { reason: "Other registered fuels require a confirmed manual JPJ amount.", manualRequired: true };
  if (!input.region) return { reason: "Select the registered region." };
  if (!input.vehicleClass) return { reason: "Select the registered usage class; do not infer it from the model." };
  if (!input.fuel) return { reason: "Select the registered fuel type." };
  const capacity = input.capacity;
  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) return { reason: "Enter a positive registered engine cc or EV motor kW." };
  if (input.fuel === "EV") {
    if (!/^\d+(?:\.\d{1,3})?$/.test(String(capacity))) return { reason: "Enter registered motor kW with at most three decimal places." };
    if (capacity > 10000) return { reason: "Motor powers above 10000 kW require manual JPJ verification.", manualRequired: true };
    const watts = Math.round(capacity * 1000);
    const band = watts <= 50000 ? 0 : Math.ceil((watts - 50000) / 10000);
    // P.U. (A) 464/2025, effective 1 January 2026, clarifies the final
    // RM20,000 band as 1,010,001 W and above (the circular has an ambiguous label).
    // https://lom.agc.gov.my/ilims/upload/portal/akta/outputp/3275488/PUA%20464_2025.pdf (p6)
    const annualAmount = watts >= 1010001 ? 20000 : evAnnualRinggit[band];
    return { amount: annualAmount, annualAmount };
  }
  if (!Number.isInteger(capacity)) return { reason: "Enter registered engine capacity as a positive whole number of cc." };
  if (capacity > 10000) return { reason: "Engine capacities above 10000 cc require manual JPJ verification.", manualRequired: true };
  const nonSaloon = input.vehicleClass === "AD" || input.vehicleClass === "AE";
  if (input.region === "Sabah" && nonSaloon && input.fuel !== "Petrol") return { reason: "Sabah non-saloon diesel rates depend on the registered four-wheel-drive exception. Verify the amount manually.", manualRequired: true };
  const rates = input.region === "Peninsular"
    ? nonSaloon ? peninsularNonSaloon : input.vehicleClass === "AB" ? peninsularIndividual : peninsularCompany
    : nonSaloon ? eastNonSaloon : eastSaloon;
  const boundaries = [1000, 1200, 1400, 1600];
  const flat = boundaries.findIndex(limit => capacity <= limit);
  if (flat >= 0) return { amount: rates.flat[flat] / 100, annualAmount: rates.flat[flat] / 100 };
  const thresholds = [1600, 1800, 2000, 2500, 3000];
  const band = capacity <= 1800 ? 0 : capacity <= 2000 ? 1 : capacity <= 2500 ? 2 : capacity <= 3000 ? 3 : 4;
  const [base, perCc] = rates.progressive[band];
  const annualAmount = (base + (capacity - thresholds[band]) * perCc) / 100;
  return { amount: annualAmount, annualAmount };
}

function daysInMonth(year: number, month: number) {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Date-only draft suggestion. Callers retain the user's manual override. */
export function roadTaxExpiryFromInsurance(insuranceExpiry: string | null | undefined, months: number): string | null {
  if (!insuranceExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(insuranceExpiry) || (months !== 6 && months !== 12)) return null;
  const [year, month, day] = insuranceExpiry.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (months === 12) return insuranceExpiry;
  const targetYear = month <= 6 ? year - 1 : year;
  const targetMonth = month <= 6 ? month + 6 : month - 6;
  if (targetYear < 1) return null;
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, daysInMonth(targetYear, targetMonth))).padStart(2, "0")}`;
}
