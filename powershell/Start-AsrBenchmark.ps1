[CmdletBinding()]
param(
    [switch]$Native,

    [switch]$ForceSimulation
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       VAULT EXPLORER ASR & TRANSLATION BENCHMARK RUNNER   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve target script path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PythonScript = Join-Path (Join-Path $ProjectRoot 'python-scripts') 'benchmark_asr.py'

if (-not (Test-Path $PythonScript)) {
    Write-Error "Could not locate benchmark_asr.py at $PythonScript"
    exit 1
}

# Resolve vault-explorer virtual environment
$VenvCandidates = @(
    (Join-Path $ProjectRoot '.venv\Scripts\python.exe'),
    "C:\Users\Administrator\Desktop\Github Repos\vault-explorer\.venv\Scripts\python.exe"
)

$PythonExe = "python"
foreach ($Candidate in $VenvCandidates) {
    if (Test-Path $Candidate) {
        $PythonExe = $Candidate
        break
    }
}

Write-Host "Resolved Python: $PythonExe" -ForegroundColor Gray
Write-Host "Native Mode:     $($Native.IsPresent)" -ForegroundColor Gray
Write-Host "Force Simulate:  $($ForceSimulation.IsPresent)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

# Build argument array
$ArgsList = @("-u", $PythonScript)
if ($Native) {
    $ArgsList += "--native"
}
if ($ForceSimulation) {
    $ArgsList += "--force-simulation"
}

# Set env protocols
$env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION = "python"

# Run process
& $PythonExe $ArgsList
