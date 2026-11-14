using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Operational data is separate from the Boss-only finance dashboard.
public sealed record DashboardUpdate(string Id, string Kind, string Title, string Status, DateTime? OccurredAt,
    Guid? VehicleId = null, string? Plate = null, string? Broker = null, string? RecordedBy = null,
    DateOnly? Date = null, string? Time = null, int? DaysOpen = null, decimal? AskingPrice = null,
    string? Path = null, Guid? LouDocumentId = null);
public sealed record DashboardUpdatesResponse(IReadOnlyList<DashboardUpdate> News, IReadOnlyList<DashboardUpdate> Reminders);
public sealed record DashboardLoanDocument(Guid Id, Guid? LoanApplicationId, Guid? VehicleId);

public static class DashboardUpdates
{
    public static async Task<DashboardUpdatesResponse> LoadAsync(AppDbContext db, string userId, string actor,
        string[] roles, DateOnly today) => Create(userId, actor, roles, today,
        await db.Vehicles.AsNoTracking().ToListAsync(), await db.Leads.AsNoTracking().ToListAsync(),
        await db.LoanApplications.AsNoTracking().ToListAsync(), await db.DeliverySchedules.AsNoTracking().ToListAsync(),
        await db.DeliveryActivities.AsNoTracking().Where(x => x.Action == "Created").ToListAsync(),
        await db.BrokerDealPrices.AsNoTracking().ToListAsync(),
        await db.CalendarTasks.AsNoTracking().Where(x => x.Status == CalendarTaskStatus.Open).ToListAsync(),
        await db.AuditLogs.AsNoTracking().Where(x => x.EntityName == nameof(LoanApplication)).ToListAsync(),
        await db.DocumentBlobs.AsNoTracking().Where(x => x.Category == FileCategory.LoanDocument)
            .Select(x => new DashboardLoanDocument(x.Id, x.LoanApplicationId, x.VehicleId)).ToListAsync());

