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
    const trayIconPath = path.join(__dirname, 'public', 'vaultwares_logo.png');
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
        icon: path.join(__dirname, 'public', 'vaultwares_logo.png'),
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

    // YouTube Referer & Origin overrides to fix Error 152/153/4 (domain embedding restrictions)
    // Apply to ALL sessions to cover iframe requests
    const youtubeUrls = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*'];
    
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: youtubeUrls },
        (details, callback) => {
            // Set both Referer and Origin to youtube.com to bypass embedding restrictions
            details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            details.requestHeaders['Origin'] = 'https://www.youtube.com';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            // Remove any existing origin that might conflict
            delete details.requestHeaders['referer'];
            delete details.requestHeaders['origin'];
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        }
    );

    // Bypass frame blocking restrictions on YouTube trailer embedding
    session.defaultSession.webRequest.onHeadersReceived(
        { urls: youtubeUrls },
        (details, callback) => {
            const responseHeaders = { ...details.responseHeaders };
            // Remove security headers that block iframe embedding
            delete responseHeaders['x-frame-options'];
            delete responseHeaders['X-Frame-Options'];
            delete responseHeaders['content-security-policy'];
            delete responseHeaders['Content-Security-Policy'];
            delete responseHeaders['x-content-security-policy'];
            delete responseHeaders['X-Content-Security-Policy'];
            callback({ cancel: false, responseHeaders });
        }
    );

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            const settings = loadSettings();
            if (settings.minimizeToTray) {
                e.preventDefault();
                mainWindow.webContents.send('app-hidden');
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

// Clip Handler for video clipping
function registerClipHandler(ipcMain) {
    ipcMain.handle('clipVideo', async (event, { inputPath, outputFormat, startTime, duration, quality }) => {
        try {
            console.log('[main:clip] Clipping video:', { inputPath, outputFormat, startTime, duration, quality });
            
            // Sanitize input path
            const safeInputPath = path.normalize(inputPath).replace(/^file:\\\\\\/, '');
            
            // Check if input file exists
            if (!fs.existsSync(safeInputPath)) {
                return { success: false, error: 'Input file not found' };
            }
            
            // Get file info
            const stat = fs.statSync(safeInputPath);
            const fileSizeMB = stat.size / (1024 * 1024);
            console.log('[main:clip] Input file size:', fileSizeMB.toFixed(2), 'MB');
            
            // Determine output path
            const fileName = path.basename(safeInputPath, path.extname(safeInputPath));
            const ext = outputFormat === 'gif' ? 'gif' : outputFormat;
            const outputName = `${fileName}_clip_${Date.now()}.${ext}`;
            
            // Default output to user's Videos folder or Desktop
            let outputDir = app.getPath('videos');
            if (!fs.existsSync(outputDir)) {
                outputDir = app.getPath('desktop');
            }
            const outputPath = path.join(outputDir, outputName);
            
            // Build ffmpeg command
            const ffmpegArgs = [];
            
            // Input
            ffmpegArgs.push('-i', safeInputPath);
            
            // Seek to start time
            ffmpegArgs.push('-ss', String(startTime));
            
            // Duration
            ffmpegArgs.push('-t', String(duration));
            
            // Output format specific options
            if (outputFormat === 'webm') {
                ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
                ffmpegArgs.push('-c:a', 'libopus', '-b:a', '128k');
            } else if (outputFormat === 'mp4') {
                ffmpegArgs.push('-c:v', 'libx264', '-crf', '23', '-preset', 'fast');
                ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
            } else if (outputFormat === 'gif') {
                ffmpegArgs.push('-vf', 'fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2');
                ffmpegArgs.push('-c:v', 'gif', '-f', 'gif');
            }
            
            // Quality settings
            if (quality !== 'original') {
                if (quality === '1080p') {
                    ffmpegArgs.push('-vf', 'scale=1920:-2');
                } else if (quality === '720p') {
                    ffmpegArgs.push('-vf', 'scale=1280:-2');
                } else if (quality === '480p') {
                    ffmpegArgs.push('-vf', 'scale=854:-2');
                }
            }
            
            // Force overwrite
            ffmpegArgs.push('-y');
            
            // Output file
            ffmpegArgs.push(outputPath);
            
            console.log('[main:clip] ffmpeg args:', ffmpegArgs.join(' '));
            
            // Check if ffmpeg is available
            const ffmpegPath = utils.getFFmpegPath();
            if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
                return { 
                    success: false, 
                    error: 'ffmpeg not found. Please install ffmpeg and add it to PATH.' 
                };
            }
            
            // Run ffmpeg
            const ffmpegProc = execFile(ffmpegPath, ffmpegArgs, {
                cwd: path.dirname(safeInputPath),
                windowsHide: false
            });
            
            // Track progress
            let stdoutData = '';
            let stderrData = '';
            
            ffmpegProc.stdout.on('data', (data) => {
                stdoutData += data.toString();
                // Send progress updates if available
                const timeMatch = stdoutData.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (timeMatch && event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('clip-progress', { currentTime: timeMatch[1] });
                }
            });
            
            ffmpegProc.stderr.on('data', (data) => {
                stderrData += data.toString();
                console.log('[main:clip] ffmpeg stderr:', data.toString().trim());
            });
            
            // Wait for completion
            await new Promise((resolve, reject) => {
                ffmpegProc.on('close', (code) => {
                    if (code === 0) {
                        console.log('[main:clip] Clipping completed successfully');
                        resolve();
                    } else {
                        console.error('[main:clip] ffmpeg failed with code:', code);
                        console.error('[main:clip] stderr:', stderrData);
                        reject(new Error(`ffmpeg failed with code ${code}: ${stderrData.substring(0, 200)}`));
                    }
                });
                ffmpegProc.on('error', (err) => {
                    console.error('[main:clip] ffmpeg error:', err);
                    reject(err);
                });
            });
            
            // Verify output exists
            if (!fs.existsSync(outputPath)) {
                return { success: false, error: 'Output file was not created' };
            }
            
            const outputSizeMB = fs.statSync(outputPath).size / (1024 * 1024);
            console.log('[main:clip] Output file size:', outputSizeMB.toFixed(2), 'MB');
            
            return {
                success: true,
                outputPath: outputPath,
                outputSize: fs.statSync(outputPath).size
            };
            
        } catch (error) {
            console.error('[main:clip] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

// Load / Save Settings
const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.mutePreviews === undefined) {
                settings.mutePreviews = false;
            }
            return settings;
        }
    } catch (e) { }
    return { folders: [], mutePreviews: false };
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
previewHandlers.registerImageEnhanceHandler(ipcMain);
normalizationHandlers.registerNormalizationHandlers(ipcMain);
scannerHandlers.registerScannerHandlers(ipcMain);
tmdbHandlers.registerTmdbHandlers(ipcMain);
realDebridHandlers.registerRealDebridHandlers(ipcMain);
livestreamHandlers.registerLivestreamHandlers(ipcMain);
watchHistoryHandlers.registerWatchHistoryHandlers(ipcMain, app);

// Register Clip Handler
registerClipHandler(ipcMain);
