/**
 * live-subtitles.js — AI subtitles for the local player.
 *
 * Generation is delegated to the vw CLI, the same engine as Generate Subtitles:
 *     vw better-subtitles -Input "<video>" -Separator <rnnoise|...>
 * vw writes <video>.srt beside the file. That sidecar is converted to WebVTT and
 * loaded by the renderer as an ordinary subtitle track, so AI subtitles render
 * exactly like subtitles loaded from disk.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { convertSrtToVtt } = require('./ipc/subtitles.ipc');

const SEPARATORS = new Set(['rnnoise', 'mel_band_roformer', 'bs_roformer', 'htdemucs', 'none']);
const DEFAULT_SEPARATOR = 'rnnoise';

let activeSession = null;
let lastSender = null;

// The hook lets the CLI at the bottom of this file drive a session outside
// Electron: same code path, events printed instead of sent.
let eventHook = null;

function forward(channel, payload) {
    if (eventHook) eventHook(channel, payload);
    if (lastSender && !lastSender.isDestroyed()) lastSender.send(channel, payload);
}

function log(...args) { console.log('[live-subs]', ...args); }

function killTree(child) {
    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
        child.kill();
    }
}

// The input path travels in an environment variable, so spaces and quotes in
// file names never reach PowerShell's parser.
function runVwBetterSubtitles(session, separator) {
    return new Promise((resolve) => {
        const child = spawn('pwsh.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            '& vw better-subtitles -Input $env:VW_LIVE_INPUT -Separator $env:VW_LIVE_SEPARATOR',
        ], {
            windowsHide: true,
            env: { ...process.env, VW_LIVE_INPUT: session.videoPath, VW_LIVE_SEPARATOR: separator },
        });
        let tail = [];
        const onData = (d) => {
            for (const line of d.toString().split(/\r?\n/)) {
                const text = line.trim();
                if (text) tail = [...tail, text].slice(-5);
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (e) => resolve({ code: -1, tail: [e.message] }));
        child.on('close', (code) => resolve({ code, tail }));
        session.child = child;
    });
}

async function runSession(session, separator) {
    const { videoPath } = session;
    const startedAt = Date.now();
    const srtPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.srt`);

    const { code, tail } = await runVwBetterSubtitles(session, separator);
    session.child = null;
    if (session.cancelled) {
        forward('live-subtitle-status', { final: true, status: 'STOPPED', videoPath, cues: 0 });
        return;
    }

    // vw exits 0 even for some per-file failures, so the fresh SRT on disk is
    // the success signal, as in the batch path.
    const fresh = fs.existsSync(srtPath) && fs.statSync(srtPath).mtimeMs >= startedAt - 1000;
    if (!fresh) {
        const error = tail.length ? tail[tail.length - 1] : `vw exited ${code}`;
        log('vw better-subtitles produced no SRT:', tail.join(' | '));
        forward('live-subtitle-status', { final: true, status: 'FAILED', videoPath, error });
        return;
    }

    const cues = (fs.readFileSync(srtPath, 'utf8').match(/-->/g) || []).length;
    const vttPath = convertSrtToVtt(srtPath);
    forward('live-subtitle-status', { final: true, status: 'SUCCESS', videoPath, srtPath, vttPath, cues });
}

function startSubtitlesPipeline({ videoPath, separator }) {
    stopActive();
    const sep = SEPARATORS.has(separator) ? separator : DEFAULT_SEPARATOR;
    const session = { videoPath, cancelled: false, child: null };
    activeSession = session;

    forward('live-subtitle-status', { status: 'started', videoPath, message: `vw better-subtitles -Separator ${sep}` });
    runSession(session, sep)
        .catch((e) => {
            log('session failed:', e.message);
            forward('live-subtitle-status', { final: true, status: 'FAILED', videoPath, error: e.message });
        })
        .finally(() => { if (activeSession === session) activeSession = null; });

    return true;
}

function stopActive() {
    if (!activeSession) return;
    activeSession.cancelled = true;
    if (activeSession.child) killTree(activeSession.child);
    activeSession = null;
}

function registerLiveSubtitlesHandlers(ipcMain) {
    ipcMain.handle('start-live-subtitles', async (event, params = {}) => {
        const { videoPath } = params;
        if (!videoPath || /^https?:\/\//i.test(videoPath)) {
            return { success: false, error: 'AI subtitles require a local playback source.' };
        }
        lastSender = event.sender;
        return { success: startSubtitlesPipeline(params) };
    });

    ipcMain.handle('stop-live-subtitles', async () => {
        stopActive();
        return { success: true };
    });
}

function shutdownLiveSubtitles() {
    stopActive();
}

module.exports = { registerLiveSubtitlesHandlers, shutdownLiveSubtitles };

// Drive one session from a terminal:  node src/live-subtitles.js "D:\Media\episode.mkv" [separator]
if (require.main === module) {
    const target = process.argv[2];
    if (!target) {
        console.error('usage: node src/live-subtitles.js <media path> [separator]');
        process.exit(2);
    }
    eventHook = (channel, payload) => {
        if (!payload.final) return;
        console.log(`${payload.status}: ${payload.cues || 0} cues` +
            (payload.srtPath ? ` -> ${payload.srtPath}` : '') +
            (payload.error ? ` (${payload.error})` : ''));
        process.exitCode = payload.status === 'SUCCESS' ? 0 : 1;
    };
    startSubtitlesPipeline({ videoPath: path.resolve(target), separator: process.argv[3] });
}
