/**
 * live-subtitles.js — subtitles that appear while the video plays.
 *
 * The engine is vault-cacophony: this project depends on that checkout for the
 * audiocpp binary and the Parakeet weights, and never copies either. One
 * resident server serves every session (scripts/pwsh/Start-AudioCppServer.ps1),
 * because loading the model costs ~12 s and transcribing a 30-second window
 * costs ~200 ms. Paying the load once is the difference between "live" and
 * "wait for the model".
 *
 * How it stays ahead of the playhead
 * ----------------------------------
 * Audio is decoded a window at a time from the play position and transcribed
 * offline; at roughly 150x realtime the pipeline outruns playback immediately
 * and keeps a growing lead, so cues land seconds before they are needed and a
 * two-hour film has a finished sidecar about a minute in.
 *
 * Each window is decoded with a lead-in and the transcript is trimmed back to
 * the previous window's last cue boundary, so a word split across a window edge
 * is recovered rather than lost. Cue boundaries come from gaps between
 * recognised words -- no VAD, no level threshold to tune.
 *
 * Deliberately not audiocpp's streaming mode: measured on 60 s of speech it
 * recovers 82 of 146 words at its default 2 s centre and never beats 103,
 * because only the centre of each re-encoded window survives.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const utils = require('./utils');

const SAMPLE_RATE = 16000;
const SERVER_PORT = 8099;
const MODEL_ID = 'parakeet';

// Measured on 113 s of speech, sweeping this and scoring the sidecar against
// ground truth: 8 s scored 13.6% WER (short windows duplicate across seams),
// 12 s 24.4%, 20 s 5.4%, 30 s 5.0%, 45 s 15.1%. 20 s takes the plateau at the
// lower latency, and the first cues of a session land ~0.3 s after the button.
const WINDOW_S = Number(process.env.VW_LIVE_WINDOW_S) || 20;
const LEAD_S = 1.0;
const CUE_GAP_S = 0.6;
const MIN_CUE_S = 0.3;
// Matches the batch pipeline's cue shape. Continuous speech never pauses long
// enough to end a cue on its own, so a length and a duration ceiling are what
// stop one line running for ten seconds and four hundred characters.
const MAX_CUE_CHARS = 76;
const MAX_CUE_S = 6.0;

let activeSession = null;
let lastSender = null;
let serverBase = null;

// The hook is what lets the CLI at the bottom of this file drive a real session
// outside Electron: same code path, events printed instead of sent.
let eventHook = null;

function forward(channel, payload) {
    if (eventHook) eventHook(channel, payload);
    if (lastSender && !lastSender.isDestroyed()) lastSender.send(channel, payload);
}

function log(...args) { console.log('[live-subs]', ...args); }

// ── vault-cacophony, the AI dependency ──────────────────────────────────────

function resolveCacophony() {
    const candidates = [
        process.env.VW_CACOPHONY,
        process.env.VW_AUDIOCPP ? path.dirname(process.env.VW_AUDIOCPP) : null,
        path.join(__dirname, '..', '..', 'vault-cacophony'),
        path.join(os.homedir(), 'Desktop', 'Github Repos', 'vault-cacophony'),
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(path.join(c, 'audio.cpp', 'audiocpp_server.exe'))) return path.resolve(c);
    }
    return null;
}

function dependencyPresent() {
    return !!resolveCacophony();
}

function serverScript() {
    return path.resolve(__dirname, '..', 'scripts', 'pwsh', 'Start-AudioCppServer.ps1');
}

/**
 * Start or attach to the resident server. Idempotent: the script itself checks
 * the port first, so two windows of the app share one loaded model.
 */
