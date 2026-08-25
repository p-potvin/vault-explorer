<#
.SYNOPSIS
    Generate .srt sidecars for a file or a tree, through vault-cacophony.

.DESCRIPTION
    A delegator, deliberately. The subtitle pipeline -- ffmpeg, chunked CUDA
    htdemucs separation, Parakeet-TDT, cues from word gaps, translation -- is
    developed in vault-cacophony and this project depends on that checkout for
    the engine and the weights anyway. A second copy here would drift, and the
    copy it replaces already had: it predated the chunked separation that keeps
    a feature-length file inside memory, and the -AsrWindow default that stopped
    the transcript losing 40% of its words.

    This is the batch path, for building a sidecar up front. Subtitles that
    appear while a video plays come from src/live-subtitles.js, which streams
    cues out of the resident server instead.

    Created Sat, 22 Aug 2026

.PARAMETER Target
    One media file, or a directory to scan.

.EXAMPLE
    .\Start-Subtitles.ps1 -Target "D:\Media\episode.mkv" -TranslateTo fr

.EXAMPLE
    .\Start-Subtitles.ps1 -Target "D:\Media\Season 1" -Recurse -SkipExisting
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Target,
    [string]$OutputDir,
    [switch]$Recurse,
    [string]$TranslateTo = "",
    [switch]$SkipExisting,
    [switch]$Separate,
    [switch]$NoSeparate,
    [double]$VolumeBoost = 1.5,
    [string]$Cacophony
)

$ErrorActionPreference = 'Stop'

$candidates = @(
    $Cacophony,
    $env:VW_CACOPHONY,
    $(if ($env:VW_AUDIOCPP) { Split-Path -Parent $env:VW_AUDIOCPP } else { $null }),
    (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "..\vault-cacophony"),
    (Join-Path $env:USERPROFILE "Desktop\Github Repos\vault-cacophony")
) | Where-Object { $_ }

$script = $null
foreach ($c in $candidates) {
    $p = Join-Path $c "scripts\Start-SubtitlesAudioCpp.ps1"
    if (Test-Path -LiteralPath $p) { $script = $p; break }
}
if (-not $script) {
    Write-Error ("vault-cacophony not found. It is this project's AI dependency: clone it beside " +
                 "vault-explorer, or set VW_CACOPHONY to the checkout.")
    exit 1
}

$forward = @{ TargetDir = $Target; VolumeBoost = $VolumeBoost }
if ($OutputDir)    { $forward.OutputDir = $OutputDir }
if ($Recurse)      { $forward.Recurse = $true }
if ($TranslateTo)  { $forward.Langs = $TranslateTo }
if ($SkipExisting) { $forward.SkipExisting = $true }
if ($Separate)     { $forward.Separate = $true }
if ($NoSeparate)   { $forward.NoSeparate = $true }

& $script @forward
exit $LASTEXITCODE