    public static DashboardUpdatesResponse Create(string userId, string actor, string[] roles, DateOnly today,
        IReadOnlyList<Vehicle> vehicles, IReadOnlyList<Lead> leads, IReadOnlyList<LoanApplication> loans,
        IReadOnlyList<DeliverySchedule> deliveries, IReadOnlyList<DeliveryActivity> deliveryActivities,
        IReadOnlyList<BrokerDealPrice> prices, IReadOnlyList<CalendarTask> tasks, IReadOnlyList<AuditLog> audits,
        IReadOnlyList<DashboardLoanDocument> documents)
    {
        var boss = roles.Contains("BossAdmin");
        var broker = roles.Contains("Sales");
        var loanStaff = roles.Contains("Loan");
        var deliveryStaff = roles.Contains("Delivery");
        var news = new List<DashboardUpdate>();
        var reminders = new List<DashboardUpdate>();
        var vehicleById = vehicles.ToDictionary(x => x.Id);
        var cutoff = today.AddDays(-30);
        bool Owns(Vehicle vehicle) => !string.IsNullOrEmpty(userId) &&
            (!string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId) ? vehicle.SalesAgentUserId == userId
                : leads.Any(x => x.VehicleId == vehicle.Id && x.TakenByUserId == userId &&
                    (x.Status != LeadStatus.Closed || x.ClosureOutcome == LeadClosureOutcome.Sold)));
        string? VehiclePath(Vehicle vehicle) => boss || broker ? $"/vehicles?vehicleId={vehicle.Id}" : null;
        foreach (var vehicle in vehicles)
        {
            if (vehicle.IntakeDate >= cutoff)
                news.Add(new($"stock:{vehicle.Id}", "NewStock", $"{vehicle.Year} {vehicle.Make} {vehicle.Model}",
                    vehicle.Status.ToString(), vehicle.IntakeAt ?? vehicle.IntakeDate.ToDateTime(TimeOnly.MinValue),
                    vehicle.Id, vehicle.PlateNumber, Date: vehicle.IntakeDate, AskingPrice: vehicle.SellingPrice, Path: VehiclePath(vehicle)));
            var price = prices.FirstOrDefault(x => x.VehicleId == vehicle.Id && x.Amount > 0);
            if (vehicle.Status == VehicleStatus.Sold && vehicle.CustomerId.HasValue)
            {
                if (price is not null && (boss || broker || loanStaff) && DateOnly.FromDateTime(vehicle.SoldAt ?? price.UpdatedAt) >= cutoff)
                    news.Add(new($"deal:{vehicle.Id}", "Deal", "Deal confirmed / 已成交", "Sold", vehicle.SoldAt ?? price.UpdatedAt,
                        vehicle.Id, vehicle.PlateNumber, price.BrokerName, Path: VehiclePath(vehicle)));
                if (price is null && (boss || broker && Owns(vehicle)))
                    reminders.Add(new($"price:{vehicle.Id}", "MissingDealPrice", "Fill deal price / 补成交价", "Pending",
                        vehicle.SoldAt, vehicle.Id, vehicle.PlateNumber, vehicle.SalesAgentName, Path: $"/leads?myCarsPlate={Uri.EscapeDataString(vehicle.PlateNumber)}"));
            }
        }
        foreach (var loan in loans)
        {
            if (!vehicleById.TryGetValue(loan.VehicleId, out var vehicle)) continue;
            var activity = audits.Where(x => x.EntityId == loan.Id).OrderBy(x => x.CreatedAt).ToList();
            var created = activity.FirstOrDefault(x => x.Action == "loan.created");
            var handled = activity.LastOrDefault(x => x.Action is "loan.updated" or "loan.approved" or "loan.rejected");
            var date = loan.SubmittedAt ?? (created is null ? (DateOnly?)null : DateOnly.FromDateTime(created.CreatedAt));
            var path = boss || loanStaff ? $"/loans?loanId={loan.Id}" : VehiclePath(vehicle);
            var item = new DashboardUpdate($"loan:{loan.Id}", "Loan", "Loan case / 贷款个案", loan.Status.ToString(),
                created?.CreatedAt, vehicle.Id, vehicle.PlateNumber, vehicle.SalesAgentName, handled?.Actor, date,
                DaysOpen: date.HasValue ? Math.Max(0, today.DayNumber - date.Value.DayNumber) : null, Path: path);
            if ((boss || broker || loanStaff) && date >= cutoff) news.Add(item);
            if ((boss || broker || loanStaff) && loan.LouApproved && loan.DecisionAt.HasValue && DateOnly.FromDateTime(loan.DecisionAt.Value) >= cutoff)
                news.Add(item with { Id = $"approved:{loan.Id}", Kind = "LoanApproved", Title = "Loan approved / 贷款已批",
                    OccurredAt = loan.DecisionAt, RecordedBy = loan.DecisionBy,
                    LouDocumentId = DepartmentAccess.CanViewDocument(roles, FileCategory.LoanDocument)
                        ? documents.FirstOrDefault(x => x.LoanApplicationId == loan.Id && x.VehicleId == vehicle.Id)?.Id : null });
            var ownLoan = broker && Owns(vehicle) || loanStaff && !string.IsNullOrWhiteSpace(actor) && activity.Any(x => x.Actor == actor);
            if (loan.Status is not (LoanStatus.Done or LoanStatus.Rejected) && (boss || ownLoan)) reminders.Add(item);
        }
        foreach (var delivery in deliveries)
        {
            if (delivery.Status is DeliveryStatus.BookingInspection or DeliveryStatus.Cancelled or DeliveryStatus.Released ||
                !vehicleById.TryGetValue(delivery.VehicleId, out var vehicle)) continue;
            var booking = deliveryActivities.Where(x => x.DeliveryScheduleId == delivery.Id && x.Action == "Created").OrderBy(x => x.CreatedAt).FirstOrDefault();
            var item = new DashboardUpdate($"delivery:{delivery.Id}", "Delivery", "Prepare delivery / 准备交车", delivery.Status.ToString(),
                booking?.CreatedAt, vehicle.Id, vehicle.PlateNumber, vehicle.SalesAgentName, booking?.ActorName,
                delivery.ScheduledDate, delivery.ScheduledTime?.ToString("HH:mm"),
                Path: boss || deliveryStaff ? $"/delivery?deliveryId={delivery.Id}" : VehiclePath(vehicle));
            if (delivery.ScheduledDate >= cutoff) news.Add(item);
            if (boss || !string.IsNullOrEmpty(userId) && (delivery.PicUserId == userId || booking?.ActorUserId == userId) || broker && Owns(vehicle)) reminders.Add(item);
        }
        foreach (var task in tasks.Where(x => x.Status == CalendarTaskStatus.Open && (boss || !string.IsNullOrEmpty(userId) && x.AssignedToUserId == userId)))
            reminders.Add(new($"task:{task.Id}", "Task", task.Title, "Open", task.CreatedAt,
                RecordedBy: task.AssignedToName, Date: task.StartDate, Time: task.StartTime?.ToString("HH:mm")));
        return new(news.OrderByDescending(x => x.OccurredAt ?? x.Date?.ToDateTime(TimeOnly.MinValue)).Take(60).ToList(),
            reminders.OrderBy(x => x.Date ?? DateOnly.MaxValue).ThenBy(x => x.Id).ToList());
    }
}
