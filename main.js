const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const child_process = require('child_process');
const { execFile } = child_process;

// Import modular files
const utils = require('./src/utils');
const cryptoHandlers = require('./src/crypto');
const previewHandlers = require('./src/previews');
const normalizationHandlers = require('./src/normalization');
const scannerHandlers = require('./src/scanner');
const tmdbHandlers = require('./src/tmdb');
const realDebridHandlers = require('./src/realdebrid');

let mainWindow;
let tray = null;
let isQuitting = false;

function createTray() {
    if (tray) return;
    const trayIconPath = path.join(__dirname, 'vaultwares_logo.png');
    if (fs.existsSync(trayIconPath)) {
        tray = new Tray(trayIconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show Vault Explorer', click: () => { mainWindow.show(); } },
            { type: 'separator' },
            { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('Vault Explorer');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => {
            mainWindow.show();
        });
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 800,
        icon: path.join(__dirname, 'vaultwares_logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            autoplayPolicy: 'no-user-gesture-required'
        },
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#2f3241', symbolColor: '#B07CFF' }
    });
    mainWindow.maximize();
    mainWindow.loadFile('index.html');
    mainWindow.webContents.openDevTools();

    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            const settings = loadSettings();
            if (settings.minimizeToTray) {
                e.preventDefault();
                mainWindow.hide();
                return;
            }
        }
        utils.killAllActiveSubprocesses();
    });

    createTray();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => {
    isQuitting = true;
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Automatic clean exit subprocess killing hooks
app.on('before-quit', utils.killAllActiveSubprocesses);
app.on('will-quit', utils.killAllActiveSubprocesses);
process.on('exit', utils.killAllActiveSubprocesses);

// Load / Save Settings
const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
function loadSettings() {
    try { if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { }
    return { folders: [] };
}
async function saveSettings(settings) {
    try {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[saveSettings] Failed to save settings:', e);
        return false;
    }
}

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', async (_e, s) => { return await saveSettings(s); });

// Register Modular Handlers
cryptoHandlers.registerCryptoHandlers(ipcMain);
previewHandlers.registerPreviewHandlers(ipcMain);
normalizationHandlers.registerNormalizationHandlers(ipcMain);
scannerHandlers.registerScannerHandlers(ipcMain);
tmdbHandlers.registerTmdbHandlers(ipcMain);
realDebridHandlers.registerRealDebridHandlers(ipcMain);

// Open Directory Dialog
ipcMain.handle('dialog:openDirectory', async () => {
    console.log('[main:dialog] Opening directory dialog...');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) { console.log('[main:dialog] Cancelled'); return null; }
    console.log('[main:dialog] Selected:', filePaths[0]);
    return filePaths[0];
});

function safeOpenFile(filePath) {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return Promise.reject(new Error('File not found'));
    }
    const safePath = path.normalize(path.resolve(filePath));
    return shell.openPath(safePath).then(err => {
        if (err) {
            console.error('[main:open] shell.openPath failed, falling back to start command:', err);
            return new Promise((resolve, reject) => {
                const escapedPath = `"${safePath.replace(/"/g, '""')}"`;
                child_process.exec(`start "" ${escapedPath}`, (execErr) => {
                    if (execErr) {
                        console.error('[main:open] start command failed:', execErr);
                        reject(execErr);
                    } else {
                        resolve();
                    }
                });
            });
        }
    });
}

// Shell Actions & System Actions
ipcMain.handle('open-file', async (_event, filePath) => {
    console.log('[main:open] Opening:', filePath);
    try {
        await safeOpenFile(filePath);
    } catch (err) {
        console.error('[main:open] Error:', err);
    }
});

ipcMain.handle('show-in-folder', (_event, filePath) => {
    console.log('[main:show-folder]', filePath);
    if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.showItemInFolder(path.resolve(filePath));
});

ipcMain.handle('copy-to-clipboard', (_event, text) => {
    console.log('[main:clipboard] Copying text');
    clipboard.writeText(text);
});

