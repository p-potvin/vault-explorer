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

    // Initialize player, settings, tab clicks, navigation keybindings, TMDB search and livestream components
    window.initPlayer();
    window.initSettingsListeners();
    window.initTabListeners();
    window.initNavigationListeners();
    window.initTMDBListeners();
    window.initLivestreamListeners();

    // ── WebM Real-time Progress Tracking ─────────────────────────────────────
    window.electronAPI.onWebmProgress((data) => {
        if (!data || !data.videoPath) return;
        const { videoPath, percent } = data;
        
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

    // Focus Lost (Window Blur) -> Pause hover webms cleanly
    window.addEventListener('blur', () => {
         console.log('[window] Blur focus lost: pausing previews.');
         if (window.killAllHoverVideos) {
             window.killAllHoverVideos();
         }
         document.querySelectorAll('.file-card').forEach(card => {
             const mainImg = card.querySelector('.thumbnail');
             if (mainImg) mainImg.style.display = 'block';
         });
    });

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
