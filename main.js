const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu, Tray, session, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

if (process.env.VAULT_EXPLORER_E2E_USER_DATA) {
    app.setPath('userData', process.env.VAULT_EXPLORER_E2E_USER_DATA);
}

// Platform HEVC/H.265 hardware video decoding support
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

function getSettingsPath() {
    return path.join(app.getPath('userData'), 'vault-settings.json');
}

// Seeded once into the user-editable "Glob Exclusions" pills in Settings when
// the user has never set any. Junk/code-artifact files the hardcoded directory
// skip-list can't catch (repo TREES are skipped by the .git marker in scanner).
const DEFAULT_GLOB_EXCLUSIONS = [
    '*.log', '*.tmp', '*.part', '*.crdownload', '*.lock',
    '*.map', '*.pyc', '*.dll', '*.pdb', '*.obj',
];

function loadSettings() {
    const settingsPath = getSettingsPath();
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.mutePreviews === undefined) settings.mutePreviews = false;
            // One-time seed (flagged so a user who later clears every pill on
            // purpose isn't re-seeded on the next launch).
            if (!settings.globExclusionsSeeded && (!settings.globExclusions || settings.globExclusions.length === 0)) {
                settings.globExclusions = DEFAULT_GLOB_EXCLUSIONS;
                settings.globExclusionsSeeded = true;
                try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8'); } catch (_) { }
            }
            return settings;
        }
    } catch (e) { }
    return { folders: [], mutePreviews: false, singleInstance: false, globExclusions: DEFAULT_GLOB_EXCLUSIONS, globExclusionsSeeded: true };
}

async function saveSettings(settings) {
    const settingsPath = getSettingsPath();
    try {
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        if (fs.existsSync(settingsPath)) {
            try {
                await fs.promises.copyFile(settingsPath, settingsPath + '.bak');
            } catch (_) { }
        }
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('[saveSettings] Failed to save settings:', e);
        return false;
    }
}

// Load environment variables at early startup
function loadEnv() {
    const envPaths = [
        path.join(process.cwd(), '.env'),
        path.join(path.dirname(process.execPath), '.env'),
        process.resourcesPath ? path.join(process.resourcesPath, '.env') : null,
        path.join(__dirname, '.env'),
        path.join(__dirname, '..', '.env')
    ].filter(Boolean);
    for (const envPath of envPaths) {
        try {
            if (fs.existsSync(envPath)) {
                console.log('[ENV] Loading environment variables from:', envPath);
                const envContent = fs.readFileSync(envPath, 'utf8');
                envContent.split(/\r?\n/).forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        const value = parts.slice(1).join('=').trim();
                        if (key && !process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                });
                break;
            }
        } catch (e) {
            console.error('[ENV] Failed to load .env from:', envPath, e);
        }
    }
}
loadEnv();

// Import modular files
const utils = require('./src/utils');

const child_process = require('child_process');
const { execFile } = child_process;
const cryptoHandlers = require('./src/crypto');
const previewHandlers = require('./src/previews');
const normalizationHandlers = require('./src/normalization');
const scannerHandlers = require('./src/scanner');
const liveSubtitlesHandlers = require('./src/live-subtitles');
const watchHistoryHandlers = require('./src/watch-history');


let mainWindow;
let tray = null;
let isQuitting = false;
let pendingLaunchIntent = null;
let exitingSecondaryInstance = false;

function getOpenTargetFromArgs(args, workingDirectory) {
    for (const arg of args) {
        if (!arg || arg.startsWith('--')) continue;
        try {
            const resolvedPath = workingDirectory
                ? path.resolve(workingDirectory, arg)
                : path.resolve(arg);
            if (fs.existsSync(resolvedPath)) {
                const stat = fs.statSync(resolvedPath);
                if (stat.isDirectory()) return { type: 'folder', path: resolvedPath };
                if (stat.isFile()) return { type: 'file', path: resolvedPath };
            }
        } catch (_) { }
    }
    return null;
}

function getLaunchIntentFromArgs(args, workingDirectory) {
    const target = getOpenTargetFromArgs(args, workingDirectory);
    if (!target) return null;
    if (target.type === 'folder') {
        return {
            type: 'folder',
            folderPath: target.path,
            prioritizePlayer: false,
        };
    }
    return {
        type: 'file',
        filePath: target.path,
        prioritizePlayer: args.includes('--prioritize-player'),
    };
}

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function openLaunchIntentInMainWindow(intent) {
    if (!intent || (!intent.filePath && !intent.folderPath)) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
        pendingLaunchIntent = intent;
        return;
    }

    focusMainWindow();
    const sendIntent = () => mainWindow.webContents.send('open-initial-file', intent);
    if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', sendIntent);
    else sendIntent();
}

