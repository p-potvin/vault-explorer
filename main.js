const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { execFile, spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

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
  mainWindow.maximize();
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function log(tag, ...args) { console.log(`[main:${tag}]`, ...args); }

const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
function loadSettings() {
  try { if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  return { folders: [] };
}
function saveSettings(settings) { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (e, s) => { saveSettings(s); return true; });

ipcMain.handle('encrypt-files', async (event, { paths, password }) => {
  log('crypto', `Encrypting ${paths.length} files`);
  try {
    for (const filePath of paths) {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      const fileData = fs.readFileSync(filePath);
      const salt = crypto.randomBytes(16);
      const key = crypto.scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 });
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(fileData), cipher.final()]);

      const outputData = Buffer.concat([salt, iv, encrypted]);
      const outputEncPath = filePath + '.enc';

      fs.writeFileSync(outputEncPath, outputData);
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (e) {
    log('crypto', `Encryption failed: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('decrypt-files', async (event, { paths, password }) => {
  log('crypto', `Decrypting ${paths.length} files`);
  try {
    let successCount = 0;
    for (const filePath of paths) {
      if (!fs.existsSync(filePath) || !filePath.endsWith('.enc')) continue;

      const fileData = fs.readFileSync(filePath);
      if (fileData.length < 32) continue;

      const salt = fileData.subarray(0, 16);
      const iv = fileData.subarray(16, 32);
      const encryptedData = fileData.subarray(32);

      const key = crypto.scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 });
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      let decrypted;
      try {
        decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      } catch (err) {
        continue;
      }

      const outputDecPath = filePath.substring(0, filePath.length - 4);
      fs.writeFileSync(outputDecPath, decrypted);
      fs.unlinkSync(filePath);
      successCount++;
    }
    return { success: successCount === paths.length, count: successCount };
  } catch (e) {
    log('crypto', `Decryption failed: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  log('dialog', 'Opening directory dialog...');
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (canceled) { log('dialog', 'Cancelled'); return null; }
  log('dialog', 'Selected:', filePaths[0]);
  return filePaths[0];
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
    const header = `| Timestamp | Video Name | Size | Duration | Thumb Time | WebM Time | Status 
    | --- | --- | --- | --- | --- | --- | --- |`;
    if (!fs.existsSync(benchmarkPath)) {
        fs.writeFileSync(benchmarkPath, header, 'utf8');
    }
    const row = `| ${new Date().toISOString()} | ${entry.name} | ${entry.size} | ${entry.duration.toFixed(1)}s | ${entry.thumbTime ? entry.thumbTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.webmTime ? entry.webmTime.toFixed(0) + 'ms' : 'N/A'} | ${entry.status} |`;
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
async function generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath, sender = null) {
    const duration = await getVideoDuration(videoPath);
    const hasAudio = await checkAudioStream(videoPath);
    
    let thumbStart = Date.now();
    let thumbTimeMs = null;
    if (!fs.existsSync(thumbPath)) {
        const thumbTime = duration > 0 ? Math.min(20, duration).toFixed(2) : '5.00';
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
            log('webm-preview', `Generating preview: ${path.basename(videoPath)}`);

            if (duration <= 100) {
                if (sender && !sender.isDestroyed()) {
                    sender.send('generate-webm-progress', {
                        videoPath,
                        percent: 50,
                        label: `Short video detected (<=100s). Transcoding full preview...`
                    });
                }
                // Just copy/transcode the whole video as a WebM!
                await new Promise((res, rej) => {
                    const args = [
                        '-y',
                        '-i', videoPath,
                        '-c:v', 'libvpx-vp9',
                        '-b:v', '1M',
                        '-deadline', 'realtime',
                        '-cpu-used', '8',
                        '-c:a', 'libopus',
                        '-b:a', '64k',
                        hoverWebmPath,
                        '-loglevel', 'error'
                    ];
                    execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                        if (err) return rej(err);
                        res();
                    });
                });
            } else {
                const tempFiles = [];
                const numClips = 12;
                const interval = duration / numClips;
                const clipDuration = 5.0; // 5 seconds each, total 60s
                
                for (let i = 0; i < numClips; i++) {
                    if (sender && !sender.isDestroyed()) {
                        sender.send('generate-webm-progress', {
                            videoPath,
                            percent: Math.round(((i) / numClips) * 100),
                            label: `Processing clip ${i + 1} of ${numClips}...`
                        });
                    }

                    const seekTime = interval * i;
                    const tempClipPath = path.join(os.tmpdir(), `vw-clip-${Date.now()}-${i}.webm`);
                    tempFiles.push(tempClipPath);

                    // Directly extract clip with video and synchronized audio streams
                    await new Promise((res, rej) => {
                        const args = [
                            '-y',
                            '-ss', seekTime.toFixed(2),
                            '-i', videoPath,
                            '-t', clipDuration.toFixed(2),
                            '-c:v', 'libvpx-vp9',
                            '-b:v', '1M',
                            '-deadline', 'realtime',
                            '-cpu-used', '8',
                            '-c:a', 'libopus',
                            '-b:a', '64k',
                            tempClipPath,
                            '-loglevel', 'error'
                        ];
                        execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                            if (err) return rej(err);
                            res();
                        });
                    });
                }

                if (sender && !sender.isDestroyed()) {
                    sender.send('generate-webm-progress', {
                        videoPath,
                        percent: 95,
                        label: `Compiling clips into seamless WebM preview...`
                    });
                }

                // Concat clip files
                if (tempFiles.length > 0) {
                    const concatFilePath = path.join(os.tmpdir(), `vw-concat-${Date.now()}.txt`);
                    const concatContent = tempFiles.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
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
                }
            }
            
            webmTimeMs = Date.now() - webmStart;
            
            if (sender && !sender.isDestroyed()) {
                sender.send('generate-webm-progress', {
                    videoPath,
                    percent: 100,
                    label: `Preview generation completed successfully!`,
                    hoverWebm: hoverWebmPath
                });
            }
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
                        // Verify file has a video stream before converting
                        const hasVideo = await new Promise((resolveCheck) => {
                            execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', mp4Path], (err, stdout) => {
                                resolveCheck(!!stdout.trim());
                            });
                        });
                        if (!hasVideo) {
                            log('legacy-convert', 'Skipping (no video stream):', f);
                            try { fs.unlinkSync(mp4Path); } catch (e) {}
                            return;
                        }
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
                        log('legacy-convert', 'Converted:', f, '->', path.basename(webmPath));
                    } catch (e) {
                        log('legacy-convert', 'Failed for', mp4Path, ':', e.message);
                        try { fs.unlinkSync(mp4Path); } catch (err) {}
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

      let checkName = baseName;

      if (type === 'image' || ext === '.webm' || name.endsWith('_p.mp4') || name.endsWith('-preview.mp4')) {
          if (name.endsWith('_p.mp4')) checkName = baseName.substring(0, baseName.length - 2);
          else if (name.endsWith('-preview.mp4')) checkName = baseName.replace('-preview', '');
          else if (name.endsWith('-poster')) checkName = baseName.replace('-poster', '');
          
          if (allFilesSet) {
              const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(e => 
                  allFilesSet.has(path.join(dir, checkName + e).toLowerCase())
              );
              if (hasParent) continue; 
          }
      }
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

ipcMain.handle('scan-directory', async (event, dirPath) => { console.log('[API] scan-directory called with', dirPath);
  if (typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return [];
  log('scan', 'Scanning:', dirPath);
  const settings = loadSettings();
  const exclusions = settings.globExclusions || [];
  const exclusionRegexes = exclusions.map(pat => globToRegex(pat));
  
  return new Promise(async (resolve) => {
    const allFiles = await findVideosAsync(dirPath, exclusionRegexes, dirPath);
    const allFilesSet = new Set(allFiles.map(f => f.toLowerCase()));
    const result = _processFileNodes(allFiles, allFilesSet, dirPath);
    log('scan', 'Found', result.length, 'items');
    resolve(result); 
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
        images.sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));        console.log('[API] get-trickplay-sprites returned', images.length, 'images');
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

ipcMain.handle('open-file', (event, filePath) => {
  log('open', 'Opening:', filePath);
  if (typeof filePath === 'string' && fs.existsSync(filePath)) {
    shell.openPath(path.resolve(filePath)).then(err => {
      if (err) log('open', 'Error:', err);
    });
  }
});
ipcMain.handle('show-in-folder', (event, filePath) => {
  log('show-folder', filePath);
  if (typeof filePath === 'string' && fs.existsSync(filePath)) shell.showItemInFolder(path.resolve(filePath));
});
ipcMain.handle('copy-to-clipboard', (event, text) => {
  log('clipboard', 'Copying text');
  clipboard.writeText(text);
});

ipcMain.handle('show-context-menu', async (event, item) => {
  return new Promise((resolve) => {
      let resolved = false;
      const once = (val) => { if (!resolved) { resolved = true; resolve(val); } };

      let templ = [];
      if (item.type === 'video' || item.type === 'image' || item.type === 'other') {
         const isEnc = typeof item.path === 'string' && item.path.toLowerCase().endsWith('.enc');
         templ = [
           { label: 'Open File', click: () => {
               shell.openPath(item.path).then(err => { once(err ? 'open-error' : 'opened'); });
           }},
           { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); once('show'); } },
           { type: 'separator' },
           { label: 'Copy Path', click: () => { clipboard.writeText(item.path); once('copied'); } },
           { type: 'separator' },
           { label: 'Cut',    click: () => once('cut') },
           { label: 'Copy',   click: () => once('copy') },
           { label: 'Rename', click: () => once('rename') },
           { type: 'separator' },
           isEnc ? { label: 'Decrypt File (AES-256)', click: () => once('decrypt-prompt') }
                 : { label: 'Encrypt File (AES-256)', click: () => once('encrypt-prompt') },
           { type: 'separator' },
            { label: 'Generate WebM Preview', click: () => once('generate-webm') },
            { label: 'Normalize Audio (Demucs)', click: () => once('normalize-audio') },
            { label: 'Normalize & Transcribe (AI)', click: () => once('normalize-audio-transcribe') },
            { label: 'Upscale Video (AI)',      click: () => once('upscale-video') },
            { label: 'Zip Selection',           click: () => once('zip-selection') },
           { type: 'separator' },
           { label: 'Delete',     click: () => once('delete-item') },
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
           { label: 'Paste',               enabled: item._hasClipboard === true, click: () => once('paste') },
           { type: 'separator' },
           { label: 'Refresh',             click: () => once('bg-refresh') },
           { label: 'Select All',          click: () => once('bg-select-all') },
           { type: 'separator' },
           { label: 'New Virtual Folder…', click: () => once('bg-new-folder') },
         ];
      }
      const menu = Menu.buildFromTemplate(templ);
      menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
      // Only resolve 'closed' if no item was clicked
      menu.once('menu-will-close', () => { setTimeout(() => once('closed'), 50); });
  });
});

ipcMain.handle('normalize-audio', async (event, { videoPath, vaultRoot, transcribe }) => {
    log('normalize', `Starting audio normalization for: ${videoPath} (transcribe: ${!!transcribe})`);
    const sender = event.sender;
    
    return new Promise((resolve) => {
        const pyScript = path.join(__dirname, 'python-scripts', 'audio_normalize.py');
        const pythonPath = path.join(__dirname, '..', 'vaultwares-media-processing', '.venv', 'Scripts', 'python.exe');
        const execPython = fs.existsSync(pythonPath) ? pythonPath : 'python';
        
        const args = [pyScript, videoPath, vaultRoot];
        if (transcribe) {
            args.push('--transcribe');
        }
        
        const proc = spawn(execPython, args, { windowsHide: true });
        let finalStatus = null;
        
        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('PROGRESS_UPDATE:')) {
                    try {
                        const payload = JSON.parse(line.substring('PROGRESS_UPDATE:'.length).trim());
                        if (sender && !sender.isDestroyed()) {
                            sender.send('normalize-progress', { videoPath, ...payload });
                        }
                    } catch (e) {}
                } else if (line.startsWith('JSON_STATUS:')) {
                    try {
                        finalStatus = JSON.parse(line.substring('JSON_STATUS:'.length).trim());
                    } catch (e) {}
                }
            }
        });
        
        proc.stderr.on('data', (data) => {
            log('normalize-err', data.toString());
        });
        
        proc.on('close', (code) => {
            log('normalize', `Python subprocess exited with code ${code}`);
            if (finalStatus) {
                resolve(finalStatus);
            } else {
                resolve({ status: 'FAILED', error: `Subprocess exited with code ${code}` });
            }
        });
    });
});

