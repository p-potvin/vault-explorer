[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profileRoot = Join-Path $env:LOCALAPPDATA 'VaultWares\M3U4UAutomation\ChromeProfile'

if (-not (Test-Path -LiteralPath $chrome)) {
    throw "Chrome was not found at $chrome"
}

New-Item -ItemType Directory -Force -Path $profileRoot | Out-Null
Start-Process -FilePath $chrome -ArgumentList "--user-data-dir=`"$profileRoot`"", '--profile-directory=Default', 'https://m3u4u.com/playlists'
Write-Output 'Sign in to m3u4u in the opened Chrome window, then close Chrome before the scheduled run.'
