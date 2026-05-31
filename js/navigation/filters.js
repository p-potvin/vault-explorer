// filters.js — applyFilters, renderMore, sorting

window.allItems = [];
window.displayedItems = [];
window.selectedIndices = new Set();
window.lastSelectedIndex = -1;
window.PAGE_SIZE = 50;
window.currentlyRendered = 0;
window.scrollPositions = {};
window.currentNavPath = '';
window.currentRealPath = '';
window.folderSizeTimer = null;

window.getTargetFolder = function(navPath) {
    if (!navPath || navPath === 'root') return null;
    const parts = navPath.split('/');
    const leafName = parts.pop();
    const parentPath = parts.join('/');
    return window.appSettings.folders.find(f => f.name === leafName && (f.parent === parentPath || ((!f.parent || f.parent === 'root') && parentPath === 'root')));
};

window.renderingMore = false;
function renderMore() {
    if (window.renderingMore) return;
    window.renderingMore = true;
    const nextBatch = window.displayedItems.slice(window.currentlyRendered, window.currentlyRendered + window.PAGE_SIZE);
    if (nextBatch.length === 0) {
        window.renderingMore = false;
        return;
    }
    const fragment = document.createDocumentFragment();
    nextBatch.forEach((item, i) => {
        fragment.appendChild(window.createCardElement(item, window.currentlyRendered + i));
    });
    el('file-grid').appendChild(fragment);
    window.currentlyRendered += nextBatch.length;
    window.renderingMore = false;
}

function applyFilters() {
    if (window.currentTab === 'vault' && window.currentVaultSubtab === 'favorites') {
        if (typeof window.renderFavorites === 'function') {
            window.renderFavorites(true);
        }
        return;
    }
    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;

    const pathVirtualFolderMap = new Map();
    window.appSettings.folders.forEach(f => {
        f.items.forEach(p => {
            pathVirtualFolderMap.set(p, f.name);
        });
    });

    const activeSubtab = window.currentVaultSubtab || 'all';
    let currentFolderType = null;
    if (window.currentNavPath !== 'root') {
        const target = window.getTargetFolder(window.currentNavPath);
        if (target) {
            currentFolderType = target.type || 'collection';
        }
    }

    // Helper to verify if item type matches context (active subtab or folder type)
    const matchesCategoryType = (itemType) => {
        const checkType = currentFolderType || (activeSubtab === 'collections' ? 'collection' : activeSubtab === 'albums' ? 'album' : activeSubtab === 'playlists' ? 'playlist' : 'all');
        if (checkType === 'collection') return itemType === 'video' || itemType === 'encrypted';
        if (checkType === 'album') return itemType === 'image';
        if (checkType === 'playlist') return itemType === 'audio';
        return true;
    };

    let pool = [];
    if (term) {
        // Global search: search across all files in the vault and all virtual folders
        const allVaultFiles = (window._rootItemsCache || window.allItems || []).filter(v => matchesCategoryType(v.type));
        allVaultFiles.forEach(v => {
            v.virtualFolder = pathVirtualFolderMap.get(v.path) || '';
        });
        const allFakeFolders = window.appSettings.folders.map(f => ({
            type: 'fakeFolder',
            name: f.name,
            parent: f.parent || 'root',
            path: 'virtual://' + (f.parent || 'root') + '/' + f.name,
            folderType: f.type || 'collection'
        })).filter(f => {
            if (activeSubtab === 'collections') return f.folderType === 'collection';
            if (activeSubtab === 'albums') return f.folderType === 'album';
            if (activeSubtab === 'playlists') return f.folderType === 'playlist';
            return true;
        });
        pool = [...allFakeFolders, ...allVaultFiles];
    } else {
        // Standard view: filter by the current navigation directory
        const fakeFolders = window.appSettings.folders
            .filter(f => f.parent === window.currentNavPath)
            .map(f => ({
                type: 'fakeFolder',
                name: f.name,
                parent: f.parent || 'root',
                path: 'virtual://' + (f.parent || 'root') + '/' + f.name,
                folderType: f.type || 'collection'
            })).filter(f => {
                if (window.currentNavPath !== 'root') return true; // Show nested folders regardless
                if (activeSubtab === 'collections') return f.folderType === 'collection';
                if (activeSubtab === 'albums') return f.folderType === 'album';
                if (activeSubtab === 'playlists') return f.folderType === 'playlist';
                return true;
            });
            
        const displayableFiles = window.allItems.filter(v => {
            v.virtualFolder = pathVirtualFolderMap.get(v.path) || '';
            if (window.currentNavPath === 'root') {
                if (v.virtualFolder !== '') return false;
                // Collections/Albums/Playlists only show their virtual folders at root, not loose files
                if (activeSubtab !== 'all') return false;
            }
            return matchesCategoryType(v.type);
        });
        pool = [...fakeFolders, ...displayableFiles];
    }

    let filteredItems = pool.filter(v => {
        if (term) {
            const hasName = v.name.toLowerCase().includes(term);
            const hasNfoTitle = v.nfoMeta && v.nfoMeta.title && v.nfoMeta.title.toLowerCase().includes(term);
            const hasNfoPlot = v.nfoMeta && v.nfoMeta.plot && v.nfoMeta.plot.toLowerCase().includes(term);
            if (!hasName && !hasNfoTitle && !hasNfoPlot) return false;
        }
        if (v.type === 'fakeFolder') return true;
        if (filterAttr === 'video') return v.type === 'video' || v.type === 'encrypted';
        if (filterAttr === 'image') return v.type === 'image';
        if (filterAttr === 'audio') return v.type === 'audio';
        return true;
    });

    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    filteredItems.sort((a, b) => {
        if (a.type === 'fakeFolder' && b.type !== 'fakeFolder') return -1;
        if (b.type === 'fakeFolder' && a.type !== 'fakeFolder') return 1;
        let valA = a[sortBy]; let valB = b[sortBy];
        if (sortBy === 'name') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        else if (['size', 'duration', 'mtime'].includes(sortBy)) { valA = valA || 0; valB = valB || 0; }
        let compare = 0;
        if (valA < valB) compare = -1; else if (valA > valB) compare = 1;
        return sortOrder === 'desc' ? compare * -1 : compare;
    });

    window.displayedItems = filteredItems;

    window.killAllHoverVideos();

    if (window.displayedItems.length === 0) {
        const hasActiveFilters = term !== '' || filterAttr !== 'all';
        const ctaButton = hasActiveFilters
            ? `<button style="margin-top:16px;" onclick="document.getElementById('search-box').value=''; document.getElementById('filter-type').value='all'; window.applyFilters();">Clear Filters</button>`
            : `<button style="margin-top:16px;" onclick="document.getElementById('btn-select').click()">Browse Vault</button>`;
        el('file-grid').innerHTML = `
           <div class="empty-state" style="grid-column: 1 / -1;">
               ${window.icons ? window.icons.search('', 'width: 48px; height: 48px; margin-bottom: 12px; color: var(--vault-slate);') : ''}
               <h3>${window.translations[window.currentLang].noItemsFound}</h3>
               <p>${window.translations[window.currentLang].adjustFilters}</p>
               ${ctaButton}
           </div>`;
        window.selectedIndices.clear(); window.lastSelectedIndex = -1; window.currentlyRendered = 0;
        window.updateStatusBar();
    } else {
        el('file-grid').innerHTML = '';
        window.selectedIndices.clear(); window.lastSelectedIndex = -1;

        let countToRender = window.PAGE_SIZE;
        if (window.restoringVaultTab && window.vaultCurrentlyRendered) {
            countToRender = window.vaultCurrentlyRendered;
            window.restoringVaultTab = false;
            window.vaultCurrentlyRendered = null;
        } else {
            window.vaultCurrentlyRendered = null;
            window.restoringVaultTab = false;
        }

        window.currentlyRendered = 0;
        window.updateStatusBar();

        const nextBatch = window.displayedItems.slice(0, countToRender);
        nextBatch.forEach((item, i) => { el('file-grid').appendChild(window.createCardElement(item, i)); });
        window.currentlyRendered = nextBatch.length;
    }
}

