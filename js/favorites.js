// favorites.js — renders the local Explorer favorites collection and manages favorites state.

const _normFavPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

window.isFavorite = function isFavorite(filePath) {
    if (!filePath || !window.appSettings || !Array.isArray(window.appSettings.favorites)) return false;
    const targetPath = _normFavPath(filePath);
    return window.appSettings.favorites.some(p => _normFavPath(p) === targetPath);
};

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
        try {
            scanned = await window.electronAPI.scanSpecificFiles(favorites) || [];
        } catch (error) {
            console.error('[favorites] scan failed:', error.message);
            scanned = [];
        }
        if (scanned && scanned.length > 0) {
            scanned.forEach(item => { item.isFavorited = true; });
            window.favoriteLocalItems = scanned;
        } else if (favorites.length > 0 && (!scanned || scanned.length === 0)) {
            scanned = [];
            window.favoriteLocalItems = scanned;
        }
    }

    const term = (el('search-box')?.value || '').toLowerCase();
    const filter = el('filter-type')?.value || 'all';
    const sortBy = el('sort-by')?.value || 'name';
    const descending = (el('btn-sort-order')?.dataset.order || 'desc') === 'desc';
    const filtered = (scanned || []).filter(item => {
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

window.toggleFavorite = function toggleFavorite(filePath, btnEl, isSilent = false) {
    if (!filePath) return;
    window.appSettings = window.appSettings || {};
    window.appSettings.favorites = Array.isArray(window.appSettings.favorites) ? window.appSettings.favorites : [];
    
    const targetPath = _normFavPath(filePath);
    const idx = window.appSettings.favorites.findIndex(p => _normFavPath(p) === targetPath);
    let isNowStarred = false;
    const lang = window.currentLang === 'fr' ? 'fr' : 'en';
    
    if (idx !== -1) {
        window.appSettings.favorites.splice(idx, 1);
        if (!isSilent && typeof window.showToast === 'function') {
            window.showToast(lang === 'fr' ? 'Retiré des favoris' : 'Removed from Favorites', 'info');
        }
    } else {
        window.appSettings.favorites.push(filePath);
        isNowStarred = true;
        if (!isSilent && typeof window.showToast === 'function') {
            window.showToast(lang === 'fr' ? 'Ajouté aux favoris' : 'Added to Favorites', 'success');
        }
    }
    
    if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
        window.electronAPI.saveSettings(window.appSettings);
    }
    
    window.favoriteLocalItems = null;
    
    document.querySelectorAll('.file-card').forEach(card => {
        const cardPath = _normFavPath(card.dataset.path);
        if (cardPath === targetPath) {
            const svg = card.querySelector('.star-svg');
            if (svg) {
                svg.setAttribute('fill', isNowStarred ? '#E5A93B' : 'none');
                svg.setAttribute('stroke', isNowStarred ? '#E5A93B' : '#ffffff');
                svg.style.transform = 'scale(1.3)';
                setTimeout(() => { svg.style.transform = 'scale(1.0)'; }, 200);
            }
        }
    });

    if (btnEl) {
        const svg = btnEl.querySelector('svg') || btnEl;
        if (svg && svg.classList.contains('star-svg')) {
            svg.setAttribute('fill', isNowStarred ? '#E5A93B' : 'none');
            svg.setAttribute('stroke', isNowStarred ? '#E5A93B' : '#ffffff');
        }
    }

    if (!isSilent && window.currentTab === 'files' && window.currentFilesSubtab === 'favorites') {
        window.renderFavorites();
    }
};


