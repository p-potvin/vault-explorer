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
    // Tab Navigation setup
    window.currentTab = 'vault';
    
    const tabVault = el('tab-vault');
    const tabFavs = el('tab-favorites');
    const tabTmdb = el('tab-tmdb');
    
    if (tabVault) tabVault.addEventListener('click', () => window.switchTab('vault'));
    if (tabFavs) tabFavs.addEventListener('click', () => window.switchTab('favorites'));
    if (tabTmdb) tabTmdb.addEventListener('click', () => window.switchTab('tmdb'));

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
}

// Kickstart app when page loads
document.addEventListener('DOMContentLoaded', initApp);

// Bind i18n setter
window.setLanguage = setLanguage;
window.updateSortOrderButtonUI = updateSortOrderButtonUI;

window.switchTab = function(tabName) {
    window.currentTab = tabName;
    
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
    
    // Toggle active state on tabs
    const tabs = {
        'vault': el('tab-vault'),
        'favorites': el('tab-favorites'),
        'tmdb': el('tab-tmdb')
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
    const toolbar = document.querySelector('.toolbar');
    
    if (fileGrid) fileGrid.style.display = (tabName === 'vault') ? 'grid' : 'none';
    if (favGrid) favGrid.style.display = (tabName === 'favorites') ? 'grid' : 'none';
    if (tmdbContainer) tmdbContainer.style.display = (tabName === 'tmdb') ? 'block' : 'none';
    
    // Manage toolbar elements visibility
    if (toolbar) {
        // For TMDB, hide the entire standard vault toolbar search and browse buttons
        toolbar.style.display = (tabName === 'tmdb') ? 'none' : 'flex';
    }

    if (tabName === 'favorites') {
        window.renderFavorites();
    } else if (tabName === 'tmdb') {
        window.renderTMDB();
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

window.renderFavorites = async function() {
    const grid = el('favorites-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    window.appSettings.favorites = window.appSettings.favorites || [];
    if (window.appSettings.favorites.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--vault-gold);">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
               </svg>
               <h3>No Favorites Yet</h3>
               <p>Click the star icon on any video or image in your Vault to save it here for fast access.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;"><div class="spinner" style="margin: 0 auto 12px;"></div>Loading favorites...</div>';

    try {
        const items = await window.electronAPI.scanSpecificFiles(window.appSettings.favorites);
        grid.innerHTML = '';
        if (!items || items.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;">Favorites could not be loaded (make sure they exist).</div>';
            return;
        }
        
        window.displayedItems = items;
        
        items.forEach((item, i) => {
            grid.appendChild(window.createCardElement(item, i));
        });
    } catch (e) {
        console.error("Failed to load favorites:", e);
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;">Error loading favorites.</div>';
    }
};

const MOCK_TMDB_DATA = [
    {
        title: "Dune: Part Two",
        year: "2024",
        rating: "8.3",
        genres: "Sci-Fi, Adventure",
        poster: "dune_poster.png",
        overview: "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family."
    },
    {
        title: "Oppenheimer",
        year: "2023",
        rating: "8.1",
        genres: "Drama, History",
        poster: "oppenheimer_poster.png",
        overview: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II."
    },
    {
        title: "Interstellar",
        year: "2014",
        rating: "8.4",
        genres: "Sci-Fi, Drama",
        poster: "dune_poster.png",
        overview: "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel."
    },
    {
        title: "The Dark Knight",
        year: "2008",
        rating: "8.6",
        genres: "Action, Crime, Drama",
        poster: "oppenheimer_poster.png",
        overview: "When the menace known as the Joker wreaks havoc and chaos on Gotham, Batman must accept one of the greatest psychological and physical tests."
    }
];

window.renderTMDB = async function(query = '') {
    const grid = el('tmdb-results-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;"><div class="spinner" style="margin: 0 auto 12px;"></div>Searching TMDB...</div>';

    try {
        const response = await window.electronAPI.searchTMDB(query);
        grid.innerHTML = '';
        
        if (!response || !response.success) {
            const errMsg = response ? response.error : 'Unknown error';
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                   <svg viewBox="0 0 24 24" fill="none" stroke="var(--vault-signal-alert, #FF6B7A)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px;">
                      <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                   </svg>
                   <h3>TMDB Request Failed</h3>
                   <p>${window.escapeHtml(errMsg)}</p>
                </div>
            `;
            return;
        }

        const results = response.results || [];
        if (results.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--vault-accent);">
                      <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                   </svg>
                   <h3>No TMDB Results Found</h3>
                   <p>We couldn't find any movies matching "${window.escapeHtml(query)}" in our TMDB database.</p>
                </div>
            `;
            return;
        }

        results.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'file-card tmdb-movie-card';
            card.style.cursor = 'default';
            card.style.background = 'var(--vault-warm-card)';
            card.style.border = '1px solid var(--vault-border)';
            card.style.borderRadius = '6px';
            card.style.overflow = 'hidden';
            card.style.transition = 'transform 0.2s, box-shadow 0.2s';
            
            card.innerHTML = `
                <div class="thumbnail-container" style="position:relative; background:#111; height: 180px; width: 100%;">
                   <button onclick="event.stopPropagation(); window.triggerRDStream(\`${window.escapeHtml(movie.title)}\`, ${movie.id}, \`${movie.media_type}\`)" style="position: absolute; top: 8px; left: 8px; border: none; background: rgba(0,0,0,0.75); color: var(--vault-gold); font-family: var(--font-sans); font-size: 9.5px; font-weight: 800; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px; z-index: 10; border: 1px solid var(--vault-gold); transition: all 0.2s; letter-spacing:0.05em;" title="Stream via Real-Debrid">
                      ⚡ STREAM
                   </button>
                   <img class="thumbnail" src="${movie.poster}" alt="${window.escapeHtml(movie.title)}" style="object-fit: cover; width:100%; height:100%; transition: opacity 0.25s ease;" onerror="this.src='oppenheimer_poster.png'">
                   <div class="size-badge" style="background:var(--vault-accent); color:var(--vt-primary); font-weight:700; position:absolute; bottom: 8px; right: 8px; font-size:10px; padding: 2px 6px; border-radius: 4px;">★ ${movie.rating}</div>
                </div>
                <div class="filename-container" style="padding:12px; text-align:left;">
                   <div style="font-weight:700; font-size:13px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-mono);">${window.escapeHtml(movie.title)}</div>
                   <div style="font-size:10px; color:var(--vault-slate); margin-top:2px; font-weight:500;">${movie.year} • ${window.escapeHtml(movie.genres)}</div>
                   <div style="font-size:11px; color:#bbb; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-family:var(--font-body);">${window.escapeHtml(movie.overview)}</div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("TMDB search error:", e);
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;">Error loading TMDB results.</div>';
    }
};

window.triggerRDStream = async function(movieTitle, tmdbId = null, mediaType = 'movie') {
    const dialog = el('rd-stream-dialog');
    const loadingStatus = el('rd-loading-status');
    const statusText = el('rd-status-text');
    const torrentsList = el('rd-torrents-list');
    
    if (!dialog || !loadingStatus || !statusText || !torrentsList) return;
    
    // Reset view state
    dialog.style.display = 'flex';
    loadingStatus.style.display = 'block';
    torrentsList.style.display = 'none';
    torrentsList.innerHTML = '';
    
    statusText.innerHTML = `🔍 Scraping Torrentio index for:<br><strong>${window.escapeHtml(movieTitle)}</strong>...`;
    
    try {
        const response = await window.electronAPI.searchTorrents({ movieTitle, tmdbId, mediaType });
        if (!response || !response.success || !response.torrents || response.torrents.length === 0) {
            loadingStatus.querySelector('.spinner').style.display = 'none';
            statusText.innerHTML = `❌ No torrent sources found for:<br><strong>${window.escapeHtml(movieTitle)}</strong>.`;
            return;
        }
        
        // Hide loading, show torrents
        loadingStatus.style.display = 'none';
        torrentsList.style.display = 'flex';
        
        const header = document.createElement('div');
        header.style.cssText = 'font-weight: 700; font-size: 13px; color: #fff; margin-bottom: 10px; font-family: var(--font-mono);';
        header.innerHTML = `Available streams for "${window.escapeHtml(response.title)}":`;
        torrentsList.appendChild(header);
        
        response.torrents.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'ctrl-btn-sm';
            btn.style.cssText = 'background: var(--vault-warm-card, #252535); border: 1px solid var(--vault-border); border-radius: 6px; padding: 12px; color: var(--vault-text); font-family: var(--font-sans); text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: all 0.2s; width: 100%;';
            
            btn.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <strong style="color: var(--vault-accent); font-family: var(--font-mono); font-size: 11px;">Quality: ${t.quality} (${t.type.toUpperCase()})</strong>
                    <span style="font-size: 9.5px; color: var(--vault-slate); font-weight: 600;">📁 ${t.size}</span>
                </div>
                <div style="font-size: 10px; color: var(--vault-text, #eee); text-align: left; margin: 4px 0; font-weight: 500; font-family: var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${window.escapeHtml(t.desc || '')}</div>
                <div style="display: flex; gap: 15px; font-size: 9px; color: var(--vault-slate);">
                    <span>🟢 Seeds: ${t.seeds}</span>
                    <span>🔴 Peers: ${t.peers}</span>
                </div>
            `;
            
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = 'var(--vault-gold)';
                btn.style.background = 'rgba(245,185,41,0.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'var(--vault-border)';
                btn.style.background = 'var(--vault-warm-card, #252535)';
            });
            
            btn.addEventListener('click', () => {
                window.startRDDebridFlow(t, response.title);
            });
            
            torrentsList.appendChild(btn);
        });
    } catch (e) {
        console.error('Error fetching torrents:', e);
        loadingStatus.querySelector('.spinner').style.display = 'none';
        statusText.innerText = 'Error scraping torrent index.';
    }
};

window.startRDDebridFlow = async function(torrent, movieTitle) {
    const loadingStatus = el('rd-loading-status');
    const statusText = el('rd-status-text');
    const torrentsList = el('rd-torrents-list');
    
    torrentsList.style.display = 'none';
    loadingStatus.style.display = 'block';
    loadingStatus.querySelector('.spinner').style.display = 'block';
    statusText.innerHTML = `⚡ Unrestricting cached torrent on Real-Debrid servers...<br><span style="font-size:10px; color:var(--vault-slate);">Checking availability & generating direct stream link</span>`;
    
    try {
        const response = await window.electronAPI.streamRDTorrent({ magnet: torrent.magnet, hash: torrent.hash });
        if (!response || !response.success) {
            loadingStatus.querySelector('.spinner').style.display = 'none';
            const errMsg = response ? response.error : 'Failed to unrestrict torrent.';
            statusText.innerHTML = `❌ Real-Debrid Error:<br><strong style="color:var(--vault-signal-alert, #FF6B7A); font-size:11px;">${window.escapeHtml(errMsg)}</strong>`;
            
            const retryBtn = document.createElement('button');
            retryBtn.innerText = 'Back to Streams';
            retryBtn.style.cssText = 'margin-top: 15px; background: var(--vault-accent); color: var(--vt-primary); border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;';
            retryBtn.addEventListener('click', () => {
                loadingStatus.style.display = 'none';
                torrentsList.style.display = 'flex';
            });
            statusText.appendChild(document.createElement('br'));
            statusText.appendChild(retryBtn);
            return;
        }
        
        // Hide modal & Play
        el('rd-stream-dialog').style.display = 'none';
        window.playStream(response.streamUrl, movieTitle);
        window.showToast('Direct high-speed RD stream loaded successfully!', 'success');
    } catch (e) {
        console.error('Real-Debrid streaming workflow failed:', e);
        loadingStatus.querySelector('.spinner').style.display = 'none';
        statusText.innerText = 'Fatal workflow error occurred.';
    }
};
