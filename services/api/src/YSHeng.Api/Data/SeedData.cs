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
                InvoiceGenerated = true,
                AutoCountKeyed = true,
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
    }

    private static async Task EnsureLeadSchemaAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenByUserId" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenByName" text NULL;
            ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "TakenAt" timestamp with time zone NULL;
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

            CREATE INDEX IF NOT EXISTS "IX_OcrJobs_DocumentId" ON "OcrJobs" ("DocumentId");
        """);
    }
}
