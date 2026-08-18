[CmdletBinding()]
param(
    [string]$Device = '100.93.218.48:5555',
    [string]$PlaylistUrl = 'http://127.0.0.1:8787/playlist.m3u?refresh=1',
    [ValidateRange(1, 1000)]
    [int]$ExpectedChannels = 48,
    [switch]$DryRun,
    [switch]$SkipM3u4uSync,
    [switch]$SkipTiviMateReload
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot '.runtime'
$logPath = Join-Path $runtimeDir 'onn-tivimate-sync.log'
$playlistPath = Join-Path $env:TEMP 'vaultwares-nos-canals.m3u'
$remotePlaylistPath = '/sdcard/Download/vaultwares-nos-canals.m3u'
$adb = (Get-Command adb -ErrorAction Stop).Source
$mutex = [System.Threading.Mutex]::new($false, 'Global\VaultExplorerOnnTiviMateSync')

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Write-SyncLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK') $Message"
    $line | Tee-Object -FilePath $logPath -Append
}

function Invoke-Adb([string[]]$Arguments) {
    & $adb @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "ADB command failed: $($Arguments -join ' ')"
    }
}

function Reload-TiviMate {
    # This is intentionally an overnight foreground refresh. It mutes first and
    # uses the known 1080p ONN/TiviMate settings flow to reload local playlists.
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'keyevent', '164')
    Invoke-Adb @('-s', $Device, 'shell', 'am', 'force-stop', 'ar.tvplayer.tv')
    Invoke-Adb @('-s', $Device, 'shell', 'am', 'start', '-n', 'ar.tvplayer.tv/.ui.MainActivity')
    Start-Sleep -Seconds 2
    1..3 | ForEach-Object {
        Invoke-Adb @('-s', $Device, 'shell', 'input', 'keyevent', '4')
        Start-Sleep -Milliseconds 450
    }
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'tap', '55', '1007')
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'keyevent', '66')
    Start-Sleep -Milliseconds 300
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'tap', '1500', '315')
    Start-Sleep -Milliseconds 300
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'tap', '1510', '500')
}

if (-not $mutex.WaitOne(0)) {
    Write-SyncLog 'another sync is already running; exiting without retry'
    exit 0
}

try {
    Write-SyncLog "starting for $Device"
    if (-not $SkipM3u4uSync) {
        & (Join-Path $PSScriptRoot 'Run-M3u4uSync.ps1')
        if ($LASTEXITCODE -ne 0) {
            throw "m3u4u sync failed with exit code $LASTEXITCODE"
        }
    }

    Invoke-Adb @('connect', $Device)
    $devices = (& $adb devices) -join "`n"
    $devicePattern = '(?m)^' + [regex]::Escape($Device) + '\s+device\b'
    if ($devices -notmatch $devicePattern) {
        throw "ONN streamer is not connected: $Device"
    }
    Invoke-Adb @('-s', $Device, 'shell', 'input', 'keyevent', '164')

    Invoke-WebRequest -Uri $PlaylistUrl -OutFile $playlistPath -TimeoutSec 30
    $firstLine = Get-Content -LiteralPath $playlistPath -TotalCount 1
    $channelCount = (Select-String -LiteralPath $playlistPath -Pattern '^#EXTINF:' | Measure-Object).Count
    if (-not $firstLine.StartsWith('#EXTM3U') -or $channelCount -ne $ExpectedChannels) {
        throw "playlist validation failed: header='$firstLine', channels=$channelCount"
    }
    Write-SyncLog "validated $channelCount channels"

    if ($DryRun) {
        Write-SyncLog 'dry run complete; no TV file or UI changes made'
        exit 0
    }

    Invoke-Adb @('-s', $Device, 'push', $playlistPath, $remotePlaylistPath)
    if (-not $SkipTiviMateReload) {
        Reload-TiviMate
    }
    Write-SyncLog 'completed successfully'
}
catch {
    Write-SyncLog "failed: $($_.Exception.Message)"
    exit 1
}
finally {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
}
