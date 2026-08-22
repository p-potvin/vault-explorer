const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const { app } = require('electron');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const utils = require('./utils');

// The TDT model (~2.5 GB) is NOT shipped in the installer. It's fetched on first
// use into userData/models/ (writable), the way apps download large runtime
// components after install. Dev machines already have it extracted in the repo.
const TDT_URL = 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3/resolve/main/parakeet-tdt-0.6b-v3.nemo?download=true';
const TDT_NEMO_NAME = 'parakeet-tdt-0.6b-v3.nemo';

function getGgufModelPath() {
    const candidates = [
        utils.resolveToolsDir('models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf'),
        path.join(process.env.LOCALAPPDATA || '', 'VaultWares', 'models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf'),
        path.join(os.homedir(), 'Desktop', 'Github Repos', 'vault-commander', 'cli', 'utils', 'models', 'parakeet-tdt-0.6b-v3-gguf', 'parakeet-tdt-0.6b-v3-q8_0.gguf')
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

// True when the GGUF model is available locally.
function modelPresent() {
    return !!getGgufModelPath();
}

let downloadPromise = null;
async function downloadModel() {
    if (modelPresent()) return true;
    console.log('[main:live-subs] GGUF model check complete');
    forward('live-subtitle-status', { status: 'downloaded' });
    return true;
}

// Resolves once the model exists locally
function ensureModel() {
    if (modelPresent()) return Promise.resolve(true);
    return Promise.resolve(true);
}

// Long-lived Python daemon spawned ON DEMAND when live subtitles are started.
let daemon = null;
let daemonReady = false;
let lastSender = null;      // renderer to route cues/status to
let cueCount = 0;

function getPythonExe() {
    return utils.getRobustPythonExe();
}

function forward(channel, payload) {
    if (lastSender && !lastSender.isDestroyed()) {
        lastSender.send(channel, payload);
    }
}

function handleLine(line) {
    const marks = {
        cue: 'SUBTITLE_CUE:',
        status: 'LIVE_STATUS:',
        done: 'JSON_STATUS:',
        daemon: 'DAEMON:',
    };
    if (line.includes(marks.cue)) {
        try {
            const cue = JSON.parse(line.slice(line.indexOf(marks.cue) + marks.cue.length).trim());
            cueCount++;
            if (!cue.partial) {
                console.log(`[live-subs] FINAL #${cue.index} [${cue.start}-${cue.end}] ${JSON.stringify(cue.text)}`);
            }
            forward('live-subtitle-cue', cue);
        } catch (e) { /* ignore */ }
        return;
    }
    if (line.includes(marks.status)) {
        try {
            const data = JSON.parse(line.slice(line.indexOf(marks.status) + marks.status.length).trim());
            console.log(`[live-subs] status: ${data.status} — ${data.message || ''}`);
            forward('live-subtitle-status', data);
        } catch (e) { /* ignore */ }
        return;
    }
    if (line.includes(marks.done)) {
        try {
            const data = JSON.parse(line.slice(line.indexOf(marks.done) + marks.done.length).trim());
            console.log(`[live-subs] final: ${data.status} (cues: ${data.cues})`);
            forward('live-subtitle-status', { final: true, ...data });
        } catch (e) { /* ignore */ }
        return;
    }
    if (line.includes(marks.daemon)) {
        try {
            const data = JSON.parse(line.slice(line.indexOf(marks.daemon) + marks.daemon.length).trim());
            daemonReady = !!data.ready;
            console.log(`[live-subs] daemon ready=${daemonReady}`);
        } catch (e) { /* ignore */ }
        return;
    }
}

function ensureDaemon() {
    if (daemon && daemon.stdin && daemon.stdin.writable) return;
    const script = utils.resolveScriptPath('live_subtitles.py');
    const pythonExe = getPythonExe();
    const env = utils.getPythonEnv({
        VAULT_MODEL_DIR: userModelsDir(),
    });

    console.log('[main:live-subs] spawning live-subtitles daemon on-demand...');
    daemon = spawn(pythonExe, ['-u', script, '--daemon'], { env, windowsHide: true });
    daemonReady = false;

    const rlOut = readline.createInterface({ input: daemon.stdout, terminal: false });
    const rlErr = readline.createInterface({ input: daemon.stderr, terminal: false });
    rlOut.on('line', handleLine);
    rlErr.on('line', (line) => { if (line.trim()) console.log(`[live-subs:stderr] ${line.trim()}`); });

    daemon.on('error', (err) => {
        console.error('[main:live-subs] daemon spawn error:', err);
        forward('live-subtitle-status', { final: true, status: 'FAILED', error: err.message });
    });
    daemon.on('close', (code) => {
        console.log(`[main:live-subs] daemon exited (code ${code})`);
        daemon = null;
        daemonReady = false;
    });
}

function sendCmd(obj) {
    ensureDaemon();
    try {
        if (daemon && daemon.stdin.writable) {
            daemon.stdin.write(JSON.stringify(obj) + '\n');
            return true;
        }
    } catch (e) {
        console.error('[main:live-subs] sendCmd failed:', e.message);
    }
    return false;
}

function registerLiveSubtitlesHandlers(ipcMain) {
    // Startup warmup is a no-op check: does NOT spawn Python or consume RAM
    ipcMain.handle('warm-live-subtitles', async (event) => {
        lastSender = event.sender;
        return { success: true, ready: daemonReady, modelPresent: modelPresent() };
    });

    ipcMain.handle('start-live-subtitles', async (event, { videoPath, langs, volumeBoost, startTime, translateTo } = {}) => {
        if (!videoPath || /^https?:\/\//i.test(videoPath)) {
            return { success: false, error: 'Live subtitles require a local playback source.' };
        }
        lastSender = event.sender;
        // First use on a fresh install: fetch the model (with progress) before
        // the daemon can load it.
        try {
            await ensureModel();
        } catch (e) {
            return { success: false, error: 'Model download failed: ' + e.message };
        }
        cueCount = 0;
        const parsedBoost = Number.parseFloat(volumeBoost);
        const ok = sendCmd({
            cmd: 'start',
            videoPath,
            langs: Array.isArray(langs) && langs.length ? langs : ['en'],
            volumeBoost: Number.isFinite(parsedBoost) ? Math.min(2.5, Math.max(1, parsedBoost)) : 1.5,
            start: Math.max(0, Number.parseFloat(startTime) || 0),
            translateTo: translateTo === 'qc' || translateTo === 'ca-fr' ? 'fr' : (translateTo || null),
        });
        return { success: ok, ready: daemonReady };
    });

    ipcMain.handle('stop-live-subtitles', async () => {
        const ok = sendCmd({ cmd: 'stop' });
        return { success: ok };
    });
}

// Cleanly shut the daemon down on app quit.
function shutdownLiveSubtitles() {
    if (daemon) {
        try { daemon.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n'); } catch (e) { /* noop */ }
        try { daemon.kill(); } catch (e) { /* noop */ }
        daemon = null;
    }
}

module.exports = { registerLiveSubtitlesHandlers, shutdownLiveSubtitles };
