#Requires -Version 7.0
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$TotalStages = 8
$StageIndex = 0
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot '.env.local'
$RailopsDir = Join-Path $RepoRoot '.railops'
$DevUrl = 'http://localhost:3000'
$HindsightUrl = 'http://localhost:8888'
$WrittenEnv = @()
$DevProc = $null
$HindsightProc = $null
$PkgMgr = ''
$PythonBin = ''

Set-Location $RepoRoot

function Say([string]$Msg) { Write-Host "  $Msg" }
function Note([string]$Msg) { Write-Host "  $Msg" -ForegroundColor DarkGray }
function Ok([string]$Msg) { Write-Host "  [ok] $Msg" -ForegroundColor Green }
function Warn([string]$Msg) { Write-Host "  [!] $Msg" -ForegroundColor Yellow }

function Stage([string]$Name) {
  $script:StageIndex++
  if (-not $DryRun -and [Environment]::UserInteractive) { Clear-Host -ErrorAction SilentlyContinue }
  Write-Host ''
  Write-Host "  Stage $script:StageIndex/$TotalStages - $Name" -ForegroundColor Blue
}

function Fail([string]$Msg, [string]$Next = '') {
  Write-Host "  [x] $Msg" -ForegroundColor Red
  if ($Next) { Write-Host "  next -> $Next" -ForegroundColor Yellow }
  exit 1
}

function Run([string]$Exe, [string[]]$ExeArgs) {
  if ($DryRun) { Say "[dry-run] would run: $Exe $($ExeArgs -join ' ')"; return }
  & $Exe @ExeArgs
  if ($LASTEXITCODE -ne 0) { throw "$Exe exited with code $LASTEXITCODE" }
}

function Confirm-Yes([string]$Question) {
  if ($DryRun) { return $false }
  if (-not [Environment]::UserInteractive) { return $false }
  $reply = Read-Host "  ? $Question [y/N]"
  return $reply -match '^[Yy]'
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host "  $Prompt" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Get-EnvValue([string]$Key) {
  if (-not (Test-Path $EnvFile)) { return '' }
  $found = @(Get-Content $EnvFile | Where-Object { $_ -match "^$Key=" })
  if ($found.Count -eq 0) { return '' }
  return ($found[-1] -replace "^$Key=", '')
}

function Set-EnvLocal([string]$Key, [string]$Value) {
  if ($DryRun) { Say "[dry-run] would write $Key -> $EnvFile (value hidden)"; return }
  $lines = @()
  if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile | Where-Object { $_ -notmatch "^$Key=" }) }
  $lines += "$Key=$Value"
  Set-Content -LiteralPath $EnvFile -Value $lines -Encoding utf8
  $script:WrittenEnv += $Key
  Ok "wrote $Key -> $EnvFile"
}

