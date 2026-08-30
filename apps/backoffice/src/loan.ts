import type { Customer, DocumentCategory, LoanApplication, LoanDocumentCheck, VehicleLookup } from "./api";

export const loanDocumentCategories = ["Voc", "ApDocument", "StatusReceipt", "LoanDocument"] as const;

export function canCreateManualLoan(roles: readonly string[]) {
  return roles.includes("BossAdmin");
}

export function canUploadLoanChecklistDocument(roles: readonly string[], category: DocumentCategory) {
  return roles.includes("BossAdmin") || (roles.includes("Loan") && category === "LoanDocument");
}

export function loanDocumentChecklistStatus(category: DocumentCategory, isPresent: boolean) {
  if (category === "LoanDocument") {
    return isPresent ? "Uploaded and ready" : "Not uploaded yet";
  }

  return isPresent ? "Provided by Sales" : "Missing — request from Sales";
}

export type LoanFilters = {
  keyword?: string;
  status?: LoanApplication["status"] | "All";
  documents?: "All" | "Missing" | "Complete";
  vehicleId?: string;
};

export function filterLoanApplications(
  loans: LoanApplication[],
  vehicles: VehicleLookup[],
  customers: Customer[],
  documentChecks: Record<string, LoanDocumentCheck>,
  filters: LoanFilters
) {
  const keyword = normalizeFilterValue(filters.keyword);

  return loans.filter((loan) => {
    const vehicle = vehicles.find((item) => item.id === loan.vehicleId);
    const customer = customers.find((item) => item.id === loan.customerId);
    const check = documentChecks[loan.id];
    const matchesKeyword = !keyword || matchesFilterValue(keyword, [
      vehicle?.plateNumber,
      customer?.name,
      customer?.phone,
      loan.status,
      loan.submittedAt
    ]);
    const matchesStatus = !filters.status || filters.status === "All" || loan.status === filters.status;
    const matchesDocuments = !filters.documents || filters.documents === "All" ||
      (filters.documents === "Complete" ? check?.isComplete === true : check?.isComplete !== true);
    const matchesVehicle = !filters.vehicleId || loan.vehicleId === filters.vehicleId;

    return matchesKeyword && matchesStatus && matchesDocuments && matchesVehicle;
  });
}

export function loanCreateBlockReason(loan: LoanApplication) {
  if ((loan.status === "Pending" || loan.status === "Approved" || loan.status === "Done") && !loan.submittedAt?.trim()) {
    return "Submitted date is required for active loan follow-up.";
  }

  if ((loan.status === "Approved" || loan.status === "Done") && !loan.louApproved) {
    return "LOU must be approved before the loan can be approved.";
  }

  if (loan.louDone && !loan.louApproved) {
    return "LOU must be approved before it can be marked done.";
  }

  if (loan.status === "Done" && !loan.louDone) {
    return "LOU must be marked done before the loan can be completed.";
  }

  return undefined;
}

export function markLoanApproved(loan: LoanApplication): LoanApplication {
  return {
    ...loan,
    status: "Approved",
    louApproved: true
  };
}

export function markLoanDone(loan: LoanApplication): LoanApplication {
  return {
    ...loan,
    status: "Done",
    louApproved: true,
    louDone: true
  };
}

function normalizeFilterValue(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesFilterValue(keyword: string, values: Array<string | undefined>) {
  const compactKeyword = normalizeCompactFilterValue(keyword);

  return values.some((value) => {
    const normalizedValue = normalizeFilterValue(value);
    return normalizedValue.includes(keyword) ||
      (Boolean(compactKeyword) && normalizeCompactFilterValue(normalizedValue).includes(compactKeyword));
  });
}

function normalizeCompactFilterValue(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
