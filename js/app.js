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
  
  if (el('settings-btn-text')) el('settings-btn-text').innerText = window.translations[lang].settings;
  const sHeader = document.querySelector('.settings-panel-header');
  if (sHeader) sHeader.innerText = window.translations[lang].settings;
  if (el('glob-exclusions-label')) el('glob-exclusions-label').innerText = window.translations[lang].globExclusionsLabel;
  if (el('settings-btn-save')) el('settings-btn-save').innerText = window.translations[lang].save;

  // Translate top-level application navigation tabs
  if (el('tab-vault')) el('tab-vault').innerHTML = window.translations[lang].tabVault;
  if (el('tab-favorites')) el('tab-favorites').innerHTML = window.translations[lang].tabFavorites;
  if (el('tab-tmdb')) el('tab-tmdb').innerHTML = window.translations[lang].tabMoviesSeries;
  if (el('tab-livestream')) el('tab-livestream').innerHTML = window.translations[lang].tabLivestream;

  // Translate TMDB subtabs
  if (el('subtab-movies')) el('subtab-movies').innerText = window.translations[lang].tabMovies;
  if (el('subtab-series')) el('subtab-series').innerText = window.translations[lang].tabSeries;

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

    // Tab Navigation setup
    window.currentTab = 'vault';
    
    const tabVault = el('tab-vault');
    const tabFavs = el('tab-favorites');
    const tabTmdb = el('tab-tmdb');
    const tabLivestream = el('tab-livestream');
    
    if (tabVault) tabVault.addEventListener('click', () => window.switchTab('vault'));
    if (tabFavs) tabFavs.addEventListener('click', () => window.switchTab('favorites'));
    if (tabTmdb) tabTmdb.addEventListener('click', () => window.switchTab('tmdb'));
    if (tabLivestream) tabLivestream.addEventListener('click', () => window.switchTab('livestream'));

    // Initialize global TMDB streaming state
    window.tmdbCurrentProvider = 'all';
    window.tmdbCurrentMediaType = 'movie';
    window.tmdbCurrentPage = 1;
    window.tmdbCurrentQuery = '';

    // TMDB Search listeners
    const tmdbSearchBtn = el('tmdb-search-btn');
    const tmdbSearchInput = el('tmdb-search-input');
    if (tmdbSearchBtn) {
        tmdbSearchBtn.addEventListener('click', () => {
            const query = tmdbSearchInput.value.trim();
            window.renderTMDB(query);
        });
    }
    if (tmdbSearchInput) {
        tmdbSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                window.renderTMDB(tmdbSearchInput.value.trim());
            }
        });
    }

    // TMDB Subtabs (Movies / Series) click handlers
    const subtabMovies = el('subtab-movies');
    const subtabSeries = el('subtab-series');
    if (subtabMovies) {
        subtabMovies.addEventListener('click', () => {
            if (tmdbSearchInput) tmdbSearchInput.value = '';
            window.tmdbCurrentQuery = '';
            window.tmdbCurrentMediaType = 'movie';
            window.tmdbCurrentPage = 1;
            window.renderTMDB();
        });
    }
    if (subtabSeries) {
        subtabSeries.addEventListener('click', () => {
            if (tmdbSearchInput) tmdbSearchInput.value = '';
            window.tmdbCurrentQuery = '';
            window.tmdbCurrentMediaType = 'tv';
            window.tmdbCurrentPage = 1;
            window.renderTMDB();
        });
    }

    // TMDB Watch Providers click handlers
    document.querySelectorAll('.provider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (tmdbSearchInput) tmdbSearchInput.value = '';
            window.tmdbCurrentQuery = '';
            window.tmdbCurrentProvider = btn.dataset.provider;
            window.tmdbCurrentPage = 1;
            window.renderTMDB();
        });
    });

    // TMDB Load More pagination click handler
    const tmdbLoadMoreBtn = el('tmdb-load-more-btn');
    if (tmdbLoadMoreBtn) {
        tmdbLoadMoreBtn.addEventListener('click', () => {
            window.tmdbCurrentPage++;
            window.renderTMDB(window.tmdbCurrentQuery, true);
        });
    }

    // Initialize global livestream translator state
    window.isStreamPlaying = false;
    window.isTranslationActive = false;
    window._livestreamSettingsLoaded = false;

    window.loadLivestreamSettingsOnce = function() {
        if (window._livestreamSettingsLoaded) return;
        window._livestreamSettingsLoaded = true;

        console.log('[settings] Initializing livestream settings lazily on first tab open...');
        const voiceSelect = el('livestream-voice-preset');
        const langSelect = el('livestream-lang-profile');
        const threshRange = el('livestream-silence-thresh');
        const volRange = el('livestream-playback-vol');
        const translationToggle = el('livestream-translation-toggle');
        const urlInput = el('livestream-url-input');

        if (voiceSelect) {
            const saved = localStorage.getItem('livestream_voice');
            if (saved) voiceSelect.value = saved;
            voiceSelect.addEventListener('change', () => {
                localStorage.setItem('livestream_voice', voiceSelect.value);
                window.appSettings.livestreamVoice = voiceSelect.value;
                window.electronAPI.saveSettings(window.appSettings);
            });
            window.appSettings.livestreamVoice = voiceSelect.value;
        }
        if (langSelect) {
            const saved = localStorage.getItem('livestream_lang');
            if (saved) langSelect.value = saved;
            langSelect.addEventListener('change', () => {
                localStorage.setItem('livestream_lang', langSelect.value);
                window.appSettings.livestreamLang = langSelect.value;
                window.electronAPI.saveSettings(window.appSettings);
            });
            window.appSettings.livestreamLang = langSelect.value;
        }
        if (threshRange) {
            const saved = localStorage.getItem('livestream_threshold');
            if (saved) {
                threshRange.value = saved;
                const threshVal = el('livestream-silence-val');
                if (threshVal) threshVal.innerText = parseFloat(saved).toFixed(3);
            }
            threshRange.addEventListener('input', () => {
                localStorage.setItem('livestream_threshold', threshRange.value);
                const threshVal = el('livestream-silence-val');
                if (threshVal) threshVal.innerText = parseFloat(threshRange.value).toFixed(3);
            });
        }
        if (volRange) {
            const saved = localStorage.getItem('livestream_volume');
            if (saved) {
                volRange.value = saved;
                const volVal = el('livestream-playback-vol-val');
                if (volVal) volVal.innerText = `${Math.round(parseFloat(saved) * 100)}%`;
            }
            volRange.addEventListener('input', () => {
                localStorage.setItem('livestream_volume', volRange.value);
                const volVal = el('livestream-playback-vol-val');
                if (volVal) volVal.innerText = `${Math.round(parseFloat(volRange.value) * 100)}%`;
            });
        }
        if (translationToggle) {
            const saved = localStorage.getItem('livestream_translation');
            if (saved) translationToggle.checked = (saved === 'true');
            translationToggle.addEventListener('change', () => localStorage.setItem('livestream_translation', translationToggle.checked));
        }
        if (urlInput) {
            const saved = localStorage.getItem('livestream_url');
            if (saved) urlInput.value = saved;
            urlInput.addEventListener('input', () => localStorage.setItem('livestream_url', urlInput.value));
        }

        window.electronAPI.saveSettings(window.appSettings);
    };

    // Populate Kokoro voice activity visualizer bars
    const vizContainer = el('kokoro-visualizer-bars');
    if (vizContainer) {
        vizContainer.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.width = '10px';
            bar.style.height = '4px';
            bar.style.background = 'var(--vault-accent)';
            bar.style.borderRadius = '2px';
            bar.style.boxShadow = '0 0 8px var(--vault-accent)';
            bar.style.transition = 'height 0.08s ease, background 0.2s';
            vizContainer.appendChild(bar);
        }
    }

    // Helper functions for translation backend management
    async function startTranslationBackend() {
        const statusLbl = el('livestream-status-lbl');
        const consoleBox = el('livestream-console');
        const voiceSelect = el('livestream-voice-preset');
        const langSelect = el('livestream-lang-profile');
        const threshRange = el('livestream-silence-thresh');
        const volRange = el('livestream-playback-vol');
        const audioEl = el('livestream-audio');
        const urlInput = el('livestream-url-input');

        const streamUrl = urlInput ? urlInput.value.trim() : 'LOOPBACK';
        const voice = voiceSelect ? voiceSelect.value : 'ff_siwis';
        const lang = langSelect ? langSelect.value : 'fr-fr';
        const threshold = threshRange ? parseFloat(threshRange.value) : 0.005;
        const volume = volRange ? parseFloat(volRange.value) : 0.80;

        if (statusLbl) statusLbl.innerText = 'INITIALIZING TRANSLATION...';
        if (consoleBox) consoleBox.innerHTML += `\n[System] Spawning translator backend process...\nVoice: ${voice}\nLang: ${lang}\nSensitivity: ${threshold}\nVolume: ${volume}\n\n`;

        // Duck original stream audio to allow clear spoken translation audio
        if (audioEl) {
            audioEl.muted = true;
        }

        const res = await window.electronAPI.startLivestream({
            streamUrl,
            voice,
            lang,
            threshold,
            volume
        });

        if (res && res.success) {
            window.isTranslationActive = true;
            if (statusLbl) statusLbl.innerText = 'TRANSLATING';
            if (consoleBox) consoleBox.innerHTML += `[System] Translator active.\n`;

            window.electronAPI.onLivestreamLog((text) => {
                if (consoleBox) {
                    consoleBox.innerHTML += text + '\n';
                    consoleBox.scrollTop = consoleBox.scrollHeight;
                }
            });

            window.electronAPI.onLivestreamVisualizer((fftData) => {
                const bars = document.querySelectorAll('.visualizer-bar');
                if (bars.length && Array.isArray(fftData)) {
                    bars.forEach((bar, idx) => {
                        const val = fftData[idx % fftData.length] || 0;
                        const height = Math.max(4, Math.min(60, val * 60));
                        bar.style.height = `${height}px`;
                        if (val > 0.6) {
                            bar.style.background = 'var(--vault-gold)';
                            bar.style.boxShadow = '0 0 10px var(--vault-gold)';
                        } else {
                            bar.style.background = 'var(--vault-accent)';
                            bar.style.boxShadow = '0 0 8px var(--vault-accent)';
                        }
                    });
                }
            });
        } else {
            const err = (res && res.error) ? res.error : 'Unknown error starting translator';
            if (statusLbl) statusLbl.innerText = 'PLAYING ONLY';
            if (consoleBox) consoleBox.innerHTML += `\n[Error] ${err}\n`;
            window.showToast(err, 'error');
            
            // Unmute stream audio since translation failed
            if (audioEl) {
                audioEl.muted = false;
            }
            window.isTranslationActive = false;
        }
    }

    async function stopTranslationBackend() {
        const statusLbl = el('livestream-status-lbl');
        const consoleBox = el('livestream-console');
        const audioEl = el('livestream-audio');

        if (statusLbl) statusLbl.innerText = 'STOPPING TRANSLATION...';
        await window.electronAPI.stopLivestream();
        window.electronAPI.offLivestreamLog();
        window.electronAPI.offLivestreamVisualizer();
        window.isTranslationActive = false;

        // Restore original stream audio volume
        if (audioEl) {
            audioEl.muted = false;
        }

        if (statusLbl) statusLbl.innerText = 'PLAYING ONLY';
        if (consoleBox) consoleBox.innerHTML += '\n[System] Translator deactivated.\n';
    }

    // Spoken Translator control bindings
    const btnToggle = el('btn-livestream-toggle');
    const statusLbl = el('livestream-status-lbl');
    const consoleBox = el('livestream-console');

    if (btnToggle) {
        btnToggle.addEventListener('click', async () => {
            const streamUrl = urlInput ? urlInput.value.trim() : 'LOOPBACK';
            const audioEl = el('livestream-audio');

            if (window.isStreamPlaying) {
                // STOP PLAYER/STREAM
                btnToggle.disabled = true;
                if (window.isTranslationActive) {
                    await stopTranslationBackend();
                }
                if (audioEl) {
                    audioEl.pause();
                    audioEl.src = '';
                }
                window.isStreamPlaying = false;
                btnToggle.style.background = 'var(--vault-gold)';
                btnToggle.style.color = '#0b0813';
                btnToggle.querySelector('span').innerText = 'Start Player';
                if (statusLbl) statusLbl.innerText = 'STANDBY';
                if (consoleBox) consoleBox.innerHTML += '\n[System] Disconnected from stream.\n';
                btnToggle.disabled = false;
            } else {
                // START PLAYER/STREAM
                btnToggle.disabled = true;
                if (consoleBox) consoleBox.innerHTML = `[System] Connecting to stream target: ${streamUrl}...\n`;
                
                let isTranslationChecked = translationToggle && translationToggle.checked;

                if (streamUrl && streamUrl.toUpperCase() !== 'LOOPBACK' && audioEl) {
                    if (!isTranslationChecked) {
                        audioEl.src = streamUrl;
                        try {
                            await audioEl.play();
                            streamPlayedNatively = true;
                            if (consoleBox) consoleBox.innerHTML += `[System] Playing remote audio stream normally.\n`;
                        } catch (playErr) {
                            if (consoleBox) consoleBox.innerHTML += `[System Warning] Standard audio player could not play this stream format natively: ${playErr.message}\n`;
                            window.showToast('Audio playback not supported natively. Falling back to translation backend.', 'warning');
                            isTranslationChecked = true;
                            if (translationToggle) {
                                translationToggle.checked = true;
                            }
                        }
                    } else {
                        // Translation is checked: backend will handle audio capture, no need to play original natively in frontend
                        if (consoleBox) consoleBox.innerHTML += `[System] Real-time translation enabled. Bypassing frontend audio player.\n`;
                    }
                } else if (streamUrl && streamUrl.toUpperCase() === 'LOOPBACK') {
                    if (consoleBox) consoleBox.innerHTML += `[System] Capturing loopback system audio.\n`;
                }

                window.isStreamPlaying = true;
                btnToggle.style.background = 'var(--vault-signal-alert, #FF6B7A)';
                btnToggle.style.color = '#fff';
                btnToggle.querySelector('span').innerText = 'Stop Player';
                if (statusLbl) statusLbl.innerText = isTranslationChecked ? 'TRANSLATING' : 'PLAYING ONLY';

                // If translation toggle is checked, also start translation!
                if (isTranslationChecked) {
                    await startTranslationBackend();
                }

                btnToggle.disabled = false;
            }
        });
    }

    if (translationToggle) {
        translationToggle.addEventListener('change', async () => {
            if (window.isStreamPlaying) {
                if (translationToggle.checked) {
                    if (!window.isTranslationActive) {
                        await startTranslationBackend();
                    }
                } else {
                    if (window.isTranslationActive) {
                        await stopTranslationBackend();
                    }
                }
            }
        });
    }


    // Default boot tab setup, deferred to run after full init
    window.vaultLoaded = false;
    const homeTab = window.appSettings.defaultHomeTab || 'vault';
    window.switchTab(homeTab);
}

