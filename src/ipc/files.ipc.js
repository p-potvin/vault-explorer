// files.ipc.js — registers IPC handlers for renaming, copying, cutting, pasting, zipping, deleting, opening, and showing files.

const { dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const child_process = require('child_process');
const { execFile } = child_process;

function safeOpenFile(filePath) {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return Promise.reject(new Error('File not found'));
    }
    const safePath = path.normalize(path.resolve(filePath));
    return shell.openPath(safePath).then(err => {
        if (err) {
            console.error('[files.ipc:open] shell.openPath failed, falling back to start command:', err);
            return new Promise((resolve, reject) => {
                const escapedPath = `"${safePath.replace(/"/g, '""')}"`;
                child_process.exec(`start "" ${escapedPath}`, (execErr) => {
                    if (execErr) {
                        console.error('[files.ipc:open] start command failed:', execErr);
                        reject(execErr);
                    } else {
                        resolve();
                    }
                });
            });
        }
    });
}

function registerFilesIpc(ipcMain, mainWindow) {
    // Save an edited photo (from the photo editor canvas) next to the original
    // as <name>_edited.png (numbered if taken). Never overwrites the source.
    ipcMain.handle('save-edited-image', async (_event, { originalPath, dataUrl }) => {
        try {
            if (!originalPath || !dataUrl) {
                return { success: false, error: 'Missing image data or path' };
            }
            const base64Marker = ';base64,';
            const markerIndex = dataUrl.indexOf(base64Marker);
            if (markerIndex === -1 || !dataUrl.startsWith('data:image/')) {
                return { success: false, error: 'Invalid image dataUrl format' };
            }
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, path.extname(originalPath));
            let outPath = path.join(dir, `${base}_edited.png`);
            let n = 2;
            while (fs.existsSync(outPath)) outPath = path.join(dir, `${base}_edited_${n++}.png`);
            const buf = Buffer.from(dataUrl.slice(markerIndex + base64Marker.length), 'base64');
            await fsPromises.writeFile(outPath, buf);
            return { success: true, outputPath: outPath };
        } catch (e) {
            console.error('[files.ipc:save-edited-image]', e.message);
            return { success: false, error: e.message };
        }
    });

    // Open File
    ipcMain.handle('open-file', async (_event, filePath) => {
        console.log('[files.ipc:open] Opening:', filePath);
        try {
            await safeOpenFile(filePath);
        } catch (err) {
            console.error('[files.ipc:open] Error:', err);
        }
    });

    // Show in Folder
    ipcMain.handle('show-in-folder', (_event, filePath) => {
        console.log('[files.ipc:show-folder]', filePath);
        if (typeof filePath === 'string' && fs.existsSync(filePath)) {
            shell.showItemInFolder(path.resolve(filePath));
        }
    });

    // Rename File
    ipcMain.handle('rename-file', async (_e, oldPath, newName) => {
        if (typeof oldPath !== 'string' || typeof newName !== 'string' || !fs.existsSync(oldPath)) {
            return { success: false, error: 'Invalid input' };
        }
        try {
            const dir = path.dirname(oldPath);
            const oldExt = path.extname(oldPath);
            const oldBase = path.basename(oldPath, oldExt);
            const newBase = path.basename(newName, path.extname(newName));

            const entries = fs.readdirSync(dir);
            for (let entry of entries) {
                if (entry === oldBase + oldExt) {
                    fs.renameSync(path.join(dir, entry), path.join(dir, newBase + oldExt));
                } else if (entry === oldBase + '.trickplay') {
                    fs.renameSync(path.join(dir, entry), path.join(dir, newBase + '.trickplay'));
                } else if (entry.startsWith(oldBase)) {
                    const escapedOldBase = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const replacePattern = new RegExp(`^${escapedOldBase}`);
                    const newEntry = entry.replace(replacePattern, newBase);
                    fs.renameSync(path.join(dir, entry), path.join(dir, newEntry));
                }
            }
            const targetNewPath = path.join(dir, newBase + oldExt);
            return { success: true, newPath: targetNewPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // Delete Files
    ipcMain.handle('delete-item', async (_event, itemPath) => {
        if (typeof itemPath !== 'string' || !fs.existsSync(itemPath)) {
            return { success: false, error: 'Path does not exist' };
        }
        try {
            const stats = fs.lstatSync(itemPath);
            if (stats.isSymbolicLink()) {
                try { fs.unlinkSync(itemPath); } catch (err) { fs.rmdirSync(itemPath); }
            } else if (stats.isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(itemPath);
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Paste Files
    ipcMain.handle('paste-files', async (_event, { paths, mode, destination }) => {
        if (!Array.isArray(paths) || !destination || !fs.existsSync(destination)) {
            return { success: false, error: 'Invalid input parameters' };
        }
        let count = 0;
        const errors = [];
        const pastedPaths = [];
        for (const src of paths) {
            if (!fs.existsSync(src)) {
                errors.push(`${src} does not exist`);
                continue;
            }
            let dest = path.join(destination, path.basename(src));
            if (src.toLowerCase() === dest.toLowerCase()) {
                let baseName = path.basename(src, path.extname(src));
                let ext = path.extname(src);
                let counter = 1;
                while (fs.existsSync(dest)) {
                    dest = path.join(destination, baseName + ' - Copy (' + counter + ')' + ext);
                    counter++;
                }
            }
            try {
                if (mode === 'copy') {
                    fs.copyFileSync(src, dest);
                } else if (mode === 'cut') {
                    fs.renameSync(src, dest);
                }
                pastedPaths.push(dest);
                count++;
            } catch (e) {
                errors.push(`Failed to paste ${src}: ${e.message}`);
            }
        }
        return { success: true, count, errors, pastedPaths };
    });

    // Zip Selections
    ipcMain.handle('zip-selection', async (_event, { paths, outputPath }) => {
        if (!Array.isArray(paths) || paths.length === 0) {
            return { success: false, error: 'Invalid parameters' };
        }
        let targetPath = outputPath;
        if (!targetPath) {
            const defaultDir = path.dirname(paths[0]);
            const defaultName = `selection_${Date.now()}.zip`;
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Zip Archive',
                defaultPath: path.join(defaultDir, defaultName),
                filters: [{ name: 'Zip Archives', extensions: ['zip'] }]
            });
            if (canceled || !filePath) {
                return { success: false, error: 'Save cancelled by user', canceled: true };
            }
            targetPath = filePath;
        }

        return new Promise((resolve) => {
            const psPathArray = '@(' + paths.map(p => "'" + p.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'").join(',') + ')';
            const psOut = "'" + targetPath.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
            const cmd = `Compress-Archive -LiteralPath ${psPathArray} -DestinationPath ${psOut} -Force`;
            console.log('[files.ipc:zip] Running:', cmd);
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
                { windowsHide: true, timeout: 120000 },
                (err, _stdout, stderr) => {
                    if (err) {
                        console.error('[files.ipc:zip] Error:', stderr || err.message);
                        resolve({ success: false, error: (stderr || err.message).substring(0, 300) });
                    } else {
                        resolve({ success: true, path: targetPath });
                    }
                }
            );
        });
    });

    // File Size
    ipcMain.handle('get-file-size', async (_event, filePath) => {
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return 0;
        try {
            const stat = await fsPromises.stat(filePath);
            return stat.size;
        } catch (e) {
            return 0;
        }
    });

    // Read Text File (for M3U playlists and JSON manifests)
    ipcMain.handle('read-text-file', async (_event, filePath) => {
        if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return null;
        try {
            return await fsPromises.readFile(filePath, 'utf8');
        } catch (e) {
            console.error('[files.ipc:read-text-file]', e.message);
            return null;
        }
    });

    // Download HTTP Stream Locally
    ipcMain.handle('download-stream', async (_event, { url, filename, outputDir }) => {
        if (!url || typeof url !== 'string') {
            return { success: false, error: 'Invalid stream URL' };
        }
        try {
            const { app } = require('electron');
            const destDir = outputDir || app.getPath('downloads') || path.join(process.env.USERPROFILE || '', 'Downloads');
            if (!fs.existsSync(destDir)) {
                await fsPromises.mkdir(destDir, { recursive: true });
            }
            const safeName = (filename || 'stream_video.mp4').replace(/[\\/*?:"<>|]/g, '_');
            let targetPath = path.join(destDir, safeName);
            let counter = 2;
            const ext = path.extname(safeName) || '.mp4';
            const base = path.basename(safeName, ext);
            while (fs.existsSync(targetPath)) {
                targetPath = path.join(destDir, `${base}_${counter++}${ext}`);
            }

            const httpModule = url.startsWith('https') ? require('https') : require('http');
            return new Promise((resolve) => {
                const req = httpModule.get(url, { headers: { 'User-Agent': 'vault-explorer/1.0' } }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const redirectUrl = res.headers.location;
                        const redirHttp = redirectUrl.startsWith('https') ? require('https') : require('http');
                        redirHttp.get(redirectUrl, { headers: { 'User-Agent': 'vault-explorer/1.0' } }, (redirRes) => {
                            if (redirRes.statusCode !== 200) {
                                return resolve({ success: false, error: `HTTP ${redirRes.statusCode}` });
                            }
                            const totalBytes = parseInt(redirRes.headers['content-length'] || '0', 10);
                            let receivedBytes = 0;
                            const fileStream = fs.createWriteStream(targetPath);
                            redirRes.on('data', (chunk) => {
                                receivedBytes += chunk.length;
                                if (totalBytes > 0 && mainWindow && !mainWindow.isDestroyed()) {
                                    const percent = Math.round((receivedBytes / totalBytes) * 100);
                                    mainWindow.webContents.send('download-stream-progress', {
                                        url,
                                        filename: safeName,
                                        percent,
                                        receivedBytes,
                                        totalBytes
                                    });
                                }
                            });
                            redirRes.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close(() => resolve({ success: true, path: targetPath, size: receivedBytes }));
                            });
                            fileStream.on('error', (err) => {
                                fs.unlink(targetPath, () => { });
                                resolve({ success: false, error: err.message });
                            });
                        }).on('error', (err) => resolve({ success: false, error: err.message }));
                        return;
                    }

                    if (res.statusCode !== 200) {
                        return resolve({ success: false, error: `HTTP ${res.statusCode}` });
                    }
                    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                    let receivedBytes = 0;
                    const fileStream = fs.createWriteStream(targetPath);
                    res.on('data', (chunk) => {
                        receivedBytes += chunk.length;
                        if (totalBytes > 0 && mainWindow && !mainWindow.isDestroyed()) {
                            const percent = Math.round((receivedBytes / totalBytes) * 100);
                            mainWindow.webContents.send('download-stream-progress', {
                                url,
                                filename: safeName,
                                percent,
                                receivedBytes,
                                totalBytes
                            });
                        }
                    });
                    res.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close(() => resolve({ success: true, path: targetPath, size: receivedBytes }));
                    });
                    fileStream.on('error', (err) => {
                        fs.unlink(targetPath, () => { });
                        resolve({ success: false, error: err.message });
                    });
                });
                req.on('error', (err) => resolve({ success: false, error: err.message }));
            });
        } catch (e) {
            console.error('[files.ipc:download-stream]', e.message);
            return { success: false, error: e.message };
        }
    });
}

module.exports = {
    registerFilesIpc,
    safeOpenFile
};
