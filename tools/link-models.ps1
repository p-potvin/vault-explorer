<#
.SYNOPSIS
    Deduplicate model files across projects with NTFS hard links.

.DESCRIPTION
    Model weights are large and every project wants its own copy at its own path.
    A hard link gives each project a real path into one set of on-disk blocks, so
    N copies cost the space of one.

    Canonical store:
        %LOCALAPPDATA%\VaultWares\models\<model-name>\

    Each target gets a directory of hard links pointing at those same blocks.
    This is safe here because converted model directories are read-only at
    runtime and location-independent — asset references inside model_config.yaml
    are stored as bare filenames and resolved against the config's own directory,
    so the identical file works from every path.

    Uses `cmd /c mklink /H`, which is a cmd built-in and not available directly
    in PowerShell. (`fsutil hardlink create` is the PowerShell-native equivalent
    if you ever need it.)

.PARAMETER Model
    Name of the model directory under the canonical store.

.PARAMETER Targets
    Destination directories to populate with hard links.

.PARAMETER WhatIf
    Show what would happen without touching the filesystem.

.NOTES
    Hard links cannot cross volumes. Every path must be on the same drive as the
    canonical store, and editing any link edits them all.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$Model,

    [Parameter(Mandatory = $true)]
    [string[]]$Targets,

    [string]$Store = (Join-Path $env:LOCALAPPDATA 'VaultWares\models')
)

$ErrorActionPreference = 'Stop'

$source = Join-Path $Store $Model
if (-not (Test-Path $source)) {
    throw "Canonical model directory not found: $source"
}

$sourceVolume = (Get-Item $source).PSDrive.Name
$files = Get-ChildItem $source -File
if ($files.Count -eq 0) { throw "No files in $source" }

$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host "Canonical: $source" -ForegroundColor Cyan
Write-Host ("  {0} file(s), {1:N2} GB" -f $files.Count, ($totalBytes / 1GB)) -ForegroundColor Gray
Write-Host ""

$linked = 0
$skipped = 0
$reclaimed = 0

foreach ($target in $Targets) {
    Write-Host "=== $target ===" -ForegroundColor Cyan

    $targetVolume = try { (Get-Item (Split-Path -Qualifier $target)).PSDrive.Name } catch { $null }
    if ($targetVolume -and $targetVolume -ne $sourceVolume) {
        Write-Host "  SKIPPED: different volume ($targetVolume vs $sourceVolume); hard links cannot cross volumes." -ForegroundColor Red
        continue
    }

    if (-not (Test-Path $target)) {
        if ($PSCmdlet.ShouldProcess($target, 'create directory')) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
        }
    }

    foreach ($file in $files) {
        $dest = Join-Path $target $file.Name

        if (Test-Path -LiteralPath $dest) {
            # Already a link to the same blocks? Then there is nothing to do.
            $existingLinks = @(fsutil hardlink list "$dest" 2>$null)
            $sourceRel = $file.FullName.Substring(2)   # strip drive qualifier
            if ($existingLinks -contains $sourceRel) {
                Write-Host "  ok       $($file.Name) (already linked)" -ForegroundColor DarkGray
                $skipped++
                continue
            }

            $existingSize = (Get-Item -LiteralPath $dest).Length
            if ($PSCmdlet.ShouldProcess($dest, 'replace duplicate with hard link')) {
                Remove-Item -LiteralPath $dest -Force
            }
            $reclaimed += $existingSize
            Write-Host "  replaced $($file.Name) (reclaimed $([math]::Round($existingSize/1MB)) MB)" -ForegroundColor Yellow
        }

        if ($PSCmdlet.ShouldProcess($dest, "hard link -> $($file.FullName)")) {
            # mklink is a cmd built-in; /H makes a hard link.
            $output = cmd /c mklink /H "`"$dest`"" "`"$($file.FullName)`"" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  FAILED   $($file.Name): $output" -ForegroundColor Red
                continue
            }
        }
        Write-Host "  linked   $($file.Name)" -ForegroundColor Green
        $linked++
    }
}

Write-Host ""
Write-Host "Linked $linked, already-linked $skipped." -ForegroundColor Green
if ($reclaimed -gt 0) {
    Write-Host ("Reclaimed {0:N2} GB by replacing duplicates." -f ($reclaimed / 1GB)) -ForegroundColor Green
}
