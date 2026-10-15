/* ==========================================================================
   Vault Explorer — Navigation Tabs Routing
   ========================================================================== */

window.currentTab = 'files';

window.switchTab = function (tabName, options = {}) {
    const { deferFolderLoad = false, preservePlayer = false } = options;
    if (tabName === 'vault') tabName = 'files';

    // Close the full-screen photo editor if open — otherwise the tab switch
    // happens invisibly behind it and looks like the tabs are dead.
    const peModal = el('photo-editor-modal');
    if (peModal && peModal.style.display === 'flex') peModal.style.display = 'none';

    window.currentTab = tabName;

    // --- FORCE CLEANUP OF ACTIVE MEDIA PROCESSES & SOUNDS ---
    const vm = el('video-modal');
    const isMinimized = vm && vm.classList.contains('minimized');

    if (!isMinimized && !preservePlayer) {
        const vp = el('video-player');
        if (vp) {
            try { vp.pause(); } catch (e) { }
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
        'tab-photoalbums-active', 'tab-debrids-active'
    );
    document.body.classList.add(`tab-${tabName}-active`);

    // Toggle active state on tabs
    const tabIds = ['files', 'music', 'photoalbums', 'debrids'];
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
        'debrids': ['debrids-container'],
    };

    // Hide all known content containers first
    const allContainerIds = [
        'file-grid', 'favorites-grid', 'playlist-view-container',
        'audio-container', 'albums-container', 'debrids-container',
    ];
    allContainerIds.forEach(id => {
        const el_ = el(id);
        if (el_) el_.style.display = 'none';
    });

    const toolbar = document.querySelector('.toolbar');
    const subNavBar = el('sub-nav-bar');
    const subNavFiles = el('sub-nav-files');

    // Sub-nav visibility
    if (subNavBar) {
        if (tabName === 'files') {
            subNavBar.style.display = 'flex';
            if (subNavFiles) subNavFiles.style.display = 'flex';
        } else {
            subNavBar.style.display = 'none';
        }
    }

    if (toolbar) toolbar.style.display = (tabName === 'files') ? 'flex' : 'none';

    // Default subtab
    if (!window.currentFilesSubtab) window.currentFilesSubtab = 'all';

    // Show relevant container(s)
    if (tabName === 'files') {
        if (window.currentFilesSubtab === 'favorites') {
            const favGrid = el('favorites-grid');
            if (favGrid) favGrid.style.display = 'grid';
            if (typeof window.renderFavorites === 'function') window.renderFavorites();
        } else {
            const fileGrid = el('file-grid');
            if (fileGrid) fileGrid.style.display = 'grid';
            if (!window.vaultLoaded && !deferFolderLoad) {
                window.vaultLoaded = true;
                console.log('[Lazy Load] First time entering Files Tab, performing directory load...');
                // Ignore a lastPath that points at another tab's default folder —
                // older builds saved lastPath from Music/Photos loads, which
                // booted the Videos tab into e.g. the music folder (looked empty).
                const s = window.appSettings || {};
                const otherTabFolders = [s.defaultFolderAudio, s.defaultFolderAlbums, s.defaultFolderDebrids].filter(Boolean);
                const lp = s.lastPath && s.lastPath.realPath && !otherTabFolders.includes(s.lastPath.realPath)
                    ? s.lastPath : null;
                if (lp) {
                    window.loadDirectory(lp.navPath, lp.realPath, true, lp.folderId);
                } else if (window.appSettings.defaultFolder) {
                    window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, true);
                } else {
                    window.loadDirectory('root', '', true);
                }
            } else {
                window.applyFilters();
            }
        }
    } else {
        const ids = containers[tabName] || [];
        ids.forEach(id => {
            const el_ = el(id);
            if (el_) el_.style.display = 'block';
        });

        const renderTabContent = () => {
            if (tabName === 'music' && typeof window.renderAudio === 'function') window.renderAudio();
            if (tabName === 'photoalbums' && typeof window.renderAlbums === 'function') window.renderAlbums();
            if (tabName === 'debrids' && typeof window.renderDebrids === 'function') window.renderDebrids();
        };

        // Load this tab's default folder on switch, THEN render.
        const folder = (['music', 'photoalbums'].includes(tabName) && typeof window.getTabDefaultFolder === 'function')
            ? window.getTabDefaultFolder(tabName) : null;
        if (folder && window.loadDirectory && window.currentRealPath !== folder) {
            const navName = folder.split(/[\\/]/).pop() || 'root';
            Promise.resolve(window.loadDirectory('root/' + navName, folder, true)).then(renderTabContent);
        } else {
            renderTabContent();
        }
    }
};

window.switchFilesSubtab = function (subtab) {
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
        window.currentFolderId = null;
        window.currentNavPath = 'root';
        if (typeof el === 'function') {
            const pd = el('path-display');
            if (pd) pd.innerText = (typeof window.getDisplayPath === 'function') ? window.getDisplayPath('root') : 'root';
            const bb = el('btn-back');
            if (bb) { bb.style.display = 'none'; bb.disabled = true; }
            const ld = el('loading');
            if (ld) ld.style.display = 'none';
        }

        if (window._rootItemsCache && window._rootItemsCache.length > 0) {
            window.allItems = window._rootItemsCache;
        }
        if (typeof window.applyFilters === 'function') {
            window.applyFilters();
        }
    }
};

window.initTabListeners = function () {
    console.log('[tabs] Initializing top navigation tab click listeners...');

    // IDs must match the actual tab buttons in index.html (tab-files, tab-music,
    // tab-photoalbums). This list previously used legacy names
    // ('photos','audio','albums','playlists'), so the Music and Photos buttons
    // never received click listeners — the "tabs don't work" bug.
    const tabIds = ['files', 'music', 'photoalbums', 'debrids'];
    tabIds.forEach(name => {
        const btn = el(`tab-${name}`);
        if (btn) btn.addEventListener('click', () => window.switchTab(name));
    });

    // Files subtab listeners
    const subtabAll = el('subtab-files-all');
    const subtabColls = el('subtab-files-collections');
    const subtabFavs = el('subtab-files-favorites');
    if (subtabAll) subtabAll.addEventListener('click', () => window.switchFilesSubtab('all'));
    if (subtabColls) subtabColls.addEventListener('click', () => window.switchFilesSubtab('collections'));
    if (subtabFavs) subtabFavs.addEventListener('click', () => window.switchFilesSubtab('favorites'));

    // Audio bottom bar close
    const audioBarClose = el('audio-bar-close');
    if (audioBarClose) {
        audioBarClose.addEventListener('click', () => {
            const bar = el('audio-bottom-bar');
            if (bar) bar.style.display = 'none';
        });
    }
};
