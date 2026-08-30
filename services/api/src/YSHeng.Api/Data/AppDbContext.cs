using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<VehicleCatalogModel> VehicleCatalogModels => Set<VehicleCatalogModel>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Owner> Owners => Set<Owner>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<VehiclePhoto> VehiclePhotos => Set<VehiclePhoto>();
    public DbSet<DocumentBlob> DocumentBlobs => Set<DocumentBlob>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();
    public DbSet<PurchaseInvoiceLine> PurchaseInvoiceLines => Set<PurchaseInvoiceLine>();
    public DbSet<RepairJob> RepairJobs => Set<RepairJob>();
    public DbSet<RepairReceipt> RepairReceipts => Set<RepairReceipt>();
    public DbSet<RepairReceiptItem> RepairReceiptItems => Set<RepairReceiptItem>();
    public DbSet<SupplierInvoice> SupplierInvoices => Set<SupplierInvoice>();
    public DbSet<LoanApplication> LoanApplications => Set<LoanApplication>();
    public DbSet<DeliverySchedule> DeliverySchedules => Set<DeliverySchedule>();
    public DbSet<DeliveryAccountingCharge> DeliveryAccountingCharges => Set<DeliveryAccountingCharge>();
    public DbSet<PaymentRecord> PaymentRecords => Set<PaymentRecord>();
    public DbSet<FinanceInvoice> FinanceInvoices => Set<FinanceInvoice>();
    public DbSet<CollectionTransaction> CollectionTransactions => Set<CollectionTransaction>();
    public DbSet<SettlementReminder> SettlementReminders => Set<SettlementReminder>();
    public DbSet<DailySpend> DailySpends => Set<DailySpend>();
    public DbSet<BrokerCommission> BrokerCommissions => Set<BrokerCommission>();
    public DbSet<DebtRecoveryCase> DebtRecoveryCases => Set<DebtRecoveryCase>();
    public DbSet<PaymentVoucher> PaymentVouchers => Set<PaymentVoucher>();
    public DbSet<CashHandover> CashHandovers => Set<CashHandover>();
    public DbSet<OfficialReceipt> OfficialReceipts => Set<OfficialReceipt>();
    public DbSet<HrAttendanceRecord> HrAttendanceRecords => Set<HrAttendanceRecord>();
    public DbSet<HrAttendanceNetwork> HrAttendanceNetworks => Set<HrAttendanceNetwork>();
    public DbSet<HrLeaveRequest> HrLeaveRequests => Set<HrLeaveRequest>();
    public DbSet<HrLeaveBalance> HrLeaveBalances => Set<HrLeaveBalance>();
    public DbSet<HrLeavePolicy> HrLeavePolicies => Set<HrLeavePolicy>();
    public DbSet<HrLeaveAdjustment> HrLeaveAdjustments => Set<HrLeaveAdjustment>();
    public DbSet<HrPayrollProfile> HrPayrollProfiles => Set<HrPayrollProfile>();
    public DbSet<HrPayPeriod> HrPayPeriods => Set<HrPayPeriod>();
    public DbSet<HrPayslip> HrPayslips => Set<HrPayslip>();
    public DbSet<OcrJob> OcrJobs => Set<OcrJob>();
    public DbSet<AiServiceLimit> AiServiceLimits => Set<AiServiceLimit>();
    public DbSet<AiUsageRecord> AiUsageRecords => Set<AiUsageRecord>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Vehicle>().HasIndex(vehicle => vehicle.PlateNumber).IsUnique();
        builder.Entity<VehicleCatalogModel>().HasIndex(item => new { item.Make, item.Model }).IsUnique();
        builder.Entity<StockMovement>().HasIndex(movement => new { movement.VehicleId, movement.CreatedAt });
        builder.Entity<Supplier>().HasIndex(supplier => supplier.CompanyName).IsUnique();
        builder.Entity<Supplier>().HasIndex(supplier => supplier.AutoCountCreditorCode).IsUnique();
        builder.Entity<PurchaseInvoiceLine>().HasIndex(line => new { line.PurchaseInvoiceId, line.LineType });
        builder.Entity<DeliveryAccountingCharge>().HasIndex(charge => new { charge.DeliveryScheduleId, charge.ChargeType }).IsUnique();
        builder.Entity<Lead>().HasIndex(lead => lead.VehicleId);
        builder.Entity<VehiclePhoto>().Property(photo => photo.Content).HasColumnType("bytea");
        builder.Entity<VehiclePhoto>().Property(photo => photo.Thumbnail).HasColumnType("bytea");
        builder.Entity<DocumentBlob>().Property(document => document.Content).HasColumnType("bytea");
        builder.Entity<DocumentBlob>().HasIndex(document => document.OwnerId);
        builder.Entity<DocumentBlob>().HasIndex(document => document.OwnershipType);
        builder.Entity<DocumentBlob>().HasIndex(document => document.RepairJobId);
        builder.Entity<DocumentBlob>().HasIndex(document => document.PaymentRecordId);
        builder.Entity<DocumentBlob>().HasIndex(document => document.CollectionTransactionId);
        builder.Entity<DocumentBlob>().HasIndex(document => document.DeliveryScheduleId);
        builder.Entity<DeliverySchedule>().HasIndex(delivery => delivery.CustomerId);
        builder.Entity<RepairReceipt>().HasIndex(receipt => receipt.RepairJobId);
        builder.Entity<RepairReceipt>().HasIndex(receipt => receipt.DocumentId).IsUnique();
        builder.Entity<RepairReceiptItem>().HasIndex(item => new { item.RepairReceiptId, item.SortOrder });
        builder.Entity<FinanceInvoice>().Property(invoice => invoice.Content).HasColumnType("bytea");
        builder.Entity<FinanceInvoice>().HasIndex(invoice => invoice.PaymentRecordId).IsUnique();
        builder.Entity<FinanceInvoice>().HasIndex(invoice => invoice.InvoiceNumber).IsUnique();
        builder.Entity<PaymentRecord>()
            .HasIndex(payment => payment.VehicleId)
            .HasDatabaseName("IX_PaymentRecords_VehicleId_FinanceV2")
            .HasFilter("\"FinanceWorkflowVersion\" = 2")
            .IsUnique();
        builder.Entity<CollectionTransaction>().HasIndex(collection => new { collection.PaymentRecordId, collection.CreatedAt });
        builder.Entity<CollectionTransaction>()
            .HasIndex(collection => new { collection.PaymentRecordId, collection.IdempotencyKey })
            .HasDatabaseName("IX_CollectionTransactions_PaymentRecordId_IdempotencyKey")
            .IsUnique();
        builder.Entity<CollectionTransaction>().HasIndex(collection => new { collection.Status, collection.ReceivedDate });
        builder.Entity<CollectionTransaction>().HasIndex(collection => collection.Reference);
        builder.Entity<CollectionTransaction>()
            .HasIndex(collection => new { collection.Method, collection.NormalizedReference })
            .HasDatabaseName("UX_CollectionTransactions_ActiveMethod_NormalizedReference")
            .HasFilter("\"NormalizedReference\" IS NOT NULL AND \"Status\" <> 2")
            .IsUnique();
        builder.Entity<CashHandover>().HasIndex(handover => handover.PaymentRecordId).IsUnique();
        builder.Entity<CashHandover>().HasIndex(handover => new { handover.Status, handover.CollectedAt });
        builder.Entity<OfficialReceipt>().Property(receipt => receipt.Content).HasColumnType("bytea");
        builder.Entity<OfficialReceipt>().HasIndex(receipt => receipt.CashHandoverId).IsUnique();
        builder.Entity<OfficialReceipt>().HasIndex(receipt => receipt.ReceiptNumber).IsUnique();
        builder.Entity<HrAttendanceRecord>().HasIndex(record => new { record.StaffUserId, record.AttendanceDate });
        builder.Entity<HrAttendanceNetwork>().HasIndex(network => network.Cidr).IsUnique();
        builder.Entity<HrLeaveBalance>().HasIndex(balance => balance.StaffUserId).IsUnique();
        builder.Entity<HrLeavePolicy>().HasIndex(policy => policy.Role).IsUnique();
        builder.Entity<HrLeaveAdjustment>().HasIndex(adjustment => new { adjustment.StaffUserId, adjustment.CreatedAt });
        builder.Entity<HrPayrollProfile>().HasIndex(profile => profile.StaffUserId).IsUnique();
        builder.Entity<HrPayPeriod>().HasIndex(period => period.Name).IsUnique();
        builder.Entity<HrPayslip>().HasIndex(payslip => new { payslip.StaffUserId, payslip.PayPeriodId }).IsUnique();
        builder.Entity<OcrJob>().HasIndex(job => job.DocumentId);
        builder.Entity<AiServiceLimit>().HasIndex(limit => limit.Service).IsUnique();
        builder.Entity<AiUsageRecord>().HasIndex(record => new { record.Service, record.RequestedAt });
        builder.Entity<AiUsageRecord>().HasIndex(record => new { record.Service, record.StaffUserId, record.RequestedAt });
    }
}
