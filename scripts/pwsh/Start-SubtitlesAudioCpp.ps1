<#
.SYNOPSIS
    Generate .srt subtitles with audio.cpp. No PyTorch, GPU end to end.

.DESCRIPTION
    Runs audio.cpp with parakeet-tdt-0.6b-v3 (GGUF) and CUDA htdemucs separation
    end to end without PyTorch dependencies:

        ffmpeg          44.1 kHz stereo (separation) / 16 kHz mono (ASR)
        [-Separate]     audiocpp --family htdemucs --task sep   ~10.6x realtime
                        in -SepChunkMinutes slices, crossfaded back together
        audiocpp        --task asr --family parakeet_tdt --words-out
        words_to_srt.py cues from word gaps
        translate_srt.py deep_translator

    Modeled after vault-cacophony/scripts/Start-SubtitlesAudioCpp.ps1.

.PARAMETER TargetDir
    Target directory or single media file to transcribe.

.PARAMETER Langs
    Target language(s) for deep_translator (e.g. "fr,es").

.PARAMETER NoSeparate
    Skip HTDemucs vocal stem separation pass.

.PARAMETER SkipExisting
    Skip media files that already have an adjacent .srt file.
#>
[CmdletBinding()]
param(
    [Alias("Folder","Directory","Target","VideoPath")][string]$TargetDir = $PWD.Path,
    [string]$OutputDir,
    [Alias("r")][switch]$Recurse,
    [string]$Langs = "",
    [switch]$SkipExisting,
    [switch]$NoSeparate,
    [double]$VolumeBoost = 1.5,
    [double]$Gap = 0.6,
    [double]$SepChunkMinutes = 6,
    [double]$SepOverlap = 10,
    [double]$LongFormThreshold = 300,
    [double]$AsrWindow = 45,
    [int]$MaxChars = 76,
    [double]$MaxDur = 6.0,
    [int]$Width = 42,
    [string[]]$Extensions = @(".mp4",".mkv",".avi",".mov",".webm",".mp3",".wav",".flac",".m4a",".aac",".ogg",".ts",".wmv"),
    [string]$AudioCpp,
    [string]$Python
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ReposRoot = Split-Path -Parent $ProjectRoot
$PythonScriptsDir = Join-Path $ProjectRoot 'python-scripts'

if (-not $AudioCpp) {
    $AudioCppCandidates = @(
        $env:VW_AUDIOCPP,
        (Join-Path $ReposRoot "vault-cacophony\audio.cpp"),
        (Join-Path $ProjectRoot "tools\audiocpp")
    )
    foreach ($cand in $AudioCppCandidates) {
        if ($cand -and (Test-Path -LiteralPath (Join-Path $cand "audiocpp_cli.exe"))) {
            $AudioCpp = $cand
            break
        }
    }
}

if (-not $AudioCpp -or -not (Test-Path -LiteralPath (Join-Path $AudioCpp "audiocpp_cli.exe"))) {
    Write-Error "audiocpp_cli.exe not found. Set `$env:VW_AUDIOCPP or ensure vault-cacophony\audio.cpp is built."
    exit 1
}

$Cli = Join-Path $AudioCpp "audiocpp_cli.exe"

if (-not $Python) {
    $PythonCandidates = @(
        (Join-Path $ReposRoot "vault-commander\cli\utils\.venv\Scripts\python.exe"),
        (Join-Path $ProjectRoot ".venv\Scripts\python.exe"),
        "python"
    )
    foreach ($cand in $PythonCandidates) {
        if ($cand -eq "python" -or (Test-Path $cand)) {
            $Python = $cand
            break
        }
    }
}

function Resolve-ModelPath([string[]]$Candidates, [string]$What) {
    foreach ($cand in $Candidates) {
        if ($cand -and (Test-Path -LiteralPath $cand)) {
            return $cand
        }
    }
    Write-Error "Missing $What. Checked:`n  " + ($Candidates -join "`n  ")
    exit 1
}

$Store = Join-Path $env:LOCALAPPDATA "VaultWares\models"
$AsrModel = Resolve-ModelPath @(
    (Join-Path $ProjectRoot "tools\models\parakeet-tdt-0.6b-v3-gguf\parakeet-tdt-0.6b-v3-q8_0.gguf"),
    (Join-Path $Store "parakeet-tdt-0.6b-v3-gguf\parakeet-tdt-0.6b-v3-q8_0.gguf"),
    (Join-Path $AudioCpp "models\Parakeet-TDT-0.6B-v3-GGUF\parakeet-tdt-0.6b-v3-q8_0.gguf"),
    (Join-Path $ReposRoot "vault-commander\cli\utils\models\parakeet-tdt-0.6b-v3-gguf\parakeet-tdt-0.6b-v3-q8_0.gguf")
) "ASR model (Parakeet-TDT GGUF)"

if (-not $NoSeparate) {
    $SepModel = Resolve-ModelPath @(
        (Join-Path $ProjectRoot "tools\models\htdemucs-gguf\htdemucs-f16.gguf"),
        (Join-Path $Store "htdemucs-gguf\htdemucs-f16.gguf"),
        (Join-Path $AudioCpp "models\htdemucs-f16.gguf"),
        (Join-Path $ReposRoot "vault-commander\cli\utils\models\htdemucs-gguf\htdemucs-f16.gguf")
    ) "Separation model (HTDemucs GGUF)"
}

$ToSrt  = Join-Path $PythonScriptsDir "words_to_srt.py"
$ToLang = Join-Path $PythonScriptsDir "translate_srt.py"

foreach ($p in @($Cli, $AsrModel, $ToSrt, $ToLang)) {
    if (-not (Test-Path -LiteralPath $p)) { Write-Error "Missing required component: $p"; exit 1 }
}

foreach ($exe in @("ffmpeg","ffprobe")) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { Write-Error "$exe not found on PATH"; exit 1 }
}

