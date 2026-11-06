// directory.js — handles scanning, loading directory, managing breadcrumbs/back stacks, and directory selection/refresh listeners.

window._vfItemCache = window._vfItemCache || new Map();

window.hydrateVirtualFolderItems = async function(folderIdOrPaths) {
    if (!folderIdOrPaths) return [];
    let paths = [];
    if (typeof folderIdOrPaths === 'string') {
        if (window.vf && typeof window.vf.itemsOf === 'function') {
            paths = window.vf.itemsOf(folderIdOrPaths) || [];
        }
    } else if (Array.isArray(folderIdOrPaths)) {
        paths = folderIdOrPaths;
    }
    if (!paths.length) return [];

    const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
    const missing = [];
    const allItemsMap = new Map();
    if (Array.isArray(window.allItems)) {
        for (const item of window.allItems) {
            if (item && item.path) allItemsMap.set(norm(item.path), item);
        }
    }

    for (const p of paths) {
        if (!p || typeof p !== 'string') continue;
        const n = norm(p);
        if (allItemsMap.has(n)) {
            window._vfItemCache.set(n, allItemsMap.get(n));
        } else if (!window._vfItemCache.has(n)) {
            missing.push(p);
        }
    }

    if (missing.length > 0 && window.electronAPI && typeof window.electronAPI.scanSpecificFiles === 'function') {
        const scannedMap = new Map();
        try {
            const scanned = await window.electronAPI.scanSpecificFiles(missing);
            if (Array.isArray(scanned)) {
                for (const item of scanned) {
                    if (item && item.path) {
                        const n = norm(item.path);
                        scannedMap.set(n, item);
                        window._vfItemCache.set(n, item);
                    }
                }
            }
        } catch (err) {
            console.error('[hydrateVirtualFolderItems] Failed scanning specific files:', err);
        }

        // Cache fallback placeholders for any missing files that were not returned by scanner
        // (e.g. offline drives, deleted or moved files). This marks them as resolved so they
        // are never continuously re-hydrated in a loop.
        for (const p of missing) {
            const n = norm(p);
            if (!scannedMap.has(n) && !window._vfItemCache.has(n)) {
                const ext = p.includes('.') ? ('.' + p.split('.').pop().toLowerCase()) : '';
                const name = p.split(/[\\/]/).pop() || p;
                window._vfItemCache.set(n, {
                    path: p,
                    name,
                    ext,
                    type: (['.mp4', '.mkv', '.webm', '.mov', '.avi'].includes(ext)) ? 'video'
                        : (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) ? 'image'
                        : (['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext)) ? 'audio'
                        : 'other',
                    size: 0,
                    duration: 0,
                    thumbnail: null,
                    poster: null,
                    isMissing: true
                });
            }
        }
    }

    return paths.map(p => {
        const n = norm(p);
        if (window._vfItemCache.has(n)) return window._vfItemCache.get(n);
        if (allItemsMap.has(n)) return allItemsMap.get(n);
        const ext = p.includes('.') ? ('.' + p.split('.').pop().toLowerCase()) : '';
        const name = p.split(/[\\/]/).pop() || p;
        return {
            path: p,
            name,
            ext,
            type: (['.mp4', '.mkv', '.webm', '.mov', '.avi'].includes(ext)) ? 'video'
                : (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) ? 'image'
                : (['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext)) ? 'audio'
                : 'other',
            size: 0,
            duration: 0,
            thumbnail: null,
            poster: null
        };
    });
};

function displayFolderSize(bytes) {
    if (!bytes) {
        el('status-size').innerText = '';
        return;
    }
    const label = window.translations[window.currentLang].folderSize || 'Folder Size:';
    const formatted = window.formatBytes(bytes);
    el('status-size').innerText = `${label} ${formatted}`;
}

// The real folder's size from vault-raggae's folder index (every file on disk, kept current from the journal),
// cached per folder; the sum of the scanned media items is shown until it arrives, or when it is unavailable.
const indexedFolderSizes = new Map();

function folderTotal(realPath, items) {
    const indexed = realPath ? indexedFolderSizes.get(realPath) : undefined;
    return typeof indexed === 'number' ? indexed : items.reduce((sum, item) => sum + (item.size || 0), 0);
}

async function refreshIndexedFolderSize(realPath) {
    if (!realPath || !window.electronAPI.getIndexedFolderSize) return;
    try {
        const bytes = await window.electronAPI.getIndexedFolderSize(realPath);
        if (typeof bytes === 'number') indexedFolderSizes.set(realPath, bytes);
        else indexedFolderSizes.delete(realPath);
    } catch (_) {
        indexedFolderSizes.delete(realPath);
    }
    if (window.currentRealPath === realPath && window.currentTab === 'files') updateStatusBar();
}

async function updateStatusBar() {
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

    if (window.currentFolderId && window.displayedItems && window.displayedItems.length > 0) {
        const totalSize = window.displayedItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else if (window.currentTab === 'files' && window.allItems && window.allItems.length > 0) {
        displayFolderSize(folderTotal(window.currentRealPath, window.allItems));
    } else if (window.currentTab === 'favorites' && window.displayedItems && window.displayedItems.length > 0) {
        const totalSize = window.displayedItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else {
        el('status-size').innerText = '';
    }
}

function getDisplayPath(navPath) {
    if (!navPath) return '';
    if (window.currentFolderId && window.vf) {
        const chain = window.vf.breadcrumb(window.currentFolderId);
        const folder = window.vf.get(window.currentFolderId);
        const type = folder ? folder.type : 'collection';
        const typeLabel = type === 'album' ? 'Albums'
                        : type === 'playlist' ? 'Playlists'
                        : 'Collections';
        if (chain && chain.length > 0) {
            return `${typeLabel} / ${chain.map(f => f.name).join(' / ')}`;
        }
    }
    const rootName = window.currentRealPath ? window.currentRealPath.split(/[\\/]/).pop() : 'Vault';
    return navPath.replace(/^root/, rootName);
}
window.getDisplayPath = getDisplayPath;

function clearSearchBox() {
    const sb = el('search-box');
    if (sb) sb.value = '';
    const cb = el('search-clear-btn');
    if (cb) cb.style.display = 'none';
}

function emitDirectoryLoaded(realPath, items) {
    window.dispatchEvent(new CustomEvent('vault-directory-loaded', {
        detail: { realPath, items: Array.isArray(items) ? items : [] }
    }));
}

async function loadDirectory(navPath, realPath, useCache = false, targetFolderId = undefined) {
    if (!realPath && navPath !== 'root') return;

    let newFolderId = null;
    if (targetFolderId !== undefined) {
        newFolderId = targetFolderId;
    } else {
        if (navPath === 'root') {
            newFolderId = null;
        } else if (realPath === window.currentRealPath) {
            newFolderId = window.currentFolderId;
        } else {
            newFolderId = null;
        }
    }

    if (newFolderId && (!window.vf || !window.vf.get(newFolderId))) {
        newFolderId = null;
    }

    window.currentFolderId = newFolderId;
    window.currentNavPath = window.currentFolderId ? window.buildNavPath(window.currentFolderId) : navPath;
    window.currentRealPath = realPath || '';

    const displayPath = navPath === 'root'
        ? (realPath || (window.translations[window.currentLang].noFolderSelected || 'No folder selected...'))
        : getDisplayPath(navPath);
    el('path-display').innerText = displayPath;
    el('path-display').title = realPath ? "Click to browse / change Vault folder" : "Click to browse for a folder";

    if (el('btn-new-folder')) { el('btn-new-folder').disabled = false; el('btn-new-folder').style.display = 'inline-flex'; }
    if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
    el('btn-refresh').disabled = !realPath;
    if (newFolderId) {
        if (el('btn-back')) {
            el('btn-back').disabled = false;
            el('btn-back').style.display = 'inline-flex';
            el('btn-back').title = "Go back";
        }
        if (typeof window.hydrateVirtualFolderItems === 'function') {
            await window.hydrateVirtualFolderItems(newFolderId);
        }
    } else {
        if (el('btn-back')) {
            el('btn-back').disabled = true;
            el('btn-back').style.display = 'none';
            el('btn-back').title = "Already at root vault level";
        }
    }

    clearSearchBox();

    // Persist lastPath only for Files-tab loads. Music/Photos auto-load
    // their own default folders through this same function — saving those
    // overwrote lastPath, so the Videos tab would boot into e.g. the music
    // folder (no videos → "initial load is always empty").
    if (realPath && (!window.currentTab || window.currentTab === 'files')) {
        window.appSettings.lastPath = { navPath: window.currentNavPath, realPath, folderId: window.currentFolderId };
        window.electronAPI.saveSettings(window.appSettings);
    }

    if (realPath) {
        let loadedFromCache = false;
        try {
            const cachedItems = await window.electronAPI.getCachedDirectory(realPath);
            if (cachedItems && cachedItems.length > 0) {
                window.allItems = cachedItems;
                if (navPath === 'root' || navPath.startsWith('root')) window._rootItemsCache = cachedItems;
                window.applyFilters();
                emitDirectoryLoaded(realPath, cachedItems);
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
                if (Array.isArray(window.__launchPriorityTrace)) window.__launchPriorityTrace.push('folder-scan');
                const freshItems = await window.electronAPI.scanDirectory(realPath);
                window.allItems = freshItems;
                if (navPath === 'root' || navPath.startsWith('root')) window._rootItemsCache = freshItems;
                window.applyFilters();
                emitDirectoryLoaded(realPath, freshItems);

                // Content is rendered — hide the loading overlay NOW. The
                // per-video duration probe below sleeps 150ms/video and used to
                // run inside the try, so the "Refreshing..." overlay stayed up
                // (and covered the content) until every video was probed.
                if (bypassTimeout) clearTimeout(bypassTimeout);
                if (bypassBtn) bypassBtn.style.display = 'none';
                el('loading').style.display = 'none';

                if (freshItems && freshItems.length > 0) {
                    displayFolderSize(folderTotal(realPath, freshItems));
                    refreshIndexedFolderSize(realPath);

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
    if (folderId !== null && folderId === window.currentFolderId && realPath === window.currentRealPath) {
        return;
    }
    window.currentFolderId = folderId;
    window.currentNavPath = folderId ? window.buildNavPath(folderId) : 'root';
    window.currentRealPath = realPath;
    if (el('path-display')) el('path-display').innerText = getDisplayPath(window.currentNavPath);
    clearSearchBox();

    if (realPath && (!window.currentTab || window.currentTab === 'files')) {
        window.appSettings = window.appSettings || {};
        window.appSettings.lastPath = { navPath: window.currentNavPath, realPath, folderId: window.currentFolderId };
        if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
            window.electronAPI.saveSettings(window.appSettings);
        }
    }

    if (!folderId) {
        if (el('btn-back')) {
            el('btn-back').style.display = 'none';
            el('btn-back').disabled = true;
        }

        // Fast path: in-memory cache renders instantaneously with zero delays or scan spinners
        if (window._rootItemsCache && window._rootItemsCache.length > 0) {
            window.allItems = window._rootItemsCache;
            if (el('loading')) el('loading').style.display = 'none';
            window.applyFilters();
            return;
        }

        let loadedFromCache = false;
        try {
            const cachedItems = await window.electronAPI.getCachedDirectory(realPath);
            if (cachedItems && cachedItems.length > 0) {
                window.allItems = cachedItems;
                window._rootItemsCache = cachedItems;
                if (el('loading')) el('loading').style.display = 'none';
                window.applyFilters();
                loadedFromCache = true;
            }
        } catch (e) { }

        if (!loadedFromCache) {
            if (el('loading')) el('loading').style.display = 'flex';
        }

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
            if (el('loading')) el('loading').style.display = 'none';
        }
    } else {
        if (el('btn-back')) {
            el('btn-back').style.display = 'inline-flex';
            el('btn-back').disabled = false;
        }

        const targetFolder = window.vf ? window.vf.get(folderId) : null;
        if (targetFolder) {
            if (targetFolder.type === 'collection') {
                window.currentFilesSubtab = 'collections';
                document.querySelectorAll('.file-subtab-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.subtab === 'collections');
                });
            }
            // Keep the root vault items in memory so applyFilters isolates membership instantly
            if (window._rootItemsCache && window._rootItemsCache.length > 0) {
                window.allItems = window._rootItemsCache;
            }
        }

        if (typeof window.hydrateVirtualFolderItems === 'function') {
            await window.hydrateVirtualFolderItems(folderId);
        }

        if (el('loading')) el('loading').style.display = 'none';
        window.applyFilters();
    }
}

// Invalidate root cache when files are modified
window.invalidateRootCache = function () { window._rootItemsCache = null; };

function initNavigationListeners() {
    let scrollSaveTimer = null;
    el('main-area').addEventListener('scroll', () => {
        if (window.currentTab && window.currentTab !== 'files') {
            window.tabScrollPositions = window.tabScrollPositions || {};
            window.tabScrollPositions[window.currentTab] = el('main-area').scrollTop;
            return;
        }
        if (!el('file-grid')?.childElementCount) return;
        window.scrollPositions[window.currentNavPath] = el('main-area').scrollTop;
        window.renderedCounts = window.renderedCounts || {};
        window.renderedCounts[window.currentNavPath] = window.currentlyRendered;
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => {
            window.appSettings.scrollPositions = window.scrollPositions;
            window.electronAPI.saveSettings(window.appSettings);
        }, 500);

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
                    if (exist.thumbnail !== item.thumbnail || exist.hoverWebm !== item.hoverWebm) {
                        exist.thumbnail = item.thumbnail;
                        exist.hoverWebm = item.hoverWebm;
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
