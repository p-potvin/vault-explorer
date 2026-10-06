<#
.SYNOPSIS
    Generate .srt sidecars for a file or a tree, through `vw better-subtitles`.

.DESCRIPTION
    A delegator, deliberately. The subtitle pipeline -- vocal separation,
    NeMo-Speech.cpp with Parakeet TDT on the resident server, optional Riva
    translation -- is the `vw better-subtitles` command in vault-commander. A
    second copy here would drift.

    The command is looked up in vw's own registry (cli\vw-commands.ps1) and its
    script is called with named parameters, rather than going through vw.ps1.
    vw.ps1 rebuilds its arguments into an Invoke-Expression string and quotes
    only arguments that contain whitespace, so a media path such as
    D:\Media\Don't.mkv breaks the parse. The registry lookup keeps the same
    command and defaults without that hazard.

    Used by python-scripts/generate_subtitles.py (the "Generate Subtitles"
    context-menu action) and for building sidecars up front in batch. Subtitles
    that appear while a video plays come from src/live-subtitles.js instead.

    Created Sat, 22 Aug 2026. Repointed from vault-cacophony's
    Start-SubtitlesAudioCpp.ps1 to vw better-subtitles Tue, 06 Oct 2026.

.PARAMETER Target
    One media file, or a directory to scan.

.PARAMETER VwCli
    Directory holding vw.ps1 and vw-commands.ps1. Defaults to $env:VW_CLI, then
    the vault-commander checkout beside this repo.

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
    [switch]$NoSeparate,
    [string]$Model,
    [string]$Language,
    [switch]$LowMemory,
    [string]$VwCli
)

$ErrorActionPreference = 'Stop'

$candidates = @(
    $VwCli,
    $env:VW_CLI,
    (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) "vault-commander\cli"),
    (Join-Path $env:USERPROFILE "Desktop\Github Repos\vault-commander\cli")
) | Where-Object { $_ }

$registry = $null
foreach ($c in $candidates) {
    $p = Join-Path $c "vw-commands.ps1"
    if (Test-Path -LiteralPath $p) { $registry = $p; break }
}
if (-not $registry) {
    Write-Error ("vw CLI not found. Clone vault-commander beside vault-explorer, " +
                 "or set VW_CLI to its cli directory.")
    exit 1
}

$command = (& $registry)['better-subtitles']
if (-not $command -or -not (Test-Path -LiteralPath $command.ScriptPath)) {
    Write-Error "vw registry at $registry has no runnable 'better-subtitles' command."
    exit 1
}

$forward = @{ Input = $Target }
if ($OutputDir)    { $forward.Output = $OutputDir }
if ($Recurse)      { $forward.Recurse = $true }
if ($TranslateTo)  { $forward.TranslateTo = $TranslateTo }
if ($SkipExisting) { $forward.SkipExisting = $true }
if ($NoSeparate)   { $forward.NoSeparate = $true }
if ($Model)        { $forward.Model = $Model }
if ($Language)     { $forward.Language = $Language }
if ($LowMemory)    { $forward.LowMemory = $true }

& $command.ScriptPath @forward
exit $LASTEXITCODE