$env:PATH = "$AudioCpp;$env:PATH"
Remove-Item Env:CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue

function Format-Num([double]$v) {
    return $v.ToString([System.Globalization.CultureInfo]::InvariantCulture)
}

function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [string]$What)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "$What failed (exit $LASTEXITCODE): $((($out | Select-Object -Last 4) -join ' | '))"
        }
    }
    finally { $ErrorActionPreference = $prev }
}

function Get-AudioSeconds([string]$Path) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $raw = & ffprobe -v error -show_entries format=duration -of csv=p=0 -i $Path 2>$null }
    finally { $ErrorActionPreference = $prev }
    $out = 0.0
    if (-not [double]::TryParse(
            "$raw".Trim(), [System.Globalization.NumberStyles]::Float,
            [System.Globalization.CultureInfo]::InvariantCulture, [ref]$out)) {
        throw "ffprobe gave no duration for $Path"
    }
    return $out
}

function Invoke-Separation {
    param(
        [string]$Cli, [string]$Model, [string]$Mix, [string]$WorkDir,
        [double]$ChunkSec, [double]$Overlap
    )
    $total = Get-AudioSeconds $Mix
    $n = 1
    if ($ChunkSec -gt 0 -and $total -gt $ChunkSec) {
        $n = [int][Math]::Ceiling($total / $ChunkSec)
        if ($n -ge 2 -and ($total - ($n - 1) * $ChunkSec) -lt (3 * $Overlap)) { $n-- }
    }

    $vocals = @()
    for ($i = 0; $i -lt $n; $i++) {
        $part = Join-Path $WorkDir ("part{0:d3}.wav" -f $i)
        $dir  = Join-Path $WorkDir ("sep{0:d3}" -f $i)
        $src  = $Mix
        if ($n -gt 1) {
            $coreStart = $i * $ChunkSec
            $coreEnd   = if ($i -eq $n - 1) { $total } else { ($i + 1) * $ChunkSec }
            $readStart = if ($i -eq 0) { 0.0 } else { $coreStart - $Overlap }
            Invoke-Native ffmpeg @(
                '-hide_banner','-loglevel','error','-nostdin','-y',
                '-ss',(Format-Num $readStart),'-t',(Format-Num ($coreEnd - $readStart)),
                '-i',$Mix,'-c:a','pcm_s16le',$part) "chunk $($i + 1)/$n cut"
            if (-not (Test-Path -LiteralPath $part)) { throw "ffmpeg could not cut chunk $($i + 1)/$n" }
            $src = $part
            Write-Host ("    sep {0}/{1}" -f ($i + 1), $n) -ForegroundColor DarkGray
        }

        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Invoke-Native $Cli @(
            '--family','htdemucs','--task','sep','--mode','offline','--model',$Model,
            '--backend','cuda','--audio',$src,'--out-dir',$dir) "separation (chunk $($i + 1)/$n)"
        $stem = Join-Path $dir "vocals.wav"
        if (-not (Test-Path -LiteralPath $stem)) { throw "separation produced no vocals stem (chunk $($i + 1)/$n)" }

        $keep = Join-Path $WorkDir ("vocals{0:d3}.wav" -f $i)
        Move-Item -LiteralPath $stem -Destination $keep -Force
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue }
        $vocals += $keep
    }
    return ,$vocals
}

function Join-VocalStems {
    param([string[]]$Stems, [string]$Out, [double]$Overlap, [double]$Volume)
    $ffArgs = @('-hide_banner','-loglevel','error','-nostdin','-y')
    foreach ($s in $Stems) { $ffArgs += @('-i', $s) }
    $prev = '0:a'
    $filter = ''
    for ($i = 1; $i -lt $Stems.Count; $i++) {
        $filter += "[$prev][${i}:a]acrossfade=d=$(Format-Num $Overlap):c1=tri:c2=tri[x$i];"
        $prev = "x$i"
    }
    $filter += "[$prev]volume=$(Format-Num $Volume)[out]"
    $ffArgs += @('-filter_complex', $filter, '-map', '[out]', '-ac', '1', '-ar', '16000', $Out)
    Invoke-Native ffmpeg $ffArgs "vocal stitch"
}

