const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { execFile, spawn } = require('child_process');
const os = require('os');

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
    titleBarOverlay: { color: '#2f3241', symbolColor: '#74b1be' }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
function loadSettings() {
  try { if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  return { folders: [] };
}
function saveSettings(settings) { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (e, s) => { saveSettings(s); return true; });

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (canceled) return null; return filePaths[0];
});

ipcMain.handle('get-everything-size', async (e, targetPath) => {
  if (typeof targetPath !== 'string' || !fs.existsSync(targetPath)) return 0;
  return new Promise((resolve) => {
    execFile('es.exe', ['-size', '-exact', targetPath], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout.trim()) {
        execFile('es.exe', ['-size', targetPath], { windowsHide: true }, (err2, stdout2) => {
           if (err2 || !stdout2.trim()) return resolve(0);
           const parts = stdout2.trim().split(/\s+/);
           if (parts.length > 0 && !isNaN(parts[0])) resolve(parseInt(parts[0], 10)); else resolve(0);
        });
      } else {
        const parts = stdout.trim().split(/\s+/);
        if (parts.length > 0 && !isNaN(parts[0])) resolve(parseInt(parts[0], 10)); else resolve(0);
      }
    });
  });
});

function globToRegex(pattern) {
  let regexStr = '^';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i++;
      } else {
        regexStr += '[^/\\\\]*';
      }
    } else if (char === '?') {
      regexStr += '[^/\\\\]';
    } else if ('./+^${}()|[\]\\'.includes(char)) {
      regexStr += '\\' + char;
    } else {
      regexStr += char;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr, 'i');
}

async function findVideosAsync(dir, exclusionRegexes = [], rootDir = dir) {
  let results = [];
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    const dirPromises = [];
    
    for (const d of entries) {
      const fullPath = path.join(dir, d.name);
      const relativePath = path.relative(rootDir, fullPath);
      
      const isExcluded = exclusionRegexes.some(rx => rx.test(relativePath) || rx.test(d.name));
      if (isExcluded) continue;

      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
          try {
              const targetStat = fs.statSync(fullPath);
              if (targetStat.isDirectory()) {
                  isDir = true;
              }
          } catch(e) {}
      }

      if (isDir) {
         if (d.name !== '.thumbs' && d.name !== '.git' && !d.name.endsWith('.trickplay')) {
             dirPromises.push(findVideosAsync(fullPath, exclusionRegexes, rootDir));
         }
      } else {
         const nameLower = d.name.toLowerCase();
         if (nameLower.endsWith('_p.mp4') || nameLower.endsWith('_p.webm') || 
             nameLower.endsWith('-preview.mp4') || nameLower.endsWith('-preview.webm')) {
             continue;
         }
         results.push(fullPath);
      }
    }
    
    const nestedArrays = await Promise.all(dirPromises);
    for (const arr of nestedArrays) {
        results.push(...arr);
    }
  } catch(e) {}
  return results;
}

class PriorityQueue {
    constructor() {
        this.queue = [];
        this.running = false;
    }
    push(task) {
        this.queue.push(task);
        this.runNext();
    }
    async runNext() {
        if (this.running || this.queue.length === 0) return;
        this.running = true;
        const task = this.queue.shift();
        try {
            await task();
        } catch (e) {
            console.error("Queue task error:", e);
        }
        this.running = false;
        this.runNext();
    }
}
const backgroundFfmpegQueue = new PriorityQueue();
const activeQueuePaths = new Set();

const benchmarkPath = path.join(__dirname, 'BENCHMARKS.md');
function writeBenchmark(entry) {
    const header = `| Timestamp | Video Name | Size | Duration | Thumb Time | WebM Time | Status |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
    if (!fs.existsSync(benchmarkPath)) {
        fs.writeFileSync(benchmarkPath, header, 'utf8');
    }
    const row = `| ${new Date().toISOString()} | ${entry.name} | ${entry.size} | ${entry.duration.toFixed(1)}s | ${entry.thumbTime ? entry.thumbTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.webmTime ? entry.webmTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.status} |\n`;
    fs.appendFileSync(benchmarkPath, row, 'utf8');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function runLowPriorityProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        try {
            os.setPriority(child.pid, 19);
        } catch (e) {
            console.log("Failed to set process priority:", e.message);
        }
        
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command ${command} failed with exit code ${code}. Stderr: ${stderr}`));
        });
    });
}

