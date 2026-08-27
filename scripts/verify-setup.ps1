#Requires -Version 7.0
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Fail([string]$Msg) {
  Write-Host "verify-setup: FAIL - $Msg" -ForegroundColor Red
  exit 1
}

$setupPath = Join-Path $RepoRoot 'scripts/setup.ps1'
if (-not (Test-Path $setupPath)) { Fail 'scripts/setup.ps1 is missing' }

Write-Host 'verify-setup: parsing scripts/setup.ps1 and scripts/verify-setup.ps1'
foreach ($file in @('scripts/setup.ps1', 'scripts/verify-setup.ps1')) {
  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $RepoRoot $file), [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors -and $parseErrors.Count -gt 0) {
    Fail "$file has parse errors: $($parseErrors[0].Message)"
  }
}

$content = Get-Content -Raw $setupPath
if ($content -notmatch '\[switch\]\$DryRun') { Fail 'setup.ps1 is missing the -DryRun switch' }
if ($content -notmatch '\.env\.local') { Fail 'setup.ps1 does not write .env.local' }
if ($content -notmatch 'Read-Host[^|]*-AsSecureString') { Fail 'setup.ps1 does not prompt for secrets with Read-Host -AsSecureString' }
if ($content -match 'gsk_[A-Za-z0-9]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}') {
  Fail 'setup.ps1 appears to contain a hard-coded API key'
}
if ($content -match '(?i)pg_isready|postgres|hermes') {
  Fail 'setup.ps1 references database/hermes tooling it must not install'
}
$leaked = @($content -split "`n" | Where-Object {
    $_ -match '(Write-Host|Write-Output|\bSay\b|\bNote\b|\bOk\b|\bWarn\b|\bFail\b)[^\n]*\$(GroqKey|PlkKey)\b'
  })
if ($leaked.Count -gt 0) { Fail "setup.ps1 echoes a secret variable: $($leaked[0].Trim())" }

Write-Host 'verify-setup: dry-run #1 (no installs, no writes, no network)'
& $setupPath -DryRun
if (-not $?) { Fail 'setup.ps1 -DryRun exited non-zero' }

Write-Host 'verify-setup: dry-run #2 (idempotent re-run)'
& $setupPath -DryRun
if (-not $?) { Fail 'setup.ps1 -DryRun is not idempotent' }

Write-Host 'verify-setup: OK' -ForegroundColor Green