pendingLaunchIntent = getLaunchIntentFromArgs(process.argv.slice(1));

// This must run before app readiness: Electron can only notify the first
// process about a second launch when that first process owns this lock.
const singleInstanceEnabled = process.env.VAULT_EXPLORER_FORCE_SINGLE_INSTANCE === '1' ||
    (process.env.VAULT_EXPLORER_E2E !== '1' && loadSettings().singleInstance === true);
if (singleInstanceEnabled && !app.requestSingleInstanceLock()) {
    exitingSecondaryInstance = true;
    app.quit();
} else if (singleInstanceEnabled) {
    app.on('second-instance', (_event, argv, workingDirectory) => {
        openLaunchIntentInMainWindow(getLaunchIntentFromArgs(argv.slice(1), workingDirectory));
        focusMainWindow();
    });
}

// Windows process cleanup helpers
function getProcessName() {
    return path.basename(process.execPath);
}

function killAllOwnProcesses(includeSelf = true) {
    // Kill only processes sharing OUR OWN executable image name. Critically, do
    // NOT run in dev: there the image is electron.exe, shared with every other
    // Electron app (this used to hardcode vault-explorer.exe / kill all node.exe,
    // so testing a sibling Electron app — e.g. vault-streaming — killed us).
    const execName = getProcessName();
    const lower = execName.toLowerCase();
    if (process.platform !== 'win32' || lower === 'electron.exe' || !lower.startsWith('vault')) return;

    if (includeSelf) {
        try {
            child_process.spawn('taskkill', ['/F', '/IM', execName], {
                detached: true,
                windowsHide: true,
                stdio: 'ignore'
            }).unref();
        } catch (err) {
            console.error('[cleanup] Failed to spawn self-killing taskkill:', err);
        }
        return;
    }

    const baseName = execName.replace(/\.exe$/i, '');
    const currentPid = process.pid;
    try {
        child_process.spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            `Get-Process -Name '${baseName}' -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${currentPid} } | Stop-Process -Force -ErrorAction SilentlyContinue`
        ], {
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        }).unref();
    } catch (err) {
        console.error('[cleanup] Failed to kill sibling processes:', err);
    }
}

function performFullAppCleanup() {
    console.log('[main:cleanup] Full app cleanup requested');
    // Old code called killNodeProcesses() which nuked EVERY node.exe on the
    // machine — removed. killAllActiveSubprocesses kills our tracked trees.
    try { liveSubtitlesHandlers.shutdownLiveSubtitles(); } catch (e) { /* noop */ }
    utils.killAllActiveSubprocesses();
    killAllOwnProcesses(true);
}

async function cleanupStaleTempFiles(vaultPath) {
    // Remove any .tmp files left behind by a previous crash or kill. These are
    // intentionally disposable: the atomic-write logic only renames them to the
    // final output on success, so a leftover .tmp is always safe to delete.
    const subDirs = ['.thumbs', '.enhanced'];
    for (const sub of subDirs) {
        const dir = path.join(vaultPath, sub);
        if (!fs.existsSync(dir)) continue;
        try {
            const entries = await fsPromises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.tmp')) {
                    const tmpPath = path.join(dir, entry.name);
                    try {
                        await fsPromises.unlink(tmpPath);
                        console.log('[main:cleanup] Removed stale temp file:', tmpPath);
                    } catch (e) {
                        console.warn('[main:cleanup] Could not remove stale temp file:', tmpPath, e.message);
                    }
                }
            }
        } catch (e) {
            console.warn('[main:cleanup] Failed to scan for stale temp files in', dir, e.message);
        }
    }
}

async function cleanupAllVaultTempFiles() {
    const settings = loadSettings();
    const folders = settings.folders || [];
    for (const folder of folders) {
        if (!folder || !folder.path) continue;
        await cleanupStaleTempFiles(folder.path);
    }
}

