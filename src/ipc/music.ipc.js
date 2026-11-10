// music.ipc.js — the Music tab's data: what each song says about itself (vault-raggae) and how often it was played
// (the song's own sidecar).
//
// Tags come from vault-raggae's `GET /v1/music/tracks?under=<folder>` (app/music/meta.py: title cleaned of its track
// number, artist, album, track, year, genre, bitrate, picture). Its pictures are files on this PC
// (%LOCALAPPDATA%\VaultWares\raggae\music-art\<vw_id>.jpg), handed to the page as paths.
//
// Plays live in the song's sidecar under `listening` ({ plays, last_played, skips, last_skipped }), so they follow
// the file through a move or rename and any app can read them. Until Tue 10 Nov 2026 they were kept in this app's
// localStorage (key `vault-play-counts`); `music-import-plays` moves those over once.

const fs = require('fs');
const path = require('path');
const sidecarRecord = require('../sidecar-record');

const RAGGAE_URL = process.env.RAGGAE_URL || 'http://127.0.0.1:8750';
const ART_DIR = process.env.RAGGAE_MUSIC_ART_DIR
    || path.join(process.env.LOCALAPPDATA || '', 'VaultWares', 'raggae', 'music-art');
const GATEWAY_COOLDOWN_MS = 30000;
let gatewayOfflineUntil = 0;

async function gatewayTracks(folder) {
    if (Date.now() < gatewayOfflineUntil) return null;
    try {
        const url = `${RAGGAE_URL}/v1/music/tracks?under=${encodeURIComponent(folder || '')}`;
        const res = await fetch(url, { headers: { 'x-vw-project': 'vault-explorer' }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data.items) ? data.items : null;
    } catch (_) {
        gatewayOfflineUntil = Date.now() + GATEWAY_COOLDOWN_MS;
        return null;
    }
}

function listeningOf(mediaPath) {
    const rec = sidecarRecord.read(mediaPath).record;
    const l = rec && rec.listening;
    return (l && typeof l === 'object') ? l : null;
}

/** Adds `delta` to the song's listening record ({ plays, last_played } or { skips, last_skipped }). */
function bump(mediaPath, kind, delta = 1) {
    if (typeof mediaPath !== 'string' || !fs.existsSync(mediaPath)) return null;
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const cur = listeningOf(mediaPath) || {};
    const next = { ...cur };
    if (kind === 'skip') {
        next.skips = (cur.skips || 0) + delta;
        next.last_skipped = now;
    } else {
        next.plays = (cur.plays || 0) + delta;
        if (delta === 1) next.last_played = now;      // an import of old counts has no date
    }
    const written = sidecarRecord.update(mediaPath, { listening: next });
    return written ? next : null;
}

function registerMusicIpc(ipcMain) {
    ipcMain.handle('music-tracks', async (_e, folder) => {
        const items = await gatewayTracks(typeof folder === 'string' ? folder : '');
        if (!items) return { success: false, items: [] };
        for (const it of items) {
            if (it.art && it.vw_id) {
                const file = path.join(ART_DIR, `${it.vw_id}.jpg`);
                it.artFile = fs.existsSync(file) ? file : null;
            }
        }
        return { success: true, items };
    });

    ipcMain.handle('music-listening', async (_e, paths) => {
        const out = {};
        let n = 0;
        for (const p of Array.isArray(paths) ? paths : []) {
            if (typeof p !== 'string') continue;
            const l = listeningOf(p);
            if (l) out[p] = l;
            // sidecar reads are synchronous: hand the main thread back every 50 (Gemini on #68)
            if (++n % 50 === 0) await new Promise(resolve => setImmediate(resolve));
        }
        return out;
    });

    ipcMain.handle('music-record-play', async (_e, mediaPath) => bump(mediaPath, 'play'));
    ipcMain.handle('music-record-skip', async (_e, mediaPath) => bump(mediaPath, 'skip'));

    // { path: count } from the old localStorage store, added to each song's sidecar once
    ipcMain.handle('music-import-plays', async (_e, counts) => {
        let written = 0;
        for (const [p, n] of Object.entries(counts || {})) {
            if (Number.isInteger(n) && n > 0 && bump(p, 'play', n)) written++;
        }
        return { written };
    });
}

module.exports = { registerMusicIpc, bump, listeningOf };
