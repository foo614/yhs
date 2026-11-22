using System.Security.Claims;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class CalendarTaskTests
{
    [Fact]
    public void WhatsApp_task_projection_excludes_other_staff_and_completed_work()
    {
        var day = new DateOnly(2026, 12, 1);
        var task = new CalendarTask { Title = "Assigned job", AssignedToUserId = "worker", StartDate = day, EndDate = day.AddDays(1), StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(17, 30) };
        var message = WhatsAppCalendarTasks.Project([task], day, "worker", false, "en_US");
        Assert.NotNull(message);
        Assert.Contains("01/12/2026 09:00-02/12/2026 17:30", message);
        Assert.Null(WhatsAppCalendarTasks.Project([task], day, "other", false, "en_US"));
        Assert.Null(WhatsAppCalendarTasks.Project([task with { Status = CalendarTaskStatus.Done }], day, "worker", false, "en_US"));
        Assert.Null(WhatsAppCalendarTasks.Project([task with { AssignedToUserId = "new-worker" }], day, "worker", false, "en_US"));
        Assert.NotNull(WhatsAppCalendarTasks.Project([task], day, "boss", true, "en_US"));
    }

    [Fact]
    public void Task_read_and_management_permissions_are_scoped()
    {
        var task = new CalendarTask { AssignedToUserId = "staff-1" };
        var boss = Principal("BossAdmin");
        var sales = Principal("Sales");
        var otherStaff = Principal("Delivery");

        Assert.True(CalendarTaskRules.CanManage(boss));
        Assert.False(CalendarTaskRules.CanManage(sales));
        Assert.True(CalendarTaskRules.CanReadTask(task, boss, "boss-1"));
        Assert.True(CalendarTaskRules.CanReadTask(task, sales, "staff-1"));
        Assert.False(CalendarTaskRules.CanReadTask(task, otherStaff, "staff-2"));
    }

    [Fact]
    public async Task Task_persists_with_assignment_and_open_status()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
        await using (var setup = new AppDbContext(options))
        {
            await setup.Database.EnsureCreatedAsync();
            setup.CalendarTasks.Add(new CalendarTask
            {
                Title = "Prepare delivery documents",
                Description = "Check the signed set before handover.",
                StartDate = new DateOnly(2026, 11, 13),
                EndDate = new DateOnly(2026, 11, 14),
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(17, 30),
                AssignedToUserId = "staff-1",
                AssignedToName = "Synthetic Broker",
                CreatedByUserId = "boss-1",
                CreatedByName = "Boss Admin"
            });
            await setup.SaveChangesAsync();
        }

        await using var read = new AppDbContext(options);
        var saved = await read.CalendarTasks.SingleAsync();
        Assert.Equal("Prepare delivery documents", saved.Title);
        Assert.Equal("staff-1", saved.AssignedToUserId);
        Assert.Equal(CalendarTaskStatus.Open, saved.Status);
        Assert.Equal(new DateOnly(2026, 11, 14), saved.EndDate);
        Assert.Equal(new TimeOnly(9, 0), saved.StartTime);
        Assert.Equal(new TimeOnly(17, 30), saved.EndTime);
        var notification = CalendarTaskRules.ToNotificationEvent(saved);
        Assert.Equal(saved.StartTime, notification.StartTime);
        Assert.Equal(saved.EndTime, notification.EndTime);
    }

    [Fact]
    public void Task_time_validation_requires_a_pair_and_forward_datetime()
    {
        var day = new DateOnly(2026, 11, 13);
        static CalendarTaskRequest Request(DateOnly startDate, DateOnly endDate, TimeOnly? startTime = null, TimeOnly? endTime = null)
            => new("Prepare delivery", null, startDate, endDate, "staff-1", startTime, endTime);

        Assert.Null(CalendarTaskRules.Validate(Request(day, day)));
        Assert.Contains("both", CalendarTaskRules.Validate(Request(day, day, new TimeOnly(9, 0))));
        Assert.Contains("after", CalendarTaskRules.Validate(Request(day, day, new TimeOnly(17, 0), new TimeOnly(9, 0))));
        Assert.Null(CalendarTaskRules.Validate(Request(day, day.AddDays(1), new TimeOnly(17, 0), new TimeOnly(9, 0))));
    }

    [Fact]
    public void Actual_deal_price_updates_follow_current_assignment_and_boss_authority()
    {
        var vehicle = new Vehicle { SalesAgentUserId = "broker-1" };
        Assert.True(BrokerDealPriceRules.CanUpdate(vehicle, Principal("Sales"), "broker-1"));
        Assert.False(BrokerDealPriceRules.CanUpdate(vehicle, Principal("Sales"), "broker-2"));
        Assert.False(BrokerDealPriceRules.CanUpdate(vehicle with { SalesAgentUserId = "broker-2" }, Principal("Sales"), "broker-1"));
        Assert.False(BrokerDealPriceRules.CanUpdate(vehicle with { SalesAgentUserId = null }, Principal("Sales"), "broker-1"));
        Assert.True(BrokerDealPriceRules.CanUpdate(vehicle, Principal("BossAdmin"), "boss-1"));
        Assert.True(BrokerDealPriceRules.CanUpdate(vehicle with { SalesAgentUserId = null }, Principal("BossAdmin"), "boss-1"));
        Assert.True(BrokerDealPriceRules.CanUpdate(vehicle, Principal("BossAdmin", "Sales"), "boss-1"));
        Assert.False(BrokerDealPriceRules.CanUpdate(vehicle, Principal("Finance"), "finance-1"));
        Assert.Null(BrokerDealPriceRules.Validate(new BrokerDealPriceRequest(58000m)));
        Assert.NotNull(BrokerDealPriceRules.Validate(new BrokerDealPriceRequest(0m)));
    }

    [Fact]
    public void Sales_workboard_returns_actual_deal_price_without_replacing_stock_price()
    {
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            PlateNumber = "ABC1234",
            Make = "Honda",
            Model = "Civic",
            SalesAgentUserId = "broker-1",
            SalesAgentName = "Synthetic Broker",
            SellingPrice = 62000m
        };
        var result = SalesWorkboardRules.Create(
            ["broker-1"],
            new DateOnly(2026, 11, 14),
            [vehicle], [], [], [], [], [], [],
            brokerDealPrices: [new BrokerDealPrice { VehicleId = vehicle.Id, Amount = 60500m }]);

        var item = Assert.Single(result.Items);
        Assert.Equal(60500m, item.ActualSellingPrice);
        Assert.Equal(62000m, vehicle.SellingPrice);
    }

    private static ClaimsPrincipal Principal(params string[] roles)
        => new(new ClaimsIdentity(roles.Select(role => new Claim(ClaimTypes.Role, role)), "test"));
}
