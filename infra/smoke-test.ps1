param(
  [string]$ApiBaseUrl = "http://localhost:5000",
  [string]$FrontOfficeUrl = "http://localhost:3000",
  [string]$BackOfficeUrl = "http://localhost:3001",
  [string]$AdminEmail = "admin@ysheng.local",
  [string]$AdminPassword = "ChangeMe123!"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Drawing

function Assert-HttpOk {
  param([string]$Url, [string]$Name)
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Name returned HTTP $($response.StatusCode)"
  }
  Write-Host "$Name OK: $Url"
  return $response
}

function Assert-HttpStatus {
  param(
    [string]$Url,
    [string]$Name,
    [int]$ExpectedStatus,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session
  )

  try {
    $requestParams = @{
      Uri = $Url
      UseBasicParsing = $true
    }
    if ($Session) {
      $requestParams.WebSession = $Session
    }
    $response = Invoke-WebRequest @requestParams
    $actualStatus = [int]$response.StatusCode
  }
  catch {
    if ($_.Exception.Response) {
      $actualStatus = [int]$_.Exception.Response.StatusCode
    }
    else {
      throw
    }
  }

  if ($actualStatus -ne $ExpectedStatus) {
    throw "$Name returned HTTP $actualStatus, expected HTTP $ExpectedStatus"
  }
  Write-Host "$Name OK: HTTP $ExpectedStatus"
}

function Assert-ResponseHeader {
  param(
    [object]$Response,
    [string]$HeaderName,
    [string]$ExpectedValue
  )

  $actualValue = ($Response.Headers[$HeaderName] -join ",")
  if ($actualValue -ne $ExpectedValue) {
    throw "Response header $HeaderName was '$actualValue', expected '$ExpectedValue'"
  }
}

function Assert-CorsPreflight {
  param(
    [string]$Url,
    [string]$Origin,
    [string]$Method
  )

  $response = Invoke-WebRequest `
    -Uri $Url `
    -Method Options `
    -Headers @{
      Origin = $Origin
      "Access-Control-Request-Method" = $Method
      "Access-Control-Request-Headers" = "content-type"
    } `
    -UseBasicParsing

  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "CORS preflight returned HTTP $($response.StatusCode)"
  }
  Assert-ResponseHeader $response "Access-Control-Allow-Origin" $Origin
  Assert-ResponseHeader $response "Access-Control-Allow-Credentials" "true"
}

function Get-DashboardTotalProfit {
  param([string]$DashboardJson)

  $summary = $DashboardJson | ConvertFrom-Json
  if ($null -eq $summary.totalProfit) {
    throw "Dashboard summary did not return totalProfit"
  }
  if ([decimal]$summary.totalProfit -ne [decimal]$summary.estimatedProfit) {
    throw "Dashboard summary totalProfit did not match estimatedProfit"
  }
  return [decimal]$summary.totalProfit
}

function Invoke-MultipartUpload {
  param(
    [string]$Url,
    [string]$FileName,
    [string]$ContentType,
    [byte[]]$Content,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session
  )

  $targetUri = [Uri]::new($Url)
  $cookies = [System.Net.CookieContainer]::new()
  foreach ($cookie in $Session.Cookies.GetCookies($targetUri)) {
    $cookies.Add($targetUri, $cookie)
  }
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.CookieContainer = $cookies
  $client = [System.Net.Http.HttpClient]::new($handler)
  $multipart = [System.Net.Http.MultipartFormDataContent]::new()
  $fileContent = [System.Net.Http.ByteArrayContent]::new($Content)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ContentType)
  $multipart.Add($fileContent, "file", $FileName)

  try {
    $response = $client.PostAsync($targetUri, $multipart).GetAwaiter().GetResult()
    $responseContent = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Content = $responseContent
    }
  }
  finally {
    $multipart.Dispose()
    $client.Dispose()
    $handler.Dispose()
  }
}

function New-SmokePngBytes {
  $bitmap = [System.Drawing.Bitmap]::new(8, 8)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $stream = [System.IO.MemoryStream]::new()

  try {
    $graphics.Clear([System.Drawing.Color]::SteelBlue)
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return $stream.ToArray()
  }
  finally {
    $stream.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Get-Sha256Hex {
  param([byte[]]$Content)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [System.BitConverter]::ToString($sha256.ComputeHash($Content)).Replace("-", "")
  }
  finally {
    $sha256.Dispose()
  }
}

function New-UnicodeText {
  param([int[]]$CodePoints)
  return -join ($CodePoints | ForEach-Object { [char]$_ })
}

$health = Assert-HttpOk "$ApiBaseUrl/health" "API health"
if ($health.Content -notmatch "YS Heng API") {
  throw "API health response did not identify YS Heng API"
}
Assert-ResponseHeader $health "X-Content-Type-Options" "nosniff"
Assert-ResponseHeader $health "X-Frame-Options" "DENY"
Assert-ResponseHeader $health "Referrer-Policy" "no-referrer"
Assert-ResponseHeader $health "Permissions-Policy" "camera=(), microphone=(), geolocation=()"
Write-Host "API defensive security headers OK"
Assert-CorsPreflight "$ApiBaseUrl/api/auth/me" $BackOfficeUrl "GET"
Write-Host "API back-office credentialed CORS preflight OK"

$readiness = Assert-HttpOk "$ApiBaseUrl/health/ready" "API readiness"
$readinessPayload = $readiness.Content | ConvertFrom-Json
$readinessStatus = $readinessPayload.status
if ([string]::IsNullOrWhiteSpace($readinessStatus)) {
  $readinessStatus = $readinessPayload.Status
}
$databaseConnected = $readinessPayload.databaseConnected
if ($null -eq $databaseConnected) {
  $databaseConnected = $readinessPayload.DatabaseConnected
}
if ($readinessStatus -ne "ready" -or $databaseConnected -ne $true) {
  throw "API readiness did not report ready PostgreSQL connectivity"
}
Write-Host "API readiness PostgreSQL connectivity OK"

$vehicles = Assert-HttpOk "$ApiBaseUrl/api/public/vehicles" "Public vehicle API"
if ($vehicles.Content -notmatch "VPK1234") {
  throw "Public vehicle API did not return seeded vehicle VPK1234"
}
if ($vehicles.Content -match "purchasePrice" -or $vehicles.Content -match "refurbishmentTotal" -or $vehicles.Content -match "commissionTotal" -or $vehicles.Content -match "isPublic" -or $vehicles.Content -match "bossConfirmed" -or $vehicles.Content -match "contraRangePrice" -or $vehicles.Content -match "ucdStatus") {
  throw "Public vehicle API leaked internal inventory fields"
}
$vehicleList = $vehicles.Content | ConvertFrom-Json
$leadVehicleId = $vehicleList[0].id
if ([string]::IsNullOrWhiteSpace($leadVehicleId)) {
  throw "Public vehicle API did not return a usable vehicle id"
}
$vehicleDetail = Assert-HttpOk "$ApiBaseUrl/api/public/vehicles/$leadVehicleId" "Public vehicle detail API"
if ($vehicleDetail.Content -notmatch "VPK1234") {
  throw "Public vehicle detail API did not return seeded vehicle VPK1234"
}
if ($vehicleDetail.Content -match "purchasePrice" -or $vehicleDetail.Content -match "refurbishmentTotal" -or $vehicleDetail.Content -match "commissionTotal" -or $vehicleDetail.Content -match "isPublic" -or $vehicleDetail.Content -match "bossConfirmed" -or $vehicleDetail.Content -match "contraRangePrice" -or $vehicleDetail.Content -match "ucdStatus") {
  throw "Public vehicle detail API leaked internal inventory fields"
}

$front = Assert-HttpOk $FrontOfficeUrl "Front office"
if ($front.Content -notmatch "YS Heng") {
  throw "Front office did not render YS Heng content"
}
$frontDetail = Assert-HttpOk "$FrontOfficeUrl/vehicles/$leadVehicleId" "Front office vehicle detail"
if ($frontDetail.Content -notmatch "VPK1234") {
  throw "Front office vehicle detail did not render the seeded vehicle"
}
$frontFilteredInventory = Assert-HttpOk "$FrontOfficeUrl/vehicles?make=Toyota&model=Vios&minYear=2020&maxYear=2022&maxPrice=60000&stockOwner=YSHeng&sort=price-asc" "Front office filtered inventory"
if ($frontFilteredInventory.Content -notmatch "VPK1234" -or $frontFilteredInventory.Content -match "No vehicles match") {
  throw "Front office filtered inventory did not apply make/model/year/price/owner/sort filters to the seeded vehicle"
}
Write-Host "Front office filtered inventory OK"

$frontZh = Assert-HttpOk "$FrontOfficeUrl/?lang=zh" "Front office Chinese home"
$zhHomeTitle = New-UnicodeText @(23547, 25214, 20320, 30340, 19979, 19968, 36742)
$zhBuyCar = New-UnicodeText @(20080, 36710)
if ($frontZh.Content -notmatch $zhHomeTitle -or $frontZh.Content -notmatch $zhBuyCar) {
  throw "Front office Chinese home did not render bilingual public copy"
}
$frontInventoryZh = Assert-HttpOk "$FrontOfficeUrl/vehicles?lang=zh" "Front office Chinese inventory"
$zhInventoryTitle = New-UnicodeText @(20108, 25163, 36710, 24211, 23384)
$zhViewDetails = New-UnicodeText @(26597, 30475, 35814, 24773)
if ($frontInventoryZh.Content -notmatch $zhInventoryTitle -or $frontInventoryZh.Content -notmatch $zhViewDetails -or $frontInventoryZh.Content -notmatch "VPK1234") {
  throw "Front office Chinese inventory did not render seeded vehicle and Chinese listing copy"
}
$frontDetailZh = Assert-HttpOk "$FrontOfficeUrl/vehicles/${leadVehicleId}?lang=zh" "Front office Chinese vehicle detail"
$zhDetailTitle = New-UnicodeText @(20108, 25163, 36710, 35814, 24773)
$zhLeadTitle = New-UnicodeText @(35810, 38382, 36710, 36742)
if ($frontDetailZh.Content -notmatch $zhDetailTitle -or $frontDetailZh.Content -notmatch $zhLeadTitle -or $frontDetailZh.Content -notmatch "VPK1234") {
  throw "Front office Chinese vehicle detail did not render seeded vehicle and Chinese enquiry copy"
}
Write-Host "Front office Chinese bilingual pages OK"

$back = Assert-HttpOk $BackOfficeUrl "Back office"
if ($back.Content -notmatch "YS Heng Portal") {
  throw "Back office did not render portal shell"
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
$login = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/login?useCookies=true" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($login.StatusCode -lt 200 -or $login.StatusCode -ge 300) {
  throw "Admin login returned HTTP $($login.StatusCode)"
}
Write-Host "Admin login OK: $AdminEmail"

$me = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/me" -WebSession $session -UseBasicParsing
if ($me.Content -notmatch "BossAdmin") {
  throw "Authenticated user did not include BossAdmin role"
}
Write-Host "Authenticated admin role OK"

$dashboard = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
if ($dashboard.Content -notmatch "totalStock") {
  throw "Dashboard summary did not return expected metrics"
}
$dashboardContent = $dashboard.Content | ConvertFrom-Json
if ($null -eq $dashboardContent.agingBuckets -or $dashboardContent.agingBuckets.Count -ne 3 -or -not ($dashboardContent.agingBuckets | Where-Object { $_.label -eq "61+" -and $_.count -eq $dashboardContent.vehicleAging })) {
  throw "Dashboard summary did not return expected vehicle aging buckets"
}
[void](Get-DashboardTotalProfit $dashboard.Content)
Write-Host "Protected dashboard API OK"

$roleSuffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$salesEmail = "smoke.sales.$roleSuffix@ysheng.local"
$salesPassword = "ChangeMe123!"
$salesUserBody = @{
  email = $salesEmail
  displayName = "Smoke Sales"
  password = $salesPassword
  role = "Sales"
} | ConvertTo-Json
$salesUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users" -Method Post -Body $salesUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($salesUser.StatusCode -lt 200 -or $salesUser.StatusCode -ge 300) {
  throw "Sales staff creation returned HTTP $($salesUser.StatusCode)"
}
$createdSalesUser = $salesUser.Content | ConvertFrom-Json

$updatedSalesUserBody = @{
  displayName = "Smoke Sales Lead"
} | ConvertTo-Json
$updatedSalesUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)" -Method Put -Body $updatedSalesUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedSalesUser.StatusCode -lt 200 -or $updatedSalesUser.StatusCode -ge 300) {
  throw "Sales staff update returned HTTP $($updatedSalesUser.StatusCode)"
}
$updatedSalesUserContent = $updatedSalesUser.Content | ConvertFrom-Json
if ($updatedSalesUserContent.displayName -ne "Smoke Sales Lead" -or $updatedSalesUserContent.email -ne $salesEmail -or -not ($updatedSalesUserContent.roles -contains "Sales")) {
  throw "Sales staff update did not preserve expected staff profile fields"
}
Write-Host "Staff user update OK"

$salesPassword = "SmokeReset123!"
$resetSalesPasswordBody = @{
  password = $salesPassword
} | ConvertTo-Json
$resetSalesPassword = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)/password" -Method Put -Body $resetSalesPasswordBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($resetSalesPassword.StatusCode -lt 200 -or $resetSalesPassword.StatusCode -ge 300) {
  throw "Sales staff password reset returned HTTP $($resetSalesPassword.StatusCode)"
}
$resetSalesPasswordContent = $resetSalesPassword.Content | ConvertFrom-Json
if ($resetSalesPasswordContent.email -ne $salesEmail -or -not ($resetSalesPasswordContent.roles -contains "Sales")) {
  throw "Sales staff password reset did not preserve expected staff profile fields"
}
Write-Host "Staff password reset OK"

$disableSalesUserBody = @{
  isActive = $false
} | ConvertTo-Json
$disabledSalesUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)/status" -Method Put -Body $disableSalesUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($disabledSalesUser.StatusCode -lt 200 -or $disabledSalesUser.StatusCode -ge 300) {
  throw "Sales staff disable returned HTTP $($disabledSalesUser.StatusCode)"
}
$disabledSalesUserContent = $disabledSalesUser.Content | ConvertFrom-Json
if ($disabledSalesUserContent.isActive -ne $false) {
  throw "Sales staff disable did not return inactive staff status"
}

$disabledSalesSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$disabledSalesLoginBody = @{ email = $salesEmail; password = $salesPassword } | ConvertTo-Json
try {
  $disabledSalesLogin = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/login?useCookies=true" -Method Post -Body $disabledSalesLoginBody -ContentType "application/json" -WebSession $disabledSalesSession -UseBasicParsing
  $disabledSalesLoginStatus = [int]$disabledSalesLogin.StatusCode
}
catch {
  if ($_.Exception.Response) {
    $disabledSalesLoginStatus = [int]$_.Exception.Response.StatusCode
  }
  else {
    throw
  }
}
if ($disabledSalesLoginStatus -lt 400) {
  throw "Disabled sales staff login returned HTTP $disabledSalesLoginStatus instead of an authentication failure"
}

