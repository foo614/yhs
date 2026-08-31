import { describe, expect, it } from "vitest";
import { canCreateManualLoan, canUploadLoanChecklistDocument, filterLoanApplications, loanCreateBlockReason, loanDocumentCategories, loanDocumentChecklistStatus, markLoanDone } from "./loan";
import type { Customer, LoanApplication, LoanDocumentCheck, VehicleLookup } from "./api";

const baseLoan: LoanApplication = {
  id: "loan-1",
  vehicleId: "vehicle-1",
  customerId: "customer-1",
  status: "Pending",
  louApproved: false,
  louDone: false,
  submittedAt: "2026-05-30"
};

const filterVehicles: VehicleLookup[] = [
  { id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available" },
  { id: "vehicle-2", plateNumber: "WXY 9876", make: "Honda", model: "City", stockOwner: "YSHeng", status: "Available" }
];
const filterCustomers: Customer[] = [
  { id: "customer-1", name: "Ah Ming", phone: "012-1234567" },
  { id: "customer-2", name: "Siti Aminah", phone: "013-7654321" }
];

describe("loan workflow helpers", () => {
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

  it("requires a reason for exceptional rejected loan creation", () => {
    expect(loanCreateBlockReason({ ...baseLoan, status: "Rejected", rejectionReason: " " })).toBe("Rejection reason is required for a rejected loan.");
    expect(loanCreateBlockReason({ ...baseLoan, status: "Rejected", rejectionReason: "Bank declined" })).toBeUndefined();
  });

  it("keeps manual loan creation restricted to Boss/Admin", () => {
    expect(canCreateManualLoan(["Loan"])).toBe(false);
    expect(canCreateManualLoan(["BossAdmin"])).toBe(true);
  });

  it("only offers Loan staff an upload action they are authorized to perform", () => {
    expect(canUploadLoanChecklistDocument(["Loan"], "LoanDocument")).toBe(true);
    expect(canUploadLoanChecklistDocument(["Loan"], "Voc")).toBe(false);
    expect(canUploadLoanChecklistDocument(["Loan"], "ApDocument")).toBe(false);
    expect(canUploadLoanChecklistDocument(["Loan"], "StatusReceipt")).toBe(false);
    expect(canUploadLoanChecklistDocument(["BossAdmin"], "Voc")).toBe(true);
  });

  it("labels Sales-provided evidence without sending Loan staff to a forbidden upload", () => {
    expect(loanDocumentChecklistStatus("Voc", true)).toBe("Provided by Sales");
    expect(loanDocumentChecklistStatus("StatusReceipt", false)).toBe("Missing — request from Sales");
    expect(loanDocumentChecklistStatus("LoanDocument", false)).toBe("Not uploaded yet");
  });

  it("filters loans by combined user-facing status and document criteria", () => {
    const loans = [
      baseLoan,
      { ...baseLoan, id: "loan-2", vehicleId: "vehicle-2", customerId: "customer-2", status: "Approved" as const, submittedAt: "2026-06-01" },
      { ...baseLoan, id: "loan-3", status: "Done" as const }
    ];
    const documentChecks: Record<string, LoanDocumentCheck> = {
      "loan-1": { isComplete: false, missingCategories: ["Voc"] },
      "loan-2": { isComplete: true, missingCategories: [] }
    };

    expect(filterLoanApplications(loans, filterVehicles, filterCustomers, documentChecks, {
      keyword: "SITI",
      status: "Approved",
      documents: "Complete"
    }).map((loan) => loan.id)).toEqual(["loan-2"]);
    expect(filterLoanApplications(loans, filterVehicles, filterCustomers, documentChecks, {
      documents: "Missing"
    }).map((loan) => loan.id)).toEqual(["loan-1", "loan-3"]);
    expect(filterLoanApplications(loans, filterVehicles, filterCustomers, documentChecks, {
      documents: "Complete"
    }).map((loan) => loan.id)).toEqual(["loan-2"]);
    expect(filterLoanApplications(loans, filterVehicles, filterCustomers, documentChecks, {
      vehicleId: "vehicle-2"
    }).map((loan) => loan.id)).toEqual(["loan-2"]);
  });

  it("keeps every loan when no filters are active", () => {
    expect(filterLoanApplications([baseLoan], filterVehicles, filterCustomers, {}, {})).toEqual([baseLoan]);
  });

  it("matches compact plate and phone searches against formatted values", () => {
    expect(filterLoanApplications([baseLoan], filterVehicles, filterCustomers, {}, {
      keyword: "VPK1234"
    })).toEqual([baseLoan]);
    expect(filterLoanApplications([baseLoan], filterVehicles, filterCustomers, {}, {
      keyword: "0121234567"
    })).toEqual([baseLoan]);
  });
});