// Kickstart app when page loads
document.addEventListener('DOMContentLoaded', initApp);

// Bind i18n setter
window.setLanguage = setLanguage;
window.updateSortOrderButtonUI = updateSortOrderButtonUI;

window.switchTab = function(tabName) {
    window.currentTab = tabName;
    
    if (tabName === 'livestream') {
        if (window.loadLivestreamSettingsOnce) window.loadLivestreamSettingsOnce();
    }
    
    // --- FORCE CLEANUP OF ACTIVE MEDIA PROCESSES & SOUNDS ---
    const vp = el('video-player');
    if (vp) {
        try { vp.pause(); } catch(e) {}
    }
    const vm = el('video-modal');
    if (vm) {
        vm.style.display = 'none';
        vm.classList.remove('minimized');
    }
    if (window.autoplayTimer) {
        clearInterval(window.autoplayTimer);
        window.autoplayTimer = null;
    }
    const endedOverlay = el('video-ended-overlay');
    if (endedOverlay) endedOverlay.style.display = 'none';
    const tbTitle = el('titlebar-video-title');
    if (tbTitle) tbTitle.style.display = 'none';
    
    if (window.killAllHoverVideos) {
        window.killAllHoverVideos();
    }
    document.querySelectorAll('.file-card').forEach(card => {
        const mainImg = card.querySelector('.thumbnail');
        if (mainImg) mainImg.style.display = 'block';
    });

    // Cleanup active Spoken Translator run and player when leaving tab
    if (window.isStreamPlaying) {
        try {
            if (window.isTranslationActive) {
                window.electronAPI.stopLivestream();
                window.electronAPI.offLivestreamLog();
                window.electronAPI.offLivestreamVisualizer();
                window.isTranslationActive = false;
            }
            const audioEl = el('livestream-audio');
            if (audioEl) {
                audioEl.pause();
                audioEl.src = '';
            }
            window.isStreamPlaying = false;
            
            const btnToggle = el('btn-livestream-toggle');
            if (btnToggle) {
                btnToggle.disabled = false;
                btnToggle.style.background = 'var(--vault-gold)';
                btnToggle.style.color = '#0b0813';
                btnToggle.querySelector('span').innerText = 'Start Player';
            }
            const statusLbl = el('livestream-status-lbl');
            if (statusLbl) statusLbl.innerText = 'STANDBY';
            const consoleBox = el('livestream-console');
            if (consoleBox) consoleBox.innerHTML += '\n\n[System] Stream disconnected due to tab switch.\n';
        } catch(e) {
            console.error('Error stopping livestream during tab switch:', e);
        }
    }
    
    // Toggle active state on tabs
    const tabs = {
        'vault': el('tab-vault'),
        'favorites': el('tab-favorites'),
        'tmdb': el('tab-tmdb'),
        'livestream': el('tab-livestream')
    };
    
    Object.keys(tabs).forEach(name => {
        const btn = tabs[name];
        if (!btn) return;
        if (name === tabName) {
            btn.classList.add('active');
            btn.style.background = 'var(--vault-accent)';
            btn.style.color = 'var(--vt-primary)';
            btn.style.border = 'none';
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vault-text)';
            btn.style.border = '1px solid var(--vault-border)';
            btn.style.opacity = '0.8';
        }
    });

    // Toggle view elements
    const fileGrid = el('file-grid');
    const favGrid = el('favorites-grid');
    const tmdbContainer = el('tmdb-container');
    const livestreamContainer = el('livestream-container');
    const toolbar = document.querySelector('.toolbar');
    
    if (fileGrid) fileGrid.style.display = (tabName === 'vault') ? 'grid' : 'none';
    if (favGrid) favGrid.style.display = (tabName === 'favorites') ? 'grid' : 'none';
    if (tmdbContainer) tmdbContainer.style.display = (tabName === 'tmdb') ? 'block' : 'none';
    if (livestreamContainer) livestreamContainer.style.display = (tabName === 'livestream') ? 'block' : 'none';
    
    // Manage toolbar elements visibility
    if (toolbar) {
        // Hide standard toolbar search/browse buttons for non-vault/non-favorites tabs
        toolbar.style.display = (tabName === 'vault' || tabName === 'favorites') ? 'flex' : 'none';
    }

    if (tabName === 'favorites') {
        window.renderFavorites();
    } else if (tabName === 'tmdb') {
        window.renderTMDB();
    } else if (tabName === 'vault') {
        if (!window.vaultLoaded) {
            window.vaultLoaded = true;
            console.log('[Lazy Load] First time entering Vault Tab, performing directory load...');
            if (window.appSettings.lastPath && window.appSettings.lastPath.realPath) {
                window.loadDirectory(window.appSettings.lastPath.navPath, window.appSettings.lastPath.realPath, false);
            } else if (window.appSettings.defaultFolder) {
                window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, false);
            } else {
                window.loadDirectory('root', '', false);
            }
        }
    }
};

