using System.Security.Cryptography;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
var workerEnabled = builder.Configuration.GetValue("Worker:Enabled", false);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.Configure<GoogleDocumentAiOptions>(builder.Configuration.GetSection("Ocr:GoogleDocumentAi"));
builder.Services.AddSingleton<IGoogleAccessTokenProvider, GoogleApplicationDefaultAccessTokenProvider>();
builder.Services.AddHttpClient<GoogleDocumentAiClient>();
builder.Services.AddScoped<GoogleDocumentAiExtractor>();
builder.Services.Configure<BaiduUnlimitedOcrOptions>(builder.Configuration.GetSection("Ocr:BaiduUnlimited"));
builder.Services.AddHttpClient<BaiduUnlimitedOcrClient>();
builder.Services.AddScoped<BaiduUnlimitedOcrExtractor>();
builder.Services.AddScoped<LocalMockOcrExtractor>();
builder.Services.AddScoped<AiUsageQuotaService>();
builder.Services.AddScoped<IOcrExtractor>(services =>
{
    var provider = services.GetRequiredService<IConfiguration>().GetValue("Ocr:Provider", "GoogleDocumentAi");
    return provider?.ToUpperInvariant() switch
    {
        "GOOGLEDOCUMENTAI" => services.GetRequiredService<GoogleDocumentAiExtractor>(),
        "BAIDUUNLIMITED" => services.GetRequiredService<BaiduUnlimitedOcrExtractor>(),
        "LOCALMOCK" => services.GetRequiredService<LocalMockOcrExtractor>(),
        _ => throw new InvalidOperationException($"Unsupported OCR provider '{provider}'.")
    };
});
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = UploadPolicy.MultipartBodyLimit;
});
builder.Services.AddIdentityApiEndpoints<AppUser>()
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("BackOffice", policy => policy.RequireRole(SeedData.Roles));
    options.AddPolicy("Dashboard", policy => policy.RequireRole("BossAdmin"));
    options.AddPolicy("VehicleRead", policy => policy.RequireRole(DepartmentAccess.VehicleReaders));
    options.AddPolicy("Vehicles", policy => policy.RequireRole(DepartmentAccess.VehicleWriters));
    options.AddPolicy("Repairs", policy => policy.RequireRole("BossAdmin", "Repair"));
    options.AddPolicy("Loans", policy => policy.RequireRole("BossAdmin", "Loan"));
    options.AddPolicy("Deliveries", policy => policy.RequireRole("BossAdmin", "Delivery"));
    options.AddPolicy("Finance", policy => policy.RequireRole("BossAdmin", "Finance"));
    options.AddPolicy("HrSalary", policy => policy.RequireRole(DepartmentAccess.HrManagers));
    options.AddPolicy("Sales", policy => policy.RequireRole("BossAdmin", "Sales"));
    options.AddPolicy("CashCustody", policy => policy.RequireRole("BossAdmin", "Sales", "Finance"));
    options.AddPolicy("CustomerRead", policy => policy.RequireRole(DepartmentAccess.CustomerReaders));
    options.AddPolicy("CustomerProfile", policy => policy.RequireRole(DepartmentAccess.CustomerProfileReaders));
    options.AddPolicy("OwnerRead", policy => policy.RequireRole(DepartmentAccess.OwnerReaders));
    options.AddPolicy("BossAdmin", policy => policy.RequireRole("BossAdmin"));
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    });
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
if (workerEnabled)
{
    builder.Services.AddHostedService<ReminderWorker>();
}

var app = builder.Build();

app.Use(async (context, next) =>
{
    SecurityHeaders.Apply(context.Response.Headers);
    await next();
});
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => HealthStatus.Create(DateTimeOffset.UtcNow));
app.MapGet("/health/ready", async (AppDbContext db) =>
{
    var databaseConnected = await db.Database.CanConnectAsync();
    var payload = HealthStatus.CreateReadiness(databaseConnected, DateTimeOffset.UtcNow);
    return databaseConnected ? Results.Ok(payload) : Results.Json(payload, statusCode: StatusCodes.Status503ServiceUnavailable);
});

app.MapGroup("/api/auth").MapIdentityApi<AppUser>();
app.MapPost("/api/auth/logout", async (SignInManager<AppUser> signInManager) =>
{
    await signInManager.SignOutAsync();
    return Results.Ok(new { message = "Logged out." });
}).RequireAuthorization();
app.MapGet("/api/auth/me", async (HttpContext context, UserManager<AppUser> userManager) =>
{
    var userId = StaffIdentity.CurrentUserId(context);
    var appUser = string.IsNullOrWhiteSpace(userId) ? null : await userManager.FindByIdAsync(userId);
    return Results.Ok(new
    {
        isAuthenticated = context.User.Identity?.IsAuthenticated ?? false,
        id = userId,
        name = string.IsNullOrWhiteSpace(appUser?.DisplayName) ? context.User.Identity?.Name : appUser.DisplayName,
        roles = context.User.Claims.Where(claim => claim.Type.EndsWith("/role") || claim.Type == "role").Select(claim => claim.Value)
    });
}).RequireAuthorization();

app.MapGet("/api/public/vehicles", async (AppDbContext db) =>
{
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    return Results.Ok(PublicInventory.Filter(vehicles).Select(PublicInventory.ToResponse));
});

app.MapGet("/api/public/vehicle-catalog/models", async (AppDbContext db) =>
{
    var catalogModels = await db.VehicleCatalogModels.AsNoTracking()
        .Where(item => item.IsActive)
        .OrderBy(item => item.Make)
        .ThenBy(item => item.Model)
        .ToListAsync();
    return Results.Ok(catalogModels.Select(VehicleCatalogRules.ToPublicResponse));
});

app.MapGet("/api/public/vehicles/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id && item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
    return vehicle is null ? Results.NotFound() : Results.Ok(PublicInventory.ToDetailResponse(vehicle));
});

