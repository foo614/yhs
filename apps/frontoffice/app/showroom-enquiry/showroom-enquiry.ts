export const showroomVehicleTypes = ["Sedan", "SUV", "MPV", "Pickup"] as const;
export const showroomBudgetRanges = ["Under RM30k", "RM30k–RM50k", "RM50k–RM80k", "RM80k+"] as const;
export const showroomBrands = ["Toyota", "Honda", "Perodua", "Proton", "Other"] as const;

export function showroomStepError(step: number, values: {
  vehicleType: string;
  budgetRange: string;
  customerName: string;
  phone: string;
  consent: boolean;
}) {
  if (step === 1 && !values.vehicleType) return "Choose the type of vehicle you are looking for.";
  if (step === 2 && !values.budgetRange) return "Choose a budget range to continue.";
  if (step === 3 && !values.customerName.trim()) return "Please enter your name.";
  if (step === 3 && !values.phone.trim()) return "Please enter your phone number.";
  if (step === 3 && !values.consent) return "Please confirm that YS Heng Automotive may follow up on this enquiry.";
  return undefined;
}