window.applyFilters = applyFilters;
window.renderMore = renderMore;

// ── Image Enhancement Trigger ─────────────────────────────────────────────
// When the user filters by images, queue background enhancement via magick.
// When each enhanced file comes back, swap the card thumbnail src live.
(function setupImageEnhancement() {
    if (!window.electronAPI || !window.electronAPI.enhanceImageThumbnails) return;

    function triggerEnhanceIfImages() {
        const filterAttr = el('filter-type') ? el('filter-type').value : 'all';
        if (filterAttr !== 'image') return;

        const imagePaths = (window.displayedItems || [])
            .filter(v => v.type === 'image' && v.path)
            .map(v => v.path);

        if (imagePaths.length === 0) return;

        // Replace listener each time to avoid stacking
        if (window.electronAPI.offImageEnhanced) window.electronAPI.offImageEnhanced();
        window.electronAPI.onImageEnhanced((data) => {
            if (!data || !data.original || !data.enhanced) return;
            const card = document.querySelector(`.file-card[data-path="${CSS.escape(data.original)}"]`);
            if (card) {
                const img = card.querySelector('.thumbnail');
                if (img && img.src !== data.enhanced) {
                    img.src = window.sanitizePath(data.enhanced);
                }
            }
        });

        window.electronAPI.enhanceImageThumbnails(imagePaths);
    }

    // Wire into the filter-type change event and after each applyFilters render
    const origApply = window.applyFilters;
    window.applyFilters = function() {
        origApply.apply(this, arguments);
        requestAnimationFrame(triggerEnhanceIfImages);
    };

    const filterEl = el('filter-type');
    if (filterEl) filterEl.addEventListener('change', () => requestAnimationFrame(triggerEnhanceIfImages));
})();

