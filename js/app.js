// app.js - Master frontend orchestrator coordinates settings, i18n language setups, mock API integrations, progress channels, and window blur hooks

window.appSettings = { folders: [] };
window.currentLang = 'en';

function setLanguage(lang) {
  window.currentLang = lang;
  el('lang-text').innerText = (lang === 'en') ? 'EN' : 'FR';
  console.log('[i18n] Language set to:', lang);
  
  el('btn-select').innerText = window.translations[lang].browseVault;
  
  const filterType = el('filter-type');
  filterType.options[0].text = window.translations[lang].videos;
  filterType.options[1].text = window.translations[lang].images;
  filterType.options[2].text = window.translations[lang].allFiles;
  
  el('search-box').placeholder = window.translations[lang].searchPlaceholder;
  if (el('btn-new-folder')) el('btn-new-folder').title = window.translations[lang].addFolder;
  el('btn-refresh').title = window.translations[lang].refresh;
  if (el('sort-label')) el('sort-label').innerText = window.translations[lang].sortLabel;
  
  const sortBy = el('sort-by');
  sortBy.options[0].text = window.translations[lang].dateModified;
  sortBy.options[1].text = window.translations[lang].name;
  sortBy.options[2].text = window.translations[lang].size;
  sortBy.options[3].text = window.translations[lang].type;
  sortBy.options[4].text = window.translations[lang].duration;
  
  window.updateSortOrderButtonUI();
  el('loading-text').innerText = window.translations[lang].scanning;
  
  const dialogLabel = document.querySelector('#fake-folder-dialog label');
  if (dialogLabel) dialogLabel.innerText = window.translations[lang].enterFolderName;
  if (el('btn-cancel-folder')) el('btn-cancel-folder').innerText = window.translations[lang].cancel;
  if (el('btn-create-folder')) el('btn-create-folder').innerText = window.translations[lang].create;
  
  if (el('theme-btn-text')) el('theme-btn-text').innerText = window.translations[lang].theme;
  const themeHeader = document.querySelector('.theme-panel-header');
  if (themeHeader) themeHeader.innerText = window.translations[lang].theme;
  
  el('settings-btn-text').innerText = window.translations[lang].settings;
  document.querySelector('.settings-panel-header').innerText = window.translations[lang].settings;
  el('glob-exclusions-label').innerText = window.translations[lang].globExclusionsLabel;
  el('settings-btn-save').innerText = window.translations[lang].save;

  if (!window.currentRealPath) {
    el('path-display').innerText = window.translations[lang].noFolderSelected;
  }
  
  const emptyStateH3 = document.querySelector('#file-grid .empty-state h3');
  const emptyStateP = document.querySelector('#file-grid .empty-state p');
  const emptyStateBtn = document.querySelector('#file-grid .empty-state button');
  if (emptyStateH3) emptyStateH3.innerText = window.translations[lang].vaultEmpty;
  if (emptyStateP) emptyStateP.innerText = window.translations[lang].clickBrowse;
  if (emptyStateBtn) emptyStateBtn.innerText = window.translations[lang].browseVault;
  
  window.updateStatusBar();
}

function updateSortOrderButtonUI() {
    const btn = el('btn-sort-order');
    const order = btn.dataset.order || 'desc';
    const lang = window.currentLang || 'en';
    if (order === 'asc') {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
        btn.title = window.translations[lang].ascending;
    } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
        btn.title = window.translations[lang].descending;
    }
}

