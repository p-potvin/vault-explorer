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
    if (window.currentTab === 'favorites') {
        if (typeof window.renderFavorites === 'function') {
            window.renderFavorites(true);
        }
        return;
    }
    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;

    const fakeFolders = window.appSettings.folders.filter(f => f.parent === window.currentNavPath).map(f => ({ type: 'fakeFolder', name: f.name }));

    const pathVirtualFolderMap = new Map();
    window.appSettings.folders.forEach(f => {
        f.items.forEach(p => {
            pathVirtualFolderMap.set(p, f.name);
        });
    });

    const displayableFiles = window.allItems.filter(v => {
        v.virtualFolder = pathVirtualFolderMap.get(v.path) || '';
        if (window.currentNavPath === 'root') {
            if (v.virtualFolder !== '') return false;
        }
        return true;
    });

    const pool = [...fakeFolders, ...displayableFiles];

    let filteredItems = pool.filter(v => {
        if (term && !v.name.toLowerCase().includes(term)) return false;
        if (v.type === 'fakeFolder') return true;
        if (filterAttr === 'video') return v.type === 'video' || v.type === 'encrypted';
        if (filterAttr === 'image') return v.type === 'image';
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
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                   <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               </svg>
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
