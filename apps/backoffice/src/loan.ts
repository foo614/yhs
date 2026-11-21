import type { Customer, DocumentCategory, DocumentUploadOwner, LoanApplication, LoanDocumentCheck, VehicleLookup } from "./api";
import { newestRecordsFirst } from "./recordDates";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const loanDocumentCategories = ["LoanOriginalDocument", "LoanEditedDocument"] as const;
export const loanHistoryDocumentCategories = [...loanDocumentCategories, "LoanDocument", "Voc", "ApDocument", "StatusReceipt"] as const;
export const loanRequiredDocumentCategories = ["LoanOriginalDocument"] as const;

export function loanDocumentUploadOwner(loan: Pick<LoanApplication, "id">): DocumentUploadOwner {
  return { loanApplicationId: loan.id };
}

export function nextLoanDocumentReloadKey(current: number) {
  return current + 1;
}

export function canCreateManualLoan(roles: readonly string[]) {
  return roles.includes("BossAdmin") || roles.includes("Sales");
}

export function canUploadLoanChecklistDocument(roles: readonly string[], category: DocumentCategory) {
  if (roles.includes("BossAdmin")) return true;
  if (category === "LoanOriginalDocument") return roles.includes("Sales");
  return category === "LoanEditedDocument" || category === "LoanDocument" ? roles.includes("Loan") : false;
}

export function loanDocumentChecklistStatus(category: DocumentCategory, isPresent: boolean) {
  if (category === "LoanEditedDocument") {
    return isPresent ? "Optional edited document uploaded" : "Optional — upload edited copy if needed";
  }

  if (category === "LoanDocument") {
    return isPresent ? "Optional LOU uploaded" : "Optional — upload LOU if available";
  }

  if (category !== "LoanOriginalDocument") {
    return isPresent ? "Legacy document preserved" : "Legacy category — not required";
  }

  return isPresent ? "Provided by Broker" : "Missing — request from Broker";
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
  _customers: Customer[],
  documentChecks: Record<string, LoanDocumentCheck>,
  filters: LoanFilters
) {
  const keyword = normalizeFilterValue(filters.keyword);
  const historyRequested = filters.status === "Rejected";

  return newestRecordsFirst(loans, loan => loan.createdAt).filter((loan) => {
    if (loan.status === "Rejected" && !historyRequested && isRejectedHiddenAfterMonth(loan)) return false;
    const vehicle = vehicles.find((item) => item.id === loan.vehicleId);
    const check = documentChecks[loan.id];
    const matchesKeyword = !keyword || matchesFilterValue(keyword, [vehicle?.plateNumber]);
    const matchesStatus = !filters.status || filters.status === "All" || loan.status === filters.status;
    const matchesDocuments = !filters.documents || filters.documents === "All" ||
      (filters.documents === "Complete" ? check?.isComplete === true : check?.isComplete !== true);
    const matchesVehicle = !filters.vehicleId || loan.vehicleId === filters.vehicleId;

    return matchesKeyword && matchesStatus && matchesDocuments && matchesVehicle;
  });
}

export function isRejectedHiddenAfterMonth(loan: Pick<LoanApplication, "status" | "decisionAt">, today = new Date()) {
  if (loan.status !== "Rejected") return false;
  if (!loan.decisionAt) return false;
  const rejectedAt = dayjs.utc(loan.decisionAt).tz("Asia/Kuala_Lumpur");
  if (!rejectedAt.isValid()) return false;
  return !dayjs(today).isBefore(rejectedAt.add(1, "month"));
}

export function loanCreateBlockReason(loan: LoanApplication) {
  if (loan.status === "Rejected" && !loan.rejectionReason?.trim()) {
    return "Rejection reason is required for a rejected loan.";
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
