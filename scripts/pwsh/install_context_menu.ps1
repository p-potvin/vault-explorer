$ErrorActionPreference = "Stop"

$RepoPath = "C:\Users\Administrator\Desktop\Github Repos\vault-explorer"
$ProdExe = "$RepoPath\dist\win-unpacked\vault-explorer.exe"
$DevElectron = "$RepoPath\node_modules\electron\dist\electron.exe"

$CommandPath = ""
if (Test-Path $ProdExe) {
    $CommandPath = "`"$ProdExe`" `"%1`""
    Write-Host "Found production executable, using it for context menu."
} elseif (Test-Path $DevElectron) {
    $CommandPath = "`"$DevElectron`" `"$RepoPath`" `"%1`""
    Write-Host "Found development electron, using it for context menu."
} else {
    Write-Host "Could not find Vault Explorer executable. Please build the app first or install dependencies." -ForegroundColor Red
    exit 1
}

$RegistryPath = "HKCU:\Software\Classes\SystemFileAssociations\video\shell\VaultExplorer"

Write-Host "Adding context menu entry 'Open with vault-explorer' for video files..."

if (Test-Path $RegistryPath) {
    Remove-Item -Path $RegistryPath -Recurse -Force
}

New-Item -Path $RegistryPath -Force | Out-Null
Set-ItemProperty -Path $RegistryPath -Name "(default)" -Value "Open with vault-explorer"
if (Test-Path "$RepoPath\build\icon.ico") {
    Set-ItemProperty -Path $RegistryPath -Name "Icon" -Value "$RepoPath\build\icon.ico"
}

$CommandRegPath = "$RegistryPath\command"
New-Item -Path $CommandRegPath -Force | Out-Null
Set-ItemProperty -Path $CommandRegPath -Name "(default)" -Value $CommandPath

Write-Host "Successfully added context menu entry!" -ForegroundColor Green
