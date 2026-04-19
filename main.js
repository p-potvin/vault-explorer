const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
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

function findVideos(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const d of entries) {
      if (d.isDirectory()) {
         if (!d.name.endsWith('.trickplay')) results.push(...findVideos(path.join(dir, d.name)));
      } else {
         results.push(path.join(dir, d.name));
      }
    }
  } catch(e) {}
  return results;
}

ipcMain.handle('scan-directory', async (event, dirPath) => {
  return new Promise((resolve) => {
    const allFiles = findVideos(dirPath);
    const output = [];
    for (let res of allFiles) {
      const dir = path.dirname(res);
      const name = path.basename(res);
      const ext = path.extname(res).toLowerCase();
      const baseName = path.basename(res, ext);
      
      const thumbPath = path.join(dir, baseName + '.jpg');
      const posterPath = path.join(dir, baseName + '-poster.jpg');
      const trickplayDir = path.join(dir, baseName + '.trickplay');
      
      let thumbnail = null;
      let trickplayImages = [];
      
      if (fs.existsSync(thumbPath)) thumbnail = thumbPath;
      else if (fs.existsSync(posterPath)) thumbnail = posterPath;

      if (fs.existsSync(trickplayDir) && fs.statSync(trickplayDir).isDirectory()) {
          try {
              const tpFiles = fs.readdirSync(trickplayDir);
              trickplayImages = tpFiles
                  .filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'))
                  .map(f => path.join(trickplayDir, f));
              // Ensure numeric order
              trickplayImages.sort((a,b) => {
                  const na = parseInt(path.basename(a), 10) || 0;
                  const nb = parseInt(path.basename(b), 10) || 0;
                  return na - nb;
              });
          } catch (e) {}
      }

      let type = 'other';
      if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
      else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';

      output.push({
        path: res, name: name, type: type,
        thumbnail: thumbnail,
        trickplay: trickplayImages.length > 0 ? trickplayImages : null,
        directory: dir, baseName: baseName, ext: ext,
        size: fs.statSync(res).size
      });
    }
    resolve(output); 
  });
});

// Explorer functions
ipcMain.handle('rename-file', async (e, oldPath, newName) => {
   try {
     const dir = path.dirname(oldPath);
     const oldExt = path.extname(oldPath);
     const oldBase = path.basename(oldPath, oldExt);
     const newBase = path.basename(newName, path.extname(newName)); // Strip ext if user provided it
     
     // Find all files/folders in the same directory that start with oldBase
     const entries = fs.readdirSync(dir);
     for (let entry of entries) {
        if (entry === oldBase + oldExt) {
            fs.renameSync(path.join(dir, entry), path.join(dir, newBase + oldExt));
        } else if (entry === oldBase + '.trickplay') {
            fs.renameSync(path.join(dir, entry), path.join(dir, newBase + '.trickplay'));
        } else if (entry.startsWith(oldBase)) {
            // Check exact basename match (e.g. video.mp4 -> video.jpg, video-poster.jpg)
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
           { type: 'separator' }
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