$enableSalesUserBody = @{
  isActive = $true
} | ConvertTo-Json
$enabledSalesUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)/status" -Method Put -Body $enableSalesUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($enabledSalesUser.StatusCode -lt 200 -or $enabledSalesUser.StatusCode -ge 300) {
  throw "Sales staff enable returned HTTP $($enabledSalesUser.StatusCode)"
}
$enabledSalesUserContent = $enabledSalesUser.Content | ConvertFrom-Json
if ($enabledSalesUserContent.isActive -ne $true) {
  throw "Sales staff enable did not return active staff status"
}
Write-Host "Staff status toggle OK"

$financeEmail = "smoke.finance.$roleSuffix@ysheng.local"
$financePassword = "ChangeMe123!"
$financeUserBody = @{
  email = $financeEmail
  displayName = "Smoke Finance"
  password = $financePassword
  role = "Finance"
} | ConvertTo-Json
$financeUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users" -Method Post -Body $financeUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($financeUser.StatusCode -lt 200 -or $financeUser.StatusCode -ge 300) {
  throw "Finance staff creation returned HTTP $($financeUser.StatusCode)"
}

$hrEmail = "smoke.hr.$roleSuffix@ysheng.local"
$hrPassword = "ChangeMe123!"
$hrUserBody = @{
  email = $hrEmail
  displayName = "Smoke HR Salary"
  password = $hrPassword
  role = "HrSalary"
} | ConvertTo-Json
$hrUser = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users" -Method Post -Body $hrUserBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($hrUser.StatusCode -lt 200 -or $hrUser.StatusCode -ge 300) {
  throw "HR/Salary staff creation returned HTTP $($hrUser.StatusCode)"
}

$invalidStaffBody = @{
  email = ""
  displayName = " "
  password = ""
  role = "Unknown"
} | ConvertTo-Json
try {
  $invalidStaff = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users" -Method Post -Body $invalidStaffBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidStaffStatus = [int]$invalidStaff.StatusCode
  $invalidStaffContent = $invalidStaff.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidStaffStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidStaffContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidStaffStatus -ne 400 -or $invalidStaffContent -notmatch "staff_email_required" -or $invalidStaffContent -notmatch "staff_display_name_required" -or $invalidStaffContent -notmatch "staff_password_required" -or $invalidStaffContent -notmatch "staff_role_invalid") {
  throw "Invalid staff user returned HTTP $invalidStaffStatus instead of structured staff validation errors"
}
Write-Host "Staff user validation OK"

$invalidStaffUpdateBody = @{
  displayName = " "
} | ConvertTo-Json
try {
  $invalidStaffUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)" -Method Put -Body $invalidStaffUpdateBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidStaffUpdateStatus = [int]$invalidStaffUpdate.StatusCode
  $invalidStaffUpdateContent = $invalidStaffUpdate.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidStaffUpdateStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidStaffUpdateContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidStaffUpdateStatus -ne 400 -or $invalidStaffUpdateContent -notmatch "staff_display_name_required") {
  throw "Invalid staff user update returned HTTP $invalidStaffUpdateStatus instead of staff_display_name_required validation"
}
Write-Host "Staff user update validation OK"

$invalidStaffPasswordResetBody = @{
  password = "short"
} | ConvertTo-Json
try {
  $invalidStaffPasswordReset = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)/password" -Method Put -Body $invalidStaffPasswordResetBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidStaffPasswordResetStatus = [int]$invalidStaffPasswordReset.StatusCode
  $invalidStaffPasswordResetContent = $invalidStaffPasswordReset.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidStaffPasswordResetStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidStaffPasswordResetContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidStaffPasswordResetStatus -ne 400 -or $invalidStaffPasswordResetContent -notmatch "staff_password_too_short") {
  throw "Invalid staff password reset returned HTTP $invalidStaffPasswordResetStatus instead of staff_password_too_short validation"
}
Write-Host "Staff password reset validation OK"

$invalidStaffRoleUpdateBody = @{
  roles = @()
} | ConvertTo-Json
try {
  $invalidStaffRoleUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/admin/users/$($createdSalesUser.id)/roles" -Method Put -Body $invalidStaffRoleUpdateBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidStaffRoleUpdateStatus = [int]$invalidStaffRoleUpdate.StatusCode
  $invalidStaffRoleUpdateContent = $invalidStaffRoleUpdate.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidStaffRoleUpdateStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidStaffRoleUpdateContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidStaffRoleUpdateStatus -ne 400 -or $invalidStaffRoleUpdateContent -notmatch "staff_roles_required") {
  throw "Invalid staff role update returned HTTP $invalidStaffRoleUpdateStatus instead of staff_roles_required validation"
}
Write-Host "Staff role update validation OK"

$salesSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$salesLoginBody = @{ email = $salesEmail; password = $salesPassword } | ConvertTo-Json
$salesLogin = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/login?useCookies=true" -Method Post -Body $salesLoginBody -ContentType "application/json" -WebSession $salesSession -UseBasicParsing
if ($salesLogin.StatusCode -lt 200 -or $salesLogin.StatusCode -ge 300) {
  throw "Sales login returned HTTP $($salesLogin.StatusCode)"
}
$salesMe = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/me" -WebSession $salesSession -UseBasicParsing
if ($salesMe.Content -notmatch "Sales") {
  throw "Authenticated sales user did not include Sales role"
}
Assert-HttpStatus "$ApiBaseUrl/api/vehicles" "Sales role vehicle access" 200 $salesSession
Assert-HttpStatus "$ApiBaseUrl/api/payments" "Sales role finance restriction" 403 $salesSession

$financeSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$financeLoginBody = @{ email = $financeEmail; password = $financePassword } | ConvertTo-Json
$financeLogin = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/login?useCookies=true" -Method Post -Body $financeLoginBody -ContentType "application/json" -WebSession $financeSession -UseBasicParsing
if ($financeLogin.StatusCode -lt 200 -or $financeLogin.StatusCode -ge 300) {
  throw "Finance login returned HTTP $($financeLogin.StatusCode)"
}
$financeMe = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/me" -WebSession $financeSession -UseBasicParsing
if ($financeMe.Content -notmatch "Finance") {
  throw "Authenticated finance user did not include Finance role"
}
Assert-HttpStatus "$ApiBaseUrl/api/payments" "Finance role payment access" 200 $financeSession
Assert-HttpStatus "$ApiBaseUrl/api/customers" "Finance role customer lookup access" 200 $financeSession
Assert-HttpStatus "$ApiBaseUrl/api/owners" "Finance role owner lookup access" 200 $financeSession

$hrSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$hrLoginBody = @{ email = $hrEmail; password = $hrPassword } | ConvertTo-Json
$hrLogin = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/login?useCookies=true" -Method Post -Body $hrLoginBody -ContentType "application/json" -WebSession $hrSession -UseBasicParsing
if ($hrLogin.StatusCode -lt 200 -or $hrLogin.StatusCode -ge 300) {
  throw "HR/Salary login returned HTTP $($hrLogin.StatusCode)"
}
$hrMe = Invoke-WebRequest -Uri "$ApiBaseUrl/api/auth/me" -WebSession $hrSession -UseBasicParsing
if ($hrMe.Content -notmatch "HrSalary") {
  throw "Authenticated HR/Salary user did not include HrSalary role"
}
Assert-HttpStatus "$ApiBaseUrl/api/vehicles" "HR/Salary role vehicle restriction" 403 $hrSession
Assert-HttpStatus "$ApiBaseUrl/api/payments" "HR/Salary role finance restriction" 403 $hrSession
Assert-HttpStatus "$ApiBaseUrl/api/dashboard/summary" "HR/Salary role dashboard restriction" 403 $hrSession

$leadPhone = "SMOKE-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$leadBody = @{
  vehicleId = $leadVehicleId
  customerName = "Smoke Test Lead"
  phone = $leadPhone
  message = "Smoke test enquiry from public website"
} | ConvertTo-Json
$lead = Invoke-WebRequest -Uri "$ApiBaseUrl/api/public/leads" -Method Post -Body $leadBody -ContentType "application/json" -UseBasicParsing
if ($lead.StatusCode -lt 200 -or $lead.StatusCode -ge 300) {
  throw "Public lead creation returned HTTP $($lead.StatusCode)"
}
Write-Host "Public lead creation OK"
$createdLead = $lead.Content | ConvertFrom-Json

$invalidLeadBody = @{
  vehicleId = $leadVehicleId
  customerName = " "
  phone = ""
  message = "Invalid smoke test enquiry"
} | ConvertTo-Json
try {
  $invalidLead = Invoke-WebRequest -Uri "$ApiBaseUrl/api/public/leads" -Method Post -Body $invalidLeadBody -ContentType "application/json" -UseBasicParsing
  $invalidLeadStatus = [int]$invalidLead.StatusCode
  $invalidLeadContent = $invalidLead.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidLeadStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidLeadContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidLeadStatus -ne 400 -or $invalidLeadContent -notmatch "customer_name_required" -or $invalidLeadContent -notmatch "phone_required") {
  throw "Invalid public lead returned HTTP $invalidLeadStatus instead of structured validation errors"
}
Write-Host "Invalid public lead validation OK"

$invalidLeadUpdateBody = @{
  id = $createdLead.id
  vehicleId = $leadVehicleId
  customerName = " "
  phone = ""
  message = "Invalid back-office lead update"
  status = "Contacted"
  createdAt = $createdLead.createdAt
} | ConvertTo-Json
try {
  $invalidLeadUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/leads/$($createdLead.id)" -Method Put -Body $invalidLeadUpdateBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidLeadUpdateStatus = [int]$invalidLeadUpdate.StatusCode
  $invalidLeadUpdateContent = $invalidLeadUpdate.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidLeadUpdateStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidLeadUpdateContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidLeadUpdateStatus -ne 400 -or $invalidLeadUpdateContent -notmatch "customer_name_required" -or $invalidLeadUpdateContent -notmatch "phone_required") {
  throw "Invalid back-office lead update returned HTTP $invalidLeadUpdateStatus instead of structured validation errors"
}
Write-Host "Back-office lead validation OK"

$leadCustomerId = [guid]::NewGuid().ToString()
$leadCustomerBody = @{
  id = $leadCustomerId
  name = $createdLead.customerName
  phone = $createdLead.phone
  email = "lead.$roleSuffix@ysheng.local"
} | ConvertTo-Json
$leadCustomer = Invoke-WebRequest -Uri "$ApiBaseUrl/api/customers" -Method Post -Body $leadCustomerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($leadCustomer.StatusCode -lt 200 -or $leadCustomer.StatusCode -ge 300) {
  throw "Lead customer creation returned HTTP $($leadCustomer.StatusCode)"
}

$linkedLeadBody = @{
  id = $createdLead.id
  vehicleId = $leadVehicleId
  customerId = $leadCustomerId
  customerName = $createdLead.customerName
  phone = $createdLead.phone
  message = $createdLead.message
  status = "Contacted"
  createdAt = $createdLead.createdAt
} | ConvertTo-Json
$linkedLead = Invoke-WebRequest -Uri "$ApiBaseUrl/api/leads/$($createdLead.id)" -Method Put -Body $linkedLeadBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($linkedLead.StatusCode -lt 200 -or $linkedLead.StatusCode -ge 300) {
  throw "Lead customer linking returned HTTP $($linkedLead.StatusCode)"
}
$linkedLeadRecord = $linkedLead.Content | ConvertFrom-Json
if ($linkedLeadRecord.customerId -ne $leadCustomerId -or $linkedLeadRecord.status -ne "Contacted") {
  throw "Back-office lead did not preserve linked customer id and contacted status"
}
Write-Host "Back-office lead customer linking OK"

$correctedLeadBody = @{
  id = $createdLead.id
  vehicleId = $leadVehicleId
  customerId = $leadCustomerId
  customerName = "Smoke Lead Corrected"
  phone = "$leadPhone-EDIT"
  message = "Corrected back-office lead note"
  status = "New"
  createdAt = $createdLead.createdAt
} | ConvertTo-Json
$correctedLead = Invoke-WebRequest -Uri "$ApiBaseUrl/api/leads/$($createdLead.id)" -Method Put -Body $correctedLeadBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($correctedLead.StatusCode -lt 200 -or $correctedLead.StatusCode -ge 300) {
  throw "Lead correction update returned HTTP $($correctedLead.StatusCode)"
}
$correctedLeadRecord = $correctedLead.Content | ConvertFrom-Json
if ($correctedLeadRecord.customerName -ne "Smoke Lead Corrected" -or $correctedLeadRecord.phone -ne "$leadPhone-EDIT" -or $correctedLeadRecord.message -ne "Corrected back-office lead note" -or $correctedLeadRecord.status -ne "New" -or $correctedLeadRecord.customerId -ne $leadCustomerId) {
  throw "Back-office lead correction did not round trip customer, phone, message, status, and linked customer"
}
Write-Host "Back-office lead update tracking OK"

$leads = Invoke-WebRequest -Uri "$ApiBaseUrl/api/leads" -WebSession $session -UseBasicParsing
if ($leads.Content -notmatch "$leadPhone-EDIT" -or $leads.Content -notmatch $leadCustomerId) {
  throw "Back-office leads API did not include the linked smoke-test public enquiry"
}
Write-Host "Back-office lead intake OK"

$closedLeadBody = @{
  id = $createdLead.id
  vehicleId = $leadVehicleId
  customerId = $leadCustomerId
  customerName = "Smoke Lead Corrected"
  phone = "$leadPhone-EDIT"
  message = "Corrected back-office lead note"
  status = "Closed"
  createdAt = $createdLead.createdAt
} | ConvertTo-Json
$closedLead = Invoke-WebRequest -Uri "$ApiBaseUrl/api/leads/$($createdLead.id)" -Method Put -Body $closedLeadBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($closedLead.StatusCode -lt 200 -or $closedLead.StatusCode -ge 300) {
  throw "Lead close update returned HTTP $($closedLead.StatusCode)"
}
Write-Host "Back-office lead close OK"

$workflowSuffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$workflowVehicleId = [guid]::NewGuid().ToString()
$workflowCustomerId = [guid]::NewGuid().ToString()
$workflowOwnerId = [guid]::NewGuid().ToString()
$workflowPlate = "SMK$($workflowSuffix.ToString().Substring($workflowSuffix.ToString().Length - 6))"
$workflowCustomerPhone = "SMOKE-CUSTOMER-$workflowSuffix"
$workflowOwnerPhone = "SMOKE-OWNER-$workflowSuffix"
$workflowCustomerBody = @{
  id = $workflowCustomerId
  name = "Smoke Workflow Customer"
  phone = $workflowCustomerPhone
  icNumber = "SMOKE-IC"
  email = "smoke.workflow@example.test"
  address = "123 Smoke Workflow Street"
  notes = "Customer detail note for invoice and delivery"
} | ConvertTo-Json
$workflowCustomer = Invoke-WebRequest -Uri "$ApiBaseUrl/api/customers" -Method Post -Body $workflowCustomerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($workflowCustomer.StatusCode -lt 200 -or $workflowCustomer.StatusCode -ge 300) {
  throw "Workflow customer creation returned HTTP $($workflowCustomer.StatusCode)"
}
$createdWorkflowCustomer = $workflowCustomer.Content | ConvertFrom-Json
if ($createdWorkflowCustomer.address -ne "123 Smoke Workflow Street" -or $createdWorkflowCustomer.notes -ne "Customer detail note for invoice and delivery") {
  throw "Workflow customer did not preserve detailed address and notes"
}
$updatedWorkflowCustomerBody = @{
  id = $workflowCustomerId
  name = "Smoke Workflow Customer"
  phone = $workflowCustomerPhone
  icNumber = "SMOKE-IC"
  email = "smoke.workflow@example.test"
  address = "456 Updated Workflow Street"
  notes = "Updated customer detail note"
} | ConvertTo-Json
$updatedWorkflowCustomer = Invoke-WebRequest -Uri "$ApiBaseUrl/api/customers/$workflowCustomerId" -Method Put -Body $updatedWorkflowCustomerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedWorkflowCustomer.StatusCode -lt 200 -or $updatedWorkflowCustomer.StatusCode -ge 300) {
  throw "Workflow customer update returned HTTP $($updatedWorkflowCustomer.StatusCode)"
}
$updatedWorkflowCustomerContent = $updatedWorkflowCustomer.Content | ConvertFrom-Json
if ($updatedWorkflowCustomerContent.address -ne "456 Updated Workflow Street" -or $updatedWorkflowCustomerContent.notes -ne "Updated customer detail note") {
  throw "Workflow customer updates did not round trip"
}
$workflowOwnerBody = @{
  id = $workflowOwnerId
  name = "Smoke Previous Owner"
  phone = $workflowOwnerPhone
} | ConvertTo-Json
$workflowOwner = Invoke-WebRequest -Uri "$ApiBaseUrl/api/owners" -Method Post -Body $workflowOwnerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($workflowOwner.StatusCode -lt 200 -or $workflowOwner.StatusCode -ge 300) {
  throw "Workflow owner creation returned HTTP $($workflowOwner.StatusCode)"
}
$updatedWorkflowOwnerBody = @{
  id = $workflowOwnerId
  name = "Smoke Updated Previous Owner"
  phone = $workflowOwnerPhone
} | ConvertTo-Json
$updatedWorkflowOwner = Invoke-WebRequest -Uri "$ApiBaseUrl/api/owners/$workflowOwnerId" -Method Put -Body $updatedWorkflowOwnerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedWorkflowOwner.StatusCode -lt 200 -or $updatedWorkflowOwner.StatusCode -ge 300) {
  throw "Workflow owner update returned HTTP $($updatedWorkflowOwner.StatusCode)"
}
$updatedWorkflowOwnerContent = $updatedWorkflowOwner.Content | ConvertFrom-Json
if ($updatedWorkflowOwnerContent.name -ne "Smoke Updated Previous Owner") {
  throw "Workflow owner updates did not round trip"
}
Write-Host "Customer and owner update OK"
$workflowVehicleBody = @{
  id = $workflowVehicleId
  plateNumber = $workflowPlate
  make = "Smoke"
  model = "Workflow"
  year = 2026
  stockOwner = "YSHeng"
  status = "Available"
  isPublic = $true
  purchasePrice = 40000
  sellingPrice = 52000
  bossConfirmed = $true
  contraRangePrice = 51000
  ucdStatus = "Submitted"
  additionalCharges = 0
  refurbishmentTotal = 0
  commissionTotal = 0
  customerId = $workflowCustomerId
  ownerId = $workflowOwnerId
  intakeDate = "2026-05-30"
} | ConvertTo-Json
$workflowVehicle = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -Method Post -Body $workflowVehicleBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($workflowVehicle.StatusCode -lt 200 -or $workflowVehicle.StatusCode -ge 300) {
  throw "Workflow vehicle creation returned HTTP $($workflowVehicle.StatusCode)"
}
$createdWorkflowVehicle = $workflowVehicle.Content | ConvertFrom-Json
if ($createdWorkflowVehicle.customerId -ne $workflowCustomerId -or $createdWorkflowVehicle.ownerId -ne $workflowOwnerId -or $createdWorkflowVehicle.bossConfirmed -ne $true -or $createdWorkflowVehicle.contraRangePrice -ne 51000 -or $createdWorkflowVehicle.ucdStatus -ne "Submitted") {
  throw "Workflow vehicle did not preserve linked customer, owner, Boss Confirm, Contra Range, and UCD details"
}
$updatedWorkflowVehicleBody = @{
  id = $workflowVehicleId
  plateNumber = $workflowPlate
  make = "Smoke"
  model = "Workflow Updated"
  year = 2026
  stockOwner = "YSHeng"
  status = "Available"
  isPublic = $true
  purchasePrice = 40000
  sellingPrice = 53000
  bossConfirmed = $true
  contraRangePrice = 51500
  ucdStatus = "Ready"
  additionalCharges = 300
  refurbishmentTotal = 0
  commissionTotal = 0
  customerId = $workflowCustomerId
  ownerId = $workflowOwnerId
  outstationPickupAllowance = 0
  outstationPickupScheduledAt = "2026-06-03T10:30:00"
  outstationPickupBookingSlip = "BOOK-$workflowSuffix"
  intakeDate = "2026-05-30"
} | ConvertTo-Json
$updatedWorkflowVehicle = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId" -Method Put -Body $updatedWorkflowVehicleBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedWorkflowVehicle.StatusCode -lt 200 -or $updatedWorkflowVehicle.StatusCode -ge 300) {
  throw "Workflow vehicle update returned HTTP $($updatedWorkflowVehicle.StatusCode)"
}
$updatedWorkflowVehicleContent = $updatedWorkflowVehicle.Content | ConvertFrom-Json
if ($updatedWorkflowVehicleContent.model -ne "Workflow Updated" -or $updatedWorkflowVehicleContent.sellingPrice -ne 53000 -or $updatedWorkflowVehicleContent.ucdStatus -ne "Ready" -or $updatedWorkflowVehicleContent.outstationPickupBookingSlip -ne "BOOK-$workflowSuffix") {
  throw "Workflow vehicle update did not preserve corrected intake details"
}
Write-Host "Vehicle intake update OK"
$auditLog = Invoke-WebRequest -Uri "$ApiBaseUrl/api/audit-log" -WebSession $session -UseBasicParsing
$auditItems = $auditLog.Content | ConvertFrom-Json
$vehicleAudit = @($auditItems | Where-Object { $_.action -eq "vehicle.created" -and $_.entityId -eq $workflowVehicleId -and $_.actor -eq $AdminEmail })
if ($vehicleAudit.Count -eq 0) {
  throw "Audit log did not attribute workflow vehicle creation to $AdminEmail"
}
$filteredAuditLog = Invoke-WebRequest -Uri "$ApiBaseUrl/api/audit-log?actor=$([uri]::EscapeDataString($AdminEmail))&action=vehicle.created&entityName=Vehicle" -WebSession $session -UseBasicParsing
$filteredAuditItems = @($filteredAuditLog.Content | ConvertFrom-Json)
$filteredVehicleAudit = @($filteredAuditItems | Where-Object { $_.action -eq "vehicle.created" -and $_.entityId -eq $workflowVehicleId -and $_.actor -eq $AdminEmail -and $_.entityName -eq "Vehicle" })
if ($filteredVehicleAudit.Count -eq 0) {
  throw "Filtered audit log did not return workflow vehicle creation for $AdminEmail"
}
Write-Host "Authenticated audit actor OK"
Write-Host "Audit log filter OK"

$purchaseInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  invoiceNumber = "PI-$workflowSuffix"
  amount = 40000
} | ConvertTo-Json
$purchaseInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/purchase-invoices" -Method Post -Body $purchaseInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($purchaseInvoice.StatusCode -lt 200 -or $purchaseInvoice.StatusCode -ge 300) {
  throw "Purchase invoice creation returned HTTP $($purchaseInvoice.StatusCode)"
}
$createdPurchaseInvoice = $purchaseInvoice.Content | ConvertFrom-Json
$purchaseInvoices = Invoke-WebRequest -Uri "$ApiBaseUrl/api/purchase-invoices" -WebSession $session -UseBasicParsing
if ($purchaseInvoices.Content -notmatch "PI-$workflowSuffix") {
  throw "Purchase invoice list did not include the workflow invoice"
}
Write-Host "Purchase invoice intake OK"

$updatedPurchaseInvoiceBody = @{
  id = $createdPurchaseInvoice.id
  vehicleId = $createdPurchaseInvoice.vehicleId
  invoiceNumber = $createdPurchaseInvoice.invoiceNumber
  amount = 41000
} | ConvertTo-Json
$updatedPurchaseInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/purchase-invoices/$($createdPurchaseInvoice.id)" -Method Put -Body $updatedPurchaseInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedPurchaseInvoice.StatusCode -lt 200 -or $updatedPurchaseInvoice.StatusCode -ge 300) {
  throw "Purchase invoice update returned HTTP $($updatedPurchaseInvoice.StatusCode)"
}
$updatedPurchaseInvoiceContent = $updatedPurchaseInvoice.Content | ConvertFrom-Json
if ($updatedPurchaseInvoiceContent.amount -ne 41000 -or $updatedPurchaseInvoiceContent.invoiceNumber -ne "PI-$workflowSuffix") {
  throw "Purchase invoice update did not round trip"
}
Write-Host "Purchase invoice update OK"

$invalidPurchaseInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  invoiceNumber = " "
  amount = 0
} | ConvertTo-Json
try {
  $invalidPurchaseInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/purchase-invoices" -Method Post -Body $invalidPurchaseInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidPurchaseInvoiceStatus = [int]$invalidPurchaseInvoice.StatusCode
  $invalidPurchaseInvoiceContent = $invalidPurchaseInvoice.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidPurchaseInvoiceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidPurchaseInvoiceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidPurchaseInvoiceStatus -ne 400 -or $invalidPurchaseInvoiceContent -notmatch "purchase_invoice_number_required" -or $invalidPurchaseInvoiceContent -notmatch "invalid_purchase_invoice_amount") {
  throw "Invalid purchase invoice returned HTTP $invalidPurchaseInvoiceStatus instead of structured validation errors"
}
Write-Host "Purchase invoice validation OK"

$duplicatePurchaseInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  invoiceNumber = " pi-$workflowSuffix "
  amount = 40000
} | ConvertTo-Json
try {
  $duplicatePurchaseInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/purchase-invoices" -Method Post -Body $duplicatePurchaseInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicatePurchaseInvoiceStatus = [int]$duplicatePurchaseInvoice.StatusCode
  $duplicatePurchaseInvoiceContent = $duplicatePurchaseInvoice.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicatePurchaseInvoiceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicatePurchaseInvoiceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicatePurchaseInvoiceStatus -ne 400 -or $duplicatePurchaseInvoiceContent -notmatch "duplicate_purchase_invoice") {
  throw "Duplicate purchase invoice returned HTTP $duplicatePurchaseInvoiceStatus instead of duplicate_purchase_invoice validation"
}
Write-Host "Purchase invoice duplicate validation OK"

$invalidVehicleBody = @{
  id = [guid]::NewGuid().ToString()
  plateNumber = " "
  make = ""
  model = ""
  year = 1800
  stockOwner = "YSHeng"
  status = "Available"
  isPublic = $true
  purchasePrice = -1
  sellingPrice = 0
  additionalCharges = -1
  refurbishmentTotal = -1
  commissionTotal = -1
  contraRangePrice = -1
  intakeDate = "2026-05-30"
} | ConvertTo-Json
try {
  $invalidVehicle = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -Method Post -Body $invalidVehicleBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidVehicleStatus = [int]$invalidVehicle.StatusCode
  $invalidVehicleContent = $invalidVehicle.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidVehicleStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidVehicleContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidVehicleStatus -ne 400 -or $invalidVehicleContent -notmatch "plate_required" -or $invalidVehicleContent -notmatch "invalid_selling_price" -or $invalidVehicleContent -notmatch "invalid_contra_range_price") {
  throw "Invalid vehicle intake returned HTTP $invalidVehicleStatus instead of structured validation errors"
}
Write-Host "Vehicle intake validation OK"

$duplicateVehicleBody = @{
  id = [guid]::NewGuid().ToString()
  plateNumber = $workflowPlate.ToLowerInvariant()
  make = "Smoke"
  model = "Duplicate"
  year = 2026
  stockOwner = "YSHeng"
  status = "Available"
  isPublic = $true
  purchasePrice = 40000
  sellingPrice = 52000
  additionalCharges = 0
  refurbishmentTotal = 0
  commissionTotal = 0
  intakeDate = "2026-05-30"
} | ConvertTo-Json
try {
  $duplicateVehicle = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -Method Post -Body $duplicateVehicleBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicateVehicleStatus = [int]$duplicateVehicle.StatusCode
  $duplicateVehicleContent = $duplicateVehicle.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicateVehicleStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicateVehicleContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicateVehicleStatus -ne 400 -or $duplicateVehicleContent -notmatch "duplicate_plate") {
  throw "Duplicate vehicle returned HTTP $duplicateVehicleStatus instead of duplicate_plate validation"
}
Write-Host "Duplicate vehicle plate validation OK"

$invalidRepairBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  whatToDo = " "
  cost = -1
  checklistDone = $false
} | ConvertTo-Json
try {
  $invalidRepair = Invoke-WebRequest -Uri "$ApiBaseUrl/api/repairs" -Method Post -Body $invalidRepairBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidRepairStatus = [int]$invalidRepair.StatusCode
  $invalidRepairContent = $invalidRepair.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidRepairStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidRepairContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidRepairStatus -ne 400 -or $invalidRepairContent -notmatch "repair_task_required" -or $invalidRepairContent -notmatch "invalid_repair_cost") {
  throw "Invalid repair returned HTTP $invalidRepairStatus instead of structured validation errors"
}
Write-Host "Repair validation OK"

$repairId = [guid]::NewGuid().ToString()
$repairBody = @{
  id = $repairId
  vehicleId = $workflowVehicleId
  repairPart = "Smoke Spare Part"
  whatToDo = "Install and polish spare part"
  cost = 650
  checklistDone = $false
} | ConvertTo-Json
$createdRepair = Invoke-WebRequest -Uri "$ApiBaseUrl/api/repairs" -Method Post -Body $repairBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($createdRepair.StatusCode -lt 200 -or $createdRepair.StatusCode -ge 300) {
  throw "Repair creation returned HTTP $($createdRepair.StatusCode)"
}
$createdRepairContent = $createdRepair.Content | ConvertFrom-Json
$updatedRepairBody = @{
  id = $createdRepairContent.id
  vehicleId = $createdRepairContent.vehicleId
  repairPart = "Smoke Spare Part Corrected"
  whatToDo = "Install, polish, and align spare part"
  cost = 725
  checklistDone = $true
} | ConvertTo-Json
$updatedRepair = Invoke-WebRequest -Uri "$ApiBaseUrl/api/repairs/$($createdRepairContent.id)" -Method Put -Body $updatedRepairBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedRepair.StatusCode -lt 200 -or $updatedRepair.StatusCode -ge 300) {
  throw "Repair update returned HTTP $($updatedRepair.StatusCode)"
}
$updatedRepairContent = $updatedRepair.Content | ConvertFrom-Json
if ($updatedRepairContent.repairPart -ne "Smoke Spare Part Corrected" -or $updatedRepairContent.whatToDo -ne "Install, polish, and align spare part" -or $updatedRepairContent.cost -ne 725 -or $updatedRepairContent.checklistDone -ne $true) {
  throw "Repair update did not round trip corrected task details"
}
$repairs = Invoke-WebRequest -Uri "$ApiBaseUrl/api/repairs" -WebSession $session -UseBasicParsing
if ($repairs.Content -notmatch "Smoke Spare Part Corrected" -or $repairs.Content -notmatch "Install, polish, and align spare part") {
  throw "Repair list did not preserve repair part and task details"
}
Write-Host "Repair update tracking OK"
Write-Host "Repair part tracking OK"

$invalidSupplierInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  supplierName = " "
  invoiceNumber = ""
  plateNumberOnInvoice = $workflowPlate
  amount = 650
} | ConvertTo-Json
try {
  $invalidSupplierInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/supplier-invoices" -Method Post -Body $invalidSupplierInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidSupplierInvoiceStatus = [int]$invalidSupplierInvoice.StatusCode
  $invalidSupplierInvoiceContent = $invalidSupplierInvoice.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidSupplierInvoiceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidSupplierInvoiceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidSupplierInvoiceStatus -ne 400 -or $invalidSupplierInvoiceContent -notmatch "supplier_name_required" -or $invalidSupplierInvoiceContent -notmatch "invoice_number_required") {
  throw "Invalid supplier invoice returned HTTP $invalidSupplierInvoiceStatus instead of structured validation errors"
}
Write-Host "Supplier invoice validation OK"

$supplierInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  supplierName = "Smoke Workshop"
  invoiceNumber = "SW-$workflowSuffix"
  plateNumberOnInvoice = $workflowPlate
  amount = 1650
} | ConvertTo-Json
$supplierInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/supplier-invoices" -Method Post -Body $supplierInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($supplierInvoice.StatusCode -lt 200 -or $supplierInvoice.StatusCode -ge 300) {
  throw "Supplier invoice creation returned HTTP $($supplierInvoice.StatusCode)"
}
$createdSupplierInvoice = $supplierInvoice.Content | ConvertFrom-Json
if ($createdSupplierInvoice.plateNumberOnInvoice -ne $workflowPlate) {
  throw "Supplier invoice did not preserve the printed plate number"
}
$updatedSupplierInvoiceBody = @{
  id = $createdSupplierInvoice.id
  vehicleId = $createdSupplierInvoice.vehicleId
  supplierName = $createdSupplierInvoice.supplierName
  invoiceNumber = $createdSupplierInvoice.invoiceNumber
  plateNumberOnInvoice = $createdSupplierInvoice.plateNumberOnInvoice
  amount = 1750
} | ConvertTo-Json
$updatedSupplierInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/supplier-invoices/$($createdSupplierInvoice.id)" -Method Put -Body $updatedSupplierInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedSupplierInvoice.StatusCode -lt 200 -or $updatedSupplierInvoice.StatusCode -ge 300) {
  throw "Supplier invoice update returned HTTP $($updatedSupplierInvoice.StatusCode)"
}
$updatedSupplierInvoiceContent = $updatedSupplierInvoice.Content | ConvertFrom-Json
if ($updatedSupplierInvoiceContent.amount -ne 1750 -or $updatedSupplierInvoiceContent.plateNumberOnInvoice -ne $workflowPlate) {
  throw "Supplier invoice update did not round trip amount and plate"
}
Write-Host "Supplier invoice update OK"

$dashboardAfterSupplier = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$dashboardAfterSupplierSummary = $dashboardAfterSupplier.Content | ConvertFrom-Json
if ($dashboardAfterSupplierSummary.topSupplier -ne "Smoke Workshop" -or $dashboardAfterSupplierSummary.salesPerformance -lt 1) {
  throw "Dashboard summary did not include top supplier and sales performance metrics from live workflow data"
}
Write-Host "Dashboard top supplier and sales performance OK"

$duplicateSupplierInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  supplierName = " smoke workshop "
  invoiceNumber = " sw-$workflowSuffix "
  plateNumberOnInvoice = $workflowPlate
  amount = 700
} | ConvertTo-Json
try {
  $duplicateSupplierInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/supplier-invoices" -Method Post -Body $duplicateSupplierInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicateSupplierInvoiceStatus = [int]$duplicateSupplierInvoice.StatusCode
  $duplicateSupplierInvoiceContent = $duplicateSupplierInvoice.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicateSupplierInvoiceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicateSupplierInvoiceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicateSupplierInvoiceStatus -ne 400 -or $duplicateSupplierInvoiceContent -notmatch "duplicate_invoice") {
  throw "Duplicate supplier invoice returned HTTP $duplicateSupplierInvoiceStatus instead of duplicate_invoice validation"
}
Write-Host "Supplier invoice duplicate validation OK"

$wrongPlateSupplierInvoiceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  supplierName = "Wrong Plate Workshop"
  invoiceNumber = "WP-$workflowSuffix"
  plateNumberOnInvoice = "WRONG999"
  amount = 700
} | ConvertTo-Json
try {
  $wrongPlateSupplierInvoice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/supplier-invoices" -Method Post -Body $wrongPlateSupplierInvoiceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $wrongPlateSupplierInvoiceStatus = [int]$wrongPlateSupplierInvoice.StatusCode
  $wrongPlateSupplierInvoiceContent = $wrongPlateSupplierInvoice.Content
}
catch {
  if ($_.Exception.Response) {
    $wrongPlateSupplierInvoiceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $wrongPlateSupplierInvoiceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($wrongPlateSupplierInvoiceStatus -ne 400 -or $wrongPlateSupplierInvoiceContent -notmatch "supplier_invoice_plate_mismatch") {
  throw "Wrong-plate supplier invoice returned HTTP $wrongPlateSupplierInvoiceStatus instead of supplier_invoice_plate_mismatch validation"
}
Write-Host "Supplier invoice wrong plate validation OK"

$noticeReminderDeliveryId = [guid]::NewGuid().ToString()
$noticeReminderDeliveryBody = @{
  id = $noticeReminderDeliveryId
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery Reminder"
  status = "Scheduled"
  scheduledDate = "2026-06-01"
  polishDone = $false
  tintedDone = $false
  washDone = $false
  documentsPrepared = $false
  inspectionDone = $false
  inspectionBookingReference = "BOOK-REMINDER-$workflowSuffix"
  notificationSent = $false
  twoDayNoticeSent = $false
} | ConvertTo-Json
$noticeReminderDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries" -Method Post -Body $noticeReminderDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($noticeReminderDelivery.StatusCode -lt 200 -or $noticeReminderDelivery.StatusCode -ge 300) {
  throw "Delivery reminder smoke creation returned HTTP $($noticeReminderDelivery.StatusCode)"
}
$deliveryReminderInbox = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
if ($deliveryReminderInbox.Content -notmatch "DeliveryPreparation" -or $deliveryReminderInbox.Content -notmatch $workflowPlate) {
  throw "Dashboard reminders did not include due delivery preparation before 2-day notice was sent"
}

$sentNoticeDeliveryBody = @{
  id = $noticeReminderDeliveryId
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery Reminder"
  status = "Scheduled"
  scheduledDate = "2026-06-01"
  polishDone = $false
  tintedDone = $false
  washDone = $false
  documentsPrepared = $false
  inspectionDone = $false
  inspectionBookingReference = "BOOK-REMINDER-$workflowSuffix"
  notificationSent = $false
  twoDayNoticeSent = $true
} | ConvertTo-Json
$sentNoticeDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries/$noticeReminderDeliveryId" -Method Put -Body $sentNoticeDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($sentNoticeDelivery.StatusCode -lt 200 -or $sentNoticeDelivery.StatusCode -ge 300) {
  throw "Delivery 2-day notice update returned HTTP $($sentNoticeDelivery.StatusCode)"
}
$deliveryReminderAfterNotice = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$deliveryReminderAfterNoticeItems = $deliveryReminderAfterNotice.Content | ConvertFrom-Json
$remainingDeliveryNotice = $deliveryReminderAfterNoticeItems | Where-Object { $_.type -eq "DeliveryPreparation" -and $_.vehiclePlate -eq $workflowPlate } | Select-Object -First 1
if ($null -ne $remainingDeliveryNotice) {
  throw "Dashboard reminders still included delivery preparation after 2-day notice was sent"
}
Write-Host "Delivery 2-day notice reminder OK"

$deliveryId = [guid]::NewGuid().ToString()
$deliveryBody = @{
  id = $deliveryId
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery"
  status = "Scheduled"
  scheduledDate = "2026-06-03"
  polishDone = $true
  tintedDone = $true
  washDone = $false
  documentsPrepared = $true
  inspectionDone = $true
  inspectionBookingReference = "BOOK-$workflowSuffix"
  inspectionReportReference = "INSPECT-$workflowSuffix"
  insurancePolicyReference = "POL-$workflowSuffix"
  roadTaxReceiptReference = "RT-$workflowSuffix"
  windscreenPolicyReference = "WS-$workflowSuffix"
  notificationSent = $false
  twoDayNoticeSent = $true
} | ConvertTo-Json
$delivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries" -Method Post -Body $deliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($delivery.StatusCode -lt 200 -or $delivery.StatusCode -ge 300) {
  throw "Workflow delivery creation returned HTTP $($delivery.StatusCode)"
}
$createdDelivery = $delivery.Content | ConvertFrom-Json
if ($createdDelivery.notificationSent -ne $false) {
  throw "Workflow delivery notification flag was not created as pending"
}

$correctedDeliveryBody = @{
  id = $createdDelivery.id
  vehicleId = $createdDelivery.vehicleId
  pic = "Smoke Delivery Corrected"
  status = "PreparingDocuments"
  scheduledDate = "2026-06-04"
  polishDone = $createdDelivery.polishDone
  tintedDone = $createdDelivery.tintedDone
  washDone = $createdDelivery.washDone
  documentsPrepared = $createdDelivery.documentsPrepared
  inspectionDone = $createdDelivery.inspectionDone
  inspectionBookingReference = "BOOK-EDIT-$workflowSuffix"
  inspectionReportReference = $createdDelivery.inspectionReportReference
  insurancePolicyReference = "POL-EDIT-$workflowSuffix"
  roadTaxReceiptReference = "RT-EDIT-$workflowSuffix"
  windscreenPolicyReference = "WS-EDIT-$workflowSuffix"
  notificationSent = $createdDelivery.notificationSent
  twoDayNoticeSent = $createdDelivery.twoDayNoticeSent
  insuranceHandled = $createdDelivery.insuranceHandled
  roadTaxHandled = $createdDelivery.roadTaxHandled
  windscreenInsuranceHandled = $createdDelivery.windscreenInsuranceHandled
} | ConvertTo-Json
$correctedDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries/$deliveryId" -Method Put -Body $correctedDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($correctedDelivery.StatusCode -lt 200 -or $correctedDelivery.StatusCode -ge 300) {
  throw "Workflow delivery correction update returned HTTP $($correctedDelivery.StatusCode)"
}
$correctedDeliveryContent = $correctedDelivery.Content | ConvertFrom-Json
if ($correctedDeliveryContent.pic -ne "Smoke Delivery Corrected" -or $correctedDeliveryContent.status -ne "PreparingDocuments" -or $correctedDeliveryContent.scheduledDate -ne "2026-06-04") {
  throw "Workflow delivery correction fields did not round trip"
}

$notifiedDeliveryBody = @{
  id = $correctedDeliveryContent.id
  vehicleId = $correctedDeliveryContent.vehicleId
  pic = $correctedDeliveryContent.pic
  status = $correctedDeliveryContent.status
  scheduledDate = $correctedDeliveryContent.scheduledDate
  polishDone = $correctedDeliveryContent.polishDone
  tintedDone = $correctedDeliveryContent.tintedDone
  washDone = $correctedDeliveryContent.washDone
  documentsPrepared = $correctedDeliveryContent.documentsPrepared
  inspectionDone = $correctedDeliveryContent.inspectionDone
  inspectionBookingReference = $correctedDeliveryContent.inspectionBookingReference
  inspectionReportReference = $correctedDeliveryContent.inspectionReportReference
  insurancePolicyReference = $correctedDeliveryContent.insurancePolicyReference
  roadTaxReceiptReference = $correctedDeliveryContent.roadTaxReceiptReference
  windscreenPolicyReference = $correctedDeliveryContent.windscreenPolicyReference
  notificationSent = $true
  twoDayNoticeSent = $correctedDeliveryContent.twoDayNoticeSent
  insuranceHandled = $correctedDeliveryContent.insuranceHandled
  roadTaxHandled = $correctedDeliveryContent.roadTaxHandled
  windscreenInsuranceHandled = $correctedDeliveryContent.windscreenInsuranceHandled
} | ConvertTo-Json
$notifiedDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries/$deliveryId" -Method Put -Body $notifiedDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($notifiedDelivery.StatusCode -lt 200 -or $notifiedDelivery.StatusCode -ge 300) {
  throw "Workflow delivery notification update returned HTTP $($notifiedDelivery.StatusCode)"
}
$notifiedDeliveryContent = $notifiedDelivery.Content | ConvertFrom-Json
if ($notifiedDeliveryContent.notificationSent -ne $true -or $notifiedDeliveryContent.twoDayNoticeSent -ne $true) {
  throw "Workflow delivery notification did not round trip separately from 2-day notice"
}
if ($notifiedDeliveryContent.inspectionBookingReference -ne "BOOK-EDIT-$workflowSuffix") {
  throw "Workflow delivery inspection booking reference did not round trip"
}
if ($notifiedDeliveryContent.insurancePolicyReference -ne "POL-EDIT-$workflowSuffix" -or $notifiedDeliveryContent.roadTaxReceiptReference -ne "RT-EDIT-$workflowSuffix" -or $notifiedDeliveryContent.windscreenPolicyReference -ne "WS-EDIT-$workflowSuffix") {
  throw "Workflow delivery handover references did not round trip"
}
Write-Host "Delivery correction tracking OK"
Write-Host "Delivery notification tracking OK"
Write-Host "Delivery inspection booking tracking OK"
Write-Host "Delivery handover reference tracking OK"

