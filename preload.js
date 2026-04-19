const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  scanSpecificFiles: (arr) => ipcRenderer.invoke('scan-specific-files', arr),
  getEverythingSize: (dirPath) => ipcRenderer.invoke('get-everything-size', dirPath),
  getTrickplaySprites: (folder) => ipcRenderer.invoke('get-trickplay-sprites', folder),
  getFileSize: (p) => ipcRenderer.invoke('get-file-size', p),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  showContextMenu: (item) => ipcRenderer.invoke('show-context-menu', item),
  generateWebm: (p) => ipcRenderer.invoke('generate-webm', p),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s)
});
