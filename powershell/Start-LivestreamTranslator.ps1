[CmdletBinding()]
param(
    [string]$Voice = "ff_siwis",

    [string]$Lang = "fr-fr",

    [double]$Threshold = 0.005,

    [double]$Volume = 0.80
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    VAULT EXPLORER LOOPBACK LIVESTREAM SPOKEN TRANSLATOR   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Resolve target script path
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PythonScript = Join-Path (Join-Path $ProjectRoot 'python-scripts') 'livestream_translator.py'

if (-not (Test-Path $PythonScript)) {
    Write-Error "Could not locate livestream_translator.py at $PythonScript"
    exit 1
}

# Resolve loopback-capable vault-explorer virtual environment
$VenvCandidates = @(
    "C:\Users\Administrator\Desktop\Github Repos\vaultwares-media-processing\.venv\Scripts\python.exe",
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
Write-Host "Voice Name:      $Voice" -ForegroundColor Gray
Write-Host "Language Target: $Lang" -ForegroundColor Gray
Write-Host "Trigger Thresh:  $Threshold" -ForegroundColor Gray
Write-Host "Output Volume:   $Volume" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

# Build argument array
$ArgsList = @("-u", $PythonScript)
$ArgsList += @("--voice", $Voice)
$ArgsList += @("--lang", $Lang)
$ArgsList += @("--threshold", $Threshold.ToString())
$ArgsList += @("--volume", $Volume.ToString())

# Run process
& $PythonExe $ArgsList
