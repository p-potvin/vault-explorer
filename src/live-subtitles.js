const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const { app } = require('electron');
const utils = require('./utils');

function resolveAudioCppDir() {
    const candidates = [
        process.env.VW_AUDIOCPP,
        path.join(app.getAppPath(), 'tools', 'audiocpp'),
        path.join(os.homedir(), 'Desktop', 'Github Repos', 'vault-cacophony', 'audio.cpp'),
    ];
    for (const cand of candidates) {
        if (cand && fs.existsSync(path.join(cand, 'audiocpp_cli.exe'))) {
            return cand;
        }
    }
    return null;
}

function resolveGgufModelPath() {
    const audioCppDir = resolveAudioCppDir();
    const candidates = [
        audioCppDir ? path.join(audioCppDir, 'models', 'Parakeet-TDT-0.6B-v3-GGUF', 'parakeet-tdt-0.6b-v3-q8_0.gguf') : null,
        utils.resolveToolsDir('models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf'),
        path.join(process.env.LOCALAPPDATA || '', 'VaultWares', 'models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf'),
        path.join(os.homedir(), 'Desktop', 'Github Repos', 'vault-commander', 'cli', 'utils', 'models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf'),
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

function modelPresent() {
    return !!resolveGgufModelPath();
}

let activeSession = null;
let lastSender = null;

function forward(channel, payload) {
    if (lastSender && !lastSender.isDestroyed()) {
        lastSender.send(channel, payload);
    }
}

function convertSrtToVtt(sourcePath) {
    if (path.extname(sourcePath).toLowerCase() !== '.srt') return sourcePath;
    const subtitleDir = path.join(path.dirname(sourcePath), '.subtitles');
    const vttPath = path.join(subtitleDir, `${path.basename(sourcePath, path.extname(sourcePath))}.vtt`);
    try {
        fs.mkdirSync(subtitleDir, { recursive: true });
        const srtText = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
        const vttText = `WEBVTT\n\n${srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
        fs.writeFileSync(vttPath, vttText, 'utf8');
        return vttPath;
    } catch (error) {
        console.warn('[live-subs] SRT conversion failed:', error.message);
        return sourcePath;
    }
}

function startSubtitlesPipeline({ videoPath, langs, volumeBoost, startTime, translateTo }) {
    if (activeSession && activeSession.process) {
        try { activeSession.process.kill(); } catch (_) { }
        activeSession = null;
    }

    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'pwsh', 'Start-SubtitlesAudioCpp.ps1');
    const langStr = Array.isArray(langs) ? langs.join(',') : (langs || translateTo || 'en');
    const boost = Number(volumeBoost) || 1.5;

    const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-TargetDir', videoPath,
        '-Langs', langStr,
        '-NoSeparate', // Fast mode for live subtitles
        '-VolumeBoost', String(boost)
    ];

    console.log('[main:live-subs] Launching Audio.cpp / GGML pipeline:', args.join(' '));
    forward('live-subtitle-status', {
        status: 'started',
        videoPath,
        message: 'Starting Audio.cpp / GGML Parakeet-TDT ASR pipeline...'
    });

    const child = spawn('powershell.exe', args, {
        windowsHide: true,
        env: {
            ...process.env,
            VW_AUDIOCPP: resolveAudioCppDir() || '',
        }
    });

    activeSession = {
        process: child,
        videoPath,
        langStr
    };

    const rlOut = readline.createInterface({ input: child.stdout, terminal: false });
    const rlErr = readline.createInterface({ input: child.stderr, terminal: false });

    rlOut.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        console.log(`[live-subs:out] ${trimmed}`);
        forward('live-subtitle-status', {
            status: 'processing',
            videoPath,
            message: trimmed
        });
    });

    rlErr.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed) console.log(`[live-subs:err] ${trimmed}`);
    });

    child.on('close', (code) => {
        console.log(`[main:live-subs] Audio.cpp process exited with code ${code}`);
        if (activeSession && activeSession.process === child) {
            activeSession = null;
        }

        const base = path.basename(videoPath, path.extname(videoPath));
        const srtPath = path.join(path.dirname(videoPath), `${base}.srt`);
        let vttPath = null;
        const success = fs.existsSync(srtPath);

        if (success) {
            vttPath = convertSrtToVtt(srtPath);
        }

        forward('live-subtitle-status', {
            final: true,
            status: success ? 'SUCCESS' : 'FAILED',
            videoPath,
            srtPath: success ? srtPath : null,
            vttPath,
            error: success ? null : `Process exited with code ${code}`
        });
    });

    return true;
}

function registerLiveSubtitlesHandlers(ipcMain) {
    ipcMain.handle('warm-live-subtitles', async (event) => {
        lastSender = event.sender;
        return { success: true, ready: true, modelPresent: modelPresent() };
    });

    ipcMain.handle('start-live-subtitles', async (event, params = {}) => {
        const { videoPath } = params;
        if (!videoPath || /^https?:\/\//i.test(videoPath)) {
            return { success: false, error: 'Live subtitles require a local playback source.' };
        }
        lastSender = event.sender;
        const ok = startSubtitlesPipeline(params);
        return { success: ok, ready: true };
    });

    ipcMain.handle('stop-live-subtitles', async () => {
        if (activeSession && activeSession.process) {
            try { activeSession.process.kill(); } catch (_) { }
            activeSession = null;
        }
        return { success: true };
    });
}

function shutdownLiveSubtitles() {
    if (activeSession && activeSession.process) {
        try { activeSession.process.kill(); } catch (_) { }
        activeSession = null;
    }
}

module.exports = { registerLiveSubtitlesHandlers, shutdownLiveSubtitles };