window.toggleFavorite = function(filePath, btnEl) {
    window.appSettings.favorites = window.appSettings.favorites || [];
    const idx = window.appSettings.favorites.indexOf(filePath);
    let isNowStarred = false;
    
    if (idx !== -1) {
        window.appSettings.favorites.splice(idx, 1);
        window.showToast('Removed from Favorites', 'success');
    } else {
        window.appSettings.favorites.push(filePath);
        window.showToast('Added to Favorites', 'success');
        isNowStarred = true;
    }
    
    // Save settings persistently
    window.electronAPI.saveSettings(window.appSettings);
    
    // Update SVG icon in any matching card elements
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    document.querySelectorAll(`.file-card[data-path="${escapedPath}"]`).forEach(c => {
        const svg = c.querySelector('.star-svg');
        if (svg) {
            svg.setAttribute('fill', isNowStarred ? '#E5A93B' : 'none');
            svg.setAttribute('stroke', isNowStarred ? '#E5A93B' : '#ffffff');
            svg.style.transform = 'scale(1.3)';
            setTimeout(() => { svg.style.transform = 'scale(1.0)'; }, 200);
        }
    });

    if (window.currentTab === 'favorites') {
        window.renderFavorites();
    }
};


// Favorites Grid Rendering logic has been decoupled to js/favorites.js
// TMDB Search Grid Rendering logic has been decoupled to js/tmdb.js