// Rename File adjacent resources
ipcMain.handle('rename-file', async (_e, oldPath, newName) => {
    if (typeof oldPath !== 'string' || typeof newName !== 'string' || !fs.existsSync(oldPath)) return { success: false, error: 'Invalid input' };
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
    } catch (err) { return { success: false, error: err.message }; }
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

// Paste Cut/Copied items
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
        console.log('[main:zip] Running:', cmd);
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
            { windowsHide: true, timeout: 120000 },
            (err, _stdout, stderr) => {
                if (err) {
                    console.error('[main:zip] Error:', stderr || err.message);
                    resolve({ success: false, error: (stderr || err.message).substring(0, 300) });
                } else {
                    resolve({ success: true, path: targetPath });
                }
            }
        );
    });
});

// File Sizes
ipcMain.handle('get-file-size', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return 0;
    try { const stat = await fsPromises.stat(filePath); return stat.size; } catch (e) { return 0; }
});

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
                if (entry.name !== '.thumbs' && entry.name !== '.git') {
                    size += await calculateDirectorySizeRecursive(fullPath);
                }
            } else {
                try {
                    const stats = fs.statSync(fullPath);
                    size += stats.size;
                } catch (e) { }
            }
        }
    } catch (e) { }
    return size;
}

ipcMain.handle('get-folder-size-background', async (_event, dirPath) => {
    if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
    return await calculateDirectorySizeRecursive(dirPath);
});

const folderSizeCache = new Map();
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

ipcMain.handle('upscale-video', async (event, filePath) => {
    console.log('[main:upscale] RealESRGAN requested for:', filePath);
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
    }

    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    const name = path.basename(filePath);
    const enhancedDir = path.join(dir, '.enhanced');
    if (!fs.existsSync(enhancedDir)) {
        fs.mkdirSync(enhancedDir, { recursive: true });
    }
    const outputPath = path.join(enhancedDir, name);

    let sourcePath = filePath;
    let tempSourceFile = null;
    if (fs.existsSync(outputPath)) {
        const tempDir = path.join(enhancedDir, 'temp_upscale');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        tempSourceFile = path.join(tempDir, 'temp_src_' + name);
        try {
            fs.copyFileSync(outputPath, tempSourceFile);
            sourcePath = tempSourceFile;
        } catch (copyErr) {
            console.error('[main:upscale] Failed to create temp copy of existing enhanced file:', copyErr.message);
        }
    }

    const realesrganPath = path.join(__dirname, 'tools', 'realesrgan-ncnn-vulkan.exe');
    const modelsPath = path.join(__dirname, 'tools', 'models');

    if (!fs.existsSync(realesrganPath)) {
        if (tempSourceFile && fs.existsSync(tempSourceFile)) {
            try { fs.unlinkSync(tempSourceFile); } catch (e) {}
        }
        return { success: false, error: 'RealESRGAN executable not found in tools/' };
    }

    return new Promise((resolve) => {
        const args = [
            '-i', sourcePath,
            '-o', outputPath,
            '-n', 'realesr-animevideov3-x2',
            '-m', modelsPath
        ];

        console.log(`[main:upscale] Spawning: ${realesrganPath} ${args.join(' ')}`);
        const proc = child_process.spawn(realesrganPath, args, { windowsHide: true });

        let errorData = '';
        let stdoutBuffer = '';
        let stderrBuffer = '';

        const handleLine = (line) => {
            const match = line.match(/(\d+(?:\.\d+)?)%/);
            if (match) {
                const percent = Math.round(parseFloat(match[1]));
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('upscale-progress', { videoPath: filePath, percent, label: `Upscaling... ${percent}%` });
                }
            }
        };

        proc.stdout.on('data', (data) => {
            const str = data.toString();
            stdoutBuffer += str;
            let lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop();
            for (const line of lines) {
                handleLine(line);
                console.log(`[upscale:stdout] ${line.trim()}`);
            }
        });

        proc.stderr.on('data', (data) => {
            const str = data.toString();
            errorData += str;
            stderrBuffer += str;
            let lines = stderrBuffer.split(/\r?\n/);
            stderrBuffer = lines.pop();
            for (const line of lines) {
                handleLine(line);
                console.log(`[upscale:stderr] ${line.trim()}`);
            }
        });

        proc.on('close', (code) => {
            if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
            if (stderrBuffer.trim()) handleLine(stderrBuffer);
            console.log(`[main:upscale] Finished with code ${code}`);

            if (tempSourceFile && fs.existsSync(tempSourceFile)) {
                try { fs.unlinkSync(tempSourceFile); } catch (e) {}
            }

            if (code === 0 && fs.existsSync(outputPath)) {
                const metaPath = filePath + '.meta.json';
                if (fs.existsSync(metaPath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (!meta.enhancements) {
                            meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                        }
                        meta.enhancements.video = true;
                        meta.enhancedPath = outputPath;
                        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
                    } catch (e) {}
                }
                resolve({ success: true, path: outputPath });
            } else {
                resolve({ success: false, error: errorData.trim() || `RealESRGAN process exited with code ${code}` });
            }
        });
    });
});