function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], (err, stdout) => {
            if (err) resolve(0);
            else {
                const dur = parseFloat(stdout.trim());
                resolve(isNaN(dur) ? 0 : dur);
            }
        });
    });
}

function checkAudioStream(videoPath) {
    return new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], (err, stdout) => {
            resolve(!!stdout.trim());
        });
    });
}

async function generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath) {
    const duration = await getVideoDuration(videoPath);
    const hasAudio = await checkAudioStream(videoPath);
    
    let thumbStart = Date.now();
    let thumbTimeMs = null;
    if (!fs.existsSync(thumbPath)) {
        const thumbTime = duration > 0 ? (duration * 0.1).toFixed(2) : '5.00';
        try {
            await runLowPriorityProcess('ffmpeg', [
                '-y',
                '-ss', thumbTime,
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '2',
                thumbPath,
                '-loglevel', 'error'
            ]);
            thumbTimeMs = Date.now() - thumbStart;
        } catch (e) {
            console.error("Failed to generate thumbnail:", e.message);
        }
    }

    let webmStart = Date.now();
    let webmTimeMs = null;
    if (!fs.existsSync(hoverWebmPath)) {
        try {
            const tempFiles = [];
            const interval = duration / 10;
            const clipDuration = duration > 20 ? 2 : Math.max(0.5, interval);
            
            for (let i = 0; i < 10; i++) {
                const seekTime = interval * i;
                const tempPath = path.join(os.tmpdir(), `vw-clip-${Date.now()}-${i}.webm`);
                tempFiles.push(tempPath);
                
                const args = [
                    '-y',
                    '-ss', seekTime.toFixed(2),
                    '-t', clipDuration.toFixed(2),
                    '-i', videoPath,
                    '-threads', '2',
                    '-c:v', 'libvpx-vp9',
                    '-deadline', 'realtime',
                    '-cpu-used', '8',
                    '-b:v', '1M',
                ];
                if (hasAudio) {
                    args.push('-c:a', 'libvorbis', '-b:a', '64k');
                } else {
                    args.push('-an');
                }
                args.push(tempPath, '-loglevel', 'error');
                
                await runLowPriorityProcess('ffmpeg', args);
            }
            
            const concatFilePath = path.join(os.tmpdir(), `vw-concat-${Date.now()}.txt`);
            const concatContent = tempFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
            fs.writeFileSync(concatFilePath, concatContent, 'utf8');
            
            const concatArgs = [
                '-y',
                '-safe', '0',
                '-f', 'concat',
                '-i', concatFilePath,
                '-c', 'copy',
                hoverWebmPath,
                '-loglevel', 'error'
            ];
            await runLowPriorityProcess('ffmpeg', concatArgs);
            
            for (const f of tempFiles) {
                try { fs.unlinkSync(f); } catch (e) {}
            }
            try { fs.unlinkSync(concatFilePath); } catch (e) {}
            
            webmTimeMs = Date.now() - webmStart;
        } catch (e) {
            console.error("Failed to generate WebM preview:", e.message);
        }
    }

    try {
        writeBenchmark({
            name: path.basename(videoPath),
            size: formatBytes(fs.statSync(videoPath).size),
            duration,
            thumbTime: thumbTimeMs,
            webmTime: webmTimeMs,
            status: 'SUCCESS'
        });
    } catch(e) {}
}

function schedulePreviewGeneration(videoPath, thumbPath, hoverWebmPath) {
    if (activeQueuePaths.has(videoPath)) return;
    activeQueuePaths.add(videoPath);
    
    backgroundFfmpegQueue.push(async () => {
        try {
            await generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath);
        } catch (e) {
            console.error(`Preview generation failed for ${videoPath}:`, e.message);
        } finally {
            activeQueuePaths.delete(videoPath);
        }
    });
}

