const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
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
  return new Promise((resolve) => {
    exec(`es.exe -size -exact "${targetPath}"`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout.trim()) {
        exec(`es.exe -size "${targetPath}"`, { windowsHide: true }, (err2, stdout2) => {
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

async function findVideosAsync(dir) {
  let results = [];
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    
    // Process subdirectories asynchronously in parallel
    const dirPromises = [];
    
    for (const d of entries) {
      if (d.isDirectory()) {
         if (!d.name.endsWith('.trickplay')) {
             dirPromises.push(findVideosAsync(path.join(dir, d.name)));
         }
      } else {
         results.push(path.join(dir, d.name));
      }
    }
    
    const nestedArrays = await Promise.all(dirPromises);
    for (const arr of nestedArrays) {
        results.push(...arr);
    }
  } catch(e) {}
  return results;
}

function _processFileNodes(filesArray, allFilesSet) {
    const output = [];
    for (let res of filesArray) {
      const ext = path.extname(res).toLowerCase();
      let type = 'other';
      if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
      else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
      
      if (type !== 'video' && type !== 'image') continue;

      const dir = path.dirname(res);
      const name = path.basename(res);
      const baseName = path.basename(res, ext);
      
      // If this is a preview file, skip displaying it as an independent video node
      if (ext === '.webm' || name.endsWith('-preview.mp4')) {
          const checkName = name.endsWith('-preview.mp4') ? baseName.replace('-preview', '') : baseName;
          const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(e => 
              allFilesSet.has(path.join(dir, checkName + e).toLowerCase())
          );
          if (hasParent) continue; 
      }
      
      const checkName = name.endsWith('-preview.mp4') ? baseName.replace('-preview', '') : baseName;
      
      const thumbPath = path.join(dir, checkName + '.jpg');
      const posterPath = path.join(dir, checkName + '-poster.jpg');
      const trickplayDir = path.join(dir, checkName + '.trickplay');
      const hoverWebmPath = path.join(dir, checkName + '.webm');
      const hoverPreviewPath = path.join(dir, checkName + '-preview.mp4');
      
      let thumbnail = null;
      let hasTrickplayDir = false;
      let targetPreview = null;
      let mtimeMs = 0;
      let mtimeFormatted = '';
      
      try {
        if (fs.existsSync(thumbPath)) thumbnail = thumbPath;
        else if (fs.existsSync(posterPath)) thumbnail = posterPath;
        
        hasTrickplayDir = fs.existsSync(trickplayDir);
        if (fs.existsSync(hoverPreviewPath)) targetPreview = hoverPreviewPath;
        else if (fs.existsSync(hoverWebmPath)) targetPreview = hoverWebmPath;
        
        // Auto-fix missing thumbnails using trickplay directory
        if (!thumbnail && hasTrickplayDir) {
           const tpFiles = fs.readdirSync(trickplayDir);
           if (tpFiles.length > 0) thumbnail = path.join(trickplayDir, tpFiles[0]);
        }
        
        const stats = fs.statSync(res);
        mtimeMs = stats.mtimeMs;
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
        mtimeFormatted: mtimeFormatted
      });
    }
    return output;
}

ipcMain.handle('scan-directory', async (event, dirPath) => {
  return new Promise(async (resolve) => {
    const allFiles = await findVideosAsync(dirPath);
    const allFilesSet = new Set(allFiles.map(f => f.toLowerCase()));
    resolve(_processFileNodes(allFiles, allFilesSet)); 
  });
});

ipcMain.handle('scan-specific-files', (event, pathsArray) => {
   // Validate existence briefly
   const existingPaths = pathsArray.filter(p => fs.existsSync(p));
   return _processFileNodes(existingPaths, null);
});

ipcMain.handle('get-trickplay-sprites', async (event, folderPath) => {
    try {
        const files = await fsPromises.readdir(folderPath);
        let images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'));
        images.sort((a,b) => (parseInt(path.basename(a), 10)||0) - (parseInt(path.basename(b), 10)||0));
        
        // If it's a sprite sheet (a single long image) or multiple
        return images.map(img => path.join(folderPath, img));
    } catch(e) {
        return [];
    }
});

ipcMain.handle('get-file-size', async (event, filePath) => {
    try { const stat = await fsPromises.stat(filePath); return stat.size; } catch(e) { return 0; }
});

// Explorer functions
ipcMain.handle('rename-file', async (e, oldPath, newName) => {
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
            const replacePattern = new RegExp(`^${oldBase}`);
            const newEntry = entry.replace(replacePattern, newBase);
            fs.renameSync(path.join(dir, entry), path.join(dir, newEntry));
        }
     }
     return { success: true };
   } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('open-file', (event, filePath) => { shell.openPath(filePath); });
ipcMain.handle('show-in-folder', (event, filePath) => { shell.showItemInFolder(filePath); });
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
           { label: 'Generate WebM Preview (ffmpeg)', click: () => { resolve('generate-webm'); } }
         ];
      } else if (item.type === 'fakeFolder') {
         templ = [
           { label: `Open Fake Folder: ${item.name}`, enabled: false },
           { type: 'separator' },
           { label: 'Remove Fake Folder', click: () => { resolve('remove-folder'); } }
         ];
      }
      const menu = Menu.buildFromTemplate(templ);
      menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
      menu.once('menu-will-close', () => resolve('closed'));
  });
});

