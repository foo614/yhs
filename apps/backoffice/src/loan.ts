import type { Customer, LoanApplication, LoanDocumentCheck, VehicleLookup } from "./api";

export const loanDocumentCategories = ["Voc", "ApDocument", "StatusReceipt", "LoanDocument"] as const;

export type LoanFilters = {
  keyword?: string;
  status?: LoanApplication["status"] | "All";
  documents?: "All" | "Missing" | "Complete";
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

    return matchesKeyword && matchesStatus && matchesDocuments;
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
  return values.some((value) => value?.toLowerCase().includes(keyword));
}
