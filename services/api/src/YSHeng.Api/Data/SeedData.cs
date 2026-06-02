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

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var email = config["SeedAdmin:Email"] ?? "admin@ysheng.local";
        var password = config["SeedAdmin:Password"] ?? "ChangeMe123!";
        var admin = await userManager.FindByEmailAsync(email);
        if (admin is null)
        {
            admin = new AppUser { UserName = email, Email = email, DisplayName = "Boss Admin" };
            await userManager.CreateAsync(admin, password);
            await userManager.AddToRoleAsync(admin, "BossAdmin");
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
}
