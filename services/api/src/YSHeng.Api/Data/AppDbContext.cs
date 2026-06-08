using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Owner> Owners => Set<Owner>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<VehiclePhoto> VehiclePhotos => Set<VehiclePhoto>();
    public DbSet<DocumentBlob> DocumentBlobs => Set<DocumentBlob>();
    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();
    public DbSet<RepairJob> RepairJobs => Set<RepairJob>();
    public DbSet<SupplierInvoice> SupplierInvoices => Set<SupplierInvoice>();
    public DbSet<LoanApplication> LoanApplications => Set<LoanApplication>();
    public DbSet<DeliverySchedule> DeliverySchedules => Set<DeliverySchedule>();
    public DbSet<PaymentRecord> PaymentRecords => Set<PaymentRecord>();
    public DbSet<SettlementReminder> SettlementReminders => Set<SettlementReminder>();
    public DbSet<DailySpend> DailySpends => Set<DailySpend>();
    public DbSet<BrokerCommission> BrokerCommissions => Set<BrokerCommission>();
    public DbSet<DebtRecoveryCase> DebtRecoveryCases => Set<DebtRecoveryCase>();
    public DbSet<PaymentVoucher> PaymentVouchers => Set<PaymentVoucher>();
    public DbSet<HrAttendanceRecord> HrAttendanceRecords => Set<HrAttendanceRecord>();
    public DbSet<HrLeaveRequest> HrLeaveRequests => Set<HrLeaveRequest>();
    public DbSet<HrLeaveBalance> HrLeaveBalances => Set<HrLeaveBalance>();
    public DbSet<HrLeavePolicy> HrLeavePolicies => Set<HrLeavePolicy>();
    public DbSet<HrLeaveAdjustment> HrLeaveAdjustments => Set<HrLeaveAdjustment>();
    public DbSet<HrPayrollProfile> HrPayrollProfiles => Set<HrPayrollProfile>();
    public DbSet<HrPayPeriod> HrPayPeriods => Set<HrPayPeriod>();
    public DbSet<HrPayslip> HrPayslips => Set<HrPayslip>();
    public DbSet<OcrJob> OcrJobs => Set<OcrJob>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Vehicle>().HasIndex(vehicle => vehicle.PlateNumber).IsUnique();
        builder.Entity<Lead>().HasIndex(lead => lead.VehicleId);
        builder.Entity<VehiclePhoto>().Property(photo => photo.Content).HasColumnType("bytea");
        builder.Entity<VehiclePhoto>().Property(photo => photo.Thumbnail).HasColumnType("bytea");
        builder.Entity<DocumentBlob>().Property(document => document.Content).HasColumnType("bytea");
        builder.Entity<HrAttendanceRecord>().HasIndex(record => new { record.StaffUserId, record.AttendanceDate });
        builder.Entity<HrLeaveBalance>().HasIndex(balance => balance.StaffUserId).IsUnique();
        builder.Entity<HrLeavePolicy>().HasIndex(policy => policy.Role).IsUnique();
        builder.Entity<HrLeaveAdjustment>().HasIndex(adjustment => new { adjustment.StaffUserId, adjustment.CreatedAt });
        builder.Entity<HrPayrollProfile>().HasIndex(profile => profile.StaffUserId).IsUnique();
        builder.Entity<HrPayPeriod>().HasIndex(period => period.Name).IsUnique();
        builder.Entity<HrPayslip>().HasIndex(payslip => new { payslip.StaffUserId, payslip.PayPeriodId }).IsUnique();
        builder.Entity<OcrJob>().HasIndex(job => job.DocumentId);
    }
}