function createTray() {
    if (tray) return;
    const trayIconPath = path.join(__dirname, 'build', 'icon.ico');
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

/**
 * Creates and configures the main application window, including bounded zoom controls, media request handling, close-to-tray behavior, cleanup, and the system tray.
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 800,
        icon: path.join(__dirname, 'build', 'icon.ico'),
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

    // Keep Ctrl+Plus, Ctrl+Minus, Ctrl+0, and Ctrl+wheel symmetric. Chromium's
    // default visual zoom can leave the window at a reduced scale after a
    // mixed keyboard/wheel sequence, so the app owns a bounded zoom factor.
    const adjustWindowZoom = (delta) => {
        const current = mainWindow.webContents.getZoomFactor();
        mainWindow.webContents.setZoomFactor(Math.max(0.5, Math.min(2, current + delta)));
    };
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (!(input.control || input.meta)) return;
        if (input.type === 'keyDown') {
            if (['+', '=', 'Add'].includes(input.key)) {
                adjustWindowZoom(0.1);
                event.preventDefault();
            } else if (['-', 'Subtract'].includes(input.key)) {
                adjustWindowZoom(-0.1);
                event.preventDefault();
            } else if (input.key === '0') {
                mainWindow.webContents.setZoomFactor(1);
                event.preventDefault();
            }
        }
    });
    mainWindow.webContents.on('before-mouse-event', (event, mouse) => {
        const modifiers = mouse.modifiers || [];
        if (mouse.type === 'mouseWheel' && mouse.deltaY && (modifiers.includes('control') || modifiers.includes('meta'))) {
            adjustWindowZoom(mouse.deltaY < 0 ? 0.1 : -0.1);
            event.preventDefault();
        }
    });

    // YouTube Referer & Origin overrides to fix Error 152/153/4 (domain embedding restrictions)
    // Apply to ALL sessions to cover iframe requests
    const youtubeUrls = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*'];

    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: youtubeUrls },
        (details, callback) => {
            const headers = details.requestHeaders || {};
            // Clean up any casing variations of Referer and Origin
            for (const key of Object.keys(headers)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey === 'referer' || lowerKey === 'origin') {
                    delete headers[key];
                }
            }
            // Set required YouTube headers to spoof a request from YouTube itself
            headers['Referer'] = 'https://www.youtube.com/';
            headers['Origin'] = 'https://www.youtube.com';
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            callback({ cancel: false, requestHeaders: headers });
        }
    );

    // Bypass frame blocking restrictions on YouTube trailer embedding
    session.defaultSession.webRequest.onHeadersReceived(
        { urls: youtubeUrls },
        (details, callback) => {
            const responseHeaders = details.responseHeaders || {};
            // Remove security headers that block iframe embedding case-insensitively
            for (const key of Object.keys(responseHeaders)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey === 'x-frame-options' || lowerKey === 'content-security-policy' || lowerKey === 'x-content-security-policy') {
                    delete responseHeaders[key];
                }
            }
            callback({ cancel: false, responseHeaders });
        }
    );

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        updateThumbarButtons(false);
    });

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
        performFullAppCleanup();
    });

    createTray();
}

/**
 * Configures Windows taskbar thumbnail toolbar controls for media playback.
 * @param {boolean} isPlaying - Whether playback is active, determining the play or pause control.
 */
function updateThumbarButtons(isPlaying = false) {
    if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;

    const thumbarDir = path.join(__dirname, 'build', 'thumbar');
    const getIcon = (name) => {
        const p = path.join(thumbarDir, name);
        return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
    };

    try {
        const buttons = [
            {
                tooltip: 'Previous',
                icon: getIcon('prev.png'),
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('thumbar-action', 'prev');
                    }
                }
            },
            {
                tooltip: 'Stop',
                icon: getIcon('stop.png'),
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('thumbar-action', 'stop');
                    }
                }
            },
            {
                tooltip: isPlaying ? 'Pause' : 'Play',
                icon: isPlaying ? getIcon('pause.png') : getIcon('play.png'),
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('thumbar-action', 'playpause');
                    }
                }
            },
            {
                tooltip: 'Next',
                icon: getIcon('next.png'),
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('thumbar-action', 'next');
                    }
                }
            },
            {
                tooltip: 'Fullscreen',
                icon: getIcon('fullscreen.png'),
                click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('thumbar-action', 'fullscreen');
                    }
                }
            }
        ];
        mainWindow.setThumbarButtons(buttons);
    } catch (e) {
        console.warn('[thumbar] Failed to set thumbnail toolbar buttons:', e.message);
    }
}

