// favorites.js — renders the local Explorer favorites collection.

window.renderFavorites = async function renderFavorites(useCache = false) {
    const grid = el('favorites-grid');
    if (!grid) return;
    const settings = window.appSettings || {};
    const favorites = Array.isArray(settings.favorites)
        ? settings.favorites.filter(pathValue => typeof pathValue === 'string' && pathValue.trim() && !pathValue.startsWith('virtual://'))
        : [];
    settings.favorites = favorites;

    if (!favorites.length) {
const t = window.translations[window.currentLang] || {};
grid.innerHTML = `<div class="empty-state"><h3>${t.noFavoritesYet || 'No Favorites Yet'}</h3><p>${t.noFavoritesYetDesc || 'Click the star icon on any local file to save it here.'}</p></div>`;
        window.displayedItems = [];
        if (typeof window.updateStatusBar === 'function') window.updateStatusBar();
        return;
    }

    let scanned = window.favoriteLocalItems;
    if (!useCache || !Array.isArray(scanned)) {
        try { scanned = await window.electronAPI.scanSpecificFiles(favorites) || []; }
        catch (error) { console.error('[favorites] scan failed:', error.message); scanned = []; }
        const found = new Set(scanned.map(item => String(item.path || '').toLowerCase()));
        settings.favorites = favorites.filter(pathValue => found.has(pathValue.toLowerCase()));
        await window.electronAPI.saveSettings(settings);
        scanned.forEach(item => { item.isFavorited = true; });
        window.favoriteLocalItems = scanned;
    }

    const term = (el('search-box')?.value || '').toLowerCase();
    const filter = el('filter-type')?.value || 'all';
    const sortBy = el('sort-by')?.value || 'name';
    const descending = (el('btn-sort-order')?.dataset.order || 'desc') === 'desc';
    const filtered = scanned.filter(item => {
        if (term && !(item.name || '').toLowerCase().includes(term)) return false;
        if (filter === 'video') return item.type === 'video' || item.type === 'encrypted';
        if (filter === 'image') return item.type === 'image';
        if (filter === 'audio') return item.type === 'audio';
        return true;
    }).sort((left, right) => {
        const a = sortBy === 'name' ? String(left[sortBy] || '').toLowerCase() : (left[sortBy] || 0);
        const b = sortBy === 'name' ? String(right[sortBy] || '').toLowerCase() : (right[sortBy] || 0);
        const result = a < b ? -1 : a > b ? 1 : 0;
        return descending ? -result : result;
    });

    window.displayedItems = filtered;
    grid.innerHTML = '';
    if (!filtered.length) {
const t = window.translations[window.currentLang] || {};
grid.innerHTML = `<div class="empty-state"><h3>${t.noItemsFound || 'No Items Found'}</h3><p>${t.adjustFiltersFavorites || 'Adjust your search or filters.'}</p></div>`;
    } else {
        const fragment = document.createDocumentFragment();
        filtered.forEach((item, index) => fragment.appendChild(window.createCardElement(item, index)));
        grid.appendChild(fragment);
    }
    if (typeof window.updateStatusBar === 'function') window.updateStatusBar();
};
