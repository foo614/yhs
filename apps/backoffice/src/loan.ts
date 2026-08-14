import type { LoanApplication } from "./api";

export const loanDocumentCategories = ["Voc", "ApDocument", "StatusReceipt", "LoanDocument"] as const;

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