app.MapGet("/api/public/vehicles/{id:guid}/photo", async (Guid id, AppDbContext db) =>
{
    var isPublicVehicle = await db.Vehicles.AsNoTracking().AnyAsync(item => item.Id == id && item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
    if (!isPublicVehicle) return Results.NotFound();

    var photo = PublicVehiclePhotos.SelectPrimary(id, await db.VehiclePhotos.AsNoTracking().ToListAsync());
    return photo is null ? Results.NotFound() : Results.File(photo.Bytes, photo.MimeType);
});

app.MapGet("/api/public/vehicles/{id:guid}/photos", async (Guid id, AppDbContext db) =>
{
    var isPublicVehicle = await db.Vehicles.AsNoTracking().AnyAsync(item => item.Id == id && item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
    if (!isPublicVehicle) return Results.NotFound();

    var photos = PublicVehiclePhotos.SelectGallery(id, await db.VehiclePhotos.AsNoTracking().ToListAsync());
    return Results.Ok(photos);
});

app.MapGet("/api/public/vehicles/{id:guid}/photos/{photoId:guid}", async (Guid id, Guid photoId, AppDbContext db) =>
{
    var isPublicVehicle = await db.Vehicles.AsNoTracking().AnyAsync(item => item.Id == id && item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
    if (!isPublicVehicle) return Results.NotFound();

    var photo = await db.VehiclePhotos.AsNoTracking().FirstOrDefaultAsync(item => item.Id == photoId && item.VehicleId == id);
    return photo is null ? Results.NotFound() : Results.File(photo.Content, photo.MimeType);
});

app.MapPost("/api/public/leads", async (LeadRequest request, AppDbContext db) =>
{
    var validation = WorkflowReferenceRules.ValidatePublicLead(request, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);

    var lead = LeadCapture.Create(request);
    db.Leads.Add(lead);
    ApiAudit.Add(db, "public", "lead.created", nameof(Lead), lead.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/leads/{lead.Id}", lead);
});

app.MapPost("/api/public/contact-enquiries", async (ContactEnquiryRequest request, AppDbContext db) =>
{
    var validation = WorkflowReferenceRules.ValidatePublicContactEnquiry(request);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var lead = LeadCapture.CreateContactEnquiry(request);
    db.Leads.Add(lead);
    ApiAudit.Add(db, "public", "contactEnquiry.created", nameof(Lead), lead.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/public/contact-enquiries/{lead.Id}", new { id = lead.Id });
});

var backOffice = app.MapGroup("/api").RequireAuthorization("BackOffice");

backOffice.MapGet("/vehicles", async (AppDbContext db) => await db.Vehicles.AsNoTracking().OrderBy(vehicle => vehicle.PlateNumber).ToListAsync()).RequireAuthorization("Vehicles");
backOffice.MapGet("/vehicle-catalog/models", async (AppDbContext db) =>
    await db.VehicleCatalogModels.AsNoTracking()
        .OrderBy(item => item.Make)
        .ThenBy(item => item.Model)
        .ToListAsync()).RequireAuthorization("Vehicles");
backOffice.MapPost("/vehicle-catalog/models", async (VehicleCatalogModelRequest request, AppDbContext db, HttpContext context) =>
{
    var item = VehicleCatalogRules.Create(request);
    var validation = VehicleCatalogRules.Validate(item);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (VehicleCatalogRules.IsDuplicate(item, await db.VehicleCatalogModels.AsNoTracking().ToListAsync()))
    {
        return Results.BadRequest(new ValidationResult([new("catalog_model_duplicate", "This make and model already exists in the catalogue.")]));
    }

    db.VehicleCatalogModels.Add(item);
    ApiAudit.Add(db, context.User, "vehicleCatalogModel.created", nameof(VehicleCatalogModel), item.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/vehicle-catalog/models/{item.Id}", item);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/vehicle-catalog/models/{id:guid}", async (Guid id, VehicleCatalogModelRequest request, AppDbContext db, HttpContext context) =>
{
    var existing = await db.VehicleCatalogModels.FirstOrDefaultAsync(item => item.Id == id);
    if (existing is null) return Results.NotFound();

    var item = VehicleCatalogRules.Update(existing, request);
    var validation = VehicleCatalogRules.Validate(item);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (VehicleCatalogRules.IsDuplicate(item, await db.VehicleCatalogModels.AsNoTracking().ToListAsync()))
    {
        return Results.BadRequest(new ValidationResult([new("catalog_model_duplicate", "This make and model already exists in the catalogue.")]));
    }

    db.VehicleCatalogModels.Update(item);
    ApiAudit.Add(db, context.User, "vehicleCatalogModel.updated", nameof(VehicleCatalogModel), item.Id);
    await db.SaveChangesAsync();
    return Results.Ok(item);
}).RequireAuthorization("Vehicles");
backOffice.MapGet("/vehicle-lookup", async (AppDbContext db) =>
    (await db.Vehicles.AsNoTracking().OrderBy(vehicle => vehicle.PlateNumber).ToListAsync())
        .Select(BackOfficeVehicleLookup.ToResponse)).RequireAuthorization("VehicleRead");
backOffice.MapPost("/vehicles", async (Vehicle vehicle, AppDbContext db, HttpContext context) =>
{
    vehicle = VehicleRules.NormalizeDateTimes(vehicle);
    var workflowStatusValidation = VehicleWorkflowRules.ValidateCreate(vehicle);
    if (!workflowStatusValidation.IsValid) return Results.BadRequest(workflowStatusValidation);
    var approvalValidation = VehicleApprovalRules.ValidateCreate(vehicle, context.User.IsInRole("BossAdmin"));
    if (!approvalValidation.IsValid) return Results.Json(approvalValidation, statusCode: StatusCodes.Status403Forbidden);
    vehicle = VehicleApprovalRules.EnforceVisibility(vehicle);
    var validation = VehicleRules.ValidateIntake(vehicle);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var contactLinkValidation = VehicleRules.ValidateContactLinks(
        vehicle,
        await db.Customers.AsNoTracking().ToListAsync(),
        await db.Owners.AsNoTracking().ToListAsync(),
        await db.LoanApplications.AsNoTracking().ToListAsync());
    if (!contactLinkValidation.IsValid) return Results.BadRequest(contactLinkValidation);
    var uniquePlateValidation = VehicleRules.ValidateUniquePlate(vehicle, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!uniquePlateValidation.IsValid) return Results.BadRequest(uniquePlateValidation);
    db.Vehicles.Add(vehicle);
    StockMovementAudit.AddInitial(db, vehicle, context.User, "Vehicle intake created");
    ApiAudit.Add(db, context.User, "vehicle.created", nameof(Vehicle), vehicle.Id);
    if (vehicle.BossConfirmed)
    {
        ApiAudit.Add(db, context.User, "vehicle.approved", nameof(Vehicle), vehicle.Id);
    }
    await db.SaveChangesAsync();
    return Results.Created($"/api/vehicles/{vehicle.Id}", vehicle);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/vehicles/{id:guid}", async (Guid id, Vehicle update, AppDbContext db, HttpContext context) =>
{
    update = VehicleRules.NormalizeDateTimes(update);
    if (id != update.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("vehicle"));
    var existingVehicle = await db.Vehicles.FirstOrDefaultAsync(item => item.Id == id);
    if (existingVehicle is null) return Results.NotFound();
    var existingSnapshot = existingVehicle with { };
    var workflowStatusValidation = VehicleWorkflowRules.ValidateUpdate(existingSnapshot, update);
    if (!workflowStatusValidation.IsValid) return Results.BadRequest(workflowStatusValidation);
    var canApprove = context.User.IsInRole("BossAdmin");
    var approvalValidation = VehicleApprovalRules.ValidateUpdate(existingSnapshot, update, canApprove);
    if (!approvalValidation.IsValid) return Results.Json(approvalValidation, statusCode: StatusCodes.Status403Forbidden);
    update = VehicleApprovalRules.EnforceVisibility(update);
    var validation = VehicleRules.ValidateIntake(update);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var contactLinkValidation = VehicleRules.ValidateContactLinks(
        update,
        await db.Customers.AsNoTracking().ToListAsync(),
        await db.Owners.AsNoTracking().ToListAsync(),
        await db.LoanApplications.AsNoTracking().ToListAsync());
    if (!contactLinkValidation.IsValid) return Results.BadRequest(contactLinkValidation);
    var uniquePlateValidation = VehicleRules.ValidateUniquePlate(update, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!uniquePlateValidation.IsValid) return Results.BadRequest(uniquePlateValidation);
    db.Entry(existingVehicle).CurrentValues.SetValues(update);
    if (!canApprove)
    {
        db.Entry(existingVehicle).Property(vehicle => vehicle.BossConfirmed).IsModified = false;
    }
    StockMovementAudit.AddChanges(db, existingSnapshot, update, context.User, "Vehicle record updated");
    ApiAudit.Add(db, context.User, "vehicle.updated", nameof(Vehicle), update.Id);
    if (existingSnapshot.BossConfirmed != update.BossConfirmed)
    {
        ApiAudit.Add(db, context.User, update.BossConfirmed ? "vehicle.approved" : "vehicle.approvalRevoked", nameof(Vehicle), update.Id);
    }
    await db.SaveChangesAsync();
    await db.Vehicles
        .Where(vehicle => vehicle.Id == id && !vehicle.BossConfirmed && vehicle.IsPublic)
        .ExecuteUpdateAsync(setters => setters.SetProperty(vehicle => vehicle.IsPublic, false));
    await db.Entry(existingVehicle).ReloadAsync();
    return Results.Ok(existingVehicle);
}).RequireAuthorization("Vehicles");

backOffice.MapGet("/vehicles/{id:guid}/stock-movements", async (Guid id, AppDbContext db) =>
{
    var exists = await db.Vehicles.AsNoTracking().AnyAsync(item => item.Id == id);
    if (!exists) return Results.NotFound();

    return Results.Ok(await db.StockMovements.AsNoTracking()
        .Where(movement => movement.VehicleId == id)
        .OrderByDescending(movement => movement.CreatedAt)
        .ToListAsync());
}).RequireAuthorization("VehicleRead");

backOffice.MapPost("/vehicles/{id:guid}/photos", async (Guid id, [FromForm] IFormFile file, [FromForm] bool isRepresentativeImage, [FromForm] string? sourceName, [FromForm] string? sourceUrl, [FromForm] string? creatorAttribution, [FromForm] string? licenseName, [FromForm] string? licenseUrl, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateVehicleLink(id, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (!UploadPolicy.IsAllowed(FileCategory.VehiclePhoto, file.Length)) return Results.BadRequest(new { message = "Vehicle photo exceeds 5MB limit." });
    await using var stream = file.OpenReadStream();
    using var memory = new MemoryStream();
    await stream.CopyToAsync(memory);
    var bytes = memory.ToArray();
    var thumbnail = PhotoUploadRules.CreateThumbnail(bytes);
    if (!thumbnail.IsValid) return Results.BadRequest(new ValidationResult([thumbnail.Error!]));

    var photo = new VehiclePhoto
    {
        VehicleId = id,
        FileName = file.FileName,
        MimeType = file.ContentType,
        Content = bytes,
        Thumbnail = thumbnail.Thumbnail!,
        Checksum = Convert.ToHexString(SHA256.HashData(bytes)),
        UploadedBy = UploadMetadata.UploaderFrom(context.User),
        IsRepresentativeImage = isRepresentativeImage,
        SourceName = sourceName?.Trim(),
        SourceUrl = sourceUrl?.Trim(),
        CreatorAttribution = creatorAttribution?.Trim(),
        LicenseName = licenseName?.Trim(),
        LicenseUrl = licenseUrl?.Trim()
    };
    db.VehiclePhotos.Add(photo);
    ApiAudit.Add(db, context.User, "vehicle.photo.uploaded", nameof(VehiclePhoto), photo.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/vehicles/{id}/photos/{photo.Id}", new { photo.Id, photo.FileName, photo.MimeType, photo.Checksum, photo.UploadedBy });
}).RequireAuthorization("Vehicles").DisableAntiforgery();

backOffice.MapGet("/vehicles/{id:guid}/photos", async (Guid id, AppDbContext db) =>
    await db.VehiclePhotos.AsNoTracking()
        .Where(photo => photo.VehicleId == id)
        .OrderByDescending(photo => photo.UploadedAt)
        .Select(photo => new { photo.Id, photo.FileName, photo.MimeType, photo.Checksum, photo.UploadedBy, photo.UploadedAt })
        .ToListAsync());

backOffice.MapGet("/vehicles/{id:guid}/photos/{photoId:guid}/content", async (Guid id, Guid photoId, AppDbContext db) =>
{
    var photo = await db.VehiclePhotos.AsNoTracking().FirstOrDefaultAsync(item => item.Id == photoId && item.VehicleId == id);
    return photo is null ? Results.NotFound() : Results.File(photo.Content, photo.MimeType);
});

backOffice.MapPost("/vehicles/{id:guid}/documents", async (Guid id, IFormFile file, FileCategory category, Guid? repairJobId, Guid? paymentRecordId, AppDbContext db, HttpContext context) =>
{
    var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (vehicle is null)
    {
        return Results.BadRequest(new ValidationResult([new ValidationError("vehicle_not_found", "Record must be linked to an existing car plate.")]));
    }
    var categoryValidation = UploadPolicy.ValidateDocumentCategory(category);
    if (!categoryValidation.IsValid) return Results.BadRequest(categoryValidation);
    var ownershipValidation = DocumentOwnershipRules.Validate(category, repairJobId, paymentRecordId);
    if (!ownershipValidation.IsValid) return Results.BadRequest(ownershipValidation);
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, category)) return Results.Forbid();
    if (!UploadPolicy.IsAllowed(category, file.Length)) return Results.BadRequest(new { message = "Document exceeds 10MB limit." });

    if (repairJobId.HasValue)
    {
        var repair = await db.RepairJobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == repairJobId.Value);
        if (repair is null) return Results.BadRequest(new { message = "Selected repair job does not exist." });
        if (repair.VehicleId != id) return Results.BadRequest(new { message = "Selected repair job is not linked to this vehicle." });
    }

    if (paymentRecordId.HasValue)
    {
        var payment = await db.PaymentRecords.AsNoTracking().FirstOrDefaultAsync(item => item.Id == paymentRecordId.Value);
        if (payment is null) return Results.BadRequest(new { message = "Selected payment record does not exist." });
        if (payment.VehicleId != id) return Results.BadRequest(new { message = "Selected payment record is not linked to this vehicle." });
    }

    await using var stream = file.OpenReadStream();
    using var memory = new MemoryStream();
    await stream.CopyToAsync(memory);
    var bytes = memory.ToArray();
    var document = new DocumentBlob
    {
        VehicleId = id,
        CustomerId = vehicle.CustomerId,
        RepairJobId = repairJobId,
        PaymentRecordId = paymentRecordId,
        Category = category,
        FileName = file.FileName,
        MimeType = file.ContentType,
        Content = bytes,
        Checksum = Convert.ToHexString(SHA256.HashData(bytes)),
        UploadedBy = UploadMetadata.UploaderFrom(context.User)
    };
    db.DocumentBlobs.Add(document);
    ApiAudit.Add(db, context.User, "vehicle.document.uploaded", nameof(DocumentBlob), document.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/documents/{document.Id}", new { document.Id, document.FileName, document.MimeType, document.Category, document.RepairJobId, document.PaymentRecordId, document.Checksum, document.UploadedBy, document.UploadedAt });
}).DisableAntiforgery();

backOffice.MapGet("/vehicles/{id:guid}/documents", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    var documents = await db.DocumentBlobs.AsNoTracking()
        .Where(document => document.VehicleId == id)
        .OrderByDescending(document => document.UploadedAt)
        .ToListAsync();
    return Results.Ok(documents
        .Where(document => DepartmentAccess.CanUploadDocument(roles, document.Category))
        .Select(document => new { document.Id, document.FileName, document.MimeType, document.Category, document.RepairJobId, document.PaymentRecordId, document.Checksum, document.UploadedBy, document.UploadedAt }));
});

backOffice.MapGet("/vehicles/{id:guid}/documents/{documentId:guid}/content", async (Guid id, Guid documentId, AppDbContext db, HttpContext context) =>
{
    var document = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == documentId && item.VehicleId == id);
    if (document is null) return Results.NotFound();
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, document.Category)) return Results.Forbid();
    return Results.File(document.Content, document.MimeType, document.FileName);
});

backOffice.MapPost("/documents/{documentId:guid}/ocr-jobs", async (Guid documentId, AppDbContext db, HttpContext context, IOcrExtractor extractor, AiUsageQuotaService aiUsageQuota, CancellationToken cancellationToken) =>
{
    var document = await db.DocumentBlobs.FirstOrDefaultAsync(item => item.Id == documentId);
    if (document is null) return Results.NotFound();
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, document.Category)) return Results.Forbid();

    var reservation = await aiUsageQuota.ReserveOcrAsync(document.Id, StaffIdentity.CurrentUserId(context), cancellationToken);
    if (!reservation.IsAllowed)
    {
        return Results.Json(new { message = reservation.Message }, statusCode: StatusCodes.Status429TooManyRequests);
    }

    OcrExtractionResult? extraction = null;
    OcrJobStatus status;
    string[] warnings;
    var analysisSucceeded = false;
    try
    {
        extraction = await extractor.AnalyzeAsync(document, await db.Vehicles.AsNoTracking().ToListAsync(), cancellationToken);
        status = OcrJobStatus.NeedsReview;
        warnings = extraction.Warnings.ToArray();
        analysisSucceeded = true;
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
        await aiUsageQuota.MarkCompletedAsync(reservation.UsageRecordId!.Value, false, CancellationToken.None);
        throw;
    }
    catch (Exception ex)
    {
        status = OcrJobStatus.Failed;
        warnings = [$"OCR analysis failed: {ex.Message}"];
    }

    await aiUsageQuota.MarkCompletedAsync(reservation.UsageRecordId!.Value, analysisSucceeded, cancellationToken);

    var job = new OcrJob
    {
        DocumentId = document.Id,
        Category = document.Category,
        Status = status,
        Progress = 100,
        ResultJson = extraction is null ? "" : JsonSerializer.Serialize(extraction),
        Warnings = warnings,
        CompletedAt = DateTime.UtcNow
    };
    db.OcrJobs.Add(job);
    ApiAudit.Add(db, context.User, status == OcrJobStatus.Failed ? "document.ocr.failed" : "document.ocr.analyzed", nameof(OcrJob), job.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/ocr-jobs/{job.Id}", OcrJobResponses.ToResponse(job));
});

backOffice.MapGet("/ocr-jobs/{jobId:guid}", async (Guid jobId, AppDbContext db, HttpContext context) =>
{
    var job = await db.OcrJobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == jobId);
    if (job is null) return Results.NotFound();
    var document = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == job.DocumentId);
    if (document is null) return Results.NotFound();
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, document.Category)) return Results.Forbid();

    return Results.Ok(OcrJobResponses.ToResponse(job));
});