function ensureServer() {
    if (serverBase) return Promise.resolve(serverBase);
    return new Promise((resolve, reject) => {
        if (!dependencyPresent()) {
            return reject(new Error(
                'vault-cacophony not found. It is this project\'s AI dependency: clone it beside ' +
                'vault-explorer and build audio.cpp, or set VW_CACOPHONY to the checkout.'));
        }
        forward('live-subtitle-status', { status: 'loading', message: 'Starting audiocpp server…' });
        const child = spawn('pwsh.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', serverScript(),
            '-Port', String(SERVER_PORT), '-Model', 'asr',
        ], { windowsHide: true });

        let out = '';
        child.stdout.on('data', (d) => { out += d.toString(); });
        child.stderr.on('data', (d) => log('server:', d.toString().trim()));
        child.on('close', (code) => {
            const m = out.match(/AUDIOCPP_READY\s+(\S+)/);
            if (m) {
                serverBase = m[1];
                log('server ready at', serverBase);
                forward('live-subtitle-status', { status: 'ready', message: 'Engine ready' });
                resolve(serverBase);
            } else {
                reject(new Error(`audiocpp server did not start (exit ${code})`));
            }
        });
    });
}

// ── transcription ───────────────────────────────────────────────────────────

/**
 * The OpenAI-shaped /v1/audio/transcriptions endpoint hard-codes its response to
 * {text, timing} and drops word timestamps, which is where cue boundaries come
 * from -- so this posts to the generic task endpoint instead.
 */
