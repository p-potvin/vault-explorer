/**
 * ai-subtitles.js — Main-process coordinator & serializer for AI subtitles.
 *
 * Ensures all AI subtitle requests (player button, card context menu, or CLI)
 * serialize through a single queue so multiple videos never spawn parallel
 * `nemo-speech.exe` processes.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');
const utils = require('./utils');
const { convertSrtToVtt } = require('./ipc/subtitles.ipc');

const LOG_TAG = '[ai-subtitles]';
const log = (...args) => console.log(LOG_TAG, ...args);

let jobQueue = Promise.resolve();
let activeSession = null;

/**
 * Enqueue a subtitle generation task so concurrent requests execute sequentially.
 */
function enqueueSubtitleJob(fn) {
    const run = jobQueue.then(fn, fn);
    jobQueue = run.catch(() => {});
    return run;
}

function subtitlesDelegator() {
    return utils.resolvePwshScriptPath('Start-Subtitles.ps1');
}

function forwardStatus(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
}

function countCues(srtPath) {
    try {
        const text = fs.readFileSync(srtPath, 'utf8');
        const matches = text.match(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g);
        return matches ? matches.length : 0;
    } catch (_) {
        return 0;
    }
}

function stopActiveSession() {
    if (!activeSession) return false;
    activeSession.stopped = true;
    const proc = activeSession.proc;
    if (proc && !proc.killed) {
        try {
            utils.killProcessTree(proc.pid);
        } catch (_) {
            try { proc.kill(); } catch (_) {}
        }
    }
    activeSession = null;
    return true;
}

function runSubtitlesDirect({ videoPath, separator, translateTo, translateFrom, translateEngine = 'hf', model }) {
    const args = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', subtitlesDelegator(),
        '-Target', videoPath,
        '-Separator', separator || 'none',
    ];
    if (model) {
        args.push('-Model', String(model));
    }
    if (translateTo && translateTo !== 'none' && translateTo !== 'original') {
        args.push('-TranslateTo', translateTo);
        if (translateFrom && translateFrom !== 'none' && translateFrom !== 'auto') {
            args.push('-TranslateFrom', translateFrom);
        }
        args.push('-TranslateEngine', translateEngine || 'hf');
    }

    return new Promise((resolve) => {
        const tail = [];
        const proc = spawn('powershell.exe', args, { windowsHide: true });
        if (activeSession) activeSession.proc = proc;

        const collect = (chunk) => {
            for (const line of chunk.toString().split(/\r?\n/)) {
                if (!line.trim()) continue;
                tail.push(line.trim());
                if (tail.length > 8) tail.shift();
                log(line);
            }
        };
        proc.stdout.on('data', collect);
        proc.stderr.on('data', collect);
        proc.on('error', (err) => resolve({ code: 1, tail: [err.message] }));
        proc.on('close', (code) => resolve({ code: code ?? 1, tail }));
    });
}

function registerAiSubtitlesHandlers(ipcMain) {
    ipcMain.handle('start-live-subtitles', async (_event, params = {}) => {
        const { videoPath, separator, translateTo, translateFrom, translateEngine = 'hf', model } = params;
        if (!videoPath || videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
            return { success: false, error: 'AI subtitles require a local playback source.' };
        }
        stopActiveSession();
        const session = { videoPath, stopped: false, proc: null };
        activeSession = session;

        forwardStatus('live-subtitle-status', { status: 'started', videoPath, message: 'Queued AI subtitles' });
        enqueueSubtitleJob(async () => {
            if (session.stopped) {
                forwardStatus('live-subtitle-status', { final: true, status: 'STOPPED', videoPath, cues: 0 });
                return;
            }
            const { code, tail } = await runSubtitlesDirect({
                videoPath, separator, translateTo, translateFrom, translateEngine, model,
            });
            if (activeSession === session) activeSession = null;
            if (session.stopped) {
                forwardStatus('live-subtitle-status', { final: true, status: 'STOPPED', videoPath, cues: 0 });
                return;
            }
            const dir = path.dirname(videoPath);
            const stem = path.basename(videoPath, path.extname(videoPath));
            const targetSrt = translateTo && translateTo !== translateFrom
                ? path.join(dir, `${stem}.${translateTo}.srt`)
                : path.join(dir, `${stem}.srt`);
            const fallbackSrt = path.join(dir, `${stem}.srt`);
            const finalSrt = fs.existsSync(targetSrt) ? targetSrt : (fs.existsSync(fallbackSrt) ? fallbackSrt : null);

            if (code !== 0 || !finalSrt) {
                forwardStatus('live-subtitle-status', {
                    final: true,
                    status: 'FAILED',
                    videoPath,
                    error: tail.join(' | ') || `Exit code ${code}`,
                });
                return;
            }
            const vttPath = convertSrtToVtt(finalSrt);
            const cues = countCues(finalSrt);
            forwardStatus('live-subtitle-status', { final: true, status: 'SUCCESS', videoPath, srtPath: finalSrt, vttPath, cues });
        });

        return { success: true };
    });

    ipcMain.handle('stop-live-subtitles', async () => {
        return { success: true, stopped: stopActiveSession() };
    });
}

function shutdownAiSubtitles() {
    stopActiveSession();
}

module.exports = {
    enqueueSubtitleJob,
    registerAiSubtitlesHandlers,
    shutdownAiSubtitles,
    subtitlesDelegator,
    // Backward-compatible aliases
    registerLiveSubtitlesHandlers: registerAiSubtitlesHandlers,
    shutdownLiveSubtitles: shutdownAiSubtitles,
};

if (require.main === module) {
    const target = process.argv[2];
    if (!target) {
        console.error('usage: node src/ai-subtitles.js <media path> [separator]');
        process.exit(1);
    }
    runSubtitlesDirect({ videoPath: path.resolve(target), separator: process.argv[3] || 'none' })
        .then(({ code }) => process.exit(code));
}
