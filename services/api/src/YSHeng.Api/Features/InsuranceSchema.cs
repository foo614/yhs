using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public static class InsuranceSchema
{
    public static async Task EnsureAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "InsuranceCases" (
                "Id" uuid PRIMARY KEY,
                "PlateNumber" text NOT NULL,
                "CustomerName" text NOT NULL,
                "CustomerPhone" text NULL,
                "IdentityNumber" text NULL,
                "CaseType" text NOT NULL,
                "Company" text NOT NULL,
                "Insurer" text NOT NULL,
                "Coverage" text NOT NULL,
                "Ncd" numeric NULL,
                "Remark" text NULL,
                "ExpiryDate" date NOT NULL,
                "CoverStartDate" date NULL,
                "PolicyNumber" text NULL,
                "RenewalDeclined" boolean NOT NULL,
                "RenewedByCaseId" uuid NULL,
                "RoadTaxMethod" text NOT NULL,
                "RoadTaxMonths" integer NOT NULL,
                "RoadTaxExpiryDate" date NULL,
                "RoadTaxCompleted" boolean NOT NULL,
                "InsuranceAmount" numeric NOT NULL,
                "RoadTaxAmount" numeric NOT NULL,
                "RunnerFee" numeric NOT NULL,
                "Discount" numeric NOT NULL,
                "OtherChargesJson" text NOT NULL,
                "InvoiceNumber" text NULL,
                "InsurerInvoiceNumber" text NULL,
                "IntercompanyInvoiceNumber" text NULL,
                "BankCreditorName" text NULL,
                "BankInvoiceNumber" text NULL,
                "SpecialJpjSale" boolean NOT NULL,
                "ImportKey" text NULL,
                "ImportBatchKey" text NULL,
                "ImportFingerprint" text NULL,
                "Version" bigint NOT NULL,
                "CreatedBy" text NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "UpdatedAt" timestamp with time zone NOT NULL);
            CREATE TABLE IF NOT EXISTS "InsuranceAttachments" (
                "Id" uuid PRIMARY KEY,
                "CaseId" uuid NOT NULL,
                "Kind" text NOT NULL,
                "FileName" text NOT NULL,
                "MimeType" text NOT NULL,
                "Checksum" text NOT NULL,
                "Content" bytea NOT NULL,
                "UploadedBy" text NOT NULL,
                "UploadedAt" timestamp with time zone NOT NULL,
                FOREIGN KEY ("CaseId") REFERENCES "InsuranceCases" ("Id") ON DELETE RESTRICT);
            CREATE TABLE IF NOT EXISTS "InsuranceReceipts" (
                "Id" uuid PRIMARY KEY,
                "CaseId" uuid NOT NULL,
                "IdempotencyKey" text NOT NULL,
                "Amount" numeric NOT NULL,
                "PaymentType" text NOT NULL,
                "DepositAccount" text NOT NULL,
                "ReceivedDate" date NOT NULL,
                "EvidenceAttachmentId" uuid NULL,
                "InvoiceNumber" text NOT NULL,
                "Company" text NOT NULL,
                "Status" text NOT NULL,
                "CreatedBy" text NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "ConfirmedBy" text NULL,
                "ConfirmedAt" timestamp with time zone NULL,
                FOREIGN KEY ("CaseId") REFERENCES "InsuranceCases" ("Id") ON DELETE RESTRICT);
            CREATE TABLE IF NOT EXISTS "InsuranceInsurerPayments" (
                "Id" uuid PRIMARY KEY,
                "CaseId" uuid NOT NULL,
                "IdempotencyKey" text NOT NULL,
                "Amount" numeric NOT NULL,
                "PaidDate" date NOT NULL,
                "Reference" text NOT NULL,
                "ConfirmedBy" text NOT NULL,
                "ConfirmedAt" timestamp with time zone NOT NULL,
                FOREIGN KEY ("CaseId") REFERENCES "InsuranceCases" ("Id") ON DELETE RESTRICT);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_InsuranceCases_ImportKey" ON "InsuranceCases" ("ImportKey") WHERE "ImportKey" IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_InsuranceReceipts_CaseId_IdempotencyKey" ON "InsuranceReceipts" ("CaseId", "IdempotencyKey");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_InsuranceInsurerPayments_CaseId_IdempotencyKey" ON "InsuranceInsurerPayments" ("CaseId", "IdempotencyKey");
            """);
    }
}