function convertLegacyMp4Previews(thumbsDir) {
    if (!thumbsDir || !fs.existsSync(thumbsDir)) return;
    try {
        const files = fs.readdirSync(thumbsDir);
        for (const f of files) {
            if (f.toLowerCase().endsWith('.mp4')) {
                const mp4Path = path.join(thumbsDir, f);
                const webmPath = path.join(thumbsDir, path.basename(f, '.mp4') + '.webm');
                
                if (fs.existsSync(webmPath)) {
                    try { fs.unlinkSync(mp4Path); } catch (e) {}
                    continue;
                }
                
                if (activeQueuePaths.has(mp4Path)) continue;
                activeQueuePaths.add(mp4Path);
                
                backgroundFfmpegQueue.push(async () => {
                    try {
                        const hasAudio = await checkAudioStream(mp4Path);
                        const args = [
                            '-y',
                            '-i', mp4Path,
                            '-threads', '2',
                            '-c:v', 'libvpx-vp9',
                            '-deadline', 'realtime',
                            '-cpu-used', '8',
                            '-b:v', '1M',
                        ];
                        if (hasAudio) {
                            args.push('-c:a', 'libvorbis', '-b:a', '64k');
                        } else {
                            args.push('-an');
                        }
                        args.push(webmPath, '-loglevel', 'error');
                        
                        await runLowPriorityProcess('ffmpeg', args);
                        try { fs.unlinkSync(mp4Path); } catch (e) {}
                    } catch (e) {
                        console.error(`Legacy MP4 conversion failed for ${mp4Path}:`, e.message);
                    } finally {
                        activeQueuePaths.delete(mp4Path);
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error converting legacy previews:", e.message);
    }
}

function _processFileNodes(filesArray, allFilesSet, vaultRoot) {
    const output = [];
    if (!vaultRoot && filesArray.length > 0) {
        vaultRoot = path.dirname(filesArray[0]);
    }
    const thumbsDir = vaultRoot ? path.join(vaultRoot, '.thumbs') : null;
    if (thumbsDir && !fs.existsSync(thumbsDir)) {
        try { fs.mkdirSync(thumbsDir, { recursive: true }); } catch (e) {}
    }

    if (thumbsDir) {
        convertLegacyMp4Previews(thumbsDir);
    }

    for (let res of filesArray) {
      const ext = path.extname(res).toLowerCase();
      let type = 'other';
      if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
      else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
      
      if (type !== 'video' && type !== 'image') continue;

      const dir = path.dirname(res);
      const name = path.basename(res);
      const baseName = path.basename(res, ext);
      
      if (thumbsDir && res.startsWith(thumbsDir)) continue;

      if (ext === '.webm' || name.endsWith('_p.mp4') || name.endsWith('-preview.mp4')) {
          let checkName = baseName;
          if (name.endsWith('_p.mp4')) checkName = baseName.substring(0, baseName.length - 2);
          else if (name.endsWith('-preview.mp4')) checkName = baseName.replace('-preview', '');
          
          if (allFilesSet) {
              const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(e => 
                  allFilesSet.has(path.join(dir, checkName + e).toLowerCase())
              );
              if (hasParent) continue; 
          }
      }
      
      let checkName = baseName;
      const relativePath = vaultRoot ? path.relative(vaultRoot, res) : name;
      const uniqueBase = relativePath.replace(/[^a-zA-Z0-9]/g, '_');
      
      let thumbPath = thumbsDir ? path.join(thumbsDir, uniqueBase + '.jpg') : path.join(dir, checkName + '.jpg');
      let hoverWebmPath = thumbsDir ? path.join(thumbsDir, uniqueBase + '.webm') : path.join(dir, checkName + '.webm');
      
      if (thumbsDir) {
          const oldThumbPath = path.join(thumbsDir, checkName + '.jpg');
          const oldWebmPath = path.join(thumbsDir, checkName + '.webm');
          if (fs.existsSync(oldThumbPath) && !fs.existsSync(thumbPath)) {
              try { fs.renameSync(oldThumbPath, thumbPath); } catch (e) {}
          }
          if (fs.existsSync(oldWebmPath) && !fs.existsSync(hoverWebmPath)) {
              try { fs.renameSync(oldWebmPath, hoverWebmPath); } catch (e) {}
          }
      }

      const localThumbPath = path.join(dir, checkName + '.jpg');
      const localPosterPath = path.join(dir, checkName + '-poster.jpg');
      const localWebmPath = path.join(dir, checkName + '.webm');
      const localMp4Path = path.join(dir, checkName + '_p.mp4');
      const trickplayDir = path.join(dir, checkName + '.trickplay');
      
      let thumbnail = null;
      let hasTrickplayDir = false;
      let targetPreview = null;
      let mtimeMs = 0;
      let mtimeFormatted = '';
      let sizeBytes = 0;
      
      try {
        if (fs.existsSync(thumbPath)) {
            thumbnail = thumbPath;
        } else if (fs.existsSync(localThumbPath)) {
            thumbnail = localThumbPath;
        } else if (fs.existsSync(localPosterPath)) {
            thumbnail = localPosterPath;
        }
        
        hasTrickplayDir = fs.existsSync(trickplayDir);
        
        if (fs.existsSync(hoverWebmPath)) {
            targetPreview = hoverWebmPath;
        } else if (fs.existsSync(localWebmPath)) {
            targetPreview = localWebmPath;
        } else if (fs.existsSync(localMp4Path)) {
            targetPreview = localMp4Path;
        }
        
        if (!thumbnail && hasTrickplayDir) {
           const tpFiles = fs.readdirSync(trickplayDir);
           if (tpFiles.length > 0) thumbnail = path.join(trickplayDir, tpFiles[0]);
        }
        
        const stats = fs.statSync(res);
        mtimeMs = stats.mtimeMs;
        sizeBytes = stats.size;
        const d = new Date(mtimeMs);
        mtimeFormatted = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      } catch (e) {}

      output.push({
        path: res, name: name, type: type,
        thumbnail: thumbnail,
        hoverWebm: targetPreview,
        trickplayFolder: hasTrickplayDir ? trickplayDir : null,
        directory: dir, baseName: checkName, ext: ext,
        mtime: mtimeMs,
        size: sizeBytes,
        mtimeFormatted: mtimeFormatted
      });
    }
    return output;
}

ipcMain.handle('scan-directory', async (event, dirPath) => {
  if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return [];
  const settings = loadSettings();
  const exclusions = settings.globExclusions || [];
  const exclusionRegexes = exclusions.map(pat => globToRegex(pat));
  
  return new Promise(async (resolve) => {
    const allFiles = await findVideosAsync(dirPath, exclusionRegexes, dirPath);
    const allFilesSet = new Set(allFiles.map(f => f.toLowerCase()));
    resolve(_processFileNodes(allFiles, allFilesSet, dirPath)); 
  });
});

ipcMain.handle('scan-specific-files', (event, pathsArray) => {
  if (!Array.isArray(pathsArray) || !pathsArray.every(p => typeof p === 'string')) return [];
  const existingPaths = pathsArray.filter(p => fs.existsSync(p));
  return _processFileNodes(existingPaths, null, null);
});

ipcMain.handle('get-trickplay-sprites', async (event, folderPath) => {
    if (typeof folderPath !== 'string' || !fs.existsSync(folderPath)) return [];
    try {
        const files = await fsPromises.readdir(folderPath);
        let images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'));
        images.sort((a,b) => (parseInt(path.basename(a), 10)||0) - (parseInt(path.basename(b), 10)||0));
        return images.map(img => path.join(folderPath, img));
    } catch(e) {
        return [];
    }
});

ipcMain.handle('get-file-size', async (event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return 0;
    try { const stat = await fsPromises.stat(filePath); return stat.size; } catch(e) { return 0; }
});

ipcMain.handle('rename-file', async (e, oldPath, newName) => {
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

ipcMain.handle('open-file', (event, filePath) => { if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.openPath(filePath); });
ipcMain.handle('show-in-folder', (event, filePath) => { if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.showItemInFolder(filePath); });
ipcMain.handle('copy-to-clipboard', (event, text) => { clipboard.writeText(text); });

ipcMain.handle('show-context-menu', async (event, item) => {
  return new Promise((resolve) => {
      let templ = [];
      if (item.type === 'video' || item.type === 'image' || item.type === 'other') {
         templ = [
           { label: 'Open File', click: () => { shell.openPath(item.path); resolve('opened'); } },
           { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); resolve('show'); } },
           { type: 'separator' },
           { label: 'Copy Path', click: () => { clipboard.writeText(item.path); resolve('copied'); } },
           { type: 'separator' },
           { label: 'Cut', click: () => { resolve('cut'); } },
           { label: 'Copy', click: () => { resolve('copy'); } },
           { label: 'Paste', click: () => { resolve('paste'); } },
           { label: 'Rename', click: () => { resolve('rename'); } },
           { type: 'separator' },
           { label: 'Generate WebM Preview (ffmpeg)', click: () => { resolve('generate-webm'); } },
           { label: 'Upscale Video (AI)', click: () => { resolve('upscale-video'); } },
           { label: 'Zip Selection', click: () => { resolve('zip-selection'); } },
           { type: 'separator' },
           { label: 'Delete File', click: () => { resolve('delete-item'); } },
           { label: 'Properties', click: () => { resolve('properties'); } }
         ];
      } else if (item.type === 'fakeFolder') {
         const hasItems = Array.isArray(item.items) && item.items.length > 0;
         templ = [
           { label: `Open Folder: ${item.name}`, enabled: hasItems, click: () => { resolve('open-folder'); } },
           { type: 'separator' },
           { label: 'Remove Folder', click: () => { resolve('remove-folder'); } }
         ];
      }
      const menu = Menu.buildFromTemplate(templ);
      menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
      menu.once('menu-will-close', () => resolve('closed'));
  });
});

ipcMain.handle('upscale-video', async (event, itemPath) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: true, path: itemPath });
        }, 3000);
    });
});

