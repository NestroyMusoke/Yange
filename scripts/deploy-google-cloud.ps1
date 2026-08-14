[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,

  [string]$AppRegion = 'africa-south1',
  [string]$TaskRegion = 'me-central1',
  [string]$VertexLocation = 'global',
  [string]$GeminiModel = 'gemini-3.5-flash',
  [string]$CalendarId = ''
)

$ErrorActionPreference = 'Stop'
$Repository = 'yange'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Registry = "$AppRegion-docker.pkg.dev/$ProjectId/$Repository"
$ApiImage = "$Registry/yange-api:$Timestamp"
$AgentImage = "$Registry/yange-steward:$Timestamp"
$TerraformDirectory = Join-Path $PSScriptRoot '..\infra\terraform'
$WorkspaceRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

foreach ($command in @('gcloud', 'terraform')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required but was not found on PATH. See docs/google-cloud-setup.md."
  }
}

gcloud config set project $ProjectId
gcloud services enable `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  run.googleapis.com `
  serviceusage.googleapis.com

$existingRepository = gcloud artifacts repositories describe $Repository `
  --location $AppRegion `
  --format 'value(name)' 2>$null
if (-not $existingRepository) {
  gcloud artifacts repositories create $Repository `
    --location $AppRegion `
    --repository-format docker `
    --description 'Immutable Yange hackathon images'
}

gcloud builds submit $WorkspaceRoot --tag $ApiImage
gcloud builds submit (Join-Path $WorkspaceRoot 'services\yange_steward') --tag $AgentImage

$secretBytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$sessionSecret = [Convert]::ToBase64String($secretBytes)
$previousTerraformSessionSecret = [Environment]::GetEnvironmentVariable('TF_VAR_session_secret', 'Process')
$env:TF_VAR_session_secret = $sessionSecret

Push-Location $TerraformDirectory
try {
  terraform init
  terraform validate
  terraform apply `
    -var="project_id=$ProjectId" `
    -var="app_region=$AppRegion" `
    -var="task_region=$TaskRegion" `
    -var="vertex_location=$VertexLocation" `
    -var="gemini_model=$GeminiModel" `
    -var="api_image=$ApiImage" `
    -var="agent_image=$AgentImage" `
    -var="calendar_id=$CalendarId"

  $edgeUrl = terraform output -raw edge_url
  $workerUrl = terraform output -raw worker_url
  $agentUrl = terraform output -raw agent_url
  $mediaBucket = terraform output -raw media_bucket
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
  @(
    @{
      origin = @($edgeUrl)
      method = @('GET', 'PUT')
      responseHeader = @('Content-Type', 'ETag')
      maxAgeSeconds = 600
    }
  ) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $corsPath -Encoding utf8
  gcloud storage buckets update "gs://$mediaBucket" --cors-file $corsPath
} finally {
  Remove-Item -LiteralPath $corsPath -ErrorAction SilentlyContinue
}

$health = Invoke-RestMethod -Uri "$edgeUrl/healthz"
$runtime = Invoke-RestMethod -Uri "$edgeUrl/v1/runtime" -SessionVariable yangeSession

Write-Host "Yange edge: $edgeUrl"
Write-Host "Yange worker (private): $workerUrl"
Write-Host "Yange ADK agent (private): $agentUrl"
Write-Host "Health: $($health.status)"
Write-Host "Runtime: $($runtime.configuration.mode) / $($runtime.readiness.ready)"
Write-Host 'Deployment finished. Capture Cloud Run, Firestore, Vertex AI, Tasks, and Logging proof for the demo.'
