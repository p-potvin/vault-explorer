/* ==========================================================================
   Vault Favorites & Local Files rendering Module
   ========================================================================== */

window.renderFavorites = async function(useCache = false) {
    const grid = el('favorites-grid');
    if (!grid) return;
    
    window.appSettings.favorites = window.appSettings.favorites || [];
    window.appSettings.library = window.appSettings.library || [];
    
    const hasFavorites = window.appSettings.favorites.length > 0;
    const hasLibrary = window.appSettings.library.length > 0;
    
    if (!hasFavorites && !hasLibrary) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 60px 0; text-align: center;">
               <svg viewBox="0 0 24 24" fill="none" stroke="var(--vault-gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
               </svg>
               <h3 style="color: #fff; font-family: var(--font-mono); font-size: 15px; margin-bottom: 8px; font-weight: 700;">
                   ${window.currentLang === 'fr' ? 'Votre bibliothèque est vide' : 'Your Library is Empty'}
               </h3>
               <p style="color: var(--vault-slate); font-family: var(--font-body); font-size: 12px; max-width: 320px; margin: 0 auto;">
                   ${window.currentLang === 'fr' ? 'Ajoutez des films à votre bibliothèque ou marquez des fichiers locaux en favoris.' : 'Add films/series to your library or star local vault files to see them here.'}
               </p>
            </div>
        `;
        return;
    }

    if (!useCache || !window.favoriteLocalItems) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;"><div class="spinner" style="margin: 0 auto 12px;"></div>Loading library & favorites...</div>';
        try {
            let localItems = [];
            if (hasFavorites) {
                localItems = await window.electronAPI.scanSpecificFiles(window.appSettings.favorites);
            }
            window.favoriteLocalItems = localItems;
        } catch (e) {
            console.error("Failed to load library and favorites:", e);
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-signal-alert, #FF6B7A); padding: 40px 0;">Error loading favorites/library.</div>';
            return;
        }
    }

    grid.innerHTML = '';

    // Apply search, filter, and sort from the 2nd top bar controls!
    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;
    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    // 1. Filter and sort Streaming items
    let filteredLibrary = [...window.appSettings.library];
    if (term) {
        filteredLibrary = filteredLibrary.filter(m => 
            (m.title || '').toLowerCase().includes(term) || 
            (m.genres || '').toLowerCase().includes(term) || 
            (m.overview || '').toLowerCase().includes(term)
        );
    }
    if (filterAttr === 'image') {
        filteredLibrary = []; // No images in streaming library
    }
    // Sort streaming library
    filteredLibrary.sort((a, b) => {
        let valA = a[sortBy] || a.title || '';
        let valB = b[sortBy] || b.title || '';
        if (sortBy === 'name' || typeof valA === 'string') {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        } else {
            valA = valA || 0;
            valB = valB || 0;
        }
        let compare = 0;
        if (valA < valB) compare = -1; else if (valA > valB) compare = 1;
        return sortOrder === 'desc' ? compare * -1 : compare;
    });

    // 2. Filter and sort Local Favorite files
    let filteredLocal = [...(window.favoriteLocalItems || [])];
    filteredLocal = filteredLocal.filter(v => {
        if (term && !v.name.toLowerCase().includes(term)) return false;
        if (filterAttr === 'video') return v.type === 'video' || v.type === 'encrypted';
        if (filterAttr === 'image') return v.type === 'image';
        return true;
    });
    // Sort local favorites
    filteredLocal.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (sortBy === 'name') {
            valA = (valA || '').toLowerCase();
            valB = (valB || '').toLowerCase();
        } else if (['size', 'duration', 'mtime'].includes(sortBy)) {
            valA = valA || 0;
            valB = valB || 0;
        }
        let compare = 0;
        if (valA < valB) compare = -1; else if (valA > valB) compare = 1;
        return sortOrder === 'desc' ? compare * -1 : compare;
    });

    window.displayedItems = filteredLocal; // So player playlists work!

    const hasFilteredLibrary = filteredLibrary.length > 0;
    const hasFilteredLocal = filteredLocal.length > 0;

    if (!hasFilteredLibrary && !hasFilteredLocal) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 60px 0; text-align: center;">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;">
                   <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               </svg>
               <h3 style="color: #fff; font-family: var(--font-mono); font-size: 15px; margin-bottom: 8px; font-weight: 700;">
                   ${window.currentLang === 'fr' ? 'Aucun résultat trouvé' : 'No items found'}
               </h3>
               <p style="color: var(--vault-slate); font-family: var(--font-body); font-size: 12px; max-width: 320px; margin: 0 auto;">
                   ${window.currentLang === 'fr' ? 'Ajustez vos filtres de recherche.' : 'Adjust your search filters.'}
               </p>
            </div>
        `;
        return;
    }

    // Render streaming media section
    if (hasFilteredLibrary) {
        const libHeader = document.createElement('div');
        libHeader.style.cssText = 'grid-column: 1 / -1; margin-top: 10px; margin-bottom: 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--vault-gold); letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border); padding-bottom: 6px; display: flex; align-items: center; gap: 8px; user-select: none;';
        libHeader.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            <span>${window.currentLang === 'fr' ? 'Médiathèque en flux' : 'Streaming Media Library'}</span>
        `;
        grid.appendChild(libHeader);
        
        filteredLibrary.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'file-card tmdb-movie-card in-library';
            card.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1.5px solid var(--vault-console-gold); border-radius: 6px; box-shadow: 0 0 12px rgba(214, 164, 65, 0.35); position: relative;';
            
            card.addEventListener('click', () => {
                window.showMediaDetails(movie);
            });
            
            const isTV = movie.media_type === 'tv';
            const tvSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px; display:inline-block;"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`;
            const movieSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px; display:inline-block;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
            
            card.innerHTML = `
                <div class="thumbnail-container" style="position:relative; background:#111; height: 180px; width: 100%; border-top-left-radius: 5px; border-top-right-radius: 5px; overflow: hidden;">
                   <button onclick="event.stopPropagation(); window.showMediaDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})" style="position: absolute; top: 8px; left: 8px; border: none; background: rgba(0,0,0,0.8); color: var(--vault-gold); font-family: var(--font-mono); font-size: 10px; font-weight: 800; padding: 4px 6.5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid var(--vault-gold); transition: all 0.2s;" title="${isTV ? 'Browse Seasons' : 'Stream Movie'}">
                      ${isTV ? tvSvg : movieSvg}
                   </button>
                   <img class="thumbnail" src="${movie.poster}" alt="${window.escapeHtml(movie.title)}" style="object-fit: cover; width:100%; height:100%; transition: opacity 0.25s ease;" onerror="this.src='oppenheimer_poster.png'">
                   <div class="size-badge" style="background:var(--vault-accent); color:var(--vt-primary); font-weight:800; position:absolute; bottom: 8px; left: 8px; width: 28px; height: 28px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8.5px; line-height: 1.1; padding: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.4); text-align: center;">
                      <span>★</span>
                      <span style="margin-top:-1px;">${movie.rating}</span>
                   </div>
                </div>
                <div class="filename-container" style="padding:12px; text-align:left;">
                   <div style="font-weight:700; font-size:13px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-mono);">${window.escapeHtml(movie.title)}</div>
                   <div style="font-size:10px; color:var(--vault-slate); margin-top:2px; font-weight:500;">${movie.year} • ${window.escapeHtml(movie.genres)}</div>
                   <div style="font-size:11px; color:#bbb; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-family:var(--font-body);">${window.escapeHtml(movie.overview)}</div>
                </div>
            `;
            card.setAttribute('data-id', String(movie.id));
            window.attachPremiumHoverCard(card, movie);
            grid.appendChild(card);
        });
    }

    // Render favorite local files section
    if (hasFilteredLocal) {
        const filesHeader = document.createElement('div');
        filesHeader.style.cssText = 'grid-column: 1 / -1; margin-top: 24px; margin-bottom: 12px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--vault-accent); letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border); padding-bottom: 6px; display: flex; align-items: center; gap: 8px; user-select: none;';
        filesHeader.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>${window.currentLang === 'fr' ? 'Fichiers locaux favoris' : 'Favorite Local Files'}</span>
        `;
        grid.appendChild(filesHeader);
        
        filteredLocal.forEach((item, i) => {
            grid.appendChild(window.createCardElement(item, i));
        });
    }
};

window.toggleFavorite = function(filePath, btnEl) {
    window.appSettings.favorites = window.appSettings.favorites || [];
    const idx = window.appSettings.favorites.indexOf(filePath);
    let isNowStarred = false;
    
    if (idx !== -1) {
        window.appSettings.favorites.splice(idx, 1);
        window.showToast('Removed from Favorites', 'success');
    } else {
        window.appSettings.favorites.push(filePath);
        window.showToast('Added to Favorites', 'success');
        isNowStarred = true;
    }
    
    // Save settings persistently
    window.electronAPI.saveSettings(window.appSettings);
    
    // Update SVG icon in any matching card elements
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    document.querySelectorAll(`.file-card[data-path="${escapedPath}"]`).forEach(c => {
        const svg = c.querySelector('.star-svg');
        if (svg) {
            svg.setAttribute('fill', isNowStarred ? '#E5A93B' : 'none');
            svg.setAttribute('stroke', isNowStarred ? '#E5A93B' : '#ffffff');
            svg.style.transform = 'scale(1.3)';
            setTimeout(() => { svg.style.transform = 'scale(1.0)'; }, 200);
        }
    });

    if (window.currentTab === 'favorites') {
        window.renderFavorites();
    }
};