ipcMain.handle('generate-webm', async (event, itemPath, vaultRoot) => {
    if (typeof itemPath !== 'string' || !fs.existsSync(itemPath)) return { success: false, error: 'File not found' };
    
    if (!vaultRoot) vaultRoot = path.dirname(itemPath);
    const thumbsDir = path.join(vaultRoot, '.thumbs');
    if (!fs.existsSync(thumbsDir)) {
        try { fs.mkdirSync(thumbsDir, { recursive: true }); } catch (e) {}
    }
    
    const baseName = path.basename(itemPath, path.extname(itemPath));
    const thumbPath = path.join(thumbsDir, baseName + '.jpg');
    const hoverWebmPath = path.join(thumbsDir, baseName + '.webm');
    
    if (activeQueuePaths.has(itemPath)) {
        return { success: true, path: hoverWebmPath, queued: true };
    }
    activeQueuePaths.add(itemPath);
    
    return new Promise((resolve) => {
        backgroundFfmpegQueue.push(async () => {
            try {
                await generateThumbAndPreview(itemPath, thumbPath, hoverWebmPath);
                resolve({ success: true, path: hoverWebmPath });
            } catch (e) {
                resolve({ success: false, error: e.message });
            } finally {
                activeQueuePaths.delete(itemPath);
            }
        });
    });
});

