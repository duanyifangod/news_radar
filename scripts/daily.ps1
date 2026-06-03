# News Radar — daily local run
# Used by Windows Task Scheduler. Logs to logs\YYYY-MM-DD.log.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ((Get-Date -Format "yyyy-MM-dd") + ".log")

"=== $(Get-Date -Format o) starting daily run ===" | Tee-Object -FilePath $logFile -Append

# Resolve pnpm (corepack may live under user AppData)
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) {
  "pnpm not found on PATH. Install via 'npm i -g pnpm' or enable corepack." | Tee-Object -FilePath $logFile -Append
  exit 1
}

& $pnpm daily 2>&1 | Tee-Object -FilePath $logFile -Append
$code = $LASTEXITCODE

"=== $(Get-Date -Format o) finished with exit code $code ===" | Tee-Object -FilePath $logFile -Append
exit $code
