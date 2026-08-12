var builder = DistributedApplication.CreateBuilder(args);
builder.AddDockerComposeEnvironment("production")
    .WithDashboard(dashboard => dashboard
        .WithHostPort(null)
        .WithForwardedHeaders(true));

var postgresUser = builder.AddParameter("postgres-user", "ysheng", publishValueAsDefault: true);
var postgresPassword = builder.AddParameter("postgres-password", secret: true);
var seedDataEnabled = builder.AddParameter("seed-data-enabled", "true", publishValueAsDefault: true);
var seedAdminEmail = builder.AddParameter("seed-admin-email", "admin@ysheng.local", publishValueAsDefault: true);
var seedAdminPassword = builder.AddParameter("seed-admin-password", secret: true);
var frontOfficeOrigin = builder.AddParameter("frontoffice-origin", "http://localhost:3000", publishValueAsDefault: true);
var backOfficeOrigin = builder.AddParameter("backoffice-origin", "http://localhost:3001", publishValueAsDefault: true);
var publicApiBaseUrl = builder.AddParameter("public-api-base-url", "http://localhost:5000", publishValueAsDefault: true);

var postgres = builder.AddPostgres("postgres", userName: postgresUser, password: postgresPassword)
    .WithImageTag("17")
    .WithDataVolume("postgres_data")
    .WithEnvironment("POSTGRES_DB", "ysheng");
var database = postgres.AddDatabase("ysheng");

var api = builder.AddDockerfile("api", "../../../..", "services/api/src/YSHeng.Api/Dockerfile")
    .WithReference(database, "Default")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Production")
    .WithEnvironment("ASPNETCORE_URLS", "http://+:8080")
    .WithEnvironment("AllowedOrigins__0", frontOfficeOrigin)
    .WithEnvironment("AllowedOrigins__1", backOfficeOrigin)
    .WithEnvironment("SeedData__Enabled", seedDataEnabled)
    .WithEnvironment("SeedAdmin__Email", seedAdminEmail)
    .WithEnvironment("SeedAdmin__Password", seedAdminPassword)
    .WithHttpEndpoint(targetPort: 8080)
    .WithHttpHealthCheck("/health/ready")
    .WaitFor(database);

builder.AddDockerfile("worker", "../../../..", "services/api/src/YSHeng.Api/Dockerfile")
    .WithReference(database, "Default")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Production")
    .WithEnvironment("ASPNETCORE_URLS", "http://+:8080")
    .WithEnvironment("SeedData__Enabled", "false")
    .WithEnvironment("Worker__Enabled", "true")
    .WaitFor(database);

builder.AddDockerfile("frontoffice", "../../../..", "apps/frontoffice/Dockerfile")
    .WithBuildArg("NEXT_PUBLIC_API_BASE_URL", publicApiBaseUrl)
    .WithBuildArg("NEXT_PUBLIC_SITE_URL", frontOfficeOrigin)
    .WithEnvironment("API_BASE_URL", "http://api:8080")
    .WithEnvironment("NEXT_PUBLIC_API_BASE_URL", publicApiBaseUrl)
    .WithEnvironment("NEXT_PUBLIC_SITE_URL", frontOfficeOrigin)
    .WithHttpEndpoint(targetPort: 3000)
    .WithHttpHealthCheck("/")
    .WaitFor(api);

builder.AddDockerfile("backoffice", "../../../..", "apps/backoffice/Dockerfile")
    .WithBuildArg("VITE_API_BASE_URL", publicApiBaseUrl)
    .WithEnvironment("VITE_API_BASE_URL", publicApiBaseUrl)
    .WithHttpEndpoint(targetPort: 3001)
    .WithHttpHealthCheck("/")
    .WaitFor(api);

builder.Build().Run();
