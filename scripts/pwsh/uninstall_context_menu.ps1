$ErrorActionPreference = "SilentlyContinue"

$RegPaths = @(
    "HKCU:\Software\Classes\SystemFileAssociations\video\shell\VaultExplorer",
    "HKCU:\Software\Classes\Directory\Background\shell\VaultExplorer",
    "HKCU:\Software\Classes\Directory\shell\VaultExplorer",
    "HKCU:\Software\Classes\SystemFileAssociations\.m3u\shell\VaultExplorer",
    "HKCU:\Software\Classes\SystemFileAssociations\.m3u8\shell\VaultExplorer"
)

Write-Host "Removing Vault Explorer context menus..." -ForegroundColor Yellow
foreach ($path in $RegPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force
        Write-Host "  Removed: $path" -ForegroundColor DarkGray
    }
}

Write-Host "Vault Explorer context menus uninstalled successfully." -ForegroundColor Green
