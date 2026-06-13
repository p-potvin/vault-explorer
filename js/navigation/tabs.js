/* ==========================================================================
   Vault Explorer — Navigation Tabs Routing
   ========================================================================== */

window.currentTab = 'vault';

window.switchTab = function(tabName) {
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
    
    // Toggle active state on tabs
    const tabs = {
        'vault': el('tab-vault'),
        'streaming': el('tab-streaming'),
        'livestream': el('tab-livestream')
    };
    
    Object.keys(tabs).forEach(name => {
        const btn = tabs[name];
        if (!btn) return;
        if (name === tabName) {
            btn.classList.add('active');
            btn.style.background = 'var(--vault-accent)';
            btn.style.color = 'var(--vt-primary)';
            btn.style.border = '1px solid transparent';
            btn.style.padding = '4.5px 10px';
            btn.style.opacity = '1';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vault-text)';
            btn.style.border = '1px solid var(--vault-border)';
            btn.style.padding = '4.5px 10px';
            btn.style.opacity = '0.8';
        }
    });

    // Toggle view elements
    const fileGrid = el('file-grid');
    const favGrid = el('favorites-grid');
    const libGrid = el('library-grid');
    const tmdbContainer = el('tmdb-container');
    const livestreamContainer = el('livestream-container');
    const toolbar = document.querySelector('.toolbar');
    const subNavBar = el('sub-nav-bar');
    const subNavVault = el('sub-nav-vault');
    const subNavStreaming = el('sub-nav-streaming');

    // Toggle sub-nav visibility
    if (subNavBar) {
        if (tabName === 'vault' || tabName === 'streaming') {
            subNavBar.style.display = 'flex';
            if (subNavVault) subNavVault.style.display = (tabName === 'vault') ? 'flex' : 'none';
            if (subNavStreaming) subNavStreaming.style.display = (tabName === 'streaming') ? 'flex' : 'none';
        } else {
            subNavBar.style.display = 'none';
        }
    }
    
    // Default subtabs if not set
    if (!window.currentVaultSubtab) window.currentVaultSubtab = 'all';
    if (!window.currentStreamingSubtab) window.currentStreamingSubtab = 'discover';

    // Hide everything first
    if (fileGrid) fileGrid.style.display = 'none';
    if (favGrid) favGrid.style.display = 'none';
    if (libGrid) libGrid.style.display = 'none';
    if (tmdbContainer) tmdbContainer.style.display = 'none';
    if (livestreamContainer) livestreamContainer.style.display = 'none';

    // Show according to current tab and its active subtab
    if (tabName === 'vault') {
        if (toolbar) toolbar.style.display = 'flex';
        
        if (window.currentVaultSubtab === 'favorites') {
            if (favGrid) favGrid.style.display = 'grid';
            window.renderFavorites();
        } else {
            if (fileGrid) fileGrid.style.display = 'grid';
            if (!window.vaultLoaded) {
                window.vaultLoaded = true;
                console.log('[Lazy Load] First time entering Vault Tab, performing directory load...');
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
        if (toolbar) toolbar.style.display = 'none'; // TMDB/Streaming handles its own search/categories or we hide standard toolbar
        
        if (window.currentStreamingSubtab === 'discover') {
            if (tmdbContainer) tmdbContainer.style.display = 'block';
            window.renderTMDB();
        } else if (window.currentStreamingSubtab === 'library') {
            if (libGrid) libGrid.style.display = 'grid';
            if (typeof window.renderLibrary === 'function') {
                window.renderLibrary();
            }
        }
    } else if (tabName === 'livestream') {
        if (toolbar) toolbar.style.display = 'none';
        if (livestreamContainer) livestreamContainer.style.display = 'block';
    }
};

window.switchVaultSubtab = function(subtab) {
    window.currentVaultSubtab = subtab;
    
    // Update pills styling
    const pills = document.querySelectorAll('#sub-nav-vault .sub-nav-pill');
    pills.forEach(pill => {
        const id = pill.id;
        const targetId = `subtab-vault-${subtab}`;
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

    // Show/hide the appropriate grid for the subtab
    const fileGrid = el('file-grid');
    const favGrid = el('favorites-grid');
    if (fileGrid) fileGrid.style.display = (subtab === 'favorites') ? 'none' : 'grid';
    if (favGrid) favGrid.style.display = (subtab === 'favorites') ? 'grid' : 'none';

    // Render favorites content when switching to favorites subtab
    if (subtab === 'favorites' && typeof window.renderFavorites === 'function') {
        window.renderFavorites();
    }

    // Clear search filter when switching virtual/subtabs
    const sb = el('search-box');
    if (sb) sb.value = '';
    const cb = el('search-clear-btn');
    if (cb) cb.style.display = 'none';

    // Toggle visibility of playlist view toggle button based on subtab
    const plToggle = el('btn-playlist-view-toggle');
    if (plToggle) {
        plToggle.style.display = (subtab === 'playlists') ? 'inline-flex' : 'none';
    }

    // Deactivate playlist view when switching to any other subtab
    if (subtab !== 'playlists' && window.playlistViewActive) {
        if (typeof window.togglePlaylistView === 'function') {
            window.togglePlaylistView(false);
        }
    }

    // Reset navigation path to root when switching subtabs (except favorites which has its own rendering)
    if (subtab !== 'favorites') {
        if (typeof window.navigateTo === 'function') {
            window.navigateTo('root', window.currentRealPath);
        } else {
            window.switchTab('vault');
        }
    }
};

window.switchStreamingSubtab = function(subtab) {
    window.currentStreamingSubtab = subtab;

    // Update pills styling
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

    // Reload layout
    window.switchTab('streaming');
};

window.initTabListeners = function() {
    console.log('[tabs] Initializing top navigation tab click listeners...');
    const tabVault = el('tab-vault');
    const tabStreaming = el('tab-streaming');
    const tabLivestream = el('tab-livestream');

    if (tabVault) tabVault.addEventListener('click', () => window.switchTab('vault'));
    if (tabStreaming) tabStreaming.addEventListener('click', () => window.switchTab('streaming'));
    if (tabLivestream) tabLivestream.addEventListener('click', () => window.switchTab('livestream'));

    // Subtab event listeners
    const subtabAll = el('subtab-vault-all');
    const subtabFavs = el('subtab-vault-favorites');
    const subtabColls = el('subtab-vault-collections');
    const subtabAlbs = el('subtab-vault-albums');
    const subtabPls = el('subtab-vault-playlists');

    if (subtabAll) subtabAll.addEventListener('click', () => window.switchVaultSubtab('all'));
    if (subtabFavs) subtabFavs.addEventListener('click', () => window.switchVaultSubtab('favorites'));
    if (subtabColls) subtabColls.addEventListener('click', () => window.switchVaultSubtab('collections'));
    if (subtabAlbs) subtabAlbs.addEventListener('click', () => window.switchVaultSubtab('albums'));
    if (subtabPls) subtabPls.addEventListener('click', () => window.switchVaultSubtab('playlists'));

    const subtabDisc = el('subtab-streaming-discover');
    const subtabLib = el('subtab-streaming-library');

    if (subtabDisc) subtabDisc.addEventListener('click', () => window.switchStreamingSubtab('discover'));
    if (subtabLib) subtabLib.addEventListener('click', () => window.switchStreamingSubtab('library'));
};