// Context Menus
ipcMain.handle('show-context-menu', async (event, item) => {
    return new Promise((resolve) => {
        let resolved = false;
        const once = (val) => { if (!resolved) { resolved = true; resolve(val); } };
        let templ = [];
        if (item.type === 'video' || item.type === 'image' || item.type === 'other' || item.type === 'encrypted') {
            const isEnc = typeof item.path === 'string' && item.path.toLowerCase().endsWith('.enc');
            const hasEnhanced = item.enhancedPath;
            const hasAudioEnh = item.enhancements && item.enhancements.audio;
            const hasVideoEnh = item.enhancements && item.enhancements.video;
            const hasSubs = item.enhancements && item.enhancements.subtitles && item.enhancements.subtitles.length > 0;
            const hasTrans = item.enhancements && item.enhancements.translation && item.enhancements.translation.length > 0;

            templ = [
                {
                    label: 'Open File', click: () => {
                        safeOpenFile(item.path)
                            .then(() => once('opened'))
                            .catch(() => once('open-error'));
                    }
                },
                { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); once('show'); } },
                { type: 'separator' },
                { 
                    label: item.isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites', 
                    click: () => once('toggle-favorite') 
                },
                { type: 'separator' },
                { label: 'Copy Path', click: () => { clipboard.writeText(item.path); once('copied'); } },
                { type: 'separator' },
                { label: 'Cut', click: () => once('cut') },
                { label: 'Copy', click: () => once('copy') },
                { label: 'Rename', click: () => once('rename') },
                { type: 'separator' },
                isEnc ? { label: 'Decrypt File', click: () => once('decrypt-prompt') }
                    : { label: 'Encrypt File', click: () => once('encrypt-prompt') },
                { type: 'separator' }
            ];

            if (item.type === 'video' || (item.type === 'encrypted' && !isEnc)) {
                templ.push(
                    { label: 'Generate Preview', click: () => once('generate-webm') },
                    { type: 'separator' },
                    { label: 'Enhance Audio 🪄', type: 'checkbox', checked: !!hasAudioEnh, click: () => once('normalize-audio') },
                    { label: 'Generate Subtitles', type: 'checkbox', checked: !!hasSubs, click: () => once('generate-subtitles-prompt') },
                    { label: 'Translate this video', type: 'checkbox', checked: !!hasTrans, click: () => once('translate-video-prompt') },
                    { label: 'Enhance Video 🪄', type: 'checkbox', checked: !!hasVideoEnh, click: () => once('enhance-video-prompt') }
                );
                if (hasEnhanced) {
                    templ.push(
                        { type: 'separator' },
                        { label: 'Revert Enhancements', click: () => once('revert-enhancements') }
                    );
                }
                templ.push({ type: 'separator' });
            }

            templ.push(
                { label: 'Zip Selection', click: () => once('zip-selection') },
                { type: 'separator' },
                { label: 'Delete', click: () => once('delete-item') },
                { label: 'Properties', click: () => once('properties') }
            );
        } else if (item.type === 'fakeFolder') {
            templ = [
                { label: `Open Folder: ${item.name}`, click: () => once('open-folder') },
                { type: 'separator' },
                { label: 'Paste into Folder', enabled: item._hasClipboard === true, click: () => once('paste-into-folder') },
                { type: 'separator' },
                { label: 'Remove Folder', click: () => once('remove-folder') }
            ];
        } else if (item.type === 'background') {
            templ = [
                { label: 'Paste', enabled: item._hasClipboard === true, click: () => once('paste') },
                { type: 'separator' },
                { label: 'Refresh', click: () => once('bg-refresh') },
                { label: 'Select All', click: () => once('bg-select-all') },
                { type: 'separator' },
                { label: 'New Virtual Folder…', click: () => once('bg-new-folder') },
            ];
        }
        const menu = Menu.buildFromTemplate(templ);
        menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
        menu.once('menu-will-close', () => { setTimeout(() => once('closed'), 50); });
    });
});

