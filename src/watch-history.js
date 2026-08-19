// watch-history.js — persistent local playback progress.

const path = require('path');
const fs = require('fs');

let appRef = null;
let historyPath = null;

function getHistoryPath() {
    if (!historyPath) historyPath = path.join(appRef.getPath('userData'), 'vault-watch-history.json');
    return historyPath;
}

function loadHistory() {
    try {
        if (fs.existsSync(getHistoryPath())) return JSON.parse(fs.readFileSync(getHistoryPath(), 'utf8'));
    } catch (error) { console.error('[watch-history] Failed to load:', error.message); }
    return { items: {} };
}

function saveHistory(history) {
    try { fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2), 'utf8'); return true; }
    catch (error) { console.error('[watch-history] Failed to save:', error.message); return false; }
}

function makeKey(mediaType, title) {
    return `${mediaType || 'local'}:${title || 'Unknown'}`;
}

function writeProgress(data, completed = false) {
    const history = loadHistory();
    const key = makeKey(data.mediaType, data.title);
    const existing = history.items[key] || {};
    history.items[key] = {
        ...existing,
        ...data,
        key,
        mediaType: data.mediaType || 'local',
        title: data.title || 'Unknown',
        positionSec: data.positionSec || 0,
        durationSec: data.durationSec || 0,
        completed: completed || (data.durationSec > 0 && data.positionSec / data.durationSec >= 0.9),
        lastWatched: new Date().toISOString(),
        firstWatched: existing.firstWatched || new Date().toISOString(),
    };
    saveHistory(history);
    return { success: true };
}

function registerWatchHistoryHandlers(ipcMain, app) {
    appRef = app;
    ipcMain.handle('watch-history:set-progress', (_event, data = {}) => writeProgress(data));
    ipcMain.handle('watch-history:get-progress', (_event, data = {}) => loadHistory().items[makeKey(data.mediaType, data.title)] || null);
    ipcMain.handle('watch-history:continue-watching', (_event, { limit = 20 } = {}) => ({
        success: true,
        items: Object.values(loadHistory().items)
            .filter(item => !item.completed && item.positionSec > 30)
            .sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched))
            .slice(0, limit),
    }));
    ipcMain.handle('watch-history:get-all', (_event, { limit = 100 } = {}) => ({
        success: true,
        items: Object.values(loadHistory().items)
            .sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched))
            .slice(0, limit),
    }));
    ipcMain.handle('watch-history:mark-watched', (_event, data = {}) => writeProgress(data, true));
    ipcMain.handle('watch-history:remove', (_event, data = {}) => {
        const history = loadHistory();
        delete history.items[makeKey(data.mediaType, data.title)];
        saveHistory(history);
        return { success: true };
    });
    ipcMain.handle('watch-history:clear', () => { saveHistory({ items: {} }); return { success: true }; });
}

module.exports = { registerWatchHistoryHandlers, loadHistory, makeKey };
