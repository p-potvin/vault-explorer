const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu, Tray, session } = require('electron');
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
const livestreamHandlers = require('./src/livestream');
const watchHistoryHandlers = require('./src/watch-history');

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

    // YouTube Referer & Origin overrides to fix Error 153 (domain embedding restrictions)
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
            details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            details.requestHeaders['Origin'] = 'https://www.youtube.com';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        }
    );

    mainWindow.loadFile('index.html');

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

// Register Split IPC Handlers
const { registerFilesIpc } = require('./src/ipc/files.ipc');
const { registerFolderIpc } = require('./src/ipc/folder.ipc');
const { registerSystemIpc } = require('./src/ipc/system.ipc');
const { registerMediaIpc } = require('./src/ipc/media.ipc');
const { registerCryptoIpc } = require('./src/ipc/crypto.ipc');

registerFilesIpc(ipcMain, mainWindow);
registerFolderIpc(ipcMain, mainWindow);
registerSystemIpc(ipcMain, settingsPath, loadSettings, saveSettings);
registerMediaIpc(ipcMain);
registerCryptoIpc(ipcMain);

// Register Modular Handlers
previewHandlers.registerPreviewHandlers(ipcMain);
normalizationHandlers.registerNormalizationHandlers(ipcMain);
scannerHandlers.registerScannerHandlers(ipcMain);
tmdbHandlers.registerTmdbHandlers(ipcMain);
realDebridHandlers.registerRealDebridHandlers(ipcMain);
livestreamHandlers.registerLivestreamHandlers(ipcMain);
watchHistoryHandlers.registerWatchHistoryHandlers(ipcMain, app);