ipcMain.handle('upscale-video', async (event, itemPath) => {
    log('ai', `Upscaling item: ${itemPath}`);
    return new Promise((resolve) => {
        if (!fs.existsSync(itemPath)) {
            return resolve({ success: false, error: 'File not found' });
        }
        
        const ext = path.extname(itemPath).toLowerCase();
        const dir = path.dirname(itemPath);
        const baseName = path.basename(itemPath, ext);
        
        const realesrganPath = path.join(__dirname, 'tools', 'realesrgan-ncnn-vulkan.exe');
        const modelsPath = path.join(__dirname, 'tools', 'models');
        
        if (!fs.existsSync(realesrganPath)) {
            return resolve({ success: false, error: 'Real-ESRGAN executable not found' });
        }

        const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext);

        if (isImage) {
            const outPath = path.join(dir, `${baseName}_upscaled${ext}`);
            const args = ['-i', itemPath, '-o', outPath, '-n', 'realesrgan-x4plus-anime', '-m', modelsPath, '-j', '1:1:1'];
            log('ai', `Running Real-ESRGAN on image: ${args.join(' ')}`);
            execFile(realesrganPath, args, (error, stdout, stderr) => {
                if (error) return resolve({ success: false, error: error.message || stderr });
                resolve({ success: true, path: outPath });
            });
        } else if (isVideo) {
            const thumbsDir = path.join(dir, '.thumbs');
            const thumbPath = path.join(thumbsDir, `${baseName}.jpg`);
            const outPoster = path.join(dir, `${baseName}_upscaled_poster.png`);
            const tempFrame = path.join(os.tmpdir(), `temp_frame_${Date.now()}.png`);

            const upscaleImage = (inImg, outImg) => {
                return new Promise((resImg) => {
                    const args = ['-i', inImg, '-o', outImg, '-n', 'realesrgan-x4plus-anime', '-m', modelsPath, '-j', '1:1:1'];
                    execFile(realesrganPath, args, (error) => {
                        resImg(!error);
                    });
                });
            };

            const extractArgs = ['-y', '-ss', '00:00:02', '-i', itemPath, '-vframes', '1', tempFrame];
            log('ai', `Extracting frame for video AI enhancement: ffmpeg ${extractArgs.join(' ')}`);
            execFile('ffmpeg', extractArgs, async (error) => {
                if (error) {
                    execFile('ffmpeg', ['-y', '-i', itemPath, '-vframes', '1', tempFrame], async (err2) => {
                        if (err2) {
                            if (fs.existsSync(thumbPath)) {
                                const success = await upscaleImage(thumbPath, thumbPath);
                                return resolve({ success, path: thumbPath });
                            }
                            return resolve({ success: false, error: 'Could not extract video frame or find thumbnail' });
                        }
                        await processUpscale();
                    });
                } else {
                    await processUpscale();
                }
            });

            async function processUpscale() {
                const posterDone = await upscaleImage(tempFrame, outPoster);
                
                if (fs.existsSync(thumbPath)) {
                    await upscaleImage(thumbPath, thumbPath);
                }
                
                try { fs.unlinkSync(tempFrame); } catch (e) {}
                
                if (posterDone) {
                    resolve({ success: true, path: outPoster });
                } else {
                    resolve({ success: false, error: 'Real-ESRGAN upscaling failed' });
                }
            }
        } else {
            resolve({ success: false, error: 'Unsupported file type for AI upscaling' });
        }
    });
});
ipcMain.handle('generate-webm', async (event, itemPath, vaultRoot) => {
    if (typeof itemPath !== 'string' || !fs.existsSync(itemPath)) return { success: false, error: 'File not found' };
    
    if (!vaultRoot) vaultRoot = path.dirname(itemPath);
    const thumbsDir = path.join(vaultRoot, '.thumbs');
    if (!fs.existsSync(thumbsDir)) {
        try { fs.mkdirSync(thumbsDir, { recursive: true }); } catch (e) {}
    }
    
    const relativePath = path.relative(vaultRoot, itemPath);
    const uniqueBase = relativePath.replace(/[^a-zA-Z0-9]/g, '_');
    const thumbPath = path.join(thumbsDir, uniqueBase + '.jpg');
    const hoverWebmPath = path.join(thumbsDir, uniqueBase + '.webm');
    
    // Explicit generation deletes existing first to guarantee a clean new render
    try {
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        if (fs.existsSync(hoverWebmPath)) fs.unlinkSync(hoverWebmPath);
    } catch (e) {
        console.error("Failed to delete legacy previews for recreation:", e.message);
    }
    
    // Execute IMMEDIATELY for manually clicked items to bypass the idle queue!
    try {
        await generateThumbAndPreview(itemPath, thumbPath, hoverWebmPath, event.sender);
        return { success: true, path: hoverWebmPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('find-subtitles', async (event, videoPath) => {
    if (typeof videoPath !== 'string' || !fs.existsSync(videoPath)) return [];
    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const base = path.basename(videoPath, ext);
    const subExts = ['.srt', '.vtt', '.ass', '.ssa'];
    
    try {
        const files = fs.readdirSync(dir);
        const discovered = [];
        for (const f of files) {
            const fExt = path.extname(f).toLowerCase();
            if (!subExts.includes(fExt)) continue;
            
            const fBase = path.basename(f, fExt);
            if (fBase === base) {
                discovered.push({
                    path: path.join(dir, f),
                    name: f,
                    label: 'Default',
                    lang: 'und'
                });
            } else if (fBase.startsWith(base + '.') || fBase.startsWith(base + '_')) {
                const suffix = fBase.substring(base.length + 1);
                discovered.push({
                    path: path.join(dir, f),
                    name: f,
                    label: suffix.toUpperCase(),
                    lang: suffix.toLowerCase()
                });
            }
        }
        return discovered;
    } catch (e) {
        console.error("find-subtitles error:", e.message);
        return [];
    }
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
                await generateThumbAndPreview(videoPath, thumbPath, hoverWebmPath, event.sender);
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

ipcMain.handle('zip-selection', async (event, { paths, outputPath }) => {
    if (!Array.isArray(paths) || paths.length === 0 || !outputPath) {
        return { success: false, error: 'Invalid parameters' };
    }
    return new Promise((resolve) => {
        // Build PowerShell array literal: @('path1','path2',...)
        const psPathArray = '@(' + paths.map(p => "'" + p.replace(/'/g, "''")
            .replace(/\\/g, '\\\\') + "'").join(',') + ')';
        const psOut = "'" + outputPath.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
        const cmd = `Compress-Archive -LiteralPath ${psPathArray} -DestinationPath ${psOut} -Force`;
        log('zip', 'Running:', cmd);
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
            { windowsHide: true, timeout: 120000 },
            (err, stdout, stderr) => {
                if (err) {
                    log('zip', 'Error:', stderr || err.message);
                    resolve({ success: false, error: (stderr || err.message).substring(0, 300) });
                } else {
                    resolve({ success: true, path: outputPath });
                }
            }
        );
    });
});

ipcMain.handle('get-file-properties', async (event, filePath) => {
    console.log('[API] get-file-properties called with', filePath);
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
            try {
                fs.unlinkSync(itemPath);
            } catch (err) {
                fs.rmdirSync(itemPath);
            }
        } else if (stats.isDirectory()) {
            try {
                fs.rmSync(itemPath, { recursive: true, force: true });
            } catch (err) {
                fs.rmdirSync(itemPath);
            }
        } else {
            fs.unlinkSync(itemPath);
        }
        return { success: true };
    } catch (e) {
        try {
            const stats = fs.lstatSync(itemPath);
            if (stats.isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
            } else {
                try {
                    fs.unlinkSync(itemPath);
                } catch (err) {
                    fs.rmdirSync(itemPath);
                }
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
// ─── Real-Time ESRGAN Upscale Stream ──────────────────────────────────────────
const CHUNK_FRAMES = 60;      // frames per batch (2s @ 30fps)
const PARALLEL_ESRGAN = 1;    // sequential processing per chunk (VRAM friendly!)
const ESRGAN_MODEL = 'realesr-animevideov3-x2';
const LEAD_CHUNKS = 1;        // buffer exactly 1 chunk ahead to prevent overlapping spawned threads!
let upscaleSession = null;    // active session state

function killSession(session) {
    if (!session) return;
    session.cancelled = true;
    for (const proc of (session.procs || [])) {
        try { proc.kill(); } catch (_) {}
    }
    // clean temp dir async
    if (session.tmpDir && fs.existsSync(session.tmpDir)) {
        fs.rm(session.tmpDir, { recursive: true, force: true }, () => {});
    }
}

ipcMain.handle('upscale-stream-stop', async () => {
    if (upscaleSession) {
        log('upscale', 'Stopping session');
        killSession(upscaleSession);
        upscaleSession = null;
    }
    return { success: true };
});

ipcMain.handle('upscale-stream-start', async (event, { videoPath, startTime, fps: hintFps }) => {
    if (upscaleSession) { killSession(upscaleSession); upscaleSession = null; }

    if (!fs.existsSync(videoPath)) return { success: false, error: 'File not found' };

    const realesrganPath = path.join(__dirname, 'tools', 'realesrgan-ncnn-vulkan.exe');
    const modelsPath     = path.join(__dirname, 'tools', 'models');
    if (!fs.existsSync(realesrganPath)) return { success: false, error: 'Real-ESRGAN not found' };

    const sender = event.sender;
    const send   = (ch, data) => { if (!sender.isDestroyed()) sender.send(ch, data); };

    // ── Probe video fps & duration ──────────────────────────────────────────
    const probe = await new Promise(res => {
        execFile('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate,duration,width,height',
            '-of', 'json', videoPath
        ], (err, stdout) => {
            if (err) return res({ fps: hintFps || 24, duration: 0, width: 1920, height: 1080 });
            try {
                const d = JSON.parse(stdout);
                const s = d.streams && d.streams[0];
                if (!s) return res({ fps: hintFps || 24, duration: 0 });
                const [n, den] = s.r_frame_rate.split('/').map(Number);
                res({ fps: den ? n / den : 24, duration: parseFloat(s.duration) || 0,
                      width: s.width, height: s.height });
            } catch (_) { res({ fps: hintFps || 24, duration: 0 }); }
        });
    });

    const { fps, duration, width, height } = probe;
    log('upscale', `Starting: ${videoPath} | ${width}x${height} @ ${fps.toFixed(2)} fps | start=${startTime}s`);
    send('upscale-status', { type: 'init', fps, width, height, duration });

    // ── Create temp workspace ───────────────────────────────────────────────
    const tmpDir = path.join(os.tmpdir(), `ve-upscale-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const session = { cancelled: false, procs: [], tmpDir };
    upscaleSession = session;

    // ── Producer: extract → ESRGAN → encode one chunk, emit segment buffer ─
    async function processChunk(chunkIndex) {
        if (session.cancelled) return;
        const chunkStart = startTime + chunkIndex * (CHUNK_FRAMES / fps);
        if (duration > 0 && chunkStart >= duration) {
            send('upscale-status', { type: 'done' });
            return;
        }

        const chunkDir   = path.join(tmpDir, `chunk_${chunkIndex}`);
        const rawDir     = path.join(chunkDir, 'raw');
        const upDir      = path.join(chunkDir, 'up');
        const segPath    = path.join(chunkDir, 'seg.mp4');
        fs.mkdirSync(rawDir, { recursive: true });
        fs.mkdirSync(upDir,  { recursive: true });

        send('upscale-status', { type: 'processing', chunk: chunkIndex, chunkStart });

        // 1) Extract raw frames
        await new Promise((res, rej) => {
            const args = [
                '-y', '-ss', String(chunkStart), '-i', videoPath,
                '-frames:v', String(CHUNK_FRAMES), '-vsync', 'vfr',
                path.join(rawDir, 'f%05d.png')
            ];
            const proc = execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                session.procs.splice(session.procs.indexOf(proc), 1);
                if (err && !session.cancelled) return rej(err);
                res();
            });
            session.procs.push(proc);
        }).catch(e => { if (!session.cancelled) log('upscale', 'ffmpeg extract error:', e.message); });

        if (session.cancelled) return;

        // 2) ESRGAN: process frames in parallel batches
        const frames = fs.readdirSync(rawDir).filter(f => f.endsWith('.png')).sort();
        if (frames.length === 0) {
            send('upscale-status', { type: 'done' });
            return;
        }

        // Split frames across parallel workers
        const batches = [];
        for (let i = 0; i < frames.length; i += Math.ceil(frames.length / PARALLEL_ESRGAN)) {
            batches.push(frames.slice(i, i + Math.ceil(frames.length / PARALLEL_ESRGAN)));
        }

        await Promise.all(batches.map(batch => new Promise((res) => {
            // Write batch list to a temp txt file for ESRGAN input
            const batchRawDir  = path.join(chunkDir, `raw_b${batches.indexOf(batch)}`);
            const batchUpDir   = path.join(chunkDir, `up_b${batches.indexOf(batch)}`);
            fs.mkdirSync(batchRawDir, { recursive: true });
            fs.mkdirSync(batchUpDir,  { recursive: true });
            for (const f of batch) {
                fs.copyFileSync(path.join(rawDir, f), path.join(batchRawDir, f));
            }
            const args = ['-i', batchRawDir, '-o', batchUpDir, '-n', ESRGAN_MODEL,
                          '-m', modelsPath, '-j', '1:1:1', '-f', 'png'];
            const proc = execFile(realesrganPath, args, { windowsHide: true }, (err) => {
                session.procs.splice(session.procs.indexOf(proc), 1);
                // Copy results back to upDir
                try {
                    const outFiles = fs.readdirSync(batchUpDir);
                    for (const f of outFiles) {
                        fs.copyFileSync(path.join(batchUpDir, f), path.join(upDir, f));
                    }
                } catch (_) {}
                res();
            });
            session.procs.push(proc);
        })));

        if (session.cancelled) return;

        // 3) Re-encode upscaled frames to fragmented MP4 segment
        const upFrames = fs.readdirSync(upDir).filter(f => f.endsWith('.png'));
        if (upFrames.length === 0) {
            // Fallback: encode original frames
            fs.readdirSync(rawDir).filter(f => f.endsWith('.png'))
              .forEach(f => fs.copyFileSync(path.join(rawDir, f), path.join(upDir, f)));
        }

        await new Promise((res) => {
            const args = [
                '-y', '-framerate', String(fps),
                '-i', path.join(upDir, 'f%05d.png'),
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
                '-pix_fmt', 'yuv420p',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                '-g', '30',
                segPath
            ];
            const proc = execFile('ffmpeg', args, { windowsHide: true }, (err) => {
                session.procs.splice(session.procs.indexOf(proc), 1);
                if (err && !session.cancelled) log('upscale', 'encode error:', err.message);
                res();
            });
            session.procs.push(proc);
        });

        if (session.cancelled) return;

        // 4) Send the segment buffer to renderer
        if (fs.existsSync(segPath)) {
            const buf = fs.readFileSync(segPath);
            send('upscale-chunk', {
                chunk: chunkIndex,
                chunkStart,
                duration: CHUNK_FRAMES / fps,
                buffer: buf,       // Buffer → transferred as Uint8Array in renderer
            });
            log('upscale', `Chunk ${chunkIndex} sent (${buf.length} bytes)`);
        } else {
            send('upscale-status', { type: 'chunk-error', chunk: chunkIndex });
        }

        // 5) Clean up this chunk's temp files to save disk space
        fs.rm(chunkDir, { recursive: true, force: true }, () => {});
    }

    // ── Pipeline: process LEAD_CHUNKS ahead, then respond to renderer asks ─
    (async () => {
        let chunkIndex = 0;
        let inFlight   = 0;
        const MAX_INFLIGHT = LEAD_CHUNKS;

        async function maybeNext() {
            while (inFlight < MAX_INFLIGHT && !session.cancelled) {
                const ci = chunkIndex++;
                inFlight++;
                processChunk(ci).then(() => {
                    inFlight--;
                    maybeNext();
                }).catch(e => {
                    inFlight--;
                    log('upscale', 'Chunk error:', e?.message);
                    maybeNext();
                });
            }
        }
        maybeNext();
    })();

    return { success: true, fps, width, height, duration };
});

