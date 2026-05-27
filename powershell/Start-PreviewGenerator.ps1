[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ScanDir
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       VAULT EXPLORER VIDEO PREVIEW GENERATOR RUNNER       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve target script path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PythonScript = Join-Path (Join-Path $ProjectRoot 'python-scripts') 'generate_previews.py'

if (-not (Test-Path $PythonScript)) {
    Write-Error "Could not locate generate_previews.py at $PythonScript"
    exit 1
}

# Resolve loopback-capable vault-explorer virtual environment
$VenvCandidates = @(
    "C:\Users\Administrator\Desktop\Github Repos\vault-explorer\.venv\Scripts\python.exe",
    (Join-Path $ProjectRoot '.venv\Scripts\python.exe'),
    (Join-Path $ProjectRoot 'venv\Scripts\python.exe')
)

$PythonExe = "python"
foreach ($Candidate in $VenvCandidates) {
    if (Test-Path $Candidate) {
        $PythonExe = $Candidate
        break
    }
}

Write-Host "Resolved Python: $PythonExe" -ForegroundColor Gray
if ($ScanDir) { Write-Host "Scan Target:     $ScanDir" -ForegroundColor Gray }
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

# Build argument array
$ArgsList = @("-u", $PythonScript)
if ($ScanDir) {
    $ArgsList += $ScanDir
}

# Run process
& $PythonExe $ArgsList