$blockedReleaseBody = @{
  id = $deliveryId
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery"
  status = "Released"
  scheduledDate = "2026-06-03"
  polishDone = $true
  tintedDone = $true
  washDone = $false
  documentsPrepared = $true
  inspectionDone = $true
  inspectionBookingReference = "BOOK-$workflowSuffix"
  inspectionReportReference = "INSPECT-$workflowSuffix"
  notificationSent = $true
  twoDayNoticeSent = $true
} | ConvertTo-Json
try {
  $blockedRelease = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries/$deliveryId" -Method Put -Body $blockedReleaseBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $blockedReleaseStatus = [int]$blockedRelease.StatusCode
  $blockedReleaseContent = $blockedRelease.Content
}
catch {
  if ($_.Exception.Response) {
    $blockedReleaseStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $blockedReleaseContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($blockedReleaseStatus -ne 400 -or $blockedReleaseContent -notmatch "delivery_not_ready") {
  throw "Incomplete delivery release returned HTTP $blockedReleaseStatus instead of delivery_not_ready validation"
}
Write-Host "Delivery release validation OK"

$blockedReadyBody = @{
  id = $deliveryId
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery"
  status = "ReadyForRelease"
  scheduledDate = "2026-06-03"
  polishDone = $true
  tintedDone = $true
  washDone = $false
  documentsPrepared = $true
  inspectionDone = $true
  inspectionBookingReference = "BOOK-$workflowSuffix"
  inspectionReportReference = "INSPECT-$workflowSuffix"
  notificationSent = $true
  twoDayNoticeSent = $true
} | ConvertTo-Json
try {
  $blockedReady = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries/$deliveryId" -Method Put -Body $blockedReadyBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $blockedReadyStatus = [int]$blockedReady.StatusCode
  $blockedReadyContent = $blockedReady.Content
}
catch {
  if ($_.Exception.Response) {
    $blockedReadyStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $blockedReadyContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($blockedReadyStatus -ne 400 -or $blockedReadyContent -notmatch "delivery_not_ready") {
  throw "Incomplete ready delivery returned HTTP $blockedReadyStatus instead of delivery_not_ready validation"
}
Write-Host "Delivery ready validation OK"

$invalidDeliveryBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  pic = " "
  status = "Scheduled"
  scheduledDate = "0001-01-01"
  polishDone = $false
  tintedDone = $false
  washDone = $false
  documentsPrepared = $false
  inspectionDone = $false
  notificationSent = $false
  twoDayNoticeSent = $false
} | ConvertTo-Json
try {
  $invalidDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries" -Method Post -Body $invalidDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidDeliveryStatus = [int]$invalidDelivery.StatusCode
  $invalidDeliveryContent = $invalidDelivery.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidDeliveryStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidDeliveryContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidDeliveryStatus -ne 400 -or $invalidDeliveryContent -notmatch "delivery_pic_required" -or $invalidDeliveryContent -notmatch "delivery_schedule_required") {
  throw "Invalid delivery returned HTTP $invalidDeliveryStatus instead of PIC and schedule validation"
}
Write-Host "Delivery schedule validation OK"

$invalidInspectionDeliveryBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  pic = "Smoke Delivery"
  status = "Inspection"
  scheduledDate = "2026-06-03"
  polishDone = $false
  tintedDone = $false
  washDone = $false
  documentsPrepared = $false
  inspectionDone = $true
  inspectionBookingReference = "BOOK-$workflowSuffix"
  inspectionReportReference = " "
  notificationSent = $false
  twoDayNoticeSent = $false
} | ConvertTo-Json
try {
  $invalidInspectionDelivery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/deliveries" -Method Post -Body $invalidInspectionDeliveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidInspectionDeliveryStatus = [int]$invalidInspectionDelivery.StatusCode
  $invalidInspectionDeliveryContent = $invalidInspectionDelivery.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidInspectionDeliveryStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidInspectionDeliveryContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidInspectionDeliveryStatus -ne 400 -or $invalidInspectionDeliveryContent -notmatch "inspection_report_required") {
  throw "Inspected delivery without report returned HTTP $invalidInspectionDeliveryStatus instead of inspection_report_required validation"
}
Write-Host "Delivery inspection report validation OK"

$photoFileName = "smoke-photo-$workflowSuffix.png"
$photoBytes = New-SmokePngBytes
$photoChecksum = Get-Sha256Hex $photoBytes
$photoUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/photos" `
  -FileName $photoFileName `
  -ContentType "image/png" `
  -Content $photoBytes `
  -Session $session
if ($photoUpload.StatusCode -lt 200 -or $photoUpload.StatusCode -ge 300) {
  throw "Vehicle photo upload returned HTTP $($photoUpload.StatusCode)"
}

$photos = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId/photos" -WebSession $session -UseBasicParsing
if ($photos.Content -notmatch $photoFileName -or $photos.Content -notmatch $photoChecksum) {
  throw "Uploaded vehicle photo metadata was not returned by the API"
}
$photoMetadata = ($photos.Content | ConvertFrom-Json) | Where-Object { $_.fileName -eq $photoFileName } | Select-Object -First 1
if ($null -eq $photoMetadata -or [string]::IsNullOrWhiteSpace($photoMetadata.id)) {
  throw "Uploaded vehicle photo metadata did not include a usable id"
}
$photoContent = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId/photos/$($photoMetadata.id)/content" -WebSession $session -UseBasicParsing
if ($photoContent.StatusCode -lt 200 -or $photoContent.StatusCode -ge 300) {
  throw "Uploaded vehicle photo content returned HTTP $($photoContent.StatusCode)"
}
Write-Host "Vehicle photo upload/download OK"

$invalidPhotoUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/photos" `
  -FileName "invalid-photo-$workflowSuffix.jpg" `
  -ContentType "image/jpeg" `
  -Content ([byte[]](1, 2, 3, 4)) `
  -Session $session
if ($invalidPhotoUpload.StatusCode -ne 400 -or $invalidPhotoUpload.Content -notmatch "unsupported_image") {
  throw "Invalid vehicle photo upload returned HTTP $($invalidPhotoUpload.StatusCode) instead of structured validation error"
}
Write-Host "Invalid vehicle photo validation OK"

$invalidDocumentCategoryUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=VehiclePhoto" `
  -FileName "wrong-document-category-$workflowSuffix.jpg" `
  -ContentType "image/jpeg" `
  -Content $photoBytes `
  -Session $session
if ($invalidDocumentCategoryUpload.StatusCode -ne 400 -or $invalidDocumentCategoryUpload.Content -notmatch "invalid_document_category") {
  throw "Vehicle document photo-category upload returned HTTP $($invalidDocumentCategoryUpload.StatusCode) instead of structured category validation"
}
Write-Host "Vehicle document category validation OK"

$documentFileName = "smoke-document-$workflowSuffix.txt"
$documentText = "Smoke test document upload $workflowSuffix"
$documentBytes = [System.Text.Encoding]::UTF8.GetBytes($documentText)
$documentChecksum = Get-Sha256Hex $documentBytes
$documentUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=LoanDocument" `
  -FileName $documentFileName `
  -ContentType "text/plain" `
  -Content $documentBytes `
  -Session $session
if ($documentUpload.StatusCode -lt 200 -or $documentUpload.StatusCode -ge 300) {
  throw "Vehicle document upload returned HTTP $($documentUpload.StatusCode)"
}

$documents = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents" -WebSession $session -UseBasicParsing
if ($documents.Content -notmatch $documentFileName -or $documents.Content -notmatch "LoanDocument" -or $documents.Content -notmatch $AdminEmail -or $documents.Content -notmatch $documentChecksum) {
  throw "Uploaded vehicle document metadata was not returned by the API"
}
$documentMetadata = ($documents.Content | ConvertFrom-Json) | Where-Object { $_.fileName -eq $documentFileName } | Select-Object -First 1
if ($null -eq $documentMetadata -or [string]::IsNullOrWhiteSpace($documentMetadata.id)) {
  throw "Uploaded vehicle document metadata did not include a usable id"
}
$documentContent = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents/$($documentMetadata.id)/content" -WebSession $session -UseBasicParsing
if ($documentContent.Content -ne $documentText) {
  throw "Uploaded vehicle document content did not match the original payload"
}
Write-Host "Vehicle document upload/download OK"

$financeReceiptFileName = "smoke-payment-receipt-$workflowSuffix.txt"
$financeReceiptText = "Smoke payment receipt upload $workflowSuffix"
$financeReceiptBytes = [System.Text.Encoding]::UTF8.GetBytes($financeReceiptText)
$financeReceiptChecksum = Get-Sha256Hex $financeReceiptBytes
$financeReceiptUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=PaymentReceipt" `
  -FileName $financeReceiptFileName `
  -ContentType "text/plain" `
  -Content $financeReceiptBytes `
  -Session $financeSession
if ($financeReceiptUpload.StatusCode -lt 200 -or $financeReceiptUpload.StatusCode -ge 300) {
  throw "Finance payment receipt upload returned HTTP $($financeReceiptUpload.StatusCode)"
}

$financeInvoiceFileName = "smoke-payment-invoice-$workflowSuffix.txt"
$financeInvoiceText = "Smoke payment invoice upload $workflowSuffix"
$financeInvoiceBytes = [System.Text.Encoding]::UTF8.GetBytes($financeInvoiceText)
$financeInvoiceChecksum = Get-Sha256Hex $financeInvoiceBytes
$financeInvoiceUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=PaymentInvoice" `
  -FileName $financeInvoiceFileName `
  -ContentType "text/plain" `
  -Content $financeInvoiceBytes `
  -Session $financeSession
if ($financeInvoiceUpload.StatusCode -lt 200 -or $financeInvoiceUpload.StatusCode -ge 300) {
  throw "Finance payment invoice upload returned HTTP $($financeInvoiceUpload.StatusCode)"
}

$salesPaymentReceiptUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=PaymentReceipt" `
  -FileName "sales-payment-receipt-$workflowSuffix.txt" `
  -ContentType "text/plain" `
  -Content $financeReceiptBytes `
  -Session $salesSession
if ($salesPaymentReceiptUpload.StatusCode -ne 403) {
  throw "Sales payment receipt upload returned HTTP $($salesPaymentReceiptUpload.StatusCode) instead of HTTP 403"
}

$financeLoanDocumentUpload = Invoke-MultipartUpload `
  -Url "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents?category=LoanDocument" `
  -FileName "finance-loan-document-$workflowSuffix.txt" `
  -ContentType "text/plain" `
  -Content $financeInvoiceBytes `
  -Session $financeSession
if ($financeLoanDocumentUpload.StatusCode -ne 403) {
  throw "Finance loan document upload returned HTTP $($financeLoanDocumentUpload.StatusCode) instead of HTTP 403"
}

$financeDocuments = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles/$workflowVehicleId/documents" -WebSession $session -UseBasicParsing
if ($financeDocuments.Content -notmatch $financeReceiptFileName -or $financeDocuments.Content -notmatch "PaymentReceipt" -or $financeDocuments.Content -notmatch $financeReceiptChecksum -or $financeDocuments.Content -notmatch $financeInvoiceFileName -or $financeDocuments.Content -notmatch "PaymentInvoice" -or $financeDocuments.Content -notmatch $financeInvoiceChecksum) {
  throw "Finance receipt and invoice document metadata was not returned by the API"
}
Write-Host "Finance document upload authorization OK"

$publicBeforeLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/public/vehicles" -UseBasicParsing
if ($publicBeforeLoan.Content -notmatch $workflowPlate) {
  throw "Workflow vehicle did not appear in public inventory before loan processing"
}

$invalidCustomerBody = @{
  id = [guid]::NewGuid().ToString()
  name = " "
  phone = ""
  icNumber = "SMOKE-INVALID"
  email = "invalid.customer@example.test"
} | ConvertTo-Json
try {
  $invalidCustomer = Invoke-WebRequest -Uri "$ApiBaseUrl/api/customers" -Method Post -Body $invalidCustomerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidCustomerStatus = [int]$invalidCustomer.StatusCode
  $invalidCustomerContent = $invalidCustomer.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidCustomerStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidCustomerContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidCustomerStatus -ne 400 -or $invalidCustomerContent -notmatch "customer_name_required" -or $invalidCustomerContent -notmatch "customer_phone_required") {
  throw "Invalid customer returned HTTP $invalidCustomerStatus instead of structured validation errors"
}
Write-Host "Customer validation OK"

$duplicateCustomerBody = @{
  id = [guid]::NewGuid().ToString()
  name = "Duplicate Customer"
  phone = $workflowCustomerPhone.Replace("-", " ")
  icNumber = "SMOKE-DUP-CUSTOMER"
  email = "duplicate.customer@example.test"
} | ConvertTo-Json
try {
  $duplicateCustomer = Invoke-WebRequest -Uri "$ApiBaseUrl/api/customers" -Method Post -Body $duplicateCustomerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicateCustomerStatus = [int]$duplicateCustomer.StatusCode
  $duplicateCustomerContent = $duplicateCustomer.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicateCustomerStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicateCustomerContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicateCustomerStatus -ne 400 -or $duplicateCustomerContent -notmatch "duplicate_customer_phone") {
  throw "Duplicate customer returned HTTP $duplicateCustomerStatus instead of duplicate_customer_phone validation"
}
Write-Host "Customer duplicate phone validation OK"

$invalidOwnerBody = @{
  id = [guid]::NewGuid().ToString()
  name = ""
  phone = " "
} | ConvertTo-Json
try {
  $invalidOwner = Invoke-WebRequest -Uri "$ApiBaseUrl/api/owners" -Method Post -Body $invalidOwnerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidOwnerStatus = [int]$invalidOwner.StatusCode
  $invalidOwnerContent = $invalidOwner.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidOwnerStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidOwnerContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidOwnerStatus -ne 400 -or $invalidOwnerContent -notmatch "owner_name_required" -or $invalidOwnerContent -notmatch "owner_phone_required") {
  throw "Invalid owner returned HTTP $invalidOwnerStatus instead of structured validation errors"
}
Write-Host "Owner validation OK"

$duplicateOwnerBody = @{
  id = [guid]::NewGuid().ToString()
  name = "Duplicate Owner"
  phone = $workflowOwnerPhone.Replace("-", " ")
} | ConvertTo-Json
try {
  $duplicateOwner = Invoke-WebRequest -Uri "$ApiBaseUrl/api/owners" -Method Post -Body $duplicateOwnerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicateOwnerStatus = [int]$duplicateOwner.StatusCode
  $duplicateOwnerContent = $duplicateOwner.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicateOwnerStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicateOwnerContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicateOwnerStatus -ne 400 -or $duplicateOwnerContent -notmatch "duplicate_owner_phone") {
  throw "Duplicate owner returned HTTP $duplicateOwnerStatus instead of duplicate_owner_phone validation"
}
Write-Host "Owner duplicate phone validation OK"

$workflowLoanBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  status = "Pending"
  louApproved = $false
  louDone = $false
  submittedAt = "2026-05-30"
} | ConvertTo-Json
$workflowLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans" -Method Post -Body $workflowLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($workflowLoan.StatusCode -lt 200 -or $workflowLoan.StatusCode -ge 300) {
  throw "Workflow loan creation returned HTTP $($workflowLoan.StatusCode)"
}
$createdWorkflowLoan = $workflowLoan.Content | ConvertFrom-Json
$updatedWorkflowLoanBody = @{
  id = $createdWorkflowLoan.id
  vehicleId = $createdWorkflowLoan.vehicleId
  customerId = $createdWorkflowLoan.customerId
  status = "Approved"
  louApproved = $true
  louDone = $false
  submittedAt = "2026-05-31"
} | ConvertTo-Json
$updatedWorkflowLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans/$($createdWorkflowLoan.id)" -Method Put -Body $updatedWorkflowLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedWorkflowLoan.StatusCode -lt 200 -or $updatedWorkflowLoan.StatusCode -ge 300) {
  throw "Workflow loan update returned HTTP $($updatedWorkflowLoan.StatusCode)"
}
$updatedWorkflowLoanContent = $updatedWorkflowLoan.Content | ConvertFrom-Json
if ($updatedWorkflowLoanContent.status -ne "Approved" -or $updatedWorkflowLoanContent.louApproved -ne $true -or $updatedWorkflowLoanContent.submittedAt -ne "2026-05-31") {
  throw "Workflow loan update did not preserve corrected status, LOU approval, and submitted date"
}
Write-Host "Loan update tracking OK"

$invalidLoanBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  status = "Pending"
  louApproved = $false
  louDone = $false
} | ConvertTo-Json
try {
  $invalidLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans" -Method Post -Body $invalidLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidLoanStatus = [int]$invalidLoan.StatusCode
  $invalidLoanContent = $invalidLoan.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidLoanStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidLoanContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidLoanStatus -ne 400 -or $invalidLoanContent -notmatch "loan_submitted_date_required") {
  throw "Invalid loan returned HTTP $invalidLoanStatus instead of submitted date validation"
}
Write-Host "Loan submitted date validation OK"

$invalidLouLoanBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  status = "Done"
  louApproved = $false
  louDone = $true
  submittedAt = "2026-05-30"
} | ConvertTo-Json
try {
  $invalidLouLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans" -Method Post -Body $invalidLouLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidLouLoanStatus = [int]$invalidLouLoan.StatusCode
  $invalidLouLoanContent = $invalidLouLoan.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidLouLoanStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidLouLoanContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidLouLoanStatus -ne 400 -or $invalidLouLoanContent -notmatch "lou_approval_required") {
  throw "Invalid LOU loan returned HTTP $invalidLouLoanStatus instead of lou_approval_required validation"
}
Write-Host "Loan LOU consistency validation OK"

$unapprovedApprovedLoanBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  status = "Approved"
  louApproved = $false
  louDone = $false
  submittedAt = "2026-05-30"
} | ConvertTo-Json
try {
  $unapprovedApprovedLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans" -Method Post -Body $unapprovedApprovedLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $unapprovedApprovedLoanStatus = [int]$unapprovedApprovedLoan.StatusCode
  $unapprovedApprovedLoanContent = $unapprovedApprovedLoan.Content
}
catch {
  if ($_.Exception.Response) {
    $unapprovedApprovedLoanStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $unapprovedApprovedLoanContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($unapprovedApprovedLoanStatus -ne 400 -or $unapprovedApprovedLoanContent -notmatch "lou_approval_required") {
  throw "Approved loan without LOU approval returned HTTP $unapprovedApprovedLoanStatus instead of lou_approval_required validation"
}
Write-Host "Loan approved LOU validation OK"

$incompleteLouLoanBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  status = "Done"
  louApproved = $true
  louDone = $false
  submittedAt = "2026-05-30"
} | ConvertTo-Json
try {
  $incompleteLouLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/loans" -Method Post -Body $incompleteLouLoanBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $incompleteLouLoanStatus = [int]$incompleteLouLoan.StatusCode
  $incompleteLouLoanContent = $incompleteLouLoan.Content
}
catch {
  if ($_.Exception.Response) {
    $incompleteLouLoanStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $incompleteLouLoanContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($incompleteLouLoanStatus -ne 400 -or $incompleteLouLoanContent -notmatch "lou_done_required") {
  throw "Incomplete LOU loan returned HTTP $incompleteLouLoanStatus instead of lou_done_required validation"
}
Write-Host "Loan LOU done completion validation OK"

$publicAfterLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/public/vehicles" -UseBasicParsing
if ($publicAfterLoan.Content -match $workflowPlate) {
  throw "Workflow vehicle remained public after loan processing"
}
$backOfficeAfterLoan = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -WebSession $session -UseBasicParsing
$loanVehicle = ($backOfficeAfterLoan.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $workflowVehicleId } | Select-Object -First 1
if ($loanVehicle.status -ne "LoanProcessing" -or $loanVehicle.isPublic -ne $false) {
  throw "Workflow vehicle did not stay loan-processing and private after loan update"
}
Write-Host "Loan status automation OK"

$bankFollowUpPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Disbursed"
  bossChecked = $false
  bankName = "Smoke Bank"
  bankFollowUpDate = "2026-05-30"
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$bankFollowUpPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $bankFollowUpPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($bankFollowUpPayment.StatusCode -lt 200 -or $bankFollowUpPayment.StatusCode -ge 300) {
  throw "Bank follow-up payment creation returned HTTP $($bankFollowUpPayment.StatusCode)"
}
$dashboardReminders = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
if ($dashboardReminders.Content -notmatch "PaymentBankFollowUp" -or $dashboardReminders.Content -notmatch $workflowPlate -or $dashboardReminders.Content -notmatch "52000") {
  throw "Dashboard reminders did not include due bank payment follow-up"
}
$filteredDashboardReminders = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders?type=PaymentBankFollowUp&due=Overdue" -WebSession $session -UseBasicParsing
$filteredDashboardReminderItems = $filteredDashboardReminders.Content | ConvertFrom-Json
if (-not ($filteredDashboardReminderItems | Where-Object { $_.type -eq "PaymentBankFollowUp" -and $_.vehiclePlate -eq $workflowPlate -and $_.amount -eq 52000 })) {
  throw "Filtered dashboard reminders did not include the overdue bank payment follow-up"
}
if ($filteredDashboardReminderItems | Where-Object { $_.type -ne "PaymentBankFollowUp" }) {
  throw "Filtered dashboard reminders included a reminder with the wrong type"
}
Write-Host "Payment bank follow-up reminder OK"

$statusFollowUpPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Approved"
  bossChecked = $false
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$statusFollowUpPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $statusFollowUpPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($statusFollowUpPayment.StatusCode -lt 200 -or $statusFollowUpPayment.StatusCode -ge 300) {
  throw "Payment status follow-up payment creation returned HTTP $($statusFollowUpPayment.StatusCode)"
}
$paymentStatusReminders = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
if ($paymentStatusReminders.Content -notmatch "PaymentStatusFollowUp" -or $paymentStatusReminders.Content -notmatch "Payment status follow-up: Approved" -or $paymentStatusReminders.Content -notmatch $workflowPlate) {
  throw "Dashboard reminders did not include pending/approved payment status follow-up"
}
Write-Host "Payment status follow-up reminder OK"

$workflowPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = "RCPT-$workflowSuffix"
  invoiceNumber = "PAYINV-$workflowSuffix"
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  salesPrice = 58000
  interestAdditionalCharges = 600
  ncdAmount = 1200
  windscreenCharges = 450
  outstationDeliveryDate = "2026-06-05"
  bankName = "Smoke Bank"
  bankFollowUpDate = "2026-05-31"
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$workflowPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $workflowPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($workflowPayment.StatusCode -lt 200 -or $workflowPayment.StatusCode -ge 300) {
  throw "Workflow payment creation returned HTTP $($workflowPayment.StatusCode)"
}
$createdWorkflowPayment = $workflowPayment.Content | ConvertFrom-Json
if ($createdWorkflowPayment.receiptNumber -ne "RCPT-$workflowSuffix" -or $createdWorkflowPayment.invoiceNumber -ne "PAYINV-$workflowSuffix" -or $createdWorkflowPayment.bossChecked -ne $true -or $createdWorkflowPayment.documentsPrepared -ne $true -or $createdWorkflowPayment.checklistValidated -ne $true -or $createdWorkflowPayment.invoiceGenerated -ne $true -or $createdWorkflowPayment.autoCountKeyed -ne $true -or $createdWorkflowPayment.bankName -ne "Smoke Bank" -or $createdWorkflowPayment.bankFollowUpDate -ne "2026-05-31" -or $createdWorkflowPayment.salesPrice -ne 58000 -or $createdWorkflowPayment.interestAdditionalCharges -ne 600 -or $createdWorkflowPayment.ncdAmount -ne 1200 -or $createdWorkflowPayment.windscreenCharges -ne 450 -or $createdWorkflowPayment.outstationDeliveryDate -ne "2026-06-05") {
  throw "Workflow payment did not preserve receipt, invoice, boss check, finance checklist, customer invoice detail, and bank follow-up metadata"
}

$updatedWorkflowPaymentBody = @{
  id = $createdWorkflowPayment.id
  vehicleId = $workflowVehicleId
  nettPrice = 52500
  status = "Reconciled"
  receiptNumber = "RCPT-$workflowSuffix"
  invoiceNumber = "PAYINV-$workflowSuffix"
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  salesPrice = 58500
  interestAdditionalCharges = 650
  ncdAmount = 1300
  windscreenCharges = 500
  outstationDeliveryDate = "2026-06-06"
  bankName = "Smoke Bank Corrected"
  bankFollowUpDate = "2026-06-02"
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$updatedWorkflowPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments/$($createdWorkflowPayment.id)" -Method Put -Body $updatedWorkflowPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedWorkflowPayment.StatusCode -lt 200 -or $updatedWorkflowPayment.StatusCode -ge 300) {
  throw "Workflow payment correction update returned HTTP $($updatedWorkflowPayment.StatusCode)"
}
$updatedWorkflowPaymentContent = $updatedWorkflowPayment.Content | ConvertFrom-Json
if ($updatedWorkflowPaymentContent.nettPrice -ne 52500 -or $updatedWorkflowPaymentContent.salesPrice -ne 58500 -or $updatedWorkflowPaymentContent.interestAdditionalCharges -ne 650 -or $updatedWorkflowPaymentContent.ncdAmount -ne 1300 -or $updatedWorkflowPaymentContent.windscreenCharges -ne 500 -or $updatedWorkflowPaymentContent.outstationDeliveryDate -ne "2026-06-06" -or $updatedWorkflowPaymentContent.bankName -ne "Smoke Bank Corrected" -or $updatedWorkflowPaymentContent.bankFollowUpDate -ne "2026-06-02") {
  throw "Workflow payment correction did not round trip customer invoice and bank metadata"
}
Write-Host "Payment update tracking OK"

$missingPaymentId = [guid]::NewGuid().ToString()
$missingPaymentUpdateBody = @{
  id = $missingPaymentId
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Pending"
  bossChecked = $false
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $missingPaymentUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments/$missingPaymentId" -Method Put -Body $missingPaymentUpdateBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $missingPaymentUpdateStatus = [int]$missingPaymentUpdate.StatusCode
}
catch {
  if ($_.Exception.Response) {
    $missingPaymentUpdateStatus = [int]$_.Exception.Response.StatusCode
  }
  else {
    throw
  }
}
if ($missingPaymentUpdateStatus -ne 404) {
  throw "Missing payment update returned HTTP $missingPaymentUpdateStatus instead of HTTP 404"
}
Write-Host "Missing payment update validation OK"

$invalidReconciledPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = " "
  invoiceNumber = ""
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $invalidReconciledPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $invalidReconciledPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidReconciledPaymentStatus = [int]$invalidReconciledPayment.StatusCode
  $invalidReconciledPaymentContent = $invalidReconciledPayment.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidReconciledPaymentStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidReconciledPaymentContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidReconciledPaymentStatus -ne 400 -or $invalidReconciledPaymentContent -notmatch "receipt_number_required" -or $invalidReconciledPaymentContent -notmatch "payment_invoice_number_required") {
  throw "Invalid reconciled payment returned HTTP $invalidReconciledPaymentStatus instead of receipt and invoice validation"
}
Write-Host "Payment receipt/invoice validation OK"

$uncheckedReconciledPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = "BOSSR-$workflowSuffix"
  invoiceNumber = "BOSSI-$workflowSuffix"
  bossChecked = $false
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $uncheckedReconciledPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $uncheckedReconciledPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $uncheckedReconciledPaymentStatus = [int]$uncheckedReconciledPayment.StatusCode
  $uncheckedReconciledPaymentContent = $uncheckedReconciledPayment.Content
}
catch {
  if ($_.Exception.Response) {
    $uncheckedReconciledPaymentStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $uncheckedReconciledPaymentContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($uncheckedReconciledPaymentStatus -ne 400 -or $uncheckedReconciledPaymentContent -notmatch "payment_boss_check_required") {
  throw "Unchecked reconciled payment returned HTTP $uncheckedReconciledPaymentStatus instead of boss check validation"
}
Write-Host "Payment boss check validation OK"

$uncheckedPaymentChecklistBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = "CHECKR-$workflowSuffix"
  invoiceNumber = "CHECKI-$workflowSuffix"
  bossChecked = $true
  documentsPrepared = $false
  checklistValidated = $false
  invoiceGenerated = $false
  autoCountKeyed = $false
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $uncheckedPaymentChecklist = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $uncheckedPaymentChecklistBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $uncheckedPaymentChecklistStatus = [int]$uncheckedPaymentChecklist.StatusCode
  $uncheckedPaymentChecklistContent = $uncheckedPaymentChecklist.Content
}
catch {
  if ($_.Exception.Response) {
    $uncheckedPaymentChecklistStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $uncheckedPaymentChecklistContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($uncheckedPaymentChecklistStatus -ne 400 -or $uncheckedPaymentChecklistContent -notmatch "payment_documents_prepared_required" -or $uncheckedPaymentChecklistContent -notmatch "payment_checklist_validated_required" -or $uncheckedPaymentChecklistContent -notmatch "payment_invoice_generated_required" -or $uncheckedPaymentChecklistContent -notmatch "payment_autocount_keyed_required") {
  throw "Unchecked payment checklist returned HTTP $uncheckedPaymentChecklistStatus instead of finance checklist validation"
}
Write-Host "Payment finance checklist validation OK"

$duplicatePaymentReferenceBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = " rcpt-$workflowSuffix "
  invoiceNumber = " payinv-$workflowSuffix "
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $duplicatePaymentReference = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $duplicatePaymentReferenceBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $duplicatePaymentReferenceStatus = [int]$duplicatePaymentReference.StatusCode
  $duplicatePaymentReferenceContent = $duplicatePaymentReference.Content
}
catch {
  if ($_.Exception.Response) {
    $duplicatePaymentReferenceStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $duplicatePaymentReferenceContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($duplicatePaymentReferenceStatus -ne 400 -or $duplicatePaymentReferenceContent -notmatch "duplicate_receipt_number" -or $duplicatePaymentReferenceContent -notmatch "duplicate_payment_invoice_number") {
  throw "Duplicate payment references returned HTTP $duplicatePaymentReferenceStatus instead of receipt and invoice duplicate validation"
}
Write-Host "Payment duplicate reference validation OK"

$invalidPaymentBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 0
  status = "Pending"
  bossChecked = $false
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $invalidPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $invalidPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidPaymentStatus = [int]$invalidPayment.StatusCode
  $invalidPaymentContent = $invalidPayment.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidPaymentStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidPaymentContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidPaymentStatus -ne 400 -or $invalidPaymentContent -notmatch "invalid_nett_price") {
  throw "Invalid payment returned HTTP $invalidPaymentStatus instead of invalid_nett_price validation"
}
Write-Host "Payment amount validation OK"

$invalidPaymentInvoiceDetailBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Pending"
  bossChecked = $false
  salesPrice = -1
  interestAdditionalCharges = -1
  ncdAmount = -1
  windscreenCharges = -1
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
try {
  $invalidPaymentInvoiceDetail = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments" -Method Post -Body $invalidPaymentInvoiceDetailBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidPaymentInvoiceDetailStatus = [int]$invalidPaymentInvoiceDetail.StatusCode
  $invalidPaymentInvoiceDetailContent = $invalidPaymentInvoiceDetail.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidPaymentInvoiceDetailStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidPaymentInvoiceDetailContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidPaymentInvoiceDetailStatus -ne 400 -or $invalidPaymentInvoiceDetailContent -notmatch "invalid_sales_price" -or $invalidPaymentInvoiceDetailContent -notmatch "invalid_interest_additional_charges" -or $invalidPaymentInvoiceDetailContent -notmatch "invalid_ncd_amount" -or $invalidPaymentInvoiceDetailContent -notmatch "invalid_windscreen_charges") {
  throw "Invalid payment invoice detail returned HTTP $invalidPaymentInvoiceDetailStatus instead of invoice detail validation"
}
Write-Host "Payment invoice detail validation OK"

$settlementId = [guid]::NewGuid().ToString()
$settlementBody = @{
  id = $settlementId
  vehicleId = $workflowVehicleId
  ownerId = $workflowOwnerId
  amount = 25000
  deadline = "2026-06-01"
  isPaid = $false
} | ConvertTo-Json
$settlement = Invoke-WebRequest -Uri "$ApiBaseUrl/api/settlement-reminders" -Method Post -Body $settlementBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($settlement.StatusCode -lt 200 -or $settlement.StatusCode -ge 300) {
  throw "Settlement creation returned HTTP $($settlement.StatusCode)"
}
$createdSettlement = $settlement.Content | ConvertFrom-Json
if ($createdSettlement.ownerId -ne $workflowOwnerId) {
  throw "Settlement reminder did not preserve the linked previous owner"
}
Write-Host "Settlement owner tracking OK"

$updatedSettlementBody = @{
  id = $createdSettlement.id
  vehicleId = $createdSettlement.vehicleId
  ownerId = $createdSettlement.ownerId
  amount = 25500
  deadline = "2026-06-03"
  isPaid = $true
} | ConvertTo-Json
$updatedSettlement = Invoke-WebRequest -Uri "$ApiBaseUrl/api/settlement-reminders/$($createdSettlement.id)" -Method Put -Body $updatedSettlementBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedSettlement.StatusCode -lt 200 -or $updatedSettlement.StatusCode -ge 300) {
  throw "Settlement update returned HTTP $($updatedSettlement.StatusCode)"
}
$updatedSettlementContent = $updatedSettlement.Content | ConvertFrom-Json
if ($updatedSettlementContent.amount -ne 25500 -or $updatedSettlementContent.deadline -ne "2026-06-03" -or $updatedSettlementContent.isPaid -ne $true -or $updatedSettlementContent.ownerId -ne $workflowOwnerId) {
  throw "Settlement update did not round trip amount, deadline, status, and owner"
}
Write-Host "Settlement update tracking OK"

$invalidSettlementBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  amount = 0
  deadline = "2026-06-01"
  isPaid = $false
} | ConvertTo-Json
try {
  $invalidSettlement = Invoke-WebRequest -Uri "$ApiBaseUrl/api/settlement-reminders" -Method Post -Body $invalidSettlementBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidSettlementStatus = [int]$invalidSettlement.StatusCode
  $invalidSettlementContent = $invalidSettlement.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidSettlementStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidSettlementContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidSettlementStatus -ne 400 -or $invalidSettlementContent -notmatch "invalid_settlement_amount") {
  throw "Invalid settlement returned HTTP $invalidSettlementStatus instead of invalid_settlement_amount validation"
}
Write-Host "Settlement amount validation OK"

$invalidSettlementDeadlineBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  amount = 25000
  deadline = "0001-01-01"
  isPaid = $false
} | ConvertTo-Json
try {
  $invalidSettlementDeadline = Invoke-WebRequest -Uri "$ApiBaseUrl/api/settlement-reminders" -Method Post -Body $invalidSettlementDeadlineBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidSettlementDeadlineStatus = [int]$invalidSettlementDeadline.StatusCode
  $invalidSettlementDeadlineContent = $invalidSettlementDeadline.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidSettlementDeadlineStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidSettlementDeadlineContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidSettlementDeadlineStatus -ne 400 -or $invalidSettlementDeadlineContent -notmatch "settlement_deadline_required") {
  throw "Invalid settlement deadline returned HTTP $invalidSettlementDeadlineStatus instead of settlement_deadline_required validation"
}
Write-Host "Settlement deadline validation OK"

$invalidSettlementOwnerBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  ownerId = [guid]::NewGuid().ToString()
  amount = 25000
  deadline = "2026-06-01"
  isPaid = $false
} | ConvertTo-Json
try {
  $invalidSettlementOwner = Invoke-WebRequest -Uri "$ApiBaseUrl/api/settlement-reminders" -Method Post -Body $invalidSettlementOwnerBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidSettlementOwnerStatus = [int]$invalidSettlementOwner.StatusCode
  $invalidSettlementOwnerContent = $invalidSettlementOwner.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidSettlementOwnerStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidSettlementOwnerContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidSettlementOwnerStatus -ne 400 -or $invalidSettlementOwnerContent -notmatch "unknown_settlement_owner") {
  throw "Invalid settlement owner returned HTTP $invalidSettlementOwnerStatus instead of unknown_settlement_owner validation"
}
Write-Host "Settlement owner validation OK"

