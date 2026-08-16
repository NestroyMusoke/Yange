param(
  [switch]$SkipAudit,
  [switch]$SkipTerraform
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Gate {
  param(
    [string]$Name,
    [scriptblock]$Command
  )
  Write-Host "`n[$Name]" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
  Write-Host "$Name passed." -ForegroundColor Green
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  throw "Yange requires Node 22 or newer; found $(node --version)."
}

Invoke-Gate 'TypeScript tests' { npm.cmd test }
Invoke-Gate 'Strict typecheck' { npm.cmd run typecheck }
Invoke-Gate 'Production build' { npm.cmd run build }

if (-not $SkipAudit) {
  Invoke-Gate 'High-severity dependency audit' { npm.cmd audit --audit-level=high }
}

if (Get-Command python -ErrorAction SilentlyContinue) {
  Invoke-Gate 'ADK policy tests' { python -m pytest -q services/yange_steward/tests }
} else {
  Write-Warning 'Python was not found; ADK policy tests were not run.'
}

if (-not $SkipTerraform) {
  if (Get-Command terraform -ErrorAction SilentlyContinue) {
    Invoke-Gate 'Terraform formatting' { terraform fmt -check -recursive infra/terraform }
    Invoke-Gate 'Terraform provider initialisation' { terraform -chdir=infra/terraform init -backend=false -input=false }
    Invoke-Gate 'Terraform validation' { terraform -chdir=infra/terraform validate }
  } else {
    Write-Warning 'Terraform was not found; infrastructure validation was not run.'
  }
}

$trackedSecrets = git ls-files | Where-Object {
  $_ -notmatch '(^|/)\.env\.example$' -and
  $_ -match '(^|/)(\.env($|\.)|.*credentials.*\.json$|.*service-account.*\.json$|.*\.tfstate($|\.))'
}
if ($trackedSecrets) {
  throw "Potential credential/state files are tracked:`n$trackedSecrets"
}

Write-Host "`nYange Phase 6 verification passed." -ForegroundColor Green
