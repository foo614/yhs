using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Data;

public static class SeedData
{
    public static readonly string[] Roles = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance", "Repair", "HrSalary"];

    public static async Task SeedAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
        await EnsureLeadSchemaAsync(db);
        await EnsureHrSchemaAsync(db);
        await EnsureOcrSchemaAsync(db);
        await EnsureAiUsageSchemaAsync(db);
        await EnsureDocumentOwnershipSchemaAsync(db);
        await EnsureCashCustodySchemaAsync(db);
        await EnsureVehicleEnhancementSchemaAsync(db);
        await EnsureVehicleCatalogSchemaAsync(db);
        await EnsureFinanceRepairEnhancementSchemaAsync(db);
        await EnsureRepairReceiptSchemaAsync(db);
        await EnsureVehiclePhotoAttributionSchemaAsync(db);

        if (!await db.AiServiceLimits.AnyAsync(limit => limit.Service == AiService.Ocr))
        {
            db.AiServiceLimits.Add(new AiServiceLimit { Service = AiService.Ocr });
            await db.SaveChangesAsync();
        }

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        if (!await db.HrLeavePolicies.AnyAsync())
        {
            db.HrLeavePolicies.AddRange(
                new HrLeavePolicy { Role = "BossAdmin", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "Sales", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "Loan", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "Delivery", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "Finance", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "Repair", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" },
                new HrLeavePolicy { Role = "HrSalary", AnnualLeaveDays = 12, MedicalLeaveDays = 14, Notes = "Default full-time entitlement" }
            );
            await db.SaveChangesAsync();
        }

        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var email = config["SeedAdmin:Email"] ?? "admin@ysheng.local";
        var password = config["SeedAdmin:Password"] ?? "ChangeMe123!";
        var admin = await userManager.FindByEmailAsync(email);
        if (admin is null)
        {
            admin = new AppUser { UserName = email, Email = email, DisplayName = "Boss Admin", EmailConfirmed = true };
            await userManager.CreateAsync(admin, password);
            await userManager.AddToRoleAsync(admin, "BossAdmin");
        }
        else
        {
            if (!admin.EmailConfirmed)
            {
                admin.EmailConfirmed = true;
                await userManager.UpdateAsync(admin);
            }
            if (!await userManager.CheckPasswordAsync(admin, password))
            {
                var resetToken = await userManager.GeneratePasswordResetTokenAsync(admin);
                await userManager.ResetPasswordAsync(admin, resetToken, password);
            }
        }

        var seedPassword = config["SeedAdmin:Password"] ?? "ChangeMe123!";
        var seededStaffUsers = new[]
        {
            ("hr-boss@ysheng.local", "HR Manager", "HrSalary"),
            ("hr-accountant@ysheng.local", "HR Payroll Clerk", "Finance"),
            ("hr-sales@ysheng.local", "HR Sales Liaison", "Sales")
        };

        foreach (var (seedEmail, displayName, role) in seededStaffUsers)
        {
            var seedUser = await userManager.FindByEmailAsync(seedEmail);
            if (seedUser is null)
            {
                seedUser = new AppUser { UserName = seedEmail, Email = seedEmail, DisplayName = displayName, EmailConfirmed = true };
                await userManager.CreateAsync(seedUser, seedPassword);
            }
            if (!seedUser.EmailConfirmed)
            {
                var resetToken = await userManager.GeneratePasswordResetTokenAsync(seedUser);
                seedUser.EmailConfirmed = true;
                await userManager.UpdateAsync(seedUser);
                await userManager.ResetPasswordAsync(seedUser, resetToken, seedPassword);
            }
            if (!await userManager.CheckPasswordAsync(seedUser, seedPassword))
            {
                var resetToken = await userManager.GeneratePasswordResetTokenAsync(seedUser);
                await userManager.ResetPasswordAsync(seedUser, resetToken, seedPassword);
            }

            var currentRoles = await userManager.GetRolesAsync(seedUser);
            if (!currentRoles.Contains(role))
            {
                await userManager.AddToRoleAsync(seedUser, role);
            }
        }

        if (!await db.Vehicles.AnyAsync())
        {
            var vehicleId = Guid.Parse("9f5d6f16-9bb5-46b9-bb13-e8a8b3534737");
            var customerId = Guid.Parse("863a9059-aac6-42f0-8616-f452c9221770");
            db.Vehicles.Add(new Vehicle
            {
                Id = vehicleId,
                PlateNumber = "VPK1234",
                Make = "Toyota",
                Model = "Vios",
                Year = 2021,
                StockOwner = StockOwner.YSHeng,
                StockLocation = "Main Yard",
                Status = VehicleStatus.Available,
                IsPublic = true,
                PurchasePrice = 42000m,
                SellingPrice = 58000m,
                AdditionalCharges = 600m,
                RefurbishmentTotal = 3500m,
                CommissionTotal = 1200m,
                BossConfirmed = true,
                ContraRangePrice = 56000m,
                UcdStatus = "Ready",
                OutstationPickupAllowance = 180m,
                OutstationPickupScheduledAt = new DateTime(2026, 6, 3, 10, 30, 0, DateTimeKind.Utc),
                OutstationPickupBookingSlip = "BOOK-DEMO-1001",
                IntakeDate = new DateOnly(2026, 3, 1)
            });
            db.Customers.Add(new Customer { Id = customerId, Name = "Ali Tan", Phone = "0123456789", IcNumber = "900101-01-1234", Address = "Demo customer address", Notes = "Seed customer for loan and delivery follow-up" });
            db.LoanApplications.Add(new LoanApplication { VehicleId = vehicleId, CustomerId = customerId, Status = LoanStatus.Pending, SubmittedAt = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3)) });
            db.PaymentRecords.Add(new PaymentRecord
            {
                VehicleId = vehicleId,
                NettPrice = 58000m,
                Status = PaymentStatus.Pending,
                ReceiptNumber = "RCPT-DEMO-1001",
                InvoiceNumber = "INV-DEMO-1001",
                DocumentsPrepared = true,
                ChecklistValidated = true,
                SalesPrice = 58000m,
                InterestAdditionalCharges = 600m,
                NcdAmount = 1200m,
                WindscreenCharges = 450m,
                OutstationDeliveryDate = new DateOnly(2026, 6, 5),
                BankName = "Maybank",
                BankFollowUpDate = new DateOnly(2026, 6, 1)
            });
            db.SettlementReminders.Add(new SettlementReminder { VehicleId = vehicleId, Amount = 25000m, Deadline = DateOnly.FromDateTime(DateTime.UtcNow), IsPaid = false });
            db.DailySpends.Add(new DailySpend { Description = "Electric Bill", Amount = 480m, DueDate = new DateOnly(2026, 6, 15), IsPaid = false });
            db.BrokerCommissions.Add(new BrokerCommission { VehicleId = vehicleId, BrokerName = "Demo Broker", Amount = 1200m, IsPaid = false, Cp58Required = true, Cp58Prepared = false });
            db.DebtRecoveryCases.Add(new DebtRecoveryCase { VehicleId = vehicleId, CustomerId = customerId, BalanceAmount = 2500m, Status = DebtRecoveryStatus.Open, FollowUpDate = DateOnly.FromDateTime(DateTime.UtcNow), Notes = "Monthly balance follow-up" });
            db.PaymentVouchers.Add(new PaymentVoucher { VehicleId = vehicleId, PayeeName = "Demo Driver", Amount = 180m, Purpose = "Outstation Pickup Allowance", Status = PaymentVoucherStatus.Pending, IssuedDate = new DateOnly(2026, 6, 3), Notes = "Linked to pickup booking slip" });
            db.AuditLogs.Add(AuditTrail.Record("seed", "vehicle.created", nameof(Vehicle), vehicleId, DateTime.UtcNow));
            await db.SaveChangesAsync();
        }

        var existingCatalogModels = await db.VehicleCatalogModels.AsNoTracking()
            .Select(item => new { item.Make, item.Model })
            .ToListAsync();
        var catalogKeys = existingCatalogModels
            .Select(item => MalaysiaVehicleCatalog.Key(item.Make, item.Model))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var stockModels = await db.Vehicles.AsNoTracking()
            .Select(vehicle => new { vehicle.Make, vehicle.Model })
            .ToListAsync();
        var catalogSeed = MalaysiaVehicleCatalog.Models
            .Concat(stockModels
                .Where(item => !string.IsNullOrWhiteSpace(item.Make) && !string.IsNullOrWhiteSpace(item.Model))
                .Select(item => (item.Make.Trim(), item.Model.Trim())));

        foreach (var (make, model) in catalogSeed)
        {
            if (catalogKeys.Add(MalaysiaVehicleCatalog.Key(make, model)))
            {
                db.VehicleCatalogModels.Add(new VehicleCatalogModel { Make = make, Model = model });
            }
        }

        await db.SaveChangesAsync();
    }

    private static async Task EnsureLeadSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenByUserId" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenByName" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenAt" timestamp with time zone NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "CustomerId" uuid NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "SourcePage" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "SourceReferrer" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "SourceCampaign" text NULL;
        """);
    }

    private static async Task EnsureHrSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "HrAttendanceRecords" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "AttendanceDate" date NOT NULL,
                "CheckInAt" timestamp with time zone NULL,
                "CheckOutAt" timestamp with time zone NULL,
                "Status" integer NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_HrAttendanceRecords" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrLeaveRequests" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "Type" integer NOT NULL,
                "Status" integer NOT NULL,
                "StartDate" date NOT NULL,
                "EndDate" date NOT NULL,
                "Days" numeric NOT NULL,
                "Reason" text NULL,
                "MedicalCertificateDocumentId" uuid NULL,
                "ApprovedBy" text NULL,
                "ApprovedAt" timestamp with time zone NULL,
                "DecisionNotes" text NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HrLeaveRequests" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrLeaveBalances" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "AnnualLeaveDays" numeric NOT NULL,
                "MedicalLeaveDays" numeric NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_HrLeaveBalances" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrLeavePolicies" (
                "Id" uuid NOT NULL,
                "Role" text NOT NULL,
                "AnnualLeaveDays" numeric NOT NULL,
                "MedicalLeaveDays" numeric NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_HrLeavePolicies" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrLeaveAdjustments" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "Type" integer NOT NULL,
                "Direction" integer NOT NULL,
                "Days" numeric NOT NULL,
                "AnnualLeaveBefore" numeric NOT NULL,
                "MedicalLeaveBefore" numeric NOT NULL,
                "AnnualLeaveAfter" numeric NOT NULL,
                "MedicalLeaveAfter" numeric NOT NULL,
                "Reason" text NOT NULL,
                "AdjustedBy" text NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HrLeaveAdjustments" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrPayrollProfiles" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "MonthlyBaseSalary" numeric NOT NULL,
                "OvertimeHours" numeric NOT NULL,
                "OvertimeRate" numeric NOT NULL,
                "Allowances" numeric NOT NULL,
                "ManualDeductions" numeric NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_HrPayrollProfiles" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrPayPeriods" (
                "Id" uuid NOT NULL,
                "Name" text NOT NULL,
                "StartDate" date NOT NULL,
                "EndDate" date NOT NULL,
                "WorkingDays" integer NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HrPayPeriods" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "HrPayslips" (
                "Id" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "PayPeriodId" uuid NOT NULL,
                "Status" integer NOT NULL,
                "BaseSalary" numeric NOT NULL,
                "WorkingDays" integer NOT NULL,
                "DailySalary" numeric NOT NULL,
                "UnpaidLeaveDays" numeric NOT NULL,
                "UnpaidLeaveDeduction" numeric NOT NULL,
                "OvertimePay" numeric NOT NULL,
                "Allowances" numeric NOT NULL,
                "ManualDeductions" numeric NOT NULL,
                "GrossPay" numeric NOT NULL,
                "NetPay" numeric NOT NULL,
                "GeneratedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HrPayslips" PRIMARY KEY ("Id")
            );

            DROP INDEX IF EXISTS "IX_HrAttendanceRecords_StaffUserId_AttendanceDate";
            CREATE INDEX IF NOT EXISTS "IX_HrAttendanceRecords_StaffUserId_AttendanceDate" ON "HrAttendanceRecords" ("StaffUserId", "AttendanceDate");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HrLeaveBalances_StaffUserId" ON "HrLeaveBalances" ("StaffUserId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HrLeavePolicies_Role" ON "HrLeavePolicies" ("Role");
            CREATE INDEX IF NOT EXISTS "IX_HrLeaveAdjustments_StaffUserId_CreatedAt" ON "HrLeaveAdjustments" ("StaffUserId", "CreatedAt");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HrPayrollProfiles_StaffUserId" ON "HrPayrollProfiles" ("StaffUserId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HrPayPeriods_Name" ON "HrPayPeriods" ("Name");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HrPayslips_StaffUserId_PayPeriodId" ON "HrPayslips" ("StaffUserId", "PayPeriodId");
        """);
    }

    private static async Task EnsureOcrSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "OcrJobs" (
                "Id" uuid NOT NULL,
                "DocumentId" uuid NOT NULL,
                "Category" integer NOT NULL,
                "Status" integer NOT NULL,
                "Progress" integer NOT NULL,
                "ResultJson" text NOT NULL,
                "Warnings" text[] NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "CompletedAt" timestamp with time zone NULL,
                CONSTRAINT "PK_OcrJobs" PRIMARY KEY ("Id")
            );

            ALTER TABLE "OcrJobs" ADD COLUMN IF NOT EXISTS "ReviewDecision" integer NOT NULL DEFAULT 0;
            ALTER TABLE "OcrJobs" ADD COLUMN IF NOT EXISTS "ReviewNotes" text NULL;
            ALTER TABLE "OcrJobs" ADD COLUMN IF NOT EXISTS "ReviewedBy" text NULL;
            ALTER TABLE "OcrJobs" ADD COLUMN IF NOT EXISTS "ReviewedAt" timestamp with time zone NULL;

            CREATE INDEX IF NOT EXISTS "IX_OcrJobs_DocumentId" ON "OcrJobs" ("DocumentId");
        """);
    }

    private static async Task EnsureVehicleEnhancementSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Vehicles" ADD COLUMN IF NOT EXISTS "StockLocation" text NOT NULL DEFAULT '';
            ALTER TABLE "Vehicles" ADD COLUMN IF NOT EXISTS "ChassisNumber" text NULL;
            ALTER TABLE "Vehicles" ADD COLUMN IF NOT EXISTS "EngineNumber" text NULL;
            ALTER TABLE "Vehicles" ADD COLUMN IF NOT EXISTS "PublicDescriptionMarkdown" text NULL;

            CREATE TABLE IF NOT EXISTS "StockMovements" (
                "Id" uuid NOT NULL,
                "VehicleId" uuid NOT NULL,
                "FieldName" text NOT NULL,
                "PreviousValue" text NOT NULL,
                "NewValue" text NOT NULL,
                "Reason" text NOT NULL,
                "Actor" text NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_StockMovements" PRIMARY KEY ("Id")
            );

            CREATE INDEX IF NOT EXISTS "IX_StockMovements_VehicleId_CreatedAt" ON "StockMovements" ("VehicleId", "CreatedAt");
        """);
    }

    private static async Task EnsureAiUsageSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "AiServiceLimits" (
                "Id" uuid NOT NULL,
                "Service" integer NOT NULL,
                "IsEnabled" boolean NOT NULL,
                "MonthlyRequestLimit" integer NOT NULL,
                "PerStaffDailyRequestLimit" integer NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL,
                "UpdatedBy" text NOT NULL,
                CONSTRAINT "PK_AiServiceLimits" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "AiUsageRecords" (
                "Id" uuid NOT NULL,
                "Service" integer NOT NULL,
                "SourceDocumentId" uuid NOT NULL,
                "StaffUserId" text NOT NULL,
                "Status" integer NOT NULL,
                "RequestedAt" timestamp with time zone NOT NULL,
                "CompletedAt" timestamp with time zone NULL,
                CONSTRAINT "PK_AiUsageRecords" PRIMARY KEY ("Id")
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AiServiceLimits_Service" ON "AiServiceLimits" ("Service");
            CREATE INDEX IF NOT EXISTS "IX_AiUsageRecords_Service_RequestedAt" ON "AiUsageRecords" ("Service", "RequestedAt");
            CREATE INDEX IF NOT EXISTS "IX_AiUsageRecords_Service_StaffUserId_RequestedAt" ON "AiUsageRecords" ("Service", "StaffUserId", "RequestedAt");
        """);
    }

    private static async Task EnsureVehicleCatalogSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "VehicleCatalogModels" (
                "Id" uuid NOT NULL,
                "Make" text NOT NULL,
                "Model" text NOT NULL,
                "IsActive" boolean NOT NULL,
                CONSTRAINT "PK_VehicleCatalogModels" PRIMARY KEY ("Id")
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_VehicleCatalogModels_Make_Model" ON "VehicleCatalogModels" ("Make", "Model");
        """);
    }

    private static async Task EnsureVehiclePhotoAttributionSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "IsRepresentativeImage" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "SourceName" text NULL;
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "SourceUrl" text NULL;
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "CreatorAttribution" text NULL;
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "LicenseName" text NULL;
            ALTER TABLE "VehiclePhotos" ADD COLUMN IF NOT EXISTS "LicenseUrl" text NULL;
        """);
    }

    private static async Task EnsureDocumentOwnershipSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "DocumentBlobs" ADD COLUMN IF NOT EXISTS "RepairJobId" uuid NULL;
            ALTER TABLE "DocumentBlobs" ADD COLUMN IF NOT EXISTS "PaymentRecordId" uuid NULL;
            ALTER TABLE "DocumentBlobs" ADD COLUMN IF NOT EXISTS "OwnerId" uuid NULL;
            ALTER TABLE "Owners" ADD COLUMN IF NOT EXISTS "IcNumber" text NULL;
            ALTER TABLE "Owners" ADD COLUMN IF NOT EXISTS "Address" text NULL;

            CREATE INDEX IF NOT EXISTS "IX_DocumentBlobs_OwnerId" ON "DocumentBlobs" ("OwnerId");
            CREATE INDEX IF NOT EXISTS "IX_DocumentBlobs_RepairJobId" ON "DocumentBlobs" ("RepairJobId");
            CREATE INDEX IF NOT EXISTS "IX_DocumentBlobs_PaymentRecordId" ON "DocumentBlobs" ("PaymentRecordId");
        """);
    }

    private static async Task EnsureCashCustodySchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "CashHandovers" (
                "Id" uuid NOT NULL,
                "PaymentRecordId" uuid NOT NULL,
                "VehicleId" uuid NOT NULL,
                "CustomerId" uuid NOT NULL,
                "Amount" numeric NOT NULL,
                "Status" integer NOT NULL,
                "CollectedByUserId" text NOT NULL,
                "CollectedAt" timestamp with time zone NOT NULL,
                "HandoverRequestedAt" timestamp with time zone NULL,
                "HandedOverToUserId" text NULL,
                "HandedOverAt" timestamp with time zone NULL,
                "AcceptedByUserId" text NULL,
                "AcceptedAt" timestamp with time zone NULL,
                "RejectedByUserId" text NULL,
                "RejectedAt" timestamp with time zone NULL,
                "RejectionReason" text NULL,
                "Notes" text NULL,
                "OfficialReceiptId" uuid NULL,
                "OfficialReceiptNumber" text NULL,
                CONSTRAINT "PK_CashHandovers" PRIMARY KEY ("Id")
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CashHandovers_PaymentRecordId" ON "CashHandovers" ("PaymentRecordId");
            CREATE INDEX IF NOT EXISTS "IX_CashHandovers_Status_CollectedAt" ON "CashHandovers" ("Status", "CollectedAt");

            CREATE TABLE IF NOT EXISTS "OfficialReceipts" (
                "Id" uuid NOT NULL,
                "CashHandoverId" uuid NOT NULL,
                "PaymentRecordId" uuid NOT NULL,
                "ReceiptNumber" text NOT NULL,
                "Amount" numeric NOT NULL,
                "Content" bytea NOT NULL,
                "ContentMimeType" text NOT NULL,
                "CreatedBy" text NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_OfficialReceipts" PRIMARY KEY ("Id")
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_OfficialReceipts_CashHandoverId" ON "OfficialReceipts" ("CashHandoverId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_OfficialReceipts_ReceiptNumber" ON "OfficialReceipts" ("ReceiptNumber");
        """);
    }

    private static async Task EnsureFinanceRepairEnhancementSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "ReceiptNumber" text NULL;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "InvoiceNumber" text NULL;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "BossChecked" boolean NOT NULL DEFAULT false;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "DocumentsPrepared" boolean NOT NULL DEFAULT false;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "ChecklistValidated" boolean NOT NULL DEFAULT false;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "SalesPrice" numeric NOT NULL DEFAULT 0;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "InterestAdditionalCharges" numeric NOT NULL DEFAULT 0;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "NcdAmount" numeric NOT NULL DEFAULT 0;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "WindscreenCharges" numeric NOT NULL DEFAULT 0;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "OutstationDeliveryDate" date NULL;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "BankName" text NULL;
            ALTER TABLE "PaymentRecords" ADD COLUMN IF NOT EXISTS "BankFollowUpDate" date NULL;

            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "RepairPart" text NOT NULL DEFAULT '';
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "ApprovalStatus" integer NOT NULL DEFAULT 1;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "ApprovalNotes" text NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "ApprovedBy" text NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "ApprovedAt" timestamp with time zone NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "AssignedTo" text NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "StartedOn" date NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "ExpectedCompletionDate" date NULL;
            ALTER TABLE "RepairJobs" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "ClosureOutcome" integer NULL;
            ALTER TABLE "Vehicles" ADD COLUMN IF NOT EXISTS "SoldAt" timestamp with time zone NULL;

            ALTER TABLE "SupplierInvoices" ADD COLUMN IF NOT EXISTS "PlateNumberOnInvoice" text NULL;
            ALTER TABLE "SupplierInvoices" ADD COLUMN IF NOT EXISTS "DueDate" date NULL;
            ALTER TABLE "SupplierInvoices" ADD COLUMN IF NOT EXISTS "PaidAt" date NULL;
            ALTER TABLE "SupplierInvoices" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

            ALTER TABLE "SettlementReminders" ADD COLUMN IF NOT EXISTS "OwnerId" uuid NULL;

            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "InsuranceExpiryDate" date NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "RoadTaxExpiryDate" date NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "WindscreenInsuranceExpiryDate" date NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "InspectionBookingReference" text NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "InspectionReportReference" text NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "NotificationSent" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "TwoDayNoticeSent" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "InsurancePolicyReference" text NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "InsuranceHandled" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "RoadTaxReceiptReference" text NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "RoadTaxHandled" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "WindscreenPolicyReference" text NULL;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "WindscreenInsuranceHandled" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "HandoverPhotoCaptured" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "SignedHandoverReceived" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "CustomerAcknowledged" boolean NOT NULL DEFAULT false;
            ALTER TABLE "DeliverySchedules" ADD COLUMN IF NOT EXISTS "FinalChecklistConfirmed" boolean NOT NULL DEFAULT false;

            CREATE TABLE IF NOT EXISTS "DailySpends" (
                "Id" uuid NOT NULL,
                "Description" text NOT NULL,
                "Amount" numeric NOT NULL,
                "DueDate" date NOT NULL,
                "IsPaid" boolean NOT NULL,
                CONSTRAINT "PK_DailySpends" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "BrokerCommissions" (
                "Id" uuid NOT NULL,
                "VehicleId" uuid NOT NULL,
                "BrokerName" text NOT NULL,
                "Amount" numeric NOT NULL,
                "IsPaid" boolean NOT NULL,
                "Cp58Required" boolean NOT NULL,
                "Cp58Prepared" boolean NOT NULL,
                CONSTRAINT "PK_BrokerCommissions" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "DebtRecoveryCases" (
                "Id" uuid NOT NULL,
                "VehicleId" uuid NOT NULL,
                "CustomerId" uuid NOT NULL,
                "BalanceAmount" numeric NOT NULL,
                "Status" integer NOT NULL,
                "FollowUpDate" date NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_DebtRecoveryCases" PRIMARY KEY ("Id")
            );

            CREATE TABLE IF NOT EXISTS "PaymentVouchers" (
                "Id" uuid NOT NULL,
                "VehicleId" uuid NOT NULL,
                "PayeeName" text NOT NULL,
                "Amount" numeric NOT NULL,
                "Purpose" text NOT NULL,
                "Status" integer NOT NULL,
                "IssuedDate" date NOT NULL,
                "Notes" text NULL,
                CONSTRAINT "PK_PaymentVouchers" PRIMARY KEY ("Id")
            );
        """);
    }

    private static async Task EnsureRepairReceiptSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "RepairReceipts" (
                "Id" uuid NOT NULL PRIMARY KEY,
                "RepairJobId" uuid NOT NULL,
                "DocumentId" uuid NOT NULL,
                "SupplierName" text NULL,
                "InvoiceNumber" text NULL,
                "TotalAmount" numeric NULL,
                "CreatedAt" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_RepairReceipts_DocumentId" ON "RepairReceipts" ("DocumentId");
            CREATE INDEX IF NOT EXISTS "IX_RepairReceipts_RepairJobId" ON "RepairReceipts" ("RepairJobId");
            CREATE TABLE IF NOT EXISTS "RepairReceiptItems" (
                "Id" uuid NOT NULL PRIMARY KEY,
                "RepairReceiptId" uuid NOT NULL,
                "Description" text NOT NULL,
                "RepairPart" text NULL,
                "Amount" numeric NOT NULL,
                "SortOrder" integer NOT NULL
            );
            CREATE INDEX IF NOT EXISTS "IX_RepairReceiptItems_RepairReceiptId_SortOrder" ON "RepairReceiptItems" ("RepairReceiptId", "SortOrder");
        """);
    }
}