function Wait-ForHttp([string]$Url, [int]$Tries) {
  for ($i = 0; $i -lt $Tries; $i++) {
    try {
      $null = Invoke-WebRequest -Uri $Url -TimeoutSec 10 -UseBasicParsing
      return $true
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Require-Command([string]$Name, [string]$Hint) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail "required command '$Name' not found" $Hint }
  Ok "$Name found: $($cmd.Source)"
  return $cmd
}

Write-Host ''
Write-Host '  RailOps local setup' -ForegroundColor Blue
Write-Host "  $TotalStages stages - safe to re-run - Ctrl-C anytime, then re-run to resume" -ForegroundColor DarkGray
if ($DryRun) { Write-Host '  [dry-run] no installs, no writes, no network, no prompts' -ForegroundColor Yellow }
Write-Host ''
if (-not $DryRun -and [Environment]::UserInteractive) {
  $null = Read-Host '  Press Enter to start'
}

Stage 'Preflight'
Say "OS: Windows ($env:PROCESSOR_ARCHITECTURE)"
Require-Command node 'install Node.js 20+ from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS)'
$nodeMajor = & node -p 'process.versions.node.split(".")[0]' | Select-Object -Last 1
if ([int]$nodeMajor -lt 20) { Fail 'Node.js 20+ required' "upgrade from https://nodejs.org (found $nodeMajor)" }
Ok "node $(node --version)"
if (Get-Command npm -ErrorAction SilentlyContinue) { $PkgMgr = 'npm' }
elseif (Get-Command pnpm -ErrorAction SilentlyContinue) { $PkgMgr = 'pnpm' }
else { Fail 'neither npm nor pnpm found' 'install Node.js (bundles npm): https://nodejs.org' }
Ok "package manager: $PkgMgr"
function Test-Python([string]$Bin) {
  if (-not (Get-Command $Bin -ErrorAction SilentlyContinue)) { return $false }
  try {
    $out = (& $Bin --version 2>&1 | Out-String)
    return $out -match 'Python \d+\.'
  }
  catch { return $false }
}
if (Test-Python 'python3') { $PythonBin = 'python3' }
elseif (Test-Python 'python') { $PythonBin = 'python' }
else { Fail 'python not found (the Windows Store app alias does not count)' 'install Python 3.10+: winget install Python.Python.3.12 or https://python.org' }
Ok "$PythonBin $(& $PythonBin --version 2>&1)"
Require-Command git 'install Git: winget install Git.Git or https://git-scm.com'
Require-Command npx 'npx ships with npm; reinstall Node.js from https://nodejs.org'
if (Get-Command ctx7 -ErrorAction SilentlyContinue) { Ok 'ctx7 found' }
else { Warn 'ctx7 not found - only needed for docs lookups; setup continues' }
if ($DryRun) {
  Say "[dry-run] would ensure writable directories: repo root, $RailopsDir, knowledge"
}
else {
  foreach ($dir in @($RepoRoot, $RailopsDir, (Join-Path $RepoRoot 'knowledge'))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $probe = Join-Path $dir ".write-test-$PID"
    try {
      Set-Content -LiteralPath $probe -Value 'ok'
      Remove-Item -LiteralPath $probe
    }
    catch {
      Fail "directory $dir is not writable" "check permissions on $dir"
    }
  }
  Ok "writable: repo root, $RailopsDir, knowledge"
}

Stage 'Install dependencies'
$nodeModules = Join-Path $RepoRoot 'node_modules'
$lockFile = Join-Path $RepoRoot 'package-lock.json'
$nodeModulesFresh = (Test-Path $nodeModules) -and (
  (-not (Test-Path $lockFile)) -or
  ((Get-Item $lockFile).LastWriteTime -le (Get-Item $nodeModules).LastWriteTime)
)
if ($nodeModulesFresh) {
  Ok 'node_modules present and not stale - skipping (force: Remove-Item -Recurse -Force node_modules; npm install)'
}
else {
  try { Run $PkgMgr @('install') }
  catch { Fail "$PkgMgr install failed" "$PkgMgr cache clean --force; $PkgMgr install" }
}

Stage "Secrets -> $EnvFile"
Say 'GROQ_API_KEY (required) - create one at https://console.groq.com/keys'
if ($DryRun) {
  if (Get-EnvValue 'GROQ_API_KEY') { Say "[dry-run] GROQ_API_KEY already in $EnvFile - would keep it" }
  else { Say "[dry-run] would prompt for GROQ_API_KEY (hidden input) and write it to $EnvFile" }
  Say '[dry-run] would offer optional PLK_API_KEY (declining keeps deterministic cassettes)'
}
else {
  $keepGroq = $false
  if (Get-EnvValue 'GROQ_API_KEY') {
    if (Confirm-Yes "GROQ_API_KEY is already set in $EnvFile - keep it?") { $keepGroq = $true }
  }
  if ($keepGroq) {
    Ok "kept existing GROQ_API_KEY in $EnvFile"
  }
  else {
    $GroqKey = Read-Secret 'Paste your Groq API key (input hidden):'
    if (-not $GroqKey) { Fail 'GROQ_API_KEY is required' 'create a key at https://console.groq.com/keys, then re-run: pwsh ./scripts/setup.ps1' }
    Set-EnvLocal 'GROQ_API_KEY' $GroqKey
    $GroqKey = $null
  }
  if (Get-EnvValue 'PLK_API_KEY') {
    Ok "kept existing PLK_API_KEY in $EnvFile"
  }
  elseif (Confirm-Yes "Configure live PLK route data? (needs PLK_API_KEY; 'no' uses deterministic cassettes)") {
    $PlkKey = Read-Secret 'Paste your PLK API key (input hidden):'
    if ($PlkKey) { Set-EnvLocal 'PLK_API_KEY' $PlkKey }
    else { Warn 'empty PLK_API_KEY - continuing with cassettes' }
    $PlkKey = $null
  }
  else {
    Ok 'PLK_API_KEY skipped - deterministic cassettes under cassettes/plk/ will be used'
  }
}

Stage 'Generate BAML client'
if (Test-Path (Join-Path $RepoRoot 'baml_client')) {
  Ok 'baml_client/ exists - skipping (force: npm run baml:generate)'
}
else {
  try { Run npm @('run', 'baml:generate') }
  catch { Fail 'BAML generation failed' 'check baml_src/*.baml, then re-run: npm run baml:generate' }
}

Stage 'Build knowledge index'
if (Test-Path (Join-Path $RepoRoot 'knowledge/index.json')) {
  Ok 'knowledge/index.json exists - skipping (force: npm run knowledge:index)'
}
else {
  try { Run npm @('run', 'knowledge:index') }
  catch { Fail 'knowledge index build failed' 'check knowledge/*.md, then re-run: npm run knowledge:index' }
}

Stage 'Local memory (Hindsight)'
if ($DryRun) {
  Say "[dry-run] would: $PythonBin -m pip install hindsight-all (only if hindsight-api is missing)"
  Say "[dry-run] would: start hindsight-api at $HindsightUrl (log: $RailopsDir\hindsight-api.log)"
  Say "[dry-run] would: write HINDSIGHT_API_URL -> $EnvFile (only if unset)"
  Say '[dry-run] would: npm run memory:init -- --apply (idempotent bank + mental models)'
}
else {
  $hsCmd = Get-Command hindsight-api -ErrorAction SilentlyContinue
  if ($hsCmd) {
    Ok "hindsight-api found: $($hsCmd.Source)"
  }
  else {
    Say 'installing hindsight-all via pip (self-contained local server; no separate database install)'
    try { Run $PythonBin @('-m', 'pip', 'install', 'hindsight-all') }
    catch { Fail 'pip install hindsight-all failed' "$PythonBin -m pip install --user hindsight-all; add the pip Scripts directory to PATH" }
    $hsCmd = Get-Command hindsight-api -ErrorAction SilentlyContinue
    if ($hsCmd) { Ok 'hindsight-api installed' }
    else { Warn 'hindsight-api not on PATH yet - reopen your shell and re-run' }
  }
  if (Wait-ForHttp "$HindsightUrl/health" 1) {
    Ok "hindsight-api already running at $HindsightUrl"
  }
  elseif ($hsCmd) {
    Say "starting hindsight-api (log: $RailopsDir\hindsight-api.log)"
    $HindsightProc = Start-Process -FilePath $hsCmd.Source -NoNewWindow -PassThru `
      -RedirectStandardOutput (Join-Path $RailopsDir 'hindsight-api.log') `
      -RedirectStandardError (Join-Path $RailopsDir 'hindsight-api.err.log')
    Set-Content -LiteralPath (Join-Path $RailopsDir 'hindsight-api.pid') -Value $HindsightProc.Id
    if (Wait-ForHttp "$HindsightUrl/health" 60) {
      Ok "hindsight-api healthy at $HindsightUrl (pid $($HindsightProc.Id))"
    }
    else {
      Fail 'hindsight-api did not become healthy' "inspect $RailopsDir\hindsight-api.log, then start manually: hindsight-api"
    }
  }
  else {
    Fail 'hindsight-api is unavailable' 'reopen your shell so the pip Scripts directory is on PATH, then re-run: pwsh ./scripts/setup.ps1'
  }
  if (Get-EnvValue 'HINDSIGHT_API_URL') {
    Ok "kept existing HINDSIGHT_API_URL in $EnvFile"
  }
  else {
    Set-EnvLocal 'HINDSIGHT_API_URL' $HindsightUrl
  }
  $hsUrl = Get-EnvValue 'HINDSIGHT_API_URL'
  if (-not $hsUrl) { $hsUrl = $HindsightUrl }
  $env:HINDSIGHT_API_URL = $hsUrl
  $hsKey = Get-EnvValue 'HINDSIGHT_API_KEY'
  if ($hsKey) { $env:HINDSIGHT_API_KEY = $hsKey }
  Say "initializing bank 'railops' + mental models (idempotent; existing data is kept)"
  try { Run npm @('run', 'memory:init', '--', '--apply') }
  catch { Fail 'memory:init failed' "preview with: npm run memory:init; inspect $RailopsDir\hindsight-api.log" }
}

Stage 'Start dev server'
if ($DryRun) {
  Say "[dry-run] would: npm run dev (log: $RailopsDir\dev-server.log) and wait for $DevUrl"
}
elseif (Wait-ForHttp $DevUrl 1) {
  Ok "dev server already responding at $DevUrl"
}
else {
  Say "starting npm run dev (log: $RailopsDir\dev-server.log)"
  $npmSrc = (Get-Command npm).Source
  $DevProc = Start-Process -FilePath $npmSrc -ArgumentList 'run', 'dev' -WorkingDirectory $RepoRoot -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $RailopsDir 'dev-server.log') `
    -RedirectStandardError (Join-Path $RailopsDir 'dev-server.err.log')
  Set-Content -LiteralPath (Join-Path $RailopsDir 'dev-server.pid') -Value $DevProc.Id
  if (Wait-ForHttp $DevUrl 45) {
    Ok "dev server ready at $DevUrl (pid $($DevProc.Id))"
  }
  else {
    Fail 'dev server did not respond' "inspect $RailopsDir\dev-server.log, then start manually: npm run dev"
  }
}

Stage 'Open dashboard'
if ($DryRun) {
  Say "[dry-run] would open $DevUrl in your default browser"
}
else {
  Say "opening $DevUrl"
  Start-Process $DevUrl
}

Write-Host ''
Write-Host '  Setup complete' -ForegroundColor Green
if ($WrittenEnv.Count -gt 0) { Note "wrote to $EnvFile : $($WrittenEnv -join ', ')" }
if ($DevProc) {
  Say "dashboard:       $DevUrl"
  Say "stop dev server: Stop-Process -Id $($DevProc.Id)   (or: taskkill /PID $($DevProc.Id) /T /F)"
}
else {
  Say "dashboard: $DevUrl (if the dev server runs in this terminal, stop it with Ctrl+C)"
}
if ($HindsightProc) { Say "stop hindsight:  Stop-Process -Id $($HindsightProc.Id)" }
Say 're-run anytime: pwsh ./scripts/setup.ps1 (idempotent)'
