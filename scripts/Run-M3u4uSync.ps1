[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = if (Test-Path 'C:\Program Files\nodejs\node.exe') {
    'C:\Program Files\nodejs\node.exe'
} else {
    (Get-Command node -ErrorAction Stop).Source
}
$runnerPath = Join-Path $PSScriptRoot 'sync-m3u4u-patchright.cjs'
$runtimeDir = Join-Path $repoRoot '.runtime'
$logPath = Join-Path $runtimeDir 'm3u4u-sync.log'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$env:M3U4U_TIMEOUT_MS = '120000'
if ($DryRun) {
    $env:M3U4U_DRY_RUN = '1'
} else {
    Remove-Item Env:M3U4U_DRY_RUN -ErrorAction SilentlyContinue
}

& $nodePath $runnerPath *>&1 | Tee-Object -FilePath $logPath -Append
exit $LASTEXITCODE
