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

window.initTabListeners = function() {
    console.log('[tabs] Initializing top navigation tab click listeners...');
    const tabVault = el('tab-vault');
    const tabFavorites = el('tab-favorites');
    const tabTmdb = el('tab-tmdb');
    const tabLivestream = el('tab-livestream');

    if (tabVault) tabVault.addEventListener('click', () => window.switchTab('vault'));
    if (tabFavorites) tabFavorites.addEventListener('click', () => window.switchTab('favorites'));
    if (tabTmdb) tabTmdb.addEventListener('click', () => window.switchTab('tmdb'));
    if (tabLivestream) tabLivestream.addEventListener('click', () => window.switchTab('livestream'));
};

