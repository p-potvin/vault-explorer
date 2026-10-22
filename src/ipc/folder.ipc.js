// folder.ipc.js — handles virtual/local directory sizes, and asynchronous trickplay file parsing.

const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

// Folder sizes come from vault-raggae's folder index (MFT + USN journal, every drive; owned by the gateway since
// Thu 22 Oct 2026). The walk below is the fallback when the gateway is down or the folder is not indexed.
const RAGGAE_URL = process.env.RAGGAE_URL || 'http://127.0.0.1:8750';
// Circuit breaker: after a network error or timeout the gateway is skipped for a while, so a listing of many
// folders falls back at once instead of waiting out the timeout per folder. A 404 (not indexed) does not trip it.
const GATEWAY_COOLDOWN_MS = 30000;
let gatewayOfflineUntil = 0;

async function gatewayFolderSize(dir) {
    if (Date.now() < gatewayOfflineUntil) return null;
    try {
        const res = await fetch(`${RAGGAE_URL}/v1/files/sizes?limit=0&path=${encodeURIComponent(dir)}`,
            { headers: { 'x-vw-project': 'vault-explorer' }, signal: AbortSignal.timeout(2000) });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.bytes === 'number' ? data.bytes : null;
    } catch (e) {
        gatewayOfflineUntil = Date.now() + GATEWAY_COOLDOWN_MS;
        return null;
    }
}

async function calculateDirectorySizeRecursive(dir) {
    let size = 0;
    try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            let isDir = entry.isDirectory();
            if (entry.isSymbolicLink()) {
                try {
                    const targetStat = fs.statSync(fullPath);
                    if (targetStat.isDirectory()) isDir = true;
                } catch (e) { }
            }
            if (isDir) {
                const nameLower = entry.name.toLowerCase();
                const isSystemDir = [
                    '.thumbs', '.git', '.normalized', '.trickplay', 'node_modules', 'bower_components', 
                    'jspm_packages', 'web_modules', '.venv', 'venv', 'env', 'virtualenv', '.conda',
                    '.gitmodules', '.gitattributes', '.gitignore', '.github', '.svn', '.hg',
                    '.npm', '.yarn', '.pnpm-store', '.cache', '.sass-cache', '.eslintcache', 
                    '__pycache__', '.parcel-cache', '.next', '.nuxt', 'dist', 'build', 'out', 
                    'target', 'tmp', 'temp', '$recycle.bin', 'recycler', '.trashes', 
                    'system volume information', 'appdata', 'local settings'
                ].includes(nameLower) || 
                nameLower.startsWith('.') || 
                nameLower.startsWith('$') ||
                nameLower.includes('google drive') ||
                nameLower.includes('onedrive') ||
                nameLower.includes('dropbox') ||
                nameLower.includes('proton drive') ||
                nameLower.includes('icloud photos') ||
                nameLower.includes('icloud drive') ||
                nameLower.includes('mega') ||
                nameLower.includes('nextcloud') ||
                nameLower.includes('pcloud') ||
                nameLower.includes('yandex disk') ||
                nameLower.includes('yandexdisk');

                if (!isSystemDir) {
                    size += await calculateDirectorySizeRecursive(fullPath);
                }
            } else {
                const nameLower = entry.name.toLowerCase();
                const isSystemFile = [
                    '.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db',
                    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
                    'ntuser.dat', '.gitignore', '.gitmodules', '.gitattributes'
                ].includes(nameLower);

                if (!isSystemFile) {
                    try {
                        const stats = fs.statSync(fullPath);
                        size += stats.size;
                    } catch (e) { }
                }
            }
        }
    } catch (e) { }
    return size;
}

function registerFolderIpc(ipcMain, mainWindow) {
    // Open Directory Dialog
    ipcMain.handle('dialog:openDirectory', async () => {
        console.log('[folder.ipc] Opening directory dialog...');
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        if (canceled) {
            console.log('[folder.ipc] Cancelled');
            return null;
        }
        console.log('[folder.ipc] Selected:', filePaths[0]);
        return filePaths[0];
    });

    // Smart Folder Sizes
    const folderSizeCache = new Map();
    ipcMain.handle('get-folder-size-background', async (_event, dirPath) => {
        if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
        const indexed = await gatewayFolderSize(dirPath);
        return indexed !== null ? indexed : await calculateDirectorySizeRecursive(dirPath);
    });

    ipcMain.handle('get-folder-size-smart', async (_event, dirPath, fileCount) => {
        if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
        const indexed = await gatewayFolderSize(dirPath);
        if (indexed !== null) return indexed;
        const cached = folderSizeCache.get(dirPath);
        if (cached && cached.fileCount === fileCount) {
            return cached.size;
        }
        const calculatedSize = await calculateDirectorySizeRecursive(dirPath);
        folderSizeCache.set(dirPath, { fileCount, size: calculatedSize });
        return calculatedSize;
    });

    // Trickplay Sprites
    ipcMain.handle('get-trickplay-sprites', async (_event, folderPath) => {
        if (typeof folderPath !== 'string' || !fs.existsSync(folderPath)) return [];
        try {
            const files = await fsPromises.readdir(folderPath);
            let images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'));
            images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            return images.map(img => path.join(folderPath, img));
        } catch (e) {
            return [];
        }
    });
}

module.exports = {
    registerFolderIpc,
    calculateDirectorySizeRecursive
};
