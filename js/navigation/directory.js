// directory.js — handles scanning, loading directory, managing breadcrumbs/back stacks, and directory selection/refresh listeners.

function displayFolderSize(bytes) {
    if (!bytes) {
        el('status-size').innerText = '';
        return;
    }
    const label = window.translations[window.currentLang].folderSize || 'Folder Size (Everything):';
    const formatted = window.formatBytes(bytes);
    el('status-size').innerText = `${label} ${formatted}`;
}

async function updateStatusBar() {
    if (window.currentTab === 'tmdb') {
        const resultsCount = el('tmdb-results-grid') ? el('tmdb-results-grid').querySelectorAll('.tmdb-movie-card').length : 0;
        el('status-items').innerText = `${resultsCount} items`;
        el('status-selected').innerText = '';
        el('status-size').innerText = '';
        return;
    }
    
    if (window.currentTab === 'livestream') {
        el('status-items').innerText = '';
        el('status-selected').innerText = '';
        el('status-size').innerText = '';
        return;
    }

    el('status-items').innerText = `${window.displayedItems.length} items`;
    if (window.selectedIndices.size > 0) {
        let size = 0;
        window.selectedIndices.forEach(idx => {
            const itm = window.displayedItems[idx];
            if (itm) {
                size += (itm.size || 0);
            }
        });
        el('status-selected').innerText = `${window.selectedIndices.size} selected (${window.formatBytes(size)})`;
    } else {
        el('status-selected').innerText = '';
    }

    if (window.currentTab === 'vault' && window.allItems && window.allItems.length > 0) {
        const totalSize = window.allItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else if (window.currentTab === 'favorites' && window.displayedItems && window.displayedItems.length > 0) {
        const totalSize = window.displayedItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else {
        el('status-size').innerText = '';
    }
}

async function loadDirectory(navPath, realPath, useCache = false) {
    if (!realPath) return;
    window.currentNavPath = navPath; window.currentRealPath = realPath;
    el('path-display').innerText = navPath === 'root' ? realPath : navPath;

    if (el('btn-new-folder')) el('btn-new-folder').disabled = false;
    if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
    el('btn-refresh').disabled = false;
    el('btn-refresh').title = "Refresh directory";
    el('btn-back').disabled = true;
    el('btn-back').title = "Already at root vault level";

    window.appSettings.lastPath = { navPath, realPath };
    window.electronAPI.saveSettings(window.appSettings);

    el('loading').style.display = 'flex';
    
    // Setup a loading bypass safety timeout (appears if scanning takes > 1.5s)
    const bypassBtn = el('btn-bypass-loading');
    let bypassTimeout = null;
    if (bypassBtn) {
        bypassBtn.style.display = 'none';
        bypassTimeout = setTimeout(() => {
            bypassBtn.style.display = 'inline-block';
        }, 1500);
    }

    try {
        if (!useCache) window.allItems = await window.electronAPI.scanDirectory(realPath);
    } catch (err) {
        console.error('[loadDirectory] Directory scan failed:', err);
        window.allItems = [];
    } finally {
        if (bypassTimeout) clearTimeout(bypassTimeout);
        if (bypassBtn) bypassBtn.style.display = 'none';
        el('loading').style.display = 'none';
    }

    window.applyFilters();

    if (window.allItems && window.allItems.length > 0) {
        const totalSize = window.allItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);

        // Staggered background probing for missing video properties to build .meta.json sidecars
        const videosToProbe = window.allItems.filter(item => item.type === 'video' && !item.duration);
        if (videosToProbe.length > 0) {
            (async () => {
                for (const item of videosToProbe) {
                    try {
                        const res = await window.electronAPI.getFileProperties(item.path);
                        if (res && res.success && res.properties) {
                            item.duration = res.properties.duration || 0;
                            item.width = res.properties.width || null;
                            item.height = res.properties.height || null;
                            item.codec = res.properties.codec || null;
                            item.fps = res.properties.fps || null;
                            item.audioCodec = res.properties.audioCodec || null;
                            item.channels = res.properties.channels || null;
                            item.sampleRate = res.properties.sampleRate || null;
                            item.bitrate = res.properties.bitrate || null;
                            item.hasAudio = res.properties.hasAudio || null;
                            item.hasVideo = res.properties.hasVideo || null;
                            item.enhancements = res.properties.enhancements || null;
                            item.enhancedPath = res.properties.enhancedPath || null;
                            
                            const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                            const cardElement = Array.from(document.querySelectorAll('.file-card'))
                                .find(c => normPath(c.dataset.path) === normPath(item.path));
                            if (cardElement) {
                                const d = cardElement.querySelector('.duration-badge');
                                if (d && item.duration) {
                                    d.innerText = window.formatDuration(item.duration);
                                    d.style.display = 'block';
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[loadDirectory] Background probe failed:', e);
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            })();
        }
    } else {
        el('status-size').innerText = '';
    }

    setTimeout(() => {
        if (window.scrollPositions[window.currentNavPath]) {
            el('main-area').scrollTop = window.scrollPositions[window.currentNavPath];
        }
    }, 50);
}

async function navigateTo(navPath, realPath) {
    if (navPath === 'root') loadDirectory('root', realPath, false);
    else {
        window.currentNavPath = navPath; el('path-display').innerText = navPath;

        el('btn-back').disabled = false;
        el('btn-back').title = "Go back";
        if (el('btn-new-folder')) el('btn-new-folder').disabled = false;
        if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
        el('btn-refresh').disabled = true;
        el('btn-refresh').title = "Refresh unavailable in virtual folders";

        const targetFolder = window.getTargetFolder(navPath);
        if (targetFolder && targetFolder.items.length > 0) {
            el('loading').style.display = 'flex';
            window.allItems = await window.electronAPI.scanSpecificFiles(targetFolder.items);
            el('loading').style.display = 'none';
        } else {
            window.allItems = [];
        }
        window.applyFilters();
    }
}

function initNavigationListeners() {
    el('main-area').addEventListener('scroll', () => {
        if (window.currentTab && window.currentTab !== 'vault') {
            window.tabScrollPositions = window.tabScrollPositions || {};
            window.tabScrollPositions[window.currentTab] = el('main-area').scrollTop;
            return;
        }
        window.scrollPositions[window.currentNavPath] = el('main-area').scrollTop;
        window.appSettings.scrollPositions = window.scrollPositions;
        window.electronAPI.saveSettings(window.appSettings);

        if (el('main-area').scrollTop + el('main-area').clientHeight >= el('main-area').scrollHeight - 100) {
            if (window.currentlyRendered < window.displayedItems.length) window.renderMore();
        }
    });

    el('filter-type').addEventListener('change', window.applyFilters);
    el('sort-by').addEventListener('change', window.applyFilters);
    el('search-box').addEventListener('input', window.applyFilters);

    el('btn-sort-order').addEventListener('click', () => {
        const btn = el('btn-sort-order');
        const currentOrder = btn.dataset.order || 'desc';
        const nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
        btn.dataset.order = nextOrder;
        window.updateSortOrderButtonUI();
        window.applyFilters();
    });

    el('btn-back').addEventListener('click', () => {
        if (window.currentNavPath && window.currentNavPath !== 'root') {
            const parts = window.currentNavPath.split('/'); parts.pop(); navigateTo(parts.join('/'), window.currentRealPath);
        }
    });

    el('btn-refresh').addEventListener('click', async () => {
        if (!window.currentRealPath) return;
        el('loading-text').innerText = 'Refreshing Views...'; el('loading').style.display = 'flex';
        const latest = await window.electronAPI.scanDirectory(window.currentRealPath);
        el('loading').style.display = 'none'; el('loading-text').innerText = 'Scanning directory... this may take a moment.';

        let hasUpdates = false;
        const latestPaths = new Set(latest.map(i => i.path));
        
        // Remove files that no longer exist
        const oldLength = window.allItems.length;
        window.allItems = window.allItems.filter(item => latestPaths.has(item.path));
        if (window.allItems.length !== oldLength) {
            hasUpdates = true;
        }

        const existingPaths = new Set(window.allItems.map(i => i.path));
        latest.forEach(item => {
            if (!existingPaths.has(item.path)) { window.allItems.push(item); hasUpdates = true; }
            else {
                const exist = window.allItems.find(i => i.path === item.path);
                if (exist) {
                    if (exist.thumbnail !== item.thumbnail || exist.hoverWebm !== item.hoverWebm || exist.trickplayFolder !== item.trickplayFolder) {
                        exist.thumbnail = item.thumbnail;
                        exist.hoverWebm = item.hoverWebm;
                        exist.trickplayFolder = item.trickplayFolder;
                        hasUpdates = true;
                    }
                }
            }
        });

        if (hasUpdates) window.applyFilters();
        window.showToast('Views refreshed successfully', 'success');
    });

    el('btn-select').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.openDirectory();
        if (folderPath) { loadDirectory('root', folderPath, false); window.showToast('Vault loaded: ' + folderPath, 'success'); }
    });

    el('path-display').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.openDirectory();
        if (folderPath) { loadDirectory('root', folderPath, false); window.showToast('Vault loaded: ' + folderPath, 'success'); }
    });

    // drag selection box logic
    const area = el('main-area');
    const sbox = el('selection-box');
    let isDragging = false, startX, startY;

    area.addEventListener('mousedown', (e) => {
        if (window.currentTab !== 'vault') return;
        if (e.target.closest('.file-card') || e.target.closest('.toolbar') || e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true; const rect = area.getBoundingClientRect();
        startX = e.clientX - rect.left + area.scrollLeft; startY = e.clientY - rect.top + area.scrollTop;
        sbox.style.left = startX + 'px'; sbox.style.top = startY + 'px'; sbox.style.width = '0px'; sbox.style.height = '0px'; sbox.style.display = 'block';
        if (!e.ctrlKey && !e.shiftKey) {
            window.selectedIndices.clear();
            document.querySelectorAll('.file-card').forEach(c => { c.classList.remove('selected'); c.querySelector('.file-checkbox').checked = false; });
            updateStatusBar();
        }
    });
    area.addEventListener('mousemove', (e) => {
        if (!isDragging || window.currentTab !== 'vault') return;
        const rect = area.getBoundingClientRect();
        const curX = e.clientX - rect.left + area.scrollLeft; const curY = e.clientY - rect.top + area.scrollTop;
        const x = Math.min(startX, curX), y = Math.min(startY, curY), w = Math.abs(curX - startX), h = Math.abs(curY - startY);
        sbox.style.left = x + 'px'; sbox.style.top = y + 'px'; sbox.style.width = w + 'px'; sbox.style.height = h + 'px';

        document.querySelectorAll('.file-card').forEach(card => {
            const cr = card.getBoundingClientRect();
            const cardX = cr.left - rect.left + area.scrollLeft; const cardY = cr.top - rect.top + area.scrollTop;
            const intersects = !(cardX > x + w || cardX + cr.width < x || cardY > y + h || cardY + cr.height < y);
            const idx = parseInt(card.dataset.index);
            if (intersects) {
                window.selectedIndices.add(idx); card.classList.add('selected'); card.querySelector('.file-checkbox').checked = true;
            }
        });
        updateStatusBar();
    });
    window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; sbox.style.display = 'none'; } });

    // Background context menu
    area.addEventListener('contextmenu', async (e) => {
        if (e.target.closest('.file-card')) return;
        if (!window.currentRealPath) return;
        const hasClip = !!(window._clipboard && window._clipboard.paths.length > 0);
        const action = await window.electronAPI.showContextMenu({
            type: 'background', _hasClipboard: hasClip
        });
        if (action === 'paste') {
            if (!window._clipboard || window._clipboard.paths.length === 0) { window.showToast('Nothing to paste', 'error'); return; }
            const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: window.currentRealPath });
            if (res.success) {
                window.showToast(`Pasted ${res.count} file(s)`, 'success');
                if (window.currentNavPath !== 'root') {
                    const targetFolder = window.getTargetFolder(window.currentNavPath);
                    if (targetFolder && Array.isArray(res.pastedPaths)) {
                        res.pastedPaths.forEach(p => {
                            if (!targetFolder.items.includes(p)) targetFolder.items.push(p);
                        });
                        window.electronAPI.saveSettings(window.appSettings);
                    }
                }
                if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                if (window.currentNavPath !== 'root') {
                    navigateTo(window.currentNavPath, window.currentRealPath);
                } else {
                    loadDirectory(window.currentNavPath, window.currentRealPath, false);
                }
            } else { window.showToast('Paste failed: ' + res.error, 'error'); }
        } else if (action === 'bg-refresh') {
            loadDirectory(window.currentNavPath, window.currentRealPath, false);
        } else if (action === 'bg-select-all') {
            window.selectedIndices.clear();
            window.displayedItems.forEach((_, i) => window.selectedIndices.add(i));
            document.querySelectorAll('.file-card').forEach(c => { c.classList.add('selected'); c.querySelector('.file-checkbox').checked = true; });
            updateStatusBar();
            window.showToast(`Selected ${window.displayedItems.length} item(s)`, 'success');
        } else if (action === 'bg-new-folder') {
            const btn = document.getElementById('btn-new-folder');
            if (btn && !btn.disabled) btn.click();
        }
    });
}

// Bind globals for cross-reference
window.loadDirectory = loadDirectory;
window.navigateTo = navigateTo;
window.updateStatusBar = updateStatusBar;
window.initNavigationListeners = initNavigationListeners;