if ($OutputDir) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) "subs-audiocpp"
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

$files = @()
if (Test-Path -LiteralPath $TargetDir -PathType Leaf) {
    $files = @(Get-Item -LiteralPath $TargetDir)
} else {
    $files = Get-ChildItem -LiteralPath $TargetDir -File -Recurse:$Recurse |
             Where-Object { $Extensions -contains $_.Extension.ToLower() }
}

if (-not $files) { Write-Host "No media files found at $TargetDir"; exit 0 }

$chunkLabel = if ($NoSeparate) { "n/a" } elseif ($SepChunkMinutes -gt 0) { "$SepChunkMinutes min" } else { "whole file" }
Write-Host ("`n  {0} file(s) | separate={1} | chunk={2} | langs={3} | gap={4}s`n" -f `
    $files.Count, (-not $NoSeparate), $chunkLabel, $(if($Langs){$Langs}else{"none"}), $Gap) -ForegroundColor Cyan

$done = 0; $skipped = 0; $failed = 0
foreach ($f in $files) {
    $base    = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $srtPath = Join-Path $(if ($OutputDir) { $OutputDir } else { $f.DirectoryName }) "$base.srt"

    if ($SkipExisting -and (Test-Path -LiteralPath $srtPath)) {
        Write-Host "  = $($f.Name) (exists)" -ForegroundColor DarkGray; $skipped++; continue
    }
    Write-Host "  > $($f.Name)" -ForegroundColor White
    $t0 = Get-Date
    $safe = "job_" + [System.BitConverter]::ToString(
        [System.Security.Cryptography.MD5]::Create().ComputeHash(
            [System.Text.Encoding]::UTF8.GetBytes($f.FullName))).Replace("-","").Substring(0,12)
    $workDir = Join-Path $Tmp $safe
    try {
        $asrWav = Join-Path $Tmp "$safe.16k.wav"
        if ($NoSeparate) {
            Invoke-Native ffmpeg @(
                '-hide_banner','-loglevel','error','-nostdin','-y','-i',$f.FullName,
                '-vn','-ac','1','-ar','16000','-af',"volume=$(Format-Num $VolumeBoost)",$asrWav) "audio extract"
        } else {
            $sepWav = Join-Path $Tmp "$safe.44k.wav"
            Invoke-Native ffmpeg @(
                '-hide_banner','-loglevel','error','-nostdin','-y','-i',$f.FullName,
                '-vn','-ac','2','-ar','44100',$sepWav) "audio extract"
            if (-not (Test-Path -LiteralPath $sepWav)) { throw "ffmpeg failed" }

            New-Item -ItemType Directory -Force -Path $workDir | Out-Null
            $stems = Invoke-Separation -Cli $Cli -Model $SepModel -Mix $sepWav -WorkDir $workDir `
                                       -ChunkSec ($SepChunkMinutes * 60) -Overlap $SepOverlap
            Join-VocalStems -Stems $stems -Out $asrWav -Overlap $SepOverlap -Volume $VolumeBoost
        }
        if (-not (Test-Path -LiteralPath $asrWav)) { throw "no 16 kHz audio for ASR" }

        $words = Join-Path $Tmp "$safe.words.json"
        Invoke-Native $Cli @(
            '--task','asr','--family','parakeet_tdt','--model',$AsrModel,'--backend','cuda',
            '--session-option','parakeet_tdt.offline_mode=auto',
            '--session-option',"parakeet_tdt.audio_chunk_threshold_sec=$(Format-Num $LongFormThreshold)",
            '--session-option',"parakeet_tdt.audio_chunk_duration_sec=$(Format-Num $AsrWindow)",
            '--audio',$asrWav,'--words-out',$words) "ASR"
        if (-not (Test-Path -LiteralPath $words)) { throw "ASR produced no words JSON" }

        $tmpSrt = Join-Path $Tmp "$safe.srt"
        & $Python $ToSrt --words $words --out $tmpSrt --gap (Format-Num $Gap) `
                  --max-chars $MaxChars --max-dur (Format-Num $MaxDur) --width $Width
        if (-not (Test-Path -LiteralPath $tmpSrt)) { throw "cue builder produced no .srt" }
        Move-Item -LiteralPath $tmpSrt -Destination $srtPath -Force

        if ($Langs) { & $Python $ToLang --srt $srtPath --langs $Langs }

        $done++
        Write-Host ("    done in {0:N1}s" -f ((Get-Date) - $t0).TotalSeconds) -ForegroundColor Green
    }
    catch { $failed++; Write-Host "    [!] $($_.Exception.Message)" -ForegroundColor Red }
    finally {
        foreach ($x in @("$safe.16k.wav","$safe.44k.wav","$safe.words.json")) {
            $p = Join-Path $Tmp $x
            if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }
        }
        if (Test-Path -LiteralPath $workDir) { Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

Write-Host ("`n  {0} done, {1} skipped, {2} failed`n" -f $done, $skipped, $failed) -ForegroundColor Cyan
