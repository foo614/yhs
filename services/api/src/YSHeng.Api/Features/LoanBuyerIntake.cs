using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record LoanBuyerIntakeInput(
    Guid VehicleId,
    bool CashBuyer,
    Guid? CustomerId,
    string? Name,
    string? IcNumber,
    string? Phone,
    string? Address,
    string? Email,
    decimal? FinalSellingPrice,
    string? TradeInPlateNumber,
    Guid? IdentityCardDocumentId = null,
    Guid? NewLoanId = null);

public sealed record LoanBuyerIntakeResult(Customer Customer, LoanApplication? Loan);

public sealed record LoanBuyerIntakeOutcome(
    LoanBuyerIntakeResult? Result,
    ValidationResult Validation,
    int StatusCode = StatusCodes.Status200OK);

/// <summary>
/// Slide 24 buyer registration/manual loan intake. Program maps this extension
/// on the back-office group; keeping the route here makes the multipart contract
/// reviewable without broadening shared Program.cs changes.
/// </summary>
public static class LoanBuyerIntake
{
    public static IEndpointRouteBuilder MapLoanBuyerIntake(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/loans/intake", HandleHttpAsync)
            .DisableAntiforgery()
            .RequireAuthorization("LoanCreate");
        return endpoints;
    }

    public static async Task<IResult> HandleHttpAsync(HttpContext context, AppDbContext db, CancellationToken cancellationToken)
    {
        if (!context.Request.HasFormContentType)
            return Results.BadRequest(new ValidationResult([new ValidationError("loan_intake_form_required", "Provide multipart buyer intake data.")]));
        var form = await context.Request.ReadFormAsync(cancellationToken);
        var inputJson = form["input"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(inputJson))
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("loan_intake_input_required", "Provide the buyer intake input JSON.")]));
        }

        LoanBuyerIntakeInput? input;
        try
        {
            input = JsonSerializer.Deserialize<LoanBuyerIntakeInput>(inputJson, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (JsonException)
        {
            input = null;
        }

        if (input is null)
        {
            return Results.BadRequest(new ValidationResult([new ValidationError("loan_intake_input_invalid", "Buyer intake input is not valid JSON.")]));
        }

        var actorId = StaffIdentity.CurrentUserId(context);
        var outcome = await CreateAsync(db, input, form.Files.GetFile("identityCard"), context.User, actorId, cancellationToken);
        if (outcome.StatusCode == StatusCodes.Status403Forbidden) return Results.Forbid();
        if (!outcome.Validation.IsValid) return Results.Json(outcome.Validation, statusCode: outcome.StatusCode);
        return Results.Ok(outcome.Result);
    }

    public static async Task<LoanBuyerIntakeOutcome> CreateAsync(
        AppDbContext db,
        LoanBuyerIntakeInput input,
        IFormFile? identityCard,
        ClaimsPrincipal user,
        string actorId,
        CancellationToken cancellationToken = default)
    {
        var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == input.VehicleId, cancellationToken);
        if (vehicle is null) return Invalid("vehicle_not_found", "The selected vehicle does not exist.");

        var isAdmin = user.IsInRole("BossAdmin");
        var isOwnedBroker = user.IsInRole("Sales") &&
            !string.IsNullOrWhiteSpace(actorId) &&
            string.Equals(vehicle.SalesAgentUserId, actorId, StringComparison.Ordinal);
        if (!isAdmin && !isOwnedBroker) return Forbidden();

        var validation = ValidateInput(input);
        if (!validation.IsValid) return new(null, validation, StatusCodes.Status400BadRequest);

        await using var transaction = await DeliveryConcurrencyLock.BeginVehiclesAsync(db, [input.VehicleId]);
        vehicle = await db.Vehicles.FirstOrDefaultAsync(item => item.Id == input.VehicleId, cancellationToken);
        if (vehicle is null) return Invalid("vehicle_not_found", "The selected vehicle does not exist.");
        if (!isAdmin && (!user.IsInRole("Sales") || !string.Equals(vehicle.SalesAgentUserId, actorId, StringComparison.Ordinal))) return Forbidden();

        // Serialize customer deduplication across different vehicles as well as retries.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"loan-buyer-intake-customers"}, 0))", cancellationToken);

        if (!input.CashBuyer && input.NewLoanId is { } retryId)
        {
            var retry = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(item => item.Id == retryId, cancellationToken);
            if (retry is not null)
            {
                var retryCustomer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(item => item.Id == retry.CustomerId, cancellationToken);
                var matchesCustomer = retryCustomer is not null && (input.CustomerId is { } selectedId
                    ? retry.CustomerId == selectedId
                    : ContactRules.NormalizeIcNumber(retryCustomer.IcNumber) == ContactRules.NormalizeIcNumber(input.IcNumber)
                        && NormalizePhone(retryCustomer.Phone) == NormalizePhone(input.Phone)
                        && retryCustomer.Name == input.Name!.Trim());
                if (retry.VehicleId != vehicle.Id || !matchesCustomer || retry.FinalSellingPrice != input.FinalSellingPrice
                    || retry.TradeInPlateNumber != NormalizeOptional(input.TradeInPlateNumber))
                    return Invalid("loan_id_conflict", "The supplied loan id belongs to a different intake.", StatusCodes.Status409Conflict);
                return new(new(retryCustomer!, retry), new ValidationResult([]));
            }
        }

        if (vehicle.Status == VehicleStatus.Sold)
            return Invalid("vehicle_sold", "A sold vehicle cannot accept a new buyer intake.", StatusCodes.Status409Conflict);

        var customers = await db.Customers.AsNoTracking().ToListAsync(cancellationToken);
        Customer? customer;
        if (input.CustomerId is { } selectedCustomerId)
        {
            customer = customers.FirstOrDefault(item => item.Id == selectedCustomerId);
            if (customer is null) return Invalid("customer_not_found", "Select an existing customer or provide a new buyer.");
        }
        else
        {
            var normalizedIc = ContactRules.NormalizeIcNumber(input.IcNumber);
            var normalizedPhone = NormalizePhone(input.Phone);
            if (customers.Any(item => normalizedIc.Length > 0 && string.Equals(ContactRules.NormalizeIcNumber(item.IcNumber), normalizedIc, StringComparison.Ordinal)))
                return Invalid("duplicate_customer_ic", "A customer with this IC number already exists. Select that customer instead.", StatusCodes.Status409Conflict);
            if (customers.Any(item => string.Equals(NormalizePhone(item.Phone), normalizedPhone, StringComparison.OrdinalIgnoreCase)))
                return Invalid("duplicate_customer_phone", "A customer with this phone already exists. Select that customer instead.", StatusCodes.Status409Conflict);

            customer = new Customer
            {
                Name = input.Name!.Trim(),
                IcNumber = input.IcNumber!.Trim(),
                Phone = input.Phone!.Trim(),
                Address = NormalizeOptional(input.Address),
                Email = NormalizeOptional(input.Email)
            };
        }

        if (vehicle.CustomerId is { } currentCustomerId && currentCustomerId != customer.Id)
            return Invalid("vehicle_customer_locked", "The vehicle already has a different confirmed buyer.", StatusCodes.Status409Conflict);

        var proposedVehicle = vehicle with { CustomerId = customer.Id };
        var deliveries = await db.DeliverySchedules.AsNoTracking().Where(item => item.VehicleId == vehicle.Id).ToListAsync(cancellationToken);
        var buyerLock = DeliveryMutationRules.ValidateVehicleCustomerChange(vehicle, proposedVehicle, deliveries);
        if (!buyerLock.IsValid) return new(null, buyerLock, StatusCodes.Status409Conflict);
        var payments = await db.PaymentRecords.AsNoTracking().Where(item => item.VehicleId == vehicle.Id).ToListAsync(cancellationToken);
        if (vehicle.CustomerId != customer.Id && payments.Any(item => item.FinanceWorkflowVersion == 2))
            return Invalid("finance_v2_buyer_locked", "The confirmed buyer is locked by Finance receivables.", StatusCodes.Status409Conflict);
        buyerLock = FinanceV2Rules.ValidateReceivableBuyer(customer.Id, payments);
        if (!buyerLock.IsValid) return new(null, buyerLock, StatusCodes.Status409Conflict);
        var cashHandover = await db.CashHandovers.AsNoTracking().FirstOrDefaultAsync(item => item.VehicleId == vehicle.Id, cancellationToken);
        buyerLock = CashCustodyRules.ValidateVehicleUpdate(vehicle, proposedVehicle, cashHandover);
        if (!buyerLock.IsValid) return new(null, buyerLock, StatusCodes.Status409Conflict);

        var existingLoans = await db.LoanApplications.AsNoTracking()
            .Where(item => item.VehicleId == vehicle.Id)
            .ToListAsync(cancellationToken);
        if (input.CashBuyer && existingLoans.Any(WorkflowStatusRules.IsActiveLoan))
            return Invalid("active_loan_exists", "This vehicle already has an active loan and cannot be registered as cash buyer.", StatusCodes.Status409Conflict);

        LoanApplication? loan = null;
        if (!input.CashBuyer)
        {
            if (existingLoans.Any(WorkflowStatusRules.IsActiveLoan))
                return Invalid("active_loan_exists", "An active loan already exists for this vehicle and customer.", StatusCodes.Status409Conflict);

            var loanId = input.NewLoanId ?? Guid.NewGuid();
            loan = new LoanApplication
            {
                Id = loanId,
                VehicleId = vehicle.Id,
                CustomerId = customer.Id,
                Status = LoanStatus.Pending,
                SubmittedAt = BusinessClock.Today(),
                LastUpdatedAt = DateTime.UtcNow,
                FinalSellingPrice = input.FinalSellingPrice,
                TradeInPlateNumber = NormalizeOptional(input.TradeInPlateNumber)
            };
        }

        var identityValidation = await ValidateIdentityAsync(db, customer.Id, input, identityCard, cancellationToken);
        if (!identityValidation.IsValid) return new(null, identityValidation, StatusCodes.Status400BadRequest);

        if (identityCard is not null)
        {
            await using var stream = identityCard.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);
            var bytes = memory.ToArray();
            var content = UploadPolicy.ValidateCollectionEvidenceContent(identityCard.FileName, identityCard.ContentType, bytes);
            if (!content.Result.IsValid) return new(null, content.Result, StatusCodes.Status400BadRequest);
            db.DocumentBlobs.Add(new DocumentBlob
            {
                VehicleId = vehicle.Id,
                CustomerId = customer.Id,
                OwnershipType = DocumentOwnershipType.Buyer,
                Category = FileCategory.IdentityCard,
                FileName = identityCard.FileName,
                MimeType = content.MimeType!,
                Content = bytes,
                Checksum = Convert.ToHexString(SHA256.HashData(bytes)),
                UploadedBy = actorId
            });
        }

        var updatedVehicle = vehicle with { CustomerId = customer.Id };
        if (input.CustomerId is null) db.Customers.Add(customer);
        if (loan is not null) db.LoanApplications.Add(loan);
        if (loan is not null) updatedVehicle = WorkflowStatusRules.ApplyLoanStatus(updatedVehicle, loan);
        db.Entry(vehicle).CurrentValues.SetValues(updatedVehicle);
        ApiAudit.Add(db, user, input.CashBuyer ? "cashBuyer.customerRegistered" : "loan.buyerIntakeCreated",
            loan is null ? nameof(Customer) : nameof(LoanApplication), loan?.Id ?? customer.Id);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(new(customer, loan), new ValidationResult([]));
    }

    public static ValidationResult ValidateInput(LoanBuyerIntakeInput input)
    {
        var errors = new List<ValidationError>();
        if (input.VehicleId == Guid.Empty) errors.Add(new("vehicle_required", "Select a vehicle."));
        if (input.CustomerId is null)
        {
            if (string.IsNullOrWhiteSpace(input.Name)) errors.Add(new("customer_name_required", "Customer name is required."));
            if (string.IsNullOrWhiteSpace(input.IcNumber)) errors.Add(new("customer_ic_required", "Customer IC number is required."));
            if (string.IsNullOrWhiteSpace(input.Phone)) errors.Add(new("customer_phone_required", "Customer phone is required."));
        }
        if (!string.IsNullOrWhiteSpace(input.Email) && (input.Email.Trim().Length > 320 || !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(input.Email.Trim())))
            errors.Add(new("customer_email_invalid", "Enter a valid customer email."));
        if (!input.CashBuyer && (input.FinalSellingPrice is null or <= 0))
            errors.Add(new("loan_selling_price_required", "Final selling price is required for a financed buyer."));
        if (input.FinalSellingPrice is < 0) errors.Add(new("selling_price_invalid", "Final selling price cannot be negative."));
        return new ValidationResult(errors);
    }

    private static async Task<ValidationResult> ValidateIdentityAsync(
        AppDbContext db,
        Guid customerId,
        LoanBuyerIntakeInput input,
        IFormFile? identityCard,
        CancellationToken cancellationToken)
    {
        if (identityCard is not null)
        {
            if (!UploadPolicy.IsAllowed(FileCategory.IdentityCard, identityCard.Length))
                return new([new("identity_card_size_invalid", "Identity card file must be between 1 byte and 10 MB.")]);
            return new ValidationResult([]);
        }

        if (input.IdentityCardDocumentId is not { } documentId)
            return new([new("identity_card_required", "Upload the customer's IC image/PDF or select an existing buyer-owned IC file.")]);

        var existing = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == documentId, cancellationToken);
        if (existing is null || existing.Category != FileCategory.IdentityCard || existing.OwnershipType != DocumentOwnershipType.Buyer || existing.CustomerId != customerId)
            return new([new("identity_card_document_invalid", "The selected IC file is not a buyer-owned document for this customer.")]);
        if (!UploadPolicy.IsAllowed(FileCategory.IdentityCard, existing.Content.LongLength))
            return new([new("identity_card_size_invalid", "Identity card file must be between 1 byte and 10 MB.")]);
        return UploadPolicy.ValidateCollectionEvidenceContent(existing.FileName, existing.MimeType, existing.Content).Result;
    }

    private static LoanBuyerIntakeOutcome Invalid(string code, string message, int statusCode = StatusCodes.Status400BadRequest) =>
        new(null, new ValidationResult([new ValidationError(code, message)]), statusCode);

    private static LoanBuyerIntakeOutcome Forbidden() => new(null, new ValidationResult([]), StatusCodes.Status403Forbidden);

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizePhone(string? value) => new((value ?? "").Where(char.IsLetterOrDigit).ToArray());
}
