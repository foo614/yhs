FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/api/src/YSHeng.Api/YSHeng.Api.csproj services/api/src/YSHeng.Api/
RUN dotnet restore services/api/src/YSHeng.Api/YSHeng.Api.csproj
COPY services/api/src/YSHeng.Api services/api/src/YSHeng.Api
RUN dotnet publish services/api/src/YSHeng.Api/YSHeng.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "YSHeng.Api.dll"]
