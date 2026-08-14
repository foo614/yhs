import { describe, expect, it } from "vitest";
import { loanCreateBlockReason, loanDocumentCategories, markLoanApproved, markLoanDone } from "./loan";
import type { LoanApplication } from "./api";

const baseLoan: LoanApplication = {
  id: "loan-1",
  vehicleId: "vehicle-1",
  customerId: "customer-1",
  status: "Pending",
  louApproved: false,
  louDone: false,
  submittedAt: "2026-05-30"
};

describe("loan workflow helpers", () => {
  it("marks LOU approved when loan is approved", () => {
    const result = markLoanApproved(baseLoan);

    expect(result.status).toBe("Approved");
    expect(result.louApproved).toBe(true);
    expect(result.louDone).toBe(false);
  });

  it("marks LOU approved before marking loan done", () => {
    const result = markLoanDone(baseLoan);

    expect(result.status).toBe("Done");
    expect(result.louApproved).toBe(true);
    expect(result.louDone).toBe(true);
  });

  it("blocks manual approved or done submissions when LOU flags are incomplete", () => {
    expect(loanCreateBlockReason({ ...baseLoan, status: "Approved", louApproved: false })).toBe("LOU must be approved before the loan can be approved.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Done", louApproved: true, louDone: false })).toBe("LOU must be marked done before the loan can be completed.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Done", louApproved: true, louDone: true })).toBeUndefined();
  });

  it("blocks active loan submissions without submitted dates", () => {
    expect(loanCreateBlockReason({ ...baseLoan, status: "Pending", submittedAt: " " })).toBe("Submitted date is required for active loan follow-up.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Approved", louApproved: true, submittedAt: undefined })).toBe("Submitted date is required for active loan follow-up.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Done", louApproved: true, louDone: true, submittedAt: "" })).toBe("Submitted date is required for active loan follow-up.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Draft", submittedAt: "" })).toBeUndefined();
  });

  it("limits loan uploads to loan workflow document categories", () => {
    expect(loanDocumentCategories).toEqual(["Voc", "ApDocument", "StatusReceipt", "LoanDocument"]);
  });
});