app.whenReady().then(() => {
    if (exitingSecondaryInstance) return;
    // Clean up any orphaned vault-explorer processes from a previous bad exit
    killAllOwnProcesses(false);

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

    // Remove leftover .tmp files from previous crashes/kills in the background.
    // This runs after the window is created so startup is never blocked by I/O.
    cleanupAllVaultTempFiles().catch(err => {
        console.warn('[main:cleanup] Startup temp-file cleanup failed:', err.message);
    });
});
app.on('before-quit', () => {
    if (exitingSecondaryInstance) return;
    isQuitting = true;
    performFullAppCleanup();
});
app.on('window-all-closed', () => {
    if (exitingSecondaryInstance) return;
    performFullAppCleanup();
    if (process.platform !== 'darwin') app.quit();
});

// Native fullscreen toggle for the player. Document fullscreen alone leaves
// the OS window resizable, which paints resize cursors at the screen edges.
ipcMain.handle('set-window-fullscreen', (_e, on) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.setFullScreen(!!on);
    return mainWindow.isFullScreen();
});

ipcMain.handle('get-launch-intent', () => {
    const intent = pendingLaunchIntent;
    pendingLaunchIntent = null;
    return intent;
});

ipcMain.handle('choose-subtitle-file', async (_event, videoPath) => {
    const defaultPath = typeof videoPath === 'string' && videoPath
        ? path.dirname(videoPath)
        : app.getPath('documents');
    const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath,
        properties: ['openFile'],
        filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }],
    });
    return result.canceled ? null : result.filePaths[0];
});

// Automatic clean exit subprocess killing hooks
app.on('will-quit', () => { if (!exitingSecondaryInstance) performFullAppCleanup(); });
process.on('exit', () => { if (!exitingSecondaryInstance) performFullAppCleanup(); });

