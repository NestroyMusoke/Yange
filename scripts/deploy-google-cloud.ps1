[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,

  [string]$AppRegion = 'africa-south1',
  [string]$TaskRegion = 'me-central1',
  [string]$VertexLocation = 'global',
  [string]$GeminiModel = 'gemini-3.5-flash',
  [string]$CalendarId = '',
  [string]$ImageTag = '',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$Repository = 'yange'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ResolvedImageTag = if ($ImageTag) { $ImageTag } else { $Timestamp }
$Registry = "$AppRegion-docker.pkg.dev/$ProjectId/$Repository"
$ApiImage = "$Registry/yange-api:$ResolvedImageTag"
$AgentImage = "$Registry/yange-steward:$ResolvedImageTag"
$TerraformDirectory = Join-Path $PSScriptRoot '..\infra\terraform'
$WorkspaceRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Assert-NativeSuccess {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ExitCode,

    [Parameter(Mandatory = $true)]
    [string]$Operation
  )

  if ($ExitCode -ne 0) {
    throw "$Operation failed with exit code $ExitCode."
  }
}

foreach ($command in @('gcloud', 'terraform')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required but was not found on PATH. See docs/google-cloud-setup.md."
  }
}

if ($SkipBuild -and -not $ImageTag) {
  throw '-ImageTag is required when -SkipBuild is used.'
}

gcloud config set project $ProjectId
Assert-NativeSuccess $LASTEXITCODE 'Selecting the Google Cloud project'
gcloud services enable `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  run.googleapis.com `
  serviceusage.googleapis.com
Assert-NativeSuccess $LASTEXITCODE 'Enabling bootstrap Google Cloud APIs'

$repositorySuffix = "/repositories/$Repository"
$existingRepository = @(
  gcloud artifacts repositories list `
    --location $AppRegion `
    --format 'value(name)'
) | Where-Object {
  $_ -eq $Repository -or $_.EndsWith($repositorySuffix, [StringComparison]::Ordinal)
} | Select-Object -First 1
Assert-NativeSuccess $LASTEXITCODE 'Listing Artifact Registry repositories'
if (-not $existingRepository) {
  gcloud artifacts repositories create $Repository `
    --location $AppRegion `
    --repository-format docker `
    --description 'Immutable Yange hackathon images'
  Assert-NativeSuccess $LASTEXITCODE 'Creating the Yange Artifact Registry repository'
}

if (-not $SkipBuild) {
  gcloud builds submit $WorkspaceRoot --tag $ApiImage
  Assert-NativeSuccess $LASTEXITCODE 'Building the Yange API image'
  gcloud builds submit (Join-Path $WorkspaceRoot 'services\yange_steward') --tag $AgentImage
  Assert-NativeSuccess $LASTEXITCODE 'Building the Yange ADK steward image'
}

$secretBytes = New-Object byte[] 48
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomNumberGenerator.GetBytes($secretBytes)
} finally {
  $randomNumberGenerator.Dispose()
}
$sessionSecret = [Convert]::ToBase64String($secretBytes)
$previousTerraformSessionSecret = [Environment]::GetEnvironmentVariable('TF_VAR_session_secret', 'Process')
$env:TF_VAR_session_secret = $sessionSecret

Push-Location $TerraformDirectory
try {
  terraform init
  Assert-NativeSuccess $LASTEXITCODE 'Initializing Terraform'
  terraform validate
  Assert-NativeSuccess $LASTEXITCODE 'Validating Terraform'
  terraform apply `
    -var="project_id=$ProjectId" `
    -var="app_region=$AppRegion" `
    -var="task_region=$TaskRegion" `
    -var="vertex_location=$VertexLocation" `
    -var="gemini_model=$GeminiModel" `
    -var="api_image=$ApiImage" `
    -var="agent_image=$AgentImage" `
    -var="calendar_id=$CalendarId"
  Assert-NativeSuccess $LASTEXITCODE 'Applying the Yange Google Cloud infrastructure'

  $edgeUrl = terraform output -raw edge_url
  Assert-NativeSuccess $LASTEXITCODE 'Reading the public edge URL'
  $workerUrl = terraform output -raw worker_url
  Assert-NativeSuccess $LASTEXITCODE 'Reading the private worker URL'
  $agentUrl = terraform output -raw agent_url
  Assert-NativeSuccess $LASTEXITCODE 'Reading the private ADK agent URL'
  $mediaBucket = terraform output -raw media_bucket
  Assert-NativeSuccess $LASTEXITCODE 'Reading the media bucket name'
} finally {
  Pop-Location
  if ($null -eq $previousTerraformSessionSecret) {
    Remove-Item Env:TF_VAR_session_secret -ErrorAction SilentlyContinue
  } else {
    $env:TF_VAR_session_secret = $previousTerraformSessionSecret
  }
}
[Array]::Clear($secretBytes, 0, $secretBytes.Length)
$sessionSecret = $null

$corsPath = Join-Path ([System.IO.Path]::GetTempPath()) "yange-cors-$Timestamp.json"
try {
  $corsConfiguration = @(
    @{
      origin = @($edgeUrl)
      method = @('GET', 'PUT')
      responseHeader = @('Content-Type', 'ETag')
      maxAgeSeconds = 600
    }
  )
  ConvertTo-Json -InputObject $corsConfiguration -Depth 4 |
    Set-Content -LiteralPath $corsPath -Encoding ascii
  gcloud storage buckets update "gs://$mediaBucket" --cors-file $corsPath
  Assert-NativeSuccess $LASTEXITCODE 'Applying media bucket CORS'
} finally {
  Remove-Item -LiteralPath $corsPath -ErrorAction SilentlyContinue
}

$health = Invoke-RestMethod -Uri "$edgeUrl/health"
$runtime = Invoke-RestMethod -Uri "$edgeUrl/v1/runtime" -SessionVariable yangeSession

Write-Host "Yange edge: $edgeUrl"
Write-Host "Yange worker (private): $workerUrl"
Write-Host "Yange ADK agent (private): $agentUrl"
Write-Host "Health: $($health.status)"
Write-Host "Runtime: $($runtime.configuration.mode) / $($runtime.readiness.ready)"
Write-Host 'Deployment finished. Capture Cloud Run, Firestore, Vertex AI, Tasks, and Logging proof for the demo.'
