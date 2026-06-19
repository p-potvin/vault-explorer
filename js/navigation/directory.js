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

    if (window.currentTab === 'files' && window.allItems && window.allItems.length > 0) {
        const totalSize = window.allItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else if (window.currentTab === 'favorites' && window.displayedItems && window.displayedItems.length > 0) {
        const totalSize = window.displayedItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else {
        el('status-size').innerText = '';
    }
}

function getDisplayPath(navPath) {
    if (!navPath) return '';
    const rootName = window.currentRealPath ? window.currentRealPath.split(/[\\/]/).pop() : 'Vault';
    return navPath.replace(/^root/, rootName);
}

function clearSearchBox() {
    const sb = el('search-box');
    if (sb) sb.value = '';
    const cb = el('search-clear-btn');
    if (cb) cb.style.display = 'none';
}

async function loadDirectory(navPath, realPath, useCache = false) {
    if (!realPath && navPath !== 'root') return;
    window.currentNavPath = navPath;
    window.currentRealPath = realPath || '';
    window.currentFolderId = null;

    const displayPath = navPath === 'root' 
        ? (realPath || (window.translations[window.currentLang].noFolderSelected || 'No folder selected...')) 
        : getDisplayPath(navPath);
    el('path-display').innerText = displayPath;
    el('path-display').title = realPath ? "Click to change Vault folder" : "Click to browse for a folder";

    if (el('btn-new-folder')) { el('btn-new-folder').disabled = false; el('btn-new-folder').style.display = 'inline-flex'; }
    if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
    el('btn-refresh').disabled = !realPath;
    el('btn-refresh').title = realPath ? "Refresh directory" : "No folder selected";
    el('btn-back').disabled = true;
    el('btn-back').style.display = 'none';
    el('btn-back').title = "Already at root vault level";

    clearSearchBox();
    el('main-area').scrollTop = 0;

    if (realPath) {
        window.appSettings.lastPath = { navPath, realPath };
        window.electronAPI.saveSettings(window.appSettings);
    }

    if (realPath) {
        let loadedFromCache = false;
        try {
            const cachedItems = await window.electronAPI.getCachedDirectory(realPath);
            if (cachedItems && cachedItems.length > 0) {
                window.allItems = cachedItems;
                if (navPath === 'root') window._rootItemsCache = cachedItems;
                window.applyFilters();
                loadedFromCache = true;
            }
        } catch (cacheErr) {
            console.warn('[loadDirectory] Failed to retrieve cached directory:', cacheErr);
        }

        if (!loadedFromCache) {
            el('loading').style.display = 'flex';
        } else {
            // Update loading text to indicate background refresh when using cache
            el('loading-text').innerText = window.translations[window.currentLang].refreshing || 'Refreshing...';
        }

        const bypassBtn = el('btn-bypass-loading');
        let bypassTimeout = null;
        if (bypassBtn) {
            bypassBtn.style.display = 'none';
            // Always show loading indicator for initial directory scan, even if from cache
            // This prevents the UI from appearing to "refresh without warning"
            el('loading').style.display = 'flex';
            bypassTimeout = setTimeout(() => {
                bypassBtn.style.display = 'inline-block';
            }, 1500);
        } else {
            // If no bypass button, still show loading
            el('loading').style.display = 'flex';
        }

        (async () => {
            try {
                const freshItems = await window.electronAPI.scanDirectory(realPath);
                window.allItems = freshItems;
                if (navPath === 'root') window._rootItemsCache = freshItems;
                window.applyFilters();

                if (freshItems && freshItems.length > 0) {
                    const totalSize = freshItems.reduce((sum, item) => sum + (item.size || 0), 0);
                    displayFolderSize(totalSize);

                    const videosToProbe = freshItems.filter(item => item.type === 'video' && !item.duration);
                    if (videosToProbe.length > 0) {
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
                    }
                } else {
                    el('status-size').innerText = '';
                }
            } catch (err) {
                console.error('[loadDirectory] Background directory scan failed:', err);
                if (!loadedFromCache) {
                    window.allItems = [];
                    window.applyFilters();
                }
            } finally {
                if (bypassTimeout) clearTimeout(bypassTimeout);
                if (bypassBtn) bypassBtn.style.display = 'none';
                el('loading').style.display = 'none';
            }
        })();
    } else {
        window.allItems = [];
        window.applyFilters();
    }
}

// navigateTo accepts either:
//   - ('root', realPath)                              -> go to vault root
//   - (vfId,   realPath)  where vfId starts with 'vf_' -> enter a virtual folder
// Legacy string paths like 'root/Name/Sub' are resolved by walking the name chain
// through vf so existing call sites keep working.
function _resolveTargetFolderId(arg) {
    if (!arg || arg === 'root') return null;
    if (typeof arg === 'string' && arg.startsWith('vf_')) return arg;
    if (!window.vf || typeof arg !== 'string') return null;
    const parts = arg.split('/').filter(Boolean);
    if (parts[0] === 'root') parts.shift();
    let parentId = null;
    for (const name of parts) {
        const next = window.vf.list({ parentId }).find(f => f.name === name);
        if (!next) return null;
        parentId = next.id;
    }
    return parentId;
}

async function navigateTo(target, realPath) {
    const folderId = _resolveTargetFolderId(target);
    window.currentFolderId = folderId;
    window.currentNavPath = folderId ? window.buildNavPath(folderId) : 'root';
    window.currentRealPath = realPath;
    el('path-display').innerText = getDisplayPath(window.currentNavPath);
    clearSearchBox();
    el('main-area').scrollTop = 0;

    if (!folderId) {
        el('btn-back').style.display = 'none';
        el('btn-back').disabled = true;

        // Always show loading indicator when navigating to root to prevent UI from appearing to refresh without warning
        el('loading').style.display = 'flex';

        if (window._rootItemsCache) {
            window.allItems = window._rootItemsCache;
            window.applyFilters();
            // Update loading text to indicate background refresh when using cache
            el('loading-text').innerText = window.translations[window.currentLang].refreshing || 'Refreshing...';
            // Hide loading after a reasonable delay to show refresh is happening
            setTimeout(() => { 
                el('loading').style.display = 'none'; 
                el('loading-text').innerText = window.translations[window.currentLang].scanning || 'Scanning directory...';
            }, 2000);
        } else {
            let loadedFromCache = false;
            try {
                const cachedItems = await window.electronAPI.getCachedDirectory(realPath);
                if (cachedItems && cachedItems.length > 0) {
                    window.allItems = cachedItems;
                    window._rootItemsCache = cachedItems;
                    window.applyFilters();
                    loadedFromCache = true;
                }
            } catch (e) {}

            (async () => {
                try {
                    const freshItems = await window.electronAPI.scanDirectory(realPath);
                    window.allItems = freshItems;
                    window._rootItemsCache = freshItems;
                    window.applyFilters();
                } catch (e) {
                    if (!loadedFromCache) {
                        window.allItems = [];
                        window.applyFilters();
                    }
                } finally {
                    el('loading').style.display = 'none';
                }
            })();
        }
    } else {
        el('btn-back').style.display = 'inline-flex';
        el('btn-back').disabled = false;

        const targetFolder = window.vf.get(folderId);
        if (targetFolder) {
            el('loading').style.display = 'flex';
            const folderFiles = window.vf.itemsOf(folderId);

            if (folderFiles.length > 0) {
                const localPaths = [];
                const streamingItems = [];
                
                folderFiles.forEach(it => {
                    if (typeof it === 'string' && it.startsWith('tmdb://metadata:')) {
                        try {
                            const movie = JSON.parse(it.substring('tmdb://metadata:'.length));
                            streamingItems.push({
                                name: movie.title || movie.name,
                                path: it,
                                type: 'video',
                                thumbnail: movie.poster,
                                poster: movie.poster,
                                rating: movie.rating,
                                genres: movie.genres,
                                year: movie.year,
                                overview: movie.overview,
                                media_type: movie.media_type,
                                isStreaming: true,
                                meta: movie
                            });
                        } catch (e) {
                            console.error('[directory] Failed to parse streaming item metadata:', e);
                        }
                    } else {
                        localPaths.push(it);
                    }
                });
                
                let loadedLocal = [];
                if (localPaths.length > 0) {
                    loadedLocal = await window.electronAPI.scanSpecificFiles(localPaths);
                }
                
                window.allItems = [...streamingItems, ...loadedLocal];
            } else {
                window.allItems = [];
            }
            el('loading').style.display = 'none';
        } else {
            window.allItems = [];
        }
        window.applyFilters();
    }
}

// Invalidate root cache when files are modified
window.invalidateRootCache = function () { window._rootItemsCache = null; };

function initNavigationListeners() {
    el('main-area').addEventListener('scroll', () => {
        if (window.currentTab && window.currentTab !== 'files') {
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

    let searchDebounceTimeout = null;
    el('search-box').addEventListener('input', (e) => {
        const clearBtn = el('search-clear-btn');
        if (clearBtn) {
            clearBtn.style.display = e.target.value ? 'flex' : 'none';
        }

        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            window.applyFilters();
        }, 250);
    });

    const clearBtn = el('search-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const sb = el('search-box');
            if (sb) {
                sb.value = '';
                sb.focus();
            }
            clearBtn.style.display = 'none';
            window.applyFilters();
        });
    }

    el('btn-sort-order').addEventListener('click', () => {
        const btn = el('btn-sort-order');
        const currentOrder = btn.dataset.order || 'desc';
        const nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
        btn.dataset.order = nextOrder;
        window.updateSortOrderButtonUI();
        window.applyFilters();
    });

    el('btn-back').addEventListener('click', () => {
        if (!window.currentFolderId) return;
        const cur = window.vf.get(window.currentFolderId);
        navigateTo(cur && cur.parentId ? cur.parentId : 'root', window.currentRealPath);
    });

    el('btn-refresh').addEventListener('click', async () => {
        if (!window.currentRealPath) return;
        el('loading-text').innerText = 'Refreshing Views...'; el('loading').style.display = 'flex';
        const latest = await window.electronAPI.scanDirectory(window.currentRealPath);
        window._rootItemsCache = latest;
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

    el('path-display').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.openDirectory();
        if (folderPath) { loadDirectory('root', folderPath, false); window.showToast('Vault loaded: ' + folderPath, 'success'); }
    });

    // drag selection box logic
    const area = el('main-area');
    const sbox = el('selection-box');
    let isDragging = false, startX, startY;

    area.addEventListener('mousedown', (e) => {
        if (window.currentTab !== 'files' && window.currentTab !== 'favorites') return;
        if (e.target.closest('.file-card') || e.target.closest('.toolbar') || e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true; const rect = area.getBoundingClientRect();
        startX = e.clientX - rect.left + area.scrollLeft; startY = e.clientY - rect.top + area.scrollTop;
        sbox.style.left = startX + 'px'; sbox.style.top = startY + 'px'; sbox.style.width = '0px'; sbox.style.height = '0px'; sbox.style.display = 'block';
        if (!e.ctrlKey && !e.shiftKey) {
            window.selectedIndices.clear();
            document.querySelectorAll('.file-card').forEach(c => { c.classList.remove('selected'); const cb = c.querySelector('.file-checkbox'); if (cb) cb.checked = false; });
            updateStatusBar();
        }
    });
    area.addEventListener('mousemove', (e) => {
        if (!isDragging || (window.currentTab !== 'files' && window.currentTab !== 'favorites')) return;
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
                window.selectedIndices.add(idx); card.classList.add('selected'); const chk = card.querySelector('.file-checkbox'); if (chk) chk.checked = true;
            }
        });
        updateStatusBar();
    });
    window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; sbox.style.display = 'none'; } });

    // Background context menu
    area.addEventListener('contextmenu', async (e) => {
        if (e.target.closest('.file-card') || e.target.closest('.toolbar') || e.target.closest('button') || e.target.closest('input')) return;
        e.preventDefault();

        // Deselect all items if not holding ctrl/shift
        if (!e.ctrlKey && !e.shiftKey) {
            window.selectedIndices.clear();
            document.querySelectorAll('.file-card').forEach(c => {
                c.classList.remove('selected');
                const chk = c.querySelector('.file-checkbox');
                if (chk) chk.checked = false;
            });
            updateStatusBar();
        }

        const hasClip = !!(window._clipboard && window._clipboard.paths.length > 0);
        const action = await window.electronAPI.showContextMenu({
            type: 'background', _hasClipboard: hasClip
        });
        if (action === 'paste') {
            if (!window._clipboard || window._clipboard.paths.length === 0) { window.showToast('Nothing to paste', 'error'); return; }
            if (!window.currentRealPath) { 
                window.showToast(window.currentLang === 'fr' ? 'Veuillez charger un dossier Vault' : 'Please load a Vault folder first', 'error'); 
                return; 
            }
            const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: window.currentRealPath });
            if (res.success) {
                window.showToast(`Pasted ${res.count} file(s)`, 'success');
                if (window.currentFolderId && Array.isArray(res.pastedPaths)) {
                    window.vf.addItems(window.currentFolderId, res.pastedPaths);
                }
                if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                if (window.currentFolderId) {
                    navigateTo(window.currentFolderId, window.currentRealPath);
                } else {
                    loadDirectory(window.currentNavPath, window.currentRealPath, false);
                }
            } else { window.showToast('Paste failed: ' + res.error, 'error'); }
        } else if (action === 'bg-refresh') {
            loadDirectory(window.currentNavPath, window.currentRealPath, false);
        } else if (action === 'bg-select-all') {
            window.selectedIndices.clear();
            window.displayedItems.forEach((_, i) => window.selectedIndices.add(i));
            document.querySelectorAll('.file-card').forEach(c => { c.classList.add('selected'); const chk = c.querySelector('.file-checkbox'); if (chk) chk.checked = true; });
            updateStatusBar();
            window.showToast(`Selected ${window.displayedItems.length} item(s)`, 'success');
        } else if (action === 'bg-new-folder') {
            const btn = document.getElementById('btn-new-folder');
            if (btn && !btn.disabled) btn.click();
        } else if (action === 'bg-generate-previews') {
            if (window.allItems && window.allItems.length > 0) {
                window.electronAPI.scheduleIdlePreviews(window.allItems);
                window.showToast('Background preview generation scheduled for folder', 'success');
            }
        }
    });
}

// Bind globals for cross-reference
window.loadDirectory = loadDirectory;
window.navigateTo = navigateTo;
window.updateStatusBar = updateStatusBar;
window.initNavigationListeners = initNavigationListeners;