ipcMain.handle('schedule-idle-previews', async (event, items) => {
    if (!Array.isArray(items)) return { success: false, error: 'Invalid items array' };
    let scheduledCount = 0;
    for (const item of items) {
        const { path: videoPath, thumbPath, hoverWebmPath } = item;
        if (!videoPath || !thumbPath || !hoverWebmPath) continue;
        if (activeQueuePaths.has(videoPath)) continue;
        activeQueuePaths.add(videoPath);
        backgroundFfmpegQueue.push(async () => {
            try {
                await generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath);
            } catch (e) {
                console.error(`Idle Preview generation failed for ${videoPath}:`, e.message);
            } finally {
                activeQueuePaths.delete(videoPath);
            }
        });
        scheduledCount++;
    }
    return { success: true, scheduledCount };
});

ipcMain.handle('paste-files', async (event, { paths, mode, destination }) => {
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
        const dest = path.join(destination, path.basename(src));
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

ipcMain.handle('zip-selection', async (event, { paths, outputPath }) => {
    if (!Array.isArray(paths) || !outputPath) {
        return { success: false, error: 'Invalid parameters' };
    }
    return new Promise((resolve) => {
        const escapedPaths = paths.map(p => `'${p.replace(/'/g, "''")}'`).join(',');
        const escapedOutput = `'${outputPath.replace(/'/g, "''")}'`;
        const cmd = `Compress-Archive -Path ${escapedPaths} -DestinationPath ${escapedOutput} -Force`;
        execFile('powershell', ['-Command', cmd], { windowsHide: true }, (err, stdout, stderr) => {
            if (err) resolve({ success: false, error: stderr || err.message });
            else resolve({ success: true, path: outputPath });
        });
    });
});

ipcMain.handle('get-file-properties', async (event, filePath) => {
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
        
        if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) {
            const ffprobePromise = new Promise((resolve) => {
                execFile('ffprobe', [
                    '-v', 'error',
                    '-select_streams', 'v:0',
                    '-show_entries', 'stream=width,height,codec_name,bit_rate,duration',
                    '-of', 'json',
                    filePath
                ], (err, stdout) => {
                    if (err) return resolve({});
                    try {
                        const data = JSON.parse(stdout);
                        if (data.streams && data.streams[0]) {
                            const s = data.streams[0];
                            resolve({
                                width: s.width,
                                height: s.height,
                                codec: s.codec_name,
                                bitrate: s.bit_rate ? parseInt(s.bit_rate, 10) : null,
                                duration: s.duration ? parseFloat(s.duration) : null
                            });
                        } else resolve({});
                    } catch(e) { resolve({}); }
                });
            });
            const videoProps = await ffprobePromise;
            return { success: true, properties: { ...baseProps, ...videoProps } };
        } else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) {
            const ffprobePromise = new Promise((resolve) => {
                execFile('ffprobe', [
                    '-v', 'error',
                    '-select_streams', 'v:0',
                    '-show_entries', 'stream=width,height',
                    '-of', 'json',
                    filePath
                ], (err, stdout) => {
                    if (err) return resolve({});
                    try {
                        const data = JSON.parse(stdout);
                        if (data.streams && data.streams[0]) {
                            const s = data.streams[0];
                            resolve({ width: s.width, height: s.height });
                        } else resolve({});
                    } catch(e) { resolve({}); }
                });
            });
            const imgProps = await ffprobePromise;
            return { success: true, properties: { ...baseProps, ...imgProps } };
        }
        return { success: true, properties: baseProps };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

const folderSizeCache = new Map();

ipcMain.handle('get-folder-size-smart', async (event, dirPath, fileCount) => {
    if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
    
    const cached = folderSizeCache.get(dirPath);
    if (cached && cached.fileCount === fileCount) {
        return cached.size;
    }
    
    const everythingSize = await new Promise((resolve) => {
        execFile('es.exe', ['-size', '-exact', dirPath], { windowsHide: true }, (err, stdout) => {
            if (err || !stdout.trim()) {
                execFile('es.exe', ['-size', dirPath], { windowsHide: true }, (err2, stdout2) => {
                   if (err2 || !stdout2.trim()) return resolve(0);
                   const parts = stdout2.trim().split(/\s+/);
                   if (parts.length > 0 && !isNaN(parts[0])) resolve(parseInt(parts[0], 10)); else resolve(0);
                });
            } else {
                const parts = stdout.trim().split(/\s+/);
                if (parts.length > 0 && !isNaN(parts[0])) resolve(parseInt(parts[0], 10)); else resolve(0);
            }
        });
    });
    
    if (everythingSize > 0) {
        folderSizeCache.set(dirPath, { fileCount, size: everythingSize });
        return everythingSize;
    }
    
    const calculatedSize = await calculateDirectorySizeRecursive(dirPath);
    folderSizeCache.set(dirPath, { fileCount, size: calculatedSize });
    return calculatedSize;
});

ipcMain.handle('get-theme', async (event) => {
    try {
        const appSettings = loadSettings();
        const theme = appSettings.theme || 'golden-slate';
        return { success: true, theme };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('set-theme', async (event, theme) => {
    if (typeof theme !== 'string') return { success: false, error: 'Invalid input' };
    try {
        const appSettings = loadSettings();
        appSettings.theme = theme;
        saveSettings(appSettings);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
    if (typeof itemPath !== 'string' || !fs.existsSync(itemPath)) {
        return { success: false, error: 'Path does not exist' };
    }
    try {
        const stats = fs.lstatSync(itemPath);
        if (stats.isSymbolicLink()) {
            fs.unlinkSync(itemPath);
        } else if (stats.isDirectory()) {
            try {
                fs.unlinkSync(itemPath);
            } catch (err) {
                fs.rmSync(itemPath, { recursive: true, force: true });
            }
        } else {
            fs.unlinkSync(itemPath);
        }
        return { success: true };
    } catch (e) {
        try {
            if (fs.lstatSync(itemPath).isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(itemPath);
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
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
                } catch (e) {}
            }
            if (isDir) {
                if (entry.name !== '.thumbs' && entry.name !== '.git') {
                    size += await calculateDirectorySizeRecursive(fullPath);
                }
            } else {
                try {
                    const stats = fs.statSync(fullPath);
                    size += stats.size;
                } catch(e) {}
            }
        }
    } catch(e) {}
    return size;
}

ipcMain.handle('get-folder-size-background', async (event, dirPath) => {
    if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return 0;
    return await calculateDirectorySizeRecursive(dirPath);
});
