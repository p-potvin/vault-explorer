/* ==========================================================================
   Vault Explorer — Navigation Tabs Routing
   ========================================================================== */

window.currentTab = 'files';

window.switchTab = function(tabName) {
    if (tabName === 'vault') tabName = 'files';
    window.currentTab = tabName;

    if (tabName === 'livestream') {
        if (window.loadLivestreamSettingsOnce) window.loadLivestreamSettingsOnce();
    }

    // --- FORCE CLEANUP OF ACTIVE MEDIA PROCESSES & SOUNDS ---
    const vm = el('video-modal');
    const isMinimized = vm && vm.classList.contains('minimized');

    if (!isMinimized) {
        const vp = el('video-player');
        if (vp) {
            try { vp.pause(); } catch(e) {}
        }
        if (vm) {
            vm.style.display = 'none';
        }
        if (window.autoplayTimer) {
            clearInterval(window.autoplayTimer);
            window.autoplayTimer = null;
        }
        const endedOverlay = el('video-ended-overlay');
        if (endedOverlay) endedOverlay.style.display = 'none';
        const tbTitle = el('titlebar-video-title');
        if (tbTitle) tbTitle.style.display = 'none';
    }

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

    // --- AUDIO BOTTOM BAR VISIBILITY ---
    const audioBar = el('audio-bottom-bar');
    if (audioBar) {
        // Audio bar stays open unless video player is active
        const videoModal = el('video-modal');
        const isVideoOpen = videoModal && videoModal.style.display !== 'none' && !videoModal.classList.contains('minimized');
        if (isVideoOpen) {
            audioBar.style.display = 'none';
        }
        // Otherwise it keeps its current open/closed state
    }

    // Mark the active tab on <body> so CSS can scope tab-specific layout
    document.body.classList.remove(
        'tab-files-active', 'tab-music-active',
        'tab-photoalbums-active', 'tab-streaming-active',
        'tab-livestream-active', 'tab-misc-active'
    );
    document.body.classList.add(`tab-${tabName}-active`);

    // Toggle active state on tabs
    const tabIds = ['files','music','photoalbums','misc','streaming','livestream'];
    tabIds.forEach(name => {
        const btn = el(`tab-${name}`);
        if (!btn) return;
        if (name === tabName) {
            btn.classList.add('active');
            btn.style.background = 'var(--vault-accent)';
            btn.style.color = 'var(--vt-primary)';
            btn.style.border = '1px solid transparent';
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vault-text)';
            btn.style.border = '1px solid var(--vault-border)';
            btn.style.opacity = '0.8';
        }
    });

    // --- SHOW/HIDE CONTAINERS ---
    const containers = {
        'files': ['file-grid', 'favorites-grid'],
        'music': ['audio-container'],
        'photoalbums': ['albums-container'],
        'streaming': ['tmdb-container', 'library-grid'],
        'livestream': ['livestream-container'],
        'misc': ['misc-container']
    };

    // Hide all known content containers first
    const allContainerIds = [
        'file-grid','favorites-grid','playlist-view-container',
        'library-grid','tmdb-container','livestream-container',
        'audio-container','albums-container',
        'misc-container'
    ];
    allContainerIds.forEach(id => {
        const el_ = el(id);
        if (el_) el_.style.display = 'none';
    });

    const toolbar = document.querySelector('.toolbar');
    const subNavBar = el('sub-nav-bar');
    const subNavFiles = el('sub-nav-files');
    const subNavStreaming = el('sub-nav-streaming');

    // Sub-nav visibility
    if (subNavBar) {
        if (tabName === 'files' || tabName === 'streaming') {
            subNavBar.style.display = 'flex';
            if (subNavFiles) subNavFiles.style.display = (tabName === 'files') ? 'flex' : 'none';
            if (subNavStreaming) subNavStreaming.style.display = (tabName === 'streaming') ? 'flex' : 'none';
        } else {
            subNavBar.style.display = 'none';
        }
    }

    if (toolbar) toolbar.style.display = (tabName === 'files') ? 'flex' : 'none';

    // Default subtabs
    if (!window.currentFilesSubtab) window.currentFilesSubtab = 'all';
    if (!window.currentStreamingSubtab) window.currentStreamingSubtab = 'discover';

    // Show relevant container(s)
    if (tabName === 'files') {
        if (window.currentFilesSubtab === 'favorites') {
            const favGrid = el('favorites-grid');
            if (favGrid) favGrid.style.display = 'grid';
            if (typeof window.renderFavorites === 'function') window.renderFavorites();
        } else {
            const fileGrid = el('file-grid');
            if (fileGrid) fileGrid.style.display = 'grid';
            if (!window.vaultLoaded) {
                window.vaultLoaded = true;
                console.log('[Lazy Load] First time entering Files Tab, performing directory load...');
                if (window.appSettings.lastPath && window.appSettings.lastPath.realPath) {
                    window.loadDirectory(window.appSettings.lastPath.navPath, window.appSettings.lastPath.realPath, true);
                } else if (window.appSettings.defaultFolder) {
                    window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, true);
                } else {
                    window.loadDirectory('root', '', true);
                }
            } else {
                window.applyFilters();
            }
        }
    } else if (tabName === 'streaming') {
        if (window.currentStreamingSubtab === 'discover') {
            const tmdbContainer = el('tmdb-container');
            if (tmdbContainer) tmdbContainer.style.display = 'block';
            if (typeof window.renderTMDB === 'function') window.renderTMDB();
        } else if (window.currentStreamingSubtab === 'library') {
            const libGrid = el('library-grid');
            if (libGrid) libGrid.style.display = 'grid';
            if (typeof window.renderLibrary === 'function') window.renderLibrary();
        }
    } else {
        const ids = containers[tabName] || [];
        ids.forEach(id => {
            const el_ = el(id);
            if (el_) el_.style.display = (id === 'tmdb-container' || id === 'audio-container') ? 'block' : 'grid';
        });

        // Load per-tab default folder on switch (music, photoalbums, misc). Falls back to the global vault folder.
        if (['music', 'photoalbums', 'misc'].includes(tabName)) {
            const folder = typeof window.getTabDefaultFolder === 'function' ? window.getTabDefaultFolder(tabName) : null;
            if (folder && window.loadDirectory && window.currentRealPath !== folder) {
                const navName = folder.split(/[\\/]/).pop() || 'root';
                window.loadDirectory('root/' + navName, folder, true);
            }
        }

        if (tabName === 'music' && typeof window.renderAudio === 'function') window.renderAudio();
        if (tabName === 'photoalbums' && typeof window.renderAlbums === 'function') window.renderAlbums();
        if (tabName === 'misc' && typeof window.renderMisc === 'function') window.renderMisc();
    }
};

