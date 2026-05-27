[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$VideoPath,

    [Parameter(Position = 1)]
    [string]$VaultRoot,

    [switch]$Transcribe,

    [string]$TranslateTo
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    VAULT EXPLORER AUDIO NORMALIZATION PIPELINE RUNNER    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve target script path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PythonScript = Join-Path (Join-Path $ProjectRoot 'python-scripts') 'audio_normalize.py'

if (-not (Test-Path $PythonScript)) {
    Write-Error "Could not locate audio_normalize.py at $PythonScript"
    exit 1
}

# Resolve heavy NeMo media processing environment
$VenvCandidates = @(
    "C:\Users\Administrator\Desktop\Github Repos\vaultwares-media-processing\.venv\Scripts\python.exe",
    (Join-Path (Join-Path (Join-Path $ProjectRoot '..') 'vaultwares-media-processing') '.venv\Scripts\python.exe')
)

$PythonExe = "python"
foreach ($Candidate in $VenvCandidates) {
    if (Test-Path $Candidate) {
        $PythonExe = $Candidate
        break
    }
}

Write-Host "Resolved Python: $PythonExe" -ForegroundColor Gray
Write-Host "Video Path:      $VideoPath" -ForegroundColor Gray
if ($VaultRoot) { Write-Host "Vault Root:      $VaultRoot" -ForegroundColor Gray }
Write-Host "Transcribe:      $($Transcribe.IsPresent)" -ForegroundColor Gray
if ($TranslateTo) { Write-Host "Translate To:    $TranslateTo" -ForegroundColor Gray }
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

# Build argument array
$ArgsList = @("-u", $PythonScript, $VideoPath)
if ($VaultRoot) {
    $ArgsList += $VaultRoot
}
if ($Transcribe) {
    $ArgsList += "--transcribe"
}
if ($TranslateTo) {
    $ArgsList += @("--translate-to", $TranslateTo)
}

# Set env protocols
$env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION = "python"

# Run process
& $PythonExe $ArgsList
