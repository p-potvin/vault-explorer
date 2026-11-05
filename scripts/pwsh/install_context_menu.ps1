$ErrorActionPreference = "Stop"

$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$UnpackedExe = Join-Path $RepoPath "dist\win-unpacked\vault-explorer.exe"

$FileCommand = "`"$UnpackedExe`" --prioritize-player `"%1`""
$FolderBgCommand = "`"$UnpackedExe`" `"%V`""
$FolderItemCommand = "`"$UnpackedExe`" `"%1`""

if (Test-Path $UnpackedExe) {
    Write-Host "Using latest win-unpacked executable for context menus: $UnpackedExe" -ForegroundColor Cyan
} else {
    Write-Warning "Target executable not found at '$UnpackedExe'. Context menu will be registered, but please run 'npm run dist' to build it."
}

$IconPath = if (Test-Path $UnpackedExe) { $UnpackedExe } elseif (Test-Path "$RepoPath\build\icon.ico") { "$RepoPath\build\icon.ico" } else { $null }

# 1. Video Files Context Menu
$VideoFileRegPath = "HKCU:\Software\Classes\SystemFileAssociations\video\shell\VaultExplorer"
Write-Host "Adding context menu entry for video files..."
if (Test-Path $VideoFileRegPath) { Remove-Item -Path $VideoFileRegPath -Recurse -Force }
New-Item -Path $VideoFileRegPath -Force | Out-Null
Set-ItemProperty -Path $VideoFileRegPath -Name "(default)" -Value "Open with Vault Explorer"
if ($IconPath) { Set-ItemProperty -Path $VideoFileRegPath -Name "Icon" -Value $IconPath }
New-Item -Path "$VideoFileRegPath\command" -Force | Out-Null
Set-ItemProperty -Path "$VideoFileRegPath\command" -Name "(default)" -Value $FileCommand

# 2. Folder Background Context Menu (right click inside folder background)
$FolderBgRegPath = "HKCU:\Software\Classes\Directory\Background\shell\VaultExplorer"
Write-Host "Adding context menu entry for folder background..."
if (Test-Path $FolderBgRegPath) { Remove-Item -Path $FolderBgRegPath -Recurse -Force }
New-Item -Path $FolderBgRegPath -Force | Out-Null
Set-ItemProperty -Path $FolderBgRegPath -Name "(default)" -Value "Open in Vault Explorer"
if ($IconPath) { Set-ItemProperty -Path $FolderBgRegPath -Name "Icon" -Value $IconPath }
New-Item -Path "$FolderBgRegPath\command" -Force | Out-Null
Set-ItemProperty -Path "$FolderBgRegPath\command" -Name "(default)" -Value $FolderBgCommand

# 3. Directory Item Context Menu (right click on a folder)
$DirItemRegPath = "HKCU:\Software\Classes\Directory\shell\VaultExplorer"
Write-Host "Adding context menu entry for directory items..."
if (Test-Path $DirItemRegPath) { Remove-Item -Path $DirItemRegPath -Recurse -Force }
New-Item -Path $DirItemRegPath -Force | Out-Null
Set-ItemProperty -Path $DirItemRegPath -Name "(default)" -Value "Open in Vault Explorer"
if ($IconPath) { Set-ItemProperty -Path $DirItemRegPath -Name "Icon" -Value $IconPath }
New-Item -Path "$DirItemRegPath\command" -Force | Out-Null
Set-ItemProperty -Path "$DirItemRegPath\command" -Name "(default)" -Value $FolderItemCommand

# 4. M3U & M3U8 Playlist Files Context Menu (open in Debrids playlist view)
$M3uFileRegPaths = @(
    "HKCU:\Software\Classes\SystemFileAssociations\.m3u\shell\VaultExplorer",
    "HKCU:\Software\Classes\SystemFileAssociations\.m3u8\shell\VaultExplorer"
)
Write-Host "Adding context menu entry for M3U / M3U8 playlist files..."
foreach ($regPath in $M3uFileRegPaths) {
    if (Test-Path $regPath) { Remove-Item -Path $regPath -Recurse -Force }
    New-Item -Path $regPath -Force | Out-Null
    Set-ItemProperty -Path $regPath -Name "(default)" -Value "Open in Vault Explorer"
    if ($IconPath) { Set-ItemProperty -Path $regPath -Name "Icon" -Value $IconPath }
    New-Item -Path "$regPath\command" -Force | Out-Null
    Set-ItemProperty -Path "$regPath\command" -Name "(default)" -Value $FileCommand
}

Write-Host "Successfully registered all Vault Explorer context menus in Windows Registry!" -ForegroundColor Green
