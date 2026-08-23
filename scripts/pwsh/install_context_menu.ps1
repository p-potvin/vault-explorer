$ErrorActionPreference = "Stop"

$RepoPath = "C:\Users\Administrator\Desktop\Github Repos\vault-explorer"
$ProdExe = "$RepoPath\dist\win-unpacked\vault-explorer.exe"
$DevElectron = "$RepoPath\node_modules\electron\dist\electron.exe"

$FileCommand = ""
$FolderBgCommand = ""
$FolderItemCommand = ""

if (Test-Path $ProdExe) {
    $FileCommand = "`"$ProdExe`" `"%1`""
    $FolderBgCommand = "`"$ProdExe`" `"%V`""
    $FolderItemCommand = "`"$ProdExe`" `"%1`""
    Write-Host "Found production executable, using it for context menus ($ProdExe)." -ForegroundColor Cyan
} elseif (Test-Path $DevElectron) {
    $FileCommand = "`"$DevElectron`" `"$RepoPath`" `"%1`""
    $FolderBgCommand = "`"$DevElectron`" `"$RepoPath`" `"%V`""
    $FolderItemCommand = "`"$DevElectron`" `"$RepoPath`" `"%1`""
    Write-Host "Found development electron, using it for context menus." -ForegroundColor Cyan
} else {
    Write-Host "Could not find Vault Explorer executable. Please build the app first or install dependencies." -ForegroundColor Red
    exit 1
}

$IconPath = if (Test-Path "$RepoPath\build\icon.ico") { "$RepoPath\build\icon.ico" } elseif (Test-Path $ProdExe) { $ProdExe } else { $null }

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

Write-Host "Successfully registered all Vault Explorer context menus in Windows Registry!" -ForegroundColor Green