// triggerRDStream is defined in js/streaming.js (supports season/episode + quality/lang ranking)

window.startRDDebridFlow = async function(torrent, movieTitle, index = 0) {
    const loadingStatus = el('rd-loading-status');
    const statusText = el('rd-status-text');
    const torrentsList = el('rd-torrents-list');
    
    torrentsList.style.display = 'none';
    loadingStatus.style.display = 'block';
    loadingStatus.querySelector('.spinner').style.display = 'block';
    statusText.innerHTML = `⚡ Unrestricting cached torrent on Real-Debrid servers...<br><span style="font-size:10px; color:var(--vault-slate);">Checking availability & generating direct stream link</span>`;

    const chooseManuallyBtn = el('btn-rd-choose-manually');
    if (chooseManuallyBtn) {
        chooseManuallyBtn.style.display = 'block';
        chooseManuallyBtn.onclick = () => {
            window.activeRDFlowId = null;
            loadingStatus.style.display = 'none';
            torrentsList.style.display = 'flex';
            chooseManuallyBtn.style.display = 'none';
            window.showToast(window.currentLang === 'fr' ? 'Sélection manuelle activée' : 'Manual selection active', 'info');
        };
    }
    
    // Generate unique flow ID to handle cancel/overlapping flows gracefully
    const currentFlowId = Math.random();
    window.activeRDFlowId = currentFlowId;

    try {
        let response = await window.electronAPI.streamRDTorrent({ magnet: torrent.magnet, hash: torrent.hash, url: torrent.url });
        
        if (window.activeRDFlowId !== currentFlowId) {
            console.log('[Real-Debrid] Flow cancelled post initial streamRDTorrent.');
            return;
        }

        if (response && response.success && response.downloading) {
            // Live downloading / caching progress tracking workflow!
            let progress = response.progress || 0;
            let status = response.status || 'downloading';
            let speed = response.speed || 0;
            let seeders = response.seeders || 0;
            const torrentId = response.torrentId;

            const formatSpeed = (bytesPerSec) => {
                if (!bytesPerSec) return '0 KB/s';
                const kb = bytesPerSec / 1024;
                if (kb < 1024) return kb.toFixed(1) + ' KB/s';
                const mb = kb / 1024;
                return mb.toFixed(1) + ' MB/s';
            };

            while (status !== 'downloaded') {
                // Respect if the user cancelled (by closing the dialog) or clicked another stream
                if (window.activeRDFlowId !== currentFlowId || el('rd-stream-dialog').style.display === 'none') {
                    console.log('[Real-Debrid] Caching flow aborted due to dialog close or newer active flow.');
                    return;
                }

                statusText.innerHTML = `
                    <div style="text-align: center; width: 100%;">
                        <span style="font-size: 13px; font-weight: 700; color: var(--vault-accent, #F5B929); display: block; margin-bottom: 8px;">📥 Caching Torrent to Cloud...</span>
                        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin: 12px 0;">
                            <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, var(--vault-accent, #F5B929), #FF6B7A); border-radius: 4px; transition: width 0.4s ease;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #fff; margin-bottom: 6px; font-family: var(--font-mono);">
                            <span>Progress: <strong>${progress}%</strong></span>
                            <span>Speed: <strong>${formatSpeed(speed)}</strong></span>
                        </div>
                        <div style="font-size: 10.5px; color: var(--vault-slate); text-align: left; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; margin-top: 6px;">
                            Status: <strong style="color: #fff; text-transform: uppercase;">${status.replace('_', ' ')}</strong> | Seeders: <strong style="color: #fff;">${seeders}</strong>
                        </div>
                    </div>
                `;

                // Increased polling interval to 3500ms to completely prevent rate limits
                await new Promise(r => setTimeout(r, 3500));
                
                // Re-verify cancellation check immediately after sleep
                if (window.activeRDFlowId !== currentFlowId || el('rd-stream-dialog').style.display === 'none') {
                    console.log('[Real-Debrid] Caching flow aborted post-sleep.');
                    return;
                }

                const poll = await window.electronAPI.getTorrentStatus(torrentId);
                if (window.activeRDFlowId !== currentFlowId) {
                    console.log('[Real-Debrid] Flow cancelled post getTorrentStatus.');
                    return;
                }

                if (!poll || !poll.success) {
                    throw new Error(poll ? poll.error : 'Polling failed');
                }
                
                status = poll.status;
                progress = poll.progress || 0;
                speed = poll.speed || 0;
                seeders = poll.seeders || 0;
                
                if (status === 'downloaded' || (poll.links && poll.links.length > 0)) {
                    statusText.innerHTML = `⚡ <span style="color:var(--vault-accent);">Caching finished!</span> Unrestricting final stream...`;
                    const finalRes = await window.electronAPI.streamRDTorrent({ magnet: torrent.magnet, hash: torrent.hash, url: torrent.url });
                    if (window.activeRDFlowId !== currentFlowId) {
                        console.log('[Real-Debrid] Flow cancelled post final streamRDTorrent.');
                        return;
                    }
                    if (finalRes && finalRes.success) {
                        response = finalRes;
                        break;
                    } else {
                        throw new Error(finalRes ? finalRes.error : 'Failed to unrestrict finished link');
                    }
                } else if (status === 'dead' || status === 'error' || status === 'magnet_error') {
                    throw new Error(`Torrent download failed on Real-Debrid with status: ${status}`);
                }
            }
        }

        if (window.activeRDFlowId !== currentFlowId) {
            return;
        }

        if (!response || !response.success) {
            // Auto-fallback workflow: Try next available stream in list if this one has been blocklisted (Error 35 / infringing_file)
            if (response && (response.error === 'infringing_file' || response.errorCode === 35)) {
                if (window.currentTorrentList && index + 1 < window.currentTorrentList.length) {
                    const nextTorrent = window.currentTorrentList[index + 1];
                    statusText.innerHTML = `⚠️ <strong style="color:var(--vault-gold);">Stream #${index + 1} flagged (infringing_file).</strong><br><span style="color:#fff; font-weight:600;">Trying next available stream (${index + 2} of ${window.currentTorrentList.length})...</span><br><span style="font-size:10px; color:var(--vault-slate); margin-top:6px; display:block;">Checking cached availability on RD</span>`;
                    await new Promise(r => setTimeout(r, 1500));
                    if (window.activeRDFlowId !== currentFlowId) {
                        return;
                    }
                    return window.startRDDebridFlow(nextTorrent, movieTitle, index + 1);
                }
            }
            
            loadingStatus.querySelector('.spinner').style.display = 'none';
            
            let errMsg = 'Failed to unrestrict torrent.';
            if (response) {
                if (response.error === 'infringing_file') {
                    errMsg = window.currentLang === 'fr' 
                        ? "Ce fichier a été supprimé suite à une plainte pour atteinte aux droits d'auteur (DMCA)."
                        : "This file has been removed due to a copyright infringement complaint (DMCA).";
                } else if (response.error === 'bad_token') {
                    errMsg = window.currentLang === 'fr'
                        ? "Clé API Real-Debrid non configurée, invalide ou expirée."
                        : "Real-Debrid API key is unconfigured, invalid, or expired.";
                } else if (response.error === 'link_not_allowed') {
                    errMsg = window.currentLang === 'fr'
                        ? "Ce lien ou hébergeur n'est pas autorisé par Real-Debrid."
                        : "This hoster link is not allowed by Real-Debrid.";
                } else if (response.error) {
                    errMsg = response.error;
                }
            }
            
            statusText.innerHTML = `❌ Real-Debrid Error:<br><strong style="color:var(--vault-signal-alert, #FF6B7A); font-size:11px; display: block; margin-top: 6px; line-height: 1.4;">${window.escapeHtml(errMsg)}</strong>`;
            
            const retryBtn = document.createElement('button');
            retryBtn.innerText = window.currentLang === 'fr' ? 'Retour aux Flux' : 'Back to Streams';
            retryBtn.style.cssText = 'margin-top: 15px; background: var(--vault-accent); color: var(--vt-primary); border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;';
            retryBtn.addEventListener('click', () => {
                loadingStatus.style.display = 'none';
                torrentsList.style.display = 'flex';
            });
            statusText.appendChild(retryBtn);
            return;
        }
        
        // Hide modal & Play
        el('rd-stream-dialog').style.display = 'none';
        const bd = el('rd-stream-backdrop');
        if (bd) bd.style.display = 'none';
        window.playStream(response.streamUrl, movieTitle);
        window.showToast('Direct high-speed RD stream loaded successfully!', 'success');
    } catch (e) {
        console.error('Real-Debrid streaming workflow failed:', e);
        loadingStatus.querySelector('.spinner').style.display = 'none';
        statusText.innerHTML = `❌ Real-Debrid Workflow Error:<br><strong style="color:var(--vault-signal-alert, #FF6B7A); font-size:11px; display: block; margin-top: 6px; line-height: 1.4;">${window.escapeHtml(e.message || e)}</strong>`;
        
        const retryBtn = document.createElement('button');
        retryBtn.innerText = window.currentLang === 'fr' ? 'Retour aux Flux' : 'Back to Streams';
        retryBtn.style.cssText = 'margin-top: 15px; background: var(--vault-accent); color: var(--vt-primary); border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;';
        retryBtn.addEventListener('click', () => {
            loadingStatus.style.display = 'none';
            torrentsList.style.display = 'flex';
        });
        statusText.appendChild(retryBtn);
    }
};