// Clip Handler for video clipping
function registerClipHandler(ipcMain) {
    ipcMain.handle('clipVideo', async (event, { inputPath, outputFormat, startTime, duration, quality, edits = {} }) => {
        try {
            console.log('[main:clip] Clipping video:', { inputPath, outputFormat, startTime, duration, quality });

            const isRemoteUrl = /^https?:\/\//i.test(inputPath);
            let safeInputPath;
            let fileName;

            if (isRemoteUrl) {
                safeInputPath = inputPath;
                try {
                    const u = new URL(inputPath);
                    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'remote');
                    fileName = path.basename(last, path.extname(last)).replace(/[\\/:*?"<>|]/g, '_') || 'remote';
                } catch (_) {
                    fileName = 'remote';
                }
                console.log('[main:clip] Remote input detected, passing URL directly to ffmpeg');
            } else {
                safeInputPath = decodeURIComponent(inputPath).replace(/^file:\/\/\//, '');
                safeInputPath = path.normalize(safeInputPath);

                if (!fs.existsSync(safeInputPath)) {
                    return { success: false, error: `Input file not found: ${safeInputPath}` };
                }

                const stat = fs.statSync(safeInputPath);
                console.log('[main:clip] Input file size:', (stat.size / (1024 * 1024)).toFixed(2), 'MB');
                fileName = path.basename(safeInputPath, path.extname(safeInputPath));
            }
            const ext = outputFormat === 'gif' ? 'gif' : outputFormat;
            const outputName = `${fileName}_clip_${Date.now()}.${ext}`;

            // Pick a genuinely WRITABLE output dir. existsSync is not enough on
            // Windows — redirected/placeholder known folders (e.g. a OneDrive
            // Videos folder) report as existing but reject writes, which is what
            // produced the "No such file or directory" ffmpeg error. Verify with a
            // real write test. Desktop first to match the "Save to Desktop" button.
            const safeGetPath = (name) => { try { return app.getPath(name); } catch (_) { return null; } };
            const pickWritableDir = (candidates) => {
                for (const dir of candidates) {
                    if (!dir) continue;
                    try {
                        fs.mkdirSync(dir, { recursive: true });
                        const probe = path.join(dir, `.clipwrite_${Date.now()}.tmp`);
                        fs.writeFileSync(probe, 'x');
                        fs.unlinkSync(probe);
                        return dir;
                    } catch (_) { /* try next */ }
                }
                return null;
            };
            const outputDir = pickWritableDir([
                safeGetPath('desktop'), safeGetPath('videos'), safeGetPath('downloads'), app.getPath('temp'),
            ]);
            if (!outputDir) {
                return { success: false, error: 'No writable output folder found (Desktop/Videos/Downloads/Temp all failed).' };
            }
            const outputPath = path.join(outputDir, outputName);

            // Build -vf filter chain — collect filters, join at end
            const vfFilters = [];
            const afFilters = [];

            // ── User edits from the clip modal (crop / rotate / filters / AI /
            // speed). Geometry first, then effects, then speed, then quality.
            const e = edits || {};
            const arMap = { '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '9:16': 9 / 16 };
            if (e.cropAspect && arMap[e.cropAspect]) {
                const ar = arMap[e.cropAspect].toFixed(6);
                // Centered crop to the target aspect (escaped commas inside min()).
                vfFilters.push(`crop=min(iw\\,ih*${ar}):min(ih\\,iw/${ar})`);
            }
            if (e.rotate === 90) vfFilters.push('transpose=1');
            else if (e.rotate === 180) vfFilters.push('transpose=1', 'transpose=1');
            else if (e.rotate === 270) vfFilters.push('transpose=2');

            const aiSet = new Set(Array.isArray(e.ai) ? e.ai : []);
            if (aiSet.has('denoise')) vfFilters.push('hqdn3d');
            if (aiSet.has('stabilize')) vfFilters.push('deshake');
            if (aiSet.has('color')) vfFilters.push('eq=contrast=1.08:brightness=0.03:saturation=1.15');
            // mci (motion-compensated) interpolation is extremely slow and can
            // appear to hang; blend is fast and fine for a clip enhancement.
            if (aiSet.has('frame')) vfFilters.push('minterpolate=fps=60:mi_mode=blend');

            const filterPresets = {
                grayscale: 'hue=s=0',
                sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
                vibrant: 'eq=saturation=1.6',
                vintage: 'curves=preset=vintage',
                sharpen: 'unsharp=5:5:1.0',
            };
            if (e.filter && filterPresets[e.filter]) vfFilters.push(filterPresets[e.filter]);

            if (aiSet.has('upscale')) vfFilters.push('scale=iw*2:ih*2:flags=lanczos');

            const speed = Number(e.speed) || 1;
            if (speed > 0 && speed !== 1) {
                vfFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
                // atempo only accepts 0.5–2.0, so chain factors to reach the target.
                let remaining = speed;
                while (remaining > 2.0 + 1e-6) { afFilters.push('atempo=2.0'); remaining /= 2; }
                while (remaining < 0.5 - 1e-6) { afFilters.push('atempo=0.5'); remaining *= 2; }
                afFilters.push(`atempo=${remaining.toFixed(4)}`);
            }

            // Format-specific video filters
            if (outputFormat === 'gif') {
                vfFilters.push('fps=15', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
            }

            // Quality/scale filters
            if (quality !== 'original') {
                const scaleMap = { '1080p': '1920:-2', '720p': '1280:-2', '480p': '854:-2' };
                if (scaleMap[quality]) vfFilters.push(`scale=${scaleMap[quality]}`);
            }

            // Build ffmpeg args — put -ss BEFORE -i for fast input seeking
            const ffmpegArgs = [
                '-ss', String(startTime),
                '-i', safeInputPath,
                '-t', String(duration)
            ];

            // Output format specific codec options
            if (outputFormat === 'webm') {
                // Default libvpx-vp9 is single-threaded on the slowest deadline —
                // a few seconds of clip can take minutes and look hung. row-mt +
                // cpu-used make it many times faster at negligible quality cost.
                ffmpegArgs.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0',
                    '-row-mt', '1', '-cpu-used', '4', '-deadline', 'good');
                ffmpegArgs.push('-c:a', 'libopus', '-b:a', '128k');
            } else if (outputFormat === 'mp4') {
                ffmpegArgs.push('-c:v', 'libx264', '-crf', '23', '-preset', 'fast');
                ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
            } else if (outputFormat === 'gif') {
                ffmpegArgs.push('-f', 'gif');
            }

            // Apply combined -vf chain (single flag, avoids conflicts)
            if (vfFilters.length > 0) {
                ffmpegArgs.push('-vf', vfFilters.join(','));
            }
            // Audio tempo for speed changes (GIF has no audio).
            if (afFilters.length > 0 && outputFormat !== 'gif') {
                ffmpegArgs.push('-af', afFilters.join(','));
            }

            // Force overwrite + output
            ffmpegArgs.push('-y', outputPath);

            // Resolve ffmpeg executable
            const ffmpegPath = utils.getFFmpegPath();
            console.log('[main:clip] Using ffmpeg at:', ffmpegPath);
            console.log('[main:clip] ffmpeg args:', ffmpegArgs.join(' '));

            // Run ffmpeg (remote inputs must not set cwd to the URL path)
            const ffmpegProc = execFile(ffmpegPath, ffmpegArgs, {
                cwd: isRemoteUrl ? outputDir : path.dirname(safeInputPath),
                windowsHide: true
            });

            // Track progress — ffmpeg logs to stderr, not stdout
            let stderrData = '';

            if (ffmpegProc.stdout) {
                ffmpegProc.stdout.on('data', () => { });
            }

            const totalMs = (Number(duration) || 0) * 1000;
            ffmpegProc.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrData += chunk;
                // Parse the LATEST time= from THIS chunk (matching the accumulated
                // buffer always returned the first value, freezing the display).
                const times = chunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/g);
                if (times && times.length && event.sender && !event.sender.isDestroyed()) {
                    const cur = times[times.length - 1].split('=')[1];
                    let percent = null;
                    const m = cur.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
                    if (m && totalMs > 0) {
                        const ms = (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4] * 10;
                        percent = Math.min(99, Math.round((ms / totalMs) * 100));
                    }
                    event.sender.send('clip-progress', { currentTime: cur, percent });
                }
            });

            // Wait for completion
            await new Promise((resolve, reject) => {
                ffmpegProc.on('close', (code) => {
                    if (code === 0) {
                        console.log('[main:clip] Clipping completed successfully');
                        resolve();
                    } else {
                        console.error('[main:clip] ffmpeg failed with code:', code);
                        console.error('[main:clip] stderr (last 500 chars):', stderrData.slice(-500));
                        reject(new Error(`ffmpeg exited with code ${code}: ${stderrData.slice(-200)}`));
                    }
                });
                ffmpegProc.on('error', (err) => {
                    console.error('[main:clip] ffmpeg spawn error:', err);
                    reject(err);
                });
            });

            // Verify output exists
            if (!fs.existsSync(outputPath)) {
                return { success: false, error: 'Output file was not created' };
            }

            const outputStat = fs.statSync(outputPath);
            const outputSizeMB = outputStat.size / (1024 * 1024);
            console.log('[main:clip] Output file size:', outputSizeMB.toFixed(2), 'MB');

            return {
                success: true,
                outputPath: outputPath,
                outputSize: outputStat.size
            };

        } catch (error) {
            console.error('[main:clip] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

// Register Split IPC Handlers
const { registerFilesIpc } = require('./src/ipc/files.ipc');
const { registerFolderIpc } = require('./src/ipc/folder.ipc');
const { registerSystemIpc } = require('./src/ipc/system.ipc');
const { registerMediaIpc } = require('./src/ipc/media.ipc');
const { registerCryptoIpc } = require('./src/ipc/crypto.ipc');
const { registerSubtitlesIpc } = require('./src/ipc/subtitles.ipc');

registerFilesIpc(ipcMain, mainWindow);
registerFolderIpc(ipcMain, mainWindow);
registerSystemIpc(ipcMain, getSettingsPath(), loadSettings, saveSettings);
registerMediaIpc(ipcMain);
registerCryptoIpc(ipcMain);
registerSubtitlesIpc(ipcMain, loadSettings);

// Register Modular Handlers
previewHandlers.registerPreviewHandlers(ipcMain);
previewHandlers.registerImageEnhanceHandler(ipcMain);
normalizationHandlers.registerNormalizationHandlers(ipcMain);
scannerHandlers.registerScannerHandlers(ipcMain);
liveSubtitlesHandlers.registerLiveSubtitlesHandlers(ipcMain);
watchHistoryHandlers.registerWatchHistoryHandlers(ipcMain, app);

// Register Clip Handler
registerClipHandler(ipcMain);

// Register Taskbar Thumbnail Toolbar State IPC Handler
ipcMain.handle('update-thumbar-state', (event, data) => {
    const isPlaying = data && data.isPlaying;
    updateThumbarButtons(Boolean(isPlaying));
    return true;
});
