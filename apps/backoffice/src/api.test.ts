import { describe, expect, it, vi } from "vitest";
import {
  createDelivery,
  createCustomer,
  createBrokerCommission,
  createDailySpend,
  createDebtRecovery,
  createLoan,
  createOwner,
  createPayment,
  createPaymentVoucher,
  createPurchaseInvoice,
  createRepair,
  createStaffUser,
  createSettlementReminder,
  createSupplierInvoice,
  createVehicle,
  checkInHrAttendance,
  checkOutHrAttendance,
  cancelHrLeaveRequest,
  createHrLeaveAdjustment,
  createHrLeaveRequest,
  createHrPayPeriod,
  customerFromLead,
  customerSelectLabel,
  decideHrLeaveRequest,
  generateHrPayslips,
  getAuditLog,
  getCurrentUser,
  getCustomers,
  getBrokerCommissions,
  getDailySpends,
  getDashboard,
  getDashboardReminders,
  getDebtRecoveries,
  getDeliveries,
  getLeads,
  getDeliveryReleaseReadiness,
  getHrAttendance,
  getHrLeaveAdjustments,
  getHrLeaveBalances,
  getHrLeavePolicies,
  getHrLeaveRequests,
  getHrPayPeriods,
  getHrPayrollProfiles,
  getHrPayslips,
  getHrStaffUsers,
  getLoanDocumentCheck,
  getLoans,
  getOwners,
  getPayments,
  getPaymentVouchers,
  getPurchaseInvoices,
  getRepairs,
  getSettlementReminders,
  getSupplierInvoices,
  getOcrJob,
  getVehicleLookup,
  getStaffUsers,
  getVehicleDocuments,
  getVehiclePhotos,
  vehicleDocumentContentUrl,
  vehiclePhotoContentUrl,
  login,
  logout,
  hrMedicalCertificateContentUrl,
  updateHrLeaveBalance,
  updateHrLeavePolicy,
  updateHrPayrollProfile,
  updateDelivery,
  updateBrokerCommission,
  updateCustomer,
  updateDailySpend,
  updateDebtRecovery,
  updateLead,
  updateLoan,
  updateOwner,
  updatePayment,
  updatePaymentVoucher,
  updatePurchaseInvoice,
  updateRepair,
  updateSettlementReminder,
  updateStaffUserRoles,
  updateStaffUserStatus,
  updateSupplierInvoice,
  updateVehicle,
  startOcrJob,
  uploadVehicleDocument,
  uploadVehiclePhoto,
  type DeliverySchedule,
  type AuditLog,
  type BrokerCommission,
  type Customer,
  type DailySpend,
  type DashboardReminder,
  type DebtRecoveryCase,
  type Lead,
  type HrAttendanceRecord,
  type HrLeavePolicy,
  type HrLeaveRequest,
  type HrPayPeriod,
  type LoanApplication,
  type DeliveryReleaseReadiness,
  type LoanDocumentCheck,
  type PaymentRecord,
  type PaymentVoucher,
  type Owner,
  type PurchaseInvoice,
  type RepairJob,
  type SettlementReminder,
  type StaffUser,
  type SupplierInvoice,
  type Vehicle,
  type VehicleLookup,
  vehicleFromIntakeValues
} from "./api";

