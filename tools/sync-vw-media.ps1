<#
.SYNOPSIS
    Propagate the canonical vw_media package and action scripts to the sibling projects.

.DESCRIPTION
    vault-explorer holds the canonical copy of python-scripts/vw_media plus the
    four enhancement entrypoints. The same code is used by vault-streaming,
    vaultwares-media-processing and vw-cli.

    The package deliberately has no repo-specific imports — the ASR wrapper is
    resolved by probing for whichever host module exists — so the files are
    copied verbatim rather than forked.

    Copies drift. Run with -Check in CI or before editing to see whether any
    target has diverged from the canonical source.

.PARAMETER Check
    Report differences and exit non-zero if any target is out of date. Copies nothing.

.EXAMPLE
    powershell -File tools/sync-vw-media.ps1 -Check
    powershell -File tools/sync-vw-media.ps1
#>
[CmdletBinding()]
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $RepoRoot 'python-scripts'

# Scripts that every project gets. vw-cli is excluded from the entrypoints
# because it already has its own equivalents wired to documented `vw` commands.
$ActionScripts = @(
    'enhance_audio.py',
    'generate_subtitles.py',
    'translate_video.py',
    'enhance_video.py'
)

$Targets = @(
    @{
        Name    = 'vault-streaming'
        Path    = Join-Path (Split-Path -Parent $RepoRoot) 'vault-streaming\python-scripts'
        Scripts = $true
    },
    @{
        Name    = 'vaultwares-media-processing'
        Path    = Join-Path (Split-Path -Parent $RepoRoot) 'vaultwares-media-processing\python-scripts'
        Scripts = $true
    },
    @{
        # Not a git repo, and its utils/ already contains differently-designed
        # equivalents of the entrypoints — package only.
        Name    = 'vw-cli'
        Path    = Join-Path $env:USERPROFILE 'Desktop\vw-cli\utils'
        Scripts = $false
    }
)

function Get-FileHashSafe([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

$drift = @()
$copied = 0

foreach ($target in $Targets) {
    Write-Host "=== $($target.Name) ===" -ForegroundColor Cyan

    $files = @()
    Get-ChildItem (Join-Path $SourceDir 'vw_media') -File -Filter *.py | ForEach-Object {
        $files += @{ Rel = "vw_media\$($_.Name)"; Src = $_.FullName }
    }
    if ($target.Scripts) {
        foreach ($script in $ActionScripts) {
            $files += @{ Rel = $script; Src = Join-Path $SourceDir $script }
        }
    }

    foreach ($file in $files) {
        $dest = Join-Path $target.Path $file.Rel
        $srcHash = Get-FileHashSafe $file.Src
        $dstHash = Get-FileHashSafe $dest

        if ($srcHash -eq $dstHash) { continue }

        if ($Check) {
            $state = if ($null -eq $dstHash) { 'missing' } else { 'differs' }
            Write-Host "  $state  $($file.Rel)" -ForegroundColor Yellow
            $drift += "$($target.Name)/$($file.Rel) ($state)"
            continue
        }

        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -LiteralPath $file.Src -Destination $dest -Force
        Write-Host "  copied   $($file.Rel)" -ForegroundColor Green
        $copied++
    }
}

Write-Host ""
if ($Check) {
    if ($drift.Count -gt 0) {
        Write-Host "$($drift.Count) file(s) out of sync with the canonical copy." -ForegroundColor Red
        exit 1
    }
    Write-Host "All targets match the canonical vw_media." -ForegroundColor Green
    exit 0
}

Write-Host "Synced $copied file(s)." -ForegroundColor Green