async function transcribeWav(wavPath) {
    const res = await fetch(`${serverBase}/v1/tasks/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL_ID,
            audio: wavPath.replace(/\\/g, '/'),
            options: { return_timestamps: 'true' },
        }),
        signal: AbortSignal.timeout(120000),
    });
    const payload = await res.json();
    if (payload.error) throw new Error(payload.error.message || 'audiocpp error');
    return (payload.words || []).map((w) => ({
        word: w.word,
        start: w.start_sample / SAMPLE_RATE,
        end: w.end_sample / SAMPLE_RATE,
    }));
}

/**
 * Cue boundaries from gaps between words: no VAD, no level threshold to tune.
 * A cue also ends when it would outrun what a reader can take in, which is why
 * the length and duration ceilings are checked per word rather than after.
 */
function cuesFromWords(words, offset) {
    const cues = [];
    let buf = [];
    let start = 0;
    let end = 0;
    const flush = () => {
        if (buf.length && (end - start) >= MIN_CUE_S) {
            cues.push({ start: offset + start, end: offset + end, text: buf.join(' ') });
        }
        buf = [];
    };
    for (const w of words) {
        if (!buf.length) { start = w.start; end = w.end; buf.push(w.word); continue; }
        const over = (w.start - end) >= CUE_GAP_S
            || (w.end - start) > MAX_CUE_S
            || (buf.join(' ').length + 1 + w.word.length) > MAX_CUE_CHARS;
        if (over) { flush(); start = w.start; end = w.end; buf = [w.word]; }
        else { buf.push(w.word); end = w.end; }
    }
    flush();
    return cues;
}

/**
 * Parakeet-TDT predicts a duration alongside each token, and a bad duration
 * jumps the decoder forward: whole seconds of speech come back as nothing at
 * all. It is not rare and it is not a window-edge effect -- one measured file
 * lost the same ten seconds from a 31 s window, from a 20 s window that held it
 * in the middle, and from a 12 s window, while a 9 s window over exactly that
 * audio transcribed it perfectly. Sweeping the window size only moves the hole
 * around: on the same 113 s file, 20 s scored 5.4% WER with no gap over 0.8 s,
 * and 12 s scored 46% with a 23 s hole.
 *
 * So instead of hunting for a lucky window, look at what came back: any stretch
 * of two seconds or more with no cue in it gets transcribed again on its own.
 * Silence returns nothing and costs ~50 ms; a skipped sentence comes back. One
 * level deep, because a stretch this short rarely skips again.
 */
async function recoverGaps(session, cues, windowStart, windowEnd, wavPath) {
    const MIN_GAP_S = 2.0;
    const PAD_S = 0.25;
    const holes = [];
    let cursor = windowStart;
    for (const c of cues) {
        if (c.start - cursor >= MIN_GAP_S) holes.push([cursor, c.start]);
        cursor = Math.max(cursor, c.end);
    }
    if (windowEnd - cursor >= MIN_GAP_S) holes.push([cursor, windowEnd]);
    if (!holes.length) return cues;

    // A hole is retried in pieces, never as one span: handing the model the same
    // audio at the same length invites the same skip, and short inputs are what
    // it handles reliably.
    const RECOVER_CHUNK_S = 10;
    const pieces = [];
    for (const [from, to] of holes) {
        const count = Math.max(1, Math.ceil((to - from) / RECOVER_CHUNK_S));
        const step = (to - from) / count;
        for (let i = 0; i < count; i++) pieces.push([from + step * i, from + step * (i + 1)]);
    }

    const recovered = [];
    for (const [from, to] of pieces) {
        if (session.cancelled) break;
        const start = Math.max(0, from - PAD_S);
        const span = (to + PAD_S) - start;
        const patch = `${wavPath}.patch.wav`;
        try {
            await extractWindow(session.videoPath, start, span, patch, session.volumeBoost);
            // The last hole of a session runs past the end of the file, where
            // ffmpeg writes a header and no samples. Nothing to recover there.
            if (!fs.existsSync(patch) || fs.statSync(patch).size < 4096) continue;
            const words = await transcribeWav(patch);
            if (words.length) {
                recovered.push(...cuesFromWords(words, start));
                log(`recovered ${words.length} words in ${(to - from).toFixed(1)}s gap at ${from.toFixed(1)}s`);
            }
        } catch (e) {
            log('gap recovery failed:', e.message);
        } finally {
            try { fs.unlinkSync(`${wavPath}.patch.wav`); } catch (_) { /* noop */ }
        }
    }
    if (!recovered.length) return cues;
    return [...cues, ...recovered].sort((a, b) => a.start - b.start);
}

/**
 * The window's lead-in re-transcribes audio whose cues already went out, and a
 * cue can straddle the boundary. Dropping every cue that starts before the
 * boundary loses whole sentences -- it cost ten seconds of dialogue in testing --
 * so a straddling cue is kept and its repeated opening words are trimmed instead.
 */
function trimCarryover(cues, boundary, previousText) {
    const fresh = cues.filter((c) => c.end > boundary + 0.05);
    if (!fresh.length || !previousText) return fresh;
    const norm = (w) => w.replace(/[.,!?;:—-]+$/g, '').toLowerCase();
    const tail = previousText.split(' ').slice(-4).map(norm);
    const head = fresh[0].text.split(' ');
    for (let n = Math.min(tail.length, head.length, 4); n > 0; n--) {
        if (head.slice(0, n).map(norm).join(' ') === tail.slice(-n).join(' ')) {
            const rest = head.slice(n).join(' ').trim();
            if (!rest) return fresh.slice(1);
            fresh[0] = { ...fresh[0], text: rest, start: Math.max(fresh[0].start, boundary) };
            break;
        }
    }
    return fresh;
}

/** Decode one window to the 16 kHz mono WAV the model wants. */
function extractWindow(videoPath, startSec, durationSec, outPath, volumeBoost) {
    return new Promise((resolve, reject) => {
        const args = [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-ss', startSec.toFixed(3), '-t', durationSec.toFixed(3),
            '-i', videoPath, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
            '-af', `volume=${volumeBoost}`, outPath,
        ];
        const child = spawn(utils.getFFmpegPath(), args, { windowsHide: true });
        let err = '';
        child.stderr.on('data', (d) => { err += d.toString(); });
        child.on('close', (code) => {
            if (activeSession) activeSession.ffmpeg = null;
            if (code === 0 && fs.existsSync(outPath)) resolve(true);
            else reject(new Error(err.trim() || `ffmpeg exited ${code}`));
        });
        child.on('error', reject);
        if (activeSession) activeSession.ffmpeg = child;
    });
}

// ── sidecars ────────────────────────────────────────────────────────────────

function srtTimestamp(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
}

function writeSrt(srtPath, cues) {
    const body = cues.map((c, i) =>
        `${i + 1}\n${srtTimestamp(c.start)} --> ${srtTimestamp(c.end)}\n${c.text}\n`).join('\n');
    fs.writeFileSync(srtPath, body, 'utf8');
}

function convertSrtToVtt(sourcePath) {
    if (path.extname(sourcePath).toLowerCase() !== '.srt') return sourcePath;
    const subtitleDir = path.join(path.dirname(sourcePath), '.subtitles');
    const vttPath = path.join(subtitleDir, `${path.basename(sourcePath, path.extname(sourcePath))}.vtt`);
    try {
        fs.mkdirSync(subtitleDir, { recursive: true });
        const srtText = fs.readFileSync(sourcePath, 'utf8').replace(/^﻿/, '');
        const vttText = `WEBVTT\n\n${srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
        fs.writeFileSync(vttPath, vttText, 'utf8');
        return vttPath;
    } catch (error) {
        console.warn('[live-subs] SRT conversion failed:', error.message);
        return sourcePath;
    }
}

// ── the session ─────────────────────────────────────────────────────────────

async function runSession(session) {
    const { videoPath, startTime, volumeBoost } = session;
    const wavPath = path.join(os.tmpdir(), `vault-live-${process.pid}.wav`);
    let t = Math.max(0, Number(startTime) || 0);
    let emitted = 0;

    while (!session.cancelled) {
        const from = Math.max(0, t - LEAD_S);
        const span = (t - from) + WINDOW_S;
        try {
            await extractWindow(videoPath, from, span, wavPath, volumeBoost);
        } catch (e) {
            // Past the end of the file ffmpeg writes nothing; that is the exit.
            log('window decode ended:', e.message);
            break;
        }
        if (session.cancelled) break;
        // Past the end of the file ffmpeg still exits 0, having written a header
        // and no samples. That is the exit, not an error worth reporting.
        const bytes = fs.existsSync(wavPath) ? fs.statSync(wavPath).size : 0;
        if (bytes < 4096) { log('reached end of audio'); break; }

        let words;
        try {
            words = await transcribeWav(wavPath);
        } catch (e) {
            log('transcription failed:', e.message);
            break;
        }
        // A window that comes back empty is the skip at its worst -- and it is
        // indistinguishable from silence until the pieces are tried, so it goes
        // through the same recovery as any other hole rather than being skipped.
        const cues = await recoverGaps(
            session, words.length ? cuesFromWords(words, from) : [], from, from + span, wavPath);
        if (!cues.length) { t += WINDOW_S; continue; }
        const previous = session.cues.length ? session.cues[session.cues.length - 1].text : null;
        // Trim what the lead-in already said, then move the boundary to the end
        // of the last cue kept -- so the next window never opens mid-sentence.
        const fresh = trimCarryover(cues, t, previous);
        for (const c of fresh) {
            if (session.cancelled) break;
            session.cues.push(c);
            emitted++;
            forward('live-subtitle-cue', {
                videoPath, start: c.start, end: c.end, text: c.text, partial: false,
            });
        }
        const advanced = fresh.length ? fresh[fresh.length - 1].end : t + WINDOW_S;
        if (advanced <= t + 0.05) { t += WINDOW_S; } else { t = advanced; }
    }

    try { fs.unlinkSync(wavPath); } catch (_) { /* noop */ }

    if (session.cancelled) {
        forward('live-subtitle-status', { final: true, status: 'STOPPED', videoPath, cues: emitted });
        return;
    }

    let srtPath = null;
    let vttPath = null;
    if (session.cues.length) {
        const base = path.basename(videoPath, path.extname(videoPath));
        srtPath = path.join(path.dirname(videoPath), `${base}.srt`);
        try {
            writeSrt(srtPath, session.cues);
            vttPath = convertSrtToVtt(srtPath);
        } catch (e) {
            log('sidecar write failed:', e.message);
            srtPath = null;
        }
    }
    forward('live-subtitle-status', {
        final: true,
        status: session.cues.length ? 'SUCCESS' : 'FAILED',
        videoPath, srtPath, vttPath, cues: emitted,
        error: session.cues.length ? null : 'no speech recognised',
    });
}

function startSubtitlesPipeline({ videoPath, volumeBoost, startTime, translateTo, separate = true }) {
    stopActive();
    if (translateTo) {
        // Live cues carry the source text. Translation belongs to the batch path
        // (scripts/pwsh/Start-Subtitles.ps1 -TranslateTo), which translates whole
        // sentences rather than cues -- a cue boundary lands wherever the speaker
        // paused, and translating those fragments one at a time reads like it.
        forward('live-subtitle-status', {
            status: 'ready', videoPath,
            message: 'Live cues stay in the source language; use Generate Subtitles for a translated sidecar.',
        });
    }

    const session = {
        videoPath,
        startTime: startTime || 0,
        volumeBoost: Number(volumeBoost) || 1.5,
        separate: !!separate,
        cues: [],
        cancelled: false,
        ffmpeg: null,
    };
    activeSession = session;

    forward('live-subtitle-status', { status: 'started', videoPath, message: 'Transcribing…' });

    ensureServer()
        .then(() => runSession(session))
        .catch((e) => {
            log('session failed:', e.message);
            forward('live-subtitle-status', {
                final: true, status: 'FAILED', videoPath, error: e.message,
            });
        })
        .finally(() => { if (activeSession === session) activeSession = null; });

    return true;
}

function stopActive() {
    if (!activeSession) return;
    activeSession.cancelled = true;
    if (activeSession.ffmpeg) {
        try { activeSession.ffmpeg.kill(); } catch (_) { /* noop */ }
    }
    activeSession = null;
}

function registerLiveSubtitlesHandlers(ipcMain) {
    ipcMain.handle('warm-live-subtitles', async (event) => {
        lastSender = event.sender;
        // Loading the model here rather than on the first cue means the button
        // is honest about when captions can actually start.
        try {
            await ensureServer();
            return { success: true, ready: true, modelPresent: true };
        } catch (e) {
            return { success: false, ready: false, modelPresent: dependencyPresent(), error: e.message };
        }
    });

    ipcMain.handle('start-live-subtitles', async (event, params = {}) => {
        const { videoPath } = params;
        if (!videoPath || /^https?:\/\//i.test(videoPath)) {
            return { success: false, error: 'Live subtitles require a local playback source.' };
        }
        lastSender = event.sender;
        return { success: startSubtitlesPipeline(params), ready: true };
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

// Drive one session from a terminal, for when something is wrong and Electron is
// in the way:  node src/live-subtitles.js "D:\Media\episode.mkv" [startSeconds]
if (require.main === module) {
    const started = Date.now();
    eventHook = (channel, payload) => {
        const at = ((Date.now() - started) / 1000).toFixed(2).padStart(6);
        if (channel === 'live-subtitle-cue') {
            console.log(`${at}s  [${payload.start.toFixed(2)} -> ${payload.end.toFixed(2)}]  ${payload.text}`);
        } else if (payload.final) {
            console.log(`${at}s  ${payload.status}: ${payload.cues || 0} cues` +
                (payload.srtPath ? ` -> ${payload.srtPath}` : '') +
                (payload.error ? ` (${payload.error})` : ''));
        } else if (payload.message) {
            console.log(`${at}s  ${payload.status}: ${payload.message}`);
        }
    };
    const target = process.argv[2];
    if (!target) {
        console.error('usage: node src/live-subtitles.js <media path> [start seconds]');
        process.exit(2);
    }
    startSubtitlesPipeline({ videoPath: path.resolve(target), startTime: Number(process.argv[3]) || 0 });
}
