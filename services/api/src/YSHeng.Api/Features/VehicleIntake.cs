using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Shared by HTTP intake and the WhatsApp review/confirm flow.
public static class VehicleIntake
{
    public static async Task<IResult> CreateAsync(HttpRequest httpRequest, AppDbContext db,
        HttpContext context, CancellationToken cancellationToken) =>
        await CreateCoreAsync(httpRequest, db, context, cancellationToken);

    public static async Task<IResult> CreateCoreAsync(HttpRequest httpRequest, AppDbContext db,
        HttpContext context, CancellationToken cancellationToken, Action? beforeSave = null)
    {
        if (!httpRequest.HasFormContentType)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_intake_form_required", "Vehicle intake must include the reviewed previous owner NRIC image.")]));
        }

        var form = await httpRequest.ReadFormAsync(cancellationToken);
        var requestPayload = form["request"].ToString();
        var identityCard = form.Files.GetFile("identityCard");
        var voc = form.Files.GetFile("voc");
        var settlementEvidence = form.Files.GetFile("settlementEvidence");
        if (string.IsNullOrWhiteSpace(requestPayload))
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_intake_request_required", "The vehicle intake details are required.")]));
        }

        VehicleIntakeRequest? request;
        try
        {
            var serializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            serializerOptions.Converters.Add(new JsonStringEnumConverter());
            request = JsonSerializer.Deserialize<VehicleIntakeRequest>(requestPayload, serializerOptions);
        }
        catch (JsonException)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_intake_request_invalid", "The vehicle intake details are invalid.")]));
        }
        if (request is null)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_intake_request_invalid", "The vehicle intake details are invalid.")]));
        }

        if (request.NewOwner is not null)
        {
            request = request with
            {
                NewOwner = request.NewOwner with
                {
                    IcNumber = ContactRules.NormalizeIcNumber(request.NewOwner.IcNumber),
                    TinNumber = string.IsNullOrWhiteSpace(request.NewOwner.TinNumber) ? null : request.NewOwner.TinNumber.Trim()
                }
            };
        }

        if (voc is null)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_voc_required", "Upload the vehicle VOC before completing intake.")]));
        }

        var dealerPurchase = request.Vehicle.PurchaseSource is VehiclePurchaseSource.Carsome or VehiclePurchaseSource.Carro or VehiclePurchaseSource.KSA;
        if (request.NewOwner is not null && !dealerPurchase && identityCard is null)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("seller_identity_card_required", "Upload and review the previous owner NRIC before creating a new owner.")]));
        }

        var roles = SeedData.Roles.Where(context.User.IsInRole);
        if ((identityCard is not null && !DepartmentAccess.CanUploadDocument(roles, FileCategory.IdentityCard))
            || (voc is not null && !DepartmentAccess.CanUploadDocument(roles, FileCategory.Voc))) return Results.Forbid();
        if (identityCard is not null && !UploadPolicy.IsAllowed(FileCategory.IdentityCard, identityCard.Length))
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("identity_card_size_invalid", "Identity card photo must be between 1 byte and 10 MB.")]));
        }
        byte[]? identityCardBytes = null;
        string? identityCardMimeType = null;
        if (identityCard is not null)
        {
            await using var identityCardStream = identityCard.OpenReadStream();
            using var identityCardMemory = new MemoryStream();
            await identityCardStream.CopyToAsync(identityCardMemory, cancellationToken);
            identityCardBytes = identityCardMemory.ToArray();
            var identityCardValidation = UploadPolicy.ValidateOcrImageContent(identityCard.FileName, identityCard.ContentType, identityCardBytes);
            if (!identityCardValidation.Result.IsValid) return Results.BadRequest(identityCardValidation.Result);
            identityCardMimeType = identityCardValidation.MimeType;
        }

        byte[]? vocBytes = null;
        string? vocMimeType = null;
        if (voc is not null)
        {
            if (!UploadPolicy.IsAllowed(FileCategory.Voc, voc.Length))
            {
                return Results.BadRequest(new ValidationResult([new ValidationError("voc_size_invalid", "VOC files must be between 1 byte and 10 MB.")]));
            }
            await using var vocStream = voc.OpenReadStream();
            using var vocMemory = new MemoryStream();
            await vocStream.CopyToAsync(vocMemory, cancellationToken);
            vocBytes = vocMemory.ToArray();
            var vocValidation = UploadPolicy.ValidateVehicleIntakeVocContent(voc.FileName, voc.ContentType, vocBytes);
            if (!vocValidation.Result.IsValid) return Results.BadRequest(vocValidation.Result);
            vocMimeType = vocValidation.MimeType;
        }

        if (request.Settlement is not null && !context.User.IsInRole("BossAdmin") && !context.User.IsInRole("Finance"))
        {
            return Results.Json(new ApiError("Preparing a settlement during vehicle intake requires Finance or Admin access."), statusCode: StatusCodes.Status403Forbidden);
        }

        var vehicle = VehicleRules.NormalizeModifiedPurchasePrice(VehicleRules.NormalizeDateTimes(request.Vehicle with
        {
            RepairCost = null,
            HasBankDebt = null,
            IntakeAt = request.Vehicle.IntakeAt ?? DateTime.UtcNow
        }));
        if (!context.User.IsInRole("BossAdmin"))
        {
            vehicle = vehicle with
            {
                DealerProcessingFee = null,
                DealerTrailerFee = null,
                DealerParkingFee = null,
                DealerLateCharge = null,
                DealerDiscount = null
            };
        }
        if (request.NewOwner is null && vehicle.OwnerId == Guid.Empty)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("seller_owner_required", "Select a previous owner before creating the vehicle.")]));
        }
        var workflowStatusValidation = VehicleWorkflowRules.ValidateCreate(vehicle);
        if (!workflowStatusValidation.IsValid) return Results.BadRequest(workflowStatusValidation);
        var approvalValidation = VehicleApprovalRules.ValidateCreate(vehicle, context.User.IsInRole("BossAdmin"));
        if (!approvalValidation.IsValid) return Results.Json(approvalValidation, statusCode: StatusCodes.Status403Forbidden);
        vehicle = VehicleApprovalRules.EnforceVisibility(vehicle);
        var validation = VehicleRules.ValidateIntake(vehicle);
        if (!validation.IsValid) return Results.BadRequest(validation);
        var catalogSelection = VehicleCatalogRules.FindActiveSelection(
            vehicle.Make,
            vehicle.Model,
            await db.VehicleCatalogModels.AsNoTracking().ToListAsync(cancellationToken));
        var catalogSelectionValidation = VehicleCatalogRules.ValidateSelection(catalogSelection);
        if (!catalogSelectionValidation.IsValid) return Results.BadRequest(catalogSelectionValidation);
        vehicle = VehicleCatalogRules.ApplyCanonicalSelection(vehicle, catalogSelection!);

        var customers = await db.Customers.AsNoTracking().ToListAsync();
        var owners = await db.Owners.AsNoTracking().ToListAsync();
        var loans = await db.LoanApplications.AsNoTracking().ToListAsync();
        var existingVehicles = await db.Vehicles.AsNoTracking().ToListAsync();
        var intakeOwnerValidation = VehicleIntakeOwnerRules.Validate(vehicle, request.NewOwner, owners, requireIc: !dealerPurchase);
        if (!intakeOwnerValidation.IsValid) return Results.BadRequest(intakeOwnerValidation);
        var availableOwners = request.NewOwner is null ? owners : [.. owners, request.NewOwner];
        var intakeOwner = request.NewOwner ?? availableOwners.FirstOrDefault(owner => owner.Id == vehicle.OwnerId);
        if (intakeOwner is null || string.IsNullOrWhiteSpace(intakeOwner.TinNumber))
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("owner_tin_required", "Enter the seller TIN number manually before completing vehicle intake.")]));
        }
        var contactLinkValidation = VehicleRules.ValidateContactLinks(vehicle, customers, availableOwners, loans, requireOwner: true);
        if (!contactLinkValidation.IsValid) return Results.BadRequest(contactLinkValidation);
        var uniquePlateValidation = VehicleRules.ValidateUniquePlate(vehicle, existingVehicles);
        if (!uniquePlateValidation.IsValid) return Results.BadRequest(uniquePlateValidation);

        SettlementReminder? settlement = null;
        byte[]? settlementEvidenceBytes = null;
        string? settlementEvidenceMime = null;
        if (request.Settlement is { } settlementRequest)
        {
            if (!context.User.IsInRole("BossAdmin")) return Results.Forbid();
            vehicle = vehicle with { HasBankDebt = settlementRequest.HasDebt };
            if (settlementRequest.HasDebt)
            {
                settlement = BankSettlementRules.Create(vehicle, settlementRequest.BankDebtAmount, settlementRequest.Deadline ?? default,
                    settlementRequest.BankName ?? "", settlementRequest.BankAccountNumber ?? "");
                var financeValidation = BankSettlementRules.Validate(settlement);
                if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
            }
            else
            {
                if (settlementEvidence is null || !UploadPolicy.IsAllowed(FileCategory.SettlementEvidence, settlementEvidence.Length))
                    return Results.BadRequest(new ApiError("No debt requires a supporting document up to 10 MB."));
                await using var evidenceStream = settlementEvidence.OpenReadStream();
                using var evidenceMemory = new MemoryStream();
                await evidenceStream.CopyToAsync(evidenceMemory, cancellationToken);
                settlementEvidenceBytes = evidenceMemory.ToArray();
                var evidenceValidation = UploadPolicy.ValidateVehicleIntakeVocContent(settlementEvidence.FileName, settlementEvidence.ContentType, settlementEvidenceBytes);
                if (!evidenceValidation.Result.IsValid) return Results.BadRequest(evidenceValidation.Result);
                settlementEvidenceMime = evidenceValidation.MimeType;
            }
        }

        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        if (request.NewOwner is not null)
        {
            db.Owners.Add(request.NewOwner);
            ApiAudit.Add(db, context.User, "owner.createdFromVehicleIntake", nameof(Owner), request.NewOwner.Id);
        }
        db.Vehicles.Add(vehicle);
        StockMovementAudit.AddInitial(db, vehicle, context.User, "Vehicle intake created");
        ApiAudit.Add(db, context.User, "vehicle.created", nameof(Vehicle), vehicle.Id);
        if (vehicle.BossConfirmed)
        {
            ApiAudit.Add(db, context.User, "vehicle.approved", nameof(Vehicle), vehicle.Id);
        }

        if (settlement is not null)
        {
            db.SettlementReminders.Add(settlement);
            ApiAudit.Add(db, context.User, "settlementReminder.createdFromVehicleIntake", nameof(SettlementReminder), settlement.Id);
        }

        if (settlementEvidenceBytes is not null)
        {
            var evidence = new DocumentBlob { VehicleId = vehicle.Id, Category = FileCategory.SettlementEvidence,
                FileName = settlementEvidence!.FileName, MimeType = settlementEvidenceMime!, Content = settlementEvidenceBytes,
                Checksum = Convert.ToHexString(SHA256.HashData(settlementEvidenceBytes)), UploadedBy = UploadMetadata.UploaderFrom(context.User) };
            db.DocumentBlobs.Add(evidence);
            ApiAudit.Add(db, context.User, "vehicle.noDebtEvidenceUploaded", nameof(DocumentBlob), evidence.Id);
        }
        if (identityCard is not null && identityCardBytes is not null && identityCardMimeType is not null)
        {
          var identityCardDocument = new DocumentBlob
          {
            VehicleId = vehicle.Id,
            OwnerId = vehicle.OwnerId,
            OwnershipType = DocumentOwnershipType.Seller,
            Category = FileCategory.IdentityCard,
            FileName = identityCard.FileName,
            MimeType = identityCardMimeType,
            Content = identityCardBytes,
            Checksum = Convert.ToHexString(SHA256.HashData(identityCardBytes)),
            UploadedBy = UploadMetadata.UploaderFrom(context.User)
          };

          db.DocumentBlobs.Add(identityCardDocument);
          ApiAudit.Add(db, context.User, "vehicle.document.uploadedFromVehicleIntake", nameof(DocumentBlob), identityCardDocument.Id);
        }
        if (voc is not null && vocBytes is not null && vocMimeType is not null)
        {
            var vocDocument = new DocumentBlob
            {
                VehicleId = vehicle.Id,
                OwnerId = vehicle.OwnerId,
                OwnershipType = DocumentOwnershipType.Seller,
                Category = FileCategory.Voc,
                FileName = voc.FileName,
                MimeType = vocMimeType,
                Content = vocBytes,
                Checksum = Convert.ToHexString(SHA256.HashData(vocBytes)),
                UploadedBy = UploadMetadata.UploaderFrom(context.User)
            };
            db.DocumentBlobs.Add(vocDocument);
            ApiAudit.Add(db, context.User, "vehicle.document.uploadedFromVehicleIntake", nameof(DocumentBlob), vocDocument.Id);
        }
        await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.Intake, vehicle.Id, 1, vehicle,
            AuditTrail.ActorFrom(context.User), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), cancellationToken);
        beforeSave?.Invoke();
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (FinanceApi.IsUniqueViolation(exception, "UX_Owners_NormalizedIcNumber"))
        {
            if (transaction is not null) await transaction.RollbackAsync(cancellationToken);
            return Results.Conflict(new ValidationResult([new ValidationError("duplicate_owner_ic", "An owner with this IC number already exists. Select the existing owner and try again.")]));
        }
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Results.Created($"/api/vehicles/{vehicle.Id}", new VehicleIntakeResponse(
            BackOfficeVehicleResponses.ToResponse(vehicle, context.User.IsInRole("BossAdmin")),
            settlement,
            request.NewOwner));
    }
}
