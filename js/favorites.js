/* ==========================================================================
   Vault Favorites & Streaming Library Rendering Module
   ========================================================================== */

/**
 * Render Favorite Local Files only.
 */
window.renderFavorites = async function(useCache = false) {
    const grid = el('favorites-grid');
    if (!grid) return;
    
    window.appSettings.favorites = window.appSettings.favorites || [];
    const hasFavorites = window.appSettings.favorites.length > 0;
    
    if (!hasFavorites) {
        const starIcon = window.icons ? window.icons.star('', 'width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;', 'none', 'var(--vault-gold)') : '';
        grid.innerHTML = `
            <div class="empty-state">
               ${starIcon}
               <h3 style="color: #fff; font-family: var(--font-mono); font-size: 15px; margin-bottom: 8px; font-weight: 700;">
                   ${window.currentLang === 'fr' ? 'Aucun favori' : 'No Favorites Yet'}
               </h3>
               <p style="color: var(--vault-slate); font-family: var(--font-body); font-size: 12px; max-width: 320px; margin: 0 auto;">
                   ${window.currentLang === 'fr' ? "Cliquez sur l'étoile de n'importe quel fichier pour l'ajouter ici." : 'Click the star icon on any video or image in your Vault to save it here.'}
               </p>
            </div>
        `;
        return;
    }

    if (!useCache || !window.favoriteLocalItems) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;"><div class="spinner" style="margin: 0 auto 12px;"></div>Loading favorites...</div>';
        try {
            const localPaths = window.appSettings.favorites.filter(p => !p.startsWith('virtual://'));
            window.favoriteLocalItems = await window.electronAPI.scanSpecificFiles(localPaths);
        } catch (e) {
            console.error("Failed to load local favorites:", e);
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-signal-alert, #FF6B7A); padding: 40px 0;">Error loading favorites.</div>';
            return;
        }
    }

    grid.innerHTML = '';

    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;
    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    // Parse virtual favorites from favorites list
    const virtualFavorites = [];
    window.appSettings.favorites.forEach(favPath => {
        if (favPath.startsWith('virtual://')) {
            const parts = favPath.substring('virtual://'.length).split('/');
            const name = parts.pop();
            const parent = parts.join('/') || 'root';
            virtualFavorites.push({
                type: 'fakeFolder',
                name: name,
                parent: parent,
                path: favPath
            });
        }
    });

    // Filter and sort Local Favorite files and virtual folders
    let filteredLocal = [...virtualFavorites, ...(window.favoriteLocalItems || [])];
    filteredLocal = filteredLocal.filter(v => {
        if (term && !v.name.toLowerCase().includes(term)) return false;
        if (v.type === 'fakeFolder') return true;
        if (filterAttr === 'video') return v.type === 'video' || v.type === 'encrypted';
        if (filterAttr === 'image') return v.type === 'image';
        if (filterAttr === 'audio') return v.type === 'audio';
        return true;
    });

    // Sort favorites
    filteredLocal.sort((a, b) => {
        if (a.type === 'fakeFolder' && b.type !== 'fakeFolder') return -1;
        if (b.type === 'fakeFolder' && a.type !== 'fakeFolder') return 1;

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

    if (filteredLocal.length === 0) {
        const searchIcon = window.icons ? window.icons.search('', 'width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;') : '';
        grid.innerHTML = `
            <div class="empty-state">
               ${searchIcon}
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

    filteredLocal.forEach((item, i) => {
        grid.appendChild(window.createCardElement(item, i));
    });
};

/**
 * Render Streaming Media Library items only.
 */
window.renderLibrary = async function(useCache = false) {
    const grid = el('library-grid');
    if (!grid) return;
    
    window.appSettings.library = window.appSettings.library || [];
    const hasLibrary = window.appSettings.library.length > 0;
    
    if (!hasLibrary) {
        const libIcon = window.icons ? window.icons.library('', 'width: 48px; height: 48px; margin-bottom: 12px; display: inline-block; stroke: var(--vault-gold);') : '';
        grid.innerHTML = `
            <div class="empty-state">
               ${libIcon}
               <h3 style="color: #fff; font-family: var(--font-mono); font-size: 15px; margin-bottom: 8px; font-weight: 700;">
                   ${window.currentLang === 'fr' ? 'Votre bibliothèque est vide' : 'Your Library is Empty'}
               </h3>
               <p style="color: var(--vault-slate); font-family: var(--font-body); font-size: 12px; max-width: 320px; margin: 0 auto;">
                   ${window.currentLang === 'fr' ? "Ajoutez des films et séries à votre bibliothèque depuis l'onglet Cinéma/Séries." : 'Add films or series to your library from the Movies/Series tab.'}
               </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';

    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;
    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    // 1. Filter and sort Streaming items
    let filteredLibrary = [...window.appSettings.library];
    if (term) {
        filteredLibrary = filteredLibrary.filter(m => 
            (m.title || m.name || '').toLowerCase().includes(term) || 
            (m.genres || '').toLowerCase().includes(term) || 
            (m.overview || '').toLowerCase().includes(term)
        );
    }
    if (filterAttr === 'image') {
        filteredLibrary = []; // No images in streaming library
    }

    // Sort streaming library
    filteredLibrary.sort((a, b) => {
        let valA = a[sortBy] || a.title || a.name || '';
        let valB = b[sortBy] || b.title || b.name || '';
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

    if (filteredLibrary.length === 0) {
        const searchIcon = window.icons ? window.icons.search('', 'width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;') : '';
        grid.innerHTML = `
            <div class="empty-state">
               ${searchIcon}
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

    filteredLibrary.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'file-card tmdb-movie-card in-library';
        card.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1.5px solid var(--vault-console-gold); border-radius: 6px; box-shadow: 0 0 12px rgba(214, 164, 65, 0.35); position: relative;';
        
        card.addEventListener('click', async () => {
            try {
                const prog = await window.electronAPI.getWatchProgress({
                    mediaType: movie.media_type,
                    tmdbId: movie.id,
                    title: movie.title || movie.name
                });
                if (prog && prog.streamUrl && !prog.completed && prog.positionSec > 0) {
                    window.activeStreamingMedia = {
                        mediaType: movie.media_type,
                        tmdbId: movie.id,
                        title: movie.title || movie.name,
                        season: prog.season || null,
                        episode: prog.episode || null,
                        poster: movie.poster,
                        year: movie.year,
                        streamUrl: prog.streamUrl,
                        streamTitle: prog.streamTitle || movie.title || movie.name,
                        quality: prog.quality,
                        selectedSubtitleTrackIdx: prog.selectedSubtitleTrackIdx,
                        selectedSubtitleLabel: prog.selectedSubtitleLabel,
                        selectedSubtitleLang: prog.selectedSubtitleLang
                    };
                    window.playStream(prog.streamUrl, prog.streamTitle || movie.title || movie.name);
                    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
                    window.showToast(t.resumingStream || 'Resuming stream...', 'success');
                } else {
                    window.showMediaDetails(movie);
                }
            } catch (e) {
                console.error("Error resuming library item:", e);
                window.showMediaDetails(movie);
            }
        });
        
        const isTV = movie.media_type === 'tv';
        const tvSvg = window.icons ? window.icons.tv('', 'width:11px; height:11px; display:inline-block;') : '';
        const movieSvg = window.icons ? window.icons.movie('', 'width:11px; height:11px; display:inline-block;') : '';
        const plusSvg = window.icons ? window.icons.plus('', 'width: 10px; height: 10px; display: inline-block;') : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        const closeSvg = window.icons ? window.icons.close('', 'width: 10px; height: 10px; display: inline-block;') : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        
        card.innerHTML = `
            <div class="thumbnail-container" style="position:relative; background:#111; height: 180px; width: 100%; border-top-left-radius: 5px; border-top-right-radius: 5px; overflow: hidden;">
               <button onclick="event.stopPropagation(); window.showMediaDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})" style="position: absolute; top: 8px; left: 8px; border: none; background: rgba(0,0,0,0.8); color: var(--vault-gold); font-family: var(--font-mono); font-size: 10px; font-weight: 800; padding: 4px 6.5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid var(--vault-gold); transition: all 0.2s;" title="${isTV ? 'Browse Seasons' : 'Stream Movie'}">
                  ${isTV ? tvSvg : movieSvg}
               </button>
               <button onclick="event.stopPropagation(); window.showAddToFolderDialogForStreaming(${JSON.stringify(movie).replace(/"/g, '&quot;')})" style="position: absolute; top: 8px; right: 38px; border: none; background: rgba(0,0,0,0.8); color: var(--vault-accent); font-family: var(--font-mono); font-size: 10px; font-weight: 800; padding: 4px 6.5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid var(--vault-accent); transition: all 0.2s; width: 24px; height: 24px;" title="${window.currentLang === 'fr' ? 'Ajouter à la Collection' : 'Add to Collection'}">
                  ${plusSvg}
               </button>
               <button onclick="event.stopPropagation(); window.removeFromLibrary(${movie.id}, '${window.escapeHtml(movie.title || movie.name).replace(/'/g, "\\'")}')" style="position: absolute; top: 8px; right: 8px; border: none; background: rgba(0,0,0,0.8); color: var(--vault-signal-alert, #ff7979); font-family: var(--font-mono); font-size: 10px; font-weight: 800; padding: 4px 6.5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid var(--vault-signal-alert, #ff7979); transition: all 0.2s; width: 24px; height: 24px;" title="${window.currentLang === 'fr' ? 'Retirer de la Bibliothèque' : 'Remove from Library'}">
                  ${closeSvg}
               </button>
               <img class="thumbnail" src="${movie.poster}" alt="${window.escapeHtml(movie.title || movie.name)}" style="object-fit: cover; width:100%; height:100%; transition: opacity 0.25s ease;" onerror="this.src='oppenheimer_poster.png'">
               <div class="size-badge" style="background:var(--vault-accent); color:var(--vt-primary); font-weight:800; position:absolute; bottom: 8px; left: 8px; width: 28px; height: 28px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8.5px; line-height: 1.1; padding: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.4); text-align: center;">
                  <span>★</span>
                  <span style="margin-top:-1px;">${movie.rating || '0.0'}</span>
               </div>
            </div>
            <div class="filename-container" style="padding:12px; text-align:left;">
               <div style="font-weight:700; font-size:13px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-mono);">${window.escapeHtml(movie.title || movie.name)}</div>
               <div style="font-size:10px; color:var(--vault-slate); margin-top:2px; font-weight:500;">${movie.year || ''} • ${window.escapeHtml(movie.genres || '')}</div>
               <div style="font-size:11px; color:#bbb; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-family:var(--font-body);">${window.escapeHtml(movie.overview || '')}</div>
            </div>
        `;
        card.setAttribute('data-id', String(movie.id));
        window.attachPremiumHoverCard(card, movie);
        grid.appendChild(card);
    });
};

/**
 * Remove an item from the streaming library.
 */
window.removeFromLibrary = async function(movieId, movieTitle) {
    const confirmTitle = window.currentLang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from Library';
    const confirmMsg = window.currentLang === 'fr' 
        ? `Voulez-vous vraiment retirer "${movieTitle}" de votre bibliothèque ?` 
        : `Are you sure you want to remove "${movieTitle}" from your library?`;
        
    if (await window.showConfirmDialog(confirmMsg, confirmTitle)) {
        window.appSettings.library = window.appSettings.library || [];
        window.appSettings.library = window.appSettings.library.filter(m => m.id !== movieId);
        window.electronAPI.saveSettings(window.appSettings);
        
        const successMsg = window.currentLang === 'fr' ? 'Retiré de la bibliothèque' : 'Removed from Library';
        window.showToast(successMsg, 'success');
        
        // Reload Library
        window.renderLibrary();
    }
};

/**
 * Open Collection Selection Dialog for TMDB streaming media.
 */
window.showAddToFolderDialogForStreaming = function(movie) {
    const virtualItem = {
        name: movie.title || movie.name,
        path: 'tmdb://metadata:' + JSON.stringify(movie),
        type: 'video', // Matches 'collection'
        isStreaming: true,
        meta: movie
    };
    if (typeof window.showAddToFolderDialog === 'function') {
        window.showAddToFolderDialog(virtualItem);
    }
};

/**
 * Toggle local file favorite status.
 */
window.toggleFavorite = function(filePath, btnEl) {
    window.appSettings.favorites = window.appSettings.favorites || [];
    const idx = window.appSettings.favorites.indexOf(filePath);
    let isNowStarred = false;
    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
    
    if (idx !== -1) {
        window.appSettings.favorites.splice(idx, 1);
        window.showToast(t.removedFromFavorites || 'Removed from Favorites', 'success');
    } else {
        window.appSettings.favorites.push(filePath);
        window.showToast(t.addedToFavorites || 'Added to Favorites', 'success');
        isNowStarred = true;
    }
    
    // Save settings persistently
    window.electronAPI.saveSettings(window.appSettings);
    
    // Invalidate local favorites cache to ensure freshness on next tab render/filter
    window.favoriteLocalItems = null;
    
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

    if (window.currentTab === 'vault' && window.currentVaultSubtab === 'favorites') {
        window.renderFavorites();
    }
};
