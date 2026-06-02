using System.Security.Cryptography;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

var builder = WebApplication.CreateBuilder(args);
var workerEnabled = builder.Configuration.GetValue("Worker:Enabled", false);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
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
    options.AddPolicy("Sales", policy => policy.RequireRole("BossAdmin", "Sales"));
    options.AddPolicy("CustomerRead", policy => policy.RequireRole(DepartmentAccess.CustomerReaders));
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
app.MapGet("/api/auth/me", (HttpContext context) => Results.Ok(new
{
    isAuthenticated = context.User.Identity?.IsAuthenticated ?? false,
    name = context.User.Identity?.Name,
    roles = context.User.Claims.Where(claim => claim.Type.EndsWith("/role") || claim.Type == "role").Select(claim => claim.Value)
})).RequireAuthorization();

app.MapGet("/api/public/vehicles", async (AppDbContext db) =>
{
    var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
    return Results.Ok(PublicInventory.Filter(vehicles).Select(PublicInventory.ToResponse));
});

app.MapGet("/api/public/vehicles/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id && item.IsPublic && item.Status == VehicleStatus.Available);
    return vehicle is null ? Results.NotFound() : Results.Ok(PublicInventory.ToResponse(vehicle));
});

app.MapGet("/api/public/vehicles/{id:guid}/photo", async (Guid id, AppDbContext db) =>
{
    var isPublicVehicle = await db.Vehicles.AsNoTracking().AnyAsync(item => item.Id == id && item.IsPublic && item.Status == VehicleStatus.Available);
    if (!isPublicVehicle) return Results.NotFound();

    var photo = PublicVehiclePhotos.SelectPrimary(id, await db.VehiclePhotos.AsNoTracking().ToListAsync());
    return photo is null ? Results.NotFound() : Results.File(photo.Bytes, photo.MimeType);
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

var backOffice = app.MapGroup("/api").RequireAuthorization("BackOffice");

backOffice.MapGet("/vehicles", async (AppDbContext db) => await db.Vehicles.AsNoTracking().OrderBy(vehicle => vehicle.PlateNumber).ToListAsync()).RequireAuthorization("Vehicles");
backOffice.MapGet("/vehicle-lookup", async (AppDbContext db) =>
    (await db.Vehicles.AsNoTracking().OrderBy(vehicle => vehicle.PlateNumber).ToListAsync())
        .Select(BackOfficeVehicleLookup.ToResponse)).RequireAuthorization("VehicleRead");
backOffice.MapPost("/vehicles", async (Vehicle vehicle, AppDbContext db, HttpContext context) =>
{
    vehicle = VehicleRules.NormalizeDateTimes(vehicle);
    var validation = VehicleRules.ValidateIntake(vehicle);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var contactLinkValidation = VehicleRules.ValidateContactLinks(
        vehicle,
        await db.Customers.AsNoTracking().ToListAsync(),
        await db.Owners.AsNoTracking().ToListAsync());
    if (!contactLinkValidation.IsValid) return Results.BadRequest(contactLinkValidation);
    var uniquePlateValidation = VehicleRules.ValidateUniquePlate(vehicle, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!uniquePlateValidation.IsValid) return Results.BadRequest(uniquePlateValidation);
    db.Vehicles.Add(vehicle);
    ApiAudit.Add(db, context.User, "vehicle.created", nameof(Vehicle), vehicle.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/vehicles/{vehicle.Id}", vehicle);
}).RequireAuthorization("Vehicles");
backOffice.MapPut("/vehicles/{id:guid}", async (Guid id, Vehicle update, AppDbContext db, HttpContext context) =>
{
    update = VehicleRules.NormalizeDateTimes(update);
    if (id != update.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("vehicle"));
    if (!await db.Vehicles.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = VehicleRules.ValidateIntake(update);
    if (!validation.IsValid) return Results.BadRequest(validation);
    var contactLinkValidation = VehicleRules.ValidateContactLinks(
        update,
        await db.Customers.AsNoTracking().ToListAsync(),
        await db.Owners.AsNoTracking().ToListAsync());
    if (!contactLinkValidation.IsValid) return Results.BadRequest(contactLinkValidation);
    var uniquePlateValidation = VehicleRules.ValidateUniquePlate(update, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!uniquePlateValidation.IsValid) return Results.BadRequest(uniquePlateValidation);
    db.Vehicles.Update(update);
    ApiAudit.Add(db, context.User, "vehicle.updated", nameof(Vehicle), update.Id);
    await db.SaveChangesAsync();
    return Results.Ok(update);
}).RequireAuthorization("Vehicles");

backOffice.MapPost("/vehicles/{id:guid}/photos", async (Guid id, IFormFile file, AppDbContext db, HttpContext context) =>
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
        UploadedBy = UploadMetadata.UploaderFrom(context.User)
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

backOffice.MapPost("/vehicles/{id:guid}/documents", async (Guid id, IFormFile file, FileCategory category, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateVehicleLink(id, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var categoryValidation = UploadPolicy.ValidateDocumentCategory(category);
    if (!categoryValidation.IsValid) return Results.BadRequest(categoryValidation);
    var roles = SeedData.Roles.Where(context.User.IsInRole);
    if (!DepartmentAccess.CanUploadDocument(roles, category)) return Results.Forbid();
    if (!UploadPolicy.IsAllowed(category, file.Length)) return Results.BadRequest(new { message = "Document exceeds 10MB limit." });
    await using var stream = file.OpenReadStream();
    using var memory = new MemoryStream();
    await stream.CopyToAsync(memory);
    var bytes = memory.ToArray();
    var document = new DocumentBlob
    {
        VehicleId = id,
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
    return Results.Created($"/api/documents/{document.Id}", new { document.Id, document.FileName, document.Category, document.Checksum, document.UploadedBy });
}).DisableAntiforgery();

backOffice.MapGet("/vehicles/{id:guid}/documents", async (Guid id, AppDbContext db) =>
    await db.DocumentBlobs.AsNoTracking()
        .Where(document => document.VehicleId == id)
        .OrderByDescending(document => document.UploadedAt)
        .Select(document => new { document.Id, document.FileName, document.MimeType, document.Category, document.Checksum, document.UploadedBy, document.UploadedAt })
        .ToListAsync());

backOffice.MapGet("/vehicles/{id:guid}/documents/{documentId:guid}/content", async (Guid id, Guid documentId, AppDbContext db) =>
{
    var document = await db.DocumentBlobs.AsNoTracking().FirstOrDefaultAsync(item => item.Id == documentId && item.VehicleId == id);
    return document is null ? Results.NotFound() : Results.File(document.Content, document.MimeType, document.FileName);
});

backOffice.MapGet("/customers", async (AppDbContext db) => await db.Customers.AsNoTracking().OrderBy(customer => customer.Name).ToListAsync()).RequireAuthorization("CustomerRead");
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
    var validation = WorkflowReferenceRules.ValidateLoan(
        loan,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == loan.VehicleId);
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyLoanStatus(vehicle, loan));
    db.LoanApplications.Add(loan);
    ApiAudit.Add(db, context.User, "loan.created", nameof(LoanApplication), loan.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/loans/{loan.Id}", loan);
}).RequireAuthorization("Loans");
backOffice.MapPut("/loans/{id:guid}", async (Guid id, LoanApplication loan, AppDbContext db, HttpContext context) =>
{
    if (id != loan.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("loan"));
    if (!await db.LoanApplications.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = WorkflowReferenceRules.ValidateLoan(
        loan,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == loan.VehicleId);
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyLoanStatus(vehicle, loan));
    db.LoanApplications.Update(loan);
    ApiAudit.Add(db, context.User, "loan.updated", nameof(LoanApplication), loan.Id);
    await db.SaveChangesAsync();
    return Results.Ok(loan);
}).RequireAuthorization("Loans");

backOffice.MapGet("/deliveries", async (AppDbContext db) => await db.DeliverySchedules.AsNoTracking().ToListAsync()).RequireAuthorization("Deliveries");
backOffice.MapPost("/deliveries", async (DeliverySchedule delivery, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateVehicleLink(delivery.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
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
    var validation = WorkflowReferenceRules.ValidateVehicleLink(delivery.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
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
    if (!await db.RepairJobs.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = WorkflowReferenceRules.ValidateVehicleLink(repair.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var repairValidation = RepairRules.Validate(repair);
    if (!repairValidation.IsValid) return Results.BadRequest(repairValidation);
    db.RepairJobs.Update(repair);
    ApiAudit.Add(db, context.User, "repair.updated", nameof(RepairJob), repair.Id);
    await db.SaveChangesAsync();
    return Results.Ok(repair);
}).RequireAuthorization("Repairs");

backOffice.MapGet("/supplier-invoices", async (AppDbContext db) => await db.SupplierInvoices.AsNoTracking().ToListAsync()).RequireAuthorization("Repairs");
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

backOffice.MapGet("/payments", async (AppDbContext db) => await db.PaymentRecords.AsNoTracking().ToListAsync()).RequireAuthorization("Finance");
backOffice.MapPost("/payments", async (PaymentRecord payment, AppDbContext db, HttpContext context) =>
{
    var validation = WorkflowReferenceRules.ValidateVehicleLink(payment.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var existingPayments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var financeValidation = FinanceRules.ValidatePayment(payment, existingPayments);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == payment.VehicleId);
    var vehiclePayments = existingPayments
        .Where(item => item.VehicleId == payment.VehicleId && item.Id != payment.Id)
        .ToList();
    vehiclePayments.Add(payment);
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyPaymentStatus(vehicle, vehiclePayments));
    db.PaymentRecords.Add(payment);
    ApiAudit.Add(db, context.User, "payment.created", nameof(PaymentRecord), payment.Id);
    await db.SaveChangesAsync();
    return Results.Created($"/api/payments/{payment.Id}", payment);
}).RequireAuthorization("Finance");
backOffice.MapPut("/payments/{id:guid}", async (Guid id, PaymentRecord payment, AppDbContext db, HttpContext context) =>
{
    if (id != payment.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("payment"));
    if (!await db.PaymentRecords.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = WorkflowReferenceRules.ValidateVehicleLink(payment.VehicleId, await db.Vehicles.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    var existingPayments = await db.PaymentRecords.AsNoTracking().ToListAsync();
    var financeValidation = FinanceRules.ValidatePayment(payment, existingPayments);
    if (!financeValidation.IsValid) return Results.BadRequest(financeValidation);
    var vehicle = await db.Vehicles.FirstAsync(item => item.Id == payment.VehicleId);
    var vehiclePayments = existingPayments
        .Where(item => item.VehicleId == payment.VehicleId && item.Id != payment.Id)
        .ToList();
    vehiclePayments.Add(payment);
    db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyPaymentStatus(vehicle, vehiclePayments));
    db.PaymentRecords.Update(payment);
    ApiAudit.Add(db, context.User, "payment.updated", nameof(PaymentRecord), payment.Id);
    await db.SaveChangesAsync();
    return Results.Ok(payment);
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
backOffice.MapPut("/leads/{id:guid}", async (Guid id, Lead lead, AppDbContext db, HttpContext context) =>
{
    if (id != lead.Id) return Results.BadRequest(ApiErrors.RouteIdMismatch("lead"));
    if (!await db.Leads.AnyAsync(item => item.Id == id)) return Results.NotFound();
    var validation = LeadRules.ValidateBackOfficeLead(
        lead,
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.Customers.AsNoTracking().ToListAsync());
    if (!validation.IsValid) return Results.BadRequest(validation);
    db.Leads.Update(lead);
    ApiAudit.Add(db, context.User, "lead.updated", nameof(Lead), lead.Id);
    await db.SaveChangesAsync();
    return Results.Ok(lead);
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

    var currentRoles = await userManager.GetRolesAsync(user);
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

    ApiAudit.Add(db, context.User, "staffUser.rolesUpdated", nameof(AppUser), Guid.NewGuid());
    await db.SaveChangesAsync();
    return Results.Ok(new StaffUserResponse(user.Id, user.Email ?? "", user.DisplayName, roles, user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.UtcNow));
});

backOffice.MapGet("/dashboard/summary", async (AppDbContext db) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    return DashboardMetrics.Create(
        await db.Vehicles.AsNoTracking().ToListAsync(),
        await db.LoanApplications.AsNoTracking().ToListAsync(),
        await db.PaymentRecords.AsNoTracking().ToListAsync(),
        await db.SettlementReminders.AsNoTracking().ToListAsync(),
        await db.RepairJobs.AsNoTracking().ToListAsync(),
        await db.SupplierInvoices.AsNoTracking().ToListAsync(),
        await db.BrokerCommissions.AsNoTracking().ToListAsync(),
        await db.PaymentVouchers.AsNoTracking().ToListAsync(),
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
    return Results.Ok(new { isReady = DeliveryRules.IsReadyForRelease(delivery) && documentCheck.IsComplete, missingCategories = documentCheck.MissingCategories });
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

internal static class ApiAudit
{
    public static void Add(AppDbContext db, System.Security.Claims.ClaimsPrincipal actor, string action, string entityName, Guid entityId) =>
        Add(db, AuditTrail.ActorFrom(actor), action, entityName, entityId);

    public static void Add(AppDbContext db, string actor, string action, string entityName, Guid entityId) =>
        db.AuditLogs.Add(AuditTrail.Record(actor, action, entityName, entityId, DateTime.UtcNow));
}
