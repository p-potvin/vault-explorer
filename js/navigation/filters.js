// filters.js — applyFilters, renderMore, sorting

window.allItems = [];
window.displayedItems = [];
window.selectedIndices = new Set();
window.lastSelectedIndex = -1;
window.PAGE_SIZE = 50;
window.currentlyRendered = 0;
window.scrollPositions = {};
window.currentNavPath = '';     // display breadcrumb path ('root' or 'root/Name/Sub')
window.currentRealPath = '';
window.currentFolderId = null;  // source of truth: null at root, else a vf id
window.folderSizeTimer = null;

// Resolve the *current* virtual folder by id. Returns null at root or if the
// id has been deleted out from under us.
window.getTargetFolder = function() {
    if (!window.currentFolderId || !window.vf) return null;
    return window.vf.get(window.currentFolderId);
};

// Build a breadcrumb display string from a folder id (or 'root' if null).
window.buildNavPath = function(folderId) {
    if (!folderId || !window.vf) return 'root';
    const chain = window.vf.breadcrumb(folderId);
    if (!chain.length) return 'root';
    return 'root/' + chain.map(f => f.name).join('/');
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
    const vf = window.vf;

    const activeSubtab = window.currentVaultSubtab || 'all';
    const currentFolder = window.getTargetFolder();
    const currentFolderType = currentFolder ? currentFolder.type : null;
    const subtabType = activeSubtab === 'collections' ? 'collection'
                    : activeSubtab === 'albums'      ? 'album'
                    : activeSubtab === 'playlists'   ? 'playlist'
                    : null;

    // True if a file's item-type is admissible in the current context.
    const matchesCategoryType = (itemType) => {
        const ctxType = currentFolderType || subtabType;
        if (!ctxType) return true;
        return vf.itemAccepts(ctxType, itemType);
    };

    // Project a vf folder into the legacy fakeFolder render shape (id-stamped).
    const projectFolder = (f) => ({
        type: 'fakeFolder',
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        parent: f.parentId ? window.buildNavPath(f.parentId) : 'root',
        path: 'virtual://' + f.id,
        folderType: f.type,
    });

    let pool = [];
    if (term) {
        // Global search: every vault file + every (matching-type) virtual folder.
        const allVaultFiles = (window._rootItemsCache || window.allItems || []).filter(v => matchesCategoryType(v.type));
        const allFakeFolders = vf.list({})
            .filter(f => !subtabType || f.type === subtabType)
            .map(projectFolder);
        pool = [...allFakeFolders, ...allVaultFiles];
    } else if (currentFolder) {
        // Inside a virtual folder: sub-folders here + this folder's items.
        const subFolders = vf.list({ parentId: currentFolder.id }).map(projectFolder);
        const memberSet = new Set(vf.itemsOf(currentFolder.id));
        const memberItems = window.allItems.filter(v => memberSet.has(v.path) && matchesCategoryType(v.type));
        pool = [...subFolders, ...memberItems];
    } else if (subtabType) {
        // Category subtabs (Collections / Albums / Playlists) show ONLY the
        // user's virtual folders of that type — no vault files mixed in.
        // Vault files for that category live inside the folders themselves.
        pool = vf.list({ parentId: null, type: subtabType }).map(projectFolder);
    } else {
        // 'All' subtab: every top-level folder + every vault file (tagging model).
        const rootFolders = vf.list({ parentId: null }).map(projectFolder);
        pool = [...rootFolders, ...window.allItems];
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
        if (sortBy === 'name') { valA = (valA || '').toLowerCase(); valB = (valB || '').toLowerCase(); }
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

