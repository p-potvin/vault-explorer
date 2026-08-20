const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  getCachedDirectory: (dirPath) => ipcRenderer.invoke('get-cached-directory', dirPath),
  scanSpecificFiles: (arr) => ipcRenderer.invoke('scan-specific-files', arr),
  getTrickplaySprites: (folder) => ipcRenderer.invoke('get-trickplay-sprites', folder),
  getFileSize: (p) => ipcRenderer.invoke('get-file-size', p),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  saveEditedImage: (data) => ipcRenderer.invoke('save-edited-image', data),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  showContextMenu: (item) => ipcRenderer.invoke('show-context-menu', item),
  generateWebm: (p, vaultRoot) => ipcRenderer.invoke('generate-webm', p, vaultRoot),
  upscaleVideo: (p) => ipcRenderer.invoke('upscale-video', p),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),
  deleteItem: (p) => ipcRenderer.invoke('delete-item', p),
  getFolderSizeBackground: (dirPath) => ipcRenderer.invoke('get-folder-size-background', dirPath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getLaunchIntent: () => ipcRenderer.invoke('get-launch-intent'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (t) => ipcRenderer.invoke('set-theme', t),
  setWindowFullScreen: (on) => ipcRenderer.invoke('set-window-fullscreen', !!on),
  scheduleIdlePreviews: (items) => ipcRenderer.invoke('schedule-idle-previews', items),
  generateIdlePreviewBatch: (items) => ipcRenderer.invoke('generate-idle-preview-batch', items),
  pasteFiles: (data) => ipcRenderer.invoke('paste-files', data),
  zipSelection: (data) => ipcRenderer.invoke('zip-selection', data),
  getFileProperties: (p) => ipcRenderer.invoke('get-file-properties', p),
  getFolderSizeSmart: (dirPath, fileCount) => ipcRenderer.invoke('get-folder-size-smart', dirPath, fileCount),
  encryptFiles: (data) => ipcRenderer.invoke('encrypt-files', data),
  decryptFiles: (data) => ipcRenderer.invoke('decrypt-files', data),
  startUpscaleStream: (data) => ipcRenderer.invoke('upscale-stream-start', data),
  stopUpscaleStream: () => ipcRenderer.invoke('upscale-stream-stop'),
  onUpscaleChunk: (cb) => ipcRenderer.on('upscale-chunk', (_, data) => cb(data)),
  offUpscaleChunk: () => ipcRenderer.removeAllListeners('upscale-chunk'),
  onUpscaleStatus: (cb) => ipcRenderer.on('upscale-status', (_, data) => cb(data)),
  offUpscaleStatus: () => ipcRenderer.removeAllListeners('upscale-status'),
  findSubtitles: (videoPath) => ipcRenderer.invoke('find-subtitles', videoPath),
  prepareSubtitleFile: (subtitlePath) => ipcRenderer.invoke('prepare-subtitle-file', subtitlePath),
  chooseSubtitleFile: (videoPath) => ipcRenderer.invoke('choose-subtitle-file', videoPath),
  onWebmProgress: (cb) => ipcRenderer.on('generate-webm-progress', (_, data) => cb(data)),
  offWebmProgress: () => ipcRenderer.removeAllListeners('generate-webm-progress'),
  // One call per menu action. Each starts only its own pipeline: asking for
  // subtitles no longer runs Demucs and a full re-encode.
  enhanceAudio: (videoPath, vaultRoot, options = {}) =>
    ipcRenderer.invoke('enhance-audio', { videoPath, vaultRoot, ...options }),
  generateSubtitles: (videoPath, vaultRoot, options = {}) =>
    ipcRenderer.invoke('generate-subtitles', { videoPath, vaultRoot, ...options }),
  translateVideo: (videoPath, vaultRoot, translateTo, options = {}) =>
    ipcRenderer.invoke('translate-video', { videoPath, vaultRoot, translateTo, ...options }),
  enhanceVideo: (videoPath, vaultRoot, options = {}) =>
    ipcRenderer.invoke('enhance-video', { videoPath, vaultRoot, ...options }),
  getEnhancementState: (videoPath) => ipcRenderer.invoke('get-enhancement-state', videoPath),
  // Deprecated alias, kept so older call sites keep working.
  normalizeAudio: (videoPath, vaultRoot, _transcribe, _translateTo, options = {}) =>
    ipcRenderer.invoke('enhance-audio', { videoPath, vaultRoot, volumeBoost: options.volumeBoost }),
  onNormalizeProgress: (cb) => ipcRenderer.on('normalize-progress', (_, data) => cb(data)),
  offNormalizeProgress: () => ipcRenderer.removeAllListeners('normalize-progress'),
  onUpscaleProgress: (cb) => ipcRenderer.on('upscale-progress', (_, data) => cb(data)),
  offUpscaleProgress: () => ipcRenderer.removeAllListeners('upscale-progress'),
  runASRBenchmark: (forceSimulation) => ipcRenderer.invoke('run-asr-benchmark', { forceSimulation }),
  // Omit `action` to revert everything, or pass 'audio' | 'video' | 'subtitles'
  // | 'translation' to undo a single enhancement.
  revertEnhancements: (p, action) => ipcRenderer.invoke('revert-enhancements', { path: p, action }),

  // Live streaming ASR subtitles (Parakeet)
  warmLiveSubtitles: () => ipcRenderer.invoke('warm-live-subtitles'),
  startLiveSubtitles: (data) => ipcRenderer.invoke('start-live-subtitles', data),
  stopLiveSubtitles: () => ipcRenderer.invoke('stop-live-subtitles'),
  onLiveSubtitleCue: (cb) => ipcRenderer.on('live-subtitle-cue', (_, data) => cb(data)),
  offLiveSubtitleCue: () => ipcRenderer.removeAllListeners('live-subtitle-cue'),
  onLiveSubtitleStatus: (cb) => ipcRenderer.on('live-subtitle-status', (_, data) => cb(data)),
  offLiveSubtitleStatus: () => ipcRenderer.removeAllListeners('live-subtitle-status'),

  openExternalURL: (url) => ipcRenderer.invoke('open-external-url', url),

  // Watch History API
  setWatchProgress: (data) => ipcRenderer.invoke('watch-history:set-progress', data),
  getWatchProgress: (data) => ipcRenderer.invoke('watch-history:get-progress', data),
  getContinueWatching: (opts) => ipcRenderer.invoke('watch-history:continue-watching', opts),
  getWatchHistory: (opts) => ipcRenderer.invoke('watch-history:get-all', opts),
  markWatched: (data) => ipcRenderer.invoke('watch-history:mark-watched', data),
  removeWatchHistory: (data) => ipcRenderer.invoke('watch-history:remove', data),
  clearWatchHistory: () => ipcRenderer.invoke('watch-history:clear'),
  enhanceImageThumbnails: (paths) => ipcRenderer.invoke('enhance-image-thumbnails', paths),
  enhanceImageRealESRGAN: (path) => ipcRenderer.invoke('enhance-image-realesrgan', path),
  enhanceImageMagick: (path, operation) => ipcRenderer.invoke('enhance-image-magick', { path, operation }),
  onImageEnhanced: (cb) => ipcRenderer.on('image-enhanced', (_, data) => cb(data)),
  offImageEnhanced: () => ipcRenderer.removeAllListeners('image-enhanced'),
  onAppHidden: (cb) => ipcRenderer.on('app-hidden', (_, data) => cb(data)),

  // Video Clipping API
  clipVideo: (data) => ipcRenderer.invoke('clipVideo', data),
  onClipProgress: (cb) => ipcRenderer.on('clip-progress', (_, data) => cb(data)),
  offClipProgress: () => ipcRenderer.removeAllListeners('clip-progress'),
  onInitialFile: (cb) => ipcRenderer.on('open-initial-file', (_, data) => cb(data))
});
