$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$python = if (Test-Path (Join-Path $repo '.venv\Scripts\python.exe')) { Join-Path $repo '.venv\Scripts\python.exe' } else { 'python' }

# Normal PC bind: available on the PC's LAN interfaces, with no Tailscale
# Serve/Funnel configuration. Override EPG_SOURCE_URL for another XMLTV feed.
$env:EPG_HOST = if ($env:EPG_HOST) { $env:EPG_HOST } else { '0.0.0.0' }
$env:EPG_PORT = if ($env:EPG_PORT) { $env:EPG_PORT } else { '8787' }
$env:EPG_CACHE_SECONDS = if ($env:EPG_CACHE_SECONDS) { $env:EPG_CACHE_SECONDS } else { '21600' }
$env:EPG_FRENCH_FILE = if ($env:EPG_FRENCH_FILE) { $env:EPG_FRENCH_FILE } else { 'C:\Users\Administrator\Desktop\xmltv.xml' }
& $python (Join-Path $PSScriptRoot 'epg_server.py')