backOffice.MapPut("/ocr-jobs/{jobId:guid}/review", async (Guid jobId, OcrReviewRequest request, AppDbContext db, HttpContext context) =>
{
    var job = await db.OcrJobs.FirstOrDefaultAsync(item => item.Id == jobId);
    if (job is null) return Results.NotFound();
    var document = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == job.DocumentId);
    if (document is null) return Results.NotFound();
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, document.Category)) return Results.Forbid();
    if (request.Decision == OcrReviewDecision.Pending) return Results.BadRequest(new { message = "OCR review must be accepted or rejected." });

    var reviewed = job with
    {
        ReviewDecision = request.Decision,
        ReviewNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        ReviewedBy = AuditTrail.ActorFrom(context.User),
        ReviewedAt = DateTime.UtcNow
    };
    db.Entry(job).CurrentValues.SetValues(reviewed);
    ApiAudit.Add(db, context.User, request.Decision == OcrReviewDecision.Accepted ? "document.ocr.accepted" : "document.ocr.rejected", nameof(OcrJob), job.Id);
    await db.SaveChangesAsync();
    return Results.Ok(OcrJobResponses.ToResponse(reviewed));
});

backOffice.MapGet("/vehicles/{id:guid}/ocr-jobs", async (Guid id, AppDbContext db, HttpContext context) =>
{
    if (!await db.Vehicles.AsNoTracking().AnyAsync(vehicle => vehicle.Id == id)) return Results.NotFound();

    var roles = SeedData.Roles.Where(context.User.IsInRole);
    var documents = await db.DocumentBlobs.AsNoTracking()
        .Where(document => document.VehicleId == id)
        .ToListAsync();
    var visibleDocuments = documents
        .Where(document => DepartmentAccess.CanUploadDocument(roles, document.Category))
        .ToDictionary(document => document.Id);
    var documentIds = visibleDocuments.Keys.ToList();
    var jobs = await db.OcrJobs.AsNoTracking()
        .Where(job => documentIds.Contains(job.DocumentId))
        .OrderByDescending(job => job.CreatedAt)
        .ToListAsync();

    return Results.Ok(jobs.Select(job => OcrJobResponses.ToVehicleResponse(job, visibleDocuments[job.DocumentId])));
});