$invalidDailySpendBody = @{
  id = [guid]::NewGuid().ToString()
  description = " "
  amount = 0
  dueDate = "0001-01-01"
  isPaid = $false
} | ConvertTo-Json
try {
  $invalidDailySpend = Invoke-WebRequest -Uri "$ApiBaseUrl/api/daily-spends" -Method Post -Body $invalidDailySpendBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidDailySpendStatus = [int]$invalidDailySpend.StatusCode
  $invalidDailySpendContent = $invalidDailySpend.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidDailySpendStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidDailySpendContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidDailySpendStatus -ne 400 -or $invalidDailySpendContent -notmatch "daily_spend_description_required" -or $invalidDailySpendContent -notmatch "invalid_daily_spend_amount" -or $invalidDailySpendContent -notmatch "daily_spend_due_date_required") {
  throw "Invalid daily spend returned HTTP $invalidDailySpendStatus instead of daily spend validation"
}
Write-Host "Daily spend validation OK"

$dailySpendId = [guid]::NewGuid().ToString()
$dailySpendBody = @{
  id = $dailySpendId
  description = "Electric Bill"
  amount = 480
  dueDate = "2026-05-30"
  isPaid = $false
} | ConvertTo-Json
$createdDailySpend = Invoke-WebRequest -Uri "$ApiBaseUrl/api/daily-spends" -Method Post -Body $dailySpendBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($createdDailySpend.StatusCode -lt 200 -or $createdDailySpend.StatusCode -ge 300) {
  throw "Daily spend create returned HTTP $($createdDailySpend.StatusCode)"
}
$dailySpendReminderInbox = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$dailySpendReminders = $dailySpendReminderInbox.Content | ConvertFrom-Json
if (-not ($dailySpendReminders | Where-Object { $_.type -eq "DailySpendDue" -and $_.title -match "Electric Bill" -and $_.amount -eq 480 })) {
  throw "Daily spend due reminder was not present after creating Electric Bill"
}
$updatedDailySpendBody = @{
  id = $dailySpendId
  description = "Electric Bill Corrected"
  amount = 520
  dueDate = "2026-05-31"
  isPaid = $false
} | ConvertTo-Json
$updatedDailySpend = Invoke-WebRequest -Uri "$ApiBaseUrl/api/daily-spends/$dailySpendId" -Method Put -Body $updatedDailySpendBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedDailySpend.StatusCode -lt 200 -or $updatedDailySpend.StatusCode -ge 300) {
  throw "Daily spend update returned HTTP $($updatedDailySpend.StatusCode)"
}
$updatedDailySpendContent = $updatedDailySpend.Content | ConvertFrom-Json
if ($updatedDailySpendContent.description -ne "Electric Bill Corrected" -or $updatedDailySpendContent.amount -ne 520 -or $updatedDailySpendContent.dueDate -ne "2026-05-31" -or $updatedDailySpendContent.isPaid -ne $false) {
  throw "Daily spend update did not round trip corrected description, amount, due date, and status"
}
Write-Host "Daily spend update tracking OK"
$paidDailySpendBody = @{
  id = $dailySpendId
  description = "Electric Bill Corrected"
  amount = 520
  dueDate = "2026-05-31"
  isPaid = $true
} | ConvertTo-Json
$paidDailySpend = Invoke-WebRequest -Uri "$ApiBaseUrl/api/daily-spends/$dailySpendId" -Method Put -Body $paidDailySpendBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($paidDailySpend.StatusCode -lt 200 -or $paidDailySpend.StatusCode -ge 300) {
  throw "Daily spend paid update returned HTTP $($paidDailySpend.StatusCode)"
}
$dailySpendReminderAfterPaid = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$dailySpendRemindersAfterPaid = $dailySpendReminderAfterPaid.Content | ConvertFrom-Json
if ($dailySpendRemindersAfterPaid | Where-Object { $_.type -eq "DailySpendDue" -and $_.title -match "Electric Bill Corrected" -and $_.amount -eq 520 }) {
  throw "Paid daily spend reminder was still present"
}
Write-Host "Daily spend reminder OK"

$invalidBrokerCommissionBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = [guid]::NewGuid().ToString()
  brokerName = " "
  amount = 0
  isPaid = $false
  cp58Required = $false
  cp58Prepared = $false
} | ConvertTo-Json
try {
  $invalidBrokerCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions" -Method Post -Body $invalidBrokerCommissionBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidBrokerCommissionStatus = [int]$invalidBrokerCommission.StatusCode
  $invalidBrokerCommissionContent = $invalidBrokerCommission.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidBrokerCommissionStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidBrokerCommissionContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidBrokerCommissionStatus -ne 400 -or $invalidBrokerCommissionContent -notmatch "vehicle_not_found" -or $invalidBrokerCommissionContent -notmatch "broker_name_required" -or $invalidBrokerCommissionContent -notmatch "invalid_broker_commission_amount") {
  throw "Invalid broker commission returned HTTP $invalidBrokerCommissionStatus instead of broker commission validation"
}
Write-Host "Broker commission validation OK"

$invalidBrokerCp58Body = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = $workflowVehicleId
  brokerName = "Smoke Broker"
  amount = 1200
  isPaid = $false
  cp58Required = $false
  cp58Prepared = $true
} | ConvertTo-Json
try {
  $invalidBrokerCp58 = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions" -Method Post -Body $invalidBrokerCp58Body -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidBrokerCp58Status = [int]$invalidBrokerCp58.StatusCode
  $invalidBrokerCp58Content = $invalidBrokerCp58.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidBrokerCp58Status = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidBrokerCp58Content = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidBrokerCp58Status -ne 400 -or $invalidBrokerCp58Content -notmatch "cp58_required_missing") {
  throw "Invalid broker CP58 state returned HTTP $invalidBrokerCp58Status instead of cp58_required_missing validation"
}
Write-Host "Broker commission CP58 validation OK"

$dashboardBeforeCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitBeforeCommission = Get-DashboardTotalProfit $dashboardBeforeCommission.Content
$brokerCommissionId = [guid]::NewGuid().ToString()
$brokerCommissionBody = @{
  id = $brokerCommissionId
  vehicleId = $workflowVehicleId
  brokerName = "Smoke Broker"
  amount = 1200
  isPaid = $false
  cp58Required = $true
  cp58Prepared = $false
} | ConvertTo-Json
$createdBrokerCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions" -Method Post -Body $brokerCommissionBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($createdBrokerCommission.StatusCode -lt 200 -or $createdBrokerCommission.StatusCode -ge 300) {
  throw "Broker commission creation returned HTTP $($createdBrokerCommission.StatusCode)"
}
$brokerCommissions = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions" -WebSession $session -UseBasicParsing
if ($brokerCommissions.Content -notmatch "Smoke Broker" -or $brokerCommissions.Content -notmatch "1200" -or $brokerCommissions.Content -notmatch "cp58Required") {
  throw "Broker commission list did not include the smoke broker commission"
}
$dashboardAfterCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitAfterCommission = Get-DashboardTotalProfit $dashboardAfterCommission.Content
if (($profitBeforeCommission - $profitAfterCommission) -ne 1200) {
  throw "Broker commission did not reduce total profit by RM 1200"
}
$updatedBrokerCommissionBody = @{
  id = $brokerCommissionId
  vehicleId = $workflowVehicleId
  brokerName = "Smoke Broker Corrected"
  amount = 1300
  isPaid = $false
  cp58Required = $true
  cp58Prepared = $false
} | ConvertTo-Json
$updatedBrokerCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions/$brokerCommissionId" -Method Put -Body $updatedBrokerCommissionBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedBrokerCommission.StatusCode -lt 200 -or $updatedBrokerCommission.StatusCode -ge 300) {
  throw "Broker commission update returned HTTP $($updatedBrokerCommission.StatusCode)"
}
$updatedBrokerCommissionContent = $updatedBrokerCommission.Content | ConvertFrom-Json
if ($updatedBrokerCommissionContent.brokerName -ne "Smoke Broker Corrected" -or $updatedBrokerCommissionContent.amount -ne 1300 -or $updatedBrokerCommissionContent.isPaid -ne $false -or $updatedBrokerCommissionContent.cp58Required -ne $true -or $updatedBrokerCommissionContent.cp58Prepared -ne $false) {
  throw "Broker commission update did not round trip corrected broker, amount, paid, and CP58 state"
}
$dashboardAfterCommissionUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitAfterCommissionUpdate = Get-DashboardTotalProfit $dashboardAfterCommissionUpdate.Content
if (($profitBeforeCommission - $profitAfterCommissionUpdate) -ne 1300) {
  throw "Updated broker commission did not reduce total profit by RM 1300"
}
Write-Host "Broker commission update tracking OK"
$paidBrokerCommissionBody = @{
  id = $brokerCommissionId
  vehicleId = $workflowVehicleId
  brokerName = "Smoke Broker Corrected"
  amount = 1300
  isPaid = $true
  cp58Required = $true
  cp58Prepared = $true
} | ConvertTo-Json
$paidBrokerCommission = Invoke-WebRequest -Uri "$ApiBaseUrl/api/broker-commissions/$brokerCommissionId" -Method Put -Body $paidBrokerCommissionBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($paidBrokerCommission.StatusCode -lt 200 -or $paidBrokerCommission.StatusCode -ge 300) {
  throw "Broker commission paid update returned HTTP $($paidBrokerCommission.StatusCode)"
}
$paidBrokerCommissionContent = $paidBrokerCommission.Content | ConvertFrom-Json
if ($paidBrokerCommissionContent.cp58Required -ne $true -or $paidBrokerCommissionContent.cp58Prepared -ne $true) {
  throw "Broker commission CP58 tracking did not round trip"
}
Write-Host "Broker commission profit tracking OK"
Write-Host "Broker commission CP58 tracking OK"

$invalidDebtRecoveryBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = [guid]::NewGuid().ToString()
  customerId = [guid]::NewGuid().ToString()
  balanceAmount = 0
  status = "Open"
  followUpDate = "0001-01-01"
  notes = "Invalid balance reminder"
} | ConvertTo-Json
try {
  $invalidDebtRecovery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/debt-recoveries" -Method Post -Body $invalidDebtRecoveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidDebtRecoveryStatus = [int]$invalidDebtRecovery.StatusCode
  $invalidDebtRecoveryContent = $invalidDebtRecovery.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidDebtRecoveryStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidDebtRecoveryContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidDebtRecoveryStatus -ne 400 -or $invalidDebtRecoveryContent -notmatch "vehicle_not_found" -or $invalidDebtRecoveryContent -notmatch "customer_not_found" -or $invalidDebtRecoveryContent -notmatch "invalid_debt_balance_amount" -or $invalidDebtRecoveryContent -notmatch "debt_follow_up_date_required") {
  throw "Invalid debt recovery returned HTTP $invalidDebtRecoveryStatus instead of debt recovery validation"
}
Write-Host "Debt recovery validation OK"

$debtRecoveryId = [guid]::NewGuid().ToString()
$debtRecoveryBody = @{
  id = $debtRecoveryId
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  balanceAmount = 3200
  status = "Open"
  followUpDate = "2026-05-30"
  notes = "Monthly balance reminder"
} | ConvertTo-Json
$createdDebtRecovery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/debt-recoveries" -Method Post -Body $debtRecoveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($createdDebtRecovery.StatusCode -lt 200 -or $createdDebtRecovery.StatusCode -ge 300) {
  throw "Debt recovery creation returned HTTP $($createdDebtRecovery.StatusCode)"
}
$debtRecoveryReminderInbox = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$debtRecoveryReminders = $debtRecoveryReminderInbox.Content | ConvertFrom-Json
if (-not ($debtRecoveryReminders | Where-Object { $_.type -eq "DebtRecoveryFollowUp" -and $_.vehiclePlate -eq $workflowPlate -and $_.amount -eq 3200 })) {
  throw "Debt recovery follow-up reminder was not present after creating balance case"
}
$updatedDebtRecoveryBody = @{
  id = $debtRecoveryId
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  balanceAmount = 3400
  status = "FollowedUp"
  followUpDate = "2026-05-31"
  notes = "Monthly balance reminder corrected"
} | ConvertTo-Json
$updatedDebtRecovery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/debt-recoveries/$debtRecoveryId" -Method Put -Body $updatedDebtRecoveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedDebtRecovery.StatusCode -lt 200 -or $updatedDebtRecovery.StatusCode -ge 300) {
  throw "Debt recovery update returned HTTP $($updatedDebtRecovery.StatusCode)"
}
$updatedDebtRecoveryContent = $updatedDebtRecovery.Content | ConvertFrom-Json
if ($updatedDebtRecoveryContent.balanceAmount -ne 3400 -or $updatedDebtRecoveryContent.status -ne "FollowedUp" -or $updatedDebtRecoveryContent.followUpDate -ne "2026-05-31" -or $updatedDebtRecoveryContent.notes -ne "Monthly balance reminder corrected") {
  throw "Debt recovery update did not round trip corrected balance, status, follow-up, and notes"
}
Write-Host "Debt recovery update tracking OK"
$closedDebtRecoveryBody = @{
  id = $debtRecoveryId
  vehicleId = $workflowVehicleId
  customerId = $workflowCustomerId
  balanceAmount = 3400
  status = "Closed"
  followUpDate = "2026-05-31"
  notes = "Balance paid"
} | ConvertTo-Json
$closedDebtRecovery = Invoke-WebRequest -Uri "$ApiBaseUrl/api/debt-recoveries/$debtRecoveryId" -Method Put -Body $closedDebtRecoveryBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($closedDebtRecovery.StatusCode -lt 200 -or $closedDebtRecovery.StatusCode -ge 300) {
  throw "Debt recovery close update returned HTTP $($closedDebtRecovery.StatusCode)"
}
$debtRecoveryReminderAfterClosed = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$debtRecoveryRemindersAfterClosed = $debtRecoveryReminderAfterClosed.Content | ConvertFrom-Json
if ($debtRecoveryRemindersAfterClosed | Where-Object { $_.type -eq "DebtRecoveryFollowUp" -and $_.vehiclePlate -eq $workflowPlate -and $_.amount -eq 3200 }) {
  throw "Closed debt recovery reminder was still present"
}
Write-Host "Debt recovery reminder OK"

$invalidPaymentVoucherBody = @{
  id = [guid]::NewGuid().ToString()
  vehicleId = [guid]::NewGuid().ToString()
  payeeName = " "
  amount = 0
  purpose = " "
  status = "Pending"
  issuedDate = "0001-01-01"
  notes = "Invalid voucher"
} | ConvertTo-Json
try {
  $invalidPaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payment-vouchers" -Method Post -Body $invalidPaymentVoucherBody -ContentType "application/json" -WebSession $session -UseBasicParsing
  $invalidPaymentVoucherStatus = [int]$invalidPaymentVoucher.StatusCode
  $invalidPaymentVoucherContent = $invalidPaymentVoucher.Content
}
catch {
  if ($_.Exception.Response) {
    $invalidPaymentVoucherStatus = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    try {
      $invalidPaymentVoucherContent = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  else {
    throw
  }
}
if ($invalidPaymentVoucherStatus -ne 400 -or $invalidPaymentVoucherContent -notmatch "vehicle_not_found" -or $invalidPaymentVoucherContent -notmatch "payment_voucher_payee_required" -or $invalidPaymentVoucherContent -notmatch "invalid_payment_voucher_amount" -or $invalidPaymentVoucherContent -notmatch "payment_voucher_purpose_required" -or $invalidPaymentVoucherContent -notmatch "payment_voucher_issued_date_required") {
  throw "Invalid payment voucher returned HTTP $invalidPaymentVoucherStatus instead of payment voucher validation"
}
Write-Host "Payment voucher validation OK"

$dashboardBeforePaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitBeforePaymentVoucher = Get-DashboardTotalProfit $dashboardBeforePaymentVoucher.Content
$paymentVoucherId = [guid]::NewGuid().ToString()
$paymentVoucherBody = @{
  id = $paymentVoucherId
  vehicleId = $workflowVehicleId
  payeeName = "Smoke Driver"
  amount = 180
  purpose = "Outstation Pickup Allowance"
  status = "Pending"
  issuedDate = "2026-05-31"
  notes = "Booking slip $workflowSuffix"
} | ConvertTo-Json
$createdPaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payment-vouchers" -Method Post -Body $paymentVoucherBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($createdPaymentVoucher.StatusCode -lt 200 -or $createdPaymentVoucher.StatusCode -ge 300) {
  throw "Payment voucher creation returned HTTP $($createdPaymentVoucher.StatusCode)"
}
$paymentVouchers = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payment-vouchers" -WebSession $session -UseBasicParsing
if ($paymentVouchers.Content -notmatch "Smoke Driver" -or $paymentVouchers.Content -notmatch "180") {
  throw "Payment voucher list did not include the smoke pickup allowance"
}
$dashboardAfterPaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitAfterPaymentVoucher = Get-DashboardTotalProfit $dashboardAfterPaymentVoucher.Content
if (($profitBeforePaymentVoucher - $profitAfterPaymentVoucher) -ne 180) {
  throw "Payment voucher did not reduce total profit by RM 180"
}
$paymentVoucherReminderInbox = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$paymentVoucherReminders = $paymentVoucherReminderInbox.Content | ConvertFrom-Json
if (-not ($paymentVoucherReminders | Where-Object { $_.type -eq "PaymentVoucherFollowUp" -and $_.vehiclePlate -eq $workflowPlate -and $_.amount -eq 180 })) {
  throw "Dashboard reminders did not include open payment voucher follow-up"
}
$updatedPaymentVoucherBody = @{
  id = $paymentVoucherId
  vehicleId = $workflowVehicleId
  payeeName = "Smoke Driver Corrected"
  amount = 220
  purpose = "Outstation Pickup Allowance Corrected"
  status = "Approved"
  issuedDate = "2026-06-01"
  notes = "Corrected booking slip $workflowSuffix"
} | ConvertTo-Json
$updatedPaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payment-vouchers/$paymentVoucherId" -Method Put -Body $updatedPaymentVoucherBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($updatedPaymentVoucher.StatusCode -lt 200 -or $updatedPaymentVoucher.StatusCode -ge 300) {
  throw "Payment voucher update returned HTTP $($updatedPaymentVoucher.StatusCode)"
}
$updatedPaymentVoucherContent = $updatedPaymentVoucher.Content | ConvertFrom-Json
if ($updatedPaymentVoucherContent.payeeName -ne "Smoke Driver Corrected" -or $updatedPaymentVoucherContent.amount -ne 220 -or $updatedPaymentVoucherContent.purpose -ne "Outstation Pickup Allowance Corrected" -or $updatedPaymentVoucherContent.status -ne "Approved" -or $updatedPaymentVoucherContent.issuedDate -ne "2026-06-01" -or $updatedPaymentVoucherContent.notes -ne "Corrected booking slip $workflowSuffix") {
  throw "Payment voucher update did not round trip corrected payee, amount, purpose, status, issue date, and notes"
}
$dashboardAfterPaymentVoucherUpdate = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/summary" -WebSession $session -UseBasicParsing
$profitAfterPaymentVoucherUpdate = Get-DashboardTotalProfit $dashboardAfterPaymentVoucherUpdate.Content
if (($profitBeforePaymentVoucher - $profitAfterPaymentVoucherUpdate) -ne 220) {
  throw "Updated payment voucher did not reduce total profit by RM 220"
}
Write-Host "Payment voucher update tracking OK"
$paidPaymentVoucherBody = @{
  id = $paymentVoucherId
  vehicleId = $workflowVehicleId
  payeeName = "Smoke Driver Corrected"
  amount = 220
  purpose = "Outstation Pickup Allowance Corrected"
  status = "Paid"
  issuedDate = "2026-06-01"
  notes = "Corrected booking slip $workflowSuffix"
} | ConvertTo-Json
$paidPaymentVoucher = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payment-vouchers/$paymentVoucherId" -Method Put -Body $paidPaymentVoucherBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($paidPaymentVoucher.StatusCode -lt 200 -or $paidPaymentVoucher.StatusCode -ge 300) {
  throw "Payment voucher paid update returned HTTP $($paidPaymentVoucher.StatusCode)"
}
$paymentVoucherReminderAfterPaid = Invoke-WebRequest -Uri "$ApiBaseUrl/api/dashboard/reminders" -WebSession $session -UseBasicParsing
$paymentVoucherRemindersAfterPaid = $paymentVoucherReminderAfterPaid.Content | ConvertFrom-Json
if ($paymentVoucherRemindersAfterPaid | Where-Object { $_.type -eq "PaymentVoucherFollowUp" -and $_.vehiclePlate -eq $workflowPlate -and $_.amount -eq 220 }) {
  throw "Paid payment voucher reminder was still present"
}
Write-Host "Payment voucher workflow OK"
Write-Host "Payment voucher reminder OK"

$backOfficeVehicles = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -WebSession $session -UseBasicParsing
$soldVehicle = ($backOfficeVehicles.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $workflowVehicleId } | Select-Object -First 1
if ($null -eq $soldVehicle -or $soldVehicle.status -ne "Sold" -or $soldVehicle.isPublic -ne $false) {
  throw "Workflow vehicle was not marked Sold and private after reconciled payment"
}

$correctedPaymentBody = @{
  id = $createdWorkflowPayment.id
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Disbursed"
  receiptNumber = "RCPT-$workflowSuffix"
  invoiceNumber = "PAYINV-$workflowSuffix"
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  salesPrice = 58000
  interestAdditionalCharges = 600
  ncdAmount = 1200
  windscreenCharges = 450
  outstationDeliveryDate = "2026-06-05"
  bankName = "Smoke Bank"
  bankFollowUpDate = "2026-05-31"
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$correctedPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments/$($createdWorkflowPayment.id)" -Method Put -Body $correctedPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($correctedPayment.StatusCode -lt 200 -or $correctedPayment.StatusCode -ge 300) {
  throw "Corrected payment update returned HTTP $($correctedPayment.StatusCode)"
}
$backOfficeVehiclesAfterCorrection = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -WebSession $session -UseBasicParsing
$correctedVehicle = ($backOfficeVehiclesAfterCorrection.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $workflowVehicleId } | Select-Object -First 1
if ($null -eq $correctedVehicle -or $correctedVehicle.status -ne "LoanProcessing" -or $correctedVehicle.isPublic -ne $false) {
  throw "Workflow vehicle was not returned to LoanProcessing and private after payment reconciliation correction"
}

$reconciledAgainPaymentBody = @{
  id = $createdWorkflowPayment.id
  vehicleId = $workflowVehicleId
  nettPrice = 52000
  status = "Reconciled"
  receiptNumber = "RCPT-$workflowSuffix"
  invoiceNumber = "PAYINV-$workflowSuffix"
  bossChecked = $true
  documentsPrepared = $true
  checklistValidated = $true
  invoiceGenerated = $true
  autoCountKeyed = $true
  salesPrice = 58000
  interestAdditionalCharges = 600
  ncdAmount = 1200
  windscreenCharges = 450
  outstationDeliveryDate = "2026-06-05"
  bankName = "Smoke Bank"
  bankFollowUpDate = "2026-05-31"
  createdAt = "2026-05-30T00:00:00Z"
} | ConvertTo-Json
$reconciledAgainPayment = Invoke-WebRequest -Uri "$ApiBaseUrl/api/payments/$($createdWorkflowPayment.id)" -Method Put -Body $reconciledAgainPaymentBody -ContentType "application/json" -WebSession $session -UseBasicParsing
if ($reconciledAgainPayment.StatusCode -lt 200 -or $reconciledAgainPayment.StatusCode -ge 300) {
  throw "Reconciled payment correction returned HTTP $($reconciledAgainPayment.StatusCode)"
}
$backOfficeVehiclesAfterReconcile = Invoke-WebRequest -Uri "$ApiBaseUrl/api/vehicles" -WebSession $session -UseBasicParsing
$reconciledAgainVehicle = ($backOfficeVehiclesAfterReconcile.Content | ConvertFrom-Json) | Where-Object { $_.id -eq $workflowVehicleId } | Select-Object -First 1
if ($null -eq $reconciledAgainVehicle -or $reconciledAgainVehicle.status -ne "Sold" -or $reconciledAgainVehicle.isPublic -ne $false) {
  throw "Workflow vehicle was not marked Sold and private after corrected payment was reconciled again"
}
Write-Host "Payment status automation OK"

Write-Host "YS Heng stack smoke test passed."
