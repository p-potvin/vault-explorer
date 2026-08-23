<#
.SYNOPSIS
    Ensure a resident audio.cpp inference server is listening, and report where.

.DESCRIPTION
    Every AI feature in this app talks to one long-lived audiocpp server rather
    than starting a model per job: the weights take ~12 s to load and ~2 GB of
    VRAM, and a transcription of a 10-second window takes 53 ms. Paying the load
    once and keeping it resident is the whole difference between "live" and
    "wait for the model".

    The engine and its weights live in the vault-cacophony checkout, which is
    this project's AI dependency. Nothing here is copied from it -- the binary
    is a 2.4 GB build tree and the weights are hard links into the shared model
    store -- so this script only has to find it.

    Idempotent by design: if something is already serving the requested model on
    the port, this attaches to it and exits. Two apps, or two windows of this
    app, share the one resident model.

    Emits a single machine-readable line on success:

        AUDIOCPP_READY http://127.0.0.1:8099

    Created Sat, 22 Aug 2026

.PARAMETER Stop
    Stop a server started by this script (by port) instead of starting one.

.EXAMPLE
    .\Start-AudioCppServer.ps1

.EXAMPLE
    .\Start-AudioCppServer.ps1 -Port 8123 -Model diar
#>
[CmdletBinding()]
param(
    [int]$Port = 8099,
    [ValidateSet("asr", "diar")][string]$Model = "asr",
    [string]$Cacophony,
    [int]$Device = 0,
    [int]$TimeoutSeconds = 180,
    [switch]$Stop,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Say([string]$msg, [string]$colour = "Gray") {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor $colour }
}

# vault-cacophony is the dependency. Named explicitly in the failure message
# because "audiocpp_server.exe not found" sends people looking in the wrong repo.
function Resolve-Cacophony {
    $candidates = @(
        $Cacophony,
        $env:VW_CACOPHONY,
        $(if ($env:VW_AUDIOCPP) { Split-Path -Parent $env:VW_AUDIOCPP } else { $null }),
        (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "..\vault-cacophony"),
        (Join-Path $env:USERPROFILE "Desktop\Github Repos\vault-cacophony")
    ) | Where-Object { $_ }
    foreach ($c in $candidates) {
        $exe = Join-Path $c "audio.cpp\audiocpp_server.exe"
        if (Test-Path -LiteralPath $exe) { return (Resolve-Path -LiteralPath $c).Path }
    }
    throw ("vault-cacophony not found. It is this project's AI dependency: clone it beside " +
           "vault-explorer and build audio.cpp, or set VW_CACOPHONY to the checkout.")
}

# Weights are hard links into %LOCALAPPDATA%\VaultWares\models, so the store copy
# and the build-tree copy are the same blocks on disk; either path works.
function Resolve-Model([string]$audioCpp, [string]$kind) {
    $store = Join-Path $env:LOCALAPPDATA "VaultWares\models"
    $candidates = switch ($kind) {
        "asr" { @(
            (Join-Path $store "parakeet-tdt-0.6b-v3-gguf\parakeet-tdt-0.6b-v3-q8_0.gguf"),
            (Join-Path $audioCpp "models\Parakeet-TDT-0.6B-v3-GGUF\parakeet-tdt-0.6b-v3-q8_0.gguf")) }
        "diar" { @(
            (Join-Path $store "sortformer-diar-4spk-v1-gguf\sortformer-diar-4spk-v1-q8_0.gguf"),
            (Join-Path $audioCpp "models\Sortformer-Diar-4spk-v1-GGUF\sortformer-diar-4spk-v1-q8_0.gguf")) }
    }
    foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
    throw ("no $kind weights found. Expected one of:`n  " + ($candidates -join "`n  "))
}

function Test-Ready([int]$port, [string]$id) {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/v1/models" -TimeoutSec 3 -ErrorAction Stop
        return [bool]($r.data | Where-Object { $_.id -eq $id -and $_.loaded })
    } catch { return $false }
}

$modelId = if ($Model -eq "asr") { "parakeet" } else { "sortformer" }

if ($Stop) {
    $stopped = 0
    Get-CimInstance Win32_Process -Filter "Name = 'audiocpp_server.exe'" | ForEach-Object {
        if ($_.CommandLine -match "audiocpp-server-$Port\.json") {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    }
    Say "stopped $stopped server(s) on port $Port" "Yellow"
    exit 0
}

if (Test-Ready $Port $modelId) {
    Say "attached to audiocpp server already serving '$modelId' on port $Port" "Green"
    Write-Output "AUDIOCPP_READY http://127.0.0.1:$Port"
    exit 0
}

$root = Resolve-Cacophony
$audioCpp = Join-Path $root "audio.cpp"
$weights = Resolve-Model $audioCpp $Model

$config = [ordered]@{
    host      = "127.0.0.1"
    port      = $Port
    backend   = "cuda"
    device    = $Device
    threads   = 8
    lazy_load = $false
    models    = @(
        if ($Model -eq "asr") {
            [ordered]@{
                id   = $modelId
                family = "parakeet_tdt"
                path = ($weights -replace '\\', '/')
                task = "asr"
                mode = "offline"
                # A live window is a few seconds long, far below the length where
                # bounded windows are needed -- and bounded windows are what cost
                # the batch pipeline 40% of its words before -AsrWindow was set.
                session_options = @{ "parakeet_tdt.offline_mode" = "full_context" }
            }
        } else {
            [ordered]@{
                id   = $modelId
                family = "sortformer_diar"
                path = ($weights -replace '\\', '/')
                task = "diar"
                mode = "offline"
            }
        }
    )
}

$configPath = Join-Path $env:LOCALAPPDATA "VaultWares\audiocpp-server-$Port.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configPath) | Out-Null
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath -Encoding UTF8

Say "starting audiocpp server: $modelId on port $Port (from $root)"
# audio.cpp ships its own CUDA runtime DLLs beside the exe, and a stale
# CUDA_VISIBLE_DEVICES from an older shell hides GPUs from the runtime.
$env:PATH = "$audioCpp;$env:PATH"
Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
Start-Process -FilePath (Join-Path $audioCpp "audiocpp_server.exe") `
              -ArgumentList @("--config", "`"$configPath`"") `
              -WorkingDirectory $audioCpp -WindowStyle Hidden | Out-Null

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    if (Test-Ready $Port $modelId) {
        Say "ready" "Green"
        Write-Output "AUDIOCPP_READY http://127.0.0.1:$Port"
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Error "audiocpp server did not report '$modelId' loaded within $TimeoutSeconds s"
exit 1
