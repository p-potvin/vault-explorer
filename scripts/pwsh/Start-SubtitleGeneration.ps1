<#
.SYNOPSIS
    Vault Explorer Subtitle Generation CLI (Audio.cpp + Parakeet-TDT + HTDemucs).

.DESCRIPTION
    Runs Start-SubtitlesAudioCpp.ps1 to generate .srt subtitles end to end on GPU.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, Position = 0, HelpMessage = "Root folder or video file to process")]
    [string]$Folder = $PWD.Path,

    [switch]$SkipExisting,
    [switch]$NoSeparate,
    [string]$Langs = "",
    [switch]$Recurse,
    [string[]]$Extensions = @('.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv')
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetScript = Join-Path $ScriptDir 'Start-SubtitlesAudioCpp.ps1'

if (-not (Test-Path $TargetScript)) {
    Write-Error "Could not locate Start-SubtitlesAudioCpp.ps1 at $TargetScript"
    exit 1
}

$params = @{
    TargetDir = $Folder
    SkipExisting = $SkipExisting
    NoSeparate = $NoSeparate
    Langs = $Langs
    Recurse = $Recurse
    Extensions = $Extensions
}

& $TargetScript @params