backOffice.MapGet("/customers", async (AppDbContext db) => await db.Customers.AsNoTracking().OrderBy(customer => customer.Name).ToListAsync()).RequireAuthorization("CustomerRead");
backOffice.MapGet("/customers/profile-options", async (AppDbContext db, HttpContext context) =>
{
    var roles = SeedData.Roles.Where(context.User.IsInRole).ToArray();
    var query = db.Customers.AsNoTracking();
    if (!roles.Intersect(DepartmentAccess.CustomerReaders).Any())
    {
        query = query.Where(customer =>
            db.Vehicles.Any(vehicle =>
                vehicle.CustomerId == customer.Id &&
                db.DeliverySchedules.Any(delivery => delivery.VehicleId == vehicle.Id)) ||
            db.LoanApplications.Any(loan =>
                loan.CustomerId == customer.Id &&
                db.Vehicles.Any(vehicle =>
                    vehicle.Id == loan.VehicleId &&
                    vehicle.CustomerId == null &&
                    db.DeliverySchedules.Any(delivery => delivery.VehicleId == vehicle.Id) &&
                    !db.LoanApplications.Any(otherLoan => otherLoan.VehicleId == vehicle.Id && otherLoan.CustomerId != customer.Id))));
    }

    return CustomerProfileFactory.CreateOptions(await query.ToListAsync());
}).RequireAuthorization("CustomerProfile");
backOffice.MapGet("/customers/{id:guid}/profile", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (customer is null) return Results.NotFound();

    var roles = SeedData.Roles.Where(context.User.IsInRole).ToArray();
    var customerLoans = await db.LoanApplications.AsNoTracking().Where(loan => loan.CustomerId == id).ToListAsync();
    var customerLoanVehicleIds = customerLoans.Select(loan => loan.VehicleId).ToList();
    var loans = customerLoanVehicleIds.Count == 0
        ? customerLoans
        : await db.LoanApplications.AsNoTracking().Where(loan => customerLoanVehicleIds.Contains(loan.VehicleId)).ToListAsync();
    var unambiguousLegacyVehicleIds = loans
        .Where(loan => customerLoanVehicleIds.Contains(loan.VehicleId))
        .GroupBy(loan => loan.VehicleId)
        .Where(group => group.All(loan => loan.CustomerId == id))
        .Select(group => group.Key)
        .ToList();
    var vehicles = await db.Vehicles.AsNoTracking()
        .Where(vehicle => vehicle.CustomerId == id || (vehicle.CustomerId == null && unambiguousLegacyVehicleIds.Contains(vehicle.Id)))
        .ToListAsync();
    var vehicleIds = vehicles.Select(vehicle => vehicle.Id).ToList();
    var deliveries = await db.DeliverySchedules.AsNoTracking().Where(delivery => vehicleIds.Contains(delivery.VehicleId)).ToListAsync();
    if (!roles.Intersect(DepartmentAccess.CustomerReaders).Any() && deliveries.Count == 0) return Results.NotFound();
    var payments = await db.PaymentRecords.AsNoTracking().Where(payment => vehicleIds.Contains(payment.VehicleId)).ToListAsync();
    var paymentIds = payments.Select(payment => payment.Id).ToList();
    var invoices = await db.FinanceInvoices.AsNoTracking()
        .Where(invoice => invoice.CustomerId == id || paymentIds.Contains(invoice.PaymentRecordId))
        .ToListAsync();
    var handovers = await db.CashHandovers.AsNoTracking().Where(handover => handover.CustomerId == id).ToListAsync();
    var handoverIds = handovers.Select(handover => handover.Id).ToList();
    var receipts = await db.OfficialReceipts.AsNoTracking().Where(receipt => handoverIds.Contains(receipt.CashHandoverId)).ToListAsync();
    var documents = await db.DocumentBlobs.AsNoTracking().Where(document => document.VehicleId.HasValue && vehicleIds.Contains(document.VehicleId.Value)).ToListAsync();
    var leads = roles.Any(role => role is "BossAdmin" or "Sales")
        ? await db.Leads.AsNoTracking().Where(lead => lead.CustomerId == id).ToListAsync()
        : [];

    return Results.Ok(CustomerProfileFactory.Create(customer, roles, vehicles, loans, deliveries, payments, invoices, handovers, receipts, documents, leads));
}).RequireAuthorization("CustomerProfile");
backOffice.MapPost("/customers", async (Customer customer, AppDbContext db, HttpContext context) =>
{
    var validation = ContactRules.ValidateCustomer(customer);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var uniquePhoneValidation = ContactRules.ValidateUniqueCustomerPhone(customer, await db.Customers.AsNoTracking().ToListAsync());
    if (!uniquePhoneValidation.IsValid) return Results.BadRequest(uniquePhoneValidation);
    db.Customers.Add(customer);
    ApiAudit.Add(db, context.User, "customer.created", nameof(Customer), customer.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/customers/{customer.Id}", customer);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/customers/{id:guid}", async (Guid id, Customer customer, AppDbContext db, HttpContext context) =>
{
    if (id != customer.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("customer"));
    if (!await db.Customers.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = ContactRules.ValidateCustomer(customer);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var uniquePhoneValidation = ContactRules.ValidateUniqueCustomerPhone(customer, await db.Customers.AsNoTracking().ToListAsync());
    if (!uniquePhoneValidation.IsValid) return Results.BadRequest(uniquePhoneValidation);
    db.Customers.Update(customer);
    ApiAudit.Add(db, context.User, "customer.updated", nameof(Customer), customer.Id);
    await db.SaveChangesAsync();
    return Results.Ok(customer);
}).RequireAuthorization("Vehicles");

backOffice.MapGet("/owners", async (AppDbContext db) => await db.Owners.AsNoTracking().OrderBy(owner => owner.Name).ToListAsync()).RequireAuthorization("OwnerRead");
backOffice.MapPost("/owners", async (Owner owner, AppDbContext db, HttpContext context) =>
{
    var validation = ContactRules.ValidateOwner(owner);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var uniquePhoneValidation = ContactRules.ValidateUniqueOwnerPhone(owner, await db.Owners.AsNoTracking().ToListAsync());
    if (!uniquePhoneValidation.IsValid) return Results.BadRequest(uniquePhoneValidation);
    db.Owners.Add(owner);
    ApiAudit.Add(db, context.User, "owner.created", nameof(Owner), owner.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/owners/{owner.Id}", owner);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/owners/{id:guid}", async (Guid id, Owner owner, AppDbContext db, HttpContext context) =>
{
    if (id != owner.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("owner"));
    if (!await db.Owners.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = ContactRules.ValidateOwner(owner);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var uniquePhoneValidation = ContactRules.ValidateUniqueOwnerPhone(owner, await db.Owners.AsNoTracking().ToListAsync());
    if (!uniquePhoneValidation.IsValid) return Results.BadRequest(uniquePhoneValidation);
    db.Owners.Update(owner);
    ApiAudit.Add(db, context.User, "owner.updated", nameof(Owner), owner.Id);
    await db.SaveChangesAsync();
    return Results.Ok(owner);
}).RequireAuthorization("Vehicles");

backOffice.MapGet("/purchase-invoices", async (AppDbContext db) =>
    await db.PurchaseInvoices.AsNoTracking().OrderBy(invoice => invoice.InvoiceNumber).ToListAsync()).RequireAuthorization("Vehicles");
backOffice.MapPost("/purchase-invoices", async (PurchaseInvoice invoice, AppDbContext db, HttpContext context) =>
{
    var validation = PurchaseInvoiceRules.Validate(
        invoice,
        await db.PurchaseInvoices.AsNoTracking().ToListAsync(),
        await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.PurchaseInvoices.Add(invoice);
    ApiAudit.Add(db, context.User, "purchaseInvoice.created", nameof(PurchaseInvoice), invoice.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/purchase-invoices/{invoice.Id}", invoice);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/purchase-invoices/{id:guid}", async (Guid id, PurchaseInvoice invoice, AppDbContext db, HttpContext context) =>
{
    if (id != invoice.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("purchase invoice"));
    if (!await db.PurchaseInvoices.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = PurchaseInvoiceRules.Validate(
        invoice,
        await db.PurchaseInvoices.AsNoTracking().ToListAsync(),
        await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.PurchaseInvoices.Update(invoice);
    ApiAudit.Add(db, context.User, "purchaseInvoice.updated", nameof(PurchaseInvoice), invoice.Id);
    await db.SaveChangesAsync();
    return Results.Ok(invoice);
}).RequireAuthorization("Vehicles");

backOffice.MapGet("/loans", async (AppDbContext db) => await db.LoanApplications.AsNoTracking().ToListAsync()).RequireAuthorization("Loans");
backOffice.MapPost("/loans", async (LoanApplication loan, AppDbContext db, HttpContext context) =>
{
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var customers = await db.Customers.AsNoTracking().ToListAsync();
    var existingLoans = await db.LoanApplications.AsNoTracking().ToListAsync();
    var validation = WorkflowReferenceRules.ValidateLoan(
        loan,
        vehicles,
        customers,
        existingLoans);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (loan.Status == LoanStatus.Done)
    {
        var completionValidation = LoanDocumentRules.ValidateCompletion(loan, await db.DocumentBlobs.AsNoTracking().ToListAsync());
        if (!completionValidation.IsValid) return Results.BadRequest(completionValidation);
    }

    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == loan.VehicleId);
    var payments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, existingLoans.Append(loan), payments));
    db.LoanApplications.Add(loan);
    ApiAudit.Add(db, context.User, "loan.created", nameof(LoanApplication), loan.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/loans/{loan.Id}", loan);
}).RequireAuthorization("Loans");
backOffice.MapPut("/loans/{id:guid}", async (Guid id, LoanApplication loan, AppDbContext db, HttpContext context) =>
{
    if (id != loan.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("loan"));
    var existingLoan = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (existingLoan is null) return Results.NotFound();
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var customers = await db.Customers.AsNoTracking().ToListAsync();
    var existingLoans = await db.LoanApplications.AsNoTracking().ToListAsync();
    var validation = WorkflowReferenceRules.ValidateLoan(
        loan,
        vehicles,
        customers,
        existingLoans);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (loan.Status == LoanStatus.Done)
    {
        var completionValidation = LoanDocumentRules.ValidateCompletion(loan, await db.DocumentBlobs.AsNoTracking().ToListAsync());
        if (!completionValidation.IsValid) return Results.BadRequest(completionValidation);
    }

    var payments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var updatedLoans = existingLoans.Where(item => item.Id != loan.Id).Append(loan).ToList();
    foreach (var vehicleId in new[] { existingLoan.VehicleId, loan.VehicleId }.Distinct())
    {
        var vehicle = await db.Vehicles.FirstAsync(item => item.Id == vehicleId);
        db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, updatedLoans, payments));
    }

    db.LoanApplications.Update(loan);
    ApiAudit.Add(db, context.User, "loan.updated", nameof(LoanApplication), loan.Id);
    await db.SaveChangesAsync();
    return Results.Ok(loan);
}).RequireAuthorization("Loans");

backOffice.MapGet("/deliveries", async (AppDbContext db) => await db.DeliverySchedules.AsNoTracking().ToListAsync()).RequireAuthorization("Deliveries");
backOffice.MapPost("/deliveries", async (DeliverySchedule delivery, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateCanonicalBuyer(
        delivery.VehicleId,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync(),
        "Delivery");
    if (!validation.IsValid) return Results.BadRequest(validation);
    var deliveryValidation = DeliveryRules.Validate(delivery);
    if (!deliveryValidation.IsValid) return Results.BadRequest(deliveryValidation);
    var releaseValidation = DeliveryRules.ValidateRelease(delivery);
    if (!releaseValidation.IsValid) return Results.BadRequest(releaseValidation);
    var documentValidation = DeliveryDocumentRules.ValidateReadyDocuments(delivery, await db.DocumentBlobs.AsNoTracking().ToListAsync());
    if (!documentValidation.IsValid) return Results.BadRequest(documentValidation);
    db.DeliverySchedules.Add(delivery);
    ApiAudit.Add(db, context.User, "delivery.created", nameof(DeliverySchedule), delivery.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/deliveries/{delivery.Id}", delivery);
}).RequireAuthorization("Deliveries");
backOffice.MapPut("/deliveries/{id:guid}", async (Guid id, DeliverySchedule delivery, AppDbContext db, HttpContext context) =>
{
    if (id != delivery.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("delivery"));
    if (!await db.DeliverySchedules.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = WorkflowReferenceRules.ValidateCanonicalBuyer(
        delivery.VehicleId,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync(),
        "Delivery");
    if (!validation.IsValid) return Results.BadRequest(validation);
    var deliveryValidation = DeliveryRules.Validate(delivery);
    if (!deliveryValidation.IsValid) return Results.BadRequest(deliveryValidation);
    var releaseValidation = DeliveryRules.ValidateRelease(delivery);
    if (!releaseValidation.IsValid) return Results.BadRequest(releaseValidation);
    var documentValidation = DeliveryDocumentRules.ValidateReadyDocuments(delivery, await db.DocumentBlobs.AsNoTracking().ToListAsync());
    if (!documentValidation.IsValid) return Results.BadRequest(documentValidation);
    db.DeliverySchedules.Update(delivery);
    ApiAudit.Add(db, context.User, "delivery.updated", nameof(DeliverySchedule), delivery.Id);
    await db.SaveChangesAsync();
    return Results.Ok(delivery);
}).RequireAuthorization("Deliveries");

backOffice.MapGet("/repairs", async (AppDbContext db) => await db.RepairJobs.AsNoTracking().ToListAsync()).RequireAuthorization("Repairs");
backOffice.MapPost("/repairs", async (RepairJob repair, AppDbContext db, HttpContext context) =>
{
    repair = RepairApprovalRules.PrepareForCreate(repair);
    var validation = WorkflowReferenceRules.ValidateVehicleLink(repair.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var repairValidation = RepairRules.Validate(repair);
    if (!repairValidation.IsValid) return Results.BadRequest(repairValidation);
    db.RepairJobs.Add(repair);
    ApiAudit.Add(db, context.User, "repair.created", nameof(RepairJob), repair.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/repairs/{repair.Id}", repair);
}).RequireAuthorization("Repairs");
backOffice.MapPut("/repairs/{id:guid}", async (Guid id, RepairJob repair, AppDbContext db, HttpContext context) =>
{
    if (id != repair.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("repair"));
    var existingRepair = await db.RepairJobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (existingRepair is null) return Results.NotFound();
    repair = RepairApprovalRules.PrepareForUpdate(existingRepair, repair);
    var validation = WorkflowReferenceRules.ValidateVehicleLink(repair.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var repairValidation = RepairRules.Validate(repair);
    if (!repairValidation.IsValid) return Results.BadRequest(repairValidation);
    db.RepairJobs.Update(repair);
    ApiAudit.Add(db, context.User, "repair.updated", nameof(RepairJob), repair.Id);
    await db.SaveChangesAsync();
    return Results.Ok(repair);
}).RequireAuthorization("Repairs");
backOffice.MapPost("/repairs/{id:guid}/approval", async (Guid id, RepairApprovalRequest request, AppDbContext db, HttpContext context) =>
{
    var repair = await db.RepairJobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (repair is null) return Results.NotFound();

    repair = RepairApprovalRules.Approve(repair, request, context.User);
    db.RepairJobs.Update(repair);
    ApiAudit.Add(db, context.User, "repair.approved", nameof(RepairJob), repair.Id);
    await db.SaveChangesAsync();
    return Results.Ok(repair);
}).RequireAuthorization("BossAdmin");

backOffice.MapGet("/suppliers", async (AppDbContext db) =>
    SupplierInvoiceRules.CreateSupplierSummaries(await db.SupplierInvoices.AsNoTracking().ToListAsync())).RequireAuthorization("Repairs");

backOffice.MapGet("/supplier-invoices", async (AppDbContext db) => await db.SupplierInvoices.AsNoTracking().ToListAsync()).RequireAuthorization("Repairs");
backOffice.MapGet("/supplier-invoices/aging", async (AppDbContext db) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    return (await db.SupplierInvoices.AsNoTracking().ToListAsync())
        .Select(invoice => SupplierInvoiceRules.CreateAgingView(invoice, today))
        .OrderBy(view => view.Status)
        .ThenBy(view => view.DueDate)
        .ToList();
}).RequireAuthorization("Repairs");
backOffice.MapPost("/supplier-invoices", async (SupplierInvoice invoice, AppDbContext db, HttpContext context) =>
{
    var result = SupplierInvoiceRules.Validate(
        invoice,
        await db.SupplierInvoices.AsNoTracking().ToListAsync(),
        await db.Vehicles.AsNoTracking().ToListAsync());
    if (!result.IsValid) return Results.BadRequest(result);
    db.SupplierInvoices.Add(invoice);
    ApiAudit.Add(db, context.User, "supplierInvoice.created", nameof(SupplierInvoice), invoice.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/supplier-invoices/{invoice.Id}", invoice);
}).RequireAuthorization("Repairs");
backOffice.MapPut("/supplier-invoices/{id:guid}", async (Guid id, SupplierInvoice invoice, AppDbContext db, HttpContext context) =>
{
    if (id != invoice.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("supplier invoice"));
    if (!await db.SupplierInvoices.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var result = SupplierInvoiceRules.Validate(
        invoice,
        await db.SupplierInvoices.AsNoTracking().ToListAsync(),
        await db.Vehicles.AsNoTracking().ToListAsync());
    if (!result.IsValid) return Results.BadRequest(result);
    db.SupplierInvoices.Update(invoice);
    ApiAudit.Add(db, context.User, "supplierInvoice.updated", nameof(SupplierInvoice), invoice.Id);
    await db.SaveChangesAsync();
    return Results.Ok(invoice);
}).RequireAuthorization("Repairs");

backOffice.MapGet("/payments/export", async (AppDbContext db, HttpContext context) =>
{
    if (!context.User.IsInRole("BossAdmin") && !context.User.IsInRole("Finance"))
    {
        return Results.Json(new ApiError("Finance export requires Finance or Admin access."), statusCode: StatusCodes.Status403Forbidden);
    }

    var payments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var csv = FinanceCsv.ExportPayments(payments, vehicles);
    ApiAudit.Add(db, context.User, "finance.paymentsExported", nameof(PaymentRecord), Guid.Empty);
    await db.SaveChangesAsync();
    return Results.Text(csv, "text/csv");
}).RequireAuthorization("BackOffice");

backOffice.MapGet("/payments/export-autocount", async (DateOnly? from, DateOnly? to, AppDbContext db, HttpContext context) =>
{
    if (!context.User.IsInRole("BossAdmin") && !context.User.IsInRole("Finance"))
    {
        return Results.Json(new ApiError("AutoCount export requires Finance or Admin access."), statusCode: StatusCodes.Status403Forbidden);
    }

    if (!AutoCountDateRules.IsValidPeriod(from, to))
    {
        return Results.BadRequest(new ApiError("AutoCount export period start must be on or before the end date."));
    }

    var generatedAtUtc = DateTime.UtcNow;
    var workbook = AutoCountExcel.Export(new AutoCountExportInput(
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync(),
        await db.PurchaseInvoices.AsNoTracking().ToListAsync(),
        await db.SupplierInvoices.AsNoTracking().ToListAsync(),
        await db.PaymentRecords.AsNoTracking().ToListAsync(),
        await db.RepairJobs.AsNoTracking().ToListAsync(),
        await db.DailySpends.AsNoTracking().ToListAsync(),
        await db.BrokerCommissions.AsNoTracking().ToListAsync(),
        await db.DebtRecoveryCases.AsNoTracking().ToListAsync(),
        await db.PaymentVouchers.AsNoTracking().ToListAsync(),
        await db.SettlementReminders.AsNoTracking().ToListAsync(),
        from,
        to,
        generatedAtUtc));

    var periodLabel = AutoCountDateRules.PeriodLabel(from, to);
    ApiAudit.Add(db, context.User, "finance.autoCountExported", $"AutoCountExport[{periodLabel}]", Guid.Empty);
    await db.SaveChangesAsync();
    return Results.File(workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"autocount-v1-{periodLabel}.xlsx");
}).RequireAuthorization("BackOffice");

backOffice.MapGet("/payments", async (AppDbContext db) => await db.PaymentRecords.AsNoTracking().ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/payments", async (PaymentRecord payment, AppDbContext db, HttpContext context) =>
{
    payment = PaymentManagementReviewRules.PrepareForCreate(payment);
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var validation = WorkflowReferenceRules.ValidateVehicleLink(payment.VehicleId, vehicles);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (payment.Status == PaymentStatus.Reconciled)
    {
        var buyerValidation = WorkflowReferenceRules.ValidateCanonicalBuyer(
            payment.VehicleId,
            vehicles,
            await db.Customers.AsNoTracking().ToListAsync(),
            "Payment reconciliation");
        if (!buyerValidation.IsValid) return Results.BadRequest(buyerValidation);
    }

    var existingPayments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var financeValidation = FinanceRules.ValidatePayment(payment, existingPayments);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == payment.VehicleId);
    var loans = await db.LoanApplications.AsNoTracking().ToListAsync();
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, loans, existingPayments.Append(payment)));
    db.PaymentRecords.Add(payment);
    ApiAudit.Add(db, context.User, "payment.created", nameof(PaymentRecord), payment.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/payments/{payment.Id}", payment);
}).RequireAuthorization("Finance");
backOffice.MapPut("/payments/{id:guid}", async (Guid id, PaymentRecord payment, AppDbContext db, HttpContext context) =>
{
    if (id != payment.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("payment"));
    var existingPayment = await db.PaymentRecords.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (existingPayment is null) return Results.NotFound();
    payment = PaymentManagementReviewRules.PrepareForUpdate(existingPayment, payment);
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var validation = WorkflowReferenceRules.ValidateVehicleLink(payment.VehicleId, vehicles);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (payment.Status == PaymentStatus.Reconciled)
    {
        var buyerValidation = WorkflowReferenceRules.ValidateCanonicalBuyer(
            payment.VehicleId,
            vehicles,
            await db.Customers.AsNoTracking().ToListAsync(),
            "Payment reconciliation");
        if (!buyerValidation.IsValid) return Results.BadRequest(buyerValidation);
    }

    var existingPayments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var financeValidation = FinanceRules.ValidatePayment(payment, existingPayments);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    var loans = await db.LoanApplications.AsNoTracking().ToListAsync();
    var updatedPayments = existingPayments.Where(item => item.Id != payment.Id).Append(payment).ToList();
    foreach (var vehicleId in new[] { existingPayment.VehicleId, payment.VehicleId }.Distinct())
    {
        var vehicle = await db.Vehicles.FirstAsync(item => item.Id == vehicleId);
        db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, loans, updatedPayments));
    }

    db.PaymentRecords.Update(payment);
    ApiAudit.Add(db, context.User, "payment.updated", nameof(PaymentRecord), payment.Id);
    await db.SaveChangesAsync();
    return Results.Ok(payment);
}).RequireAuthorization("Finance");
backOffice.MapPost("/payments/{id:guid}/management-review", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var payment = await db.PaymentRecords.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (payment is null) return Results.NotFound();

    payment = payment with { BossChecked = true };
    db.PaymentRecords.Update(payment);
    ApiAudit.Add(db, context.User, "payment.managementReviewed", nameof(PaymentRecord), payment.Id);
    await db.SaveChangesAsync();
    return Results.Ok(payment);
}).RequireAuthorization("BossAdmin");

backOffice.MapGet("/cash-handovers", async (AppDbContext db, HttpContext context) =>
{
    var handovers = await db.CashHandovers.AsNoTracking().OrderByDescending(handover => handover.CollectedAt).ToListAsync();
    if (context.User.IsInRole("BossAdmin") || context.User.IsInRole("Finance")) return Results.Ok(handovers);

    var actorUserId = StaffIdentity.CurrentUserId(context);
    return Results.Ok(handovers.Where(handover => handover.CollectedByUserId == actorUserId));
}).RequireAuthorization("CashCustody");

backOffice.MapGet("/cash-handovers/payment-lookup", async (AppDbContext db) =>
{
    var handedOverPaymentIds = await db.CashHandovers.AsNoTracking().Select(handover => handover.PaymentRecordId).ToListAsync();
    var payments = await db.PaymentRecords.AsNoTracking()
        .Where(payment => payment.Status != PaymentStatus.Reconciled && !handedOverPaymentIds.Contains(payment.Id))
        .OrderByDescending(payment => payment.CreatedAt)
        .ToListAsync();
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    var customers = await db.Customers.AsNoTracking().ToListAsync();
    return Results.Ok(
        from payment in payments
        join vehicle in vehicles on payment.VehicleId equals vehicle.Id
        where vehicle.CustomerId is not null
        join customer in customers on vehicle.CustomerId!.Value equals customer.Id
        select new CashHandoverPaymentLookup(payment.Id, vehicle.Id, customer.Id, customer.Name, vehicle.PlateNumber, payment.InvoiceNumber, payment.NettPrice));
}).RequireAuthorization("CashCustody");

backOffice.MapPost("/cash-handovers", async (CashHandoverCreateRequest request, AppDbContext db, HttpContext context) =>
{
    var payment = await db.PaymentRecords.AsNoTracking().FirstOrDefaultAsync(item => item.Id == request.PaymentRecordId);
    var vehicle = payment is null
        ? null
        : await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == payment.VehicleId);
    var validation = CashCustodyRules.ValidateCreate(request, payment, vehicle);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (await db.CashHandovers.AsNoTracking().AnyAsync(item => item.PaymentRecordId == request.PaymentRecordId))
    {
        return Results.Conflict(new ApiError("A cash handover already exists for this payment."));
    }

    var handover = new CashHandover
    {
        PaymentRecordId = payment!.Id,
        VehicleId = vehicle!.Id,
        CustomerId = vehicle.CustomerId!.Value,
        Amount = request.Amount,
        CollectedByUserId = StaffIdentity.CurrentUserId(context),
        Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        CollectedAt = DateTime.UtcNow
    };

    db.CashHandovers.Add(handover);
    ApiAudit.Add(db, context.User, "cashHandover.receivedBySales", nameof(CashHandover), handover.Id);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        return Results.Conflict(new ApiError("A cash handover already exists for this payment."));
    }

    return Results.Created($"/api/cash-handovers/{handover.Id}", handover);
}).RequireAuthorization("Sales");

backOffice.MapPost("/cash-handovers/{id:guid}/request-handover", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var handover = await db.CashHandovers.FirstOrDefaultAsync(item => item.Id == id);
    if (handover is null) return Results.NotFound();
    var validation = CashCustodyRules.ValidateRequestHandover(handover, StaffIdentity.CurrentUserId(context));
    if (!validation.IsValid) return Results.BadRequest(validation);

    var updated = handover with { Status = CashHandoverStatus.PendingHandover, HandoverRequestedAt = DateTime.UtcNow };
    db.Entry(handover).CurrentValues.SetValues(updated);
    ApiAudit.Add(db, context.User, "cashHandover.requested", nameof(CashHandover), id);
    await db.SaveChangesAsync();
    return Results.Ok(updated);
}).RequireAuthorization("Sales");

backOffice.MapPost("/cash-handovers/{id:guid}/hand-over", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var handover = await db.CashHandovers.FirstOrDefaultAsync(item => item.Id == id);
    if (handover is null) return Results.NotFound();
    var actorUserId = StaffIdentity.CurrentUserId(context);
    var validation = CashCustodyRules.ValidateHandOver(handover, actorUserId);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var updated = handover with
    {
        Status = CashHandoverStatus.HandedOver,
        HandedOverToUserId = actorUserId,
        HandedOverAt = DateTime.UtcNow
    };
    db.Entry(handover).CurrentValues.SetValues(updated);
    ApiAudit.Add(db, context.User, "cashHandover.handedOver", nameof(CashHandover), id);
    await db.SaveChangesAsync();
    return Results.Ok(updated);
}).RequireAuthorization("Finance");

backOffice.MapPost("/cash-handovers/{id:guid}/accept", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var handover = await db.CashHandovers.FirstOrDefaultAsync(item => item.Id == id);
    if (handover is null) return Results.NotFound();
    if (handover.Status == CashHandoverStatus.Receipted) return Results.Ok(handover);

    var actorUserId = StaffIdentity.CurrentUserId(context);
    var validation = CashCustodyRules.ValidateAccept(handover, actorUserId);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var payment = await db.PaymentRecords.AsNoTracking().FirstOrDefaultAsync(item => item.Id == handover.PaymentRecordId);
    var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == handover.VehicleId);
    var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(item => item.Id == handover.CustomerId);
    if (payment is null || vehicle is null || customer is null) return Results.BadRequest(new ApiError("Cash handover references an unavailable payment, vehicle, or customer."));
    var amountValidation = CashCustodyRules.ValidateRecordedAmount(handover, payment);
    if (!amountValidation.IsValid) return Results.BadRequest(amountValidation);

    var now = DateTime.UtcNow;
    var receipt = OfficialReceiptFactory.Create(handover, vehicle, customer, actorUserId, now);
    var updated = handover with
    {
        Status = CashHandoverStatus.Receipted,
        AcceptedByUserId = actorUserId,
        AcceptedAt = now,
        OfficialReceiptId = receipt.Id,
        OfficialReceiptNumber = receipt.ReceiptNumber
    };

    db.OfficialReceipts.Add(receipt);
    db.Entry(handover).CurrentValues.SetValues(updated);
    ApiAudit.Add(db, context.User, "cashHandover.accepted", nameof(CashHandover), id);
    ApiAudit.Add(db, context.User, "officialReceipt.generated", nameof(OfficialReceipt), receipt.Id);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
        db.ChangeTracker.Clear();
        var existing = await db.CashHandovers.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
        return existing?.Status == CashHandoverStatus.Receipted
            ? Results.Ok(existing)
            : Results.Conflict(new ApiError("Official receipt creation conflicted with another request. Retry safely."));
    }

    return Results.Ok(updated);
}).RequireAuthorization("Finance");

backOffice.MapPost("/cash-handovers/{id:guid}/reject", async (Guid id, CashHandoverRejectionRequest request, AppDbContext db, HttpContext context) =>
{
    var handover = await db.CashHandovers.FirstOrDefaultAsync(item => item.Id == id);
    if (handover is null) return Results.NotFound();
    var actorUserId = StaffIdentity.CurrentUserId(context);
    var validation = CashCustodyRules.ValidateReject(handover, actorUserId, request.Reason);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var updated = handover with
    {
        Status = CashHandoverStatus.Rejected,
        RejectedByUserId = actorUserId,
        RejectedAt = DateTime.UtcNow,
        RejectionReason = request.Reason.Trim()
    };
    db.Entry(handover).CurrentValues.SetValues(updated);
    ApiAudit.Add(db, context.User, "cashHandover.rejected", nameof(CashHandover), id);
    await db.SaveChangesAsync();
    return Results.Ok(updated);
}).RequireAuthorization("Finance");

backOffice.MapGet("/cash-handovers/{id:guid}/official-receipt/content", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var handover = await db.CashHandovers.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (handover is null || handover.OfficialReceiptId is null) return Results.NotFound();
    if (!context.User.IsInRole("BossAdmin") && !context.User.IsInRole("Finance") && handover.CollectedByUserId != StaffIdentity.CurrentUserId(context)) return Results.Forbid();

    var receipt = await db.OfficialReceipts.AsNoTracking().FirstOrDefaultAsync(item => item.Id == handover.OfficialReceiptId.Value);
    return receipt is null ? Results.NotFound() : Results.File(receipt.Content, receipt.ContentMimeType, $"{receipt.ReceiptNumber}.pdf");
}).RequireAuthorization("CashCustody");