// ── Master Entrypoint ─────────────────────────────────────────────
async function initApp() {
   // Setup mock API fallback for standard browsers
   if (!window.electronAPI) {
       window.electronAPI = {
           openDirectory: async () => 'C:\\MockVault',
           scanDirectory: async (dirPath) => [
               { path: 'C:\\MockVault\\Sample Video.mp4', name: 'Sample Video.mp4', type: 'video', thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80', hoverWebm: '', duration: 120, size: 104857600, mtime: Date.now(), mtimeFormatted: '2026-05-18 12:00' },
               { path: 'C:\\MockVault\\Stunning View.jpg', name: 'Stunning View.jpg', type: 'image', thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', hoverWebm: '', size: 2048576, mtime: Date.now() - 3600000, mtimeFormatted: '2026-05-18 11:00' }
           ],
           scanSpecificFiles: async (arr) => [],
           getEverythingSize: async (dirPath) => 1073741824,
           getTrickplaySprites: async (folder) => [],
           getFileSize: async (p) => 1073741824,
           openFile: async (filePath) => console.log('Mock Open File:', filePath),
           showInFolder: async (filePath) => console.log('Mock Show In Folder:', filePath),
           copyToClipboard: async (text) => console.log('Mock Copy:', text),
           showContextMenu: async (item) => 'opened',
           generateWebm: async (p, vaultRoot) => ({ success: true, path: p + '.webm' }),
           upscaleVideo: async (p) => ({ success: true, path: p }),
           renameFile: async (oldPath, newName) => ({ success: true }),
           deleteItem: async (p) => ({ success: true }),
           getFolderSizeBackground: async (dirPath) => 1073741824,
           getSettings: async () => ({ folders: [], theme: 'golden-slate', lang: 'en' }),
           saveSettings: async (s) => console.log('Mock Save Settings:', s),
           getTheme: async () => ({ success: true, theme: 'golden-slate' }),
           setTheme: async (t) => ({ success: true }),
           findSubtitles: async (p) => [],
           onWebmProgress: (cb) => {},
           onNormalizeProgress: (cb) => {},
           offNormalizeProgress: () => {},
           offUpscaleChunk: () => {},
           offUpscaleStatus: () => {},
           onUpscaleStatus: (cb) => {},
           onUpscaleChunk: (cb) => {},
           startUpscaleStream: async () => ({ success: true }),
           stopUpscaleStream: () => {},
           encryptFiles: async () => ({ success: true }),
           decryptFiles: async () => ({ success: true }),
           pasteFiles: async () => ({ success: true }),
           zipSelection: async () => ({ success: true }),
           getFileProperties: async () => ({ success: true, properties: {} })
       };
   }

   window.appSettings = await window.electronAPI.getSettings();
   if (!window.appSettings.folders) window.appSettings.folders = [];
   if (!window.appSettings.lastPath) window.appSettings.lastPath = { navPath: 'root', realPath: '' };
   if (!window.appSettings.scrollPositions) window.appSettings.scrollPositions = {};
   
   window.scrollPositions = window.appSettings.scrollPositions;

   const subSize = window.appSettings.subFontSize || '20px';
   document.documentElement.style.setProperty('--sub-font-size', subSize);

   // Populate default theme select inside Settings UI
   const settingsThemeSelect = el('settings-default-theme');
   if (settingsThemeSelect) {
       settingsThemeSelect.innerHTML = '';
       (window.VAULT_THEMES || []).forEach(theme => {
           const opt = document.createElement('option');
           opt.value = theme.id;
           opt.textContent = theme.name;
           settingsThemeSelect.appendChild(opt);
       });
   }

   window.applyTheme(window.appSettings.theme || window.appSettings.defaultTheme || 'vaultwares-revisited-console');
   window.initThemeGrid();

   const preferredLang = window.appSettings.lang || window.appSettings.defaultLang || 'en';
   if (preferredLang && (preferredLang === 'en' || preferredLang === 'fr')) {
       setLanguage(preferredLang);
   } else {
       setLanguage('en');
   }

   // Initialize players and settings controllers
   window.initPlayer();
   window.initSettingsListeners();
   window.initNavigationListeners();

   if (window.appSettings.lastPath.realPath) {
       window.loadDirectory(window.appSettings.lastPath.navPath, window.appSettings.lastPath.realPath, false);
   } else if (window.appSettings.defaultFolder) {
       window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, false);
   }

   // Global Language Selector trigger
   el('lang-trigger').addEventListener('click', () => {
     const nextLang = window.currentLang === 'en' ? 'fr' : 'en';
     setLanguage(nextLang);
     if (window.appSettings) {
       window.appSettings.lang = nextLang;
       window.electronAPI.saveSettings(window.appSettings);
     }
   });

   // F5 and global keyboard accelerators
   document.addEventListener('keydown', async (e) => {
       if (e.key === 'F5') {
           e.preventDefault();
           if (window.currentRealPath) {
               console.log('[F5] Refreshing directory:', window.currentRealPath);
               window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
               window.showToast('Views refreshed successfully', 'success');
           }
       }
   });

   // Create fake virtual folders dialog setup
   if (el('btn-new-folder') && el('fake-folder-name')) { 
     document.getElementById('btn-new-folder').addEventListener('click', () => {
         document.getElementById('fake-folder-dialog').style.display = 'block';
         const input = document.getElementById('fake-folder-name');
         input.value = '';
         document.getElementById('btn-create-folder').disabled = true;
         document.getElementById('btn-create-folder').title = "Folder name cannot be empty";
         input.focus();
     });

     document.getElementById('fake-folder-name').addEventListener('input', (e) => {
         const createBtn = document.getElementById('btn-create-folder');
         const hasValue = e.target.value.trim().length > 0;
         createBtn.disabled = !hasValue;
         createBtn.title = hasValue ? "" : "Folder name cannot be empty";
     });
     document.getElementById('btn-cancel-folder').addEventListener('click', () => {
         document.getElementById('fake-folder-dialog').style.display = 'none'; document.getElementById('fake-folder-name').value = '';
         el('btn-new-folder').focus();
     });
     document.getElementById('btn-create-folder').addEventListener('click', () => {
         const name = document.getElementById('fake-folder-name').value.trim();
         if(name) {
             window.appSettings.folders.push({ name: name, parent: window.currentNavPath, items: [] });
             window.electronAPI.saveSettings(window.appSettings);
             document.getElementById('fake-folder-dialog').style.display = 'none'; document.getElementById('fake-folder-name').value = '';
             window.loadDirectory(window.currentNavPath, window.currentRealPath, true);
             el('btn-new-folder').focus();
         }
     });

     document.getElementById('fake-folder-name').addEventListener('keydown', (e) => {
         if (e.key === 'Enter') {
             e.preventDefault();
             if (!document.getElementById('btn-create-folder').disabled) {
                 document.getElementById('btn-create-folder').click();
             }
         } else if (e.key === 'Escape') {
             e.preventDefault();
             document.getElementById('btn-cancel-folder').click();
         }
     }); 
   }

   // Global shortcut keys (F2 rename, select all, copy, paste, delete)
   document.addEventListener('keydown', async (e) => {
       if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
           e.preventDefault();
           const sb = el('search-box');
           sb.focus();
           sb.select();
       } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
           e.preventDefault(); window.selectedIndices.clear();
           window.displayedItems.forEach((_, i) => window.selectedIndices.add(i));
           document.querySelectorAll('.file-card').forEach(c => {
                c.classList.add('selected'); c.querySelector('.file-checkbox').checked = true;
           });
           window.updateStatusBar();
       } else if (e.key === 'F2' && window.selectedIndices.size === 1) {
           e.preventDefault();
           const idx = Array.from(window.selectedIndices)[0];
           const card = document.querySelector(`.file-card[data-index="${idx}"]`);
           if (card) {
               const inp = card.querySelector('.rename-input'); const fn = card.querySelector('.filename');
               inp.style.display = 'block'; fn.style.display = 'none'; inp.focus(); inp.select();
           }
       } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
           if (window.selectedIndices.size > 0) {
               e.preventDefault();
               window._clipboard = { paths: [], mode: 'copy' };
               window.selectedIndices.forEach(idx => {
                   const si = window.displayedItems[idx];
                   if (si && si.path) window._clipboard.paths.push(si.path);
               });
               window.showToast(`Copied ${window._clipboard.paths.length} item(s)`, 'success');
           }
       } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
           if (window.selectedIndices.size > 0) {
               e.preventDefault();
               window._clipboard = { paths: [], mode: 'cut' };
               window.selectedIndices.forEach(idx => {
                   const si = window.displayedItems[idx];
                   if (si && si.path) window._clipboard.paths.push(si.path);
               });
               window.showToast(`Cut ${window._clipboard.paths.length} item(s)`, 'success');
           }
       } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
           if (window._clipboard && window._clipboard.paths.length > 0) {
               e.preventDefault();
               (async () => {
                   const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: window.currentRealPath });
                   if (res.success) {
                       window.showToast(`Pasted ${res.count} file(s)`, 'success');
                       if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                       window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
                   } else {
                       window.showToast('Paste failed: ' + res.error, 'error');
                   }
               })();
           }
       } else if (e.key === 'Delete') {
           if (window.selectedIndices.size > 0) {
               e.preventDefault();
               const itemsToDelete = Array.from(window.selectedIndices).map(idx => window.displayedItems[idx]).filter(Boolean);
               if (itemsToDelete.length > 0) {
                   const names = itemsToDelete.map(i => i.name).join(', ');
                   if (await window.showConfirmDialog(`Delete selected item(s): ${names}?`, 'Confirm Bulk Deletion')) {
                       (async () => {
                           let successCount = 0;
                           for (const item of itemsToDelete) {
                               if (item.type === 'fakeFolder') {
                                   window.appSettings.folders = window.appSettings.folders.filter(f => !(f.name === item.name && (f.parent === window.currentNavPath || (window.currentNavPath === 'root' && !f.parent))));
                                   successCount++;
                               } else {
                                   const res = await window.electronAPI.deleteItem(item.path);
                                   if (res.success) {
                                       window.allItems = window.allItems.filter(i => i.path !== item.path);
                                       successCount++;
                                   }
                               }
                           }
                           if (successCount > 0) {
                               window.showToast(`Deleted ${successCount} item(s)`, 'success');
                               window.electronAPI.saveSettings(window.appSettings);
                               window.loadDirectory(window.currentNavPath, window.currentRealPath, true);
                           }
                       })();
                   }
               }
           }
       } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
           e.preventDefault();
           const btn = document.getElementById('btn-new-folder');
           if (btn && !btn.disabled) btn.click();
       }
   });

   // ── WebM Real-time Progress Tracking ─────────────────────────────────────
   window.electronAPI.onWebmProgress((data) => {
       if (!data || !data.videoPath) return;
       const { videoPath, percent, label } = data;
       
       const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
       const card = Array.from(document.querySelectorAll('.file-card'))
           .find(c => normPath(c.dataset.path) === normPath(videoPath));
           
       if (card) {
           let overlay = card.querySelector('.webm-loading-overlay');
           if (percent < 100) {
               if (!overlay) {
                   overlay = document.createElement('div');
                   overlay.className = 'webm-loading-overlay';
                   overlay.innerHTML = `<div class="spinner-small"></div><div class="webm-percent" style="margin-top:4px; font-size:10px;">0%</div>`;
                   const thumbCont = card.querySelector('.thumbnail-container');
                   if (thumbCont) thumbCont.appendChild(overlay);
               }
               const pctText = overlay.querySelector('.webm-percent');
               if (pctText) pctText.innerText = `${percent}%`;
           } else {
               if (overlay) overlay.remove();
               if (data.hoverWebm) {
                   card.dataset.hasWebm = "true";
                   const idx = parseInt(card.dataset.index);
                   if (window.displayedItems[idx]) {
                       window.displayedItems[idx].hoverWebm = data.hoverWebm;
                   }
                   window.attachHoverWebmToCard(card, data.hoverWebm);
               }
               if (data.thumbnail) {
                   card.dataset.hasThumb = "true";
                   const idx = parseInt(card.dataset.index);
                   if (window.displayedItems[idx]) {
                       window.displayedItems[idx].thumbnail = data.thumbnail;
                   }
                   const imgEl = card.querySelector('img.thumbnail');
                   if (imgEl) {
                       imgEl.src = window.sanitizePath(data.thumbnail);
                   }
               }
               window.showToast('Preview generated and loaded!', 'success');
           }
       }
       
       const badge = el('task-badge');
       if (badge) {
           if (percent < 100) {
               badge.style.display = 'inline-flex';
               const pctText = el('task-percent');
               if (pctText) pctText.innerText = `${percent}%`;
           } else {
               badge.style.display = 'none';
           }
       }
   });

   // Focus Lost (Window Blur) -> Pause hover webms AND current running player video instantly!
   window.addEventListener('blur', () => {
        console.log('[window] Blur focus lost: pausing previews.');
        // Kill hover-preview webm videos cleanly
        window.killAllHoverVideos();
        document.querySelectorAll('.file-card').forEach(card => {
            const mainImg = card.querySelector('.thumbnail');
            if (mainImg) mainImg.style.display = 'block';
        });
    });
}

// Kickstart app when page loads
document.addEventListener('DOMContentLoaded', initApp);

// Bind i18n setter
window.setLanguage = setLanguage;
window.updateSortOrderButtonUI = updateSortOrderButtonUI;