let ffmpegQueue = [];
let isFfmpegRunning = false;

function processFfmpegQueue() {
    if (isFfmpegRunning || ffmpegQueue.length === 0) return;
    isFfmpegRunning = true;
    const task = ffmpegQueue.shift();
    
    // First ensure we have a thumbnail if needed
    if (task.needsThumb) {
        const thumbCmd = `ffmpeg -y -ss 00:00:15 -i "${task.itemPath}" -vframes 1 -q:v 2 "${task.thumbPath}"`;
        exec(thumbCmd, { windowsHide: true }, () => {
             runPreviewFfmpeg(task);
        });
    } else {
         runPreviewFfmpeg(task);
    }
}

function runPreviewFfmpeg(task) {
    if (fs.existsSync(task.outPath) || fs.existsSync(task.altWebmPath)) {
        isFfmpegRunning = false; task.resolve({ success: true, path: task.outPath }); processFfmpegQueue(); return;
    }
    
    exec(task.cmdCuda, { windowsHide: true }, (err) => {
        if (err) {
            exec(task.cmdCpu, { windowsHide: true }, (err2) => {
                isFfmpegRunning = false;
                if (err2) task.resolve({ success: false, error: err2.message });
                else task.resolve({ success: true, path: task.outPath });
                processFfmpegQueue();
            });
        } else {
            isFfmpegRunning = false;
            task.resolve({ success: true, path: task.outPath });
            processFfmpegQueue();
        }
    });
}

ipcMain.handle('generate-webm', (event, itemPath) => {
    return new Promise((resolve) => {
        const dir = path.dirname(itemPath);
        const baseName = path.basename(itemPath, path.extname(itemPath));
        const outPath = path.join(dir, baseName + '-preview.mp4');
        const thumbPath = path.join(dir, baseName + '.jpg');
        
        const cmdCuda = `ffmpeg -y -hwaccel cuda -hwaccel_output_format cuda -ss 00:00:15 -i "${itemPath}" -t 10 -vf "scale_cuda=320:-2" -c:v h264_nvenc -preset p4 -b:v 1M -c:a aac -b:a 64k "${outPath}" -loglevel error`;
        const cmdCpu = `ffmpeg -y -ss 00:00:15 -i "${itemPath}" -t 10 -vf "scale=320:-2" -c:v libx264 -preset veryfast -b:v 1M -c:a aac -b:a 64k "${outPath}" -loglevel error`;

        ffmpegQueue.push({
            itemPath, outPath, thumbPath, cmdCuda, cmdCpu, altWebmPath: path.join(dir, baseName + '.webm'),
            needsThumb: !fs.existsSync(thumbPath), resolve 
        });
        processFfmpegQueue();
    });
});