window.switchFilesSubtab = function(subtab) {
    window.currentFilesSubtab = subtab;

    const pills = document.querySelectorAll('#sub-nav-files .sub-nav-pill');
    pills.forEach(pill => {
        const id = pill.id;
        const targetId = `subtab-files-${subtab}`;
        if (id === targetId) {
            pill.classList.add('active');
            pill.style.background = 'var(--vault-accent)';
            pill.style.color = 'var(--vt-primary)';
            pill.style.border = 'none';
            pill.style.opacity = '1';
        } else {
            pill.classList.remove('active');
            pill.style.background = 'transparent';
            pill.style.color = 'var(--vault-text)';
            pill.style.border = '1px solid var(--vault-border)';
            pill.style.opacity = '0.8';
        }
    });

    const fileGrid = el('file-grid');
    const favGrid = el('favorites-grid');
    if (fileGrid) fileGrid.style.display = (subtab === 'favorites') ? 'none' : 'grid';
    if (favGrid) favGrid.style.display = (subtab === 'favorites') ? 'grid' : 'none';

    if (subtab === 'favorites' && typeof window.renderFavorites === 'function') {
        window.renderFavorites();
    }

    const sb = el('search-box');
    if (sb) sb.value = '';
    const cb = el('search-clear-btn');
    if (cb) cb.style.display = 'none';

    if (subtab !== 'favorites') {
        if (typeof window.navigateTo === 'function') {
            window.navigateTo('root', window.currentRealPath);
        }
    }
};

window.switchStreamingSubtab = function(subtab) {
    window.currentStreamingSubtab = subtab;

    const pills = document.querySelectorAll('#sub-nav-streaming .sub-nav-pill');
    pills.forEach(pill => {
        const id = pill.id;
        const targetId = `subtab-streaming-${subtab}`;
        if (id === targetId) {
            pill.classList.add('active');
            pill.style.background = 'var(--vault-accent)';
            pill.style.color = 'var(--vt-primary)';
            pill.style.border = 'none';
            pill.style.opacity = '1';
        } else {
            pill.classList.remove('active');
            pill.style.background = 'transparent';
            pill.style.color = 'var(--vault-text)';
            pill.style.border = '1px solid var(--vault-border)';
            pill.style.opacity = '0.8';
        }
    });

    window.switchTab('streaming');
};

window.initTabListeners = function() {
    console.log('[tabs] Initializing top navigation tab click listeners...');

    const tabIds = ['files','photos','audio','albums','playlists','streaming','livestream','misc'];
    tabIds.forEach(name => {
        const btn = el(`tab-${name}`);
        if (btn) btn.addEventListener('click', () => window.switchTab(name));
    });

    // Files subtab listeners
    const subtabAll = el('subtab-files-all');
    const subtabColls = el('subtab-files-collections');
    if (subtabAll) subtabAll.addEventListener('click', () => window.switchFilesSubtab('all'));
    if (subtabColls) subtabColls.addEventListener('click', () => window.switchFilesSubtab('collections'));

    // Streaming subtab listeners
    const subtabDisc = el('subtab-streaming-discover');
    const subtabLib = el('subtab-streaming-library');
    if (subtabDisc) subtabDisc.addEventListener('click', () => window.switchStreamingSubtab('discover'));
    if (subtabLib) subtabLib.addEventListener('click', () => window.switchStreamingSubtab('library'));

    // Audio bottom bar close
    const audioBarClose = el('audio-bar-close');
    if (audioBarClose) {
        audioBarClose.addEventListener('click', () => {
            const bar = el('audio-bottom-bar');
            if (bar) bar.style.display = 'none';
        });
    }
};