backOffice.MapGet("/finance-invoices/{invoiceId:guid}/content", async (Guid invoiceId, AppDbContext db) =>
{
    var invoice = await db.FinanceInvoices.AsNoTracking().FirstOrDefaultAsync(item => item.Id == invoiceId);
    return invoice is null
        ? Results.NotFound()
        : Results.File(invoice.Content, invoice.ContentMimeType, $"{invoice.InvoiceNumber}.pdf");
}).RequireAuthorization("Finance");

backOffice.MapGet("/settlement-reminders", async (AppDbContext db) => await db.SettlementReminders.AsNoTracking().OrderBy(reminder => reminder.Deadline).ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/settlement-reminders", async (SettlementReminder reminder, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateVehicleLink(reminder.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var financeValidation = FinanceRules.ValidateSettlement(reminder, await db.Owners.AsNoTracking().ToListAsync());
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    db.SettlementReminders.Add(reminder);
    ApiAudit.Add(db, context.User, "settlementReminder.created", nameof(SettlementReminder), reminder.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/settlement-reminders/{reminder.Id}", reminder);
}).RequireAuthorization("Finance");
backOffice.MapPut("/settlement-reminders/{id:guid}", async (Guid id, SettlementReminder reminder, AppDbContext db, HttpContext context) =>
{
    if (id != reminder.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("settlement reminder"));
    if (!await db.SettlementReminders.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = WorkflowReferenceRules.ValidateVehicleLink(reminder.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var financeValidation = FinanceRules.ValidateSettlement(reminder, await db.Owners.AsNoTracking().ToListAsync());
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    db.SettlementReminders.Update(reminder);
    ApiAudit.Add(db, context.User, "settlementReminder.updated", nameof(SettlementReminder), reminder.Id);
    await db.SaveChangesAsync();
    return Results.Ok(reminder);
}).RequireAuthorization("Finance");

backOffice.MapGet("/daily-spends", async (AppDbContext db) => await db.DailySpends.AsNoTracking().OrderBy(spend => spend.DueDate).ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/daily-spends", async (DailySpend spend, AppDbContext db, HttpContext context) =>
{
    var financeValidation = FinanceRules.ValidateDailySpend(spend);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    db.DailySpends.Add(spend);
    ApiAudit.Add(db, context.User, "dailySpend.created", nameof(DailySpend), spend.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/daily-spends/{spend.Id}", spend);
}).RequireAuthorization("Finance");
backOffice.MapPut("/daily-spends/{id:guid}", async (Guid id, DailySpend spend, AppDbContext db, HttpContext context) =>
{
    if (id != spend.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("daily spend"));
    if (!await db.DailySpends.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var financeValidation = FinanceRules.ValidateDailySpend(spend);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    db.DailySpends.Update(spend);
    ApiAudit.Add(db, context.User, "dailySpend.updated", nameof(DailySpend), spend.Id);
    await db.SaveChangesAsync();
    return Results.Ok(spend);
}).RequireAuthorization("Finance");

backOffice.MapGet("/broker-commissions", async (AppDbContext db) => await db.BrokerCommissions.AsNoTracking().OrderBy(commission => commission.BrokerName).ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/broker-commissions", async (BrokerCommission commission, AppDbContext db, HttpContext context) =>
{
    var validation = FinanceRules.ValidateBrokerCommission(commission, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.BrokerCommissions.Add(commission);
    ApiAudit.Add(db, context.User, "brokerCommission.created", nameof(BrokerCommission), commission.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/broker-commissions/{commission.Id}", commission);
}).RequireAuthorization("Finance");
backOffice.MapPut("/broker-commissions/{id:guid}", async (Guid id, BrokerCommission commission, AppDbContext db, HttpContext context) =>
{
    if (id != commission.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("broker commission"));
    if (!await db.BrokerCommissions.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = FinanceRules.ValidateBrokerCommission(commission, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.BrokerCommissions.Update(commission);
    ApiAudit.Add(db, context.User, "brokerCommission.updated", nameof(BrokerCommission), commission.Id);
    await db.SaveChangesAsync();
    return Results.Ok(commission);
}).RequireAuthorization("Finance");

backOffice.MapGet("/debt-recoveries", async (AppDbContext db) => await db.DebtRecoveryCases.AsNoTracking().OrderBy(debt => debt.FollowUpDate).ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/debt-recoveries", async (DebtRecoveryCase debt, AppDbContext db, HttpContext context) =>
{
    var validation = FinanceRules.ValidateDebtRecovery(
        debt,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.DebtRecoveryCases.Add(debt);
    ApiAudit.Add(db, context.User, "debtRecovery.created", nameof(DebtRecoveryCase), debt.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/debt-recoveries/{debt.Id}", debt);
}).RequireAuthorization("Finance");
backOffice.MapPut("/debt-recoveries/{id:guid}", async (Guid id, DebtRecoveryCase debt, AppDbContext db, HttpContext context) =>
{
    if (id != debt.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("debt recovery"));
    if (!await db.DebtRecoveryCases.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = FinanceRules.ValidateDebtRecovery(
        debt,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.DebtRecoveryCases.Update(debt);
    ApiAudit.Add(db, context.User, "debtRecovery.updated", nameof(DebtRecoveryCase), debt.Id);
    await db.SaveChangesAsync();
    return Results.Ok(debt);
}).RequireAuthorization("Finance");

backOffice.MapGet("/payment-vouchers", async (AppDbContext db) => await db.PaymentVouchers.AsNoTracking().OrderByDescending(voucher => voucher.IssuedDate).ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/payment-vouchers", async (PaymentVoucher voucher, AppDbContext db, HttpContext context) =>
{
    var validation = FinanceRules.ValidatePaymentVoucher(voucher, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.PaymentVouchers.Add(voucher);
    ApiAudit.Add(db, context.User, "paymentVoucher.created", nameof(PaymentVoucher), voucher.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/payment-vouchers/{voucher.Id}", voucher);
}).RequireAuthorization("Finance");
backOffice.MapPut("/payment-vouchers/{id:guid}", async (Guid id, PaymentVoucher voucher, AppDbContext db, HttpContext context) =>
{
    if (id != voucher.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("payment voucher"));
    if (!await db.PaymentVouchers.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = FinanceRules.ValidatePaymentVoucher(voucher, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.PaymentVouchers.Update(voucher);
    ApiAudit.Add(db, context.User, "paymentVoucher.updated", nameof(PaymentVoucher), voucher.Id);
    await db.SaveChangesAsync();
    return Results.Ok(voucher);
}).RequireAuthorization("Finance");

backOffice.MapGet("/leads", async (AppDbContext db) => await db.Leads.AsNoTracking().OrderByDescending(lead => lead.CreatedAt).ToListAsync()).RequireAuthorization("Sales");
backOffice.MapPut("/leads/{id:guid}", async (Guid id, Lead lead, AppDbContext db, HttpContext context, UserManager<AppUser> userManager) =>
{
    if (id != lead.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("lead"));
    var existingLead = await db.Leads.FirstOrDefaultAsync(item => item.Id == id);
    if (existingLead is null) return Results.NotFound();
    var currentUserId = StaffIdentity.CurrentUserId(context);
    var ownershipValidation = LeadRules.ValidateStatusOwner(existingLead, lead, currentUserId);
    if (!ownershipValidation.IsValid) return Results.BadRequest(ownershipValidation);
    var currentUser = string.IsNullOrWhiteSpace(currentUserId) ? null : await userManager.FindByIdAsync(currentUserId);
    var currentUserName = string.IsNullOrWhiteSpace(currentUser?.DisplayName) ? AuditTrail.ActorFrom(context.User) : currentUser.DisplayName;
    var updatedLead = LeadRules.ApplyBackOfficeUpdate(existingLead, lead, currentUserId, currentUserName, DateTime.UtcNow);
    var validation = LeadRules.ValidateBackOfficeLead(
        updatedLead,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Entry(existingLead).CurrentValues.SetValues(updatedLead);
    ApiAudit.Add(db, context.User, "lead.updated", nameof(Lead), updatedLead.Id);
    await db.SaveChangesAsync();
    return Results.Ok(updatedLead);
}).RequireAuthorization("Sales");
backOffice.MapGet("/audit-log", async (string? actor, string? action, string? entityName, AppDbContext db) =>
{
    var query = db.AuditLogs.AsNoTracking();
    if (!string.IsNullOrWhiteSpace(actor))
    {
        var normalizedActor = actor.Trim().ToLowerInvariant();
        query = query.Where(log => log.Actor.ToLower().Contains(normalizedActor));
    }

    if (!string.IsNullOrWhiteSpace(action))
    {
        var normalizedAction = action.Trim().ToLowerInvariant();
        query = query.Where(log => log.Action.ToLower().Contains(normalizedAction));
    }

    if (!string.IsNullOrWhiteSpace(entityName))
    {
        var normalizedEntityName = entityName.Trim().ToLowerInvariant();
        query = query.Where(log => log.EntityName.ToLower().Contains(normalizedEntityName));
    }

    return await query.OrderByDescending(log => log.CreatedAt).Take(200).ToListAsync();
}).RequireAuthorization("BossAdmin");

var admin = backOffice.MapGroup("/admin").RequireAuthorization("BossAdmin");
admin.MapGet("/ai-limits/ocr", async (AiUsageQuotaService aiUsageQuota, CancellationToken cancellationToken) =>
    Results.Ok(await aiUsageQuota.GetOcrSnapshotAsync(cancellationToken)));
admin.MapPut("/ai-limits/ocr", async (UpdateAiServiceLimitRequest request, AiUsageQuotaService aiUsageQuota, AppDbContext db, HttpContext context, CancellationToken cancellationToken) =>
{
    var errors = AiUsageLimitRules.Validate(request);
    if (errors.Length > 0) return Results.BadRequest(new { errors });

    var limit = await aiUsageQuota.UpdateOcrLimitAsync(request, AuditTrail.ActorFrom(context.User), cancellationToken);
    ApiAudit.Add(db, context.User, "aiUsageLimit.ocr.updated", nameof(AiServiceLimit), limit.Id);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Ok(await aiUsageQuota.GetOcrSnapshotAsync(cancellationToken));
});
admin.MapGet("/users", async (UserManager<AppUser> userManager) =>
{
    var users = await userManager.Users.AsNoTracking().OrderBy(user => user.Email).ToListAsync();
    var result = new List<StaffUserResponse>(users.Count);
    foreach (var user in users)
    {
        var roles = await userManager.GetRolesAsync(user);
        result.Add(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles.Order().ToArray(), user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
    }

    return Results.Ok(result);
});
admin.MapPost("/users", async (CreateStaffUserRequest request, UserManager<AppUser> userManager, AppDbContext db, HttpContext context) =>
{
    var validation = StaffUserRules.ValidateCreate(request, SeedData.Roles);
    if (!validation.IsValid) return Results.BadRequest(validation);

    if (await userManager.FindByEmailAsync(request.Email) is not null)
    {
        return Results.BadRequest(new { message = "Email is already used by another staff user." });
    }

    var user = new AppUser
    {
        UserName = request.Email,
        Email = request.Email,
        DisplayName = request.DisplayName,
        LockoutEnabled = true
    };
    var createResult = await userManager.CreateAsync(user, request.Password);
    if (!createResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", createResult.Errors.Select(error => error.Description)) });
    }

    var roleResult = await userManager.AddToRoleAsync(user, request.Role);
    if (!roleResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", roleResult.Errors.Select(error => error.Description)) });
    }

    ApiAudit.Add(db, context.User, "staffUser.created", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Created($"/api/admin/users/{user.Id}", new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, [request.Role], true));
});
admin.MapPut("/users/{id}", async (string id, UpdateStaffUserRequest request, UserManager<AppUser> userManager, AppDbContext db, HttpContext context) =>
{
    var validation = StaffUserRules.ValidateUpdate(request);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var user = await userManager.FindByIdAsync(id);
    if (user is null)
    {
        return Results.NotFound();
    }

    user.DisplayName = request.DisplayName.Trim();
    var updateResult = await userManager.UpdateAsync(user);
    if (!updateResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", updateResult.Errors.Select(error => error.Description)) });
    }

    var roles = (await userManager.GetRolesAsync(user)).Order().ToArray();
    ApiAudit.Add(db, context.User, "staffUser.updated", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Ok(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles, user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
});
admin.MapPut("/users/{id}/password", async (string id, ResetStaffPasswordRequest request, UserManager<AppUser> userManager, AppDbContext db, HttpContext context) =>
{
    var validation = StaffUserRules.ValidatePasswordReset(request);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var user = await userManager.FindByIdAsync(id);
    if (user is null)
    {
        return Results.NotFound();
    }

    var resetToken = await userManager.GeneratePasswordResetTokenAsync(user);
    var resetResult = await userManager.ResetPasswordAsync(user, resetToken, request.Password.Trim());
    if (!resetResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", resetResult.Errors.Select(error => error.Description)) });
    }

    var roles = (await userManager.GetRolesAsync(user)).Order().ToArray();
    ApiAudit.Add(db, context.User, "staffUser.passwordReset", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Ok(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles, user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
});
admin.MapPut("/users/{id}/status", async (string id, UpdateStaffUserStatusRequest request, UserManager<AppUser> userManager, AppDbContext db, HttpContext context) =>
{
    var user = await userManager.FindByIdAsync(id);
    if (user is null)
    {
        return Results.NotFound();
    }

    if (!request.IsActive && user.Id == userManager.GetUserId(context.User))
    {
        return Results.BadRequest(new { message = "Cannot disable the current admin session." });
    }

    user.LockoutEnabled = true;
    user.LockoutEnd = request.IsActive ? null : DateTimeOffset.MaxValue;
    var updateResult = await userManager.UpdateAsync(user);
    if (!updateResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", updateResult.Errors.Select(error => error.Description)) });
    }

    var stampResult = await userManager.UpdateSecurityStampAsync(user);
    if (!stampResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", stampResult.Errors.Select(error => error.Description)) });
    }

    var roles = (await userManager.GetRolesAsync(user)).Order().ToArray();
    ApiAudit.Add(db, context.User, request.IsActive ? "staffUser.enabled" : "staffUser.disabled", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Ok(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles, user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
});
admin.MapPut("/users/{id}/roles", async (string id, UpdateStaffUserRolesRequest request, UserManager<AppUser> userManager, AppDbContext db, HttpContext context) =>
{
    var validation = StaffUserRules.ValidateRoleUpdate(request, SeedData.Roles);
    if (!validation.IsValid) return Results.BadRequest(validation);

    var user = await userManager.FindByIdAsync(id);
    if (user is null)
    {
        return Results.NotFound();
    }

    var currentRoles = (await userManager.GetRolesAsync(user)).Order().ToArray();
    var removeResult = await userManager.RemoveFromRolesAsync(user, currentRoles);
    if (!removeResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", removeResult.Errors.Select(error => error.Description)) });
    }

    var roles = request.Roles.Distinct().Order().ToArray();
    var addResult = await userManager.AddToRolesAsync(user, roles);
    if (!addResult.Succeeded)
    {
        return Results.BadRequest(new { message = string.Join(" ", addResult.Errors.Select(error => error.Description)) });
    }

    ApiAudit.Add(db, context.User, $"staffUser.rolesUpdated previous={string.Join("|", currentRoles)} new={string.Join("|", roles)}", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Ok(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles, user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
});

var hr = backOffice.MapGroup("/hr");
hr.MapGet("/staff", async (UserManager<AppUser> userManager, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    var users = await userManager.Users.AsNoTracking().OrderBy(user => user.DisplayName).ToListAsync();
    var result = new List<StaffUserResponse>();
    foreach (var user in users)
    {
        var roles = await userManager.GetRolesAsync(user);
        result.Add(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles.Order().ToArray(), user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
    }

    return Results.Ok(result);
});

hr.MapGet("/attendance", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrAttendanceRecords.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(record => record.StaffUserId == staffUserId);
    }

    return Results.Ok(await query
        .OrderByDescending(record => record.AttendanceDate)
        .ThenByDescending(record => record.CheckInAt)
        .ToListAsync());
});

hr.MapPost("/attendance/check-in", async (AppDbContext db, HttpContext context) =>
{
    var staffUserId = StaffIdentity.CurrentUserId(context);
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var now = DateTime.UtcNow;
    var openSession = await db.HrAttendanceRecords
        .Where(record => record.StaffUserId == staffUserId && record.AttendanceDate == today && record.CheckInAt != null && record.CheckOutAt == null)
        .OrderByDescending(record => record.CheckInAt)
        .FirstOrDefaultAsync();
    var actionValidation = HrRules.ValidateCheckIn(openSession);
    if (!actionValidation.IsValid) return Results.BadRequest(actionValidation);
    var attendance = new HrAttendanceRecord { StaffUserId = staffUserId, AttendanceDate = today, CheckInAt = now, Status = HrAttendanceStatus.Present };

    var validation = HrRules.ValidateAttendance(attendance);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.HrAttendanceRecords.Add(attendance);
    ApiAudit.Add(db, context.User, "hr.attendance.checkedIn", nameof(HrAttendanceRecord), attendance.Id);
    await db.SaveChangesAsync();
    return Results.Ok(attendance);
});

hr.MapPost("/attendance/check-out", async (AppDbContext db, HttpContext context) =>
{
    var staffUserId = StaffIdentity.CurrentUserId(context);
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var now = DateTime.UtcNow;
    var openSession = await db.HrAttendanceRecords
        .Where(record => record.StaffUserId == staffUserId && record.AttendanceDate == today && record.CheckInAt != null && record.CheckOutAt == null)
        .OrderByDescending(record => record.CheckInAt)
        .FirstOrDefaultAsync();
    var actionValidation = HrRules.ValidateCheckOut(openSession);
    if (!actionValidation.IsValid) return Results.BadRequest(actionValidation);
    var attendance = openSession! with { CheckOutAt = now };

    var validation = HrRules.ValidateAttendance(attendance);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Entry(openSession!).CurrentValues.SetValues(attendance);
    ApiAudit.Add(db, context.User, "hr.attendance.checkedOut", nameof(HrAttendanceRecord), attendance.Id);
    await db.SaveChangesAsync();
    return Results.Ok(attendance);
});

hr.MapPut("/attendance/{id:guid}", async (Guid id, HrAttendanceRecord attendance, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    if (id != attendance.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("attendance"));
    var existing = await db.HrAttendanceRecords.FirstOrDefaultAsync(record => record.Id == id);
    if (existing is null) return Results.NotFound();
    var validation = HrRules.ValidateAttendance(attendance);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Entry(existing).CurrentValues.SetValues(attendance);
    ApiAudit.Add(db, context.User, "hr.attendance.updated", nameof(HrAttendanceRecord), attendance.Id);
    await db.SaveChangesAsync();
    return Results.Ok(attendance);
});

hr.MapGet("/leave-requests", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrLeaveRequests.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(request => request.StaffUserId == staffUserId);
    }

    return Results.Ok(await query.OrderByDescending(request => request.CreatedAt).ToListAsync());
});

hr.MapPost("/leave-requests", async (HrLeaveRequest request, AppDbContext db, HttpContext context) =>
{
    var staffUserId = StaffIdentity.CurrentUserId(context);
    if (!DepartmentAccess.IsHrManager(context.User) && request.StaffUserId != staffUserId) return Results.Forbid();
    var leave = request with
    {
        StaffUserId = DepartmentAccess.IsHrManager(context.User) && !string.IsNullOrWhiteSpace(request.StaffUserId) ? request.StaffUserId : staffUserId,
        Status = HrLeaveStatus.Pending,
        ApprovedBy = null,
        ApprovedAt = null,
        DecisionNotes = null,
        CreatedAt = DateTime.UtcNow
    };
    var validation = HrRules.ValidateLeaveRequest(leave);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.HrLeaveRequests.Add(leave);
    ApiAudit.Add(db, context.User, "hr.leave.created", nameof(HrLeaveRequest), leave.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/hr/leave-requests/{leave.Id}", leave);
});

hr.MapPut("/leave-requests/{id:guid}/decision", async (Guid id, HrLeaveDecisionRequest decision, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    var existing = await db.HrLeaveRequests.FirstOrDefaultAsync(request => request.Id == id);
    if (existing is null) return Results.NotFound();
    var decisionValidation = HrRules.ValidateLeaveDecision(existing);
    if (!decisionValidation.IsValid) return Results.BadRequest(decisionValidation);
    var decided = existing with
    {
        Status = decision.Status,
        ApprovedBy = AuditTrail.ActorFrom(context.User),
        ApprovedAt = DateTime.UtcNow,
        DecisionNotes = decision.DecisionNotes
    };
    var validation = HrRules.ValidateLeaveRequest(decided);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Entry(existing).CurrentValues.SetValues(decided);
    if (decision.Status == HrLeaveStatus.Approved && existing.Status != HrLeaveStatus.Approved)
    {
        var balance = await db.HrLeaveBalances.FirstOrDefaultAsync(item => item.StaffUserId == existing.StaffUserId);
        if (balance is not null)
        {
            db.Entry(balance).CurrentValues.SetValues(HrRules.ApplyApprovedLeave(balance, decided));
        }
    }
    ApiAudit.Add(db, context.User, "hr.leave.decided", nameof(HrLeaveRequest), decided.Id);
    await db.SaveChangesAsync();
    return Results.Ok(decided);
});

hr.MapPut("/leave-requests/{id:guid}/cancel", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var existing = await db.HrLeaveRequests.FirstOrDefaultAsync(request => request.Id == id);
    if (existing is null) return Results.NotFound();
    var staffUserId = StaffIdentity.CurrentUserId(context);
    if (!DepartmentAccess.IsHrManager(context.User) && existing.StaffUserId != staffUserId) return Results.Forbid();
    var cancellationValidation = HrRules.ValidateLeaveCancellation(existing);
    if (!cancellationValidation.IsValid) return Results.BadRequest(cancellationValidation);
    var cancelled = existing with
    {
        Status = HrLeaveStatus.Cancelled,
        DecisionNotes = "Cancelled by staff / 员工取消"
    };
    var validation = HrRules.ValidateLeaveRequest(cancelled);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Entry(existing).CurrentValues.SetValues(cancelled);
    ApiAudit.Add(db, context.User, "hr.leave.cancelled", nameof(HrLeaveRequest), cancelled.Id);
    await db.SaveChangesAsync();
    return Results.Ok(cancelled);
});

hr.MapPost("/leave-requests/{id:guid}/mc", async (Guid id, IFormFile file, AppDbContext db, HttpContext context) =>
{
    var leave = await db.HrLeaveRequests.FirstOrDefaultAsync(request => request.Id == id);
    if (leave is null) return Results.NotFound();
    if (!DepartmentAccess.CanAccessHrStaff(context.User, leave.StaffUserId)) return Results.Forbid();
    var validation = HrRules.ValidateMedicalCertificateUpload(leave);
    if (!validation.IsValid) return Results.BadRequest(validation);
    if (!UploadPolicy.IsAllowed(FileCategory.MedicalCertificate, file.Length)) return Results.BadRequest(new { message = "MC document exceeds 10MB limit." });
    await using var stream = file.OpenReadStream();
    using var memory = new MemoryStream();
    await stream.CopyToAsync(memory);
    var bytes = memory.ToArray();
    var document = new DocumentBlob
    {
        CustomerId = null,
        VehicleId = null,
        Category = FileCategory.MedicalCertificate,
        FileName = file.FileName,
        MimeType = file.ContentType,
        Content = bytes,
        Checksum = Convert.ToHexString(SHA256.HashData(bytes)),
        UploadedBy = UploadMetadata.UploaderFrom(context.User)
    };
    db.DocumentBlobs.Add(document);
    var updated = leave with { MedicalCertificateDocumentId = document.Id };
    db.Entry(leave).CurrentValues.SetValues(updated);
    ApiAudit.Add(db, context.User, "hr.leave.mcUploaded", nameof(DocumentBlob), document.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/hr/leave-requests/{id}/mc/{document.Id}", new { document.Id, document.FileName, document.Category, document.Checksum, document.UploadedBy });
}).DisableAntiforgery();

hr.MapGet("/leave-requests/{id:guid}/mc/content", async (Guid id, AppDbContext db, HttpContext context) =>
{
    var leave = await db.HrLeaveRequests.AsNoTracking().FirstOrDefaultAsync(request => request.Id == id);
    if (leave?.MedicalCertificateDocumentId is null) return Results.NotFound();
    if (!DepartmentAccess.CanAccessHrStaff(context.User, leave.StaffUserId)) return Results.Forbid();
    var document = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == leave.MedicalCertificateDocumentId && item.Category == FileCategory.MedicalCertificate);
    return document is null ? Results.NotFound() : Results.File(document.Content, document.MimeType, document.FileName);
});

hr.MapGet("/leave-balances", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrLeaveBalances.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(balance => balance.StaffUserId == staffUserId);
    }
    return Results.Ok(await query.OrderBy(balance => balance.StaffUserId).ToListAsync());
});

hr.MapGet("/leave-policies", async (AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    return Results.Ok(await db.HrLeavePolicies.AsNoTracking().OrderBy(policy => policy.Role).ToListAsync());
});

hr.MapPut("/leave-policies/{role}", async (string role, HrLeavePolicy policy, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    if (!string.Equals(role, policy.Role, StringComparison.Ordinal)) return Results.BadRequest(ApiErrors.RouteIdMismatch("leave policy"));
    if (!SeedData.Roles.Contains(policy.Role)) return Results.BadRequest(new { message = "Role is not valid for leave policy." });
    var validation = HrRules.ValidateLeavePolicy(policy);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var existing = await db.HrLeavePolicies.FirstOrDefaultAsync(item => item.Role == role);
    if (existing is null) db.HrLeavePolicies.Add(policy);
    else db.Entry(existing).CurrentValues.SetValues(policy);
    ApiAudit.Add(db, context.User, "hr.leavePolicy.updated", nameof(HrLeavePolicy), policy.Id);
    await db.SaveChangesAsync();
    return Results.Ok(policy);
});

hr.MapPut("/leave-balances/{staffUserId}", async (string staffUserId, HrLeaveBalance balance, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    if (staffUserId != balance.StaffUserId) return Results.BadRequest(ApiErrors.RouteIdMismatch("leave balance"));
    var validation = HrRules.ValidateLeaveBalance(balance);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var existing = await db.HrLeaveBalances.FirstOrDefaultAsync(item => item.StaffUserId == staffUserId);
    if (existing is null) db.HrLeaveBalances.Add(balance);
    else db.Entry(existing).CurrentValues.SetValues(balance);
    ApiAudit.Add(db, context.User, "hr.leaveBalance.updated", nameof(HrLeaveBalance), balance.Id);
    await db.SaveChangesAsync();
    return Results.Ok(balance);
});

hr.MapGet("/leave-adjustments", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrLeaveAdjustments.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(adjustment => adjustment.StaffUserId == staffUserId);
    }
    return Results.Ok(await query.OrderByDescending(adjustment => adjustment.CreatedAt).Take(200).ToListAsync());
});

hr.MapPost("/leave-adjustments", async (HrLeaveAdjustmentRequest request, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    var existing = await db.HrLeaveBalances.FirstOrDefaultAsync(item => item.StaffUserId == request.StaffUserId);
    var balance = existing ?? new HrLeaveBalance { StaffUserId = request.StaffUserId, AnnualLeaveDays = 0, MedicalLeaveDays = 0 };
    var adjustment = HrRules.BuildLeaveAdjustment(balance, request, AuditTrail.ActorFrom(context.User));
    var validation = HrRules.ValidateLeaveAdjustment(adjustment);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var updatedBalance = balance with
    {
        AnnualLeaveDays = adjustment.AnnualLeaveAfter,
        MedicalLeaveDays = adjustment.MedicalLeaveAfter,
        Notes = request.Reason
    };
    if (existing is null) db.HrLeaveBalances.Add(updatedBalance);
    else db.Entry(existing).CurrentValues.SetValues(updatedBalance);
    db.HrLeaveAdjustments.Add(adjustment);
    ApiAudit.Add(db, context.User, "hr.leaveAdjustment.created", nameof(HrLeaveAdjustment), adjustment.Id);
    await db.SaveChangesAsync();
    return Results.Ok(new HrLeaveAdjustmentResult(updatedBalance, adjustment));
});

hr.MapGet("/payroll-profiles", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrPayrollProfiles.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(profile => profile.StaffUserId == staffUserId);
    }
    return Results.Ok(await query.OrderBy(profile => profile.StaffUserId).ToListAsync());
});

hr.MapPut("/payroll-profiles/{staffUserId}", async (string staffUserId, HrPayrollProfile profile, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    if (staffUserId != profile.StaffUserId) return Results.BadRequest(ApiErrors.RouteIdMismatch("payroll profile"));
    var validation = HrRules.ValidatePayrollProfile(profile);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var existing = await db.HrPayrollProfiles.FirstOrDefaultAsync(item => item.StaffUserId == staffUserId);
    if (existing is null) db.HrPayrollProfiles.Add(profile);
    else db.Entry(existing).CurrentValues.SetValues(profile);
    ApiAudit.Add(db, context.User, "hr.payrollProfile.updated", nameof(HrPayrollProfile), profile.Id);
    await db.SaveChangesAsync();
    return Results.Ok(profile);
});

hr.MapGet("/pay-periods", async (AppDbContext db) =>
    await db.HrPayPeriods.AsNoTracking().OrderByDescending(period => period.StartDate).ToListAsync());

hr.MapPost("/pay-periods", async (HrPayPeriod period, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    var validation = HrRules.ValidatePayPeriod(period);
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.HrPayPeriods.Add(period);
    ApiAudit.Add(db, context.User, "hr.payPeriod.created", nameof(HrPayPeriod), period.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/hr/pay-periods/{period.Id}", period);
});

hr.MapGet("/payslips", async (AppDbContext db, HttpContext context) =>
{
    var query = db.HrPayslips.AsNoTracking();
    if (!DepartmentAccess.IsHrManager(context.User))
    {
        var staffUserId = StaffIdentity.CurrentUserId(context);
        query = query.Where(payslip => payslip.StaffUserId == staffUserId);
    }
    return Results.Ok(await query.OrderByDescending(payslip => payslip.GeneratedAt).ToListAsync());
});

hr.MapPost("/pay-periods/{id:guid}/generate-payslips", async (Guid id, AppDbContext db, HttpContext context) =>
{
    if (!DepartmentAccess.IsHrManager(context.User)) return Results.Forbid();
    var period = await db.HrPayPeriods.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (period is null) return Results.NotFound();
    var profiles = await db.HrPayrollProfiles.AsNoTracking().ToListAsync();
    var leaves = await db.HrLeaveRequests.AsNoTracking().ToListAsync();
    var generated = new List<HrPayslip>();
    foreach (var profile in profiles)
    {
        var existing = await db.HrPayslips.FirstOrDefaultAsync(payslip => payslip.PayPeriodId == id && payslip.StaffUserId == profile.StaffUserId);
        var payslip = HrRules.GeneratePayslip(profile, period, leaves, existing?.Id);
        if (existing is null) db.HrPayslips.Add(payslip);
        else db.Entry(existing).CurrentValues.SetValues(payslip);
        generated.Add(payslip);
    }
    ApiAudit.Add(db, context.User, "hr.payslips.generated", nameof(HrPayPeriod), period.Id);
    await db.SaveChangesAsync();
    return Results.Ok(generated);
});

backOffice.MapGet("/dashboard/summary", async (AppDbContext db) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    return DashboardMetrics.Create(
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.LoanApplications.AsNoTracking().ToListAsync(),
        await db.DeliverySchedules.AsNoTracking().ToListAsync(),
        await db.PaymentRecords.AsNoTracking().ToListAsync(),
        await db.SettlementReminders.AsNoTracking().ToListAsync(),
        await db.RepairJobs.AsNoTracking().ToListAsync(),
        await db.SupplierInvoices.AsNoTracking().ToListAsync(),
        await db.BrokerCommissions.AsNoTracking().ToListAsync(),
        await db.PaymentVouchers.AsNoTracking().ToListAsync(),
        await db.DailySpends.AsNoTracking().ToListAsync(),
        await db.DebtRecoveryCases.AsNoTracking().ToListAsync(),
        await db.Leads.AsNoTracking().ToListAsync(),
        today);
}).RequireAuthorization("Dashboard");

backOffice.MapGet("/dashboard/reminders", async (AppDbContext db, string? type, string? due) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    if (!ReminderInbox.IsValidDueFilter(due))
    {
        return Results.BadRequest(new { message = "Reminder due filter must be All, Overdue, DueToday, or Upcoming." });
    }

    var reminders = ReminderInbox.Create(
        await db.LoanApplications.AsNoTracking().ToListAsync(),
        await db.DeliverySchedules.AsNoTracking().ToListAsync(),
        await db.SettlementReminders.AsNoTracking().ToListAsync(),
        await db.PaymentRecords.AsNoTracking().ToListAsync(),
        await db.DailySpends.AsNoTracking().ToListAsync(),
        await db.DebtRecoveryCases.AsNoTracking().ToListAsync(),
        await db.PaymentVouchers.AsNoTracking().ToListAsync(),
        await db.Vehicles.AsNoTracking().ToListAsync(),
        today);
    return Results.Ok(ReminderInbox.Filter(reminders, type, due, today));
}).RequireAuthorization("Dashboard");

backOffice.MapGet("/loans/{id:guid}/document-check", async (Guid id, AppDbContext db) =>
{
    var loan = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (loan is null) return Results.NotFound();
    var documents = await db.DocumentBlobs.AsNoTracking().ToListAsync();
    return Results.Ok(LoanDocumentRules.CheckCompleteness(loan, documents));
}).RequireAuthorization("Loans");

backOffice.MapGet("/deliveries/{id:guid}/release-readiness", async (Guid id, AppDbContext db) =>
{
    var delivery = await db.DeliverySchedules.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
    if (delivery is null) return Results.NotFound();
    var documentCheck = DeliveryDocumentRules.CheckCompleteness(delivery, await db.DocumentBlobs.AsNoTracking().ToListAsync());
    var missingEvidence = DeliveryRules.MissingReleaseEvidence(delivery);
    var expiredDocuments = DeliveryRules.ExpiredDeliveryDocuments(delivery);
    return Results.Ok(new
    {
        isReady = DeliveryRules.IsReadyForRelease(delivery) && documentCheck.IsComplete,
        missingCategories = documentCheck.MissingCategories,
        missingEvidence,
        expiredDocuments,
        evidence = documentCheck.Evidence
    });
}).RequireAuthorization("Deliveries");

var seedDataEnabled = app.Configuration.GetValue("SeedData:Enabled", app.Environment.IsDevelopment());
if (RuntimeMode.ShouldSeed(workerEnabled, seedDataEnabled))
{
    await SeedData.SeedAsync(app);
}

app.Run();

public partial class Program;

public sealed record StaffUserResponse(string Id, string Email, string DisplayName, string[] Roles, bool IsActive);

public sealed record CreateStaffUserRequest(string Email, string DisplayName, string Password, string Role);

public sealed record UpdateStaffUserRequest(string DisplayName);

public sealed record ResetStaffPasswordRequest(string Password);

public sealed record UpdateStaffUserStatusRequest(bool IsActive);

public sealed record UpdateStaffUserRolesRequest(string[] Roles);

public sealed record HrLeaveDecisionRequest(HrLeaveStatus Status, string? DecisionNotes);
public sealed record HrLeaveAdjustmentResult(HrLeaveBalance Balance, HrLeaveAdjustment Adjustment);

internal static class StaffIdentity
{
    public static string CurrentUserId(HttpContext context) =>
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
}

public sealed record OcrReviewRequest(OcrReviewDecision Decision, string? Notes);

internal static class StockMovementAudit
{
    public static void AddInitial(AppDbContext db, Vehicle vehicle, System.Security.Claims.ClaimsPrincipal actor, string reason)
    {
        Add(db, vehicle.Id, "Status", "", vehicle.Status.ToString(), actor, reason);
        Add(db, vehicle.Id, "StockOwner", "", vehicle.StockOwner.ToString(), actor, reason);
        Add(db, vehicle.Id, "BossConfirmed", "", vehicle.BossConfirmed.ToString(), actor, reason);
        Add(db, vehicle.Id, "IsPublic", "", vehicle.IsPublic.ToString(), actor, reason);
        if (!string.IsNullOrWhiteSpace(vehicle.StockLocation)) Add(db, vehicle.Id, "StockLocation", "", vehicle.StockLocation, actor, reason);
    }

    public static void AddChanges(AppDbContext db, Vehicle before, Vehicle after, System.Security.Claims.ClaimsPrincipal actor, string reason)
    {
        AddIfChanged(db, after.Id, "Status", before.Status.ToString(), after.Status.ToString(), actor, reason);
        AddIfChanged(db, after.Id, "StockOwner", before.StockOwner.ToString(), after.StockOwner.ToString(), actor, reason);
        AddIfChanged(db, after.Id, "StockLocation", before.StockLocation, after.StockLocation, actor, reason);
        AddIfChanged(db, after.Id, "PlateNumber", before.PlateNumber, after.PlateNumber, actor, reason);
        AddIfChanged(db, after.Id, "ChassisNumber", before.ChassisNumber, after.ChassisNumber, actor, reason);
        AddIfChanged(db, after.Id, "EngineNumber", before.EngineNumber, after.EngineNumber, actor, reason);
        AddIfChanged(db, after.Id, "Make", before.Make, after.Make, actor, reason);
        AddIfChanged(db, after.Id, "Model", before.Model, after.Model, actor, reason);
        AddIfChanged(db, after.Id, "Year", before.Year.ToString(), after.Year.ToString(), actor, reason);
        AddIfChanged(db, after.Id, "BossConfirmed", before.BossConfirmed.ToString(), after.BossConfirmed.ToString(), actor, reason);
        AddIfChanged(db, after.Id, "IsPublic", before.IsPublic.ToString(), after.IsPublic.ToString(), actor, reason);
    }

    private static void AddIfChanged(AppDbContext db, Guid vehicleId, string fieldName, string? previousValue, string? newValue, System.Security.Claims.ClaimsPrincipal actor, string reason)
    {
        if (string.Equals(previousValue ?? "", newValue ?? "", StringComparison.Ordinal)) return;
        Add(db, vehicleId, fieldName, previousValue ?? "", newValue ?? "", actor, reason);
    }

    private static void Add(AppDbContext db, Guid vehicleId, string fieldName, string previousValue, string newValue, System.Security.Claims.ClaimsPrincipal actor, string reason) =>
        db.StockMovements.Add(new StockMovement
        {
            VehicleId = vehicleId,
            FieldName = fieldName,
            PreviousValue = previousValue,
            NewValue = newValue,
            Reason = reason,
            Actor = AuditTrail.ActorFrom(actor)
        });
}

internal static class ApiAudit
{
    public static void Add(AppDbContext db, System.Security.Claims.ClaimsPrincipal actor, string action, string entityName, Guid entityId) =>
        Add(db, AuditTrail.ActorFrom(actor), action, entityName, entityId);

    public static void Add(AppDbContext db, string actor, string action, string entityName, Guid entityId) =>
        db.AuditLogs.Add(AuditTrail.Record(actor, action, entityName, entityId, DateTime.UtcNow));
}

internal static class OcrJobResponses
{
    public static object ToResponse(OcrJob job) => new
    {
        job.Id,
        job.DocumentId,
        job.Category,
        job.Status,
        job.Progress,
        Result = string.IsNullOrWhiteSpace(job.ResultJson) ? null : JsonSerializer.Deserialize<OcrExtractionResult>(job.ResultJson),
        job.Warnings,
        job.CreatedAt,
        job.CompletedAt,
        job.ReviewDecision,
        job.ReviewNotes,
        job.ReviewedBy,
        job.ReviewedAt
    };

    public static object ToVehicleResponse(OcrJob job, DocumentBlob document) => new
    {
        job.Id,
        job.DocumentId,
        job.Category,
        job.Status,
        job.Progress,
        Result = string.IsNullOrWhiteSpace(job.ResultJson) ? null : JsonSerializer.Deserialize<OcrExtractionResult>(job.ResultJson),
        job.Warnings,
        job.CreatedAt,
        job.CompletedAt,
        job.ReviewDecision,
        job.ReviewNotes,
        job.ReviewedBy,
        job.ReviewedAt,
        Document = new
        {
            document.Id,
            document.FileName,
            document.MimeType,
            document.Category,
            document.Checksum,
            document.UploadedBy,
            document.UploadedAt
        }
    };
}
