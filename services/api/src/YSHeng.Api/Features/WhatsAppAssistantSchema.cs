using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public static class WhatsAppAssistantSchema
{
    public static async Task EnsureAsync(AppDbContext db, CancellationToken ct = default)
    {
        // Production setup is additive and independently gated; no customer notification flags are changed.
        if (!db.Database.IsNpgsql()) throw new InvalidOperationException("Assistant schema setup requires PostgreSQL.");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "WhatsAppStaffBindings" (
                "Id" uuid PRIMARY KEY, "StaffUserId" text NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
                "Recipient" text NOT NULL, "PhoneNumberId" text NOT NULL, "SecurityStampHash" text NOT NULL,
                "Language" text NOT NULL, "VerifiedAt" bigint NOT NULL, "RevokedAt" bigint NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppStaffBindings_StaffUserId" ON "WhatsAppStaffBindings"("StaffUserId") WHERE "RevokedAt" IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppStaffBindings_PhoneNumberId_Recipient" ON "WhatsAppStaffBindings"("PhoneNumberId", "Recipient") WHERE "RevokedAt" IS NULL;
            CREATE TABLE IF NOT EXISTS "WhatsAppStaffChallenges" (
                "StaffUserId" text PRIMARY KEY REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
                "Recipient" text NOT NULL, "PhoneNumberId" text NOT NULL, "CodeHash" text NOT NULL,
                "SecurityStampHash" text NOT NULL, "Language" text NOT NULL, "CreatedAt" bigint NOT NULL,
                "ExpiresAt" bigint NOT NULL, "FailedAttempts" integer NOT NULL, "ConsumedAt" bigint NULL,
                "IssueWindowStart" bigint NOT NULL, "IssuesInWindow" integer NOT NULL);
            CREATE TABLE IF NOT EXISTS "WhatsAppStaffRequests" (
                "Id" uuid PRIMARY KEY, "EventKey" text NOT NULL,
                "BindingId" uuid NOT NULL REFERENCES "WhatsAppStaffBindings"("Id") ON DELETE RESTRICT,
                "Intent" text NOT NULL, "Argument" text NOT NULL, "State" text NOT NULL,
                "CreatedAt" bigint NOT NULL, "ExpiresAt" bigint NOT NULL, "LeaseUntil" bigint NOT NULL,
                "Attempts" integer NOT NULL, "ProviderMessageId" text NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppStaffRequests_EventKey" ON "WhatsAppStaffRequests"("EventKey");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppStaffRequests_ProviderMessageId" ON "WhatsAppStaffRequests"("ProviderMessageId");
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppStaffRequests_State_CreatedAt" ON "WhatsAppStaffRequests"("State", "CreatedAt");
            CREATE TABLE IF NOT EXISTS "WhatsAppVehicleIntakeDrafts" (
                "Id" uuid PRIMARY KEY, "BindingId" uuid NOT NULL REFERENCES "WhatsAppStaffBindings"("Id") ON DELETE RESTRICT,
                "RequestId" uuid NOT NULL, "PayloadJson" text NOT NULL, "State" text NOT NULL, "ExpiresAt" bigint NOT NULL,
                "ConfirmationToken" uuid NULL, "ConfirmBefore" bigint NULL, "VocContent" bytea NULL, "VocMime" text NULL,
                "IcContent" bytea NULL, "IcMime" text NULL, "ConfirmedAt" bigint NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppVehicleIntakeDrafts_RequestId" ON "WhatsAppVehicleIntakeDrafts"("RequestId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppVehicleIntakeDrafts_ConfirmationToken" ON "WhatsAppVehicleIntakeDrafts"("ConfirmationToken");
            CREATE TABLE IF NOT EXISTS "WhatsAppPriceUpdateDrafts" (
                "Id" uuid PRIMARY KEY, "IdempotencyKey" text NOT NULL, "BindingId" uuid NOT NULL REFERENCES "WhatsAppStaffBindings"("Id") ON DELETE RESTRICT,
                "VehicleId" uuid NOT NULL REFERENCES "Vehicles"("Id") ON DELETE RESTRICT, "PlateNumber" text NOT NULL,
                "OriginalSellingPrice" numeric NOT NULL, "ProposedSellingPrice" numeric NOT NULL,
                "State" text NOT NULL, "CreatedAt" bigint NOT NULL, "ExpiresAt" bigint NOT NULL,
                "ConfirmedBy" text NULL, "ConfirmedByUserId" text NULL, "ConfirmedAt" bigint NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppPriceUpdateDrafts_IdempotencyKey" ON "WhatsAppPriceUpdateDrafts"("IdempotencyKey");
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppPriceUpdateDrafts_Binding_State_Expires" ON "WhatsAppPriceUpdateDrafts"("BindingId", "State", "ExpiresAt");
            CREATE TABLE IF NOT EXISTS "WhatsAppSettlementUpdateDrafts" (
                "Id" uuid PRIMARY KEY, "IdempotencyKey" text NOT NULL, "BindingId" uuid NOT NULL REFERENCES "WhatsAppStaffBindings"("Id") ON DELETE RESTRICT,
                "SettlementId" uuid NOT NULL REFERENCES "SettlementReminders"("Id") ON DELETE RESTRICT, "VehicleId" uuid NOT NULL REFERENCES "Vehicles"("Id") ON DELETE RESTRICT,
                "PlateNumber" text NOT NULL, "OriginalBankDebtAmount" numeric NOT NULL, "OriginalAmount" numeric NOT NULL,
                "OriginalDeadline" date NOT NULL, "OriginalBankName" text NOT NULL, "OriginalBankAccountNumber" text NOT NULL,
                "ProposedBankDebtAmount" numeric NOT NULL, "ProposedDeadline" date NOT NULL, "ProposedBankName" text NOT NULL,
                "ProposedBankAccountNumber" text NOT NULL, "State" text NOT NULL, "CreatedAt" bigint NOT NULL, "ExpiresAt" bigint NOT NULL,
                "ConfirmedBy" text NULL, "ConfirmedByUserId" text NULL, "ConfirmedAt" bigint NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppSettlementUpdateDrafts_IdempotencyKey" ON "WhatsAppSettlementUpdateDrafts"("IdempotencyKey");
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppSettlementUpdateDrafts_Binding_State_Expires" ON "WhatsAppSettlementUpdateDrafts"("BindingId", "State", "ExpiresAt");
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_WhatsAppOutbox_WhatsAppStaffBindings_StaffBindingId') THEN
                    ALTER TABLE "WhatsAppOutbox" ADD CONSTRAINT "FK_WhatsAppOutbox_WhatsAppStaffBindings_StaffBindingId"
                        FOREIGN KEY ("StaffBindingId") REFERENCES "WhatsAppStaffBindings"("Id") ON DELETE RESTRICT;
                END IF;
            END $$;
            """, ct);
    }
}
