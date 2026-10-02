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
            """, ct);
    }
}
