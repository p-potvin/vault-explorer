$ErrorActionPreference = "Stop"

$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$NodeExe = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$ElectronCli = "$RepoPath\node_modules\electron\cli.js"

$FileCommand = ""
$FolderBgCommand = ""
$FolderItemCommand = ""

if ((Test-Path $NodeExe) -and (Test-Path $ElectronCli)) {
    # `npm run start` resolves `electron .` through Electron's cli.js with
    # Node. Keep the registry command identical in shape so it uses this
    # checkout's source rather than a possibly stale dist build.
    $FileCommand = "`"$NodeExe`" `"$ElectronCli`" `"$RepoPath`" --prioritize-player `"%1`""
    $FolderBgCommand = "`"$NodeExe`" `"$ElectronCli`" `"$RepoPath`" `"%V`""
    $FolderItemCommand = "`"$NodeExe`" `"$ElectronCli`" `"$RepoPath`" `"%1`""
    Write-Host "Using the Node + Electron CLI command from npm run start for context menus." -ForegroundColor Cyan
} else {
    Write-Host "Could not find Node or the local Electron CLI. Please install dependencies first." -ForegroundColor Red
    exit 1
}

$IconPath = if (Test-Path "$RepoPath\build\icon.ico") { "$RepoPath\build\icon.ico" } else { $null }

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
