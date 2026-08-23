<#
.SYNOPSIS
    Real-time streaming ASR live subtitles and translation for Vault Explorer.

.DESCRIPTION
    Transcribes local video playback or system audio capture using Parakeet-TDT (GGUF),
    optionally separates vocal stems via HTDemucs (GGUF), translates sentences via
    deep_translator / Ollama, and persists live subtitles to .srt sidecars in real time.

.PARAMETER VideoPath
    Path to local video file to transcribe.

.PARAMETER Device
    WASAPI audio loopback device name (if capturing live system audio).

.PARAMETER ListDevices
    List available audio capture devices and exit.

.PARAMETER TranslateTo
    Target language code (e.g. fr, qc, es, de, ja).

.PARAMETER TranslateFrom
    Source language (default: auto).

.PARAMETER Bilingual
    Show source line above translated line.

.PARAMETER TranslateEngine
    google (deep_translator) or local (Ollama).

.PARAMETER VolumeBoost
    Audio gain multiplier (default: 1.5).

.PARAMETER Start
    Playback start time in seconds (default: 0.0).

.PARAMETER MinSilence
    Silence gap in seconds that closes a cue (default: 0.8).

.PARAMETER Step
    ASR interval in seconds (default: 0.7).

.PARAMETER MaxUtterance
    Rolling buffer ceiling in seconds (default: 12.0).

.EXAMPLE
    .\scripts\pwsh\Start-LiveSubtitles.ps1 -VideoPath "C:\Media\movie.mp4" -TranslateTo fr

.EXAMPLE
    .\scripts\pwsh\Start-LiveSubtitles.ps1 -ListDevices
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false, HelpMessage = "Path to local video file")]
    [string]$VideoPath,

    [Parameter(Mandatory = $false, HelpMessage = "Audio loopback device name")]
    [string]$Device,

    [Parameter(Mandatory = $false, HelpMessage = "List loopback devices and exit")]
    [switch]$ListDevices,

    [Parameter(Mandatory = $false, HelpMessage = "Target language for translation (e.g. fr, qc, es)")]
    [string]$TranslateTo,

    [Parameter(Mandatory = $false, HelpMessage = "Source language (default: auto)")]
    [string]$TranslateFrom = "auto",

    [Parameter(Mandatory = $false, HelpMessage = "Bilingual display")]
    [switch]$Bilingual,

    [Parameter(Mandatory = $false, HelpMessage = "Translation engine (google or local)")]
    [ValidateSet("google", "local")]
    [string]$TranslateEngine = "google",

    [Parameter(Mandatory = $false, HelpMessage = "Volume boost multiplier")]
    [double]$VolumeBoost = 1.5,

    [Parameter(Mandatory = $false, HelpMessage = "Start offset in seconds")]
    [double]$Start = 0.0,

    [Parameter(Mandatory = $false, HelpMessage = "Silence gap (seconds) that ends a cue")]
    [double]$MinSilence = 0.8,

    [Parameter(Mandatory = $false, HelpMessage = "ASR pass step in seconds")]
    [double]$Step = 0.7,

    [Parameter(Mandatory = $false, HelpMessage = "Max rolling buffer in seconds")]
    [double]$MaxUtterance = 12.0,

    [Parameter(Mandatory = $false, HelpMessage = "Caption font size")]
    [int]$FontSize = 20,

    [Parameter(Mandatory = $false, HelpMessage = "Overlay opacity")]
    [double]$Opacity = 1.0
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$PythonScriptsDir = Join-Path $ProjectRoot 'python-scripts'
$LiveSubsScript = Join-Path $PythonScriptsDir 'live_subtitles.py'

if (-not (Test-Path $LiveSubsScript)) {
    Write-Error "Could not locate live_subtitles.py at $LiveSubsScript"
    exit 1
}

$VenvCandidates = @(
    (Join-Path (Split-Path -Parent $ProjectRoot) "vault-commander\cli\utils\.venv\Scripts\python.exe"),
    (Join-Path $ProjectRoot '.venv\Scripts\python.exe'),
    "python"
)

$PythonExe = "python"
foreach ($Candidate in $VenvCandidates) {
    if ($Candidate -eq "python" -or (Test-Path $Candidate)) {
        $PythonExe = $Candidate
        break
    }
}

$Inv = [System.Globalization.CultureInfo]::InvariantCulture

if ($ListDevices) {
    & $PythonExe -c "import soundcard as sc; print('\n'.join([s.name for s in sc.all_microphones(include_loopback=True)]))"
    exit $LASTEXITCODE
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " VAULT EXPLORER: LIVE SUBTITLES & GGUF ASR PIPELINE      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
if ($VideoPath) { Write-Host "Video:        $VideoPath" -ForegroundColor Gray }
if ($TranslateTo) { Write-Host "Translate:    $TranslateTo (Engine: $TranslateEngine)" -ForegroundColor Gray }
Write-Host "Python:       $PythonExe" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

$ArgsList = @(
    "-u", $LiveSubsScript
)

if ($VideoPath) {
    if (-not (Test-Path $VideoPath)) {
        Write-Error "Video file not found: $VideoPath"
        exit 1
    }
    $ArgsList += @(
        $VideoPath,
        "--volume-boost", $VolumeBoost.ToString($Inv),
        "--start", $Start.ToString($Inv)
    )
    if ($TranslateTo) {
        $normLang = if ($TranslateTo -in @('qc', 'ca-fr')) { 'fr' } else { $TranslateTo }
        $ArgsList += @("--translate-to", $normLang)
    }
}
else {
    $ArgsList += "--daemon"
}

try {
    & $PythonExe $ArgsList
}
catch {
    Write-Error "Live subtitles process failed: $_"
    exit 1
}