function getFullProbeMetadata(filePath) {
    return new Promise((resolve) => {
        child_process.execFile('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], (err, stdout) => {
            if (err) {
                console.error('[main:ffprobe] Failed to probe:', err);
                resolve(null);
            } else {
                try {
                    resolve(JSON.parse(stdout.trim()));
                } catch (e) {
                    resolve(null);
                }
            }
        });
    });
}

// File Properties
ipcMain.handle('get-file-properties', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
    }
    const metaPath = filePath + '.meta.json';
    try {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();

        // 1. Check if sidecar metadata already exists
        if (fs.existsSync(metaPath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                // Refresh size and mod times
                cached.size = stats.size;
                cached.modified = stats.mtime;
                return { success: true, properties: cached };
            } catch (cacheErr) {
                console.error('[main:properties] Cache read error, re-probing:', cacheErr.message);
            }
        }

        // 2. Fetch fresh properties
        const baseProps = {
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: ext,
            width: null,
            height: null,
            duration: null,
            codec: null,
            bitrate: null,
            audioCodec: null,
            channels: null,
            sampleRate: null,
            fps: null,
            hasAudio: false,
            hasVideo: false,
            enhancements: { audio: false, video: false, subtitles: [], translation: [] }
        };

        if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) {
            const probeData = await getFullProbeMetadata(filePath);
            if (probeData) {
                if (probeData.format) {
                    baseProps.duration = parseFloat(probeData.format.duration) || null;
                    baseProps.bitrate = parseInt(probeData.format.bit_rate) || null;
                }
                if (Array.isArray(probeData.streams)) {
                    const videoStream = probeData.streams.find(s => s.codec_type === 'video');
                    baseProps.hasVideo = !!videoStream;
                    if (videoStream) {
                        baseProps.width = videoStream.width || null;
                        baseProps.height = videoStream.height || null;
                        baseProps.codec = videoStream.codec_name || null;
                        if (videoStream.r_frame_rate) {
                            const parts = videoStream.r_frame_rate.split('/');
                            if (parts.length === 2 && parseFloat(parts[1]) > 0) {
                                baseProps.fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
                            } else {
                                baseProps.fps = parseFloat(videoStream.r_frame_rate) || null;
                            }
                        }
                    }
                    const audioStream = probeData.streams.find(s => s.codec_type === 'audio');
                    baseProps.hasAudio = !!audioStream;
                    if (audioStream) {
                        baseProps.audioCodec = audioStream.codec_name || null;
                        baseProps.channels = audioStream.channels || null;
                        baseProps.sampleRate = parseInt(audioStream.sample_rate) || null;
                    }
                }

                // Save sidecar metadata
                try {
                    fs.writeFileSync(metaPath, JSON.stringify(baseProps, null, 2), 'utf8');
                    console.log('[main:properties] Saved sidecar metadata:', metaPath);
                } catch (saveErr) {
                    console.error('[main:properties] Failed to save sidecar metadata:', saveErr.message);
                }
            }
        }

        return { success: true, properties: baseProps };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Trickplay Sprites
ipcMain.handle('get-trickplay-sprites', async (_event, folderPath) => {
    if (typeof folderPath !== 'string' || !fs.existsSync(folderPath)) return [];
    try {
        const files = await fsPromises.readdir(folderPath);
        let images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'));
        images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return images.map(img => path.join(folderPath, img));
    } catch (e) { return []; }
});

// Get/Set Theme
ipcMain.handle('get-theme', async () => {
    const appSettings = loadSettings();
    return { success: true, theme: appSettings.theme || 'golden-slate' };
});
ipcMain.handle('set-theme', async (_event, theme) => {
    if (typeof theme !== 'string') return { success: false, error: 'Invalid input' };
    const appSettings = loadSettings();
    appSettings.theme = theme;
    saveSettings(appSettings);
    return { success: true };
});

ipcMain.handle('revert-enhancements', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
    }
    const dir = path.dirname(filePath);
    const name = path.basename(filePath);
    const enhancedFile = path.join(dir, '.enhanced', name);
    const metaPath = filePath + '.meta.json';

    try {
        if (fs.existsSync(enhancedFile)) {
            fs.unlinkSync(enhancedFile);
        }
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                meta.enhancements = { audio: false, video: false, subtitles: [], translation: [] };
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
            } catch (e) {}
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
