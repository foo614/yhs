using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppWorkflowEventTests
{
    private const long Now = 1800000000;

    [Fact]
    public async Task Capture_is_transactional_and_repeated_source_revision_is_idempotent()
    {
        await using var fixture = await Fixture.Create();
        var vehicle = new Vehicle { PlateNumber = "VPK1234", Status = VehicleStatus.Available };
        await using (var db = fixture.Open())
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            db.Vehicles.Add(vehicle);
            await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.Intake, vehicle.Id, 1, vehicle, "test", Now);
            await db.SaveChangesAsync();
        }
        await using (var db = fixture.Open())
        {
            Assert.Empty(await db.WhatsAppWorkflowEvents.ToListAsync());
            db.Vehicles.Add(vehicle);
            await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.Intake, vehicle.Id, 1, vehicle, "test", Now);
            await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.Intake, vehicle.Id, 1, vehicle, "test", Now);
            await db.SaveChangesAsync();
        }
        await using (var db = fixture.Open())
        {
            await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.Intake, vehicle.Id, 1, vehicle, "test", Now);
            await db.SaveChangesAsync();
            Assert.Single(await db.WhatsAppWorkflowEvents.ToListAsync());
        }
    }

    [Fact]
    public async Task Sales_receipt_requires_current_canonical_assignee_and_contains_no_finance_details()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        AddRole(db, "Sales", "seller");
        AddRole(db, "Sales", "other");
        var vehicle = new Vehicle { PlateNumber = "VPK1234", SalesAgentUserId = "seller", Status = VehicleStatus.Available };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, ReceiptNumber = "PRIVATE-RECEIPT", NettPrice = 45678 };
        db.Vehicles.Add(vehicle);
        db.PaymentRecords.Add(payment);
        var captured = await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.ReceiptSaved,
            payment.Id, 1, vehicle, "test", Now);
        await db.SaveChangesAsync();
        Assert.NotNull(captured);
        Assert.Equal("Sales", captured.RequiredRole);
        Assert.Equal("seller", captured.TargetUserId);
        Assert.DoesNotContain("PRIVATE-RECEIPT", captured.Summary);
        Assert.DoesNotContain("45678", captured.Summary);
        Assert.Contains("receipt reference recorded", WhatsAppWorkflowEvents.RenderBody(captured, vehicle, "en_US"));
        Assert.Contains("rujukan resit direkodkan", WhatsAppWorkflowEvents.RenderBody(captured, vehicle, "ms"));
        Assert.DoesNotContain("PRIVATE-RECEIPT", WhatsAppWorkflowEvents.RenderBody(captured, vehicle, "ms"));
        Assert.True(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, captured, "seller", Now));
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, captured, "other", Now));
        db.Entry(vehicle).Property(item => item.SalesAgentUserId).CurrentValue = "other";
        await db.SaveChangesAsync();
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, captured, "seller", Now));
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, captured, "other", Now));
        var currentEvent = await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.ReceiptUpdated,
            payment.Id, 1, vehicle with { SalesAgentUserId = "other" }, "test", Now);
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, currentEvent!, "other", Now));
        await db.UserRoles.Where(item => item.UserId == "other").ExecuteDeleteAsync();
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, currentEvent!, "other", Now));
    }

    [Fact]
    public async Task Delivery_event_requires_actual_release_and_open_invoice_request()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        AddRole(db, "BossAdmin", "boss");
        var vehicle = new Vehicle { PlateNumber = "VPK1234", Status = VehicleStatus.Available };
        var delivery = new DeliverySchedule { VehicleId = vehicle.Id, Status = DeliveryStatus.BookingInspection };
        db.Vehicles.Add(vehicle);
        db.DeliverySchedules.Add(delivery);
        var release = await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.DeliveryRelease,
            delivery.Id, 1, vehicle, "test", Now);
        var invoice = await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.InvoiceUpdateRequest,
            delivery.Id, 1, vehicle, "test", Now);
        await db.SaveChangesAsync();
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, release!, "boss", Now));
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, invoice!, "boss", Now));
        db.Entry(delivery).Property(item => item.Status).CurrentValue = DeliveryStatus.Released;
        db.Entry(delivery).Property(item => item.ReleasedAt).CurrentValue = DateTime.UtcNow;
        db.Entry(delivery).Property(item => item.InvoiceUpdateRequestedAt).CurrentValue = DateTime.UtcNow;
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, release!, "boss", Now));
        Assert.True(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, invoice!, "boss", Now));
        await WhatsAppWorkflowEvents.ResolveInvoiceUpdateAsync(db, delivery.Id, Now);
        var resolved = await db.WhatsAppWorkflowEvents.AsNoTracking().SingleAsync(item => item.Id == invoice!.Id);
        Assert.False(await WhatsAppWorkflowEvents.CurrentFactsAsync(db, resolved, "boss", Now));
    }

    [Fact]
    public async Task Missing_canonical_sales_user_is_recorded_as_an_exception()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var vehicle = new Vehicle { PlateNumber = "VPK1234", Status = VehicleStatus.Available };
        var captured = await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.ReceiptEvidence,
            Guid.NewGuid(), 1, vehicle, "test", Now);
        Assert.Equal("No canonical Sales user is assigned to this vehicle.", captured!.Diagnostic);
        Assert.Null(captured.TargetUserId);
    }

    [Fact]
    public async Task Listing_request_blocks_duplicates_only_during_its_live_window()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var vehicle = new Vehicle { PlateNumber = "VPK1234", Status = VehicleStatus.Available };
        db.Vehicles.Add(vehicle);
        await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.PublicationRequest,
            vehicle.Id, 1, vehicle, "test", Now);
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppWorkflowEvents.HasOpenPublicationRequestAsync(db, vehicle.Id, Now + 86399));
        Assert.False(await WhatsAppWorkflowEvents.HasOpenPublicationRequestAsync(db, vehicle.Id, Now + 86400));
        Assert.Equal(2, await WhatsAppWorkflowEvents.NextVersionAsync(db, WhatsAppWorkflowEvents.PublicationRequest, vehicle.Id));
    }

    private static void AddRole(AppDbContext db, string role, string userId)
    {
        if (!db.Roles.Local.Any(item => item.Id == role)) db.Roles.Add(new IdentityRole { Id = role, Name = role, NormalizedName = role.ToUpperInvariant() });
        db.Users.Add(new AppUser { Id = userId, UserName = userId, SecurityStamp = "synthetic-stamp-" + userId });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = userId, RoleId = role });
    }

    private sealed class Fixture(SqliteConnection anchor, DbContextOptions<AppDbContext> options) : IAsyncDisposable
    {
        public AppDbContext Open() => new(options);
        public static async Task<Fixture> Create()
        {
            var connectionString = $"Data Source={Guid.NewGuid():N};Mode=Memory;Cache=Shared";
            var anchor = new SqliteConnection(connectionString);
            await anchor.OpenAsync();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connectionString).Options;
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            return new(anchor, options);
        }
        public ValueTask DisposeAsync() => anchor.DisposeAsync();
    }
}
