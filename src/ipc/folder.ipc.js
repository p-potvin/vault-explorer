// folder.ipc.js — handles virtual/local directory sizes, and asynchronous trickplay file parsing.

const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

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
        return await calculateDirectorySizeRecursive(dirPath);
    });

    ipcMain.handle('get-folder-size-smart', async (_event, dirPath, fileCount) => {
        if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
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
