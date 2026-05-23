const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
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

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 800,
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
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
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
function saveSettings(settings) { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, s) => { saveSettings(s); return true; });

// Register Modular Handlers
cryptoHandlers.registerCryptoHandlers(ipcMain);
previewHandlers.registerPreviewHandlers(ipcMain);
normalizationHandlers.registerNormalizationHandlers(ipcMain);
scannerHandlers.registerScannerHandlers(ipcMain);

// Open Directory Dialog
ipcMain.handle('dialog:openDirectory', async () => {
    console.log('[main:dialog] Opening directory dialog...');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) { console.log('[main:dialog] Cancelled'); return null; }
    console.log('[main:dialog] Selected:', filePaths[0]);
    return filePaths[0];
});

// Shell Actions & System Actions
ipcMain.handle('open-file', (_event, filePath) => {
    console.log('[main:open] Opening:', filePath);
    if (typeof filePath === 'string' && fs.existsSync(filePath)) {
        shell.openPath(path.resolve(filePath)).then(err => {
            if (err) console.error('[main:open] Error:', err);
        });
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
        return { success: true };
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
            count++;
        } catch (e) {
            errors.push(`Failed to paste ${src}: ${e.message}`);
        }
    }
    return { success: true, count, errors };
});

// Zip Selections
ipcMain.handle('zip-selection', async (_event, { paths, outputPath }) => {
    if (!Array.isArray(paths) || paths.length === 0 || !outputPath) {
        return { success: false, error: 'Invalid parameters' };
    }
    return new Promise((resolve) => {
        const psPathArray = '@(' + paths.map(p => "'" + p.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'").join(',') + ')';
        const psOut = "'" + outputPath.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
        const cmd = `Compress-Archive -LiteralPath ${psPathArray} -DestinationPath ${psOut} -Force`;
        console.log('[main:zip] Running:', cmd);
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
            { windowsHide: true, timeout: 120000 },
            (err, _stdout, stderr) => {
                if (err) {
                    console.error('[main:zip] Error:', stderr || err.message);
                    resolve({ success: false, error: (stderr || err.message).substring(0, 300) });
                } else {
                    resolve({ success: true, path: outputPath });
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

ipcMain.handle('upscale-video', async (_event, filePath) => {
    console.log('[main:upscale] Scaffolding upscaling request for:', filePath);
    // Mock successful upscaling timeout
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { success: true };
});

// Context Menus
ipcMain.handle('show-context-menu', async (event, item) => {
    return new Promise((resolve) => {
        let resolved = false;
        const once = (val) => { if (!resolved) { resolved = true; resolve(val); } };
        let templ = [];
        if (item.type === 'video' || item.type === 'image' || item.type === 'other') {
            const isEnc = typeof item.path === 'string' && item.path.toLowerCase().endsWith('.enc');
            templ = [
                {
                    label: 'Open File', click: () => {
                        shell.openPath(item.path).then(err => { once(err ? 'open-error' : 'opened'); });
                    }
                },
                { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); once('show'); } },
                { type: 'separator' },
                { label: 'Copy Path', click: () => { clipboard.writeText(item.path); once('copied'); } },
                { type: 'separator' },
                { label: 'Cut', click: () => once('cut') },
                { label: 'Copy', click: () => once('copy') },
                { label: 'Rename', click: () => once('rename') },
                { type: 'separator' },
                isEnc ? { label: 'Decrypt File', click: () => once('decrypt-prompt') }
                    : { label: 'Encrypt File', click: () => once('encrypt-prompt') },
                { type: 'separator' },
                { label: 'Generate Preview', click: () => once('generate-webm') },
                { label: 'Clean & Isolate Vocals', click: () => once('normalize-audio') },
                { label: 'Clean Vocals & Transcribe', click: () => once('normalize-audio-transcribe') },
                { label: 'Upscale Video', click: () => once('upscale-video') },
                { label: 'Zip Selection', click: () => once('zip-selection') },
                { type: 'separator' },
                { label: 'Delete', click: () => once('delete-item') },
                { label: 'Properties', click: () => once('properties') }
            ];
        } else if (item.type === 'fakeFolder') {
            templ = [
                { label: `Open Folder: ${item.name}`, click: () => once('open-folder') },
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

// File Properties
ipcMain.handle('get-file-properties', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
    }
    try {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const baseProps = {
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: ext
        };
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