function mockFetch(response: unknown, ok = true, status = ok ? 200 : 500) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(JSON.stringify(response))
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockEmptyFetch(ok = true, status = ok ? 200 : 500) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input")),
    text: vi.fn().mockResolvedValue("")
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("backoffice api client", () => {
  it("logs in using the identity endpoint with cookie credentials", async () => {
    const fetchMock = mockFetch({ tokenType: "Bearer" });

    await login("admin@ysheng.local", "ChangeMe123!");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/api/auth/login?useCookies=true",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "admin@ysheng.local", password: "ChangeMe123!" })
      })
    );
  });

  it("treats empty successful identity responses as successful requests", async () => {
    const fetchMock = mockEmptyFetch();

    await expect(login("admin@ysheng.local", "ChangeMe123!")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/api/auth/login?useCookies=true",
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );
  });

  it("loads and logs out the current user through authenticated endpoints", async () => {
    const fetchMock = mockFetch({ isAuthenticated: true, name: "admin@ysheng.local", roles: ["BossAdmin"] });

    await getCurrentUser();
    await logout();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/auth/me", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
  });

  it("loads vehicle lookup data without requiring full vehicle financial fields", async () => {
    const lookup: VehicleLookup = {
      id: "vehicle-1",
      plateNumber: "VPK1234",
      make: "Toyota",
      model: "Vios",
      stockOwner: "YSHeng",
      status: "Available"
    };
    const fetchMock = mockFetch([lookup]);

    await expect(getVehicleLookup()).resolves.toEqual([lookup]);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/vehicle-lookup", { credentials: "include" });
  });

  it("surfaces backend validation result messages for failed JSON requests", async () => {
    const vehicle: Vehicle = {
      id: "00000000-0000-0000-0000-000000000001",
      plateNumber: "",
      make: "Honda",
      model: "City",
      year: 2022,
      stockOwner: "YSHeng",
      status: "Available",
      isPublic: true,
      purchasePrice: 50000,
      sellingPrice: 62000,
      additionalCharges: 650,
      refurbishmentTotal: 0,
      commissionTotal: 0
    };
    mockFetch({
      errors: [
        { code: "plate_required", message: "Car plate is required." }
      ]
    }, false, 400);

    await expect(createVehicle(vehicle)).rejects.toThrow("Car plate is required.");
  });

  it("creates operational records with authenticated JSON requests", async () => {
    const fetchMock = mockFetch({ id: "created" });
    const vehicle: Vehicle = {
      id: "00000000-0000-0000-0000-000000000001",
      plateNumber: "ABC1234",
      make: "Honda",
      model: "City",
      year: 2022,
      stockOwner: "YSHeng",
      status: "Available",
      isPublic: true,
      purchasePrice: 50000,
      sellingPrice: 62000,
      additionalCharges: 650,
      refurbishmentTotal: 0,
      commissionTotal: 0
    };
    const supplierInvoice: SupplierInvoice = {
      id: "00000000-0000-0000-0000-000000000002",
      vehicleId: vehicle.id,
      supplierName: "ABC Spray",
      invoiceNumber: "INV-2",
      plateNumberOnInvoice: vehicle.plateNumber,
      amount: 300
    };
    const loan: LoanApplication = {
      id: "00000000-0000-0000-0000-000000000003",
      vehicleId: vehicle.id,
      customerId: "00000000-0000-0000-0000-000000000004",
      status: "Pending",
      louApproved: false,
      louDone: false,
      submittedAt: "2026-05-30"
    };
    const delivery: DeliverySchedule = {
      id: "00000000-0000-0000-0000-000000000005",
      vehicleId: vehicle.id,
      pic: "Ah Ming",
      status: "Scheduled",
      scheduledDate: "2026-06-05",
      polishDone: false,
      tintedDone: false,
      washDone: false,
      documentsPrepared: false,
      inspectionDone: false,
      inspectionBookingReference: "BOOK-1001",
      notificationSent: false,
      twoDayNoticeSent: false,
      insuranceHandled: false,
      roadTaxHandled: false,
      windscreenInsuranceHandled: false
    };
    const payment: PaymentRecord = {
      id: "00000000-0000-0000-0000-000000000006",
      vehicleId: vehicle.id,
      nettPrice: 62000,
      status: "Pending",
      receiptNumber: "RCPT-1001",
      invoiceNumber: "INV-1001",
      bossChecked: false,
      documentsPrepared: false,
      checklistValidated: false,
      invoiceGenerated: false,
      autoCountKeyed: false,
      bankName: "Maybank",
      bankFollowUpDate: "2026-06-01",
      createdAt: "2026-05-30T00:00:00Z"
    };
    const repair: RepairJob = {
      id: "00000000-0000-0000-0000-000000000007",
      vehicleId: vehicle.id,
      repairPart: "Polish compound",
      whatToDo: "Polish and wash",
      cost: 450,
      checklistDone: false
    };

    await createVehicle(vehicle);
    await createRepair(repair);
    await createSupplierInvoice(supplierInvoice);
    await createLoan(loan);
    await createDelivery(delivery);
    await createPayment(payment);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/vehicles", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/repairs", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:5000/api/supplier-invoices", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "http://localhost:5000/api/loans", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "http://localhost:5000/api/deliveries", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "http://localhost:5000/api/payments", expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("updates vehicle status and public visibility with an authenticated PUT request", async () => {
    const vehicle: Vehicle = {
      id: "00000000-0000-0000-0000-000000000001",
      plateNumber: "ABC1234",
      make: "Honda",
      model: "City",
      year: 2022,
      stockOwner: "YSHeng",
      status: "Sold",
      isPublic: false,
      purchasePrice: 50000,
      sellingPrice: 62000,
      additionalCharges: 650,
      refurbishmentTotal: 0,
      commissionTotal: 0
    };
    const fetchMock = mockFetch(vehicle);

    const result = await updateVehicle(vehicle);

    expect(result).toEqual(vehicle);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:5000/api/vehicles/${vehicle.id}`,
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify(vehicle)
      })
    );
  });

  it("maps vehicle intake values into all dashboard pricing fields", () => {
    const vehicle = vehicleFromIntakeValues({
      plateNumber: "ABC1234",
      make: "Honda",
      model: "City",
      year: 2022,
      stockOwner: "YSHeng",
      status: "Available",
      isPublic: true,
      purchasePrice: 50000,
      sellingPrice: 62000,
      additionalCharges: 650,
      refurbishmentTotal: 1200,
      commissionTotal: 500,
      bossConfirmed: true,
      contraRangePrice: 60000,
      ucdStatus: "Submitted",
      customerId: "00000000-0000-0000-0000-000000000011",
      ownerId: "00000000-0000-0000-0000-000000000012",
      outstationPickupAllowance: 180,
      outstationPickupScheduledAt: "2026-06-03T10:30:00",
      outstationPickupBookingSlip: "BOOK-1001"
    }, "00000000-0000-0000-0000-000000000001");

    expect(vehicle.additionalCharges).toBe(650);
    expect(vehicle.refurbishmentTotal).toBe(1200);
    expect(vehicle.commissionTotal).toBe(500);
    expect(vehicle.bossConfirmed).toBe(true);
    expect(vehicle.contraRangePrice).toBe(60000);
    expect(vehicle.ucdStatus).toBe("Submitted");
    expect(vehicle.customerId).toBe("00000000-0000-0000-0000-000000000011");
    expect(vehicle.ownerId).toBe("00000000-0000-0000-0000-000000000012");
    expect(vehicle.outstationPickupAllowance).toBe(180);
    expect(vehicle.outstationPickupScheduledAt).toBe("2026-06-03T10:30:00");
    expect(vehicle.outstationPickupBookingSlip).toBe("BOOK-1001");
  });

  it("loads and creates customer and owner intake records", async () => {
    const customer: Customer = {
      id: "00000000-0000-0000-0000-000000000011",
      name: "Ali Tan",
      phone: "0123456789",
      icNumber: "900101-01-1234",
      email: "ali@example.com",
      address: "123 Jalan Demo",
      notes: "Invoice and delivery contact"
    };
    const owner: Owner = {
      id: "00000000-0000-0000-0000-000000000012",
      name: "Used Car Supplier",
      phone: "0198765432"
    };
    const fetchMock = mockFetch([customer]);

    expect(await getCustomers()).toEqual([customer]);
    await createCustomer(customer);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([owner]),
      text: vi.fn().mockResolvedValue(JSON.stringify([owner]))
    }));
    expect(await getOwners()).toEqual([owner]);
    await createOwner(owner);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/customers", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/customers", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(customer) }));
    expect(fetch).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/owners", { credentials: "include" });
    expect(fetch).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/owners", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(owner) }));
  });

  it("loads, creates, and updates purchase invoices for vehicle intake", async () => {
    const invoice: PurchaseInvoice = {
      id: "00000000-0000-0000-0000-000000000020",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      invoiceNumber: "PI-1001",
      amount: 50000
    };
    const fetchMock = mockFetch([invoice]);

    expect(await getPurchaseInvoices()).toEqual([invoice]);
    await createPurchaseInvoice(invoice);
    await updatePurchaseInvoice({ ...invoice, amount: 51000 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/purchase-invoices", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/purchase-invoices", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(invoice) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/purchase-invoices/${invoice.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...invoice, amount: 51000 }) }));
  });

  it("loads and updates repair jobs for refurbishment checklist tracking", async () => {
    const repair: RepairJob = {
      id: "00000000-0000-0000-0000-000000000007",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      repairPart: "Polish compound",
      whatToDo: "Polish and wash",
      cost: 450,
      checklistDone: false
    };
    const fetchMock = mockFetch([repair]);

    expect(await getRepairs()).toEqual([repair]);
    await updateRepair({ ...repair, checklistDone: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/repairs", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:5000/api/repairs/${repair.id}`,
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ ...repair, checklistDone: true })
      })
    );
  });

  it("creates and updates supplier invoices for repair costing", async () => {
    const invoice: SupplierInvoice = {
      id: "00000000-0000-0000-0000-000000000021",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      supplierName: "Demo Workshop",
      invoiceNumber: "SUP-1001",
      plateNumberOnInvoice: "VPK1234",
      amount: 650
    };
    const fetchMock = mockFetch([invoice]);

    expect(await getSupplierInvoices()).toEqual([invoice]);
    await createSupplierInvoice(invoice);
    await updateSupplierInvoice({ ...invoice, amount: 700 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/supplier-invoices", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/supplier-invoices", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(invoice) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/supplier-invoices/${invoice.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...invoice, amount: 700 }) }));
  });

  it("uploads vehicle photos and documents as authenticated multipart form data", async () => {
    const fetchMock = mockFetch({ id: "uploaded" });
    const photo = new File(["photo-bytes"], "front.jpg", { type: "image/jpeg" });
    const document = new File(["document-bytes"], "voc.pdf", { type: "application/pdf" });

    await uploadVehiclePhoto("vehicle-1", photo);
    await uploadVehicleDocument("vehicle-1", document, "Voc");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5000/api/vehicles/vehicle-1/photos",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(FormData)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5000/api/vehicles/vehicle-1/documents?category=Voc",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(FormData)
      })
    );
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  });

  it("starts and reads OCR jobs for uploaded documents", async () => {
    const ocrJob = {
      id: "ocr-1",
      documentId: "doc-1",
      category: "PaymentReceipt",
      status: "NeedsReview",
      progress: 100,
      result: {
        documentCategory: "PaymentReceipt",
        confidence: 0.82,
        fieldConfidence: { receiptNumber: 0.8 },
        fields: { receiptNumber: "RCPT-1001" },
        rawText: "Receipt RCPT-1001",
        warnings: []
      },
      warnings: [],
      createdAt: "2026-06-08T00:00:00Z"
    };
    const fetchMock = mockFetch(ocrJob);

    expect(await startOcrJob("doc-1")).toEqual(ocrJob);
    expect(await getOcrJob("ocr-1")).toEqual(ocrJob);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/documents/doc-1/ocr-jobs", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/ocr-jobs/ocr-1", expect.objectContaining({ credentials: "include" }));
  });

  it("loads public website enquiries for the back office leads module", async () => {
    const leads: Lead[] = [
      {
        id: "00000000-0000-0000-0000-000000000008",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        customerName: "Ali Tan",
        phone: "0123456789",
        message: "Interested in test drive",
        status: "New",
        createdAt: "2026-05-30T00:00:00Z"
      }
    ];
    const fetchMock = mockFetch(leads);

    const result = await getLeads();

    expect(result).toEqual(leads);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/leads", { credentials: "include" });
  });

  it("uses Malaysia-market demo leads when the leads API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await getLeads();

    expect(result.map((lead) => lead.customerName)).toEqual([
      "Tan Wei Sheng",
      "Nur Aisyah",
      "Raj Kumar",
      "Lim Mei Ling",
      "Ahmad Faiz"
    ]);
    expect(result.map((lead) => lead.phone)).toEqual([
      "012-345 6789",
      "011-2088 7721",
      "016-771 9032",
      "017-662 1180",
      "013-904 5527"
    ]);
    expect(result.every((lead) => lead.vehicleId === "9f5d6f16-9bb5-46b9-bb13-e8a8b3534737")).toBe(true);
  });

  it("loads dashboard reminder inbox items", async () => {
    const reminders: DashboardReminder[] = [
      {
        type: "SettlementDue",
        title: "Settlement deadline due",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-06-01",
        amount: 25000
      },
      {
        type: "PaymentBankFollowUp",
        title: "Bank payment follow-up",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-06-01",
        amount: 58000
      },
      {
        type: "PaymentStatusFollowUp",
        title: "Payment status follow-up: Approved",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-06-01",
        amount: 58000
      },
      {
        type: "DailySpendDue",
        title: "Daily spend due: Electric Bill",
        vehiclePlate: "General",
        vehicleId: "00000000-0000-0000-0000-000000000000",
        dueDate: "2026-06-15",
        amount: 480
      },
      {
        type: "DebtRecoveryFollowUp",
        title: "Customer balance follow-up",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-06-01",
        amount: 3200
      },
      {
        type: "PaymentVoucherFollowUp",
        title: "Payment voucher follow-up: Approved",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-06-03",
        amount: 180
      }
    ];
    const fetchMock = mockFetch(reminders);

    expect(await getDashboardReminders()).toEqual(reminders);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/dashboard/reminders", { credentials: "include" });
  });

  it("loads filtered dashboard reminders with encoded query params", async () => {
    const reminders: DashboardReminder[] = [
      {
        type: "PaymentBankFollowUp",
        title: "Bank payment follow-up",
        vehiclePlate: "VPK1234",
        vehicleId: "00000000-0000-0000-0000-000000000001",
        dueDate: "2026-05-30",
        amount: 52000
      }
    ];
    const fetchMock = mockFetch(reminders);

    expect(await getDashboardReminders({ type: "PaymentBankFollowUp", due: "Overdue" })).toEqual(reminders);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/dashboard/reminders?type=PaymentBankFollowUp&due=Overdue", { credentials: "include" });
  });

  it("omits all-reminder filters from dashboard reminder queries", async () => {
    const fetchMock = mockFetch([]);

    await getDashboardReminders({ type: "All", due: "All" });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/dashboard/reminders", { credentials: "include" });
  });

  it("loads dashboard summary with vehicle aging buckets", async () => {
    const summary = {
      totalStock: 3,
      pendingLoan: 1,
      outstandingPayment: 58000,
      settlementDue: 1,
      repairCost: 3500,
      estimatedProfit: 11900,
      totalProfit: 11900,
      vehicleAging: 1,
      agingBuckets: [
        { label: "0-30", count: 1 },
        { label: "31-60", count: 1 },
        { label: "61+", count: 1 }
      ],
      topSupplier: "ABC Spray",
      salesPerformance: 2,
      stockStatusMix: [
        { label: "Available", count: 2 },
        { label: "LoanProcessing", count: 1 },
        { label: "Sold", count: 0 }
      ],
      stockOwnerMix: [
        { label: "YSHeng", count: 2 },
        { label: "KS", count: 1 }
      ],
      moneyRiskBreakdown: [
        { label: "Outstanding Payment", amount: 58000 },
        { label: "Unpaid Settlement", amount: 25000 },
        { label: "Open Debt Recovery", amount: 3200 },
        { label: "Unpaid Daily Spend", amount: 480 },
        { label: "Open Payment Voucher", amount: 180 }
      ],
      workflowBlockers: {
        byType: [
          { label: "LoanFollowUp", count: 1 },
          { label: "SettlementDue", count: 1 }
        ],
        dueBuckets: [
          { label: "Overdue", count: 1 },
          { label: "DueToday", count: 1 },
          { label: "Upcoming", count: 0 }
        ]
      },
      salesFunnel: {
        stages: [
          { label: "New", count: 2 },
          { label: "Contacted", count: 1 },
          { label: "Closed", count: 2 }
        ],
        conversionRate: 40
      },
      profitBreakdown: [
        { label: "Selling + Charges", amount: 120000 },
        { label: "Purchase Cost", amount: 84000 },
        { label: "Repair Cost", amount: 3500 },
        { label: "Commission", amount: 2400 },
        { label: "Pickup Allowance", amount: 180 },
        { label: "Estimated Profit", amount: 11900 }
      ],
      supplierSpendTop: [
        { label: "ABC Spray", amount: 1500 },
        { label: "Tint Shop", amount: 1200 }
      ]
    };
    const fetchMock = mockFetch(summary);

    expect(await getDashboard()).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/dashboard/summary", { credentials: "include" });
  });

  it("loads loan document checklist status for loan follow-up", async () => {
    const check: LoanDocumentCheck = {
      isComplete: false,
      missingCategories: ["StatusReceipt", "LoanDocument"]
    };
    const fetchMock = mockFetch(check);

    expect(await getLoanDocumentCheck("loan-1")).toEqual(check);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/loans/loan-1/document-check", { credentials: "include" });
  });

  it("loads delivery release readiness with missing handover document categories", async () => {
    const readiness: DeliveryReleaseReadiness = {
      isReady: false,
      missingCategories: ["Policy", "RoadTaxReceipt"]
    };
    const fetchMock = mockFetch(readiness);

    expect(await getDeliveryReleaseReadiness("delivery-1")).toEqual(readiness);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/deliveries/delivery-1/release-readiness", { credentials: "include" });
  });

  it("maps a public enquiry into a customer intake record", () => {
    const lead: Lead = {
      id: "00000000-0000-0000-0000-000000000008",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      customerId: "00000000-0000-0000-0000-000000000099",
      customerName: "Ali Tan",
      phone: "0123456789",
      message: "Interested in test drive",
      status: "New",
      createdAt: "2026-05-30T00:00:00Z"
    };

    expect(customerFromLead(lead, "00000000-0000-0000-0000-000000000099")).toEqual({
      id: "00000000-0000-0000-0000-000000000099",
      name: "Ali Tan",
      phone: "0123456789",
      notes: "Lead enquiry: Interested in test drive"
    });
  });

  it("formats customer labels for loan selection", () => {
    const customer: Customer = {
      id: "customer-1",
      name: "Ali Tan",
      phone: "0123456789",
      icNumber: "900101-01-1234",
      address: "123 Jalan Demo"
    };

    expect(customerSelectLabel(customer)).toBe("Ali Tan / 0123456789 / 900101-01-1234 / 123 Jalan Demo");
  });

  it("does not return demo fallback records for forbidden department endpoints", async () => {
    mockFetch({ message: "Forbidden" }, false, 403);

    await expect(getSupplierInvoices()).resolves.toEqual([]);
    await expect(getLoans()).resolves.toEqual([]);
    await expect(getDeliveries()).resolves.toEqual([]);
    await expect(getPayments()).resolves.toEqual([]);
    await expect(getBrokerCommissions()).resolves.toEqual([]);
    await expect(getDebtRecoveries()).resolves.toEqual([]);
    await expect(getPaymentVouchers()).resolves.toEqual([]);
    await expect(getLeads()).resolves.toEqual([]);
    await expect(getAuditLog()).resolves.toEqual([]);
  });

  it("updates sales lead follow-up status with an authenticated PUT request", async () => {
    const lead: Lead = {
      id: "00000000-0000-0000-0000-000000000008",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      customerId: "00000000-0000-0000-0000-000000000099",
      customerName: "Ali Tan",
      phone: "0123456789",
      message: "Interested in test drive",
      status: "Contacted",
      createdAt: "2026-05-30T00:00:00Z"
    };
    const fetchMock = mockFetch(lead);

    const result = await updateLead(lead);

    expect(result).toEqual(lead);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:5000/api/leads/${lead.id}`,
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify(lead)
      })
    );
  });

  it("loads audit history for the admin module", async () => {
    const auditLog: AuditLog[] = [
      {
        id: "00000000-0000-0000-0000-000000000009",
        actor: "admin@ysheng.local",
        action: "vehicle.created",
        entityName: "Vehicle",
        entityId: "00000000-0000-0000-0000-000000000001",
        createdAt: "2026-05-30T00:00:00Z"
      }
    ];
    const fetchMock = mockFetch(auditLog);

    const result = await getAuditLog();

    expect(result).toEqual(auditLog);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/audit-log", { credentials: "include" });
  });

  it("loads filtered audit history with encoded query params", async () => {
    const fetchMock = mockFetch([]);

    await getAuditLog({ actor: " admin@ysheng.local ", action: "vehicle.updated", entityName: "Vehicle" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/api/audit-log?actor=admin%40ysheng.local&action=vehicle.updated&entityName=Vehicle",
      { credentials: "include" }
    );
  });

  it("loads and creates staff users for role management", async () => {
    const staffUsers: StaffUser[] = [
      {
        id: "admin-user",
        email: "admin@ysheng.local",
        displayName: "Boss Admin",
        roles: ["BossAdmin"],
        isActive: true
      }
    ];
    const fetchMock = mockFetch(staffUsers);

    const result = await getStaffUsers();
    await createStaffUser({
      email: "sales@ysheng.local",
      displayName: "Sales Team",
      password: "ChangeMe123!",
      role: "Sales"
    });

    expect(result).toEqual(staffUsers);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/admin/users", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5000/api/admin/users",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "sales@ysheng.local",
          displayName: "Sales Team",
          password: "ChangeMe123!",
          role: "Sales"
        })
      })
    );
  });

  it("updates staff user roles for department access control", async () => {
    const user: StaffUser = {
      id: "admin-user",
      email: "admin@ysheng.local",
      displayName: "Boss Admin",
      roles: ["BossAdmin", "Finance"],
      isActive: true
    };
    const fetchMock = mockFetch(user);

    const result = await updateStaffUserRoles("admin-user", ["BossAdmin", "Finance"]);

    expect(result).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/users/admin-user/roles",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ roles: ["BossAdmin", "Finance"] })
      })
    );
  });

  it("updates staff user active status for account control", async () => {
    const user: StaffUser = {
      id: "sales-user",
      email: "sales@ysheng.local",
      displayName: "Sales Team",
      roles: ["Sales"],
      isActive: false
    };
    const fetchMock = mockFetch(user);

    const result = await updateStaffUserStatus("sales-user", { isActive: false });

    expect(result).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:5000/api/admin/users/sales-user/status",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ isActive: false })
      })
    );
  });

  it("loads and mutates HR self-service and management records", async () => {
    const attendance: HrAttendanceRecord = {
      id: "attendance-1",
      staffUserId: "staff-1",
      attendanceDate: "2026-06-06",
      checkInAt: "2026-06-06T01:00:00Z",
      status: "Present"
    };
    const leave: HrLeaveRequest = {
      id: "leave-1",
      staffUserId: "staff-1",
      type: "UnpaidLeave",
      status: "Pending",
      startDate: "2026-06-06",
      endDate: "2026-06-06",
      days: 1,
      createdAt: "2026-06-06T00:00:00Z"
    };
    const period: HrPayPeriod = {
      id: "period-1",
      name: "June 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      workingDays: 22,
      createdAt: "2026-06-06T00:00:00Z"
    };
    const policy: HrLeavePolicy = {
      id: "policy-1",
      role: "Sales",
      annualLeaveDays: 12,
      medicalLeaveDays: 14
    };
    const fetchMock = mockFetch([attendance]);

    await getHrStaffUsers();
    await getHrAttendance();
    await checkInHrAttendance();
    await checkOutHrAttendance();
    await getHrLeaveRequests();
    await createHrLeaveRequest(leave);
    await decideHrLeaveRequest("leave-1", "Approved", "ok");
    await cancelHrLeaveRequest("leave-1");
    await getHrLeaveBalances();
    await updateHrLeaveBalance({ id: "balance-1", staffUserId: "staff-1", annualLeaveDays: 8, medicalLeaveDays: 12 });
    await getHrLeavePolicies();
    await updateHrLeavePolicy(policy);
    await getHrLeaveAdjustments();
    await createHrLeaveAdjustment({ staffUserId: "staff-1", type: "AnnualLeave", direction: "Increase", days: 1, reason: "Carry forward" });
    await getHrPayrollProfiles();
    await updateHrPayrollProfile({ id: "profile-1", staffUserId: "staff-1", monthlyBaseSalary: 2200, overtimeHours: 2, overtimeRate: 15, allowances: 100, manualDeductions: 20 });
    await getHrPayPeriods();
    await createHrPayPeriod(period);
    await getHrPayslips();
    await generateHrPayslips("period-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/hr/staff", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/hr/attendance", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:5000/api/hr/attendance/check-in", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "http://localhost:5000/api/hr/attendance/check-out", expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "http://localhost:5000/api/hr/leave-requests", expect.objectContaining({ method: "POST", body: JSON.stringify(leave) }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, "http://localhost:5000/api/hr/leave-requests/leave-1/decision", expect.objectContaining({ method: "PUT", body: JSON.stringify({ status: "Approved", decisionNotes: "ok" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, "http://localhost:5000/api/hr/leave-requests/leave-1/cancel", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(10, "http://localhost:5000/api/hr/leave-balances/staff-1", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(12, "http://localhost:5000/api/hr/leave-policies/Sales", expect.objectContaining({ method: "PUT", body: JSON.stringify(policy) }));
    expect(fetchMock).toHaveBeenNthCalledWith(14, "http://localhost:5000/api/hr/leave-adjustments", expect.objectContaining({ method: "POST", body: JSON.stringify({ staffUserId: "staff-1", type: "AnnualLeave", direction: "Increase", days: 1, reason: "Carry forward" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(16, "http://localhost:5000/api/hr/payroll-profiles/staff-1", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(18, "http://localhost:5000/api/hr/pay-periods", expect.objectContaining({ method: "POST", body: JSON.stringify(period) }));
    expect(fetchMock).toHaveBeenNthCalledWith(20, "http://localhost:5000/api/hr/pay-periods/period-1/generate-payslips", expect.objectContaining({ method: "POST" }));
    expect(hrMedicalCertificateContentUrl("leave-1")).toBe("http://localhost:5000/api/hr/leave-requests/leave-1/mc/content");
  });

  it("falls back to demo data when HR endpoints return 404", async () => {
    mockFetch({ message: "not found" }, false, 404);

    const staff = await getHrStaffUsers();
    const attendance = await getHrAttendance();
    const checkIn = await checkInHrAttendance();
    const checkOut = await checkOutHrAttendance();

    expect(staff).toHaveLength(3);
    expect(staff[0].id).toBe("staff-demo-hr");
    expect(attendance).toHaveLength(3);
    expect(checkIn.id).toContain("attendance-demo-");
    expect(checkIn.staffUserId).toBe("staff-demo-hr");
    expect(checkIn.status).toBe("Present");
    expect(checkIn.checkInAt).toBeTruthy();
    expect(checkOut.id).toContain("attendance-demo-");
    expect(checkOut.staffUserId).toBe("staff-demo-hr");
    expect(checkOut.status).toBe("Present");
    expect(checkOut.checkOutAt).toBeTruthy();
  });

  it("updates workflow records with authenticated PUT requests", async () => {
    const fetchMock = mockFetch({ id: "updated" });
    const loan: LoanApplication = {
      id: "00000000-0000-0000-0000-000000000003",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      customerId: "00000000-0000-0000-0000-000000000004",
      status: "Approved",
      louApproved: true,
      louDone: false,
      submittedAt: "2026-05-30"
    };
    const delivery: DeliverySchedule = {
      id: "00000000-0000-0000-0000-000000000005",
      vehicleId: loan.vehicleId,
      pic: "Ah Ming",
      status: "ReadyForRelease",
      scheduledDate: "2026-06-05",
      polishDone: true,
      tintedDone: true,
      washDone: true,
      documentsPrepared: true,
      inspectionDone: true,
      inspectionBookingReference: "BOOK-1001",
      inspectionReportReference: "INSPECT-1001",
      notificationSent: true,
      twoDayNoticeSent: true,
      insuranceHandled: true,
      roadTaxHandled: true,
      windscreenInsuranceHandled: true
    };
    const payment: PaymentRecord = {
      id: "00000000-0000-0000-0000-000000000006",
      vehicleId: loan.vehicleId,
      nettPrice: 62000,
      status: "Reconciled",
      receiptNumber: "RCPT-1001",
      invoiceNumber: "INV-1001",
      bossChecked: true,
      documentsPrepared: true,
      checklistValidated: true,
      invoiceGenerated: true,
      autoCountKeyed: true,
      bankName: "Maybank",
      bankFollowUpDate: "2026-06-01",
      createdAt: "2026-05-30T00:00:00Z"
    };

    await updateLoan(loan);
    await updateDelivery(delivery);
    await updatePayment(payment);

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:5000/api/loans/${loan.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify(loan) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://localhost:5000/api/deliveries/${delivery.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify(delivery) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/payments/${payment.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify(payment) }));
  });

  it("loads, creates, and updates settlement reminders for finance tracking", async () => {
    const settlement: SettlementReminder = {
      id: "00000000-0000-0000-0000-000000000013",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000014",
      amount: 25000,
      deadline: "2026-06-01",
      isPaid: false
    };
    const fetchMock = mockFetch([settlement]);

    expect(await getSettlementReminders()).toEqual([settlement]);
    await createSettlementReminder(settlement);
    await updateSettlementReminder({ ...settlement, isPaid: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/settlement-reminders", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/settlement-reminders", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(settlement) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/settlement-reminders/${settlement.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...settlement, isPaid: true }) }));
  });

  it("loads, creates, and updates daily spends for finance tracking", async () => {
    const dailySpend: DailySpend = {
      id: "00000000-0000-0000-0000-000000000014",
      description: "Electric Bill",
      amount: 480,
      dueDate: "2026-06-15",
      isPaid: false
    };
    const fetchMock = mockFetch([dailySpend]);

    expect(await getDailySpends()).toEqual([dailySpend]);
    await createDailySpend(dailySpend);
    await updateDailySpend({ ...dailySpend, isPaid: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/daily-spends", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/daily-spends", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(dailySpend) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/daily-spends/${dailySpend.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...dailySpend, isPaid: true }) }));
  });

  it("loads, creates, and updates broker commissions for profit tracking", async () => {
    const commission: BrokerCommission = {
      id: "00000000-0000-0000-0000-000000000015",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      brokerName: "Ah Chong",
      amount: 1200,
      isPaid: false,
      cp58Required: true,
      cp58Prepared: false
    };
    const fetchMock = mockFetch([commission]);

    expect(await getBrokerCommissions()).toEqual([commission]);
    await createBrokerCommission(commission);
    await updateBrokerCommission({ ...commission, isPaid: true, cp58Prepared: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/broker-commissions", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/broker-commissions", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(commission) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/broker-commissions/${commission.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...commission, isPaid: true, cp58Prepared: true }) }));
  });

  it("loads, creates, and updates debt recovery cases for balance follow-up", async () => {
    const debt: DebtRecoveryCase = {
      id: "00000000-0000-0000-0000-000000000016",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      customerId: "00000000-0000-0000-0000-000000000004",
      balanceAmount: 3200,
      status: "Open",
      followUpDate: "2026-06-01",
      notes: "Monthly balance reminder"
    };
    const fetchMock = mockFetch([debt]);

    expect(await getDebtRecoveries()).toEqual([debt]);
    await createDebtRecovery(debt);
    await updateDebtRecovery({ ...debt, status: "Closed" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/debt-recoveries", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/debt-recoveries", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(debt) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/debt-recoveries/${debt.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...debt, status: "Closed" }) }));
  });

  it("loads, creates, and updates payment vouchers for outstation pickup allowance", async () => {
    const voucher: PaymentVoucher = {
      id: "00000000-0000-0000-0000-000000000017",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      payeeName: "Ah Ming",
      amount: 180,
      purpose: "Outstation Pickup Allowance",
      status: "Pending",
      issuedDate: "2026-06-03",
      notes: "Booking slip BOOK-1001"
    };
    const fetchMock = mockFetch([voucher]);

    expect(await getPaymentVouchers()).toEqual([voucher]);
    await createPaymentVoucher(voucher);
    await updatePaymentVoucher({ ...voucher, status: "Paid" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/payment-vouchers", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:5000/api/payment-vouchers", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(voucher) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `http://localhost:5000/api/payment-vouchers/${voucher.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...voucher, status: "Paid" }) }));
  });

  it("creates and updates customer and owner contact records", async () => {
    const customer: Customer = {
      id: "00000000-0000-0000-0000-000000000030",
      name: "Ali Tan",
      phone: "012-3456789",
      icNumber: "900101-10-1234",
      email: "ali@example.com",
      address: "123 Jalan Demo",
      notes: "Invoice contact"
    };
    const owner: Owner = {
      id: "00000000-0000-0000-0000-000000000031",
      name: "Lim Owner",
      phone: "019-8887777"
    };
    const fetchMock = mockFetch(customer);

    await createCustomer(customer);
    await updateCustomer({ ...customer, notes: "Updated invoice contact" });
    await createOwner(owner);
    await updateOwner({ ...owner, phone: "019-0001111" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:5000/api/customers", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(customer) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://localhost:5000/api/customers/${customer.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...customer, notes: "Updated invoice contact" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:5000/api/owners", expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(owner) }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, `http://localhost:5000/api/owners/${owner.id}`, expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ ...owner, phone: "019-0001111" }) }));
  });

  it("loads vehicle document metadata and builds a download url", async () => {
    const documents = [
      {
        id: "00000000-0000-0000-0000-000000000010",
        fileName: "voc.pdf",
        mimeType: "application/pdf",
        category: "Voc",
        uploadedBy: "admin@ysheng.local",
        checksum: "ABCDEF0123456789",
        uploadedAt: "2026-05-30T00:00:00Z"
      }
    ];
    const fetchMock = mockFetch(documents);

    const result = await getVehicleDocuments("vehicle-1");

    expect(result).toEqual(documents);
    expect(result[0].checksum).toBe("ABCDEF0123456789");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/vehicles/vehicle-1/documents", { credentials: "include" });
    expect(vehicleDocumentContentUrl("vehicle-1", documents[0].id)).toBe("http://localhost:5000/api/vehicles/vehicle-1/documents/00000000-0000-0000-0000-000000000010/content");
  });

  it("loads vehicle photo metadata and builds a photo content url", async () => {
    const photos = [
      {
        id: "00000000-0000-0000-0000-000000000020",
        fileName: "front.jpg",
        mimeType: "image/jpeg",
        uploadedBy: "admin@ysheng.local",
        checksum: "FFEEDDCCBBAA0099",
        uploadedAt: "2026-05-30T00:00:00Z"
      }
    ];
    const fetchMock = mockFetch(photos);

    const result = await getVehiclePhotos("vehicle-1");

    expect(result).toEqual(photos);
    expect(result[0].checksum).toBe("FFEEDDCCBBAA0099");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/vehicles/vehicle-1/photos", { credentials: "include" });
    expect(vehiclePhotoContentUrl("vehicle-1", photos[0].id)).toBe("http://localhost:5000/api/vehicles/vehicle-1/photos/00000000-0000-0000-0000-000000000020/content");
  });
});
